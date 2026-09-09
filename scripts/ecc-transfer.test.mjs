import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setImmediate as nextTurn } from "node:timers/promises";
import { saveAndObserve } from "../evals/ecc-transfer/fixtures/response-order/save.mjs";
import { backfill } from "../evals/ecc-transfer/fixtures/migration-overlap/backfill.mjs";

const collection = new URL("../evals/ecc-transfer/", import.meta.url);
const buildSource = fileURLToPath(new URL("fixtures/build-report/", collection));
const execute = (cwd, args) => {
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
};

async function buildCopy(t) {
  const parent = await mkdtemp(join(tmpdir(), "deepwright-build [space]-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const project = join(parent, "notes");
  await cp(buildSource, project, { recursive: true });
  return project;
}

test("build fixture fails on the missing export while its public API tests pass", () => {
  const build = execute(buildSource, ["build.mjs"]);
  assert.equal(build.status, 1);
  assert.match(build.stderr, /does not provide an export named 'renderHeading'/);
  const tests = execute(buildSource, ["--test", "render.test.mjs"]);
  assert.equal(tests.status, 0, tests.stdout + tests.stderr);
});

test("a successful output filter can mask the real build process failure", () => {
  const wrapper = spawnSync("sh", ["-c", '"$NODE_BIN" "$BUILD_FILE" 2>&1 | tail -n 1'], {
    cwd: buildSource, encoding: "utf8", timeout: 5000,
    env: { ...process.env, NODE_BIN: process.execPath, BUILD_FILE: join(buildSource, "build.mjs") },
  });
  assert.ifError(wrapper.error);
  assert.equal(wrapper.signal, null);
  assert.equal(wrapper.status, 0);
  assert.equal(execute(buildSource, ["build.mjs"]).status, 1);
});

for (const [name, fix] of [
  ["correct imported name", (s) => s.replaceAll("renderHeading", "renderTitle")],
  ["alias the existing public export", (s) => s.replace("{ renderHeading }", "{ renderTitle as renderHeading }")],
]) {
  test(`build control accepts ${name} without changing the public API or lockfile`, async (t) => {
    const project = await buildCopy(t);
    const preserved = await Promise.all(["render.mjs", "render.test.mjs", "package-lock.json"].map(async (file) => [file, await readFile(join(project, file))]));
    await writeFile(join(project, "build.mjs"), fix(await readFile(join(project, "build.mjs"), "utf8")));
    const build = execute(project, ["build.mjs"]);
    assert.equal(build.status, 0, build.stderr);
    assert.equal(build.stdout, "# Notes\n");
    assert.equal(execute(project, ["--test", "render.test.mjs"]).status, 0);
    for (const [file, bytes] of preserved) assert.deepEqual(await readFile(join(project, file)), bytes);
  });
}

test("exit zero without the required artifact does not satisfy the build contract", async (t) => {
  const project = await buildCopy(t);
  await writeFile(join(project, "build.mjs"), "process.exitCode = 0;\n");
  const result = execute(project, ["build.mjs"]);
  assert.equal(result.status, 0);
  assert.notEqual(result.stdout, "# Notes\n");
});

// Controls remain observer-side. This models event delivery, not a browser.
function makePage({ immediate = true, status = 201 } = {}) {
  const events = new EventEmitter();
  const response = { method: "POST", path: "/save", status };
  let clicks = 0;
  return {
    response,
    get clicks() { return clicks; },
    get listeners() { return events.listenerCount("response"); },
    emit(value = response) { events.emit("response", value); },
    async clickSave() { clicks++; if (immediate) events.emit("response", response); },
    waitForResponse(predicate, { signal }) {
      return new Promise((resolve, reject) => {
        const cleanup = () => { events.off("response", onResponse); signal.removeEventListener("abort", onAbort); };
        const onAbort = () => { cleanup(); reject(signal.reason); };
        const onResponse = (value) => {
          try { if (predicate(value)) { cleanup(); resolve(value); } }
          catch (error) { cleanup(); reject(error); }
        };
        if (signal.aborted) { reject(signal.reason); return; }
        signal.addEventListener("abort", onAbort, { once: true });
        events.on("response", onResponse);
      });
    },
  };
}
async function registeredFirst(page, signal) {
  const response = page.waitForResponse((r) => r.method === "POST" && r.path === "/save", { signal });
  await page.clickSave();
  return response;
}

test("the committed save flow misses immediate completion and preserves abort", async () => {
  const page = makePage();
  const controller = new AbortController();
  const result = saveAndObserve(page, controller.signal);
  const rejected = assert.rejects(result, { name: "AbortError" });
  await nextTurn();
  assert.equal(page.clicks, 1);
  assert.equal(page.listeners, 1);
  controller.abort();
  await rejected;
  assert.equal(page.listeners, 0);
});

for (const status of [201, 500]) {
  test(`registering first observes immediate response ${status} without inventing success`, async () => {
    const page = makePage({ status });
    const controller = new AbortController();
    assert.equal(await registeredFirst(page, controller.signal), page.response);
    assert.equal(page.clicks, 1);
    assert.equal(page.listeners, 0);
  });
}

for (const [name, flow] of [["baseline", saveAndObserve], ["corrected control", registeredFirst]]) {
  test(`${name} retains delayed completion and rejects unrelated response matches`, async () => {
    const page = makePage({ immediate: false });
    const controller = new AbortController();
    let settled = false;
    const result = flow(page, controller.signal).then((value) => { settled = true; return value; });
    await nextTurn();
    page.emit({ method: "GET", path: "/save", status: 200 });
    page.emit({ method: "POST", path: "/other", status: 201 });
    await nextTurn();
    assert.equal(settled, false);
    page.emit();
    assert.equal(await result, page.response);
    assert.equal(page.listeners, 0);
  });
}

test("a failed request remains a failed response after delayed completion", async () => {
  const page = makePage({ immediate: false, status: 500 });
  const controller = new AbortController();
  const result = registeredFirst(page, controller.signal);
  await nextTurn();
  page.emit();
  assert.equal((await result).status, 500);
});

test("the corrected waiter releases its listener on abort", async () => {
  const page = makePage({ immediate: false });
  const controller = new AbortController();
  const rejected = assert.rejects(registeredFirst(page, controller.signal), { name: "AbortError" });
  controller.abort();
  await rejected;
  assert.equal(page.listeners, 0);
});

function makeStore({ overlap = false, failAt = null } = {}) {
  const rows = new Map([
    [1, { id: 1, name: "Old", displayName: null, version: 1 }],
    [2, { id: 2, name: "Second", displayName: null, version: 1 }],
  ]);
  let writeCount = 0;
  let overlapped = false;
  const beforeWrite = () => { if (++writeCount === failAt) throw new Error("storage unavailable"); };
  const apply = (row, patch) => { Object.assign(row, patch); row.version++; };
  return {
    snapshot: () => structuredClone([...rows.values()]),
    async pending() {
      const result = structuredClone([...rows.values()].filter((r) => r.displayName === null));
      if (overlap && !overlapped) {
        overlapped = true;
        apply(rows.get(1), { name: "New", displayName: "New" });
      }
      return result;
    },
    async write(id, patch) { beforeWrite(); apply(rows.get(id), patch); },
    async writeIfVersion(id, expectedVersion, patch) {
      beforeWrite();
      const row = rows.get(id);
      if (row.version !== expectedVersion) return false;
      apply(row, patch);
      return true;
    },
    async copyCurrentNameIfMissing(id) {
      beforeWrite();
      const row = rows.get(id);
      if (row.displayName !== null) return false;
      apply(row, { displayName: row.name });
      return true;
    },
  };
}
async function versionedBackfill(store) {
  for (const row of await store.pending()) await store.writeIfVersion(row.id, row.version, { displayName: row.name });
}
async function atomicBackfill(store) {
  for (const row of await store.pending()) await store.copyCurrentNameIfMissing(row.id);
}

test("the committed backfill overwrites the result of a newer live edit", async () => {
  const store = makeStore({ overlap: true });
  await backfill(store);
  const [row] = store.snapshot();
  assert.equal(row.name, "New");
  assert.equal(row.displayName, "Old");
});

for (const [name, migrate] of [["version condition", versionedBackfill], ["atomic copy-if-missing", atomicBackfill]]) {
  test(`migration control accepts ${name} under overlap and repeat execution`, async () => {
    const store = makeStore({ overlap: true });
    await migrate(store);
    const before = store.snapshot();
    assert.deepEqual(before.map((r) => [r.name, r.displayName]), [["New", "New"], ["Second", "Second"]]);
    await migrate(store);
    assert.deepEqual(store.snapshot(), before);
  });
  test(`${name} preserves partial completion and resumes after a failed write`, async () => {
    const store = makeStore({ failAt: 2 });
    await assert.rejects(migrate(store), /storage unavailable/);
    const [completed, pending] = store.snapshot();
    assert.equal(completed.displayName, "Old");
    assert.equal(pending.displayName, null);
    await migrate(store);
    assert.deepEqual(store.snapshot()[0], completed);
    assert.equal(store.snapshot()[1].displayName, "Second");
  });
}

test("the supplemental case inventory is complete and keeps observer material out of projects", async () => {
  const prompts = JSON.parse(await readFile(new URL("prompts.json", collection), "utf8"));
  const expected = JSON.parse(await readFile(new URL("expected.json", collection), "utf8"));
  const ids = prompts.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 8);
  assert.deepEqual(expected.map((e) => e.id).sort(), [...ids].sort());
  for (const e of expected) {
    assert.ok(e.requiredChecks.length > 0);
    assert.equal(new Set(e.requiredChecks).size, e.requiredChecks.length);
    assert.ok(e.requiredChecks.every((v) => typeof v === "string" && v.length > 0));
  }
  for (const p of prompts) {
    assert.ok(typeof p.prompt === "string" && p.prompt.length > 0);
    if (p.project === null) continue;
    assert.match(p.project, /^[a-z]+(?:-[a-z]+)*$/);
    const files = await readdir(new URL(`fixtures/${p.project}/`, collection));
    assert.ok(files.includes("README.md"));
    assert.ok(files.every((f) => !/observer|grader|expected|receipt|rubric/i.test(f)));
  }
});
