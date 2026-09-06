import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot } from "./prepare-skill-eval.mjs";

const base = fileURLToPath(new URL("../evals/fixtures/retry/", import.meta.url));
const overlay = fileURLToPath(new URL("../evals/fixtures/retry-review/", import.meta.url));
const checks = fileURLToPath(new URL("../evals/checks/retry.mjs", import.meta.url));
const localTestArgs = ["--test", "--test-reporter=tap", "request.test.mjs"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

async function stage(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "deepwright-retry-review-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previous = path.join(directory, "previous");
  const current = path.join(directory, "current");
  await cp(base, previous, { recursive: true });
  await cp(base, current, { recursive: true });
  await cp(overlay, current, { recursive: true });
  return { directory, previous, current };
}

function node(cwd, args, status) {
  const result = spawnSync(process.execPath, args, {
    cwd, env, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, status, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.ok(result.stdout.trim(), "Execution must produce inspectable evidence");
  return result.stdout;
}

function testCounts(output) {
  return Object.fromEntries([["tests", "tests"], ["passed", "pass"], ["failed", "fail"]].map(([field, label]) => {
    const match = new RegExp(`^# ${label} (\\d+)$`, "m").exec(output);
    assert.ok(match, `Missing ${label} count in test output`);
    return [field, Number(match[1])];
  }));
}

function acceptance(project, status) {
  const report = JSON.parse(node(project, [checks, project], status));
  assert.equal(report.total, 48);
  assert.equal(report.results.length, 48);
  assert.equal(new Set(report.results.map((entry) => entry.name)).size, 48);
  assert.ok(report.results.every((entry) => typeof entry.pass === "boolean"));
  assert.equal(report.ok, report.results.every((entry) => entry.pass));
  return report;
}

test("the author report binds the previous source and does not establish the overlaid helper's test result", async (t) => {
  const { previous, current } = await stage(t);
  const before = await snapshot(current);
  const report = JSON.parse(await readFile(path.join(current, "reports", "author-checks.json"), "utf8"));
  const original = await readFile(path.join(previous, "request.mjs"));
  const changed = await readFile(path.join(current, "request.mjs"));
  assert.equal(report.source.path, "request.mjs");
  assert.equal(report.source.snapshot, "reports/request.checked.mjs");
  assert.deepEqual(await readFile(path.join(current, "reports", "request.checked.mjs")), original);
  assert.equal(report.source.sha256, hash(original));
  assert.notEqual(report.source.sha256, hash(changed));
  assert.deepEqual(changed, await readFile(path.join(overlay, "request.mjs")));
  assert.deepEqual(await readFile(path.join(current, "request.test.mjs")), await readFile(path.join(previous, "request.test.mjs")));
  assert.deepEqual(before.files.map((entry) => entry.path).sort(), ["README.md", "reports/author-checks.json", "reports/request.checked.mjs", "request.mjs", "request.test.mjs"]);
  // The supplied command is data. Execute only this reviewed, fixed local command.
  assert.deepEqual(report.command, ["node", ...localTestArgs]);
  assert.equal(report.exitCode, 0);
  assert.deepEqual(report.summary, { tests: 2, passed: 2, failed: 0 });
  const oldOutput = node(previous, localTestArgs, 0);
  const currentOutput = node(current, localTestArgs, 1);
  assert.deepEqual(testCounts(oldOutput), report.summary);
  assert.deepEqual(testCounts(currentOutput), { tests: 2, passed: 1, failed: 1 });
  assert.deepEqual(await snapshot(current), before);
  t.diagnostic(`Report source=${report.source.sha256}; current source=${hash(changed)}; previous tests=2/2, current tests=1/2.`);
});

test("the retry review overlay retains default and supplied-undefined defects while a separate corrected control passes", async (t) => {
  const originalBase = await snapshot(base);
  const originalOverlay = await snapshot(overlay);
  const { directory, current } = await stage(t);
  const before = await snapshot(current);
  const report = acceptance(current, 1);
  assert.equal(report.ok, false);
  assert.deepEqual(report.results.filter((entry) => !entry.pass).map((entry) => entry.name), [
    "omitted options preserve two retries and final-error identity (sync)",
    "empty options preserve two retries and final-error identity (sync)",
    "omitted options preserve two retries and final-error identity (async)",
    "empty options preserve two retries and final-error identity (async)",
    "rejects invalid maxRetries undefined before calling the operation",
  ]);
  assert.equal(report.results.filter((entry) => entry.pass).length, 43);

  // This positive control stays outside the committed candidate fixture.
  const control = path.join(directory, "corrected control");
  await cp(current, control, { recursive: true });
  const source = await readFile(path.join(control, "request.mjs"), "utf8");
  const defaultOnly = source.replace("maxRetries = 1", "maxRetries = 2");
  assert.notEqual(defaultOnly, source);
  await writeFile(path.join(control, "request.mjs"), defaultOnly);
  assert.deepEqual(acceptance(control, 1).results.filter((entry) => !entry.pass), [
    { name: "rejects invalid maxRetries undefined before calling the operation", pass: false },
  ]);
  const corrected = defaultOnly.replace(
    "export async function request(operation, { maxRetries = 2 } = {}) {",
    'export async function request(operation, options = {}) {\n  const maxRetries = "maxRetries" in options ? options.maxRetries : 2;',
  );
  assert.notEqual(corrected, defaultOnly);
  await writeFile(path.join(control, "request.mjs"), corrected);
  assert.equal(acceptance(control, 0).ok, true);
  assert.deepEqual(testCounts(node(control, localTestArgs, 0)), { tests: 2, passed: 2, failed: 0 });
  assert.deepEqual(await snapshot(current), before);
  assert.deepEqual(await snapshot(base), originalBase);
  assert.deepEqual(await snapshot(overlay), originalOverlay);
  t.diagnostic("Acceptance controls: preserved overlay 43/48, default-only correction 47/48, both defects corrected 48/48.");
});
