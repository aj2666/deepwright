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
  ".claude-plugin/marketplace.json", pluginPath + "/.claude-plugin/plugin.json",
  ...["LICENSE", "assets/icon.png", "assets/logo.png", "assets/logo-dark.png"]
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
  return ["---", "name: " + name, "description: " + JSON.stringify(description), "disable-model-invocation: " + (name !== "deepwright"), "---", "", "# Workflow", ""].join("\n");
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
  assert.deepEqual(JSON.parse(discovery.stdout).skills.map(({ name, implicit }) => ({ name, implicit })), [
    { name: "alpha", implicit: false },
    { name: "deepwright", implicit: true },
    { name: "show-me-your-work", implicit: false },
  ]);
});

test("model pin checks distinguish Claude plugin identifiers from model identifiers", async (t) => {
  const context = await fixture(t);
  const file = join(context.root, pluginPath, "provider.mjs");
  await put(file, 'export const provider = "claude-plugins";\n');
  const portable = run(context.root, validatorPath);
  assert.equal(portable.status, 0, portable.stderr);
  await put(file, 'export const model = "claude-opus-99";\n');
  const pinned = run(context.root, validatorPath);
  assert.equal(pinned.status, 1);
  assert.match(pinned.stderr, /hardcoded Claude model/);
});

test("release validation rejects portable version drift and wrong install targets", async (t) => {
  const context = await fixture(t);
  const manifestFile = join(context.root, pluginPath, ".claude-plugin/plugin.json");
  const original = await readFile(manifestFile, "utf8");
  const manifest = JSON.parse(original);
  manifest.version = "0.0.0";
  await writeFile(manifestFile, JSON.stringify(manifest));
  const drift = run(context.root, validatorPath);
  assert.equal(drift.status, 1);
  assert.match(drift.stderr, /portable plugin version must match/);
  await writeFile(manifestFile, original);
  const marketplaceFile = join(context.root, ".claude-plugin/marketplace.json");
  const marketplace = JSON.parse(await readFile(marketplaceFile, "utf8"));
  marketplace.plugins[0].source = "./wrong-directory";
  await writeFile(marketplaceFile, JSON.stringify(marketplace));
  const target = run(context.root, validatorPath);
  assert.equal(target.status, 1);
  assert.match(target.stderr, /portable marketplace must resolve/);
});

test("release validation leaves retained root run evidence outside authored documentation checks", async (t) => {
  const context = await fixture(t);
  const evidence = join(context.root, ".deepwright", "runs", "review", "upstream", "source.md");
  const source = "# Retained external evidence\n\n[Absent upstream file](missing-upstream.md)\n\nThe quoted source invokes $alpha.\n";
  await put(evidence, source);
  const result = run(context.root, validatorPath);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Documentation validation passed/);
  assert.equal(await readFile(evidence, "utf8"), source);
});

for (const relative of [
  "docs/new-untracked.md",
  ".deepwright/plans/plan.md",
  ".deepwright/runs-archive/source.md",
  "docs/.deepwright/runs/guide.md",
  pluginPath + "/.deepwright/runs/guide.md",
  "docs/ignored-by-git/guide.md",
]) {
  test(`release validation still checks authored documentation at ${relative}`, async (t) => {
    const context = await fixture(t);
    await put(join(context.root, ".gitignore"), "docs/ignored-by-git/\n");
    const document = join(context.root, relative);
    await put(document, "# Authored documentation\n\n[Required contract](missing-authored-target.md)\n");
    const broken = run(context.root, validatorPath);
    assert.equal(broken.status, 1, broken.stdout + broken.stderr);
    assert.ok(broken.stderr.includes(`${relative} has a broken link: missing-authored-target.md`), broken.stderr);
    await put(join(dirname(document), "missing-authored-target.md"), "# Supplied contract\n");
    const repaired = run(context.root, validatorPath);
    assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
  });
}

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

test("both entrypoints reject portable activation drift without publishing a partial catalog", async (t) => {
  const context = await fixture(t);
  await writeFile(context.skill, frontmatter("alpha").replace("disable-model-invocation: true", "disable-model-invocation: false"));
  rejected(observe(context), /disable-model-invocation must be true/);
  await writeFile(context.skill, frontmatter("alpha"));
  await writeFile(join(context.skills, "deepwright", "SKILL.md"), frontmatter("deepwright").replace("disable-model-invocation: false", "disable-model-invocation: true"));
  rejected(observe(context), /disable-model-invocation must be false/);
});

test("both entrypoints reject ambiguous portable activation metadata", async (t) => {
  const context = await fixture(t);
  for (const replacement of ["", 'disable-model-invocation: "true"', "disable-model-invocation: true\ndisable-model-invocation: false"]) {
    await writeFile(context.skill, frontmatter("alpha").replace("disable-model-invocation: true", replacement));
    rejected(observe(context), /disable-model-invocation/);
  }
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
    await writeFile(context.skill, "---\r\nname: alpha\r\ndescription: " + scalar + "\r\ndisable-model-invocation: true\r\n---\r\n");
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
  assert.equal(JSON.parse(discovery.stdout).skills[0].name, name);
});

test("release validation requires the consolidated Deepwright license", async (t) => {
  const context = await fixture(t);
  const filename = join(context.root, pluginPath, "LICENSE");
  const content = await readFile(filename);
  await rm(filename);
  const missing = run(context.root, validatorPath);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing release file: plugins\/deepwright\/LICENSE/);
  await writeFile(filename, content);
  assert.equal(run(context.root, validatorPath).status, 0);
});

for (const notice of [
  "Copyright (c) 2026 Lauren Tan",
  "Copyright (c) 2011 TJ Holowaychuk",
  "Copyright (c) Squirrel Chat et al., All rights reserved.",
  "Copyright (c) 2026 Matt Pocock",
  "Copyright (c) 2025 Siqi Chen",
  "Copyright (c) 2026 Affaan Mustafa",
  "Permission is hereby granted, free of charge",
  "The above copyright notice and this permission notice shall be",
  "THE SOFTWARE IS PROVIDED",
  "Redistribution and use in source and binary forms, with or without",
  "1. Redistributions of source code must retain the above copyright notice",
  "2. Redistributions in binary form must reproduce the above copyright notice",
  "3. Neither the name of the copyright holder nor the names of its contributors",
  "THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS",
]) {
  test(`release validation retains consolidated license text: ${notice}`, async (t) => {
    const context = await fixture(t);
    const filename = join(context.root, pluginPath, "LICENSE");
    const content = await readFile(filename, "utf8");
    assert.ok(content.includes(notice));
    await writeFile(filename, content.replaceAll(notice, "omitted license text"));
    const missing = run(context.root, validatorPath);
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.ok(missing.stderr.includes(`plugin LICENSE must retain: ${notice}`), missing.stderr);
    await writeFile(filename, content);
    assert.equal(run(context.root, validatorPath).status, 0);
  });
}

test("release validation accepts the Deepwright README license link and rejects broken links", async (t) => {
  const context = await fixture(t);
  const readme = join(context.root, "README.md");
  const content = "# Deepwright\n\n[Deepwright plugin license](plugins/deepwright/LICENSE)\n";
  await writeFile(readme, content);
  assert.equal(run(context.root, validatorPath).status, 0);
  await writeFile(readme, content + "\n[Removed document](removed-document.md)\n");
  const broken = run(context.root, validatorPath);
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /README.md has a broken link: removed-document.md/);
  await writeFile(readme, content);
  assert.equal(run(context.root, validatorPath).status, 0);
});

test("release validation requires the Deepwright package name", async (t) => {
  const context = await fixture(t);
  const filename = join(context.root, "package.json");
  const content = await readFile(filename, "utf8");
  const metadata = JSON.parse(content);
  metadata.name = "another-project";
  await writeFile(filename, JSON.stringify(metadata));
  const renamed = run(context.root, validatorPath);
  assert.equal(renamed.status, 1);
  assert.match(renamed.stderr, /root package name must be deepwright/);
  await writeFile(filename, content);
  assert.equal(run(context.root, validatorPath).status, 0);
});
