import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "./cli.ts";
import { defaultPluginRoot, jsonText, loadCatalog, terminalText } from "./catalog.ts";

const temporaryDirectories: string[] = [];
const scriptsDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  // macOS can expose its temporary directory through /var -> /private/var.
  const root = await realpath(await mkdtemp(join(tmpdir(), "deepwright-discovery-")));
  temporaryDirectories.push(root);
  const pluginRoot = join(root, "plugin  $(touch sentinel) ; [space]");
  const cwd = join(root, "project");
  await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
  await mkdir(cwd);
  await writeFile(join(pluginRoot, ".codex-plugin", "plugin.json"), '{"version":"1.0.1"}\n');
  for (const name of ["zeta", "deepwright", "alpha"]) {
    const directory = join(pluginRoot, "skills", name);
    await mkdir(join(directory, "agents"), { recursive: true });
    await writeFile(join(directory, "SKILL.md"), [
      "---", "name: " + name, "description: " + JSON.stringify("Investigate " + name + " workflow"),
      "---", "", "# " + name, "", "Canonical workflow body.", "",
    ].join("\n"));
    await writeFile(join(directory, "agents", "openai.yaml"), [
      "interface:", "  display_name: " + JSON.stringify(name === "alpha" ? "First Steps" : name),
      "policy:", "  allow_implicit_invocation: " + (name === "deepwright"), "",
    ].join("\n"));
  }
  return { root, pluginRoot, cwd };
}

async function run(argv: readonly string[], context: { pluginRoot?: string; cwd?: string } = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await main(argv, { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) }, context);
  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

async function snapshot(root: string): Promise<unknown> {
  const values: unknown[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name);
    values.push([entry.name, entry.isDirectory() ? await snapshot(path) : await readFile(path, "utf8")]);
  }
  return values;
}

describe("read-only skill discovery", () => {
  it("derives the real 47-skill catalog and its single implicit router", async () => {
    const skills = await loadCatalog(defaultPluginRoot());
    expect(skills).toHaveLength(47);
    expect(skills.filter((skill) => skill.implicit).map((skill) => skill.name)).toEqual(["deepwright"]);
    expect(skills.map((skill) => skill.name)).toEqual(skills.map((skill) => skill.name).sort());
  });

  it("lists deterministic metadata and searches names, display names and descriptions", async () => {
    const context = await fixture();
    const listed = await run(["skills", "--json"], context);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.stdout)).toMatchObject({
      schemaVersion: 1, tool: "deepwright", command: "skills", query: null,
      skills: [{ name: "alpha" }, { name: "deepwright" }, { name: "zeta" }],
    });
    for (const query of ["ALPHA", "First Steps", "Investigate alpha"]) {
      const result = await run(["skills", query, "--json"], context);
      expect(JSON.parse(result.stdout).skills.map((skill: { name: string }) => skill.name)).toEqual(["alpha"]);
    }
    expect((await run(["skills", "no matches"], context)).stdout).toBe("No matching skills.\n");
  });

  it("resolves a symlinked plugin root to canonical paths on every platform", async () => {
    const context = await fixture();
    const alias = join(context.root, "plugin alias");
    await symlink(context.pluginRoot, alias, "dir");
    const result = await run(["skill", "alpha", "--json"], { ...context, pluginRoot: alias });
    expect(result.code).toBe(0);
    const canonical = await realpath(join(context.pluginRoot, "skills", "alpha", "SKILL.md"));
    expect(JSON.parse(result.stdout).skill.path).toBe(canonical);
    const status = await run(["status", "--json"], { ...context, pluginRoot: alias });
    expect(JSON.parse(status.stdout).pluginRoot).toBe(await realpath(context.pluginRoot));
  });

  it("shows canonical paths, native CLI invocation, desktop title and policy without printing the body", async () => {
    const context = await fixture();
    const result = await run(["skill", "alpha", "--json"], context);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).skill).toMatchObject({
      name: "alpha", displayName: "First Steps", implicit: false, invocation: "$deepwright:alpha",
      path: join(context.pluginRoot, "skills", "alpha", "SKILL.md"),
    });
    expect(result.stdout).not.toContain("Canonical workflow body");
    const human = await run(["skill", "alpha"], context);
    expect(human.stdout).toContain("Desktop: type @ and select First Steps");
    expect(human.stdout).toContain("activation is not checked");
  });

  it.each(["codex", "agents", "claude"] as const)("prints %s guidance without file or process side effects", async (host) => {
    const context = await fixture();
    await writeFile(join(context.cwd, "AGENTS.md"), "User instructions.\n");
    await writeFile(join(context.cwd, "CLAUDE.md"), "Other user instructions.\n");
    const before = await snapshot(context.root);
    const result = await run(["invoke", "alpha", "--host", host, "--json"], context);
    expect(result.code).toBe(0);
    const guidance = JSON.parse(result.stdout).guidance;
    expect(guidance.host).toBe(host);
    if (host === "codex") {
      expect(guidance.cli).toBe("$deepwright:alpha");
      expect(guidance.desktop).toContain("First Steps");
    } else {
      expect(guidance.target).toBe(host === "agents" ? "AGENTS.md" : "CLAUDE.md");
      expect(guidance.pointer).toContain(JSON.stringify(join(context.pluginRoot, "skills", "alpha", "SKILL.md")));
      expect(guidance.pointer).toContain("grants no new permissions");
      expect(guidance.note).toContain("no file was written");
    }
    const human = await run(["invoke", "alpha", "--host", host], context);
    expect(human.stdout).toContain("nothing executed or written");
    await run(["skills"], context);
    await run(["skill", "alpha"], context);
    await run(["status"], context);
    expect(await snapshot(context.root)).toEqual(before);
  });

  it("reports config validity without values and explicitly unknown session/model/MCP state", async () => {
    const context = await fixture();
    const missing = JSON.parse((await run(["status", "--json"], context)).stdout);
    expect(missing).toMatchObject({
      version: "1.0.1", skillCount: 3, explicitSkillCount: 2, implicitSkills: ["deepwright"],
      schemaVersion: 2, config: { state: "missing", validation: "passed", projectOverrides: 0 },
      hostState: { sessionActivation: "unknown", models: "unknown", mcp: "unknown" },
    });
    await mkdir(join(context.cwd, ".codex"));
    const config = join(context.cwd, ".codex", "deepwright.toml");
    await writeFile(config, "malformed = [ PRIVATE-SECRET-DO-NOT-PRINT");
    const present = await run(["status", "--json"], context);
    expect(present.code).toBe(1);
    expect(JSON.parse(present.stdout).config).toMatchObject({ state: "present", validation: "failed", projectOverrides: null });
    expect(present.stdout).not.toContain("PRIVATE-SECRET");
    await writeFile(config, '[roles]\ncode = "private-model-id"\n');
    const valid = await run(["status", "--json"], context);
    expect(valid.code).toBe(0);
    expect(JSON.parse(valid.stdout).config).toMatchObject({ validation: "passed", projectOverrides: 1 });
    expect(valid.stdout).not.toContain("private-model-id");
    await rm(config);
    await mkdir(config);
    expect(JSON.parse((await run(["status", "--json"], context)).stdout).config.state).toBe("unreadable");
  });

  it.each([
    ["run"], ["skill"], ["skill", "../alpha"], ["skill", "/alpha"], ["skill", "Alpha"],
    ["skills", "--bogus"], ["skills", "--json", "--json"], ["skills", "-h", "--help"],
    ["skills", "a", "b"], ["status", "alpha"], ["status", "--host", "codex"],
    ["invoke", "alpha", "--host"], ["invoke", "alpha", "--host", "unknown"],
    ["invoke", "alpha", "--host", "codex", "--host", "agents"], ["skills", "--help", "--bogus"],
    ["config"], ["config", "write"], ["config", "show", "extra"], ["home", "extra"],
    ["playbooks", "a", "b"], ["status", "--compact"], ["skills", "--compact", "--json"],
  ])("rejects malformed arguments %j before loading a plugin", async (...args) => {
    const result = await run(args, { pluginRoot: "/nonexistent/deepwright" });
    expect(result.code).toBe(64);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("error");
  });

  it("reports unknown skills as structured usage errors", async () => {
    const result = await run(["skill", "absent", "--json"], await fixture());
    expect(result.code).toBe(64);
    expect(JSON.parse(result.stderr)).toMatchObject({ exitCode: 64, error: expect.stringContaining("unknown skill") });
    expect(result.stdout).toBe("");
  });

  it("keeps help independent of plugin reads and preserves doctor dispatch", async () => {
    expect((await run(["--help"], { pluginRoot: "/not-present" })).stdout).toContain("skills [query]");
    expect((await run(["doctor", "--help"])).stdout).toContain("deepwright doctor [--json]");
  });

  it("provides a compact canonical home and searchable playbooks without starting work", async () => {
    const context = { pluginRoot: defaultPluginRoot() };
    const home = await run([], context);
    expect(home.code).toBe(0);
    expect(home.stdout.split("\n").length).toBeLessThan(22);
    expect(home.stdout).toContain("47 skills · 24 playbooks");
    expect(home.stdout).toContain("$deepwright:deepwright");
    const json = JSON.parse((await run(["home", "--json"], context)).stdout);
    expect(json.entrypoints.map((skill: { name: string }) => skill.name)).toEqual(["deepwright"]);
    const routes = await run(["playbooks", "measured performance", "--json"], context);
    expect(routes.code).toBe(0);
    expect(JSON.parse(routes.stdout).playbooks.map((entry: { name: string }) => entry.name)).toEqual(["perf-issue"]);
    expect((await run(["playbooks", "no matching entry"], context)).stdout).toBe("No matching playbooks.\n");
  });

  it("supports compact skill search across fields", async () => {
    const context = await fixture();
    const result = await run(["skills", "steps investigate", "--compact"], context);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("alpha — First Steps\n");
  });

  it("shows provenance, validates, and prints templates without requiring a plugin or writing", async () => {
    const context = { ...(await fixture()), pluginRoot: "/not-present" };
    const before = await snapshot(context.cwd);
    for (const action of ["show", "check", "template"]) {
      const result = await run(["config", action, "--json"], context);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout).action).toBe(action);
    }
    const shown = await run(["config", "show"], context);
    expect(shown.stdout).toContain('roles.code = "inherit-parent" [default]');
    expect(shown.stdout).toContain("parallelism.swarm_workers = 4 [default]");
    const template = await run(["config", "template"], context);
    expect(template.stdout).toContain("[roles]");
    const contract = await readFile(join(defaultPluginRoot(), "skills", "deepwright", "references", "configuration.md"), "utf8");
    expect(contract.match(/```toml\n([\s\S]*?)```/u)![1]).toBe(template.stdout.split("\n").slice(1).join("\n"));
    expect(await snapshot(context.cwd)).toEqual(before);
    await mkdir(join(context.cwd, ".codex"));
    await writeFile(join(context.cwd, ".codex", "deepwright.toml"), "version = 1.0");
    expect((await run(["config", "check"], context)).code).toBe(1);
    expect(JSON.parse((await run(["config", "show", "--json"], context)).stdout).settings).toBeNull();
    await writeFile(join(context.cwd, ".codex", "deepwright.toml"), "version = [ PRIVATE-SECRET");
    const invalid = await run(["config", "check"], context);
    expect(invalid.stdout).toMatch(/Invalid TOML configuration\. \(line \d+, column \d+\)/u);
    expect(invalid.stdout).not.toContain("PRIVATE-SECRET");
  });

  it.each([
    ["SKILL.md", "---\nname: alpha\nname: alpha\ndescription: Fine\n---\n"],
    ["SKILL.md", "---\nname: wrong\ndescription: Fine\n---\n"],
    ["SKILL.md", "---\nname: alpha\ndescription: |\n  multiline\n---\n"],
    ["SKILL.md", "---\nname: alpha\ndescription: Investigate\n  bugs and regressions\n---\n"],
    ["SKILL.md", "---\nname: alpha\ndescription: Investigate\n\n# Comment\n  bugs and regressions\n---\n"],
    ["SKILL.md", '---\nname: alpha\ndescription: "broken\n---\n'],
    ["SKILL.md", '---\nname: alpha\ndescription: "line\\nbreak"\n---\n'],
    ["SKILL.md", "# No metadata\n"],
    ["agents/openai.yaml", 'interface:\n  display_name: "Alpha"\npolicy:\n  allow_implicit_invocation: yes\n'],
    ["agents/openai.yaml", 'interface:\n  display_name: "Alpha"\npolicy:\n  allow_implicit_invocation: "false"\n'],
    ["agents/openai.yaml", 'interface:\n  display_name: "Alpha"\n  display_name: "Duplicate"\npolicy:\n  allow_implicit_invocation: false\n'],
    ["agents/openai.yaml", 'interface:\n  display_name: Alpha\n    Continuation\npolicy:\n  allow_implicit_invocation: false\n'],
  ])("fails clearly on malformed %s metadata", async (relative, content) => {
    const context = await fixture();
    await writeFile(join(context.pluginRoot, "skills", "alpha", relative), content);
    const result = await run(["skills", "--json"], context);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error).toContain("invalid metadata for alpha");
  });

  it.each(["false", "null", "~", "123", "-2.5", "1e3", "0xFF", ".nan"])(
    "rejects non-string plain scalar %s for descriptive metadata",
    async (value) => {
      const context = await fixture();
      await writeFile(join(context.pluginRoot, "skills", "alpha", "SKILL.md"),
        "---\nname: alpha\ndescription: " + value + "\n---\n");
      const result = await run(["skills", "--json"], context);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stderr).error).toContain("must be a string");
    },
  );

  it("supports current plain/double/single-quoted scalar forms and CRLF", async () => {
    const context = await fixture();
    await writeFile(join(context.pluginRoot, "skills", "alpha", "SKILL.md"),
      "---\r\nname: alpha\r\ndescription: 'User''s explicit workflow'\r\n---\r\n");
    expect(JSON.parse((await run(["skill", "alpha", "--json"], context)).stdout).skill.description)
      .toBe("User's explicit workflow");
  });

  it("rejects linked metadata that leaves the skill tree", async () => {
    const context = await fixture();
    const skill = join(context.pluginRoot, "skills", "alpha", "SKILL.md");
    await rm(skill);
    await writeFile(join(context.cwd, "outside.md"), "---\nname: alpha\ndescription: Outside\n---\n");
    await symlink(join(context.cwd, "outside.md"), skill);
    const result = await run(["skill", "alpha"], context);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("leaves the plugin skills directory");
  });

  it("neutralizes terminal controls while preserving JSON string values losslessly", async () => {
    const unsafe = "Alpha\u001b[31m red\u001b[0m\u001b]0;spoof\u0007\u009b\u202e";
    expect(terminalText(unsafe)).toBe("Alpha red");
    const json = jsonText({ value: unsafe });
    expect(json).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202e]/u);
    expect(JSON.parse(json).value).toBe(unsafe);
    const context = await fixture();
    await writeFile(join(context.pluginRoot, "skills", "alpha", "agents", "openai.yaml"), [
      "interface:", "  display_name: " + JSON.stringify(unsafe),
      "policy:", "  allow_implicit_invocation: false", "",
    ].join("\n"));
    const human = await run(["skill", "alpha"], context);
    expect(human.stdout).toContain("Alpha red");
    expect(human.stdout).not.toContain("\u001b");
    expect(JSON.parse((await run(["skill", "alpha", "--json"], context)).stdout).skill.displayName).toBe(unsafe);
    const error = await run(["skill", "\u001b]0;spoof\u0007"]);
    expect(error.stderr).not.toMatch(/[\u001b\u0007]/u);
  });

  it("roundtrips actionable paths with repeated spaces and Unicode/control characters in every surface", async () => {
    const context = await fixture();
    const pluginRoot = context.pluginRoot + "  café\u001b[31m\u009b\u202e\n";
    const cwd = context.cwd + "  résumé\u009b\u202e";
    await rename(context.pluginRoot, pluginRoot);
    await rename(context.cwd, cwd);
    const updated = { pluginRoot, cwd };
    const unsafe = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202e]/u;
    const path = await realpath(join(pluginRoot, "skills", "alpha", "SKILL.md"));
    const canonicalRoot = await realpath(pluginRoot);
    for (const host of ["agents", "claude"]) {
      const result = await run(["invoke", "alpha", "--host", host], updated);
      expect(result.code).toBe(0);
      expect(result.stdout).not.toMatch(unsafe);
      const encoded = /read ("(?:\\.|[^"\\])*") in full\./u.exec(result.stdout)?.[1];
      expect(JSON.parse(encoded!)).toBe(path);
      const json = await run(["invoke", "alpha", "--host", host, "--json"], updated);
      expect(json.stdout).not.toMatch(unsafe);
      const pointer = JSON.parse(json.stdout).guidance.pointer as string;
      expect(pointer).not.toMatch(unsafe);
      expect(JSON.parse(/read ("(?:\\.|[^"\\])*") in full\./u.exec(pointer)![1])).toBe(path);
    }
    const skill = await run(["skill", "alpha"], updated);
    expect(skill.stdout).not.toMatch(unsafe);
    expect(JSON.parse(skill.stdout.split("\n").find((line) => line.startsWith("Canonical file: "))!
      .slice("Canonical file: ".length))).toBe(path);
    const status = await run(["status"], updated);
    expect(status.stdout).not.toMatch(unsafe);
    expect(JSON.parse(status.stdout.split("\n").find((line) => line.startsWith("Plugin root: "))!
      .slice("Plugin root: ".length))).toBe(canonicalRoot);
    expect(JSON.parse(status.stdout.split("\n").find((line) => line.startsWith("Project config: "))!
      .slice("Project config: missing — ".length))).toBe(join(cwd, ".codex", "deepwright.toml"));
    const json = await run(["status", "--json"], updated);
    expect(json.stdout).not.toMatch(unsafe);
    expect(JSON.parse(json.stdout).pluginRoot).toBe(canonicalRoot);
  });

  it("resolves installed bundle metadata through a bin symlink with spaces and shell metacharacters", async () => {
    const context = await fixture();
    const bundle = join(context.pluginRoot, "skills", "deepwright", "scripts", "dist", "deepwright.mjs");
    await mkdir(dirname(bundle), { recursive: true });
    await build({
      entryPoints: [join(scriptsDirectory, "doctor", "entry.ts")], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node20",
    });
    const link = join(context.root, "deepwright-bin");
    await symlink(bundle, link);
    const result = spawnSync(process.execPath, [link, "skills", "--json"], { cwd: context.cwd, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).skills.map((skill: { name: string }) => skill.name)).toEqual(["alpha", "deepwright", "zeta"]);
    expect(await readdir(context.cwd)).toEqual([]);
    const template = spawnSync(process.execPath, [link, "config", "template"], { cwd: context.cwd, encoding: "utf8" });
    expect(template.status, template.stderr).toBe(0);
    await mkdir(join(context.cwd, ".codex"));
    await writeFile(join(context.cwd, ".codex", "deepwright.toml"), template.stdout.replace("swarm_workers = 4", "swarm_workers = 2"));
    const configured = spawnSync(process.execPath, [link, "config", "show", "--json"], { cwd: context.cwd, encoding: "utf8" });
    expect(configured.status, configured.stderr).toBe(0);
    expect(JSON.parse(configured.stdout)).toMatchObject({
      settings: { parallelism: { swarm_workers: 2 } }, sources: { "parallelism.swarm_workers": "project" },
    });
    await writeFile(join(context.cwd, ".codex", "deepwright.toml"), "version = 1.0");
    const invalid = spawnSync(process.execPath, [link, "config", "check", "--json"], { cwd: context.cwd, encoding: "utf8" });
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).validation).toBe("failed");
  });
});
