import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepare, snapshot } from "./prepare-skill-eval.mjs";

const base = fileURLToPath(new URL("../evals/fixtures/cache/", import.meta.url));
const overlay = fileURLToPath(new URL("../evals/fixtures/cache-update/", import.meta.url));
const checker = fileURLToPath(new URL("../evals/checks/cache-update.mjs", import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
delete env.NODE_TEST_CONTEXT;
Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" });
const expectedCheckCount = 9;
const freshnessCheck = "successful PUT leaves fresh GETs after a read during its pending save";

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), "deepwright-cache-update-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function stage(t) {
  const directory = await temporary(t);
  const project = join(directory, "project");
  await cp(base, project, { recursive: true });
  await cp(overlay, project, { recursive: true });
  return { directory, project };
}

function command(cwd, executable, args, status) {
  const result = spawnSync(executable, args, {
    cwd, env, encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, status, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.ok(result.stdout.trim(), "The command must produce observable evidence");
  return result.stdout;
}

function localTests(project, names, count) {
  const output = command(project, process.execPath, ["--test", "--test-reporter=tap", ...names], 0);
  assert.match(output, new RegExp(`^# pass ${count}$`, "m"));
  assert.match(output, /^# fail 0$/m);
}

function acceptance(project, expectedStatus) {
  const report = JSON.parse(command(project, process.execPath, [checker, project], expectedStatus));
  assert.equal(report.total, expectedCheckCount);
  assert.equal(report.results.length, expectedCheckCount);
  assert.equal(new Set(report.results.map((entry) => entry.name)).size, expectedCheckCount);
  assert.ok(report.results.every((entry) => typeof entry.pass === "boolean"));
  assert.equal(report.ok, report.results.every((entry) => entry.pass));
  return report;
}

const failures = (report) => report.results.filter((entry) => !entry.pass).map((entry) => entry.name);

// Controls exercise the external observer. They are never staged for a candidate.
const invalidateAfterSave = `export function createItemService({ store, cache }) {
  return {
    async getById(id) {
      const cached = cache.get(id);
      if (cached !== undefined) return { item: cached, cacheStatus: "HIT" };
      const item = await store.findById(id);
      if (item !== undefined) cache.set(id, item);
      return { item, cacheStatus: "MISS" };
    },
    async updateTitle(id, title) {
      const item = await store.findById(id);
      if (item === undefined) return undefined;
      const saved = await store.save({ ...item, title });
      cache.delete(id);
      return saved;
    },
  };
}\n`;

const writeThrough = `export function createItemService({ store, cache }) {
  async function load(id) {
    const hit = cache.get(id);
    if (hit !== undefined) return { item: hit, cacheStatus: "HIT" };
    const item = await store.findById(id);
    if (item !== undefined) cache.set(id, item);
    return { item, cacheStatus: "MISS" };
  }
  async function updateTitle(id, title) {
    const item = await store.findById(id);
    if (item === undefined) return undefined;
    const saved = await store.save({ ...item, title });
    cache.set(id, saved);
    return saved;
  }
  return { getById: load, updateTitle };
}\n`;

test("the cache base remains unchanged and the update overlay passes its ordinary local checks", async (t) => {
  const baseBefore = await snapshot(base);
  const overlayBefore = await snapshot(overlay);
  localTests(base, ["app.test.mjs"], 3);
  const { project } = await stage(t);
  for (const filename of ["server.mjs", "app.test.mjs"]) {
    assert.deepEqual(await readFile(join(project, filename)), await readFile(join(base, filename)));
  }
  localTests(project, ["app.test.mjs", "update.test.mjs"], 4);
  const before = await snapshot(project);
  const report = acceptance(project, 1);
  assert.deepEqual(failures(report), [freshnessCheck]);
  assert.match(report.results.find((entry) => !entry.pass).error, /completed PUT must not leave a stale cached title/);
  assert.deepEqual(await snapshot(project), before);
  assert.deepEqual(await snapshot(base), baseBefore);
  assert.deepEqual(await snapshot(overlay), overlayBefore);
  t.diagnostic("Existing lookup checks: 3/3; overlay local checks: 4/4; independent HTTP observer: 8/9 with only post-save cache freshness failing.");
});

for (const [name, source] of [["invalidation after save", invalidateAfterSave], ["write-through after save", writeThrough]]) {
  test(`HTTP observer accepts ${name} without requiring one implementation structure`, async (t) => {
    const { project } = await stage(t);
    await writeFile(join(project, "item-service.mjs"), source);
    const before = await snapshot(project);
    assert.equal(acceptance(project, 0).ok, true);
    localTests(project, ["app.test.mjs", "update.test.mjs"], 4);
    assert.deepEqual(await snapshot(project), before);
  });
}

test("HTTP observer rejects saving without refreshing the cache", async (t) => {
  const { project } = await stage(t);
  const mutant = invalidateAfterSave.replace("      cache.delete(id);\n", "");
  assert.notEqual(mutant, invalidateAfterSave);
  await writeFile(join(project, "item-service.mjs"), mutant);
  assert.deepEqual(failures(acceptance(project, 1)), [
    "ordinary successful updates persist exact titles and preserve unrelated items", freshnessCheck,
  ]);
});

test("HTTP observer rejects reporting a rejected save as a successful cached update", async (t) => {
  const { project } = await stage(t);
  const mutant = writeThrough.replace(
    "const saved = await store.save({ ...item, title });",
    "const saved = await store.save({ ...item, title }).catch(() => ({ ...item, title }));",
  );
  assert.notEqual(mutant, writeThrough);
  await writeFile(join(project, "item-service.mjs"), mutant);
  assert.deepEqual(failures(acceptance(project, 1)), [
    "failed saves return failure without persisting or caching the rejected title",
  ]);
});

test("preparation preserves the existing cache baseline and leaves the update overlay uncommitted", async (t) => {
  const root = await temporary(t);
  const project = join(root, "prepared");
  const baseBefore = await snapshot(base);
  const overlayBefore = await snapshot(overlay);
  const prepared = await prepare("bug-cache-update", project);
  assert.equal(prepared.id, "bug-cache-update");
  assert.equal(prepared.baseSha256, baseBefore.sha256);
  assert.notEqual(prepared.workingSha256, prepared.baseSha256);
  assert.equal(command(project, "git", ["log", "--format=%s"], 0).trim(), "Initial project snapshot");
  for (const filename of ["README.md", "cache.mjs", "store.mjs", "item-service.mjs", "router.mjs"]) {
    assert.equal(command(project, "git", ["show", `HEAD:${filename}`], 0), await readFile(join(base, filename), "utf8"));
    assert.deepEqual(await readFile(join(project, filename)), await readFile(join(overlay, filename)));
  }
  const changed = command(project, "git", ["status", "--short", "--untracked-files=all"], 0).trimEnd().split("\n");
  assert.deepEqual(changed, [
    " M README.md", " M cache.mjs", " M item-service.mjs", " M router.mjs", " M store.mjs", "?? update.test.mjs",
  ]);
  assert.deepEqual(prepared.files.map(({ path }) => path).sort(), [
    "README.md", "app.test.mjs", "cache.mjs", "item-service.mjs", "router.mjs", "server.mjs", "store.mjs", "update.test.mjs",
  ]);
  assert.deepEqual(await snapshot(base), baseBefore);
  assert.deepEqual(await snapshot(overlay), overlayBefore);
});

test("HTTP observer rejects an omitted project instead of checking an unrelated directory", () => {
  const result = spawnSync(process.execPath, [checker], { env, encoding: "utf8", timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Usage: node evals\/checks\/cache-update.mjs/);
});
