import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "./server.mjs";

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

test("repeated requests reach the cache after one store read", async () => {
  let reads = 0;
  const item = { id: "book-1", title: "Cedar field guide" };
  await withServer({ async findById(id) { reads += 1; return id === item.id ? item : undefined; } }, async (base) => {
    for (const expected of ["MISS", "HIT"]) {
      const response = await fetch(`${base}/items/book-1`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Cache"), expected);
      assert.deepEqual(await response.json(), item);
    }
    assert.equal(reads, 1);
  });
});

test("does not cache missing items or look up unrelated routes", async () => {
  let reads = 0;
  await withServer({ async findById() { reads += 1; } }, async (base) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${base}/items/missing`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "Item not found" });
    }
    assert.equal((await fetch(`${base}/elsewhere`)).status, 404);
    assert.equal(reads, 2);
  });
});

test("uses separate caches for separate server instances", async () => {
  for (let instance = 0; instance < 2; instance += 1) {
    await withServer(undefined, async (base) => {
      const response = await fetch(`${base}/items/book-1`);
      assert.equal(response.headers.get("X-Cache"), "MISS");
      assert.equal((await response.json()).id, "book-1");
    });
  }
});
