#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { loadCatalog } from "../plugins/deepwright/skills/deepwright/scripts/discovery/metadata.mjs";
import { isMain } from "./is-main.mjs";

const excludedDirectories = [".git", "node_modules"];
const maxBytes = 64 * 1024 * 1024;
const hash = (body) => createHash("sha256").update(body).digest("hex");
const limitations = [
  "The caller supplies the saved native request and response; this program does not collect or authenticate them.",
  "Catalog metadata records availability, not skill invocation or model behavior. Package installation is a separate observation.",
  "Byte comparison covers regular plugin files at verification time, excluding .git and node_modules directories. Use a frozen expected snapshot and do not modify either tree during verification.",
];

class Mismatch extends Error {}
function requireInput(condition, message) { if (!condition) throw new Error(message); }
function requireMatch(condition, message) { if (!condition) throw new Mismatch(message); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function absolute(value) { return typeof value === "string" && path.isAbsolute(value) && path.normalize(value) === value; }
function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

async function readJson(filename) {
  const info = await lstat(filename);
  requireInput(info.isFile() && info.size <= 8 * 1024 * 1024, "JSON input must be a regular file no larger than 8 MiB: " + filename);
  return JSON.parse(await readFile(filename, "utf8"));
}

// Keep the complete relative file inventory, so a matching SKILL.md cannot hide
// an old reference, policy, executable, manifest, asset, or license beside it.
async function inventory(root) {
  const files = [];
  let bytes = 0;
  async function walk(directory) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      requireInput(!entry.isSymbolicLink(), "Plugin content must not contain symlinks: " + filename);
      if (entry.isDirectory()) {
        if (!excludedDirectories.includes(entry.name)) await walk(filename);
        continue;
      }
      requireInput(entry.isFile(), "Plugin content must contain only regular files and directories: " + filename);
      const before = await lstat(filename);
      bytes += before.size;
      requireInput(before.isFile() && bytes <= maxBytes && files.length < 10000, "Plugin exceeds the regular-file, 64 MiB, or 10000-file limit");
      const body = await readFile(filename);
      const after = await lstat(filename);
      requireInput(after.isFile() && body.length === before.size && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === after.ino,
        "Plugin content changed while reading: " + filename);
      files.push({ path: path.relative(root, filename).split(path.sep).join("/"), sha256: hash(body), bytes: body.length });
    }
  }
  await walk(root);
  return { files, bytes, sha256: hash(JSON.stringify(files)) };
}

/** Check saved skills/list evidence against an independent expected package. */
export async function verifyInstalledPlugin({ request, response, cwd, pluginId, expectedPluginRoot }) {
  requireInput(absolute(cwd), "Expected cwd must be an absolute normalized path");
  requireInput(typeof pluginId === "string" && /^deepwright@[^@\s]+$/.test(pluginId), "Expected pluginId must be an explicit deepwright@marketplace identifier");
  requireInput(object(request) && request.method === "skills/list" &&
    ((typeof request.id === "string" && request.id.length > 0) || Number.isSafeInteger(request.id)), "Expected a saved skills/list request with an id");
  requireInput(object(request.params) && Array.isArray(request.params.cwds) && request.params.cwds.length === 1 && request.params.cwds[0] === cwd,
    "Saved request must name exactly the expected cwd");
  requireInput(Object.keys(request.params).every((key) => ["cwds", "forceReload"].includes(key)) &&
    (!Object.hasOwn(request.params, "forceReload") || typeof request.params.forceReload === "boolean"), "Unsupported skills/list request parameters");
  requireInput(object(response) && response.id === request.id && !Object.hasOwn(response, "error") && object(response.result),
    "Saved response must be a successful reply to the saved request id");
  const data = response.result.data;
  requireInput(Array.isArray(data) && data.length === 1 && object(data[0]) && data[0].cwd === cwd,
    "Saved response must contain exactly the expected cwd once");
  const entry = data[0];
  requireInput(Array.isArray(entry.skills) && entry.skills.length <= 10000 && Array.isArray(entry.errors), "Invalid skills/list entry");
  requireMatch(entry.errors.length === 0, "Native catalog contains skill loading errors for the expected cwd");

  const expectedRoot = await realpath(expectedPluginRoot);
  const manifest = await readJson(path.join(expectedRoot, ".codex-plugin", "plugin.json"));
  requireInput(manifest.name === "deepwright" && manifest.skills === "./skills/", "Expected package must use Deepwright's canonical skills layout");
  const expectedInventory = await inventory(expectedRoot);
  const expectedSkills = await loadCatalog(expectedRoot);
  const expectedNames = new Map(expectedSkills.map((skill) => ["deepwright:" + skill.name, skill]));
  const targetSkills = entry.skills.filter((skill) => object(skill) &&
    (skill.pluginId === pluginId || (typeof skill.name === "string" && skill.name.startsWith("deepwright:"))));
  requireMatch(targetSkills.length > 0, "Deepwright is missing from the native catalog for the expected cwd");
  const seenNames = new Set(), seenPaths = new Set();
  let loadedRoot;
  const verifiedSkills = [];
  for (const skill of targetSkills) {
    requireMatch(skill.pluginId === pluginId, "Deepwright catalog entry has a different or missing pluginId: " + skill.name);
    requireMatch(expectedNames.has(skill.name), "Unexpected Deepwright skill in the native catalog: " + skill.name);
    requireMatch(!seenNames.has(skill.name), "Duplicate Deepwright skill in the native catalog: " + skill.name);
    seenNames.add(skill.name);
    requireMatch(skill.enabled === true, "Deepwright skill is disabled: " + skill.name);
    requireInput(["user", "repo", "system", "admin"].includes(skill.scope) && absolute(skill.path), "Invalid native scope or skill path: " + skill.name);
    const expected = expectedNames.get(skill.name);
    requireMatch(skill.description === expected.description, "Native skill description differs from the expected snapshot: " + skill.name);
    const nativePath = await realpath(skill.path);
    const root = path.dirname(path.dirname(path.dirname(nativePath)));
    requireMatch(nativePath === path.join(root, "skills", expected.name, "SKILL.md"), "Native skill path does not have the expected package layout: " + skill.name);
    requireMatch(!within(expectedRoot, root) && !within(root, expectedRoot), "Native paths echo or overlap the expected source; independent copied-package verification is unavailable");
    requireMatch(!seenPaths.has(nativePath), "Duplicate native skill path: " + nativePath);
    seenPaths.add(nativePath);
    requireMatch(loadedRoot === undefined || root === loadedRoot, "Native skills come from different plugin roots");
    loadedRoot = root;
    verifiedSkills.push({ name: skill.name, path: nativePath });
  }
  const missing = [...expectedNames.keys()].filter((name) => !seenNames.has(name));
  requireMatch(missing.length === 0, "Native catalog is missing expected skills: " + missing.join(", "));

  const loadedManifest = await readJson(path.join(loadedRoot, ".codex-plugin", "plugin.json"));
  requireMatch(loadedManifest.name === manifest.name && loadedManifest.skills === manifest.skills, "Native paths do not resolve to the expected plugin manifest");
  const loadedInventory = await inventory(loadedRoot);
  const expectedFiles = new Map(expectedInventory.files.map((file) => [file.path, file.sha256]));
  const loadedFiles = new Map(loadedInventory.files.map((file) => [file.path, file.sha256]));
  const absent = [...expectedFiles.keys()].filter((file) => !loadedFiles.has(file));
  const extra = [...loadedFiles.keys()].filter((file) => !expectedFiles.has(file));
  const changed = [...expectedFiles.keys()].filter((file) => loadedFiles.has(file) && loadedFiles.get(file) !== expectedFiles.get(file));
  requireMatch(absent.length + extra.length + changed.length === 0,
    "Plugin bytes differ from expected snapshot: " + JSON.stringify({ missing: absent, extra, changed }));
  return {
    schemaVersion: 1, status: "pass", pluginId, cwd,
    expectedPluginRoot: expectedRoot, loadedPluginRoot: loadedRoot,
    catalog: "saved-enabled-entries-match", bytes: "match",
    installation: "not-observed", invocation: "not-observed",
    skillCount: verifiedSkills.length, fileCount: expectedInventory.files.length,
    byteCount: expectedInventory.bytes, sha256: expectedInventory.sha256,
    skills: verifiedSkills.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    excludedDirectories, limitations,
  };
}

async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: node scripts/verify-installed-plugin.mjs --request request.json --response response.json --cwd /absolute/project --plugin-id deepwright@deepwright --expected-plugin /absolute/snapshot/plugin\nRead-only. Checks a saved native skills/list exchange and independent copied plugin bytes.\nExits: 0 match, 1 mismatch, 2 invalid or unavailable evidence.\n" + limitations.join("\n"));
    return;
  }
  try {
    const flags = ["--request", "--response", "--cwd", "--plugin-id", "--expected-plugin"];
    const options = new Map();
    for (let i = 0; i < args.length; i += 2) {
      requireInput(flags.includes(args[i]) && !options.has(args[i]) && typeof args[i + 1] === "string", "Invalid arguments; use --help");
      options.set(args[i], args[i + 1]);
    }
    requireInput(options.size === flags.length, "All five options are required; use --help");
    const report = await verifyInstalledPlugin({
      request: await readJson(options.get("--request")), response: await readJson(options.get("--response")),
      cwd: options.get("--cwd"), pluginId: options.get("--plugin-id"), expectedPluginRoot: options.get("--expected-plugin"),
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    process.exitCode = error instanceof Mismatch ? 1 : 2;
    console.log(JSON.stringify({ schemaVersion: 1, status: process.exitCode === 1 ? "fail" : "unavailable", error: error.message, limitations }, null, 2));
  }
}

if (await isMain(import.meta.url)) await main(process.argv.slice(2));
