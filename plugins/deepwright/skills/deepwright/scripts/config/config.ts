import { spawnSync } from "node:child_process";
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
export const CONFIG_HOSTS = ["codex", "claude", "agents", "omp"] as const;
export type ConfigHost = typeof CONFIG_HOSTS[number];
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
export type ConfigSource = "default" | "project" | "host";
export type ConfigSources = Record<ConfigField, ConfigSource>;
export type HostValidation = "not-performed" | "passed" | "failed";
export type NativeRole = "task" | "smol" | "slow";
export type NativeFallback = "native-role" | "native-default" | "native-session" | "native-priority";
export type CatalogMatch = "yes" | "no" | "unknown";

export interface HostRoleResolution {
  readonly role: Role;
  readonly nativeRole: NativeRole;
  readonly projectOverride: boolean;
  readonly nativeConfigured: boolean;
  readonly fallback: NativeFallback | null;
  readonly catalogMatch: CatalogMatch;
}

export interface ConfigIssue {
  readonly code: "unreadable" | "outside-project" | "not-regular-file" | "too-large" |
    "invalid-utf8" | "invalid-toml" | "unknown-field" | "invalid-type" | "unsupported-version" |
    "invalid-model" | "invalid-parallelism" | "host-unavailable" | "host-query-failed";
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
  readonly host: ConfigHost;
  readonly hostValidation: HostValidation;
  readonly hostRoles: readonly HostRoleResolution[] | null;
  readonly unverifiedModelRoles: readonly Role[];
}

export interface HostCommandResult {
  readonly found: boolean;
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export type HostCommandRunner = (command: string, args: readonly string[], cwd?: string) => HostCommandResult;

const roles: readonly Role[] = ["code", "research", "review"];
const parallelism: readonly Parallelism[] = ["swarm_workers", "design_candidates", "reviewers"];
export const OMP_NATIVE_ROLES = { code: "task", research: "smol", review: "slow" } as const;
const OMP_THINKING_SUFFIX = /:(?:off|minimal|low|medium|high|xhigh|max|auto)$/u;

export function runHostCommand(command: string, args: readonly string[], cwd?: string): HostCommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
  });
  const error = result.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ENOENT") return { found: false, ok: false, stdout: "", stderr: "" };
  return {
    found: error === undefined,
    ok: error === undefined && result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

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

function failure(
  path: string,
  host: ConfigHost,
  state: "present" | "unreadable",
  errors: readonly ConfigIssue[],
): ConfigReport {
  return {
    path, host, state, validation: "failed", ok: false, settings: null, sources: null, errors,
    hostValidation: "not-performed", hostRoles: null, unverifiedModelRoles: [],
  };
}

function missing(path: string, host: ConfigHost): ConfigReport {
  return {
    path, host, state: "missing", validation: "passed", ok: true, settings: defaults(), sources: sources(),
    errors: [], hostValidation: "not-performed", hostRoles: null, unverifiedModelRoles: [],
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

function validate(path: string, host: ConfigHost, parsed: Record<string, unknown>): ConfigReport {
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
  if (errors.length !== 0) return failure(path, host, "present", errors);
  return {
    path, host, state: "present", validation: "passed", ok: true, settings, sources: provenance, errors: [],
    hostValidation: "not-performed", hostRoles: null,
    unverifiedModelRoles: roles.filter((role) => settings.roles[role] !== "inherit-parent"),
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isTable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (!isTable(value)) return null;
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim() !== "") record[key] = entry.trim();
  }
  return record;
}

function modelSelectors(value: unknown): readonly string[] | null {
  if (!isTable(value) || !Array.isArray(value.models)) return null;
  const selectors: string[] = [];
  for (const model of value.models) {
    if (!isTable(model) || typeof model.selector !== "string" || model.selector.trim() === "") return null;
    selectors.push(model.selector.trim());
  }
  return selectors;
}

function attachOmp(report: ConfigReport, cwd: string, run: HostCommandRunner): ConfigReport {
  if (!report.ok || report.settings === null || report.sources === null) return report;
  const rolesProbe = run("omp", ["config", "get", "modelRoles", "--json"], cwd);
  if (!rolesProbe.found) {
    return {
      ...report, ok: false, hostValidation: "failed", hostRoles: null,
      errors: [...report.errors, { code: "host-unavailable", message: "Oh My Pi CLI was not found." }],
    };
  }
  if (!rolesProbe.ok) {
    return {
      ...report, ok: false, hostValidation: "failed", hostRoles: null,
      errors: [...report.errors, { code: "host-query-failed", message: "Oh My Pi modelRoles query failed." }],
    };
  }
  const parsedRoles = parseJsonObject(rolesProbe.stdout.trim());
  const nativeRoles = parsedRoles !== null && parsedRoles.key === "modelRoles" ? stringRecord(parsedRoles.value) : null;
  if (nativeRoles === null) {
    return {
      ...report, ok: false, hostValidation: "failed", hostRoles: null,
      errors: [...report.errors, { code: "host-query-failed", message: "Oh My Pi modelRoles query returned an unusable result." }],
    };
  }

  const explicit = roles.filter((role) => report.settings!.roles[role] !== "inherit-parent");
  let catalog: readonly string[] | null = null;
  if (explicit.length !== 0) {
    const modelsProbe = run("omp", ["models", "--json"], cwd);
    if (!modelsProbe.found) {
      return {
        ...report, ok: false, hostValidation: "failed", hostRoles: null,
        errors: [...report.errors, { code: "host-unavailable", message: "Oh My Pi CLI was not found." }],
      };
    }
    if (!modelsProbe.ok) {
      return {
        ...report, ok: false, hostValidation: "failed", hostRoles: null,
        errors: [...report.errors, { code: "host-query-failed", message: "Oh My Pi models query failed." }],
      };
    }
    catalog = modelSelectors(parseJsonObject(modelsProbe.stdout.trim()));
    if (catalog === null) {
      return {
        ...report, ok: false, hostValidation: "failed", hostRoles: null,
        errors: [...report.errors, { code: "host-query-failed", message: "Oh My Pi models query returned an unusable result." }],
      };
    }
  }

  const provenance = { ...report.sources };
  const hostRoles: HostRoleResolution[] = [];
  const unverified: Role[] = [];
  for (const role of roles) {
    const nativeRole = OMP_NATIVE_ROLES[role];
    const projectValue = report.settings.roles[role];
    const projectOverride = projectValue !== "inherit-parent";
    const nativeSelector = nativeRoles[nativeRole];
    const nativeConfigured = nativeSelector !== undefined;
    let fallback: NativeFallback | null = null;
    let catalogMatch: CatalogMatch = "unknown";
    if (projectOverride) {
      const matched = catalog !== null && (catalog.includes(projectValue) ||
        catalog.includes(projectValue.replace(OMP_THINKING_SUFFIX, "")));
      catalogMatch = matched ? "yes" : "no";
      if (!matched) unverified.push(role);
    } else if (nativeConfigured) {
      fallback = "native-role";
      if (provenance["roles." + role as ConfigField] === "default") {
        provenance["roles." + role as ConfigField] = "host";
      }
    } else if (nativeRole === "task") {
      fallback = "native-session";
    } else {
      fallback = nativeRoles.default !== undefined ? "native-default" : "native-priority";
    }
    hostRoles.push({ role, nativeRole, projectOverride, nativeConfigured, fallback, catalogMatch });
  }
  return { ...report, sources: provenance, hostValidation: "passed", hostRoles, unverifiedModelRoles: unverified };
}

/** Read only this project's config; never search parents or write files. Probe a host only when requested. */
export async function readConfig(
  cwd: string,
  host: ConfigHost = "codex",
  run: HostCommandRunner = runHostCommand,
): Promise<ConfigReport> {
  const path = resolve(cwd, ".codex", "deepwright.toml");
  const unreadable = () => failure(path, host, "unreadable", [{ code: "unreadable", message: "Project configuration could not be read safely." }]);
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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const report = missing(path, host);
        return host === "omp" ? attachOmp(report, cwd, run) : report;
      }
      return unreadable();
    }
    directory = await realpath(candidateDirectory);
    if (!confined(root, directory)) {
      return failure(path, host, "unreadable", [{ code: "outside-project", message: "The configuration directory resolves outside this project." }]);
    }
    if (!(await stat(directory)).isDirectory()) return unreadable();
    const candidate = join(directory, "deepwright.toml");
    try {
      await lstat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const report = missing(path, host);
        return host === "omp" ? attachOmp(report, cwd, run) : report;
      }
      return unreadable();
    }
    canonical = await realpath(candidate);
    if (!confined(root, canonical)) {
      return failure(path, host, "unreadable", [{ code: "outside-project", message: "The configuration file resolves outside this project." }]);
    }
  } catch {
    // A dangling link is invalid, not absent; realpath errors reach this branch.
    return unreadable();
  }

  let bytes: Buffer;
  try {
    if (!(await stat(canonical)).isFile()) {
      return failure(path, host, "unreadable", [{ code: "not-regular-file", message: "Configuration must be a regular file." }]);
    }
    // O_NONBLOCK prevents FIFO/device opens from hanging before fstat rejects them.
    const handle = await open(canonical, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()) {
        return failure(path, host, "unreadable", [{ code: "not-regular-file", message: "Configuration must be a regular file." }]);
      }
      // Recheck the resolved path and inode after opening; do not accept a swapped link.
      const current = await realpath(join(directory, "deepwright.toml"));
      const currentMetadata = await stat(current);
      if (!confined(root, current) || current !== canonical ||
          currentMetadata.dev !== metadata.dev || currentMetadata.ino !== metadata.ino) return unreadable();
      if (metadata.size > MAX_CONFIG_BYTES) {
        return failure(path, host, "present", [{ code: "too-large", message: "Configuration exceeds the 64 KiB limit." }]);
      }
      const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, null);
        if (result.bytesRead === 0) break;
        length += result.bytesRead;
      }
      if (length > MAX_CONFIG_BYTES) {
        return failure(path, host, "present", [{ code: "too-large", message: "Configuration exceeds the 64 KiB limit." }]);
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
    return failure(path, host, "present", [{ code: "invalid-utf8", message: "Configuration must contain valid UTF-8." }]);
  }
  let report: ConfigReport;
  try {
    // BigInts preserve TOML's integer/float distinction before schema validation.
    report = validate(path, host, parse(source, { integersAsBigInt: true, maxDepth: 8 }));
  } catch (error) {
    // Parser messages include source excerpts: deliberately expose only location.
    const location = error instanceof TomlError ? { line: error.line, column: error.column } : {};
    return failure(path, host, "present", [{ code: "invalid-toml", message: "Invalid TOML configuration.", ...location }]);
  }
  return host === "omp" && report.ok ? attachOmp(report, cwd, run) : report;
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
