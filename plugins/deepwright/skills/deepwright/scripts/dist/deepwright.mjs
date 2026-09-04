#!/usr/bin/env node
import { createRequire as __deepwrightCreateRequire } from "node:module";
const require = __deepwrightCreateRequire(import.meta.url);

// discovery/cli.ts
import { constants as constants2 } from "node:fs";
import { access as access2, lstat, readFile as readFile2, realpath as realpath2, stat as stat2 } from "node:fs/promises";
import { join as join3, resolve as resolve3 } from "node:path";

// doctor/doctor.ts
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var MINIMUM_NODE_VERSION = "20.19.0";
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
function supportsNodeVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/.exec(value);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  if (major !== 20) return major > 20;
  if (minor !== 19) return minor > 19;
  if (patch !== 0) return patch > 0;
  return match[4] === void 0;
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
  const supportedNode = supportsNodeVersion(nodeVersion);
  checks.push({
    id: "node",
    label: "Node.js",
    status: supportedNode ? "pass" : "fail",
    required: true,
    detail: supportedNode ? `Node.js ${nodeVersion}` : `Node.js ${nodeVersion} is unsupported; version ${MINIMUM_NODE_VERSION} or newer is required`
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

// discovery/catalog.ts
import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname as dirname2, isAbsolute, join as join2, relative, resolve as resolve2, sep } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function defaultPluginRoot() {
  return resolve2(dirname2(fileURLToPath2(import.meta.url)), "../../../..");
}
function validName(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
function field(source, key, indent = "", kind = "string") {
  const lines = source.split("\n");
  const pattern = new RegExp("^" + indent + key + ": *(.*)$");
  const matches = lines.flatMap((line, index) => {
    const match = pattern.exec(line);
    return match === null ? [] : [{ value: match[1], index }];
  });
  if (matches.length !== 1 || !matches[0].value.trim()) {
    throw new Error("expected one non-empty, single-line " + key + " field");
  }
  for (let index = matches[0].index + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (line.startsWith(indent + " ") || line.startsWith(indent + "	")) {
      throw new Error(key + " must be single-line; continuation lines are unsupported");
    }
    break;
  }
  const value = matches[0].value.trim();
  if (kind === "boolean") return value;
  if (value.startsWith('"')) {
    const decoded = JSON.parse(value);
    if (typeof decoded !== "string" || !decoded.trim() || /[\r\n]/u.test(decoded)) {
      throw new Error(key + " must be a non-empty single-line string");
    }
    return decoded;
  }
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/u.test(value)) throw new Error("invalid quoted " + key);
    const decoded = value.slice(1, -1).replace(/''/g, "'");
    if (!decoded.trim()) throw new Error(key + " must not be empty");
    return decoded;
  }
  if (/^[>|[\]{},&*!#@\u0060]/u.test(value) || /\s#|:\s/u.test(value)) {
    throw new Error(key + " uses unsupported YAML; use a quoted single-line string");
  }
  if (/^(?:null|~|true|false|yes|no|on|off|[-+]?(?:0[xob][\da-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[-+]?\d+)?|\.inf|\.nan))$/iu.test(value)) {
    throw new Error(key + " must be a string; quote non-string YAML scalars");
  }
  return value;
}
function section(source, key) {
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) => line === key + ":" ? [index] : []);
  if (starts.length !== 1) throw new Error("expected one " + key + " section");
  const start = starts[0] + 1;
  let end = start;
  while (end < lines.length && (lines[end].trim() === "" || /^\s/u.test(lines[end]))) end++;
  return lines.slice(start, end).join("\n");
}
async function confinedFile(root, path) {
  const canonical = await realpath(path);
  const local = relative(root, canonical);
  if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) {
    throw new Error("metadata path leaves the plugin skills directory: " + path);
  }
  return canonical;
}
async function loadCatalog(pluginRoot) {
  const root = await confinedFile(await realpath(pluginRoot), join2(pluginRoot, "skills"));
  const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const skills = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("skill directories must not be symlinks: " + entry.name);
    if (!entry.isDirectory()) continue;
    if (!validName(entry.name)) throw new Error("invalid skill directory: " + entry.name);
    const directory = join2(root, entry.name);
    try {
      const path = await confinedFile(root, join2(directory, "SKILL.md"));
      const policyPath = await confinedFile(root, join2(directory, "agents", "openai.yaml"));
      const source = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
      const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(source)?.[1];
      if (frontmatter === void 0) throw new Error("missing YAML frontmatter");
      const name = field(frontmatter, "name");
      if (name !== entry.name) throw new Error("name must match the skill directory");
      const policy = (await readFile(policyPath, "utf8")).replace(/\r\n/g, "\n");
      const policySection = section(policy, "policy");
      const implicit = field(policySection, "allow_implicit_invocation", "  ", "boolean");
      if (!/^  allow_implicit_invocation: *(true|false) *$/m.test(policySection)) {
        throw new Error("implicit policy must be an unquoted true or false boolean");
      }
      skills.push({
        name,
        description: field(frontmatter, "description"),
        displayName: field(section(policy, "interface"), "display_name", "  "),
        path,
        invocation: "$deepwright:" + name,
        implicit: implicit === "true"
      });
    } catch (error) {
      throw new Error("invalid metadata for " + entry.name + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
  if (skills.length === 0) throw new Error("no skills discovered in " + root);
  return skills;
}
function terminalText(value) {
  return value.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\|$)/gu, "").replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "").replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, " ").trim();
}
function jsonText(value) {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
    (character) => "\\u" + character.codePointAt(0).toString(16).padStart(4, "0")
  ) + "\n";
}

// discovery/cli.ts
var commands = ["doctor", "skills", "skill", "invoke", "status"];
var USAGE2 = [
  "Usage: deepwright <command> [options]",
  "",
  "  doctor [--json]                         check runtime and plugin layout",
  "  skills [query] [--json]                 list or search skill metadata",
  "  skill <name> [--json]                   inspect a skill and its invocation",
  "  invoke <name> [--host codex|agents|claude] [--json]",
  "                                         print guidance; never execute it",
  "  status [--json]                         inspect package and config presence",
  "",
  "All commands are read-only. They cannot confirm active host/session state.",
  "-h, --help displays this help. Quote a multiword search query.",
  ""
].join("\n");
var UsageError = class extends Error {
};
function parse(argv) {
  const seen = /* @__PURE__ */ new Set();
  const positionals = [];
  let host = "codex";
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    const flag = argument === "-h" ? "--help" : argument;
    if (!["--json", "--help", "--host"].includes(flag)) throw new UsageError("unknown option: " + argument);
    if (seen.has(flag)) throw new UsageError("duplicate option: " + flag);
    seen.add(flag);
    if (flag === "--host") {
      const value2 = argv[++index];
      if (value2 !== "codex" && value2 !== "agents" && value2 !== "claude") {
        throw new UsageError("--host must be codex, agents, or claude");
      }
      host = value2;
    }
  }
  const command = positionals[0];
  if (command === void 0 && seen.has("--help") && !seen.has("--host")) {
    return { command: void 0, value: void 0, host, json: seen.has("--json"), help: true };
  }
  if (!commands.includes(command)) throw new UsageError("expected a valid command");
  if (seen.has("--host") && command !== "invoke") throw new UsageError("--host is only valid with invoke");
  const value = positionals[1];
  const requiredName = command === "skill" || command === "invoke";
  const maximum = command === "doctor" || command === "status" ? 1 : 2;
  if (positionals.length > maximum) throw new UsageError("too many arguments for " + command);
  if (requiredName && value === void 0 && !seen.has("--help")) throw new UsageError(command + " requires a skill name");
  if (requiredName && value !== void 0 && !validName(value)) throw new UsageError("invalid skill name: " + value);
  return { command, value, host, json: seen.has("--json"), help: seen.has("--help") };
}
async function configPresence(cwd) {
  const path = resolve3(cwd, ".codex", "deepwright.toml");
  let state = "present";
  try {
    await lstat(path);
  } catch (error) {
    state = error.code === "ENOENT" ? "missing" : "unreadable";
  }
  if (state === "present") {
    try {
      if (!(await stat2(path)).isFile()) throw new Error("not a regular file");
      await access2(path, constants2.R_OK);
    } catch {
      state = "unreadable";
    }
  }
  return { path, state, validation: "not-performed" };
}
function skillLines(skill) {
  return [
    terminalText(skill.displayName) + " (" + skill.name + ")",
    terminalText(skill.description),
    "Codex CLI: " + skill.invocation,
    "Desktop: type @ and select " + terminalText(skill.displayName),
    "Implicit invocation policy: " + skill.implicit,
    "Canonical file: " + jsonText(skill.path).trim(),
    "Start a fresh host session after installation; activation is not checked here."
  ];
}
function invocation(skill, host) {
  if (host === "codex") {
    return {
      host,
      cli: skill.invocation,
      desktop: "Type @ and select " + skill.displayName,
      note: "Start a fresh session after installation. This helper prints guidance only; it does not launch Codex or check activation."
    };
  }
  const file = host === "agents" ? "AGENTS.md" : "CLAUDE.md";
  return {
    host,
    target: file,
    pointer: [
      "For an explicit request to use the Deepwright " + skill.name + " skill,",
      "read " + jsonText(skill.path).trim() + " in full.",
      "Resolve its supporting files relative to that skill and use only this host's available capabilities.",
      "Preserve repository instructions and the user's scope; this pointer grants no new permissions.",
      "When delegating, carry the resolved skill path, task scope, and permissions into the worker brief.",
      "If the skill is unavailable, report that limitation."
    ].join(" "),
    note: "Optional routing pointer only. Review it before adding it to " + file + "; no file was written and native plugin support is not implied."
  };
}
async function main2(argv, io = { stdout: (value) => process.stdout.write(value), stderr: (value) => process.stderr.write(value) }, context = {}) {
  try {
    const options = parse(argv);
    if (options.command === "doctor") return main(argv, io);
    if (options.help) {
      io.stdout(USAGE2);
      return 0;
    }
    const pluginRoot = await realpath2(context.pluginRoot ?? defaultPluginRoot());
    const skills = await loadCatalog(pluginRoot);
    const envelope = { schemaVersion: 1, tool: "deepwright", command: options.command };
    if (options.command === "skills") {
      const query = (options.value ?? "").toLowerCase();
      const matches = skills.filter((skill) => [skill.name, skill.displayName, skill.description].some((value) => value.toLowerCase().includes(query)));
      io.stdout(options.json ? jsonText({ ...envelope, query: options.value ?? null, skills: matches }) : matches.length === 0 ? "No matching skills.\n" : matches.map((skill) => skill.name + (skill.implicit ? " [implicit]" : "") + " \u2014 " + terminalText(skill.displayName) + "\n  " + terminalText(skill.description)).join("\n") + "\n");
    } else if (options.command === "status") {
      const manifest = JSON.parse(await readFile2(join3(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
      if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(manifest.version)) {
        throw new Error("plugin manifest has no valid version");
      }
      const config = await configPresence(context.cwd ?? process.cwd());
      const implicitSkills = skills.filter((skill) => skill.implicit).map((skill) => skill.name);
      const hostState = {
        sessionActivation: "unknown",
        models: "unknown",
        mcp: "unknown",
        note: "Package metadata is not host state; use the host's own plugin, model, and MCP interfaces."
      };
      io.stdout(options.json ? jsonText({
        ...envelope,
        version: manifest.version,
        pluginRoot,
        skillCount: skills.length,
        implicitSkills,
        explicitSkillCount: skills.length - implicitSkills.length,
        config,
        hostState
      }) : [
        "Deepwright " + manifest.version + ": " + skills.length + " skills",
        "Implicit policy: " + (implicitSkills.join(", ") || "none"),
        "Plugin root: " + jsonText(pluginRoot).trim(),
        "Project config: " + config.state + " \u2014 " + jsonText(config.path).trim(),
        "Config validation: not performed; file contents and model availability are not checked.",
        "Host session activation, models, and MCP state: unknown (not available to this helper)."
      ].join("\n") + "\n");
    } else {
      const skill = skills.find((entry) => entry.name === options.value);
      if (skill === void 0) throw new UsageError("unknown skill: " + options.value + "; run deepwright skills");
      if (options.command === "skill") {
        io.stdout(options.json ? jsonText({ ...envelope, skill }) : skillLines(skill).join("\n") + "\n");
      } else {
        const guidance = invocation(skill, options.host);
        io.stdout(options.json ? jsonText({ ...envelope, skill, guidance }) : [
          "Invocation guidance only \u2014 nothing executed or written.",
          ..."cli" in guidance ? ["Codex CLI: " + guidance.cli, terminalText(guidance.desktop)] : ["Optional " + guidance.target + " pointer:", guidance.pointer],
          terminalText(guidance.note)
        ].join("\n") + "\n");
      }
    }
    return 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = error instanceof UsageError ? 64 : 1;
    io.stderr(argv.includes("--json") ? jsonText({ schemaVersion: 1, tool: "deepwright", error: detail, exitCode: code }) : "error: " + terminalText(detail) + "\n" + (code === 64 ? USAGE2 : ""));
    return code;
  }
}

// doctor/entry.ts
process.exitCode = await main2(process.argv.slice(2));
