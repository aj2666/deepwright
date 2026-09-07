import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Observer-only. This launches candidate code and changes disposable data.
// The host must restrict filesystem/network access and bound the whole process.
// Server correctness does not establish UI behavior, test-first work, or authority.
const [projectArg, scratchArg, ...extra] = process.argv.slice(2);
if (!projectArg || extra.length) throw new Error("Usage: node reading-list.mjs <isolated-project> [scratch-parent]");
const project = resolve(projectArg);
const scratch = await mkdtemp(join(scratchArg ? resolve(scratchArg) : tmpdir(), "reading-room-"));
const dataDir = join(scratch, "data");
const filename = join(dataDir, "items.json");
const initial = [
  { id: "paper-7", title: "A reader's notes", url: "https://example.org/notes", pinned: true },
  { id: "paper-9", title: "Protocol basics", url: "http://example.org/protocols" },
];
await mkdir(dataDir);
await writeFile(filename, JSON.stringify(initial, null, 2) + "\n");

async function start() {
  const child = spawn(process.execPath, [join(project, "server.mjs")], {
    cwd: project, detached: process.platform !== "win32",
    env: { PATH: process.env.PATH || "", READING_LIST_DATA_DIR: dataDir, READING_LIST_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "", error = "";
  child.stderr.on("data", (chunk) => { error = (error + chunk).slice(-4000); });
  const stop = async () => {
    const signal = (name) => {
      try { process.platform === "win32" ? child.kill(name) : process.kill(-child.pid, name); }
      catch (problem) { if (problem.code !== "ESRCH") throw problem; }
    };
    if (child.exitCode !== null || child.signalCode !== null) {
      if (process.platform !== "win32") signal("SIGKILL");
      return;
    }
    const exited = once(child, "exit");
    signal("SIGTERM");
    const deadline = setTimeout(() => signal("SIGKILL"), 1000);
    try { await exited; }
    finally {
      clearTimeout(deadline);
      // The parent exiting does not mean its detached group has stopped.
      if (process.platform !== "win32") signal("SIGKILL");
    }
  };
  try {
    const base = await new Promise((accept, reject) => {
      const deadline = setTimeout(() => finish(new Error("Server did not publish a loopback address within 5 seconds")), 5000);
      function finish(problem, address) {
        clearTimeout(deadline);
        child.off("exit", exited);
        child.off("error", failed);
        child.stdout.off("data", received);
        problem ? reject(problem) : accept(address);
      }
      const exited = () => finish(new Error(`Server exited before readiness: ${error}`));
      const failed = (problem) => finish(problem);
      const received = (chunk) => {
        output = (output + chunk).slice(-4000);
        const match = output.match(/http:\/\/127\.0\.0\.1:([1-9]\d{0,4})(?=\s|\/)/);
        if (match && Number(match[1]) <= 65535) finish(null, `http://127.0.0.1:${match[1]}`);
      };
      child.on("exit", exited);
      child.on("error", failed);
      child.stdout.on("data", received);
    });
    child.stdout.resume();
    return { base, stop };
  } catch (problem) {
    await stop();
    throw problem;
  }
}

let service;
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error?.message ?? String(error) }); }
}
async function request(path = "/api/items", options = {}) {
  assert.ok(service, "The server must be running");
  const response = await fetch(service.base + path, { ...options, signal: AbortSignal.timeout(3000) });
  assert.ok(response.headers.get("content-type")?.startsWith("application/json"), "API response must be JSON");
  return { status: response.status, body: await response.json() };
}
const post = (body) => request("/api/items", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
async function list() {
  const response = await request();
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.items));
  return response.body.items;
}
function itemFrom(response, title, url, previous) {
  assert.equal(response.status, 201, "A durable addition must return 201");
  const item = response.body.item;
  assert.ok(item && typeof item.id === "string" && item.id.trim(), "The server must generate a nonempty string id");
  assert.ok(!previous.some((entry) => entry.id === item.id), "Item IDs must be distinct");
  assert.equal(item.title, title);
  assert.equal(item.url, url);
  return item;
}
function errorFrom(response, status) {
  assert.equal(response.status, status);
  assert.ok(typeof response.body.error === "string" && response.body.error.trim(), "An error response needs a meaningful message");
}
const expected = [...initial];

try {
  await check("server starts on loopback", async () => { service = await start(); });
  await check("GET preserves existing items and stored bytes", async () => {
    const before = await readFile(filename, "utf8");
    assert.deepEqual(await list(), initial);
    assert.equal(await readFile(filename, "utf8"), before);
  });
  await check("unknown paths and unsupported methods retain 404 behavior", async () => {
    errorFrom(await request("/api/missing"), 404);
    errorFrom(await request("/api/items", { method: "DELETE" }), 404);
  });
  for (const [name, body, title, url] of [
    ["trimmed HTTPS addition", { title: "  An essay <worth> keeping  ", url: "  https://example.org/read?q=1#notes  " }, "An essay <worth> keeping", "https://example.org/read?q=1#notes"],
    ["HTTP URL and maximum title length", { title: "x".repeat(120), url: "http://example.org/long" }, "x".repeat(120), "http://example.org/long"],
    ["minimum title and server-owned identity", { title: "A", url: "https://example.org/a", id: "requested-identity" }, "A", "https://example.org/a"],
  ]) {
    await check(name, async () => {
      const item = itemFrom(await post(body), title, url, expected);
      if (Object.hasOwn(body, "id")) assert.notEqual(item.id, body.id, "An input field must not choose the server-owned identity");
      expected.push(item);
      assert.deepEqual(await list(), expected);
      assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), expected, "201 must correspond to persisted data");
    });
  }
  for (const [name, body] of [
    ["null body", null], ["array body", []], ["missing title", { url: "https://example.org" }],
    ["non-string title", { title: 42, url: "https://example.org" }],
    ["empty title", { title: " \t ", url: "https://example.org" }],
    ["overlong title", { title: "x".repeat(121), url: "https://example.org" }],
    ["missing URL", { title: "Notes" }], ["non-string URL", { title: "Notes", url: 42 }],
    ["empty URL", { title: "Notes", url: "  " }],
    ["relative URL", { title: "Notes", url: "/notes" }],
    ["protocol-relative URL", { title: "Notes", url: "//example.org/notes" }],
    ["script URL", { title: "Notes", url: "javascript:alert(1)" }],
    ["file URL", { title: "Notes", url: "file:///tmp/notes" }],
    ["FTP URL", { title: "Notes", url: "ftp://example.org/notes" }],
    ["malformed URL", { title: "Notes", url: "https://" }],
  ]) {
    await check(`rejects ${name} without mutation`, async () => {
      const before = await readFile(filename, "utf8");
      const previous = await list();
      errorFrom(await post(body), 400);
      assert.equal(await readFile(filename, "utf8"), before);
      assert.deepEqual(await list(), previous);
    });
  }
  await check("rejects malformed JSON without mutation", async () => {
    const before = await readFile(filename, "utf8");
    const previous = await list();
    errorFrom(await request("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"title":' }), 400);
    assert.equal(await readFile(filename, "utf8"), before);
    assert.deepEqual(await list(), previous);
  });
  await check("concurrent additions preserve every item and distinct identity", async () => {
    const bodies = Array.from({ length: 8 }, (_, index) => ({ title: `Weekend reading ${index}`, url: `https://example.org/weekend/${index}` }));
    const responses = await Promise.all(bodies.map(post));
    const added = responses.map((response, index) => itemFrom(response, bodies[index].title, bodies[index].url, expected));
    assert.equal(new Set(added.map(({ id }) => id)).size, added.length);
    const items = await list();
    assert.deepEqual(items.slice(0, expected.length), expected);
    assert.deepEqual([...items.slice(expected.length)].sort((a, b) => a.id.localeCompare(b.id)), added.sort((a, b) => a.id.localeCompare(b.id)));
    assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), items);
    expected.splice(0, expected.length, ...items);
  });
  await check("saved items survive process restart", async () => {
    assert.ok(expected.length >= initial.length + 11, "All prior additions must have succeeded");
    await service.stop();
    service = await start();
    assert.deepEqual(await list(), expected);
  });
  await check("real storage failure returns 500 without reporting success", async () => {
    const parked = join(scratch, "saved-data");
    await rename(dataDir, parked);
    await writeFile(dataDir, "Storage temporarily unavailable\n");
    try {
      errorFrom(await post({ title: "An unsaved page", url: "https://example.org/unsaved" }), 500);
      assert.equal(await readFile(dataDir, "utf8"), "Storage temporarily unavailable\n");
    } finally {
      await rm(dataDir, { force: true });
      await rename(parked, dataDir);
    }
  });
  await check("retry succeeds after storage recovers and keeps prior items", async () => {
    assert.deepEqual(await list(), expected);
    const body = { title: "A recovered page", url: "https://example.org/recovered" };
    expected.push(itemFrom(await post(body), body.title, body.url, expected));
    assert.deepEqual(await list(), expected);
    assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), expected);
  });
  await check("malformed existing storage is preserved rather than reset", async () => {
    const before = await readFile(filename, "utf8");
    await writeFile(filename, "{broken list\n");
    try {
      errorFrom(await post({ title: "Another page", url: "https://example.org/another" }), 500);
      assert.equal(await readFile(filename, "utf8"), "{broken list\n");
    } finally { await writeFile(filename, before); }
  });
} finally {
  await service?.stop();
  await rm(scratch, { recursive: true, force: true });
}
const ok = results.every(({ pass }) => pass);
console.log(JSON.stringify({ ok, total: results.length, results, limitation: "HTTP and persistence checks only; UI behavior, test chronology, isolation, and authority need separate evidence." }, null, 2));
process.exitCode = ok ? 0 : 1;
