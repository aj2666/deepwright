import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSuite } from "./score-skill-evals.mjs";
import { sealRun } from "./verify-skill-evals.mjs";

const checkout = fileURLToPath(new URL("../", import.meta.url));
const scripts = ["score-skill-evals.mjs", "verify-skill-evals.mjs", "prepare-skill-eval.mjs", "analyze-skill-evals.mjs"];
const { expected } = await loadSuite();

async function temporary(t) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "deepwright entrypoints-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function entrypoints(t) {
  const directory = await temporary(t);
  const links = path.join(directory, "script links");
  const alias = path.join(directory, "checkout alias");
  await mkdir(links);
  await symlink(checkout, alias, "dir");
  for (const name of scripts) await symlink(path.join(checkout, "scripts", name), path.join(links, name));
  return {
    directory,
    variants: [
      { name: "direct", folder: path.join(checkout, "scripts"), options: [] },
      { name: "script symlink", folder: links, options: [] },
      { name: "checkout alias", folder: path.join(alias, "scripts"), options: [] },
      { name: "preserved checkout alias", folder: path.join(alias, "scripts"), options: ["--preserve-symlinks-main"] },
    ],
  };
}

function node(directory, args) {
  const env = { ...process.env };
  // These are ordinary CLIs/import drivers, even when their parent is node --test.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, args, {
    cwd: directory, env, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

function cli(directory, variant, script, args) {
  return node(directory, [...variant.options, path.join(variant.folder, script), ...args]);
}

function json(directory, variant, script, args, status) {
  const result = cli(directory, variant, script, args);
  assert.ok(result.stdout.trim(), `${variant.name}: ${script} ${args[0] ?? ""} must print JSON`);
  assert.equal(result.status, status, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function receipt(revision = "a".repeat(40)) {
  return {
    schemaVersion: 1,
    run: { revision, host: "synthetic-entrypoint-test", model: "synthetic-no-model-run" },
    cases: expected.map((entry) => ({
      id: entry.id, route: entry.routes[0], scope: entry.scope,
      checks: Object.fromEntries(entry.requiredChecks.map((name) => [name, true])),
      evidence: ["evidence.txt"],
    })),
  };
}

async function makeRun(directory, name, data = receipt(), mutateContext = () => {}) {
  const folder = path.join(directory, name);
  await mkdir(folder);
  const input = {
    context: {
      tools: ["read-file"], permissions: "Synthetic local evidence only", repetition: 1,
      fixtures: Object.fromEntries(expected.map((entry) => [entry.id, "none"])),
    },
    metrics: { wallTimeMs: 100, toolCalls: 1 },
  };
  mutateContext(input);
  const observations = path.join(folder, "observations.json");
  const context = path.join(folder, "context.json");
  const evidence = path.join(folder, "evidence.txt");
  const manifest = path.join(folder, "run.json");
  await writeFile(observations, JSON.stringify(data));
  await writeFile(context, JSON.stringify(input));
  await writeFile(evidence, "Synthetic evidence, not a model or project execution.\n");
  const sealed = await sealRun(observations, context);
  await writeFile(manifest, JSON.stringify(sealed));
  return { observations, context, evidence, manifest, sealed };
}

async function pairedRuns(directory) {
  const baseline = await makeRun(directory, "baseline", receipt(), (input) => {
    input.metrics = { wallTimeMs: 1000, toolCalls: 5 };
  });
  const candidate = await makeRun(directory, "candidate", receipt("b".repeat(40)));
  const data = receipt("b".repeat(40));
  const target = expected.find((entry) => entry.scope === "workspace-write" && !entry.routes.includes("none"));
  assert.ok(target);
  const observed = data.cases.find((entry) => entry.id === target.id);
  observed.route = "none";
  observed.scope = "read-only";
  observed.checks[target.requiredChecks[0]] = false;
  const failed = await makeRun(directory, "failed candidate", data);
  const mismatched = await makeRun(directory, "mismatched candidate", receipt("b".repeat(40)), (input) => {
    input.context.permissions = "Different synthetic boundary";
  });
  const tampered = await makeRun(directory, "tampered candidate", receipt("b".repeat(40)));
  await writeFile(tampered.evidence, "Changed after sealing\n");
  return { baseline, candidate, failed, mismatched, tampered, target };
}

test("all evaluation commands print help through direct paths and aliases", async (t) => {
  const { directory, variants } = await entrypoints(t);
  for (const variant of variants) await t.test(variant.name, () => {
    for (const script of scripts) {
      const result = cli(directory, variant, script, ["--help"]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.match(result.stdout, new RegExp(`Usage: node scripts/${script.replaceAll(".", "\\.")}`));
      assert.match(result.stdout, /Exit/);
    }
  });
});

test("scorer evaluates complete receipts and preserves 0/1/2 exits through every entrypoint", async (t) => {
  const { directory, variants } = await entrypoints(t);
  const complete = receipt();
  const failed = receipt();
  const last = expected.at(-1);
  failed.cases.at(-1).checks[last.requiredChecks.at(-1)] = false;
  const incomplete = receipt();
  incomplete.cases.pop();
  const files = {};
  for (const [name, data] of Object.entries({ complete, failed, incomplete })) {
    files[name] = path.join(directory, `${name} observations.json`);
    await writeFile(files[name], JSON.stringify(data));
  }
  files.malformed = path.join(directory, "malformed.json");
  await writeFile(files.malformed, "{");
  files.missing = path.join(directory, "missing.json");
  for (const variant of variants) await t.test(variant.name, () => {
    for (const [name, ok] of [["complete", true], ["failed", false]]) {
      const report = json(directory, variant, scripts[0], [files[name]], ok ? 0 : 1);
      assert.equal(report.ok, ok);
      assert.equal(report.total, expected.length);
      assert.equal(report.passed, expected.length - (ok ? 0 : 1));
      assert.equal(report.failed, ok ? 0 : 1);
      assert.deepEqual(report.results.map((entry) => entry.id), expected.map((entry) => entry.id));
      assert.deepEqual(report.results.at(-1).failures, ok ? [] : [`check: ${last.requiredChecks.at(-1)}`]);
    }
    for (const name of ["incomplete", "malformed", "missing"]) {
      const report = json(directory, variant, scripts[0], [files[name]], 2);
      assert.equal(report.ok, false);
      assert.ok(report.error);
      if (name === "incomplete") assert.match(report.error, /Missing cases:/);
    }
  });
});

test("verifier retains sealing, integrity and comparison gates through every entrypoint", async (t) => {
  const { directory, variants } = await entrypoints(t);
  const { baseline, candidate, failed, mismatched, tampered, target } = await pairedRuns(directory);
  const changedReceipt = await makeRun(directory, "changed receipt", receipt("b".repeat(40)));
  await writeFile(changedReceipt.observations, JSON.stringify(receipt("c".repeat(40))));
  const incomplete = path.join(directory, "incomplete observations.json");
  const data = receipt(); data.cases.pop();
  await writeFile(incomplete, JSON.stringify(data));
  const original = await readFile(baseline.observations);
  for (const variant of variants) await t.test(variant.name, () => {
    for (const run of [baseline, failed]) {
      assert.deepEqual(json(directory, variant, scripts[1], ["seal", run.observations, run.context], 0), run.sealed);
      const report = json(directory, variant, scripts[1], ["verify", run.manifest], run === baseline ? 0 : 1);
      assert.equal(report.artifactIntegrity, true);
      assert.equal(report.verifiedArtifacts, 1);
      assert.equal(report.score.total, expected.length);
      assert.equal(report.ok, run === baseline);
      assert.equal(report.score.failed, run === baseline ? 0 : 1);
    }
    const passing = json(directory, variant, scripts[1], ["compare", baseline.manifest, candidate.manifest], 0);
    assert.equal(passing.ok, true);
    assert.equal(passing.artifactIntegrity, true);
    assert.equal(passing.reportedConditionsMatch, true);
    assert.deepEqual(passing.regressions, []);
    assert.deepEqual(passing.efficiency.reportedDelta, { wallTimeMs: -900, toolCalls: -4 });
    const regression = json(directory, variant, scripts[1], ["compare", baseline.manifest, failed.manifest], 1);
    assert.equal(regression.ok, false);
    assert.deepEqual(regression.regressions, [{ id: target.id, criteria: ["route", "scope", `check:${target.requiredChecks[0]}`] }]);
    assert.equal(regression.efficiency.eligible, false);
    assert.equal(Object.hasOwn(regression.efficiency, "reportedDelta"), false);
    for (const [args, error] of [
      [["seal", incomplete, baseline.context], /Missing cases:/],
      [["verify", tampered.manifest], /Evidence SHA-256 mismatch/],
      [["verify", changedReceipt.manifest], /Receipt SHA-256 mismatch/],
      [["verify", path.join(directory, "missing.json")], /ENOENT/],
      [["compare", baseline.manifest, mismatched.manifest], /Paired permissions differs/],
      [["compare", baseline.manifest, tampered.manifest], /Evidence SHA-256 mismatch/],
    ]) {
      const report = json(directory, variant, scripts[1], args, 2);
      assert.equal(report.ok, false);
      assert.match(report.error, error);
    }
  });
  assert.deepEqual(await readFile(baseline.observations), original);
});

test("preparation and analysis preserve JSON results through every entrypoint", async (t) => {
  const { directory, variants } = await entrypoints(t);
  const { baseline, candidate, failed, tampered, target } = await pairedRuns(directory);
  const snapshot = path.join(directory, "synthetic snapshot");
  await mkdir(snapshot);
  await writeFile(path.join(snapshot, "sample.txt"), "Synthetic snapshot only\n");
  for (const variant of variants) await t.test(variant.name, () => {
    const listed = json(directory, variant, scripts[2], ["list"], 0);
    assert.deepEqual(listed.map((entry) => entry.id), expected.map((entry) => entry.id));
    const report = json(directory, variant, scripts[2], ["snapshot", snapshot], 0);
    assert.deepEqual(report.files.map((entry) => entry.path), ["sample.txt"]);
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
    const invalid = json(directory, variant, scripts[2], ["snapshot", path.join(directory, "missing")], 2);
    assert.equal(invalid.ok, false);
    assert.match(invalid.error, /ENOENT/);
    const passing = json(directory, variant, scripts[3], [baseline.manifest, candidate.manifest], 0);
    assert.equal(passing.ok, true);
    assert.equal(passing.pairedRuns, 1);
    assert.deepEqual(passing.failures, []);
    const regression = json(directory, variant, scripts[3], [baseline.manifest, failed.manifest], 1);
    assert.equal(regression.ok, false);
    assert.equal(regression.pairedRuns, 1);
    assert.deepEqual(regression.pairs[0].regressions, [{ id: target.id, criteria: ["route", "scope", `check:${target.requiredChecks[0]}`] }]);
    const unverifiable = json(directory, variant, scripts[3], [baseline.manifest, tampered.manifest], 2);
    assert.equal(unverifiable.ok, false);
    assert.match(unverifiable.error, /Evidence SHA-256 mismatch/);
  });
});

test("importing evaluation modules is silent and preserves the driver's exit code", async (t) => {
  const { directory, variants } = await entrypoints(t);
  const existingData = path.join(directory, "data argument.json");
  await writeFile(existingData, "{}");
  const missingData = path.join(directory, "nonexistent data argument.json");
  for (const variant of variants.filter((entry) => entry.options.length === 0)) await t.test(variant.name, async () => {
    for (const script of scripts) {
      const url = pathToFileURL(path.join(variant.folder, script)).href;
      const source = `process.exitCode = 7; await import(${JSON.stringify(url)}); console.log("imported:" + process.exitCode);\n`;
      const driver = path.join(directory, "import driver.mjs");
      await writeFile(driver, source);
      for (const args of [
        [driver, "--help"],
        ["--input-type=module", "--eval", source],
        ["--input-type=module", "--eval", source, path.join(variant.folder, script)],
        ["--input-type=module", "--eval", source, existingData],
        ["--input-type=module", "--eval", source, missingData],
      ]) {
        const result = node(directory, args);
        assert.equal(result.status, 7, `${script}: ${result.stdout}${result.stderr}`);
        assert.equal(result.stdout, "imported:7\n");
        assert.equal(result.stderr, "");
      }
    }
  });
});
