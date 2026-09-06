#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSuite } from "./score-skill-evals.mjs";

const root = fileURLToPath(new URL("../evals/fixtures/", import.meta.url));
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 1024;
const sha256 = (body) => createHash("sha256").update(body).digest("hex");
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function relativePath(value) {
  requireValue(typeof value === "string" && /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(value), "invalid fixture directory");
}

async function contents(directory, { snapshot = false } = {}) {
  const canonical = await realpath(directory);
  requireValue((await lstat(directory)).isDirectory(), "fixture must be a real directory");
  const files = [];
  let total = 0;
  async function walk(current, prefix) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (snapshot && entry.name === ".git" && prefix === "") continue;
      requireValue(entry.name !== ".git", "source fixtures must not contain Git metadata");
      requireValue(!entry.isSymbolicLink(), "fixture/snapshot contains a symlink");
      const path = join(current, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path, name);
      else {
        requireValue(entry.isFile(), "fixture/snapshot requires regular files");
        const stat = await lstat(path);
        total += stat.size;
        requireValue(total <= MAX_BYTES && files.length < MAX_FILES, "fixture/snapshot exceeds its file or byte limit");
        const body = await readFile(path);
        requireValue(body.length === stat.size, "fixture/snapshot changed while being read");
        files.push({ path: name, body, sha256: sha256(body) });
      }
    }
  }
  await walk(canonical, "");
  return files;
}

function fingerprint(files) {
  return sha256(JSON.stringify(files.map(({ path, sha256 }) => ({ path, sha256 })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
}

export async function snapshot(directory) {
  const files = await contents(directory, { snapshot: true });
  return { schemaVersion: 1, sha256: fingerprint(files), files: files.map(({ path, sha256 }) => ({ path, sha256 })) };
}

async function fixtureFiles(name) {
  if (name === null) return [];
  relativePath(name);
  const base = await realpath(root);
  const directory = join(base, name);
  const canonical = await realpath(directory);
  const local = relative(base, canonical);
  requireValue(local !== ".." && !local.startsWith(".." + sep) && !isAbsolute(local), "fixture directory leaves its root");
  const files = await contents(directory);
  requireValue(files.length > 0, "a declared fixture cannot be empty");
  return files;
}

export async function loadFixtures() {
  const { prompts } = await loadSuite();
  const fixtures = JSON.parse(await readFile(new URL("../evals/fixtures.json", import.meta.url), "utf8"));
  requireValue(Array.isArray(fixtures) && fixtures.length === prompts.length, "every evaluation case needs exactly one fixture declaration");
  const ids = new Set(prompts.map(({ id }) => id));
  const seen = new Set();
  for (const fixture of fixtures) {
    requireValue(fixture !== null && typeof fixture === "object" && Object.keys(fixture).length === 3 &&
      ["id", "project", "overlay"].every((key) => Object.hasOwn(fixture, key)), "invalid fixture declaration");
    requireValue(ids.has(fixture.id) && !seen.has(fixture.id), "unknown or duplicate fixture case");
    seen.add(fixture.id);
    if (fixture.project !== null) relativePath(fixture.project);
    if (fixture.overlay !== null) relativePath(fixture.overlay);
    requireValue(fixture.overlay === null || fixture.project !== null, "an overlay requires a base project");
  }
  return { prompts, fixtures };
}

function git(directory, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_AUTHOR_NAME: "Evaluation Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Evaluation Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_AUTHOR_DATE: "2020-01-01T00:00:00+00:00", GIT_COMMITTER_DATE: "2020-01-01T00:00:00+00:00",
  });
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "core.autocrlf=false", ...args], {
    cwd: directory, env, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  requireValue(!result.error && result.status === 0, `fixture Git setup failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

async function copyFiles(directory, files) {
  for (const file of files) {
    const target = join(directory, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.body);
  }
}

export async function prepare(id, target) {
  const { prompts, fixtures } = await loadFixtures();
  const fixture = fixtures.find((one) => one.id === id);
  requireValue(fixture !== undefined, `unknown evaluation case: ${id}`);
  const base = await fixtureFiles(fixture.project);
  const overlay = await fixtureFiles(fixture.overlay);
  const directory = resolve(target);
  // The new leaf does not exist yet. Resolve its existing parent so an alias
  // cannot place a prepared project back into the reusable fixture sources.
  const canonicalTarget = join(await realpath(dirname(directory)), basename(directory));
  const fromFixtures = relative(await realpath(root), canonicalTarget);
  requireValue(fromFixtures === ".." || fromFixtures.startsWith(".." + sep) || isAbsolute(fromFixtures),
    "preparation target must be outside the fixture source directory");
  // Exclusive creation prevents a fixture from overwriting someone's checkout.
  // Parent creation is intentionally left to the caller.
  await mkdir(directory, { mode: 0o700 });
  try {
    await copyFiles(directory, base);
    let head = null;
    if (fixture.project !== null) {
      git(directory, ["init", "--quiet", "--template=", "--initial-branch=codex/fixture"]);
      git(directory, ["add", "--all"]);
      git(directory, ["commit", "--quiet", "--message", "Initial project snapshot"]);
      head = git(directory, ["rev-parse", "HEAD"]);
    }
    await copyFiles(directory, overlay);
    const current = await snapshot(directory);
    return {
      schemaVersion: 1, id, directory, prompt: prompts.find((one) => one.id === id).prompt,
      fixtureSha256: fixture.project === null ? "none" : sha256(JSON.stringify({ base: fingerprint(base), working: current.sha256 })),
      baseSha256: fixture.project === null ? null : fingerprint(base), workingSha256: current.sha256,
      head, files: current.files,
      limitation: "Prepared project and original prompt only. No agent ran, no skill activation or behavioral compliance was checked, and no observer rubric was copied into the project.",
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

const help = `Usage: node scripts/prepare-skill-eval.mjs <command>
  list                              list available case IDs
  prepare <case-id> <new-directory>  create an isolated project and print its original prompt and fingerprints
  snapshot <directory>              hash current regular files, excluding root .git metadata
prepare writes only the new directory and initializes local fixture Git history; it never runs project code or a model.
Save preparation output outside the candidate project. Give the candidate only the prompt and project, plus the selected skill installation.
Exit: 0 success, 2 invalid input or setup failure.\n`;
export async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { process.stdout.write(help); return 0; }
  try {
    let result;
    if (args.length === 1 && args[0] === "list") result = (await loadFixtures()).fixtures.map(({ id, project }) => ({ id, project }));
    else if (args.length === 3 && args[0] === "prepare") result = await prepare(args[1], args[2]);
    else if (args.length === 2 && args[0] === "snapshot") result = await snapshot(args[1]);
    else throw new Error(help);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.log(JSON.stringify({ schemaVersion: 1, ok: false, error: error.message }));
    return 2;
  }
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
