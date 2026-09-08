import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = path.join(root, "plugins", "deepwright", "skills", "unslop", "SKILL.md");
const policyPath = path.join(root, "plugins", "deepwright", "skills", "unslop", "agents", "openai.yaml");
const noticePath = path.join(root, "plugins", "deepwright", "NOTICE.md");
const rootNoticePath = path.join(root, "THIRD_PARTY_NOTICES.md");
const licensePath = path.join(root, "plugins", "deepwright", "third_party", "humanizer-LICENSE");

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
  assert.match(skill, /9862685f575c65a8247f90369951df1b3416e3d6/);
});

test("unslop remains explicit-only and advertises claim preservation", async () => {
  const policy = await read(policyPath);
  assert.match(policy, /default_prompt: .*preserving facts, uncertainty, and the writer's voice/);
  assert.match(policy, /allow_implicit_invocation: false/);
});

test("humanizer attribution ships with the distributed plugin", async () => {
  const [notice, rootNotice, license] = await Promise.all([
    read(noticePath),
    read(rootNoticePath),
    read(licensePath),
  ]);

  for (const text of [notice, rootNotice]) {
    assert.match(text, /blader\/humanizer/);
    assert.match(text, /9862685f575c65a8247f90369951df1b3416e3d6/);
    assert.match(text, /humanizer-LICENSE/);
  }

  assert.match(license, /^MIT License\n/);
  assert.match(license, /Copyright \(c\) 2025 Siqi Chen/);
});
