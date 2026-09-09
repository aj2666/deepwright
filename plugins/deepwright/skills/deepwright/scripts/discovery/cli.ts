import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_FIELDS, formatConfigTemplate, readConfig } from "../config/config.ts";
import { main as doctorMain } from "../doctor/doctor.ts";
import { defaultPluginRoot, jsonText, loadCatalog, terminalText, validName, type Skill } from "./catalog.ts";
import { loadPlaybooks, searchEntries } from "./workbench.ts";
import { rankEntries, validateSearch, type RankedEntry } from "./ranking.mjs";

interface Io {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

export interface Context {
  readonly pluginRoot?: string;
  readonly cwd?: string;
}

type Host = "codex" | "agents" | "claude" | "omp";
type Command = "home" | "doctor" | "skills" | "skill" | "playbooks" | "find" | "invoke" | "status" | "config";
type Guidance =
  | { readonly host: "codex"; readonly cli: string; readonly desktop: string; readonly note: string }
  | { readonly host: "omp"; readonly prompt: string; readonly note: string }
  | { readonly host: "agents" | "claude"; readonly prompt?: string; readonly target: string; readonly pointer: string; readonly note: string };
const commands: readonly string[] = ["home", "doctor", "skills", "skill", "playbooks", "find", "invoke", "status", "config"];
const USAGE = [
  "Usage: deepwright <command> [options]",
  "",
  "  home [--json]                           compact start page (also no args)",
  "  doctor [--json]                         check runtime and plugin layout",
  "  skills [query] [--compact|--json]       list or search skill metadata",
  "  playbooks [query] [--json]              browse the canonical router table",
  "  find <query> [--limit 1..10] [--json]   rank metadata; default 3 per kind",
  "  skill <name> [--json]                   inspect a skill and its invocation",
  "  invoke <name> [--host codex|agents|claude|omp] [--json]",
  "                                         print guidance; never execute it",
  "  status [--json]                         inspect package and config validity",
  "  config show|check|template [--json]     inspect settings; never write them",
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
  let limit = 3;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    const flag = argument === "-h" ? "--help" : argument;
    if (!["--json", "--help", "--host", "--compact", "--limit"].includes(flag)) throw new UsageError("unknown option: " + argument);
    if (seen.has(flag)) throw new UsageError("duplicate option: " + flag);
    seen.add(flag);
    if (flag === "--limit") {
      const value = argv[++index];
      if (value === undefined || !/^(?:[1-9]|10)$/u.test(value)) throw new UsageError("--limit must be an integer from 1 to 10");
      limit = Number(value);
    }
    if (flag === "--host") {
      const value = argv[++index];
      if (value !== "codex" && value !== "agents" && value !== "claude" && value !== "omp") {
        throw new UsageError("--host must be codex, agents, claude, or omp");
      }
      host = value;
    }
  }
  const command = positionals[0] ?? "home";
  if (!commands.includes(command)) throw new UsageError("expected a valid command");
  if (seen.has("--host") && command !== "invoke") throw new UsageError("--host is only valid with invoke");
  if (seen.has("--limit") && command !== "find") throw new UsageError("--limit is only valid with find");
  if (seen.has("--compact") && command !== "skills") throw new UsageError("--compact is only valid with skills");
  if (seen.has("--compact") && seen.has("--json")) throw new UsageError("--compact and --json are mutually exclusive");
  const value = positionals[1];
  const requiredName = command === "skill" || command === "invoke";
  const maximum = ["home", "doctor", "status"].includes(command) ? 1 : 2;
  if (positionals.length > maximum) throw new UsageError("too many arguments for " + command);
  if (requiredName && value === undefined && !seen.has("--help")) throw new UsageError(command + " requires a skill name");
  if (requiredName && value !== undefined && !validName(value)) throw new UsageError("invalid skill name: " + value);
  if (command === "config" && !(value === undefined && seen.has("--help")) &&
      !["show", "check", "template"].includes(value ?? "")) throw new UsageError("config requires show, check, or template");
  if (command === "find") {
    if (value === undefined && !seen.has("--help")) throw new UsageError("find requires a query");
    try { validateSearch(value ?? "", limit); }
    catch (error) { throw new UsageError(error instanceof Error ? error.message : String(error)); }
  }
  return { command: command as Command, value, host, limit, json: seen.has("--json"), compact: seen.has("--compact"), help: seen.has("--help") };
}

function compactHit<T extends { readonly description: string }>(hit: T): T {
  const characters = Array.from(hit.description);
  return { ...hit, description: characters.length > 240 ? characters.slice(0, 239).join("") + "…" : hit.description };
}

function rankedLines(label: string, entries: readonly ({ readonly name: string; readonly path: string; readonly description: string } & RankedEntry)[]): string[] {
  return [label + ":", ...(entries.length === 0 ? ["  No matching metadata."] : entries.flatMap((entry) => [
    "  " + entry.name + " — " + terminalText(entry.description),
    "    " + jsonText(entry.path).trim(),
    "    Score: " + entry.score.toFixed(3) + "; matched terms: " + terminalText(entry.matchedTerms.join(", ")),
  ]))];
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
  if (host === "omp") {
    return {
      host,
      prompt: "/skill:" + skill.name,
      note: "Use this prompt in Oh My Pi with skill slash commands enabled. Start a fresh session after installation. Skill names are unqualified; check for collisions. Activation is not checked here.",
    };
  }
  const file = host === "agents" ? "AGENTS.md" : "CLAUDE.md";
  return {
    host,
    ...(host === "claude" ? { prompt: "/deepwright:" + skill.name } : {}),
    target: file,
    pointer: [
      "For an explicit request to use the Deepwright " + skill.name + " skill,",
      "read " + jsonText(skill.path).trim() + " in full.",
      "Resolve its supporting files relative to that skill and use only this host's available capabilities.",
      "Preserve repository instructions and the user's scope; this pointer grants no new permissions.",
      "When delegating, carry the resolved skill path, task scope, and permissions into the worker brief.",
      "If the skill is unavailable, report that limitation.",
    ].join(" "),
    note: (host === "claude" ? "Use the native prompt after installing the plugin in Claude Code and starting a fresh session. Activation is not checked here. " : "") +
      "Optional fallback pointer. Review it before adding it to " + file + "; no file was written. Do not duplicate an installed native skill.",
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
    const envelope = { schemaVersion: 1, tool: "deepwright", command: options.command };
    if (options.command === "config") {
      if (options.value === "template") {
        const template = formatConfigTemplate();
        io.stdout(options.json ? jsonText({ ...envelope, action: "template", template, written: false }) : template);
        return 0;
      }
      const report = await readConfig(context.cwd ?? process.cwd());
      const { settings, sources, ...summary } = report;
      const values = settings === null ? [] : CONFIG_FIELDS.map((field) => {
        const [section, key] = field.split(".");
        const table: Readonly<Record<string, string | number>> = section === "roles" ? settings.roles : settings.parallelism;
        const value = key === undefined ? settings.version : table[key];
        return field + " = " + jsonText(value).trim() + " [" + sources![field] + "]";
      });
      io.stdout(options.json
        ? jsonText({ ...envelope, action: options.value, ...(options.value === "show" ? report : summary) })
        : [
          "Project config: " + report.state + " — " + jsonText(report.path).trim(),
          "Config validation: " + report.validation + (report.state === "missing" ? " (defaults)" : ""),
          ...(options.value === "show" ? values : []),
          ...report.errors.map((issue) => terminalText(issue.message) +
            (issue.line === undefined ? "" : " (line " + issue.line + ", column " + issue.column + ")")),
          "Model availability: not checked. Settings are preferences, not host capability or permission.",
        ].join("\n") + "\n");
      return report.ok ? 0 : 1;
    }
    const pluginRoot = await realpath(context.pluginRoot ?? defaultPluginRoot());
    const skills = await loadCatalog(pluginRoot);
    if (options.command === "home") {
      const routes = await loadPlaybooks(pluginRoot);
      const entrypoints = skills.filter((skill) => skill.implicit);
      io.stdout(options.json ? jsonText({ ...envelope, skillCount: skills.length, playbookCount: routes.length, entrypoints }) : [
        "Deepwright — Go deep. Ship sound.",
        skills.length + " skills · " + routes.length + " playbooks · no background mode",
        "",
        ...entrypoints.map((skill) => "Start in Codex: " + skill.invocation + " <your engineering task>"),
        "Desktop: type @ and select a Deepwright skill.",
        "",
        "Find:     deepwright skills review --compact",
        'Suggest:  deepwright find "review code security"',
        "Route:    deepwright playbooks performance",
        "Inspect:  deepwright skill interrogate",
        "Invoke:   deepwright invoke interrogate",
        "Settings: deepwright config show",
        "Health:   deepwright status   /   deepwright doctor",
        "",
        "Read-only helper. Paste skill tokens into Codex, not your shell.",
      ].join("\n") + "\n");
    } else if (options.command === "find") {
      const query = options.value!;
      const foundSkills = rankEntries(skills, query, options.limit).map(compactHit);
      const foundPlaybooks = rankEntries(await loadPlaybooks(pluginRoot), query, options.limit).map(compactHit);
      io.stdout(options.json ? jsonText({
        ...envelope, query, limit: options.limit, algorithm: "bm25", skills: foundSkills, playbooks: foundPlaybooks,
      }) : [
        ...rankedLines("Skills", foundSkills),
        ...rankedLines("Playbooks", foundPlaybooks),
        "Suggestions only. Read selected files in full; scores measure lexical relevance, not permission or confidence.",
      ].join("\n") + "\n");
    } else if (options.command === "playbooks") {
      const matches = searchEntries(await loadPlaybooks(pluginRoot), options.value ?? "");
      io.stdout(options.json ? jsonText({ ...envelope, query: options.value ?? null, playbooks: matches }) :
        (matches.length === 0 ? "No matching playbooks.\n" : matches.map((entry) =>
          entry.name + " — " + terminalText(entry.description) + "\n  " + jsonText(entry.path).trim()).join("\n") +
          "\nAsk the Deepwright skill to use the fitting playbook; these are not separate skill tokens.\n"));
    } else if (options.command === "skills") {
      const matches = searchEntries(skills, options.value ?? "");
      io.stdout(options.json
        ? jsonText({ ...envelope, query: options.value ?? null, skills: matches })
        : (matches.length === 0 ? "No matching skills.\n" : matches.map((skill) =>
          skill.name + (skill.implicit ? " [implicit]" : "") + " — " + terminalText(skill.displayName) +
          (options.compact ? "" : "\n  " + terminalText(skill.description))).join("\n") + "\n"));
    } else if (options.command === "status") {
      const manifest: unknown = JSON.parse(await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
      if (typeof manifest !== "object" || manifest === null || !("version" in manifest) ||
          typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(manifest.version)) {
        throw new Error("plugin manifest has no valid version");
      }
      const { settings: _settings, sources, ...config } = await readConfig(context.cwd ?? process.cwd());
      const projectOverrides = sources === null ? null : Object.values(sources).filter((value) => value === "project").length;
      const implicitSkills = skills.filter((skill) => skill.implicit).map((skill) => skill.name);
      const hostState = {
        sessionActivation: "unknown",
        models: "unknown",
        mcp: "unknown",
        note: "Package metadata is not host state; use the host's own plugin, model, and MCP interfaces.",
      };
      io.stdout(options.json ? jsonText({
        ...envelope, schemaVersion: 2, version: manifest.version, pluginRoot, skillCount: skills.length,
        implicitSkills, explicitSkillCount: skills.length - implicitSkills.length, config: { ...config, projectOverrides }, hostState,
      }) : [
        "Deepwright " + manifest.version + ": " + skills.length + " skills",
        "Implicit policy: " + (implicitSkills.join(", ") || "none"),
        "Plugin root: " + jsonText(pluginRoot).trim(),
        "Project config: " + config.state + " — " + jsonText(config.path).trim(),
        "Config validation: " + config.validation + (projectOverrides === null ? "; run deepwright config check" : "; " + projectOverrides + " project overrides"),
        "Host session activation, models, and MCP state: unknown (not available to this helper).",
      ].join("\n") + "\n");
      return config.ok ? 0 : 1;
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
            : [
              ...("prompt" in guidance && guidance.prompt ? ["Host prompt: " + guidance.prompt] : []),
              ...("pointer" in guidance ? ["Optional " + guidance.target + " pointer:", guidance.pointer] : []),
            ]),
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
