import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const pluginPath = "plugins/deepwright";
const scriptsPath = pluginPath + "/skills/deepwright/scripts";
const validatorPath = "scripts/validate-codex-compat.mjs";
const cliPath = scriptsPath + "/dist/deepwright.mjs";
const releaseFiles = [
  "package.json", ".agents/plugins/marketplace.json", validatorPath,
  pluginPath + "/.codex-plugin/plugin.json",
  ...["LICENSE", "NOTICE.md", "third_party/commander-LICENSE", "third_party/smol-toml-LICENSE",
    "third_party/mattpocock-skills-LICENSE", "third_party/ecc-LICENSE", "assets/icon.png", "assets/logo.png", "assets/logo-dark.png"]
    .map((file) => pluginPath + "/" + file),
  ...["discovery/metadata.mjs", "dist/deepwright.mjs", "dist/orch.mjs", "dist/watch-pr.mjs",
    "deepwright", "check-plan.mjs", "worktree-audit.sh", "orch/orch", "watch-pr/watch-pr"]
    .map((file) => scriptsPath + "/" + file),
  pluginPath + "/skills/show-me-your-work/scripts/log.sh",
];

async function put(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function frontmatter(name, description = "Investigate the requested change with bounded evidence.") {
  return ["---", "name: " + name, "description: " + JSON.stringify(description), "---", "", "# Workflow", ""].join("\n");
}

function policy(name) {
  return [
    "interface:", "  display_name: " + JSON.stringify(name),
    '  short_description: "Investigate and verify the requested change"',
    '  default_prompt: "Use $' + name + ' for this change."',
    "policy:", "  allow_implicit_invocation: " + (name === "deepwright"), "",
  ].join("\n");
}

async function fixture(t) {
  // Test real distribution files in a fresh package without node_modules. Spaces
  // and shell punctuation must remain path data in both executable entrypoints.
  const root = await mkdtemp(join(tmpdir(), "deepwright-contract [space];-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of releaseFiles) {
    const destination = join(root, relative);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repository, relative), destination);
    if (relative.endsWith(".sh") || ["deepwright", "orch", "watch-pr", "check-plan.mjs"].includes(relative.split("/").at(-1))) {
      await chmod(destination, 0o755);
    }
  }
  const skills = join(root, pluginPath, "skills");
  for (const name of ["alpha", "deepwright", "show-me-your-work"]) {
    await put(join(skills, name, "SKILL.md"), frontmatter(name));
    await put(join(skills, name, "agents/openai.yaml"), policy(name));
  }
  return { root, skills, skill: join(skills, "alpha", "SKILL.md"), policy: join(skills, "alpha", "agents/openai.yaml") };
}

function run(root, file, args = []) {
  const result = spawnSync(process.execPath, [join(root, file), ...args], {
    cwd: root, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

function observe(context, executable = cliPath) {
  return {
    validation: run(context.root, validatorPath),
    discovery: run(context.root, executable, ["skills", "--json"]),
  };
}

function rejected({ validation, discovery }, reason) {
  assert.equal(validation.status, 1, validation.stdout + validation.stderr);
  assert.match(validation.stderr, reason);
  assert.equal(discovery.status, 1, discovery.stdout + discovery.stderr);
  assert.equal(discovery.stdout, "", "invalid catalogs must not be partially published");
  const error = JSON.parse(discovery.stderr);
  assert.equal(error.exitCode, 1);
  assert.match(error.error, reason);
}

test("package validation and shipped CLI agree without installed dependencies", async (t) => {
  const context = await fixture(t);
  const { validation, discovery } = observe(context);
  assert.equal(validation.status, 0, validation.stderr);
  assert.equal(discovery.status, 0, discovery.stderr);
  assert.match(validation.stdout, /3 skills/);
  assert.deepEqual(JSON.parse(discovery.stdout).skills.map(({ name, implicit, invocation }) => ({ name, implicit, invocation })), [
    { name: "alpha", implicit: false, invocation: "$deepwright:alpha" },
    { name: "deepwright", implicit: true, invocation: "$deepwright:deepwright" },
    { name: "show-me-your-work", implicit: false, invocation: "$deepwright:show-me-your-work" },
  ]);
});

const metadataViolations = [
  ["duplicate name", "---\nname: alpha\nname: alpha\ndescription: Valid text\n---\n", /one.*name field/],
  ["mismatched name", frontmatter("different"), /name must match/],
  ["missing frontmatter", "# No metadata\n", /missing YAML frontmatter/],
  ["comment-only name", "---\n# name: alpha\ndescription: Valid text\n---\n", /name field/],
  ["empty description", frontmatter("alpha", ""), /non-empty/],
  ["whitespace description", frontmatter("alpha", "  "), /non-empty/],
  ["excessive description", frontmatter("alpha", "x".repeat(1025)), /description exceeds 1024/],
  ["duplicate description", "---\nname: alpha\ndescription: First\ndescription: Second\n---\n", /one.*description field/],
  ["boolean description", "---\nname: alpha\ndescription: false\n---\n", /must be a string/],
  ["number description", "---\nname: alpha\ndescription: 1e3\n---\n", /must be a string/],
  ["block description", "---\nname: alpha\ndescription: |\n  Valid-looking text\n---\n", /single-line|unsupported YAML/],
  ["continued description", "---\nname: alpha\ndescription: Valid-looking\n  continued text\n---\n", /single-line/],
];
for (const [name, source, reason] of metadataViolations) {
  test(`both entrypoints reject ${name}`, async (t) => {
    const context = await fixture(t);
    await writeFile(context.skill, source);
    rejected(observe(context), reason);
  });
}

const policyViolations = [
  ["comment pretending to set implicit policy", policy("alpha").replace("  allow_implicit_invocation: false", "  # allow_implicit_invocation: false\n  allow_implicit_invocation: true"), /implicit invocation must be false/],
  ["policy value in another section", policy("alpha").replace("policy:\n", "other:\n") + "policy:\n  allow_implicit_invocation: true\n", /implicit invocation must be false/],
  ["duplicate implicit values", policy("alpha") + "  allow_implicit_invocation: true\n", /one.*allow_implicit_invocation field/],
  ["duplicate policy sections", policy("alpha") + "policy:\n  allow_implicit_invocation: false\n", /one policy section/],
  ["quoted boolean", policy("alpha").replace(": false", ': "false"'), /unquoted true or false/],
  ["boolean prefix", policy("alpha").replace(": false", ": falsehood"), /unquoted true or false/],
  ["YAML truthy alias", policy("alpha").replace(": false", ": no"), /unquoted true or false/],
  ["missing policy", policy("alpha").split("policy:")[0], /one policy section/],
  ["nested implicit flag", policy("alpha").replace("  allow_implicit_invocation", "    allow_implicit_invocation"), /allow_implicit_invocation field/],
];
for (const [name, source, reason] of policyViolations) {
  test(`both entrypoints reject ${name}`, async (t) => {
    const context = await fixture(t);
    await writeFile(context.policy, source);
    rejected(observe(context), reason);
  });
}

test("both entrypoints reject a router made explicit-only", async (t) => {
  const context = await fixture(t);
  await writeFile(join(context.skills, "deepwright", "agents/openai.yaml"), policy("deepwright").replace(": true", ": false"));
  rejected(observe(context), /implicit invocation must be true/);
});

for (const [name, reason] of [["Alpha", /invalid skill directory/], ["a".repeat(54), /qualified skill name exceeds 64/]]) {
  test(`both entrypoints reject invalid directory ${name}`, async (t) => {
    const context = await fixture(t);
    const destination = join(context.skills, name);
    await rename(join(context.skills, "alpha"), destination);
    await writeFile(join(destination, "SKILL.md"), frontmatter(name));
    await writeFile(join(destination, "agents/openai.yaml"), policy(name));
    rejected(observe(context), reason);
  });
}

for (const file of ["skill", "policy"]) {
  test(`both entrypoints reject missing ${file} metadata`, async (t) => {
    const context = await fixture(t);
    await rm(context[file]);
    rejected(observe(context), /invalid metadata for alpha.*ENOENT/);
  });
}

test("both entrypoints reject symlinked skill directories", async (t) => {
  const context = await fixture(t);
  await symlink(join(context.skills, "alpha"), join(context.skills, "linked"), "dir");
  rejected(observe(context), /skill directories must not be symlinks/);
});

test("both entrypoints reject metadata escaping the skill tree", async (t) => {
  const context = await fixture(t);
  const outside = join(context.root, "outside.md");
  await writeFile(outside, frontmatter("alpha"));
  await rm(context.skill);
  await symlink(outside, context.skill);
  rejected(observe(context), /metadata path leaves the plugin skills directory/);
});

test("both entrypoints reject an empty catalog", async (t) => {
  const context = await fixture(t);
  // Keep the self-contained CLI at the same depth after removing all skills.
  const relocatedCli = pluginPath + "/.runtime/a/b/c/deepwright.mjs";
  await put(join(context.root, relocatedCli), await readFile(join(context.root, cliPath)));
  await rm(context.skills, { recursive: true });
  await mkdir(context.skills);
  const { validation, discovery } = observe(context, relocatedCli);
  // Removing all skills also removes the validator's source dependency. It must
  // still fail closed; the self-contained installed CLI can diagnose the catalog.
  assert.equal(validation.status, 1, validation.stdout + validation.stderr);
  assert.equal(discovery.status, 1, discovery.stdout + discovery.stderr);
  assert.equal(discovery.stdout, "");
  assert.match(JSON.parse(discovery.stderr).error, /no skills discovered/);
});

const validDescriptions = [
  ["quoted boolean text", '"false"', "false"],
  ["quoted punctuation", '"text: value # stays text"', "text: value # stays text"],
  ["apostrophe quoting", "'User''s explicit workflow'", "User's explicit workflow"],
  ["maximum description length", JSON.stringify("x".repeat(1024)), "x".repeat(1024)],
];
for (const [name, scalar, expected] of validDescriptions) {
  test(`both entrypoints accept ${name}`, async (t) => {
    const context = await fixture(t);
    await writeFile(context.skill, "---\r\nname: alpha\r\ndescription: " + scalar + "\r\n---\r\n");
    await writeFile(context.policy, policy("alpha").replace("policy:\n", "# allow_implicit_invocation: true is only a comment\npolicy:\n").replaceAll("\n", "\r\n"));
    const { validation, discovery } = observe(context);
    assert.equal(validation.status, 0, validation.stderr);
    assert.equal(discovery.status, 0, discovery.stderr);
    assert.equal(JSON.parse(discovery.stdout).skills[0].description, expected);
  });
}

test("both entrypoints accept the longest qualified name and confined metadata links", async (t) => {
  const context = await fixture(t);
  const name = "a".repeat(53);
  const directory = join(context.skills, name);
  await rename(join(context.skills, "alpha"), directory);
  await writeFile(join(directory, "agents/openai.yaml"), policy(name));
  await rm(join(directory, "SKILL.md"));
  await writeFile(join(directory, "source.md"), frontmatter(name));
  await symlink("source.md", join(directory, "SKILL.md"));
  await writeFile(join(context.skills, ".DS_Store"), "not a skill directory");
  const { validation, discovery } = observe(context);
  assert.equal(validation.status, 0, validation.stderr);
  assert.equal(discovery.status, 0, discovery.stderr);
  assert.equal(JSON.parse(discovery.stdout).skills[0].invocation.length, 65); // '$' plus the 64-character qualified name.
});

for (const license of ['mattpocock-skills-LICENSE', 'ecc-LICENSE']) {
  test(`release validation retains adapted guidance license and notice: ${license}`, async (t) => {
    const context = await fixture(t);
    const filename = join(context.root, pluginPath, 'third_party', license);
    const content = await readFile(filename);
    await rm(filename);
    const missing = run(context.root, validatorPath);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /missing release file/);
    await writeFile(filename, content);
    assert.equal(run(context.root, validatorPath).status, 0);
    const notice = join(context.root, pluginPath, 'NOTICE.md');
    await writeFile(notice, (await readFile(notice, 'utf8')).replaceAll(`third_party/${license}`, 'omitted-license'));
    const uncredited = run(context.root, validatorPath);
    assert.equal(uncredited.status, 1);
    assert.match(uncredited.stderr, /NOTICE.md must reference/);
  });
}
