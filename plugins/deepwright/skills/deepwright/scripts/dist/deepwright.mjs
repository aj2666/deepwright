#!/usr/bin/env node
import { createRequire as __deepwrightCreateRequire } from "node:module";
const require = __deepwrightCreateRequire(import.meta.url);

// doctor/doctor.ts
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var USAGE = `Usage: deepwright doctor [--json]

Run read-only environment and installation checks.

Options:
  --json       emit a machine-readable report
  -h, --help   display help
`;
function scriptsDirectory() {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return dirname(moduleDirectory);
}
function commandProbe(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5e3
  });
  const error = result.error;
  if (error?.code === "ENOENT") return { found: false, ok: false, output: "" };
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    found: error === void 0,
    ok: error === void 0 && result.status === 0,
    output
  };
}
function firstLine(value) {
  return value.split(/\r?\n/, 1)[0] ?? value;
}
async function hasExecutable(path) {
  try {
    const details = await stat(path);
    if (!details.isFile()) return false;
    await access(path, constants.R_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
async function hasPath(path, kind) {
  try {
    const details = await stat(path);
    return kind === "file" ? details.isFile() : details.isDirectory();
  } catch {
    return false;
  }
}
async function createReport() {
  const scripts = scriptsDirectory();
  const pluginRoot = resolve(scripts, "../../..");
  const checks = [];
  const nodeVersion = process.versions.node;
  const nodeMajor = Number(nodeVersion.split(".", 1)[0]);
  const supportedNode = Number.isInteger(nodeMajor) && nodeMajor >= 20;
  checks.push({
    id: "node",
    label: "Node.js",
    status: supportedNode ? "pass" : "fail",
    required: true,
    detail: supportedNode ? `Node.js ${nodeVersion}` : `Node.js ${nodeVersion} is unsupported; version 20 or newer is required`
  });
  const git = commandProbe("git", ["--version"]);
  checks.push({
    id: "git",
    label: "Git",
    status: git.ok ? "pass" : "fail",
    required: true,
    detail: git.ok ? firstLine(git.output) : git.found ? `git failed its version probe: ${firstLine(git.output) || "unknown error"}` : "git was not found on PATH"
  });
  const gh = commandProbe("gh", ["--version"]);
  if (!gh.found) {
    checks.push({
      id: "github",
      label: "GitHub CLI",
      status: "warn",
      required: false,
      detail: "gh is not installed; GitHub watch commands will be unavailable"
    });
  } else {
    const auth = commandProbe("gh", ["auth", "status", "--hostname", "github.com"]);
    checks.push({
      id: "github",
      label: "GitHub CLI",
      status: auth.ok ? "pass" : "warn",
      required: false,
      detail: auth.ok ? `${firstLine(gh.output)}; authenticated for github.com` : `${firstLine(gh.output)}; authentication for github.com is unavailable`
    });
  }
  const bundleNames = ["deepwright.mjs", "orch.mjs", "watch-pr.mjs"];
  const missingBundles = [];
  for (const name of bundleNames) {
    if (!await hasExecutable(join(scripts, "dist", name))) {
      missingBundles.push(`dist/${name}`);
    }
  }
  checks.push({
    id: "bundles",
    label: "CLI bundles",
    status: missingBundles.length === 0 ? "pass" : "fail",
    required: true,
    detail: missingBundles.length === 0 ? "all committed Node.js bundles are readable and executable" : `missing or non-executable: ${missingBundles.join(", ")}`
  });
  const expectedPaths = [
    { label: "package.json", path: join(scripts, "package.json"), kind: "file" },
    { label: "deepwright", path: join(scripts, "deepwright"), kind: "file" },
    { label: "orch/orch", path: join(scripts, "orch", "orch"), kind: "file" },
    {
      label: "watch-pr/watch-pr",
      path: join(scripts, "watch-pr", "watch-pr"),
      kind: "file"
    },
    { label: "SKILL.md", path: resolve(scripts, "../SKILL.md"), kind: "file" },
    { label: "playbooks", path: resolve(scripts, "../playbooks"), kind: "directory" },
    {
      label: ".codex-plugin/plugin.json",
      path: join(pluginRoot, ".codex-plugin", "plugin.json"),
      kind: "file"
    }
  ];
  const missingPaths = [];
  for (const expected of expectedPaths) {
    if (!await hasPath(expected.path, expected.kind)) missingPaths.push(expected.label);
  }
  checks.push({
    id: "layout",
    label: "Plugin layout",
    status: missingPaths.length === 0 ? "pass" : "fail",
    required: true,
    detail: missingPaths.length === 0 ? "plugin-relative scripts, skill, playbooks, and manifest are present" : `missing: ${missingPaths.join(", ")}`
  });
  return {
    tool: "deepwright",
    command: "doctor",
    ok: checks.every((check) => !check.required || check.status === "pass"),
    checks,
    paths: { scriptsDirectory: scripts, pluginRoot }
  };
}
function renderHuman(report) {
  const lines = [
    `Deepwright doctor: ${report.ok ? "READY" : "FAILED"}`,
    ...report.checks.map(
      (check) => `[${check.status}] ${check.label}: ${check.detail}`
    )
  ];
  return `${lines.join("\n")}
`;
}
async function main(argv, io = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value)
}) {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }
  const json = argv.includes("--json");
  const positional = argv.filter((argument) => argument !== "--json");
  if (positional.length !== 1 || positional[0] !== "doctor") {
    io.stderr(`error: expected the 'doctor' command
${USAGE}`);
    return 64;
  }
  const report = await createReport();
  io.stdout(json ? `${JSON.stringify(report, null, 2)}
` : renderHuman(report));
  return report.ok ? 0 : 1;
}

// doctor/entry.ts
process.exitCode = await main(process.argv.slice(2));
