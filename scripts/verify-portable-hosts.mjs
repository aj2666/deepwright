#!/usr/bin/env bun
// Real host packaging/discovery smoke, without model calls or persistent installs.
// bun scripts/verify-portable-hosts.mjs /path/to/@oh-my-pi/pi-coding-agent
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repo, "plugins/deepwright");
const ompPackage = process.argv[2];
assert(ompPackage, "Pass the installed Oh My Pi package directory (with src/) as the first argument; run with Bun.");
const temp = await mkdtemp(path.join(tmpdir(), "deepwright-hosts-"));
const expected = (await readdir(path.join(source, "skills"))).sort();
const json = async file => JSON.parse(await readFile(file, "utf8"));
const ompImport = relative => import(pathToFileURL(path.resolve(ompPackage, "src", relative)).href);

async function checkInstalled(root) {
  assert.deepEqual((await readdir(path.join(root, "skills"))).sort(), expected);
  // Verify nested references/helpers too, not merely directory names.
  async function compare(relative = "skills") {
    for (const entry of await readdir(path.join(source, relative), { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await compare(child);
      else if (entry.isFile()) assert.deepEqual(await readFile(path.join(root, child)), await readFile(path.join(source, child)), child);
    }
  }
  await compare();
}

try {
  const cwd = path.join(temp, "project");
  await mkdir(cwd);
  const claudeConfig = path.join(temp, "claude");
  const claude = args => execFileSync("claude", args, {
    cwd, env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfig },
    encoding: "utf8", timeout: 60_000,
  });
  claude(["plugin", "validate", source]);
  claude(["plugin", "validate", repo]);
  claude(["plugin", "marketplace", "add", repo]);
  claude(["plugin", "install", "deepwright@deepwright", "--scope", "user"]);
  const registry = await json(path.join(claudeConfig, "plugins/installed_plugins.json"));
  const installed = registry.plugins["deepwright@deepwright"];
  assert.equal(installed.length, 1);
  await checkInstalled(installed[0].installPath);
  console.log(`Claude Code: marketplace + plugin validation and isolated installation passed (${expected.length} skills and supporting files).`);

  const { MarketplaceManager } = await ompImport("extensibility/plugins/marketplace/manager.ts");
  const manager = new MarketplaceManager({
    marketplacesRegistryPath: path.join(temp, "omp/marketplaces.json"),
    installedRegistryPath: path.join(temp, "omp/installed_plugins.json"),
    marketplacesCacheDir: path.join(temp, "omp/marketplaces"),
    pluginsCacheDir: path.join(temp, "omp/cache"),
  });
  await manager.addMarketplace(repo);
  const entry = await manager.installPlugin("deepwright", "deepwright");
  await checkInstalled(entry.installPath);
  await ompImport("discovery/claude-plugins.ts");
  const { injectPluginDirRoots } = await ompImport("discovery/helpers.ts");
  const { skillCapability } = await ompImport("capability/skill.ts");
  await injectPluginDirRoots(temp, [entry.installPath], cwd);
  const provider = skillCapability.providers.find(provider => provider.id === "claude-plugins");
  assert(provider, "Oh My Pi Claude-compatible discovery provider is required");
  const result = await provider.load({ home: temp, cwd, repoRoot: null });
  assert.deepEqual(result.warnings ?? [], []);
  assert.deepEqual(result.items.map(skill => skill.name).sort(), expected);
  for (const skill of result.items) {
    assert.equal(skill.path, path.join(entry.installPath, "skills", skill.name, "SKILL.md"));
    assert(skill.content.length > 0);
  }
  console.log(`Oh My Pi: real marketplace installer and skill discovery passed (${expected.length} skills, no warnings).`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
