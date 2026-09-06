import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fixtures = fileURLToPath(new URL("../evals/fixtures/", import.meta.url));
const helper = fileURLToPath(new URL("../plugins/deepwright/skills/deepwright/scripts/dist/deepwright.mjs", import.meta.url));
const workloadChecksum = "e94805ea8943ae5d358cb67ce7de6bf8bfbf1d29f9ef335e6a42b632ec83727b";
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;

function run(cwd, args, timeout = 10_000) {
  const result = spawnSync(process.execPath, args, {
    cwd, env: childEnv, encoding: "utf8", timeout, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
function passing(cwd, args) {
  const result = run(cwd, args);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
}

for (const [project, filename, count] of [
  ["search", "search.test.mjs", 4], ["cache", "app.test.mjs", 3],
  ["config", "greeting.test.mjs", 1], ["loader", "loader.test.mjs", 3],
]) {
  test(`${project} has ${count} passing local correctness tests`, () => {
    const result = passing(join(fixtures, project), ["--test", "--test-reporter=tap", filename]);
    assert.match(result.stdout, new RegExp(`# pass ${count}(?:\\r?\\n|$)`));
    assert.match(result.stdout, /# fail 0(?:\r?\n|$)/);
  });
}

function benchmark(project) {
  const report = JSON.parse(passing(project, ["bench.mjs"]).stdout);
  assert.equal(report.catalogSize, 2400);
  assert.equal(report.warmups, 2);
  assert.equal(report.rounds, 7);
  assert.deepEqual(report.queries, ["harbor", "guide 000", "ORION", "  aster  ", "no-such-title", "field guide 12"]);
  assert.equal(report.samplesMs.length, report.rounds);
  assert.ok(report.samplesMs.every((duration) => Number.isFinite(duration) && duration > 0));
  assert.equal(report.medianMs, [...report.samplesMs].sort((left, right) => left - right)[3]);
  assert.match(report.checksum, /^[a-f0-9]{64}$/);
  return report;
}

// These controls exercise fixture behavior, not agent performance or compliance.
// They remain outside the neutral project staged for a candidate.
const indexedSearch = `export function createSearch(serializedRecords) {
  const entries = serializedRecords.map((source) => {
    const { id, title } = JSON.parse(source);
    return { id, title, normalized: title.toLowerCase() };
  });
  return (query) => {
    const needle = query.trim().toLowerCase();
    const results = needle ? entries.filter((entry) => entry.normalized.includes(needle))
      .map(({ id, title }) => ({ id, title })) : [];
    return { results, total: results.length };
  };
}\n`;

test("search benchmark preserves a pinned workload across a valid optimization", async (t) => {
  const baseline = benchmark(join(fixtures, "search"));
  assert.equal(baseline.checksum, workloadChecksum);
  const project = await mkdtemp(join(tmpdir(), "deepwright-search-control-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await cp(join(fixtures, "search"), project, { recursive: true });
  await writeFile(join(project, "search.mjs"), indexedSearch);
  const correctness = passing(project, ["--test", "--test-reporter=tap", "search.test.mjs"]);
  assert.match(correctness.stdout, /# pass 4(?:\r?\n|$)/);
  const optimized = benchmark(project);
  assert.equal(optimized.checksum, workloadChecksum);
  // Timing is evidence to inspect, never a machine-dependent CI gate.
  t.diagnostic(`Same-workload medians: baseline=${baseline.medianMs.toFixed(3)}ms, indexed control=${optimized.medianMs.toFixed(3)}ms; identical response checksum.`);
});

test("search response checksum detects an optimization that drops matches", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "deepwright-search-fault-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await cp(join(fixtures, "search"), project, { recursive: true });
  await writeFile(join(project, "search.mjs"), indexedSearch.replace(
    "return { results, total: results.length };", "return { results: results.slice(0, 5), total: results.length };",
  ));
  assert.notEqual(benchmark(project).checksum, workloadChecksum);
});

async function observeRetainedTestProcess() {
  // Run the test file directly: node:test still executes both tests, and there
  // is only one process to terminate. A --test worker would need group cleanup.
  const child = spawn(process.execPath, ["--test-reporter=tap", "labels.test.mjs"], {
    cwd: join(fixtures, "hanging-tests"), env: childEnv, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "", afterCompletion, reason;
  const deadline = setTimeout(() => { reason = "deadline"; child.kill("SIGKILL"); }, 5000);
  return await new Promise((resolve, reject) => {
    child.stdout.on("data", (bytes) => {
      stdout += bytes.toString();
      if (!afterCompletion && /^ok 2 - rejects non-string labels without recording success$/m.test(stdout)) {
        afterCompletion = setTimeout(() => {
          reason = "retained-after-completion";
          child.kill("SIGTERM");
        }, 300);
      }
    });
    child.stderr.on("data", (bytes) => { stderr += bytes.toString(); });
    child.on("error", (error) => {
      clearTimeout(deadline); clearTimeout(afterCompletion); reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(deadline); clearTimeout(afterCompletion);
      resolve({ stdout, stderr, status, signal, reason });
    });
  });
}

test("hanging fixture completes both tests but keeps its process alive", async () => {
  const result = await observeRetainedTestProcess();
  assert.equal(result.reason, "retained-after-completion", result.stdout + result.stderr);
  assert.equal(result.status, null);
  assert.equal(result.signal, "SIGTERM");
  assert.match(result.stdout, /^ok 1 - normalizes a label and records successful processing$/m);
  assert.match(result.stdout, /^ok 2 - rejects non-string labels without recording success$/m);
  assert.doesNotMatch(result.stdout, /^not ok/m);
  assert.equal(result.stderr, "");
});

test("unreferencing the fixture interval lets the same completed tests exit", () => {
  const entry = pathToFileURL(join(fixtures, "hanging-tests", "labels.test.mjs")).href;
  const source = `const original = globalThis.setInterval;
    globalThis.setInterval = (...args) => { const timer = original(...args); timer.unref(); return timer; };
    await import(${JSON.stringify(entry)});`;
  const result = passing(join(fixtures, "hanging-tests"), ["--test-reporter=tap", "--input-type=module", "-e", source]);
  assert.match(result.stdout, /# pass 2(?:\r?\n|$)/);
  assert.match(result.stdout, /# fail 0(?:\r?\n|$)/);
});

test("configuration is valid under the actual helper and retains default provenance", async () => {
  const project = join(fixtures, "config");
  const filename = join(project, ".codex", "deepwright.toml");
  const before = await readFile(filename);
  const report = JSON.parse(passing(project, [helper, "config", "show", "--json"]).stdout);
  assert.equal(report.state, "present");
  assert.equal(report.validation, "passed");
  assert.equal(report.ok, true);
  assert.deepEqual(report.settings.roles, { code: "inherit-parent", research: "inherit-parent", review: "inherit-parent" });
  assert.deepEqual(report.settings.parallelism, { swarm_workers: 2, design_candidates: 3, reviewers: 3 });
  assert.equal(report.sources["roles.code"], "project");
  assert.equal(report.sources["roles.review"], "project");
  assert.equal(report.sources["roles.research"], "default");
  assert.equal(report.sources["parallelism.swarm_workers"], "project");
  assert.equal(report.sources["parallelism.reviewers"], "default");
  assert.equal(report.hostValidation, "not-performed");
  assert.deepEqual(report.unverifiedModelRoles, []);
  assert.deepEqual(await readFile(filename), before);
});

test("loader outcome reproducibly changes with only the working directory", async (t) => {
  const project = join(fixtures, "loader");
  const unrelated = await mkdtemp(join(tmpdir(), "deepwright-loader-cwd-"));
  t.after(() => rm(unrelated, { recursive: true, force: true }));
  const args = [join(project, "cli.mjs"), "users"];
  for (let repetition = 0; repetition < 2; repetition += 1) {
    assert.deepEqual(JSON.parse(passing(project, args).stdout), [
      { id: 1, name: "Sam" }, { id: 2, name: "Jo" },
    ]);
    const failure = run(unrelated, args);
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /ENOENT/);
    assert.match(failure.stderr, /data\/users\.json/);
  }
});
