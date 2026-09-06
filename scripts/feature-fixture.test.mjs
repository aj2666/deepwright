import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../evals/fixtures/retry/", import.meta.url));
const checks = fileURLToPath(new URL("../evals/checks/retry.mjs", import.meta.url));
const expectedCheckCount = 48;
function run(project) {
  const result = spawnSync(process.execPath, [checks, project], {
    encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
function readReport(result) {
  const report = JSON.parse(result.stdout);
  assert.equal(report.total, expectedCheckCount);
  assert.equal(report.results.length, expectedCheckCount);
  assert.equal(new Set(report.results.map((entry) => entry.name)).size, expectedCheckCount);
  assert.ok(report.results.every((entry) => typeof entry.pass === "boolean"));
  assert.equal(report.ok, report.results.every((entry) => entry.pass));
  assert.equal(result.status, report.ok ? 0 : 1, result.stderr);
  return report;
}

// Controls check the observer, not model behavior. Keep them out of candidate contexts.
const reference = `export async function request(operation, options = {}) {
  const maxRetries = "maxRetries" in options ? options.maxRetries : 2;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new RangeError("maxRetries must be an integer from 0 to 5");
  }
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) { if (attempt === maxRetries) throw error; }
  }
}\n`;
const alternate = `export async function request(operation, options = {}) {
  const limit = Object.hasOwn(options, "maxRetries") ? options.maxRetries : 2;
  if (!Number.isInteger(limit) || limit < 0 || limit > 5) throw new RangeError("retry limit");
  let lastError;
  for (let attempt = 0; attempt <= limit; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) { lastError = error; }
  }
  throw lastError;
}\n`;

async function checkSource(t, source) {
  const root = await mkdtemp(join(tmpdir(), "deepwright-feature-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "request.mjs"), source);
  return readReport(run(root));
}

test("baseline fixture fails the requested feature without failing its existing default", () => {
  const report = readReport(run(fixture));
  assert.equal(report.ok, false);
  const defaults = report.results.filter((entry) => /omitted options|empty options/.test(entry.name));
  assert.equal(defaults.length, 4);
  assert.ok(defaults.every((entry) => entry.pass));
  const invalid = report.results.filter((entry) => entry.name.startsWith("rejects invalid"));
  assert.equal(invalid.length, 16);
  assert.ok(invalid.every((entry) => !entry.pass));
});

for (const [name, source] of [["direct loop", reference], ["bounded loop", alternate]]) {
  test(`observer accepts correct ${name} without depending on implementation structure`, async (t) => {
    assert.equal((await checkSource(t, source)).ok, true);
  });
}

test("observer rejects defaulting a supplied undefined retry limit", async (t) => {
  const source = reference.replace("export async function request", "async function strictRequest") + `
export function request(operation, options = {}) {
  return strictRequest(operation, options.maxRetries === undefined ? {} : options);
}\n`;
  const report = await checkSource(t, source);
  assert.equal(report.ok, false);
  assert.deepEqual(report.results.filter((entry) => !entry.pass), [
    { name: "rejects invalid maxRetries undefined before calling the operation", pass: false },
  ]);
});

const mutants = [
  ["changed default", reference.replace("options.maxRetries : 2", "options.maxRetries : 1"), /omitted options/],
  ["off-by-one", reference.replace("attempt === maxRetries", "attempt === maxRetries + 1"), /bounds attempts/],
  ["missing validation", reference.replace("!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5", "false"), /rejects invalid/],
  ["wrapped error", reference.replace("throw error;", 'throw new Error("wrapped");'), /final.error/],
  ["copied result", reference.replace("return await operation(attempt);", "return { ...await operation(attempt) };"), /first success/],
  ["first error instead of final", reference.replace("  for (let attempt", "  let firstError;\n  for (let attempt")
    .replace("catch (error) { if (attempt === maxRetries) throw error; }",
      "catch (error) { if (attempt === 0) firstError = error; if (attempt === maxRetries) throw firstError; }"), /final.error/],
  ["replaced falsy result", reference.replace("return await operation(attempt);", "return (await operation(attempt)) || { fallback: true };"), /falsy/],
  ["rejected valid middle limits", reference.replace("maxRetries > 5", "maxRetries > 5 || maxRetries === 3 || maxRetries === 4"), /maxRetries=[34]/],
  ["missing await", reference.replace("return await operation(attempt);", "return operation(attempt);"), /async/],
  ["truthy retry default", reference.replace('"maxRetries" in options ? options.maxRetries : 2', "options.maxRetries || 2"), /maxRetries=0/],
  ["normalized non-Error rejection", reference.replace("throw error;", 'throw error instanceof Error ? error : new Error("normalized");'), /non-Error/],
  ["missing await for default retries", reference.replace("return await operation(attempt);", "return arguments.length < 2 || arguments[1].maxRetries === undefined ? operation(attempt) : await operation(attempt);"), /options.*async/],
];
for (const [name, source, failingCheck] of mutants) {
  test(`observer rejects ${name} for a matching behavioral failure`, async (t) => {
    assert.notEqual(source, reference, "mutation must change the implementation");
    const report = await checkSource(t, source);
    assert.equal(report.ok, false);
    assert.ok(report.results.some((entry) => !entry.pass && failingCheck.test(entry.name)), name);
  });
}

test("observer rejects a missing target rather than checking the wrong project", () => {
  const result = run("");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Usage: node evals\/checks\/retry.mjs/);
});
