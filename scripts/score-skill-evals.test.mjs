import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSuite, scoreReceipts, LIMITATION } from "./score-skill-evals.mjs";

const { prompts, expected } = await loadSuite();
const good = () => ({
  schemaVersion: 1,
  run: { revision: "synthetic-selftest", host: "offline-test", model: "none" },
  cases: expected.map((entry) => ({
    id: entry.id, route: entry.routes[0], scope: entry.scope,
    checks: Object.fromEntries(entry.requiredChecks.map((check) => [check, true])),
    evidence: ["synthetic-selftest-only.txt"],
  })),
});

test("corpus keeps prompts separate and the complete known-good receipt passes", () => {
  assert.equal(prompts.length, 16);
  assert.ok(prompts.every((entry) => Object.keys(entry).length === 2));
  const report = scoreReceipts(good(), expected);
  assert.equal(report.ok, true);
  assert.equal(report.passed, 16);
  assert.equal(report.limitation, LIMITATION);
});

test("known-bad routing, scope, and safety observations cannot pass", () => {
  for (const mutate of [
    (receipt) => { receipt.cases[0].route = "none"; },
    (receipt) => { receipt.cases[0].scope = "read-only"; },
    (receipt) => { receipt.cases[0].checks["no-external-writes"] = false; },
  ]) {
    const receipt = good(); mutate(receipt);
    const report = scoreReceipts(receipt, expected);
    assert.equal(report.ok, false);
    assert.equal(report.failed, 1);
  }
});

test("missing, duplicate, and unknown IDs are invalid, not skipped", () => {
  for (const mutate of [
    (receipt) => { receipt.cases.pop(); },
    (receipt) => { receipt.cases.push(receipt.cases[0]); },
    (receipt) => { receipt.cases[0].id = "not-a-case"; },
    (receipt) => { receipt.cases = []; },
  ]) {
    const receipt = good(); mutate(receipt);
    assert.throws(() => scoreReceipts(receipt, expected));
  }
});

test("malformed fields, missing evidence, and null checks are invalid", () => {
  for (const mutate of [
    (receipt) => { receipt.schemaVersion = "1"; },
    (receipt) => { receipt.run.model = ""; },
    (receipt) => { receipt.run = { "host|model": "invalid", revision: "invalid" }; },
    (receipt) => { receipt.cases[0].route = null; },
    (receipt) => { receipt.cases[0].scope = "anything"; },
    (receipt) => { receipt.cases[0].checks = null; },
    (receipt) => { receipt.cases[0].checks["no-external-writes"] = null; },
    (receipt) => { receipt.cases[0].checks["no-external-writes"] = "true"; },
    (receipt) => { receipt.cases[0].checks["unknown-check"] = true; },
    (receipt) => { delete receipt.cases[0].checks["no-external-writes"]; },
    (receipt) => { receipt.cases[0].evidence = []; },
    (receipt) => { receipt.cases[0].evidence = [""]; },
    (receipt) => { receipt.cases[0].evidence = [null]; },
    (receipt) => { receipt.cases[0].extra = true; },
  ]) {
    const receipt = good(); mutate(receipt);
    assert.throws(() => scoreReceipts(receipt, expected));
  }
  for (const value of [null, false, "", [], {}]) assert.throws(() => scoreReceipts(value, expected));
});

test("case order does not matter and declared alternate route is accepted", () => {
  const receipt = good();
  receipt.cases.find((entry) => entry.id === "ambiguous-scope").route = "none";
  receipt.cases.reverse();
  assert.equal(scoreReceipts(receipt, expected).ok, true);
});

test("CLI help has no model calls and invalid input returns machine-readable failure", () => {
  const script = fileURLToPath(new URL("./score-skill-evals.mjs", import.meta.url));
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /offline/);
  const invalid = spawnSync(process.execPath, [script, "--unknown"], { encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.equal(JSON.parse(invalid.stdout).ok, false);
});

test("CLI scores complete receipts with stable success and failure exit codes", async () => {
  const directory = await mkdtemp(path.join(path.dirname(fileURLToPath(import.meta.url)), ".skill-eval-test-"));
  try {
    const file = path.join(directory, "observations with spaces.json");
    const script = fileURLToPath(new URL("./score-skill-evals.mjs", import.meta.url));
    for (const pass of [true, false]) {
      const receipt = good();
      receipt.cases[0].checks["no-external-writes"] = pass;
      await writeFile(file, JSON.stringify(receipt));
      const result = spawnSync(process.execPath, [script, file], { encoding: "utf8" });
      assert.equal(result.status, pass ? 0 : 1);
      const report = JSON.parse(result.stdout);
      assert.equal(report.ok, pass);
      assert.equal(report.total, 16);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
