import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = path.join(root, "plugins", "deepwright", "skills", "unslop", "SKILL.md");
const policyPath = path.join(root, "plugins", "deepwright", "skills", "unslop", "agents", "openai.yaml");
const licensePath = path.join(root, "plugins", "deepwright", "LICENSE");

const read = (file) => readFile(file, "utf8");

test("unslop keeps the humanization contract explicit", async () => {
  const skill = await read(skillPath);
  assert.match(skill, /^---\nname: unslop\n/m);
  assert.match(skill, /Preserve claims\./);
  assert.match(skill, /Preserve voice\./);
  assert.match(skill, /Run the claim audit\./);
  assert.match(skill, /Run the survivor audit\./);
  assert.match(skill, /## Voice calibration/);
  assert.match(skill, /### Strong structural tells/);
  assert.match(skill, /### Cluster tells/);
  assert.match(skill, /A no-change result is valid\./);
  assert.match(skill, /does not prove who wrote the source/i);
});

test("unslop remains explicit-only and advertises claim preservation", async () => {
  const policy = await read(policyPath);
  assert.match(policy, /default_prompt: .*preserving facts, uncertainty, and the writer's voice/);
  assert.match(policy, /allow_implicit_invocation: false/);
});

test("Deepwright prose-editing license terms ship with the plugin", async () => {
  const license = await read(licensePath);
  assert.match(license, /Deepwright prose editing/);
  assert.match(license, /^MIT License$/m);
  assert.match(license, /Copyright \(c\) 2025 Siqi Chen/);
  assert.match(license, /The above copyright notice and this permission notice shall be included in all/);
});
