import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse, TomlError } from "smol-toml";

export const CONFIG_FIELDS = [
  "version", "roles.code", "roles.research", "roles.review",
  "parallelism.swarm_workers", "parallelism.design_candidates", "parallelism.reviewers",
] as const;
export type ConfigField = typeof CONFIG_FIELDS[number];
export type Role = "code" | "research" | "review";
type Parallelism = "swarm_workers" | "design_candidates" | "reviewers";

export interface ConfigSettings {
  readonly version: 1;
  readonly roles: Readonly<Record<Role, string>>;
  readonly parallelism: Readonly<Record<Parallelism, number>>;
}

export const DEFAULT_CONFIG: ConfigSettings = Object.freeze({
  version: 1,
  roles: Object.freeze({ code: "inherit-parent", research: "inherit-parent", review: "inherit-parent" }),
  parallelism: Object.freeze({ swarm_workers: 4, design_candidates: 3, reviewers: 3 }),
});
export const MAX_CONFIG_BYTES = 64 * 1024;
export type ConfigSources = Record<ConfigField, "default" | "project">;
export interface ConfigIssue {
  readonly code: "unreadable" | "outside-project" | "not-regular-file" | "too-large" |
    "invalid-utf8" | "invalid-toml" | "unknown-field" | "invalid-type" | "unsupported-version" |
    "invalid-model" | "invalid-parallelism";
  readonly field?: ConfigField | "roles" | "parallelism";
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export interface ConfigReport {
  readonly path: string;
  readonly state: "missing" | "present" | "unreadable";
  readonly validation: "passed" | "failed";
  readonly ok: boolean;
  readonly settings: ConfigSettings | null;
  readonly sources: ConfigSources | null;
  readonly errors: readonly ConfigIssue[];
  readonly hostValidation: "not-performed";
  readonly unverifiedModelRoles: readonly Role[];
}

const roles: readonly Role[] = ["code", "research", "review"];
const parallelism: readonly Parallelism[] = ["swarm_workers", "design_candidates", "reviewers"];

function defaults() {
  return {
    version: 1 as const,
    roles: { ...DEFAULT_CONFIG.roles },
    parallelism: { ...DEFAULT_CONFIG.parallelism },
  };
}

function sources(): ConfigSources {
  return Object.fromEntries(CONFIG_FIELDS.map((field) => [field, "default"])) as ConfigSources;
}

function failure(path: string, state: "present" | "unreadable", errors: readonly ConfigIssue[]): ConfigReport {
  return {
    path, state, validation: "failed", ok: false, settings: null, sources: null, errors,
    hostValidation: "not-performed", unverifiedModelRoles: [],
  };
}

function missing(path: string): ConfigReport {
  return {
    path, state: "missing", validation: "passed", ok: true, settings: defaults(), sources: sources(),
    errors: [], hostValidation: "not-performed", unverifiedModelRoles: [],
  };
}

function confined(root: string, path: string): boolean {
  const local = relative(root, path);
  return local !== ".." && !local.startsWith(".." + sep) && !isAbsolute(local);
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function validate(path: string, parsed: Record<string, unknown>): ConfigReport {
  const settings = defaults();
  const provenance = sources();
  const errors: ConfigIssue[] = [];
  if (Object.keys(parsed).some((key) => !["version", "roles", "parallelism"].includes(key))) {
    errors.push({ code: "unknown-field", message: "Unknown top-level configuration field." });
  }
  if (Object.hasOwn(parsed, "version")) {
    if (typeof parsed.version !== "bigint") {
      errors.push({ code: "invalid-type", field: "version", message: "version must be a TOML integer." });
    } else if (parsed.version !== 1n) {
      errors.push({ code: "unsupported-version", field: "version", message: "Only configuration version 1 is supported." });
    } else {
      provenance.version = "project";
    }
  }
  for (const section of ["roles", "parallelism"] as const) {
    if (!Object.hasOwn(parsed, section)) continue;
    const table = parsed[section];
    if (!isTable(table)) {
      errors.push({ code: "invalid-type", field: section, message: section + " must be a TOML table." });
      continue;
    }
    const allowed: readonly string[] = section === "roles" ? roles : parallelism;
    if (Object.keys(table).some((key) => !allowed.includes(key))) {
      errors.push({ code: "unknown-field", field: section, message: "Unknown configuration field in " + section + "." });
    }
    if (section === "roles") {
      for (const role of roles) {
        if (!Object.hasOwn(table, role)) continue;
        const field = "roles." + role as ConfigField;
        const value = table[role];
        if (typeof value !== "string" || !/^[\x21-\x7e]{1,256}$/u.test(value)) {
          errors.push({
            code: "invalid-model", field,
            message: field + " must be a non-empty identifier of at most 256 printable ASCII characters without whitespace.",
          });
        } else {
          settings.roles[role] = value;
          provenance[field] = "project";
        }
      }
    } else {
      for (const key of parallelism) {
        if (!Object.hasOwn(table, key)) continue;
        const field = "parallelism." + key as ConfigField;
        const value = table[key];
        if (typeof value !== "bigint" || value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
          errors.push({
            code: "invalid-parallelism", field,
            message: field + " must be a positive TOML integer within JavaScript's safe integer range.",
          });
        } else {
          settings.parallelism[key] = Number(value);
          provenance[field] = "project";
        }
      }
    }
  }
  if (errors.length !== 0) return failure(path, "present", errors);
  return {
    path, state: "present", validation: "passed", ok: true, settings, sources: provenance, errors: [],
    hostValidation: "not-performed",
    unverifiedModelRoles: roles.filter((role) => settings.roles[role] !== "inherit-parent"),
  };
}

/** Read only this project's config; never search parents, write files, or probe a host. */
export async function readConfig(cwd: string): Promise<ConfigReport> {
  const path = resolve(cwd, ".codex", "deepwright.toml");
  const unreadable = () => failure(path, "unreadable", [{ code: "unreadable", message: "Project configuration could not be read safely." }]);
  let root: string;
  let directory: string;
  let canonical: string;
  try {
    root = await realpath(cwd);
    if (!(await stat(root)).isDirectory()) return unreadable();
    const candidateDirectory = join(root, ".codex");
    try {
      await lstat(candidateDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return missing(path);
      return unreadable();
    }
    directory = await realpath(candidateDirectory);
    if (!confined(root, directory)) {
      return failure(path, "unreadable", [{ code: "outside-project", message: "The configuration directory resolves outside this project." }]);
    }
    if (!(await stat(directory)).isDirectory()) return unreadable();
    const candidate = join(directory, "deepwright.toml");
    try {
      await lstat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return missing(path);
      return unreadable();
    }
    canonical = await realpath(candidate);
    if (!confined(root, canonical)) {
      return failure(path, "unreadable", [{ code: "outside-project", message: "The configuration file resolves outside this project." }]);
    }
  } catch {
    // A dangling link is invalid, not absent; realpath errors reach this branch.
    return unreadable();
  }

  let bytes: Buffer;
  try {
    if (!(await stat(canonical)).isFile()) {
      return failure(path, "unreadable", [{ code: "not-regular-file", message: "Configuration must be a regular file." }]);
    }
    // O_NONBLOCK prevents FIFO/device opens from hanging before fstat rejects them.
    const handle = await open(canonical, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()) {
        return failure(path, "unreadable", [{ code: "not-regular-file", message: "Configuration must be a regular file." }]);
      }
      // Recheck the resolved path and inode after opening; do not accept a swapped link.
      const current = await realpath(join(directory, "deepwright.toml"));
      const currentMetadata = await stat(current);
      if (!confined(root, current) || current !== canonical ||
          currentMetadata.dev !== metadata.dev || currentMetadata.ino !== metadata.ino) return unreadable();
      if (metadata.size > MAX_CONFIG_BYTES) {
        return failure(path, "present", [{ code: "too-large", message: "Configuration exceeds the 64 KiB limit." }]);
      }
      const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, null);
        if (result.bytesRead === 0) break;
        length += result.bytesRead;
      }
      if (length > MAX_CONFIG_BYTES) {
        return failure(path, "present", [{ code: "too-large", message: "Configuration exceeds the 64 KiB limit." }]);
      }
      bytes = buffer.subarray(0, length);
    } finally {
      await handle.close();
    }
  } catch {
    return unreadable();
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return failure(path, "present", [{ code: "invalid-utf8", message: "Configuration must contain valid UTF-8." }]);
  }
  try {
    // BigInts preserve TOML's integer/float distinction before schema validation.
    return validate(path, parse(source, { integersAsBigInt: true, maxDepth: 8 }));
  } catch (error) {
    // Parser messages include source excerpts: deliberately expose only location.
    const location = error instanceof TomlError ? { line: error.line, column: error.column } : {};
    return failure(path, "present", [{ code: "invalid-toml", message: "Invalid TOML configuration.", ...location }]);
  }
}

/** A print-only template generated from the same defaults used by readConfig. */
export function formatConfigTemplate(): string {
  return [
    "# Optional project-local preferences; never grants permission or verifies host models.",
    "version = " + DEFAULT_CONFIG.version,
    "", "[roles]", ...roles.map((role) => role + " = " + JSON.stringify(DEFAULT_CONFIG.roles[role])),
    "", "[parallelism]", ...parallelism.map((key) => key + " = " + DEFAULT_CONFIG.parallelism[key]), "",
  ].join("\n");
}
