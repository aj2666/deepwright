import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../evals/fixtures/retry/", import.meta.url));
const checks = fileURLToPath(new URL("../evals/checks/retry.mjs", import.meta.url));
function run(project) {
  const result = spawnSync(process.execPath, [checks, project], {
    encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

// Deliberately small reference implementation for checking the observer tests,
// not a candidate run or evidence that any model followed a skill.
const reference = `export async function request(operation, { maxRetries = 2 } = {}) {
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new RangeError("maxRetries must be an integer from 0 to 5");
  }
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) { if (attempt === maxRetries) throw error; }
  }
}\n`;

test("baseline fixture fails the requested new feature while preserving its current contract", () => {
  const missingFeature = run(fixture);
  assert.equal(missingFeature.status, 1, missingFeature.stdout + missingFeature.stderr);
  const report = JSON.parse(missingFeature.stdout);
  assert.equal(report.total, 17);
  assert.equal(report.results[0].pass, true);
  assert.equal(report.results[2].pass, false);
  assert.ok(report.results.filter((entry) => entry.name.startsWith("rejects invalid")).every((entry) => !entry.pass));
});

test("acceptance checks pass a correct implementation and reject independent fault classes", async () => {
  const root = await mkdtemp(join(tmpdir(), "deepwright-feature-"));
  try {
    const mutants = [
      ["correct", reference, 0],
      ["changed default", reference.replace("maxRetries = 2", "maxRetries = 1"), 1],
      ["off-by-one", reference.replace("attempt === maxRetries", "attempt === maxRetries + 1"), 1],
      ["missing validation", reference.replace("!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5", "false"), 1],
      ["wrapped error", reference.replace("throw error;", 'throw new Error("wrapped");'), 1],
      ["copied result", reference.replace("return await operation(attempt);", "return { ...await operation(attempt) };"), 1],
    ];
    for (const [name, source, expectedStatus] of mutants) {
      await writeFile(join(root, "request.mjs"), source);
      const result = run(root);
      assert.equal(result.status, expectedStatus, `${name}: ${result.stdout}${result.stderr}`);
      const report = JSON.parse(result.stdout);
      assert.equal(report.total, 17);
      assert.equal(report.ok, expectedStatus === 0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("observer checks reject a missing target rather than checking the wrong project", () => {
  const result = run("");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Usage: node evals\/checks\/retry.mjs/);
});
