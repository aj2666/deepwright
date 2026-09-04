import { constants } from "node:fs";
import { access, lstat, readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { main as doctorMain } from "../doctor/doctor.ts";
import { defaultPluginRoot, jsonText, loadCatalog, terminalText, validName, type Skill } from "./catalog.ts";

interface Io {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

export interface Context {
  readonly pluginRoot?: string;
  readonly cwd?: string;
}

type Host = "codex" | "agents" | "claude";
type Command = "doctor" | "skills" | "skill" | "invoke" | "status";
type Guidance =
  | { readonly host: "codex"; readonly cli: string; readonly desktop: string; readonly note: string }
  | { readonly host: "agents" | "claude"; readonly target: string; readonly pointer: string; readonly note: string };
const commands: readonly string[] = ["doctor", "skills", "skill", "invoke", "status"];
const USAGE = [
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
  "",
].join("\n");

class UsageError extends Error {}

function parse(argv: readonly string[]) {
  const seen = new Set<string>();
  const positionals: string[] = [];
  let host: Host = "codex";
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
      const value = argv[++index];
      if (value !== "codex" && value !== "agents" && value !== "claude") {
        throw new UsageError("--host must be codex, agents, or claude");
      }
      host = value;
    }
  }
  const command = positionals[0];
  if (command === undefined && seen.has("--help") && !seen.has("--host")) {
    return { command: undefined, value: undefined, host, json: seen.has("--json"), help: true };
  }
  if (!commands.includes(command)) throw new UsageError("expected a valid command");
  if (seen.has("--host") && command !== "invoke") throw new UsageError("--host is only valid with invoke");
  const value = positionals[1];
  const requiredName = command === "skill" || command === "invoke";
  const maximum = command === "doctor" || command === "status" ? 1 : 2;
  if (positionals.length > maximum) throw new UsageError("too many arguments for " + command);
  if (requiredName && value === undefined && !seen.has("--help")) throw new UsageError(command + " requires a skill name");
  if (requiredName && value !== undefined && !validName(value)) throw new UsageError("invalid skill name: " + value);
  return { command: command as Command, value, host, json: seen.has("--json"), help: seen.has("--help") };
}

async function configPresence(cwd: string) {
  const path = resolve(cwd, ".codex", "deepwright.toml");
  let state: "missing" | "present" | "unreadable" = "present";
  try {
    await lstat(path);
  } catch (error) {
    state = (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable";
  }
  if (state === "present") {
    try {
      if (!(await stat(path)).isFile()) throw new Error("not a regular file");
      await access(path, constants.R_OK);
    } catch {
      state = "unreadable";
    }
  }
  return { path, state, validation: "not-performed" as const };
}

function skillLines(skill: Skill): string[] {
  return [
    terminalText(skill.displayName) + " (" + skill.name + ")",
    terminalText(skill.description),
    "Codex CLI: " + skill.invocation,
    "Desktop: type @ and select " + terminalText(skill.displayName),
    "Implicit invocation policy: " + skill.implicit,
    "Canonical file: " + jsonText(skill.path).trim(),
    "Start a fresh host session after installation; activation is not checked here.",
  ];
}

function invocation(skill: Skill, host: Host): Guidance {
  if (host === "codex") {
    return {
      host,
      cli: skill.invocation,
      desktop: "Type @ and select " + skill.displayName,
      note: "Start a fresh session after installation. This helper prints guidance only; it does not launch Codex or check activation.",
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
      "If the skill is unavailable, report that limitation.",
    ].join(" "),
    note: "Optional routing pointer only. Review it before adding it to " + file + "; no file was written and native plugin support is not implied.",
  };
}

export async function main(
  argv: readonly string[],
  io: Io = { stdout: (value) => process.stdout.write(value), stderr: (value) => process.stderr.write(value) },
  context: Context = {},
): Promise<number> {
  try {
    const options = parse(argv);
    if (options.command === "doctor") return doctorMain(argv, io);
    if (options.help) {
      io.stdout(USAGE);
      return 0;
    }
    const pluginRoot = await realpath(context.pluginRoot ?? defaultPluginRoot());
    const skills = await loadCatalog(pluginRoot);
    const envelope = { schemaVersion: 1, tool: "deepwright", command: options.command };
    if (options.command === "skills") {
      const query = (options.value ?? "").toLowerCase();
      const matches = skills.filter((skill) => [skill.name, skill.displayName, skill.description]
        .some((value) => value.toLowerCase().includes(query)));
      io.stdout(options.json
        ? jsonText({ ...envelope, query: options.value ?? null, skills: matches })
        : (matches.length === 0 ? "No matching skills.\n" : matches.map((skill) =>
          skill.name + (skill.implicit ? " [implicit]" : "") + " — " + terminalText(skill.displayName) +
          "\n  " + terminalText(skill.description)).join("\n") + "\n"));
    } else if (options.command === "status") {
      const manifest: unknown = JSON.parse(await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
      if (typeof manifest !== "object" || manifest === null || !("version" in manifest) ||
          typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(manifest.version)) {
        throw new Error("plugin manifest has no valid version");
      }
      const config = await configPresence(context.cwd ?? process.cwd());
      const implicitSkills = skills.filter((skill) => skill.implicit).map((skill) => skill.name);
      const hostState = {
        sessionActivation: "unknown",
        models: "unknown",
        mcp: "unknown",
        note: "Package metadata is not host state; use the host's own plugin, model, and MCP interfaces.",
      };
      io.stdout(options.json ? jsonText({
        ...envelope, version: manifest.version, pluginRoot, skillCount: skills.length,
        implicitSkills, explicitSkillCount: skills.length - implicitSkills.length, config, hostState,
      }) : [
        "Deepwright " + manifest.version + ": " + skills.length + " skills",
        "Implicit policy: " + (implicitSkills.join(", ") || "none"),
        "Plugin root: " + jsonText(pluginRoot).trim(),
        "Project config: " + config.state + " — " + jsonText(config.path).trim(),
        "Config validation: not performed; file contents and model availability are not checked.",
        "Host session activation, models, and MCP state: unknown (not available to this helper).",
      ].join("\n") + "\n");
    } else {
      const skill = skills.find((entry) => entry.name === options.value);
      if (skill === undefined) throw new UsageError("unknown skill: " + options.value + "; run deepwright skills");
      if (options.command === "skill") {
        io.stdout(options.json ? jsonText({ ...envelope, skill }) : skillLines(skill).join("\n") + "\n");
      } else {
        const guidance = invocation(skill, options.host);
        io.stdout(options.json ? jsonText({ ...envelope, skill, guidance }) : [
          "Invocation guidance only — nothing executed or written.",
          ...("cli" in guidance
            ? ["Codex CLI: " + guidance.cli, terminalText(guidance.desktop)]
            : ["Optional " + guidance.target + " pointer:", guidance.pointer]),
          terminalText(guidance.note),
        ].join("\n") + "\n");
      }
    }
    return 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = error instanceof UsageError ? 64 : 1;
    io.stderr(argv.includes("--json")
      ? jsonText({ schemaVersion: 1, tool: "deepwright", error: detail, exitCode: code })
      : "error: " + terminalText(detail) + "\n" + (code === 64 ? USAGE : ""));
    return code;
  }
}
