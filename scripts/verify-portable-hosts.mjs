#!/usr/bin/env bun
// Real host packaging/discovery smoke, without model calls or persistent installs.
// bun scripts/verify-portable-hosts.mjs /path/to/@oh-my-pi/pi-coding-agent
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMain } from "./is-main.mjs";

export const REQUIRED_OMP_VERSION = "18.1.16";
export const EXCLUDED_DIRECTORIES = [".git", "node_modules"];
export const STATE_ENV_KEYS = [
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
  "XDG_STATE_HOME",
  "PI_CODING_AGENT_DIR",
  "PI_CONFIG_DIR",
  "PI_HOME",
  "PI_PROFILE",
  "OMP_PROFILE",
  "OMP_WORKTREE_DIR",
  "CLAUDE_CONFIG_DIR",
  "COPILOT_HOME",
];

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePlugin = path.join(repo, "plugins/deepwright");
const json = async file => JSON.parse(await readFile(file, "utf8"));
const hash = body => createHash("sha256").update(body).digest("hex");

export function isolatedHostEnv(home, extra = {}, from = process.env) {
  assert(path.isAbsolute(home), "isolated HOME must be absolute");
  const env = {};
  for (const [key, value] of Object.entries(from)) {
    if (STATE_ENV_KEYS.includes(key)) continue;
    if (key === "HOME" || key === "USERPROFILE" || key === "HOMEDRIVE" || key === "HOMEPATH") continue;
    if (key.startsWith("XDG_") || key.startsWith("PI_") || key.startsWith("OMP_")) continue;
    env[key] = value;
  }
  env.HOME = home;
  env.USERPROFILE = home;
  return { ...env, ...extra };
}

export async function inventory(root) {
  const files = [];
  let bytes = 0;
  async function walk(directory) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("Plugin content must not contain symlinks: " + filename);
      }
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.includes(entry.name)) await walk(filename);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error("Plugin content must contain only regular files and directories: " + filename);
      }
      const body = await readFile(filename);
      bytes += body.length;
      files.push({
        path: path.relative(root, filename).split(path.sep).join("/"),
        sha256: hash(body),
        bytes: body.length,
      });
    }
  }
  await walk(root);
  return { files, bytes, sha256: hash(JSON.stringify(files)) };
}

export function assertSamePackage(expected, actual, label) {
  const expectedPaths = expected.files.map(file => file.path);
  const actualPaths = actual.files.map(file => file.path);
  assert.deepEqual(actualPaths, expectedPaths, label + " file set");
  assert.equal(actual.bytes, expected.bytes, label + " byte count");
  assert.equal(actual.sha256, expected.sha256, label + " inventory digest");
}

export function listedSkillNames(listing) {
  const block = listing.match(/<skills>([\s\S]*?)<\/skills>/);
  if (!block) return [];
  return [...block[1].matchAll(/^- ([^:\n]+):/gm)].map(match => match[1].trim());
}

export function parseJsonPayload(stdout) {
  const lines = stdout.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{") && line.endsWith("}")) return JSON.parse(line);
  }
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  assert(start !== -1 && end > start, "inspect output must include a JSON object");
  return JSON.parse(stdout.slice(start, end + 1));
}

async function snapshotRegistries(home) {
  const files = [
    path.join(home, ".omp/marketplaces.json"),
    path.join(home, ".omp/plugins/installed_plugins.json"),
    path.join(home, ".claude/plugins/installed_plugins.json"),
  ];
  const snapshot = {};
  for (const file of files) {
    try {
      const info = await lstat(file);
      snapshot[file] = { exists: true, size: info.size, mtimeMs: info.mtimeMs, ino: info.ino };
    } catch {
      snapshot[file] = { exists: false };
    }
  }
  return snapshot;
}

async function copyMarketplace(destination) {
  await mkdir(path.join(destination, "plugins"), { recursive: true });
  await cp(path.join(repo, ".claude-plugin"), path.join(destination, ".claude-plugin"), { recursive: true });
  await cp(sourcePlugin, path.join(destination, "plugins/deepwright"), {
    recursive: true,
    filter: filename => !EXCLUDED_DIRECTORIES.includes(path.basename(filename)),
  });
}

function run(command, args, options) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      timeout: options.timeout ?? 120_000,
      cwd: options.cwd,
      env: options.env,
    });
  } catch (error) {
    const stdout = error.stdout ?? "";
    const stderr = error.stderr ?? "";
    error.message += `\ncommand: ${command} ${args.join(" ")}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
    throw error;
  }
}

async function inspectHosts(mode, { ompPackage, home, cwd, pluginDir }) {
  const extra = { DEEPWRIGHT_HOSTS_MODE: mode, DEEPWRIGHT_OMP_PACKAGE: ompPackage };
  if (pluginDir) extra.DEEPWRIGHT_PLUGIN_DIR = pluginDir;
  const stdout = run(process.execPath, [fileURLToPath(import.meta.url), ompPackage], {
    cwd,
    env: isolatedHostEnv(home, extra),
    timeout: 180_000,
  });
  return parseJsonPayload(stdout);
}

async function reportInspect() {
  const ompPackage = process.env.DEEPWRIGHT_OMP_PACKAGE;
  const mode = process.env.DEEPWRIGHT_HOSTS_MODE;
  const cwd = process.cwd();
  const home = homedir();
  const pluginDir = process.env.DEEPWRIGHT_PLUGIN_DIR;
  const ompImport = relative => import(pathToFileURL(path.resolve(ompPackage, "src", relative)).href);

  await ompImport("discovery/index.ts");
  const discovery = await ompImport("discovery/index.ts");
  const { loadSkills, setActiveSkills, getSkillSlashCommandName, parseSkillInvocation } = await ompImport("extensibility/skills.ts");
  const { skillCapability } = await ompImport("capability/skill.ts");
  const { buildSystemPrompt } = await ompImport("system-prompt.ts");
  const { SkillProtocolHandler } = await ompImport("internal-urls/skill-protocol.ts");
  const { parseInternalUrl } = await ompImport("internal-urls/parse.ts");
  const { injectPluginDirRoots } = await ompImport("discovery/helpers.ts");

  if (mode === "inspect-plugin-dir") {
    assert(pluginDir, "plugin-dir inspect requires DEEPWRIGHT_PLUGIN_DIR");
    await injectPluginDirRoots(home, [pluginDir], cwd);
  }
  if (mode === "inspect-disabled") {
    discovery.setDisabledProviders(["claude-plugins"]);
  }

  const loaded = await loadSkills({ cwd, enabled: true });
  const capability = await discovery.loadCapability(skillCapability.id, { cwd });
  setActiveSkills(loaded.skills);
  const handler = new SkillProtocolHandler();
  const resources = {};
  for (const skill of loaded.skills) {
    const name = skill.name;
    const invocation = parseSkillInvocation("/skill:" + name);
    const root = await handler.resolve(parseInternalUrl("skill://" + name));
    const packaged = skill._source?.origin === "omp" || skill._source?.origin === "plugin-dir";
    const nested = packaged && name === "deepwright"
      ? await handler.resolve(parseInternalUrl("skill://deepwright/references/helpers.md"))
      : null;
    resources[name] = {
      slash: invocation?.name === name,
      slashCommand: getSkillSlashCommandName(skill),
      readable: typeof root.content === "string" && root.content.length > 0,
      nestedReadable: nested ? typeof nested.content === "string" && nested.content.length > 0 : undefined,
      hide: skill.hide === true,
      source: skill.source,
      origin: skill._source?.origin ?? null,
      filePath: skill.filePath,
    };
  }

  let listing = "";
  if (mode === "inspect-marketplace" || mode === "inspect-plugin-dir") {
    const rendered = await buildSystemPrompt({
      cwd,
      skills: loaded.skills,
      personality: "none",
      includeWorkspaceTree: false,
      contextFiles: [],
      toolNames: ["read", "bash"],
    });
    listing = rendered.systemPrompt.join("\n");
  }

  process.stdout.write(JSON.stringify({
    home,
    cwd,
    mode,
    names: loaded.skills.map(skill => skill.name).sort(),
    capabilityNames: capability.items.map(skill => skill.name).sort(),
    capabilityAll: capability.all.map(skill => ({
      name: skill.name,
      provider: skill._source?.provider ?? null,
      origin: skill._source?.origin ?? null,
      shadowed: skill._shadowed === true,
    })),
    warnings: loaded.warnings,
    listing,
    listed: listedSkillNames(listing),
    resources,
    injected: mode === "inspect-plugin-dir",
  }) + "\n");
}

async function main() {
  const ompPackage = process.argv[2];
  assert(ompPackage, "Pass the installed Oh My Pi package directory (with src/) as the first argument; run with Bun.");
  const ompManifest = await json(path.join(ompPackage, "package.json"));
  assert.equal(ompManifest.name, "@oh-my-pi/pi-coding-agent");
  assert.equal(ompManifest.version, REQUIRED_OMP_VERSION, "Oh My Pi package version");
  const ompCli = path.join(ompPackage, "src/cli.ts");
  const expectedSkills = (await readdir(path.join(sourcePlugin, "skills"))).sort();
  assert.equal(expectedSkills.length, 47, "canonical skill count");
  const expectedPackage = await inventory(sourcePlugin);

  const realHome = homedir();
  const temp = await mkdtemp(path.join(tmpdir(), "deepwright-hosts-"));
  const isolatedHome = path.join(temp, "home");
  const claudeHome = path.join(temp, "claude-home");
  const pluginDirHome = path.join(temp, "plugin-dir-home");
  const cwd = path.join(temp, "project");
  const scratch = path.join(temp, "marketplace");
  const markerName = "OMP_LIFECYCLE_MARKER.txt";
  const markerBody = "scratch-upgrade-marker";
  await mkdir(isolatedHome);
  await mkdir(claudeHome);
  await mkdir(pluginDirHome);
  await mkdir(cwd);
  await copyMarketplace(scratch);
  const beforeUser = await snapshotRegistries(realHome);

  try {
    const isolationEnv = isolatedHostEnv(isolatedHome);
    for (const key of STATE_ENV_KEYS) assert.equal(isolationEnv[key], undefined, key);
    assert.equal(isolationEnv.HOME, isolatedHome);
    assert.notEqual(isolatedHome, realHome);
    const canary = "deepwright-hosts-isolation-canary";
    const canaryPath = path.join(isolatedHome, canary);
    run(process.execPath, ["-e", "import { writeFileSync } from 'node:fs'; import { homedir } from 'node:os'; writeFileSync(process.env.DEEPWRIGHT_CANARY, homedir());"], {
      cwd,
      env: isolatedHostEnv(isolatedHome, { DEEPWRIGHT_CANARY: canaryPath }),
    });
    assert.equal(await readFile(canaryPath, "utf8"), isolatedHome);
    await assert.rejects(lstat(path.join(realHome, canary)), { code: "ENOENT" });
    assert.deepEqual(await snapshotRegistries(realHome), beforeUser, "isolation proof must not touch the user home");

    const claudeEnv = isolatedHostEnv(claudeHome, { CLAUDE_CONFIG_DIR: path.join(claudeHome, ".claude") });
    const claude = args => run("claude", args, { cwd, env: claudeEnv, timeout: 60_000 });
    claude(["plugin", "validate", sourcePlugin]);
    claude(["plugin", "validate", repo]);
    claude(["plugin", "marketplace", "add", repo]);
    claude(["plugin", "install", "deepwright@deepwright", "--scope", "user"]);
    const claudeRegistry = await json(path.join(claudeHome, ".claude/plugins/installed_plugins.json"));
    const claudeInstalled = claudeRegistry.plugins["deepwright@deepwright"];
    assert.equal(claudeInstalled.length, 1);
    assertSamePackage(expectedPackage, await inventory(claudeInstalled[0].installPath), "Claude Code installed package");
    console.log(`Claude Code: marketplace + plugin validation and isolated installation passed (${expectedSkills.length} skills and supporting files).`);

    const ompEnv = isolatedHostEnv(isolatedHome);
    const omp = args => run(process.execPath, [ompCli, ...args], { cwd, env: ompEnv, timeout: 120_000 });
    const versionLine = omp(["--version"]).trim();
    assert.match(versionLine, new RegExp("(^|/)18\\.1\\.16$"));

    const added = omp(["plugin", "marketplace", "add", scratch]);
    assert.match(added, /Added marketplace/i);
    const marketplaces = omp(["plugin", "marketplace", "list"]);
    assert.match(marketplaces, /deepwright/);
    const discovered = omp(["plugin", "discover", "deepwright"]);
    assert.match(discovered, /deepwright/);
    const installedOut = omp(["plugin", "install", "deepwright@deepwright", "--scope", "user"]);
    assert.match(installedOut, /Installed deepwright/i);
    const listed = parseJsonPayload(omp(["plugin", "list", "--json"]));
    const marketplacePlugins = listed.marketplace ?? [];
    assert.equal(marketplacePlugins.length, 1);
    assert.equal(marketplacePlugins[0].id, "deepwright@deepwright");
    const ompRegistry = await json(path.join(isolatedHome, ".omp/plugins/installed_plugins.json"));
    const ompEntries = ompRegistry.plugins["deepwright@deepwright"];
    assert.equal(ompEntries.length, 1);
    const installPath = ompEntries[0].installPath;
    assert(installPath.startsWith(isolatedHome), "marketplace install must land under isolated HOME");
    assertSamePackage(expectedPackage, await inventory(installPath), "Oh My Pi marketplace installed package");
    assert.equal(installPath.includes("node_modules"), false);

    await writeFile(path.join(scratch, "plugins/deepwright", markerName), markerBody);
    const scratchManifest = await json(path.join(scratch, "plugins/deepwright/.claude-plugin/plugin.json"));
    scratchManifest.version = "1.3.1";
    await writeFile(path.join(scratch, "plugins/deepwright/.claude-plugin/plugin.json"), JSON.stringify(scratchManifest, null, 2) + "\n");
    const scratchCatalog = await json(path.join(scratch, ".claude-plugin/marketplace.json"));
    scratchCatalog.plugins[0].version = "1.3.1";
    await writeFile(path.join(scratch, ".claude-plugin/marketplace.json"), JSON.stringify(scratchCatalog, null, 2) + "\n");
    omp(["plugin", "marketplace", "update", "deepwright"]);
    let upgraded = "";
    let upgradePath = "upgrade";
    try {
      upgraded = omp(["plugin", "upgrade", "deepwright@deepwright", "--scope", "user"]);
    } catch {
      upgradePath = "install --force";
      upgraded = omp(["plugin", "install", "deepwright@deepwright", "--force", "--scope", "user"]);
    }
    assert.match(upgraded, /Upgraded|Installed/i, "reinstall or upgrade (" + upgradePath + ")");
    const upgradedRegistry = await json(path.join(isolatedHome, ".omp/plugins/installed_plugins.json"));
    const upgradedPath = upgradedRegistry.plugins["deepwright@deepwright"][0].installPath;
    assert.equal(await readFile(path.join(upgradedPath, markerName), "utf8"), markerBody);
    await assert.rejects(lstat(path.join(sourcePlugin, markerName)), { code: "ENOENT" });
    console.log(`Oh My Pi CLI: marketplace add/discover/install/list and reinstall-or-upgrade passed (${expectedSkills.length} skills).`);

    const marketplaceInspect = await inspectHosts("inspect-marketplace", { ompPackage, home: isolatedHome, cwd });
    assert.equal(marketplaceInspect.home, isolatedHome);
    assert.equal(marketplaceInspect.injected, false);
    assert.deepEqual(marketplaceInspect.names, expectedSkills);
    assert.deepEqual(marketplaceInspect.capabilityNames, expectedSkills);
    assert.equal(marketplaceInspect.warnings.filter(warning => /collision/i.test(warning.message ?? warning)).length, 0);
    for (const name of expectedSkills) {
      const resource = marketplaceInspect.resources[name];
      assert(resource, name);
      assert.equal(resource.slash, true, name + " slash-callable");
      assert.equal(resource.slashCommand, "skill:" + name);
      assert.equal(resource.readable, true, name + " skill:// readable");
      assert.equal(resource.origin, "omp", name + " marketplace origin");
      assert.equal(resource.source, "claude-plugins:user");
      assert(resource.filePath.startsWith(upgradedPath));
    }
    assert.equal(marketplaceInspect.resources.deepwright.nestedReadable, true);
    const visible = expectedSkills.filter(name => marketplaceInspect.resources[name].hide !== true).sort();
    const listedPackage = marketplaceInspect.listed.filter(name => expectedSkills.includes(name)).sort();
    assert.deepEqual(listedPackage, visible);
    assert.deepEqual(listedPackage, ["deepwright"], "native <skills> listing must show only the deepwright router");
    assert.equal(marketplaceInspect.resources.deepwright.hide, false);

    const disabledInspect = await inspectHosts("inspect-disabled", { ompPackage, home: isolatedHome, cwd });
    assert.deepEqual(disabledInspect.names.filter(name => expectedSkills.includes(name)), []);
    assert.equal(Object.keys(disabledInspect.resources).filter(name => expectedSkills.includes(name)).length, 0);

    const decoyDir = path.join(isolatedHome, ".omp/agent/skills/deepwright");
    await mkdir(decoyDir, { recursive: true });
    await writeFile(path.join(decoyDir, "SKILL.md"), "---\nname: deepwright\ndescription: collision-decoy\n---\n\n# decoy\n");
    const collisionInspect = await inspectHosts("inspect-collision", { ompPackage, home: isolatedHome, cwd });
    assert.equal(collisionInspect.resources.deepwright?.hide, false);
    assert.match(collisionInspect.resources.deepwright.filePath, /[/\\]\.omp[/\\]agent[/\\]skills[/\\]deepwright[/\\]SKILL\.md$/);
    assert.equal(collisionInspect.resources.deepwright.source, "native:user");
    assert.deepEqual(collisionInspect.names, expectedSkills);
    const colliding = collisionInspect.capabilityAll.filter(skill => skill.name === "deepwright");
    assert(colliding.length >= 2, "configured collision must load the same name from more than one provider");
    assert(colliding.some(skill => skill.provider === "native"));
    assert(colliding.some(skill => skill.provider === "claude-plugins"));
    await rm(path.join(isolatedHome, ".omp/agent/skills"), { recursive: true, force: true });

    const pluginDirInspect = await inspectHosts("inspect-plugin-dir", {
      ompPackage,
      home: pluginDirHome,
      cwd,
      pluginDir: sourcePlugin,
    });
    assert.equal(pluginDirInspect.injected, true);
    assert.deepEqual(pluginDirInspect.names, expectedSkills);
    assert.equal(pluginDirInspect.resources.deepwright.origin, "plugin-dir");
    assert.deepEqual(pluginDirInspect.listed.filter(name => expectedSkills.includes(name)), ["deepwright"]);
    await assert.rejects(lstat(path.join(pluginDirHome, ".omp/plugins/installed_plugins.json")), { code: "ENOENT" });
    assert.notEqual(pluginDirInspect.resources.deepwright.origin, "omp");

    omp(["plugin", "uninstall", "deepwright@deepwright", "--scope", "user"]);
    const afterList = parseJsonPayload(omp(["plugin", "list", "--json"]));
    assert.equal((afterList.marketplace ?? []).length, 0);
    const afterRegistry = await json(path.join(isolatedHome, ".omp/plugins/installed_plugins.json"));
    assert.equal(afterRegistry.plugins?.["deepwright@deepwright"], undefined);
    await assert.rejects(lstat(upgradedPath), { code: "ENOENT" });
    const removedInspect = await inspectHosts("inspect-marketplace", { ompPackage, home: isolatedHome, cwd });
    assert.deepEqual(removedInspect.names.filter(name => expectedSkills.includes(name)), []);
    omp(["plugin", "marketplace", "remove", "deepwright"]);
    assert.match(omp(["plugin", "marketplace", "list"]), /No marketplaces configured/i);
    console.log("Oh My Pi: marketplace discovery, native listing, counterexamples, plugin-dir injection, and uninstall passed.");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  assert.deepEqual(await snapshotRegistries(realHome), beforeUser, "user auth/cache/plugin registries must be unchanged");
}

if (process.env.DEEPWRIGHT_HOSTS_MODE) {
  await reportInspect();
} else if (await isMain(import.meta.url)) {
  await main();
}
