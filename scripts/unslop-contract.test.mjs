import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const licensePath = path.join(root, "plugins", "deepwright", "LICENSE");

const read = (file) => readFile(file, "utf8");


test("Deepwright prose-editing license terms ship with the plugin", async () => {
  const license = await read(licensePath);
  assert.match(license, /Deepwright prose editing/);
  assert.match(license, /^MIT License$/m);
  assert.match(license, /Copyright \(c\) 2025 Siqi Chen/);
  assert.match(license, /The above copyright notice and this permission notice shall be included in all/);
});
