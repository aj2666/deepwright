import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../evals/fixtures/reading-list/", import.meta.url));
const observer = fileURLToPath(new URL("../evals/checks/reading-list.mjs", import.meta.url));
const serverBase = await readFile(join(fixture, "server.mjs"), "utf8");
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const expectedChecks = 27;

function inspect(project, scratch) {
  const result = spawnSync(process.execPath, [observer, project, ...(scratch ? [scratch] : [])], {
    env, encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const report = JSON.parse(result.stdout);
  assert.equal(report.total, expectedChecks, result.stdout);
  assert.equal(report.results.length, expectedChecks);
  assert.equal(new Set(report.results.map(({ name }) => name)).size, expectedChecks);
  assert.equal(report.ok, report.results.every(({ pass }) => pass));
  assert.equal(result.status, report.ok ? 0 : 1, result.stderr);
  return report;
}

// These implementations and mutations exercise the observer. They never enter
// the reusable fixture or live candidate contexts. Browser behavior is separate.
const validation = String.raw`
        let value;
        try {
          const input = JSON.parse(body);
          if (!input || Array.isArray(input) || typeof input.title !== "string" || typeof input.url !== "string") throw new Error("fields");
          const title = input.title.trim(), url = input.url.trim();
          if (title.length < 1 || title.length > 120) throw new Error("title");
          const parsed = new URL(url);
          if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new Error("URL");
          value = { title, url };
        } catch { json(400, { error: "Provide a title and an HTTP or HTTPS URL." }); return; }
`;
const alternateValidation = String.raw`
        let value;
        try {
          const input = JSON.parse(body);
          if (Object.prototype.toString.call(input) !== "[object Object]") throw new Error("object required");
          for (const field of ["title", "url"]) if (typeof input[field] !== "string") throw new Error("text required");
          value = { title: input.title.trim(), url: input.url.trim() };
          if (!value.title || value.title.length > 120) throw new Error("title length");
          const address = new URL(value.url);
          switch (address.protocol) { case "http:": case "https:": break; default: throw new Error("protocol"); }
          if (address.hostname === "") throw new Error("hostname");
        } catch { json(400, { error: "The title or web address is invalid." }); return; }
`;
function server(validationSource) {
  return serverBase.replace('if (request.method === "GET" && pathname === "/api/items") {', `if (request.method === "POST" && pathname === "/api/items") {
        let body = "";
        for await (const chunk of request) body += chunk;
        ${validationSource}
        json(201, { item: await store.add(value) });
      } else if (request.method === "GET" && pathname === "/api/items") {`);
}
const synchronousStore = String.raw`import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
export function createStore(directory) {
  const filename = join(directory, "items.json");
  function read() {
    const items = JSON.parse(readFileSync(filename, "utf8"));
    if (!Array.isArray(items)) throw new Error("array required");
    return items;
  }
  return {
    async list() { return read(); },
    async add(value) {
      const items = read();
      const item = { id: randomUUID(), ...value };
      items.push(item);
      writeFileSync(filename + ".tmp", JSON.stringify(items));
      renameSync(filename + ".tmp", filename);
      return item;
    },
  };
}
`;
const queuedStore = String.raw`import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
export function createStore(directory) {
  const filename = join(directory, "items.json");
  let tail = Promise.resolve();
  async function list() {
    const records = JSON.parse(await readFile(filename, "utf8"));
    if (!Array.isArray(records)) throw new Error("array required");
    return records;
  }
  async function append(value) {
    const previous = await list();
    const item = { ...value, id: randomUUID() };
    const next = previous.concat(item);
    await writeFile(filename + ".tmp", JSON.stringify(next));
    await rename(filename + ".tmp", filename);
    return item;
  }
  return { list, add(value) {
    const operation = tail.then(() => append(value));
    tail = operation.catch(() => {});
    return operation;
  } };
}
`;
const memoryStore = String.raw`import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
export function createStore(directory) {
  let items = JSON.parse(readFileSync(join(directory, "items.json"), "utf8"));
  return { async list() { return items; }, async add(value) {
    const item = { id: randomUUID(), ...value }; items.push(item); return item;
  } };
}
`;
async function control(t, storeSource, serverSource = server(validation)) {
  const root = await mkdtemp(join(tmpdir(), "reading-room-control-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "project");
  await cp(fixture, project, { recursive: true });
  await writeFile(join(project, "store.mjs"), storeSource);
  await writeFile(join(project, "server.mjs"), serverSource);
  return { project, report: inspect(project, root) };
}

test("reading-list baseline has four passing existing behavior tests", () => {
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "app.test.mjs"], { cwd: fixture, env, encoding: "utf8", timeout: 15_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 4(?:\r?\n|$)/);
});

test("observer rejects the missing feature while retaining baseline GET and route behavior", () => {
  const report = inspect(fixture);
  assert.equal(report.ok, false);
  assert.ok(report.results.slice(0, 3).every(({ pass }) => pass));
  assert.ok(report.results.some(({ name, pass }) => name === "trimmed HTTPS addition" && !pass));
});

test("observer closes a SIGTERM-resistant descendant listener after graceful parent exit", {
  skip: process.platform === "win32" ? "This control exercises POSIX detached process groups" : false,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "reading-room-descendant-"));
  const project = join(root, "project");
  const addressFile = join(root, "descendant.json");
  const stoppedFile = join(root, "parent-stopped.txt");
  let descendant;
  t.after(async () => {
    try {
      if (!descendant) {
        try { descendant = JSON.parse(await readFile(addressFile, "utf8")); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      if (descendant) {
        assert.ok(Number.isSafeInteger(descendant.pid) && descendant.pid > 1);
        try { process.kill(descendant.pid, "SIGKILL"); }
        catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  await cp(fixture, project, { recursive: true });
  const childFile = join(project, "controlled-descendant.mjs");
  await writeFile(childFile, `import { createServer } from "node:http";
process.on("SIGTERM", () => {});
const server = createServer((request, response) => response.end("controlled descendant"));
server.listen(0, "127.0.0.1", () => process.send({ pid: process.pid, port: server.address().port }));
setTimeout(() => process.exit(0), 15000);
`);
  await writeFile(join(project, "server.mjs"), `import { fork } from "node:child_process";
import { once as descendantReady } from "node:events";
import { writeFileSync } from "node:fs";
process.once("SIGTERM", () => {
  writeFileSync(${JSON.stringify(stoppedFile)}, "graceful parent cleanup");
  process.exit(0);
});
const controlledDescendant = fork(${JSON.stringify(childFile)}, [], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
const [descendantAddress] = await descendantReady(controlledDescendant, "message");
writeFileSync(${JSON.stringify(addressFile)}, JSON.stringify(descendantAddress));
` + serverBase);
  const report = inspect(project, root);
  assert.ok(report.results.slice(0, 3).every(({ pass }) => pass), "The control must serve real baseline requests before cleanup");
  assert.equal(await readFile(stoppedFile, "utf8"), "graceful parent cleanup");
  descendant = JSON.parse(await readFile(addressFile, "utf8"));
  let listenerClosed = false;
  const deadline = Date.now() + 1000;
  do {
    try {
      const response = await fetch(`http://127.0.0.1:${descendant.port}`, { signal: AbortSignal.timeout(200) });
      assert.equal(await response.text(), "controlled descendant");
    } catch (error) {
      if (error.cause?.code !== "ECONNREFUSED") throw error;
      listenerClosed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  assert.equal(listenerClosed, true, "A descendant still serves HTTP after the observer has exited");
});

for (const [name, storeSource, serverSource] of [
  ["synchronous atomic store", synchronousStore, server(validation)],
  ["queued asynchronous store", queuedStore, server(alternateValidation)],
]) {
  test(`observer accepts ${name} and original tests still pass`, async (t) => {
    const { project, report } = await control(t, storeSource, serverSource);
    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
    const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "app.test.mjs"], { cwd: project, env, encoding: "utf8", timeout: 15_000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}

const bypass = validation.replace('if (title.length < 1 || title.length > 120) throw new Error("title");', "")
  .replace('if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new Error("URL");', "");
const lostUpdates = queuedStore.replace("const operation = tail.then(() => append(value));", "const operation = append(value);")
  .replace("const previous = await list();", "const previous = await list(); await new Promise(resolve => setTimeout(resolve, 20));")
  .replaceAll('filename + ".tmp"', 'filename + item.id + ".tmp"');
for (const [name, storeSource, serverSource, failedCheck] of [
  ["validation bypass", synchronousStore, server(bypass), /rejects (empty title|script URL)/],
  ["client-owned identity", synchronousStore, server(validation.replace("value = { title, url };", 'value = { title, url, ...(typeof input.id === "string" ? { id: input.id } : {}) };')), /server-owned identity/],
  ["memory-only persistence", memoryStore, server(validation), /trimmed HTTPS addition|saved items survive/],
  ["overwritten existing data", synchronousStore.replace("const items = read();", "const items = [];"), server(validation), /trimmed HTTPS addition/],
  ["storage error falsely reported as success", synchronousStore, server(validation).replace('json(500, { error: "The reading list is unavailable. Please try again." });', 'json(201, { item: { id: "lost", title: "An unsaved page", url: "https://example.org/unsaved" } });'), /real storage failure/],
  ["concurrent lost updates", lostUpdates, server(validation), /concurrent additions/],
  ["poisoned queue after a failed save", queuedStore.replace("tail = operation.catch(() => {});", "tail = operation; tail.catch(() => {});"), server(validation), /retry succeeds/],
  ["malformed storage silently reset", synchronousStore.replace('const items = JSON.parse(readFileSync(filename, "utf8"));', 'let items; try { items = JSON.parse(readFileSync(filename, "utf8")); } catch (error) { if (!(error instanceof SyntaxError)) throw error; items = []; }'), server(validation), /malformed existing storage/],
]) {
  test(`observer rejects ${name} for its behavioral failure`, async (t) => {
    const { report } = await control(t, storeSource, serverSource);
    assert.equal(report.ok, false);
    assert.ok(report.results.slice(0, 3).every(({ pass }) => pass), "A faulty control must start and preserve baseline GET/routes before its feature failure counts");
    assert.ok(report.results.some(({ name, pass }) => !pass && failedCheck.test(name)), JSON.stringify(report, null, 2));
  });
}
