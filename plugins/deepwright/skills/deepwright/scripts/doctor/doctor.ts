import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runHostCommand,
  type ConfigHost,
  type HostCommandResult,
  type HostCommandRunner,
} from "../config/config.ts";

type CheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly required: boolean;
  readonly detail: string;
}

export interface DoctorReport {
  readonly tool: "deepwright";
  readonly command: "doctor";
  readonly ok: boolean;
  readonly host: ConfigHost;
  readonly checks: readonly DoctorCheck[];
  readonly paths: {
    readonly scriptsDirectory: string;
    readonly pluginRoot: string;
  };
}

interface Io {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

export interface Context {
  readonly pluginRoot?: string;
  readonly cwd?: string;
  readonly host?: ConfigHost;
  readonly run?: HostCommandRunner;
}

const MINIMUM_NODE_VERSION = "20.19.0";
const HOSTS: readonly ConfigHost[] = ["codex", "claude", "agents", "omp"];

const USAGE = `Usage: deepwright doctor [--json] [--host codex|agents|claude|omp]

Run read-only environment and installation checks.

Options:
  --json       emit a machine-readable report
  --host       inspect a named host; omp is the only host that is queried
  -h, --help   display help
`;

function scriptsDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return dirname(moduleDirectory);
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0] ?? value;
}

export function supportsNodeVersion(value: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/.exec(value);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  if (major !== 20) return major > 20;
  if (minor !== 19) return minor > 19;
  if (patch !== 0) return patch > 0;
  return match[4] === undefined;
}

async function hasExecutable(path: string): Promise<boolean> {
  try {
    const details = await stat(path);
    if (!details.isFile()) return false;
    await access(path, constants.R_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasPath(path: string, kind: "file" | "directory"): Promise<boolean> {
  try {
    const details = await stat(path);
    return kind === "file" ? details.isFile() : details.isDirectory();
  } catch {
    return false;
  }
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isTable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function configValue(result: HostCommandResult, key: string): { ok: true; value: unknown } | { ok: false; missing: boolean } {
  if (!result.found) return { ok: false, missing: true };
  if (!result.ok) return { ok: false, missing: false };
  const parsed = parseJsonObject(result.stdout.trim());
  if (parsed === null || parsed.key !== key) return { ok: false, missing: false };
  return { ok: true, value: parsed.value };
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return null;
  return value;
}

function parseHost(argv: readonly string[]): { json: boolean; host: ConfigHost; hostSpecified: boolean; help: boolean } | { error: string } {
  const seen: Record<string, true> = {};
  let json = false;
  let host: ConfigHost = "agents";
  let hostSpecified = false;
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      if (seen["--help"]) return { error: "duplicate option: --help" };
      seen["--help"] = true;
      continue;
    }
    if (argument === "--json") {
      if (seen["--json"]) return { error: "duplicate option: --json" };
      seen["--json"] = true;
      json = true;
      continue;
    }
    if (argument === "--host") {
      if (seen["--host"]) return { error: "duplicate option: --host" };
      seen["--host"] = true;
      const value = argv[++index];
      if (value === undefined || !HOSTS.includes(value as ConfigHost)) {
        return { error: "--host must be codex, agents, claude, or omp" };
      }
      host = value as ConfigHost;
      hostSpecified = true;
      continue;
    }
    if (argument.startsWith("-")) return { error: "unknown option: " + argument };
    positionals.push(argument);
  }
  if (seen["--help"]) return { json, host, hostSpecified, help: true };
  if (positionals.length !== 1 || positionals[0] !== "doctor") {
    return { error: "expected the 'doctor' command" };
  }
  return { json, host, hostSpecified, help: false };
}

function pluginName(id: string): string {
  const at = id.lastIndexOf("@");
  return at > 0 ? id.slice(0, at) : id;
}

async function candidateIdentity(pluginRoot: string): Promise<{ name: string; version: string } | null> {
  for (const relative of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(pluginRoot, relative), "utf8"));
      if (isTable(parsed) && typeof parsed.name === "string" && typeof parsed.version === "string") {
        return { name: parsed.name, version: parsed.version };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function matchesCandidate(name: string, candidate: string): boolean {
  return name === candidate || name.endsWith("/" + candidate);
}

async function ompChecks(
  run: HostCommandRunner,
  cwd: string,
  pluginRoot: string,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const version = run("omp", ["--version"], cwd);
  if (!version.found) {
    checks.push({
      id: "omp",
      label: "Oh My Pi CLI",
      status: "fail",
      required: true,
      detail: "omp was not found on PATH; install Oh My Pi or pass a host that does not require it",
    });
    return checks;
  }
  if (!version.ok) {
    checks.push({
      id: "omp",
      label: "Oh My Pi CLI",
      status: "fail",
      required: true,
      detail: "omp failed its version probe",
    });
    return checks;
  }
  const versionText = firstLine(version.stdout.trim() || version.stderr);
  checks.push({
    id: "omp",
    label: "Oh My Pi CLI",
    status: "pass",
    required: true,
    detail: versionText || "omp reported no version text",
  });

  const skillsEnabled = configValue(run("omp", ["config", "get", "skills.enabled", "--json"], cwd), "skills.enabled");
  const skillCommands = configValue(
    run("omp", ["config", "get", "skills.enableSkillCommands", "--json"], cwd),
    "skills.enableSkillCommands",
  );
  if (!skillsEnabled.ok || !skillCommands.ok) {
    checks.push({
      id: "omp-skills",
      label: "Oh My Pi skills",
      status: "fail",
      required: true,
      detail: skillsEnabled.ok === false && "missing" in skillsEnabled && skillsEnabled.missing
        ? "Oh My Pi CLI was not found while reading skills settings"
        : "Oh My Pi skills settings could not be read",
    });
  } else if (skillsEnabled.value !== true || skillCommands.value !== true) {
    checks.push({
      id: "omp-skills",
      label: "Oh My Pi skills",
      status: "fail",
      required: true,
      detail: "skills.enabled and skills.enableSkillCommands must both be true for native skill commands",
    });
  } else {
    checks.push({
      id: "omp-skills",
      label: "Oh My Pi skills",
      status: "pass",
      required: true,
      detail: "skills.enabled and skills.enableSkillCommands are true",
    });
  }

  const disabled = configValue(run("omp", ["config", "get", "disabledProviders", "--json"], cwd), "disabledProviders");
  const enabled = configValue(run("omp", ["config", "get", "enabledProviders", "--json"], cwd), "enabledProviders");
  if (!disabled.ok || !enabled.ok) {
    checks.push({
      id: "omp-discovery",
      label: "Oh My Pi discovery",
      status: "fail",
      required: true,
      detail: "Oh My Pi discovery provider flags could not be read",
    });
  } else {
    const disabledList = stringList(disabled.value);
    const enabledList = stringList(enabled.value);
    if (disabledList === null || enabledList === null) {
      checks.push({
        id: "omp-discovery",
        label: "Oh My Pi discovery",
        status: "fail",
        required: true,
        detail: "Oh My Pi discovery provider flags were unusable",
      });
    } else {
      const providerDisabled = disabledList.includes("claude-plugins");
      const userEnabled = enabledList.includes("claude-plugins") || enabledList.includes("*") ||
        enabledList.includes("all") || enabledList.includes("claude");
      checks.push({
        id: "omp-discovery",
        label: "Oh My Pi discovery",
        status: providerDisabled ? "fail" : "pass",
        required: true,
        detail: providerDisabled
          ? "claude-plugins is listed in disabledProviders; native marketplace discovery is off. This is not live plugin activation."
          : userEnabled
            ? "claude-plugins is not disabled and is opted in via enabledProviders; this is not live plugin activation"
            : "claude-plugins is not disabled and is not opted in via enabledProviders; this is not live plugin activation",
      });
    }
  }

  const listed = run("omp", ["plugin", "list", "--json"], cwd);
  if (!listed.found) {
    checks.push({
      id: "omp-plugin",
      label: "Oh My Pi plugin registry",
      status: "fail",
      required: true,
      detail: "Oh My Pi CLI was not found while listing plugins",
    });
    return checks;
  }
  if (!listed.ok) {
    checks.push({
      id: "omp-plugin",
      label: "Oh My Pi plugin registry",
      status: "fail",
      required: true,
      detail: "Oh My Pi plugin list query failed",
    });
    return checks;
  }
  const parsedList = parseJsonObject(listed.stdout.trim());
  if (parsedList === null || !Array.isArray(parsedList.npm) || !Array.isArray(parsedList.marketplace)) {
    checks.push({
      id: "omp-plugin",
      label: "Oh My Pi plugin registry",
      status: "fail",
      required: true,
      detail: "Oh My Pi plugin list returned an unusable result",
    });
    return checks;
  }
  const candidate = await candidateIdentity(pluginRoot);
  if (candidate === null) {
    checks.push({
      id: "omp-plugin",
      label: "Oh My Pi plugin registry",
      status: "fail",
      required: true,
      detail: "candidate plugin identity is missing from plugin.json",
    });
    return checks;
  }
  const matches: string[] = [];
  for (const plugin of parsedList.npm) {
    if (!isTable(plugin) || typeof plugin.name !== "string" || typeof plugin.version !== "string") continue;
    if (matchesCandidate(plugin.name, candidate.name)) matches.push("npm:" + plugin.name + "@" + plugin.version);
  }
  for (const plugin of parsedList.marketplace) {
    if (!isTable(plugin) || typeof plugin.id !== "string") continue;
    const name = pluginName(plugin.id);
    const entry = Array.isArray(plugin.entries) && isTable(plugin.entries[0]) ? plugin.entries[0] : null;
    const version = entry !== null && typeof entry.version === "string" ? entry.version : "unknown";
    if (matchesCandidate(name, candidate.name)) matches.push("marketplace:" + plugin.id + "@" + version);
  }
  if (matches.length === 0) {
    checks.push({
      id: "omp-plugin",
      label: "Oh My Pi plugin registry",
      status: "warn",
      required: false,
      detail: "Deepwright " + candidate.version + " is the candidate identity; no matching installed registry or package entry was found. This does not claim live activation.",
    });
    return checks;
  }
  const colliding = matches.length > 1;
  const versionMismatch = matches.some((entry) => !entry.endsWith("@" + candidate.version));
  checks.push({
    id: "omp-plugin",
    label: "Oh My Pi plugin registry",
    status: colliding || versionMismatch ? "warn" : "pass",
    required: false,
    detail: colliding
      ? "multiple installed Deepwright identities were found; name collision risk. This does not claim live activation."
      : versionMismatch
        ? "an installed Deepwright identity does not match candidate " + candidate.version + ". This does not claim live activation."
        : "installed Deepwright identity matches candidate " + candidate.name + " " + candidate.version + ". This does not claim live activation.",
  });
  return checks;
}

async function createReport(host: ConfigHost, context: Context): Promise<DoctorReport> {
  const scripts = scriptsDirectory();
  const pluginRoot = resolve(context.pluginRoot ?? resolve(scripts, "../../.."));
  const cwd = context.cwd ?? process.cwd();
  const run = context.run ?? runHostCommand;
  const checks: DoctorCheck[] = [];

  const nodeVersion = process.versions.node;
  const supportedNode = supportsNodeVersion(nodeVersion);
  checks.push({
    id: "node",
    label: "Node.js",
    status: supportedNode ? "pass" : "fail",
    required: true,
    detail: supportedNode
      ? `Node.js ${nodeVersion}`
      : `Node.js ${nodeVersion} is unsupported; version ${MINIMUM_NODE_VERSION} or newer is required`,
  });

  const git = run("git", ["--version"], cwd);
  checks.push({
    id: "git",
    label: "Git",
    status: git.ok ? "pass" : "fail",
    required: true,
    detail: git.ok
      ? firstLine((git.stdout + git.stderr).trim())
      : git.found
        ? `git failed its version probe: ${firstLine((git.stdout + git.stderr).trim()) || "unknown error"}`
        : "git was not found on PATH",
  });

  const gh = run("gh", ["--version"], cwd);
  if (!gh.found) {
    checks.push({
      id: "github",
      label: "GitHub CLI",
      status: "warn",
      required: false,
      detail: "gh is not installed; GitHub watch commands will be unavailable",
    });
  } else {
    const auth = run("gh", ["auth", "status", "--hostname", "github.com"], cwd);
    checks.push({
      id: "github",
      label: "GitHub CLI",
      status: auth.ok ? "pass" : "warn",
      required: false,
      detail: auth.ok
        ? `${firstLine((gh.stdout + gh.stderr).trim())}; authenticated for github.com`
        : `${firstLine((gh.stdout + gh.stderr).trim())}; authentication for github.com is unavailable`,
    });
  }

  const bundleNames = ["deepwright.mjs", "orch.mjs", "watch-pr.mjs"];
  const missingBundles: string[] = [];
  for (const name of bundleNames) {
    if (!(await hasExecutable(join(scripts, "dist", name)))) {
      missingBundles.push(`dist/${name}`);
    }
  }
  checks.push({
    id: "bundles",
    label: "CLI bundles",
    status: missingBundles.length === 0 ? "pass" : "fail",
    required: true,
    detail:
      missingBundles.length === 0
        ? "all committed Node.js bundles are readable and executable"
        : `missing or non-executable: ${missingBundles.join(", ")}`,
  });

  const expectedPaths = [
    { label: "package.json", path: join(scripts, "package.json"), kind: "file" },
    { label: "deepwright", path: join(scripts, "deepwright"), kind: "file" },
    { label: "orch/orch", path: join(scripts, "orch", "orch"), kind: "file" },
    {
      label: "watch-pr/watch-pr",
      path: join(scripts, "watch-pr", "watch-pr"),
      kind: "file",
    },
    { label: "SKILL.md", path: resolve(scripts, "../SKILL.md"), kind: "file" },
    { label: "playbooks", path: resolve(scripts, "../playbooks"), kind: "directory" },
    {
      label: ".codex-plugin/plugin.json",
      path: join(pluginRoot, ".codex-plugin", "plugin.json"),
      kind: "file",
    },
  ] as const;
  const missingPaths: string[] = [];
  for (const expected of expectedPaths) {
    if (!(await hasPath(expected.path, expected.kind))) missingPaths.push(expected.label);
  }
  checks.push({
    id: "layout",
    label: "Plugin layout",
    status: missingPaths.length === 0 ? "pass" : "fail",
    required: true,
    detail:
      missingPaths.length === 0
        ? "plugin-relative scripts, skill, playbooks, and manifest are present"
        : `missing: ${missingPaths.join(", ")}`,
  });

  if (host === "omp") checks.push(...await ompChecks(run, cwd, pluginRoot));

  return {
    tool: "deepwright",
    command: "doctor",
    ok: checks.every((check) => !check.required || check.status === "pass"),
    host,
    checks,
    paths: { scriptsDirectory: scripts, pluginRoot },
  };
}

function renderHuman(report: DoctorReport): string {
  const lines = [
    `Deepwright doctor: ${report.ok ? "READY" : "FAILED"}`,
    `Host: ${report.host}`,
    ...report.checks.map(
      (check) => `[${check.status}] ${check.label}: ${check.detail}`
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export async function main(
  argv: readonly string[],
  io: Io = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  },
  context: Context = {},
): Promise<number> {
  const parsed = parseHost(argv);
  if ("error" in parsed) {
    io.stderr(`error: ${parsed.error}\n${USAGE}`);
    return 64;
  }
  if (parsed.help) {
    io.stdout(USAGE);
    return 0;
  }
  const host = parsed.hostSpecified ? parsed.host : (context.host ?? parsed.host);
  const report = await createReport(host, context);
  io.stdout(parsed.json ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report));
  return report.ok ? 0 : 1;
}
