import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyInstalledPlugin } from "./verify-installed-plugin.mjs";
import { loadCatalog } from "../plugins/deepwright/skills/deepwright/scripts/discovery/metadata.mjs";

const cli = fileURLToPath(new URL("./verify-installed-plugin.mjs", import.meta.url));
const pluginId = "deepwright@deepwright";
async function put(filename, body) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, body);
}

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "deepwright-install [space];-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const expectedPluginRoot = path.join(root, "expected");
  const loadedRoot = path.join(root, "loaded");
  const cwd = path.join(root, "project");
  await mkdir(cwd);
  await put(path.join(expectedPluginRoot, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "deepwright", skills: "./skills/", version: "1.3.0" }));
  await put(path.join(expectedPluginRoot, "assets", "icon.bin"), Buffer.from([0, 255, 20, 30]));
  await put(path.join(expectedPluginRoot, "LICENSE"), "Fixture license\n");
  const skills = [];
  for (const name of ["deepwright", "feature"]) {
    const description = "Run the " + name + " workflow.";
    const skillDirectory = path.join(expectedPluginRoot, "skills", name);
    await put(path.join(skillDirectory, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\ndisable-model-invocation: ${name !== "deepwright"}\n---\n\nFollow [details](references/details.md).\n`);
    await put(path.join(skillDirectory, "agents", "openai.yaml"), `interface:\n  display_name: ${name}\npolicy:\n  allow_implicit_invocation: ${name === "deepwright"}\n`);
    await put(path.join(skillDirectory, "references", "details.md"), "Expected reference\n");
    await put(path.join(skillDirectory, "scripts", "helper.mjs"), "export const result = true;\n");
    skills.push({ name: "deepwright:" + name, description, path: path.join(loadedRoot, "skills", name, "SKILL.md"), scope: "user", enabled: true, pluginId });
  }
  await cp(expectedPluginRoot, loadedRoot, { recursive: true });
  const request = { id: 2, method: "skills/list", params: { cwds: [cwd], forceReload: false } };
  const response = { id: 2, result: { data: [{ cwd, skills, errors: [] }] } };
  return { root, loadedRoot, expectedPluginRoot, cwd, pluginId, request, response, skills };
}

test("saved native catalog and complete copied package match, without invocation or installation claims", async (t) => {
  const f = await fixture(t);
  // Unrelated plugins in the same native catalog cannot supply Deepwright skills.
  f.skills.push({ name: "other:feature", description: "Other skill", path: "/other/SKILL.md", scope: "user", enabled: true, pluginId: "other@other" });
  const report = await verifyInstalledPlugin(f);
  assert.equal(report.status, "pass");
  assert.equal(report.skillCount, 2);
  assert.equal(report.fileCount, 11);
  assert.equal(report.loadedPluginRoot, f.loadedRoot);
  assert.match(report.sha256, /^[0-9a-f]{64}$/);
  assert.equal(report.installation, "not-observed");
  assert.equal(report.invocation, "not-observed");
});

for (const [name, change, reason] of [
  ["missing plugin", (f) => { f.response.result.data[0].skills = []; }, /missing from the native catalog/],
  ["missing leaf skill", (f) => { f.skills.pop(); }, /missing expected skills/],
  ["disabled router", (f) => { f.skills[0].enabled = false; }, /disabled/],
  ["disabled leaf", (f) => { f.skills[1].enabled = false; }, /disabled/],
  ["same name from another marketplace", (f) => { f.skills[0].pluginId = "deepwright@other"; }, /different or missing pluginId/],
  ["missing owning plugin", (f) => { delete f.skills[0].pluginId; }, /different or missing pluginId/],
  ["bare names are not native plugin names", (f) => { f.skills[0].name = "deepwright"; }, /Unexpected Deepwright skill/],
  ["duplicate canonical skill", (f) => { f.skills.push({ ...f.skills[0] }); }, /Duplicate Deepwright skill/],
  ["extra skill", (f) => { f.skills.push({ ...f.skills[0], name: "deepwright:extra" }); }, /Unexpected Deepwright skill/],
  ["catalog parse errors", (f) => { f.response.result.data[0].errors.push({ path: f.skills[0].path, message: "invalid metadata" }); }, /loading errors/],
  ["stale metadata", (f) => { f.skills[0].description = "Old description"; }, /description differs/],
  ["unmatched response id", (f) => { f.response.id = 3; }, /saved request id/],
  ["protocol error response", (f) => { f.response.error = { message: "Unavailable" }; }, /successful reply/],
  ["wrong request cwd", (f) => { f.request.params.cwds = [f.root]; }, /request must name exactly/],
  ["omitted request cwd", (f) => { delete f.request.params.cwds; }, /request must name exactly/],
  ["extra requested cwd", (f) => { f.request.params.cwds.push(f.root); }, /request must name exactly/],
  ["wrong response cwd", (f) => { f.response.result.data[0].cwd = f.root; }, /response must contain exactly/],
  ["extra unrelated response cwd", (f) => { f.response.result.data.push({ cwd: f.root, skills: [], errors: [] }); }, /response must contain exactly/],
  ["duplicate response cwd", (f) => { f.response.result.data.push(f.response.result.data[0]); }, /response must contain exactly/],
  ["unsupported extra skill roots", (f) => { f.request.params.perCwdExtraUserRoots = []; }, /Unsupported skills\/list/],
  ["relative skill path", (f) => { f.skills[0].path = "skills/deepwright/SKILL.md"; }, /Invalid native scope or skill path/],
  ["invalid skill scope", (f) => { f.skills[0].scope = "plugin"; }, /Invalid native scope or skill path/],
  ["source echoed as loaded package", (f) => { for (const skill of f.skills) skill.path = skill.path.replace(f.loadedRoot, f.expectedPluginRoot); }, /echo or overlap/],
]) {
  test("rejects " + name, async (t) => {
    const f = await fixture(t);
    change(f);
    await assert.rejects(verifyInstalledPlugin(f), reason);
  });
}

for (const file of ["SKILL.md", "references/details.md", "agents/openai.yaml", "scripts/helper.mjs"]) {
  test("rejects changed installed " + file + " despite otherwise correct catalog", async (t) => {
    const f = await fixture(t);
    await writeFile(path.join(f.loadedRoot, "skills", "feature", file), "Stale installed file\n");
    await assert.rejects(verifyInstalledPlugin(f), /Plugin bytes differ/);
  });
}

for (const file of [".codex-plugin/plugin.json", "assets/icon.bin", "LICENSE"]) {
  test("compares package content beyond skill directories: " + file, async (t) => {
    const f = await fixture(t);
    const target = path.join(f.loadedRoot, file);
    await writeFile(target, (await readFile(target, "utf8")) + " ");
    await assert.rejects(verifyInstalledPlugin(f), /Plugin bytes differ/);
  });
}

test("rejects missing and extra installed reference files", async (t) => {
  const f = await fixture(t);
  const target = path.join(f.loadedRoot, "skills", "feature", "references", "details.md");
  await rm(target);
  await put(path.join(path.dirname(target), "unexpected.md"), "unexpected\n");
  await assert.rejects(verifyInstalledPlugin(f), (error) => /Plugin bytes differ/.test(error.message) && /missing/.test(error.message) && /extra/.test(error.message));
});

test("rejects a mixed catalog assembled from two copied plugin versions", async (t) => {
  const f = await fixture(t);
  const other = path.join(f.root, "other-copy");
  await cp(f.loadedRoot, other, { recursive: true });
  f.skills[1].path = f.skills[1].path.replace(f.loadedRoot, other);
  await assert.rejects(verifyInstalledPlugin(f), /different plugin roots/);
});

test("rejects symlink source echo and symlinked reference escapes", async (t) => {
  const f = await fixture(t);
  const alias = path.join(f.root, "source-alias");
  await symlink(f.expectedPluginRoot, alias, "dir");
  const original = f.skills[0].path;
  f.skills[0].path = original.replace(f.loadedRoot, alias);
  await assert.rejects(verifyInstalledPlugin(f), /echo or overlap/);
  f.skills[0].path = original;
  const reference = path.join(f.loadedRoot, "skills", "feature", "references", "details.md");
  await rm(reference);
  await symlink(path.join(f.expectedPluginRoot, "skills", "feature", "references", "details.md"), reference);
  await assert.rejects(verifyInstalledPlugin(f), /must not contain symlinks/);
});

test("reports and excludes only development dependency and git directories", async (t) => {
  const f = await fixture(t);
  await put(path.join(f.expectedPluginRoot, "skills", "deepwright", "scripts", "node_modules", "package", "index.js"), "development dependency\n");
  await put(path.join(f.loadedRoot, ".git", "config"), "administration\n");
  assert.deepEqual((await verifyInstalledPlugin(f)).excludedDirectories, [".git", "node_modules"]);
});

test("CLI returns structured pass, mismatch, and unavailable evidence with paths treated as data", async (t) => {
  const f = await fixture(t);
  const request = path.join(f.root, "request.json"), response = path.join(f.root, "response.json");
  await writeFile(request, JSON.stringify(f.request));
  await writeFile(response, JSON.stringify(f.response));
  const args = ["--request", request, "--response", response, "--cwd", f.cwd, "--plugin-id", f.pluginId, "--expected-plugin", f.expectedPluginRoot];
  const run = (extra = []) => {
    const result = spawnSync(process.execPath, [cli, ...args, ...extra], { encoding: "utf8", timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { ...result, report: JSON.parse(result.stdout) };
  };
  assert.equal(run().status, 0);
  f.skills[1].enabled = false;
  await writeFile(response, JSON.stringify(f.response));
  const mismatch = run();
  assert.equal(mismatch.status, 1);
  assert.equal(mismatch.report.status, "fail");
  await writeFile(response, "not JSON");
  const unavailable = run();
  assert.equal(unavailable.status, 2);
  assert.equal(unavailable.report.status, "unavailable");
  assert.equal(run(["--cwd", f.cwd]).status, 2);
});

test("CLI import remains inert with an eval argument naming the verifier", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", "await import(process.argv[1]); console.log('imported');", cli], { encoding: "utf8", timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "imported\n");
});

test("the complete current 47-skill package is required, with a synthetic native response", async (t) => {
  const f = await fixture(t);
  await rm(f.expectedPluginRoot, { recursive: true });
  await rm(f.loadedRoot, { recursive: true });
  const source = fileURLToPath(new URL("../plugins/deepwright", import.meta.url));
  await cp(source, f.expectedPluginRoot, {
    recursive: true,
    filter: (filename) => ![".git", "node_modules"].includes(path.basename(filename)),
  });
  await cp(f.expectedPluginRoot, f.loadedRoot, { recursive: true });
  const catalog = await loadCatalog(f.expectedPluginRoot);
  assert.equal(catalog.length, 47, "Update this current-package control when the canonical skill set changes");
  f.response.result.data[0].skills = catalog.map((skill) => ({
    name: "deepwright:" + skill.name, description: skill.description,
    path: path.join(f.loadedRoot, "skills", skill.name, "SKILL.md"),
    scope: "user", enabled: true, pluginId,
  }));
  const report = await verifyInstalledPlugin(f);
  assert.equal(report.skillCount, 47);
  assert.ok(report.fileCount > 200);
  assert.ok(report.byteCount > 100000);
  f.response.result.data[0].skills.pop();
  await assert.rejects(verifyInstalledPlugin(f), /missing expected skills/);
});
