import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CheckStatus = "pass" | "warn" | "fail";

interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly required: boolean;
  readonly detail: string;
}

interface CommandProbe {
  readonly found: boolean;
  readonly ok: boolean;
  readonly output: string;
}

interface DoctorReport {
  readonly tool: "deepwright";
  readonly command: "doctor";
  readonly ok: boolean;
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

const MINIMUM_NODE_VERSION = "20.19.0";

const USAGE = `Usage: deepwright doctor [--json]

Run read-only environment and installation checks.

Options:
  --json       emit a machine-readable report
  -h, --help   display help
`;

function scriptsDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return dirname(moduleDirectory);
}

function commandProbe(command: string, args: readonly string[]): CommandProbe {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
  });
  const error = result.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ENOENT") return { found: false, ok: false, output: "" };
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    found: error === undefined,
    ok: error === undefined && result.status === 0,
    output,
  };
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

async function createReport(): Promise<DoctorReport> {
  const scripts = scriptsDirectory();
  const pluginRoot = resolve(scripts, "../../..");
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

  const git = commandProbe("git", ["--version"]);
  checks.push({
    id: "git",
    label: "Git",
    status: git.ok ? "pass" : "fail",
    required: true,
    detail: git.ok
      ? firstLine(git.output)
      : git.found
        ? `git failed its version probe: ${firstLine(git.output) || "unknown error"}`
        : "git was not found on PATH",
  });

  const gh = commandProbe("gh", ["--version"]);
  if (!gh.found) {
    checks.push({
      id: "github",
      label: "GitHub CLI",
      status: "warn",
      required: false,
      detail: "gh is not installed; GitHub watch commands will be unavailable",
    });
  } else {
    const auth = commandProbe("gh", ["auth", "status", "--hostname", "github.com"]);
    checks.push({
      id: "github",
      label: "GitHub CLI",
      status: auth.ok ? "pass" : "warn",
      required: false,
      detail: auth.ok
        ? `${firstLine(gh.output)}; authenticated for github.com`
        : `${firstLine(gh.output)}; authentication for github.com is unavailable`,
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

  return {
    tool: "deepwright",
    command: "doctor",
    ok: checks.every((check) => !check.required || check.status === "pass"),
    checks,
    paths: { scriptsDirectory: scripts, pluginRoot },
  };
}

function renderHuman(report: DoctorReport): string {
  const lines = [
    `Deepwright doctor: ${report.ok ? "READY" : "FAILED"}`,
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
  }
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }
  const json = argv.includes("--json");
  const positional = argv.filter((argument) => argument !== "--json");
  if (positional.length !== 1 || positional[0] !== "doctor") {
    io.stderr(`error: expected the 'doctor' command\n${USAGE}`);
    return 64;
  }
  const report = await createReport();
  io.stdout(json ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report));
  return report.ok ? 0 : 1;
}
