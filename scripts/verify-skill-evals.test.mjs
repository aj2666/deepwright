import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSuite } from "./score-skill-evals.mjs";
import { sealRun, verifyRun, compareRuns, LIMITATION, MAX_FILE_BYTES } from "./verify-skill-evals.mjs";

const { expected } = await loadSuite();
const script = fileURLToPath(new URL("./verify-skill-evals.mjs", import.meta.url));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const receipt = (revision = "a".repeat(40)) => ({
  schemaVersion: 1,
  run: { revision, host: "synthetic-host-1", model: "synthetic-model" },
  cases: expected.map((entry) => ({
    id: entry.id, route: entry.routes[0], scope: entry.scope,
    checks: Object.fromEntries(entry.requiredChecks.map((check) => [check, true])),
    evidence: ["notes/reviewer.txt"],
  })),
});
const context = () => ({ context: {
  tools: ["read-file", "terminal"], permissions: "Synthetic local scope; no external writes", repetition: 1,
  fixtures: Object.fromEntries(expected.map((entry) => [entry.id, ["trivial-code", "noncoding"].includes(entry.id) ? "none" : hash("synthetic-fixture-only")])),
} });
async function directory(t) {
  const root = await realpath(await mkdtemp(path.join(path.dirname(script), ".artifact-eval-test-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function makeRun(root, name = "run", data = receipt(), input = context()) {
  const folder = path.join(root, name);
  await mkdir(path.join(folder, "notes"), { recursive: true });
  await writeFile(path.join(folder, "notes/reviewer.txt"), "Synthetic self-test evidence, not a real agent run.\n");
  const observations = path.join(folder, "observations.json"), setup = path.join(folder, "context.json"), manifest = path.join(folder, "run.json");
  await writeFile(observations, JSON.stringify(data));
  await writeFile(setup, JSON.stringify(input));
  const reseal = async () => {
    const value = await sealRun(observations, setup);
    await writeFile(manifest, JSON.stringify(value));
    return value;
  };
  await reseal();
  return { folder, observations, setup, manifest, reseal };
}
async function changeManifest(run, mutate) {
  const value = JSON.parse(await readFile(run.manifest, "utf8"));
  mutate(value);
  await writeFile(run.manifest, JSON.stringify(value));
}

test("sealing and verification bind complete receipts and deduplicated evidence without writes", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  const before = await readFile(run.observations);
  const sealed = await sealRun(run.observations, run.setup);
  assert.equal(sealed.artifacts.length, 1);
  assert.equal(sealed.receipt.sha256, hash(before));
  assert.deepEqual(await readFile(run.observations), before);
  const result = await verifyRun(run.manifest);
  assert.equal(result.ok, true);
  assert.equal(result.artifactIntegrity, true);
  assert.equal(result.score.total, 16);
  assert.equal(result.limitation, LIMITATION);
});

test("failed observations remain sealable and cannot pass artifact verification's behavior gate", async (t) => {
  const root = await directory(t), data = receipt();
  data.cases[0].checks["no-external-writes"] = false;
  const run = await makeRun(root, "failed", data);
  const result = await verifyRun(run.manifest);
  assert.equal(result.artifactIntegrity, true);
  assert.equal(result.ok, false);
  assert.equal(result.score.failed, 1);
});

test("receipt and evidence byte tampering are rejected", async (t) => {
  const root = await directory(t);
  for (const target of ["observations.json", "notes/reviewer.txt"]) {
    const run = await makeRun(root, target.startsWith("notes") ? "evidence" : "receipt");
    await writeFile(path.join(run.folder, target), "changed");
    await assert.rejects(verifyRun(run.manifest), /SHA-256 mismatch/);
  }
});

test("missing evidence is rejected by sealing and verification", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  await rm(path.join(run.folder, "notes/reviewer.txt"));
  await assert.rejects(verifyRun(run.manifest), /ENOENT/);
  await assert.rejects(sealRun(run.observations, run.setup), /ENOENT/);
});

test("absolute, drive, traversal, backslash, empty-segment and control-character paths are rejected", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  for (const name of ["/secret.txt", "C:/secret.txt", "../secret.txt", "notes/../../secret", "notes\\reviewer.txt", "./notes/reviewer.txt", "notes//reviewer.txt", "notes/", "notes/reviewer\n.txt", "notes/reviewer.txt:stream"]) {
    const data = receipt(); data.cases[0].evidence = [name];
    await writeFile(run.observations, JSON.stringify(data));
    await assert.rejects(sealRun(run.observations, run.setup), /relative file paths|evidence/);
  }
});

test("escaping file and directory symlinks, including sibling-prefix paths, are rejected", async (t) => {
  const root = await directory(t), run = await makeRun(root, "run");
  const sibling = path.join(root, "run-private");
  await mkdir(sibling); await writeFile(path.join(sibling, "reviewer.txt"), "outside");
  await rm(path.join(run.folder, "notes/reviewer.txt"));
  await symlink(path.join(sibling, "reviewer.txt"), path.join(run.folder, "notes/reviewer.txt"));
  await assert.rejects(sealRun(run.observations, run.setup), /outside/);
  await assert.rejects(verifyRun(run.manifest), /outside/);
  await rm(path.join(run.folder, "notes"), { recursive: true });
  await symlink(sibling, path.join(run.folder, "notes"), "dir");
  await assert.rejects(verifyRun(run.manifest), /outside/);
});

test("canonical symlink roots and contained symlinks work without widening confinement", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  const link = path.join(root, "linked-run");
  await symlink(run.folder, link, "dir");
  assert.equal((await verifyRun(path.join(link, "run.json"))).ok, true);
  await writeFile(path.join(run.folder, "review.txt"), "contained");
  await rm(path.join(run.folder, "notes/reviewer.txt"));
  await symlink(path.join(run.folder, "review.txt"), path.join(run.folder, "notes/reviewer.txt"));
  await run.reseal();
  assert.equal((await verifyRun(run.manifest)).ok, true);
});

test("directory evidence and oversized files are rejected", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  const target = path.join(run.folder, "notes/reviewer.txt");
  await rm(target); await mkdir(target);
  await assert.rejects(sealRun(run.observations, run.setup), /regular files|EISDIR/);
  await rm(target, { recursive: true }); await writeFile(target, "");
  await truncate(target, MAX_FILE_BYTES + 1);
  await assert.rejects(sealRun(run.observations, run.setup), /8 MiB/);
});

test("total evidence budget and artifact count are bounded", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  const data = receipt();
  data.cases[0].evidence = Array.from({ length: 129 }, (_, index) => `file-${index}.txt`);
  await writeFile(run.observations, JSON.stringify(data));
  await assert.rejects(sealRun(run.observations, run.setup), /128-artifact/);
  data.cases[0].evidence = [];
  for (let index = 0; index < 5; index++) {
    const name = `large-${index}.txt`;
    await writeFile(path.join(run.folder, name), "");
    await truncate(path.join(run.folder, name), 7 * 1024 * 1024);
    data.cases[0].evidence.push(name);
  }
  await writeFile(run.observations, JSON.stringify(data));
  await assert.rejects(sealRun(run.observations, run.setup), /32 MiB/);
});

test("a run exactly at the receipt/evidence budget seals and verifies despite larger manifest metadata", async (t) => {
  const root = await directory(t), run = await makeRun(root), data = receipt();
  const names = Array.from({ length: 4 }, (_, index) => `boundary-${index}.txt`);
  data.cases[0].evidence = names;
  const serialized = JSON.stringify(data);
  await writeFile(run.observations, serialized);
  let remaining = 32 * 1024 * 1024 - Buffer.byteLength(serialized) - (await readFile(path.join(run.folder, "notes/reviewer.txt"))).length;
  for (const name of names) {
    const size = Math.min(remaining, MAX_FILE_BYTES);
    await writeFile(path.join(run.folder, name), "");
    await truncate(path.join(run.folder, name), size);
    remaining -= size;
  }
  assert.equal(remaining, 0);
  await run.reseal();
  assert.ok((await readFile(run.manifest)).length > (await readFile(run.setup)).length);
  assert.equal((await verifyRun(run.manifest)).ok, true);
});

test("manifest schema, suite, hashes and exact evidence inventory fail closed", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  for (const mutate of [
    (value) => { value.schemaVersion = 2; },
    (value) => { value.extra = true; },
    (value) => { value.suiteSha256 = "0".repeat(64); },
    (value) => { value.receipt.sha256 = "bad"; },
    (value) => { value.artifacts[0].sha256 = "A".repeat(64); },
    (value) => { value.artifacts.push(value.artifacts[0]); },
    (value) => { value.artifacts[0].path = "unreferenced.txt"; },
    (value) => { value.artifacts = []; },
    (value) => { value.artifacts = null; },
  ]) {
    await run.reseal(); await changeManifest(run, mutate);
    await assert.rejects(verifyRun(run.manifest));
  }
});

test("duplicate artifacts cannot substitute for another required evidence file", async (t) => {
  const root = await directory(t), run = await makeRun(root), data = receipt();
  await writeFile(path.join(run.folder, "notes/tests.txt"), "Synthetic test receipt");
  data.cases[0].evidence.push("notes/tests.txt");
  await writeFile(run.observations, JSON.stringify(data));
  await run.reseal();
  await changeManifest(run, (value) => { value.artifacts[1] = value.artifacts[0]; });
  await assert.rejects(verifyRun(run.manifest), /duplicate artifact/);
});

test("incomplete, duplicate and unknown receipt cases remain invalid", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  for (const mutate of [
    (data) => { data.cases.pop(); },
    (data) => { data.cases.push(data.cases[0]); },
    (data) => { data.cases[0].id = "unknown"; },
  ]) {
    const data = receipt(); mutate(data);
    await writeFile(run.observations, JSON.stringify(data));
    await assert.rejects(sealRun(run.observations, run.setup));
  }
});

test("context rejects missing fixtures, ambiguous tools and malformed metrics", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  for (const mutate of [
    (input) => { input.extra = true; },
    (input) => { input.context.tools = ["terminal", "terminal"]; },
    (input) => { input.context.tools = [""]; },
    (input) => { input.context.permissions = ""; },
    (input) => { input.context.repetition = 0; },
    (input) => { input.context.repetition = 1.5; },
    (input) => { delete input.context.fixtures["bug-local"]; },
    (input) => { input.context.fixtures["bug-local"] = "unknown"; },
    (input) => { input.metrics = { wallTimeMs: 1 }; },
    (input) => { input.metrics = { wallTimeMs: -1, toolCalls: 1 }; },
    (input) => { input.metrics = { wallTimeMs: 1, toolCalls: 0.5 }; },
    (input) => { input.metrics = { wallTimeMs: 1, toolCalls: Number.MAX_SAFE_INTEGER + 1 }; },
  ]) {
    const input = context(); mutate(input);
    await writeFile(run.setup, JSON.stringify(input));
    await assert.rejects(sealRun(run.observations, run.setup));
  }
});

test("neutral paired runs tolerate metadata key order, case order and tool order", async (t) => {
  const root = await directory(t), left = await makeRun(root, "before");
  const input = context(); input.context.tools.reverse();
  input.context.fixtures = Object.fromEntries(Object.entries(input.context.fixtures).reverse());
  const data = receipt("b".repeat(40)); data.cases.reverse();
  const right = await makeRun(root, "after", data, input);
  const result = await compareRuns(left.manifest, right.manifest);
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.regressions, []);
  assert.equal(result.pairedRuns, 1);
  assert.equal(result.efficiency.available, false);
  assert.match(result.efficiency.reason, /no savings/);
});

test("paired comparisons require matching host, model, tools, permissions, repetition and fixtures", async (t) => {
  const root = await directory(t), left = await makeRun(root, "before");
  for (const field of ["host", "model", "tools", "permissions", "repetition", "fixtures"]) {
    const data = receipt("b".repeat(40)), input = context();
    if (["host", "model"].includes(field)) data.run[field] = "different";
    else if (field === "tools") input.context.tools = [];
    else if (field === "permissions") input.context.permissions = "different";
    else if (field === "repetition") input.context.repetition = 2;
    else input.context.fixtures["bug-local"] = hash("different fixture");
    const right = await makeRun(root, field, data, input);
    await assert.rejects(compareRuns(left.manifest, right.manifest), new RegExp(`Paired ${field} differs`));
  }
});

test("paired comparisons require different pinned revisions", async (t) => {
  const root = await directory(t), left = await makeRun(root, "before");
  for (const [index, revision] of ["main", "a".repeat(40), "B".repeat(40)].entries()) {
    const right = await makeRun(root, `after-${index}`, receipt(revision));
    await assert.rejects(compareRuns(left.manifest, right.manifest), /revisions/);
  }
});

test("route, scope and check regressions are explicit and gate efficiency", async (t) => {
  const root = await directory(t), input = { ...context(), metrics: { wallTimeMs: 100, toolCalls: 5 } };
  const left = await makeRun(root, "before", receipt(), input);
  const data = receipt("b".repeat(40));
  data.cases[0].route = "none"; data.cases[0].scope = "read-only";
  data.cases[0].checks["no-external-writes"] = false;
  const right = await makeRun(root, "after", data, input);
  const result = await compareRuns(left.manifest, right.manifest);
  assert.equal(result.ok, false);
  assert.deepEqual(result.regressions, [{ id: "bug-local", criteria: ["route", "scope", "check:no-external-writes"] }]);
  assert.equal(result.changes[0].fields.length, 3);
  assert.equal(result.efficiency.eligible, false);
  assert.equal(Object.hasOwn(result.efficiency, "reportedDelta"), false);
});

test("resolved checks do not authorize efficiency comparisons when the baseline failed", async (t) => {
  const root = await directory(t), data = receipt();
  data.cases[0].checks["verified-result"] = false;
  const left = await makeRun(root, "before", data);
  const right = await makeRun(root, "after", receipt("b".repeat(40)));
  const result = await compareRuns(left.manifest, right.manifest);
  assert.deepEqual(result.resolvedFailures, [{ id: "bug-local", criteria: ["check:verified-result"] }]);
  assert.equal(result.efficiency.eligible, false);
  assert.equal(result.ok, false);
});

test("accepted alternate routes are reported without inventing a regression", async (t) => {
  const root = await directory(t), left = await makeRun(root, "before"), data = receipt("b".repeat(40));
  data.cases.find((entry) => entry.id === "ambiguous-scope").route = "none";
  const right = await makeRun(root, "after", data);
  const result = await compareRuns(left.manifest, right.manifest);
  assert.equal(result.ok, true);
  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.regressions, []);
});

test("efficiency is optional reported deltas, not measured savings or quality improvement", async (t) => {
  const root = await directory(t);
  const left = await makeRun(root, "before", receipt(), { ...context(), metrics: { wallTimeMs: 0, toolCalls: 0 } });
  const right = await makeRun(root, "after", receipt("b".repeat(40)), { ...context(), metrics: { wallTimeMs: 500, toolCalls: 3 } });
  const result = await compareRuns(left.manifest, right.manifest);
  assert.deepEqual(result.efficiency.reportedDelta, { wallTimeMs: 500, toolCalls: 3 });
  assert.match(result.efficiency.limitation, /observer-reported/);
  assert.match(result.limitation, /not statistical or causal/);
  await changeManifest(right, (value) => { delete value.metrics; });
  const missing = await compareRuns(left.manifest, right.manifest);
  assert.equal(missing.efficiency.available, false);
  assert.equal(Object.hasOwn(missing.efficiency, "reportedDelta"), false);
});

test("evidence is hashed as bytes and never executed", async (t) => {
  const root = await directory(t), run = await makeRun(root);
  const body = "throw new Error('Evidence must never execute');\n";
  await writeFile(path.join(run.folder, "notes/reviewer.txt"), body);
  const sealed = await run.reseal();
  assert.equal(sealed.artifacts[0].sha256, hash(body));
  assert.equal((await verifyRun(run.manifest)).ok, true);
});

test("CLI help, seal, verify, comparison and invalid-input exit codes are stable", async (t) => {
  const root = await directory(t), left = await makeRun(root, "before with spaces"), right = await makeRun(root, "after", receipt("b".repeat(40)));
  const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.equal(cli("--help").status, 0);
  assert.match(cli("--help").stdout, /Offline, read-only/);
  for (const args of [["seal", left.observations, left.setup], ["verify", left.manifest], ["compare", left.manifest, right.manifest]]) {
    const result = cli(...args);
    assert.equal(result.status, 0, result.stdout);
    assert.equal(JSON.parse(result.stdout).schemaVersion, 1);
  }
  const data = receipt("b".repeat(40)); data.cases[0].checks["no-external-writes"] = false;
  await writeFile(right.observations, JSON.stringify(data)); await right.reseal();
  assert.equal(cli("seal", right.observations, right.setup).status, 0);
  assert.equal(cli("verify", right.manifest).status, 1);
  assert.equal(cli("compare", left.manifest, right.manifest).status, 1);
  for (const args of [[], ["unknown"], ["verify"], ["verify", left.manifest, right.manifest], ["verify", path.join(root, "missing.json")]]) {
    const result = cli(...args);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).ok, false);
  }
});
