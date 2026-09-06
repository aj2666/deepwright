import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { claimAttempt, initialize, recordEvidence, status } from "../plugins/deepwright/skills/deepwright/scripts/run-evidence.mjs";
import { validateCoverage } from "../plugins/deepwright/skills/deepwright/scripts/evidence-coverage.mjs";

const cli = fileURLToPath(new URL("../plugins/deepwright/skills/deepwright/scripts/run-evidence.mjs", import.meta.url));
const start = new Date("2030-01-01T00:00:00.000Z");
const later = new Date("2030-01-01T00:00:01.000Z");
const deadline = "2030-01-01T01:00:00.000Z";
const coverage = [{ source: "tests", scope: "unit suite", status: "complete", limitations: [] }];
const record = (files = []) => ({ kind: "decision", summary: "The observed unit check supports the local change.", coverage, files });
async function fixture(t, maxAttempts = 2, at = start, due = deadline) {
  const root = await mkdtemp(join(tmpdir(), "deepwright-run-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "project with spaces");
  const directory = join(root, "record");
  await mkdir(workspace);
  const spec = { schemaVersion: 1, runId: "parser-fix", task: "Fix the parser", scope: "Local project edits only", workspace, maxAttempts, deadline: due };
  await initialize(directory, spec, at);
  return { root, workspace, directory, spec };
}

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10_000 });
  assert.ifError(result.error);
  return { ...result, json: JSON.parse(result.stdout) };
}

test("fresh CLI processes share one attempt allowance and never reset it on resume", async (t) => {
  const { directory } = await fixture(t, 2, new Date(Date.now() - 1000), new Date(Date.now() + 60_000).toISOString());
  assert.equal(run(["claim", directory]).status, 0);
  assert.equal(run(["claim", directory]).status, 0);
  const third = run(["claim", directory]);
  assert.equal(third.status, 1);
  assert.match(third.json.error, /allowance exhausted/);
  const resumed = run(["status", directory]);
  assert.equal(resumed.status, 0);
  assert.equal(resumed.json.consumedAttempts, 2);
  assert.equal(resumed.json.remainingAttempts, 0);
  assert.equal(resumed.json.nextAttemptAllowed, false);
});

test("earlier evidence remains readable after source changes and later decisions append", async (t) => {
  const { workspace, directory } = await fixture(t);
  await writeFile(join(workspace, "checks.txt"), "7 tests passed at source snapshot A\n");
  await claimAttempt(directory, start);
  const first = await recordEvidence(directory, record([{ path: "checks.txt", label: "unit output" }]), start);
  await writeFile(join(workspace, "checks.txt"), "1 test failed at source snapshot B\n");
  const second = await recordEvidence(directory, { ...record([{ path: "checks.txt", label: "new unit output" }]), summary: "The new snapshot fails its unit check." }, later);
  assert.notEqual(first.payload.files[0].sha256, second.payload.files[0].sha256);
  const resumed = await status(directory, later);
  assert.equal(resumed.records.length, 2);
  assert.equal(await readFile(join(directory, "artifacts", first.payload.files[0].sha256), "utf8"), "7 tests passed at source snapshot A\n");
  assert.match(resumed.limitation, /current workspace state/);
});

test("deadline exhaustion refuses new attempts but still permits a truthful checkpoint", async (t) => {
  const { directory } = await fixture(t);
  const expired = new Date(deadline);
  await assert.rejects(claimAttempt(directory, expired), /deadline reached/);
  await recordEvidence(directory, {
    kind: "checkpoint", summary: "Stopped at the deadline; runtime verification is pending.", files: [],
    coverage: [{ source: "runtime tests", scope: "changed parser", status: "not-run", limitations: ["Deadline reached before this check."] }],
  }, expired);
  assert.equal((await status(directory, expired)).records[0].kind, "checkpoint");
});

test("concurrent claims cannot spend a single remaining attempt twice", async (t) => {
  const { directory } = await fixture(t, 1);
  const attempts = await Promise.allSettled([claimAttempt(directory, start), claimAttempt(directory, start)]);
  assert.equal(attempts.filter((one) => one.status === "fulfilled").length, 1);
  assert.equal((await status(directory, start)).consumedAttempts, 1);
});

test("status and claims agree at the event limit without changing full run history", async (t) => {
  const { workspace, directory } = await fixture(t);
  await writeFile(join(workspace, "source.txt"), "historical selected evidence\n");
  const saved = await recordEvidence(directory, record([{ path: "source.txt", label: "source" }]), start);

  // Seed valid history directly to avoid replaying and verifying the entire log 10,000 times.
  let previous = saved.sha256;
  for (let sequence = 2; sequence < 10_000; sequence++) {
    const body = {
      sequence, at: start.toISOString(), kind: "checkpoint",
      payload: { summary: "Synthetic historical checkpoint", coverage, files: [] }, previous,
    };
    const sha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    await writeFile(join(directory, "events", `${String(sequence).padStart(6, "0")}.json`), `${JSON.stringify({ ...body, sha256 })}\n`);
    previous = sha256;
  }
  await writeFile(join(directory, "head.json"), `${JSON.stringify({ sequence: 9_999, sha256: previous })}\n`);

  const available = await status(directory, start);
  assert.equal(available.integrity, "verified");
  assert.equal(available.records.length, 9_999);
  assert.equal(available.remainingAttempts, 2);
  assert.equal(available.nextAttemptAllowed, true);
  assert.deepEqual(available.reasons, []);
  const lastClaim = await claimAttempt(directory, start);
  assert.equal(lastClaim.sequence, 10_000);
  assert.equal(lastClaim.payload.attempt, 1);

  const full = await status(directory, start);
  assert.equal(full.integrity, "verified");
  assert.equal(full.remainingAttempts, 1);
  assert.equal(full.nextAttemptAllowed, false);
  assert.deepEqual(full.reasons, ["event limit reached"]);
  const manifest = await readFile(join(directory, "run.json"));
  const head = await readFile(join(directory, "head.json"));
  const eventNames = await readdir(join(directory, "events"));
  const runNames = await readdir(directory);

  await assert.rejects(claimAttempt(directory, start), /event limit reached/);
  assert.deepEqual(await readFile(join(directory, "run.json")), manifest);
  assert.deepEqual(await readFile(join(directory, "head.json")), head);
  assert.deepEqual(await readdir(join(directory, "events")), eventNames);
  assert.deepEqual(await readdir(directory), runNames);
  assert.deepEqual(await status(directory, start), full);
  assert.equal(await readFile(join(directory, "artifacts", saved.payload.files[0].sha256), "utf8"), "historical selected evidence\n");
});

test("initialization cannot overwrite an existing run or accept invalid limits", async (t) => {
  const { root, directory, spec } = await fixture(t);
  const before = await readFile(join(directory, "run.json"));
  await assert.rejects(initialize(directory, spec, start), /EEXIST/);
  assert.deepEqual(await readFile(join(directory, "run.json")), before);
  for (const maxAttempts of [0, -1, 1.5, null, "2"]) {
    await assert.rejects(initialize(join(root, "invalid"), { ...spec, maxAttempts }, start), /maxAttempts/);
  }
  await assert.rejects(initialize(join(root, "invalid"), { ...spec, deadline: start.toISOString() }, start), /future/);
  await assert.rejects(initialize(join(root, "invalid"), { ...spec, deadline: "2030-02-30T01:00:00.000Z" }, start), /timestamp/);
  assert.equal((await readdir(root)).includes("invalid"), false);
});

test("modified records, changed manifests, missing events, and torn writes fail closed", async (t) => {
  const { directory } = await fixture(t);
  await claimAttempt(directory, start);
  await recordEvidence(directory, record(), later);
  const file = join(directory, "events", "000001.json");
  const original = await readFile(file);
  await writeFile(file, original.toString().replace('"attempt":1', '"attempt":0'));
  await assert.rejects(status(directory, later), /hash-chain/);
  await writeFile(file, original);
  await rm(file);
  await assert.rejects(status(directory, later), /missing/);
  await writeFile(file, original);
  await writeFile(join(directory, "events", "000002.json"), '{"sequence":');
  await assert.rejects(status(directory, later), SyntaxError);
  await rm(join(directory, "events", "000002.json"));
  await assert.rejects(status(directory, later), /committed head/);
  const manifest = join(directory, "run.json");
  await writeFile(manifest, (await readFile(manifest, "utf8")).replace('"maxAttempts":2', '"maxAttempts":3'));
  await assert.rejects(status(directory, later), /hash-chain/);
});

test("deleting the last claimed attempt cannot quietly restore the remaining allowance", async (t) => {
  const { directory } = await fixture(t, 1);
  await claimAttempt(directory, start);
  await rm(join(directory, "events", "000001.json"));
  await assert.rejects(status(directory, start), /committed head/);
  await assert.rejects(claimAttempt(directory, start), /committed head/);
});

test("an event published before an interrupted head update fails closed", async (t) => {
  const { directory } = await fixture(t);
  const oldHead = await readFile(join(directory, "head.json"));
  await claimAttempt(directory, start);
  await writeFile(join(directory, "head.json"), oldHead);
  await assert.rejects(status(directory, start), /publication was interrupted/);
  await assert.rejects(claimAttempt(directory, start), /committed head/);
});

test("stored evidence corruption is visible instead of accepting stale claimed hashes", async (t) => {
  const { workspace, directory } = await fixture(t);
  await writeFile(join(workspace, "source.mjs"), "export const ready = true;\n");
  const saved = await recordEvidence(directory, record([{ path: "source.mjs", label: "source" }]), start);
  await writeFile(join(directory, "artifacts", saved.payload.files[0].sha256), "changed");
  await assert.rejects(status(directory, start), /evidence bytes changed/);
  await assert.rejects(claimAttempt(directory, start), /evidence bytes changed/);
});

test("selected evidence cannot escape the workspace through traversal or symlinks", async (t) => {
  const { root, workspace, directory } = await fixture(t);
  await writeFile(join(root, "outside.txt"), "outside");
  await symlink(join(root, "outside.txt"), join(workspace, "escape.txt"));
  for (const path of ["../outside.txt", "escape.txt", "/outside.txt", "C:\\outside.txt", "a//b", "a/./b"]) {
    await assert.rejects(recordEvidence(directory, record([{ path, label: "source" }]), start), /evidence|workspace/);
  }
  assert.equal((await status(directory, start)).records.length, 0);
  assert.deepEqual(await readdir(join(directory, "artifacts")), []);
});

test("read-only status neither rereads live source files nor creates a writer lock", async (t) => {
  const { workspace, directory } = await fixture(t);
  await writeFile(join(workspace, "source.txt"), "original");
  await recordEvidence(directory, record([{ path: "source.txt", label: "source" }]), start);
  await rm(workspace, { recursive: true });
  const before = await readdir(directory);
  assert.equal((await status(directory, later)).integrity, "verified");
  assert.deepEqual(await readdir(directory), before);
});

test("an existing writer lock is refused and never stolen", async (t) => {
  const { directory } = await fixture(t);
  await mkdir(join(directory, ".write-lock"));
  await assert.rejects(claimAttempt(directory, start), /locked/);
  assert.ok((await readdir(directory)).includes(".write-lock"));
  assert.equal((await status(directory, start)).consumedAttempts, 0);
});

test("coverage keeps empty complete checks separate from missing, truncated, and invalid attempts", () => {
  for (const status of ["partial", "unavailable", "not-run", "error"]) {
    assert.doesNotThrow(() => validateCoverage([{ source: "search", scope: "requested files", status, limitations: ["The observation is incomplete for the stated reason."] }]));
    assert.throws(() => validateCoverage([{ source: "search", scope: "requested files", status, limitations: [] }]), /limitations/);
  }
  assert.doesNotThrow(() => validateCoverage([{ source: "search", scope: "all three changed files; zero matches", status: "complete", limitations: [] }]));
  assert.throws(() => validateCoverage([{ ...coverage[0], limitations: ["Only page one was read."] }]), /omissions/);
  for (const value of [[], null, [{ ...coverage[0], status: "PASS" }], [coverage[0], coverage[0]], [{ ...coverage[0], scope: "" }]]) assert.throws(() => validateCoverage(value));
});

test("a malformed coverage record fails before writing evidence snapshots", async (t) => {
  const { workspace, directory } = await fixture(t);
  await writeFile(join(workspace, "source.txt"), "source");
  await assert.rejects(recordEvidence(directory, { ...record([{ path: "source.txt", label: "source" }]), coverage: [] }, start), /coverage/);
  assert.deepEqual(await readdir(join(directory, "artifacts")), []);
  assert.deepEqual(await readdir(join(directory, "events")), []);
});

test("an interrupted unpublished snapshot does not poison a later attempt to record the same evidence", async (t) => {
  const { workspace, directory } = await fixture(t);
  await writeFile(join(workspace, "source.txt"), "complete selected evidence");
  await writeFile(join(directory, "artifacts", "unfinished.tmp"), "complete sel");
  const saved = await recordEvidence(directory, record([{ path: "source.txt", label: "source" }]), start);
  assert.equal(await readFile(join(directory, "artifacts", saved.payload.files[0].sha256), "utf8"), "complete selected evidence");
  assert.equal((await status(directory, start)).records.length, 1);
});

test("oversized encoded records fail before publishing an event or its evidence", async (t) => {
  const { workspace, directory } = await fixture(t);
  await writeFile(join(workspace, "source.txt"), "source");
  const oversized = Array.from({ length: 6 }, (_, index) => ({ source: `source-${index}`, scope: "supplied evidence", status: "partial", limitations: Array(100).fill("x".repeat(16_384)) }));
  await assert.rejects(recordEvidence(directory, { ...record([{ path: "source.txt", label: "source" }]), coverage: oversized }, start), /8 MiB/);
  assert.deepEqual(await readdir(join(directory, "events")), []);
  assert.deepEqual(await readdir(join(directory, "artifacts")), []);
  await claimAttempt(directory, start);
  assert.equal((await status(directory, start)).consumedAttempts, 1);
});

test("status explains a backwards clock before a resumed attempt is claimed", async (t) => {
  const { directory } = await fixture(t);
  await claimAttempt(directory, later);
  const earlier = await status(directory, start);
  assert.equal(earlier.nextAttemptAllowed, false);
  assert.deepEqual(earlier.reasons, ["clock moved backwards"]);
  await assert.rejects(claimAttempt(directory, start), /clock moved backwards/);
});

test("CLI input below the byte limit is refused if the stored envelope would exceed it", async (t) => {
  const { root, workspace, directory } = await fixture(t, 2, new Date(Date.now() - 1000), new Date(Date.now() + 60_000).toISOString());
  await writeFile(join(workspace, "source.txt"), "source");
  const input = { ...record([{ path: "source.txt", label: "source" }]), coverage: Array.from({ length: 6 }, (_, index) => ({ source: `source-${index}`, scope: "supplied evidence", status: "partial", limitations: Array(100).fill("x") })) };
  const target = 8 * 1024 * 1024 - 32;
  let remaining = target - Buffer.byteLength(JSON.stringify(input));
  for (const entry of input.coverage) {
    for (let index = 0; index < entry.limitations.length && remaining > 0; index++) {
      const added = Math.min(16_383, remaining);
      entry.limitations[index] += "x".repeat(added);
      remaining -= added;
    }
  }
  assert.equal(remaining, 0);
  assert.equal(Buffer.byteLength(JSON.stringify(input)), target);
  const inputPath = join(root, "record.json");
  await writeFile(inputPath, JSON.stringify(input));
  const result = run(["record", directory, inputPath]);
  assert.equal(result.status, 1);
  assert.match(result.json.error, /encoded record exceeds/);
  assert.deepEqual(await readdir(join(directory, "events")), []);
  assert.deepEqual(await readdir(join(directory, "artifacts")), []);
  assert.equal(run(["claim", directory]).status, 0);
});

test("a removed workspace still permits a no-file checkpoint with unavailable coverage", async (t) => {
  const { workspace, directory } = await fixture(t);
  await writeFile(join(workspace, "source.txt"), "historical source");
  const saved = await recordEvidence(directory, record([{ path: "source.txt", label: "source" }]), start);
  await rm(workspace, { recursive: true });
  await recordEvidence(directory, { kind: "checkpoint", summary: "Workspace is unavailable; restore it before checking current behavior.", files: [], coverage: [{ source: "workspace", scope: "current code and runtime checks", status: "unavailable", limitations: ["The worktree was removed."] }] }, later);
  const resumed = await status(directory, later);
  assert.equal(resumed.records.length, 2);
  assert.equal(resumed.records[1].payload.coverage[0].status, "unavailable");
  assert.equal(await readFile(join(directory, "artifacts", saved.payload.files[0].sha256), "utf8"), "historical source");
});

test("CLI init, claim, record, and resumed status preserve the selected evidence", async (t) => {
  const { root, workspace, spec } = await fixture(t);
  const directory = join(root, "cli record");
  await writeFile(join(workspace, "source.txt"), "selected source");
  const specPath = join(root, "spec.json");
  const recordPath = join(root, "record.json");
  await writeFile(specPath, JSON.stringify({ ...spec, deadline: new Date(Date.now() + 60_000).toISOString() }));
  await writeFile(recordPath, JSON.stringify(record([{ path: "source.txt", label: "source" }])));
  assert.equal(run(["init", directory, specPath]).status, 0);
  assert.equal(run(["claim", directory]).status, 0);
  assert.equal(run(["record", directory, recordPath]).status, 0);
  const resumed = run(["status", directory]);
  assert.equal(resumed.status, 0);
  assert.equal(resumed.json.consumedAttempts, 1);
  assert.equal(resumed.json.records.length, 1);
  assert.equal(await readFile(join(directory, "artifacts", resumed.json.records[0].payload.files[0].sha256), "utf8"), "selected source");
});

test("a symlinked CLI really executes instead of returning an empty successful response", async (t) => {
  const { root, directory } = await fixture(t);
  const alias = join(root, "run evidence.mjs");
  await symlink(cli, alias);
  const result = spawnSync(process.execPath, [alias, "status", directory], { encoding: "utf8", timeout: 10_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).runId, "parser-fix");
});
