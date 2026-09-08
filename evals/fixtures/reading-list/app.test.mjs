import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadingListServer } from "./server.mjs";

const items = [{ id: "first", title: "A saved page", url: "https://example.org/page" }];
async function start(t, contents = JSON.stringify(items)) {
  const dataDir = await mkdtemp(join(tmpdir(), "reading-room-"));
  const filename = join(dataDir, "items.json");
  await writeFile(filename, contents);
  const server = createReadingListServer({ dataDir });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
    await rm(dataDir, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, filename };
}

test("GET returns stored items in order without rewriting data", async (t) => {
  const { base, filename } = await start(t);
  const before = await readFile(filename, "utf8");
  const response = await fetch(`${base}/api/items`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items });
  assert.equal(await readFile(filename, "utf8"), before);
});

test("serves the page, browser script, and stylesheet", async (t) => {
  const { base } = await start(t);
  for (const [path, type, text] of [["/", "text/html", "Reading room"], ["/app.js", "text/javascript", "/api/items"], ["/style.css", "text/css", "--paper"]]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type").startsWith(type));
    assert.ok((await response.text()).includes(text));
  }
});

test("unknown paths and unsupported methods return JSON 404", async (t) => {
  const { base } = await start(t);
  for (const [path, method] of [["/api/missing", "GET"], ["/api/items", "DELETE"], ["/missing.css", "GET"]]) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 404);
    assert.equal(typeof (await response.json()).error, "string");
  }
});

test("unreadable data returns an error without replacing the file", async (t) => {
  const { base, filename } = await start(t, "broken JSON");
  const response = await fetch(`${base}/api/items`);
  assert.equal(response.status, 500);
  assert.ok((await response.json()).error);
  assert.equal(await readFile(filename, "utf8"), "broken JSON");
});
