import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, prepare, snapshot } from "./prepare-skill-eval.mjs";

const cli = fileURLToPath(new URL("./prepare-skill-eval.mjs", import.meta.url));
const observerPath = /^(?:(?:expected|prompts|fixtures|observations)\.json$|(?:checks|scripts)\/)/;
function assertCandidateFiles(files) {
  for (const { path } of files) assert.equal(observerPath.test(path), false, `observer file copied: ${path}`);
}
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), "deepwright-eval-workspace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
function command(executable, args, options = {}) {
  const env = { ...process.env, ...options.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(executable, args, { encoding: "utf8", timeout: 10_000, ...options, env });
  assert.ifError(result.error);
  return result;
}

test("every corpus case prepares its declared project without copying the observer rubric", async (t) => {
  const root = await temporary(t);
  const { prompts, fixtures } = await loadFixtures();
  assert.equal(fixtures.length, 34);
  assert.deepEqual(new Set(fixtures.map(({ id }) => id)), new Set(prompts.map(({ id }) => id)));
  for (const [index, fixture] of fixtures.entries()) {
    const report = await prepare(fixture.id, join(root, `project ${index}`));
    assert.equal(report.prompt, prompts.find(({ id }) => id === fixture.id).prompt);
    assert.equal(report.workingSha256, (await snapshot(report.directory)).sha256);
    assertCandidateFiles(report.files);
    if (fixture.project === null) {
      assert.equal(report.fixtureSha256, "none");
      assert.equal(report.head, null);
      assert.deepEqual(await readdir(report.directory), []);
    } else {
      assert.match(report.fixtureSha256, /^[a-f0-9]{64}$/);
      assert.match(report.head, /^[a-f0-9]{40}$/);
      assert.ok(report.files.length > 0);
      assert.equal(command("git", ["remote"], { cwd: report.directory }).stdout, "");
    }
  }
});

test("observer-file guard rejects nested observer scripts and accepts ordinary project files", () => {
  for (const path of ["expected.json", "prompts.json", "fixtures.json", "observations.json",
    "checks/retry.mjs", "checks/nested/acceptance.mjs", "scripts/score-skill-evals.mjs"]) {
    assert.throws(() => assertCandidateFiles([{ path }]), /observer file copied/);
  }
  assertCandidateFiles(["request.test.mjs", "reports/tests.json", "records/change-17.md",
    "checksums.json", "scripts-notes.md", "expected.json.backup", "data/expected.json"].map((path) => ({ path })));
});

test("preparation is reproducible across directories and preserves the committed fixture sources", async (t) => {
  const root = await temporary(t);
  const source = fileURLToPath(new URL("../evals/fixtures/parser", import.meta.url));
  const before = await snapshot(source);
  const a = await prepare("explicit-tdd", join(root, "one"));
  const b = await prepare("explicit-tdd", join(root, "two with spaces"));
  assert.equal(a.fixtureSha256, b.fixtureSha256);
  assert.equal(a.head, b.head);
  assert.deepEqual(a.files, b.files);
  assert.deepEqual(await snapshot(source), before);
});

test("checkpoint preparation produces real unfinished Git work and a matching handoff", async (t) => {
  const root = await temporary(t);
  const report = await prepare("resume-read-only", join(root, "project"));
  assert.notEqual(report.baseSha256, report.workingSha256);
  const state = command("git", ["status", "--porcelain"], { cwd: report.directory });
  assert.equal(state.status, 0);
  assert.match(state.stdout, / M request\.mjs/);
  assert.match(state.stdout, / M request\.test\.mjs/);
  assert.match(state.stdout, /\?\? HANDOFF\.md/);
  const base = command("git", ["show", "HEAD:request.mjs"], { cwd: report.directory });
  assert.equal(base.status, 0);
  assert.notEqual(base.stdout, await readFile(join(report.directory, "request.mjs"), "utf8"));
  const tests = command(process.execPath, ["--test", "request.test.mjs"], { cwd: report.directory });
  assert.equal(tests.status, 1);
  assert.match(await readFile(join(report.directory, "HANDOFF.md"), "utf8"), /node --test request\.test\.mjs/);
  assert.equal((await snapshot(report.directory)).sha256, report.workingSha256, "fixture tests themselves must not modify project files");
});

test("snapshot detects source and untracked-file changes while excluding Git implementation files", async (t) => {
  const root = await temporary(t);
  const report = await prepare("feature-bounded", join(root, "project"));
  await writeFile(join(report.directory, ".git", "description"), "changed internal metadata");
  assert.equal((await snapshot(report.directory)).sha256, report.workingSha256);
  await writeFile(join(report.directory, "request.mjs"), "changed source");
  const changed = await snapshot(report.directory);
  assert.notEqual(changed.sha256, report.workingSha256);
  await writeFile(join(report.directory, "untracked.txt"), "new evidence");
  assert.notEqual((await snapshot(report.directory)).sha256, changed.sha256);
});

test("preparation refuses unknown cases and existing destinations without overwriting user files", async (t) => {
  const root = await temporary(t);
  const destination = join(root, "existing");
  await mkdir(destination);
  await writeFile(join(destination, "mine.txt"), "keep");
  await assert.rejects(prepare("bug-local", destination), /EEXIST/);
  assert.equal(await readFile(join(destination, "mine.txt"), "utf8"), "keep");
  await assert.rejects(prepare("not-a-case", join(root, "new")), /unknown evaluation case/);
  assert.deepEqual(await readdir(root), ["existing"]);
});

test("preparation protects fixture sources through direct paths and parent aliases", async (t) => {
  const root = await temporary(t);
  // Run a real copied CLI so a failing guard can only contaminate this disposable
  // source tree, never the repository's reusable fixtures.
  const checkout = join(root, "checkout");
  await mkdir(join(checkout, "scripts"), { recursive: true });
  await mkdir(join(checkout, "evals", "fixtures"), { recursive: true });
  for (const file of ["prepare-skill-eval.mjs", "score-skill-evals.mjs", "is-main.mjs"]) {
    await copyFile(new URL(file, import.meta.url), join(checkout, "scripts", file));
  }
  for (const file of ["prompts.json", "expected.json", "fixtures.json"]) {
    await copyFile(new URL("../evals/" + file, import.meta.url), join(checkout, "evals", file));
  }
  const sources = join(checkout, "evals", "fixtures");
  await cp(new URL("../evals/fixtures/csv/", import.meta.url), join(sources, "csv"), { recursive: true });
  const alias = join(root, "fixture alias");
  await symlink(sources, alias, "dir");
  const before = await snapshot(sources);
  const copiedCli = join(checkout, "scripts", "prepare-skill-eval.mjs");
  for (const destination of [sources, join(sources, "direct"), join(sources, "csv", "nested"), join(alias, "csv", "aliased")]) {
    const result = command(process.execPath, [copiedCli, "prepare", "bug-local", destination]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(JSON.parse(result.stdout).error, /outside the fixture source directory/);
    assert.deepEqual(await snapshot(sources), before);
  }
  // A sibling sharing the fixture directory's name prefix is a valid target.
  const allowed = command(process.execPath, [copiedCli, "prepare", "bug-local", join(checkout, "evals", "fixtures-copy")]);
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
  assert.match(JSON.parse(allowed.stdout).fixtureSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(await snapshot(sources), before);
});

test("CLI preparation ignores ambient Git redirection and prints only the ordinary prompt plus setup receipt", async (t) => {
  const root = await temporary(t);
  const destination = join(root, "project");
  const index = join(root, "outside-index");
  const output = command(process.execPath, [cli, "prepare", "review-partial-coverage", destination], {
    env: { ...process.env, GIT_DIR: join(root, "unrelated-git"), GIT_INDEX_FILE: index },
  });
  assert.equal(output.status, 0, output.stderr + output.stdout);
  const report = JSON.parse(output.stdout);
  assert.equal(report.id, "review-partial-coverage");
  assert.equal(Object.hasOwn(report, "requiredChecks"), false);
  assert.equal(Object.hasOwn(report, "routes"), false);
  assert.equal((await readdir(root)).includes("outside-index"), false);
  assert.equal((await readdir(root)).includes("unrelated-git"), false);
});

test("snapshot refuses escaping symlinks instead of including unrelated files", async (t) => {
  const root = await temporary(t);
  const destination = join(root, "project");
  await mkdir(destination);
  await writeFile(join(root, "outside.txt"), "outside");
  await symlink(join(root, "outside.txt"), join(destination, "escape.txt"));
  await assert.rejects(snapshot(destination), /symlink/);
});

test("help and invalid commands do not prepare a project", async (t) => {
  const root = await temporary(t);
  const help = command(process.execPath, [cli, "--help"], { cwd: root });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /never runs project code or a model/);
  const invalid = command(process.execPath, [cli, "prepare", "bug-local"], { cwd: root });
  assert.equal(invalid.status, 2);
  assert.deepEqual(await readdir(root), []);
});
