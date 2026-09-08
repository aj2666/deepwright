import assert from "node:assert/strict";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Observer-only: executes candidate code and opens loopback HTTP listeners.
// The host supplies isolation and an overall timeout. This is not a sandbox.
const [project, ...extra] = process.argv.slice(2);
if (!project || extra.length) throw new Error("Usage: node evals/checks/cache-update.mjs <isolated-project-directory>");
const { createAppServer } = await import(pathToFileURL(join(resolve(project), "server.mjs")).href);
const { createStore } = await import(pathToFileURL(join(resolve(project), "store.mjs")).href);
assert.equal(typeof createAppServer, "function", "createAppServer must remain public");
assert.equal(typeof createStore, "function", "createStore must remain public");

const original = { id: "book-1", title: "Cedar field guide" };
const other = { id: "book-2", title: "Harbor atlas" };
const cases = [];
function check(name, run) { cases.push({ name, run }); }

async function withServer(store, run) {
  const server = createAppServer(store ? { store } : {});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
}

async function request(base, route, options = {}) {
  const response = await fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(3000) });
  return { status: response.status, cacheStatus: response.headers.get("X-Cache"), body: await response.json() };
}

function update(base, title, id = "book-1") {
  return request(base, `/items/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
  });
}

function trackedStore() {
  const backing = createStore();
  const calls = { reads: 0, saves: 0 };
  const store = {
    async findById(id) { calls.reads++; return backing.findById(id); },
    async save(item) { calls.saves++; return backing.save(item); },
  };
  return { backing, store, calls };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

check("preserves cached GETs and uncached missing results", async () => {
  const { store, calls } = trackedStore();
  await withServer(store, async (base) => {
    for (const cacheStatus of ["MISS", "HIT"]) {
      assert.deepEqual(await request(base, "/items/book-1"), { status: 200, cacheStatus, body: original });
    }
    assert.equal(calls.reads, 1);
    for (let attempt = 0; attempt < 2; attempt++) {
      const missing = await request(base, "/items/missing");
      assert.equal(missing.status, 404);
      assert.deepEqual(missing.body, { error: "Item not found" });
    }
    assert.equal(calls.reads, 3);
    assert.equal(calls.saves, 0);
  });
});

check("preserves a separate cache for each server", async () => {
  for (let instance = 0; instance < 2; instance++) {
    await withServer(undefined, async (base) => {
      assert.deepEqual(await request(base, "/items/book-1"), { status: 200, cacheStatus: "MISS", body: original });
    });
  }
});

check("ordinary successful updates persist exact titles and preserve unrelated items", async () => {
  const { backing, store } = trackedStore();
  await withServer(store, async (base) => {
    await request(base, "/items/book-1");
    await request(base, "/items/book-2");
    for (const title of ["Cedar field guide, revised", "  دليل الأرز  "]) {
      const expected = { id: "book-1", title };
      const saved = await update(base, title);
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.body, expected);
      assert.deepEqual(await backing.findById("book-1"), expected);
      for (let attempt = 0; attempt < 2; attempt++) {
        const current = await request(base, "/items/book-1");
        assert.equal(current.status, 200);
        assert.deepEqual(current.body, expected);
        if (attempt === 1) assert.equal(current.cacheStatus, "HIT");
      }
      assert.deepEqual(await request(base, "/items/book-2"), { status: 200, cacheStatus: "HIT", body: other });
    }
  });
});

check("successful PUT leaves fresh GETs after a read during its pending save", async () => {
  const backing = createStore();
  const entered = deferred();
  const release = deferred();
  const store = {
    findById: (id) => backing.findById(id),
    async save(item) {
      entered.resolve();
      await release.promise;
      return backing.save(item);
    },
  };
  await withServer(store, async (base) => {
    const expected = { id: "book-1", title: "Revised after pending save" };
    assert.deepEqual((await request(base, "/items/book-1")).body, original);
    const pending = update(base, expected.title);
    try {
      // Success ordering comes from the save barrier, never a sleep or timing race.
      // The request timeout only bounds broken candidates that never reach save.
      await Promise.race([
        entered.promise,
        pending.then((response) => { throw new Error(`PUT completed before reaching save (${response.status})`); }),
      ]);
      assert.deepEqual(await backing.findById("book-1"), original);
      const during = await request(base, "/items/book-1");
      assert.equal(during.status, 200);
      assert.deepEqual(during.body, original, "pending writes must expose the last saved title");
      release.resolve();
      const saved = await pending;
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.body, expected);
      assert.deepEqual(await backing.findById("book-1"), expected);
      for (let attempt = 0; attempt < 2; attempt++) {
        const current = await request(base, "/items/book-1");
        assert.equal(current.status, 200);
        assert.deepEqual(current.body, expected, "a completed PUT must not leave a stale cached title");
      }
    } finally {
      release.resolve();
      await pending.catch(() => {});
    }
  });
});

check("failed saves return failure without persisting or caching the rejected title", async () => {
  const backing = createStore();
  let saves = 0;
  const store = {
    findById: (id) => backing.findById(id),
    async save() { saves++; throw new Error("Controlled save failure"); },
  };
  await withServer(store, async (base) => {
    await request(base, "/items/book-1");
    const failed = await update(base, "Rejected title");
    assert.equal(saves, 1);
    assert.equal(failed.status, 500);
    assert.deepEqual(failed.body, { error: "Update failed" });
    assert.deepEqual(await backing.findById("book-1"), original);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.deepEqual((await request(base, "/items/book-1")).body, original);
    }
    assert.deepEqual(await backing.findById("book-2"), other);
  });
});

check("invalid JSON fails before saving", async () => {
  const { backing, store, calls } = trackedStore();
  await withServer(store, async (base) => {
    const result = await request(base, "/items/book-1", { method: "PUT", body: '{"title":' });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: "Invalid JSON" });
    assert.equal(calls.saves, 0);
    assert.deepEqual(await backing.findById("book-1"), original);
  });
});

check("invalid titles fail before saving", async () => {
  const { backing, store, calls } = trackedStore();
  await withServer(store, async (base) => {
    for (const title of [undefined, null, "", " \t ", 0, false, [], {}]) {
      const result = await update(base, title);
      assert.equal(result.status, 400);
      assert.deepEqual(result.body, { error: "Invalid title" });
    }
    assert.equal(calls.saves, 0);
    assert.deepEqual(await backing.findById("book-1"), original);
  });
});

check("updating a missing item does not create or save it", async () => {
  const { backing, store, calls } = trackedStore();
  await withServer(store, async (base) => {
    const result = await update(base, "Absent item", "missing");
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: "Item not found" });
    assert.equal(calls.saves, 0);
    assert.equal(await backing.findById("missing"), undefined);
    assert.deepEqual(await backing.findById("book-1"), original);
  });
});

check("unrelated routes, unsupported methods, and malformed IDs preserve their errors", async () => {
  const { store, calls } = trackedStore();
  await withServer(store, async (base) => {
    for (const [method, route] of [["GET", "/elsewhere"], ["PUT", "/elsewhere"], ["POST", "/items/book-1"]]) {
      const result = await request(base, route, { method, ...(method === "GET" ? {} : { body: '{}' }) });
      assert.equal(result.status, 404);
      assert.deepEqual(result.body, { error: "Not found" });
    }
    for (const method of ["GET", "PUT"]) {
      const result = await request(base, "/items/%ZZ", { method });
      assert.equal(result.status, 400);
      assert.deepEqual(result.body, { error: "Invalid item ID" });
    }
    assert.deepEqual(calls, { reads: 0, saves: 0 });
  });
});

const results = [];
for (const { name, run } of cases) {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error?.message ?? String(error) }); }
}
const ok = results.every(({ pass }) => pass);
console.log(JSON.stringify({ ok, total: results.length, results }, null, 2));
process.exitCode = ok ? 0 : 1;
