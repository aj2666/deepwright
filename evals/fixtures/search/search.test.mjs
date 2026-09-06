import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createSearch } from "./search.mjs";
import { createSearchServer } from "./server.mjs";

const records = [
  { id: 7, title: "Cedar field guide", description: "Harbor notes" },
  { id: 2, title: "Harbor atlas", description: "Cedar notes" },
  { id: 9, title: "Cedar history", description: "Old records" },
].map((record) => JSON.stringify(record));

test("matches normalized title substrings in original order", () => {
  assert.deepEqual(createSearch(records)("  CEDAR  "), {
    results: [{ id: 7, title: "Cedar field guide" }, { id: 9, title: "Cedar history" }], total: 2,
  });
});

test("ignores description matches and handles empty or unmatched queries", () => {
  const search = createSearch(records);
  assert.deepEqual(search("harbor"), { results: [{ id: 2, title: "Harbor atlas" }], total: 1 });
  for (const query of ["", " \t ", "not present"]) assert.deepEqual(search(query), { results: [], total: 0 });
});

test("retains an independent catalog snapshot without changing input", () => {
  const supplied = [...records];
  const search = createSearch(supplied);
  assert.deepEqual(supplied, records);
  supplied.length = 0;
  assert.equal(search("cedar").total, 2);
  assert.equal(createSearch([])("cedar").total, 0);
});

test("serves the documented query endpoint and rejects other routes", async () => {
  const server = createSearchServer(records);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/search?q=harbor`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { results: [{ id: 2, title: "Harbor atlas" }], total: 1 });
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
  } finally {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
});
