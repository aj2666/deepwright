import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "./server.mjs";

test("updating a title returns the saved item and refreshes later lookups", async () => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/items/book-1`)).status, 200);
    const response = await fetch(`${base}/items/book-1`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Cedar field guide, revised" }),
    });
    const expected = { id: "book-1", title: "Cedar field guide, revised" };
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.deepEqual(await (await fetch(`${base}/items/book-1`)).json(), expected);
    }
    assert.deepEqual(await (await fetch(`${base}/items/book-2`)).json(), { id: "book-2", title: "Harbor atlas" });
  } finally {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
});
