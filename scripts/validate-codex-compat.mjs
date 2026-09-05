#!/usr/bin/env node

import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repoRoot, "plugins", "deepwright");
const skillsRoot = path.join(pluginRoot, "skills");
const errors = [];

function fail(message) {
  errors.push(message);
}

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function filesUnder(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(target)));
    if (entry.isFile()) found.push(target);
  }
  return found;
}

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return null;
  return match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
}

const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
const rootPackage = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const bundledLicenses = ["commander-LICENSE", "smol-toml-LICENSE"];

for (const required of [
  path.join(pluginRoot, "LICENSE"),
  path.join(pluginRoot, "NOTICE.md"),
  ...bundledLicenses.map((license) => path.join(pluginRoot, "third_party", license)),
  path.join(skillsRoot, "deepwright", "scripts", "dist", "deepwright.mjs"),
  path.join(skillsRoot, "deepwright", "scripts", "dist", "orch.mjs"),
  path.join(skillsRoot, "deepwright", "scripts", "dist", "watch-pr.mjs")
]) {
  if (!(await exists(required))) fail(`missing release file: ${path.relative(repoRoot, required)}`);
}
const pluginNotice = await readFile(path.join(pluginRoot, "NOTICE.md"), "utf8");
for (const license of bundledLicenses) {
  if (!pluginNotice.includes(`third_party/${license}`)) {
    fail(`plugin NOTICE.md must reference the bundled ${license}`);
  }
}

for (const key of ["name", "version", "description", "author", "skills", "interface"]) {
  if (!manifest[key]) fail(`plugin.json is missing ${key}`);
}
if (manifest.name !== "deepwright") fail("plugin name must be deepwright");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) fail("plugin version must be strict semver");
if (manifest.skills !== "./skills/") fail("plugin skills path must be ./skills/");
for (const key of ["agents", "hooks", "mcpServers", "apps", "screenshots"]) {
  if (Object.hasOwn(manifest, key)) fail(`unsupported skills-only manifest field: ${key}`);
}
for (const key of ["displayName", "shortDescription", "longDescription", "developerName", "category", "capabilities", "defaultPrompt"]) {
  if (!manifest.interface?.[key]) fail(`plugin interface is missing ${key}`);
}
for (const key of ["composerIcon", "logo", "logoDark"]) {
  const value = manifest.interface?.[key];
  if (!value || !value.startsWith("./")) {
    fail(`plugin interface ${key} must be a ./ path`);
  } else if (!(await exists(path.join(pluginRoot, value)))) {
    fail(`plugin interface ${key} does not resolve: ${value}`);
  }
}
const prompts = Array.isArray(manifest.interface?.defaultPrompt)
  ? manifest.interface.defaultPrompt
  : [manifest.interface?.defaultPrompt].filter(Boolean);
if (prompts.length > 3 || prompts.some((value) => value.length > 128)) {
  fail("defaultPrompt must contain at most three entries of 128 characters or fewer");
}
if (!prompts.some((value) => /\b(?:Deepwright|Rivet)\b/.test(value))) {
  fail("one default prompt must name Deepwright or Rivet");
}
if (prompts.some((value) => /\$deepwright(?::[a-z0-9-]+)?/i.test(value))) {
  fail("plugin defaultPrompt entries must be surface-neutral; keep CLI skill syntax in the CLI docs");
}
if (rootPackage.version !== manifest.version) fail("root and plugin versions must match");

if (marketplace.name !== "deepwright") fail("marketplace name must be deepwright");
const entry = marketplace.plugins?.find((plugin) => plugin.name === "deepwright");
if (!entry) fail("marketplace does not contain deepwright");
if (entry?.source?.source !== "local" || entry?.source?.path !== "./plugins/deepwright") {
  fail("marketplace source must be local ./plugins/deepwright");
}
if (entry?.policy?.installation !== "AVAILABLE" || entry?.policy?.authentication !== "ON_INSTALL") {
  fail("marketplace policy must be AVAILABLE / ON_INSTALL");
}
if (entry?.category !== manifest.interface?.category) {
  fail("marketplace and manifest categories must match");
}

const skillDirs = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const directory of skillDirs) {
  const skillPath = path.join(skillsRoot, directory, "SKILL.md");
  if (!(await exists(skillPath))) {
    fail(`${directory} has no SKILL.md`);
    continue;
  }
  const source = await readFile(skillPath, "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`${directory}/SKILL.md has invalid frontmatter`);
    continue;
  }
  const name = scalar(match[1], "name");
  const description = scalar(match[1], "description");
  if (name !== directory) fail(`${directory}/SKILL.md name is ${name ?? "missing"}`);
  if (!description) fail(`${directory}/SKILL.md has no description`);
  if (description && description.length > 1024) fail(`${directory}/SKILL.md description is too long`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name ?? "")) fail(`${directory} has an invalid skill name`);
  if (`deepwright:${name}`.length > 64) fail(`deepwright:${name} exceeds 64 characters`);

  const policyPath = path.join(skillsRoot, directory, "agents", "openai.yaml");
  if (!(await exists(policyPath))) {
    fail(`${directory} has no agents/openai.yaml`);
  } else {
    const policy = await readFile(policyPath, "utf8");
    const expected = directory === "deepwright" ? "true" : "false";
    if (!policy.includes(`allow_implicit_invocation: ${expected}`)) {
      fail(`${directory} implicit invocation must be ${expected}`);
    }
    const flatPolicy = policy.replace(/^\s+/gm, "");
    const displayName = scalar(flatPolicy, "display_name");
    const shortDescription = scalar(flatPolicy, "short_description");
    const defaultPrompt = scalar(flatPolicy, "default_prompt");
    if (!displayName) fail(`${directory} policy has no display_name`);
    if (!shortDescription || shortDescription.length < 25 || shortDescription.length > 64) {
      fail(`${directory} short_description must contain 25-64 characters`);
    }
    if (!defaultPrompt || !defaultPrompt.includes(`$${directory}`)) {
      fail(`${directory} default_prompt must invoke $${directory}`);
    }
  }
}

const releaseFiles = await filesUnder(pluginRoot);
const textExtensions = new Set([".json", ".md", ".mjs", ".js", ".ts", ".sh", ".yaml", ".yml", ".toml", ".txt", ""]);
const bundledSkillNames = new Set(skillDirs);
const bareSkillReference = /\$([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9-]|:)/g;
function validateSkillReferences(source, file) {
  if (file.endsWith(path.join("agents", "openai.yaml"))) return;
  for (const match of source.matchAll(bareSkillReference)) {
    if (bundledSkillNames.has(match[1])) {
      fail(`${path.relative(repoRoot, file)} contains unqualified bundled skill $${match[1]}`);
    }
  }
}
const legacyAllowed = new Set([
  path.join(pluginRoot, "LICENSE"),
  path.join(pluginRoot, "NOTICE.md")
]);
const forbidden = [
  [/\.cursor-plugin\b/g, ".cursor-plugin"],
  [/(^|[~/])\.cursor\//gm, ".cursor path"],
  [/\bsubagent_type\b/g, "subagent_type"],
  [/\bgeneralPurpose\b/g, "generalPurpose"],
  [/\brun_in_background\b/g, "run_in_background"],
  [/\bTask tool\b/gi, "Task tool"],
  [/cursor-team-kit/gi, "cursor-team-kit"],
  [/agent-transcripts/gi, "hidden transcript path"],
  [/~\/\.codex\/projects/gi, "hidden Codex project path"],
  [/\b(?:export\s+)?CODEX_HOME\s*=/g, "CODEX_HOME assignment"],
  [/\bclaude-[a-z0-9._-]+/gi, "hardcoded Claude model"],
  [/\bgrok-[a-z0-9._-]+/gi, "hardcoded Grok model"],
  [/\/add-plugin\b/g, "legacy /add-plugin command"],
  [/\buDeepwright\b/g, "broken upstack replacement"]
];
for (const file of releaseFiles) {
  if (!textExtensions.has(path.extname(file))) continue;
  const source = await readFile(file, "utf8");
  validateSkillReferences(source, file);
  for (const [pattern, label] of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) fail(`${path.relative(repoRoot, file)} contains ${label}`);
  }
  if (!legacyAllowed.has(file) && /\b(?:pstack|poteto)\b/i.test(source)) {
    fail(`${path.relative(repoRoot, file)} contains legacy branding`);
  }
}

const repositoryDocs = (await filesUnder(repoRoot)).filter((file) =>
  file.endsWith(".md") && !file.startsWith(pluginRoot + path.sep));
for (const file of repositoryDocs) {
  validateSkillReferences(await readFile(file, "utf8"), file);
}

const markdownFiles = [...releaseFiles.filter((file) => file.endsWith(".md")), ...repositoryDocs];
for (const file of markdownFiles) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1].trim().replace(/^<|>$/g, "");
    if (!raw || /^(?:https?:|mailto:|codex:|#)/.test(raw)) continue;
    const clean = decodeURIComponent(raw.split("#", 1)[0].split("?", 1)[0]);
    if (!clean || clean.includes("<")) continue;
    if (!(await exists(path.resolve(path.dirname(file), clean)))) {
      fail(`${path.relative(repoRoot, file)} has a broken link: ${raw}`);
    }
  }
}

for (const unwanted of [
  path.join(pluginRoot, "assets", "upstream-logo.png"),
  path.join(pluginRoot, "docs", "guide", "images")
]) {
  if (await exists(unwanted)) fail(`remove legacy asset: ${path.relative(repoRoot, unwanted)}`);
}

for (const executable of [
  path.join(skillsRoot, "show-me-your-work", "scripts", "log.sh"),
  path.join(skillsRoot, "deepwright", "scripts", "deepwright"),
  path.join(skillsRoot, "deepwright", "scripts", "check-plan.mjs"),
  path.join(skillsRoot, "deepwright", "scripts", "worktree-audit.sh"),
  path.join(skillsRoot, "deepwright", "scripts", "orch", "orch"),
  path.join(skillsRoot, "deepwright", "scripts", "watch-pr", "watch-pr")
]) {
  if (!(await exists(executable))) {
    fail(`missing executable: ${path.relative(repoRoot, executable)}`);
  } else if (!((await stat(executable)).mode & 0o111)) {
    fail(`not executable: ${path.relative(repoRoot, executable)}`);
  }
}

if (await exists(path.join(repoRoot, "scripts", "smoke-codex.sh"))) {
  fail("remove standalone smoke-codex.sh; CI performs the install smoke in an isolated runner");
}

if (errors.length) {
  console.error(`Deepwright compatibility validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Deepwright compatibility validation passed: ${skillDirs.length} skills, skills-only manifest, Codex-native policies.`);
console.log(`Documentation validation passed: ${markdownFiles.length} Markdown files checked for local file links.`);
