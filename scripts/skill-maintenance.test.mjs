import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, writeFile, readFile, rm, symlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadSuite } from './score-skill-evals.mjs';
import { sealRun, analyzeRuns } from './verify-skill-evals.mjs';
import { stocktake, compareStocktakes, validateSnapshot } from './skill-stocktake.mjs';

const { expected } = await loadSuite();
async function temporary(t) { const dir = await mkdtemp(path.join(tmpdir(), 'deepwright-maintenance-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
async function run(root, arm, repetition, mutate = () => {}) {
  const folder = path.join(root, `${arm}-${repetition}`); await mkdir(folder);
  const receipt = { schemaVersion: 1, run: { revision: (arm === 'baseline' ? 'a' : 'b').repeat(40), host: 'synthetic', model: 'synthetic' },
    cases: expected.map((entry) => ({ id: entry.id, route: entry.routes[0], scope: entry.scope, checks: Object.fromEntries(entry.requiredChecks.map((name) => [name, true])), evidence: ['evidence.txt'] })) };
  const context = { context: { tools: ['read'], permissions: 'Synthetic self-tests only', repetition, fixtures: Object.fromEntries(expected.map((entry) => [entry.id, 'none'])) } };
  mutate(receipt, context);
  await writeFile(path.join(folder, 'evidence.txt'), `Synthetic fixture, not an agent trial: ${arm} ${repetition}`);
  const observations = path.join(folder, 'observations.json'), setup = path.join(folder, 'context.json'), manifest = path.join(folder, 'run.json');
  await writeFile(observations, JSON.stringify(receipt)); await writeFile(setup, JSON.stringify(context));
  await writeFile(manifest, JSON.stringify(await sealRun(observations, setup)));
  return manifest;
}
async function pair(root, n, mutate = () => {}) { return [await run(root, 'baseline', n), await run(root, 'candidate', n, mutate)]; }

test('analysis retains recurring criterion failures, regressions, and ineligible efficiency', async (t) => {
  const root = await temporary(t);
  const mutate = (receipt) => { receipt.cases[0].checks['no-external-writes'] = false; };
  const pairs = [await pair(root, 2, mutate), await pair(root, 1, mutate)];
  const report = await analyzeRuns(pairs);
  assert.equal(report.ok, false); assert.equal(report.pairedRuns, 2);
  assert.deepEqual(report.failures[0].candidate, [1, 2]);
  assert.equal(report.failures[0].recurringInCandidate, true);
  assert.deepEqual(report.failures[0].expectedRoutes, ['deepwright/bug-fix']);
  assert.ok(report.pairs.every((p) => p.regressions.length === 1 && !p.efficiency.eligible));
  assert.match(report.limitation, /not independent trials/);
});
test('one failure is not recurrence; resolved failures remain visible and do not confer a clean pair', async (t) => {
  const root = await temporary(t);
  const baseline = await run(root, 'baseline', 1, (r) => { r.cases[0].scope = 'read-only'; r.cases[0].route = 'none'; });
  const candidate = await run(root, 'candidate', 1);
  const result = await analyzeRuns([[baseline, candidate]]);
  assert.equal(result.ok, false);
  assert.deepEqual(new Set(result.failures.map((f) => f.category)), new Set(['authority', 'routing']));
  assert.ok(result.failures.every((f) => !f.recurringInCandidate && f.baseline.length === 1));
  assert.equal(result.pairs[0].resolvedFailures.length, 1);
});
test('clean matched pairs pass with no invented failures', async (t) => {
  const root = await temporary(t), report = await analyzeRuns([await pair(root, 1), await pair(root, 2)]);
  assert.equal(report.ok, true); assert.deepEqual(report.failures, []);
});
test('analysis rejects manifest reuse, repeated IDs, mixed cohorts, malformed booleans, and tampering', async (t) => {
  const root = await temporary(t), first = await pair(root, 1);
  await assert.rejects(analyzeRuns([first, first]), /reused/);
  const second = await pair(root, 2);
  for (const filename of second) {
    const manifest = JSON.parse(await readFile(filename, 'utf8')); manifest.context.repetition = 1;
    await writeFile(filename, JSON.stringify(manifest));
  }
  await assert.rejects(analyzeRuns([first, second]), /repetition identifier/);
  const mixedRoot = await temporary(t);
  const third = await pair(mixedRoot, 3);
  for (const filename of third) {
    const manifest = JSON.parse(await readFile(filename, 'utf8')); manifest.context.tools.push('extra');
    await writeFile(filename, JSON.stringify(manifest));
  }
  await assert.rejects(analyzeRuns([first, third]), /separate cohorts/);
  await assert.rejects(run(root, 'candidate', 9, (r) => { r.cases[0].checks['no-external-writes'] = 'false'; }), /booleans/);
  await writeFile(path.join(path.dirname(first[1]), 'evidence.txt'), 'altered');
  await assert.rejects(analyzeRuns([first]), /SHA-256 mismatch/);
});
test('analysis CLI reports passing, failed, invalid and help exits without writing artifacts', async (t) => {
  const root = await temporary(t), clean = await pair(root, 1), broken = await pair(root, 2, (r) => { r.cases[0].checks['verified-result'] = false; });
  const cli = new URL('./analyze-skill-evals.mjs', import.meta.url);
  const exec = (args) => spawnSync(process.execPath, [cli.pathname, ...args], { encoding: 'utf8', timeout: 10000 });
  assert.equal(exec(clean).status, 0); assert.equal(exec(broken).status, 1);
  assert.equal(exec([]).status, 2); assert.equal(exec(['--help']).status, 0);
  assert.equal(JSON.parse(exec(clean).stdout).pairedRuns, 1);
});

test('analysis rejects differently named manifests that relabel the same underlying receipts', async (t) => {
  const root = await temporary(t), first = await pair(root, 1), renamed = [];
  for (const filename of first) {
    const manifest = JSON.parse(await readFile(filename, 'utf8'));
    manifest.context.repetition = 2;
    const alias = path.join(path.dirname(filename), 'relabelled.json');
    await writeFile(alias, JSON.stringify(manifest)); renamed.push(alias);
  }
  await assert.rejects(analyzeRuns([first, renamed]), /underlying receipt.*reused/);
});

test('analysis rejects copied run directories relabelled as additional repetitions', async (t) => {
  const root = await temporary(t), first = await pair(root, 1), copied = [];
  for (const [index, filename] of first.entries()) {
    const destination = path.join(root, `copy-${index}`);
    await cp(path.dirname(filename), destination, { recursive: true });
    const copy = path.join(destination, 'run.json');
    const manifest = JSON.parse(await readFile(copy, 'utf8')); manifest.context.repetition = 2;
    await writeFile(copy, JSON.stringify(manifest)); copied.push(copy);
  }
  await assert.rejects(analyzeRuns([first, copied]), /Identical receipt and evidence/);
});

async function skill(root, name, text = '') {
  const folder = path.join(root, 'skills', name); await mkdir(path.join(folder, 'agents'), { recursive: true });
  await writeFile(path.join(folder, 'SKILL.md'), `---\nname: ${name}\ndescription: "Synthetic catalog test"\n---\n${text}\n`);
  await writeFile(path.join(folder, 'agents/openai.yaml'), `interface:\n  display_name: "Synthetic"\npolicy:\n  allow_implicit_invocation: ${name === 'deepwright'}\n`);
  return folder;
}
test('stocktake detects reference content, metadata, asset and script changes with dependent closure', async (t) => {
  const root = await temporary(t), a = await skill(root, 'alpha', '[detail](../beta/detail.md)'), b = await skill(root, 'beta'), c = await skill(root, 'gamma', '$deepwright:alpha');
  await writeFile(path.join(b, 'detail.md'), 'v1');
  const before = await stocktake(root);
  await writeFile(path.join(b, 'detail.md'), 'v2');
  const after = await stocktake(root), report = compareStocktakes(before, after);
  assert.deepEqual(report.changed, ['beta']); assert.deepEqual(report.dependents, ['alpha', 'gamma']);
  for (const file of ['agents/openai.yaml', 'asset.txt', 'helper.mjs']) {
    const current = await stocktake(root);
    if (file.endsWith('yaml')) await writeFile(path.join(a, file), 'interface:\n  display_name: "Renamed"\npolicy:\n  allow_implicit_invocation: false\n');
    else await writeFile(path.join(a, file), 'new');
    assert.deepEqual(compareStocktakes(current, await stocktake(root)).changed, ['alpha']);
  }
  assert.ok(c);
});
test('stocktake ignores mtime-only changes and installed dependencies, detects file and skill removals', async (t) => {
  const root = await temporary(t), a = await skill(root, 'alpha', '$deepwright:beta'), b = await skill(root, 'beta');
  await writeFile(path.join(b, 'detail.md'), 'detail'); const before = await stocktake(root);
  await utimes(path.join(b, 'detail.md'), new Date(), new Date(0));
  await mkdir(path.join(b, 'node_modules')); await writeFile(path.join(b, 'node_modules/ignored'), 'installed');
  assert.deepEqual(await stocktake(root), before);
  await rm(path.join(b, 'detail.md')); assert.deepEqual(compareStocktakes(before, await stocktake(root)).changed, ['beta']);
  await rm(b, { recursive: true }); const removed = compareStocktakes(before, await stocktake(root));
  assert.deepEqual(removed.removed, ['beta']); assert.deepEqual(removed.dependents, ['alpha']);
  await skill(root, 'gamma'); assert.deepEqual(compareStocktakes(before, await stocktake(root)).added, ['gamma']);
  assert.ok(a);
});

test('stocktake invalidates static links with titles, reference definitions, angles and encoded paths', async (t) => {
  const root = await temporary(t), target = await skill(root, 'target');
  for (const [name, body] of [
    ['titled', '[target](../target/SKILL.md "Target skill")'],
    ['reference', '[target][ref]\n\n[ref]: ../target/SKILL.md "Target skill"'],
    ['angled', '[target](<../target/a b.md> "Target skill")'],
    ['encoded', '[target](../%74arget/SKILL.md)'],
  ]) await skill(root, name, body);
  const before = await stocktake(root);
  await writeFile(path.join(target, 'new-reference.md'), 'new');
  const report = compareStocktakes(before, await stocktake(root));
  assert.deepEqual(report.changed, ['target']);
  assert.deepEqual(report.dependents, ['angled', 'encoded', 'reference', 'titled']);
});
test('stocktake rejects symlinks and invalid snapshots rather than silently dropping entries', async (t) => {
  const root = await temporary(t), a = await skill(root, 'alpha'); const snapshot = await stocktake(root);
  for (const mutate of [(s) => s.skills.push(s.skills[0]), (s) => s.skills[0].sha256 = 'bad', (s) => s.skills[0].dependencies = ['alpha'], (s) => s.extra = true]) {
    const changed = structuredClone(snapshot); mutate(changed); assert.throws(() => validateSnapshot(changed));
  }
  await symlink(path.join(a, 'SKILL.md'), path.join(a, 'linked.md'));
  await assert.rejects(stocktake(root), /symlinks/);
});
test('stocktake CLI works through a symlink and compares saved snapshots', async (t) => {
  const root = await temporary(t); await skill(root, 'alpha');
  const cli = path.join(root, 'stocktake.mjs'); await symlink(new URL('./skill-stocktake.mjs', import.meta.url).pathname, cli);
  const exec = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 });
  const first = exec(['snapshot', root]); assert.equal(first.status, 0);
  const saved = path.join(root, 'snapshot.json'); await writeFile(saved, first.stdout);
  const compared = exec(['compare', saved, saved]); assert.equal(compared.status, 0); assert.deepEqual(JSON.parse(compared.stdout).changed, []);
  assert.equal(exec(['compare', saved]).status, 2); assert.equal(exec(['--help']).status, 0);
});
