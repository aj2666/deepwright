import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../evals/fixtures/csv/", import.meta.url));
const observer = fileURLToPath(new URL("../evals/checks/csv.mjs", import.meta.url));
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
function check(directory) {
  const result = spawnSync(process.execPath, [observer, directory], { env, encoding: "utf8", timeout: 10_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const report = JSON.parse(result.stdout);
  assert.equal(report.total, 15);
  assert.equal(report.results.length, 15);
  assert.equal(new Set(report.results.map(({ name }) => name)).size, 15);
  assert.equal(report.ok, report.results.every(({ pass }) => pass));
  assert.equal(result.status, report.ok ? 0 : 1, result.stderr);
  return report;
}

// Independent positive and negative controls never enter a candidate project.
const reference = String.raw`export function encodeRow(fields) {
  return fields.map(field => {
    const text = String(field);
    return /[",\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }).join(",");
}
export function exportRows(rows) { return rows.map(encodeRow).join("\n"); }
`;
const alternate = String.raw`export function encodeRow(fields) {
  const columns = [];
  for (const field of fields) {
    const text = String(field);
    const escaped = text.split('"').join('""');
    columns.push(text.includes(",") || text.includes('"') || text.includes("\n") ? '"' + escaped + '"' : escaped);
  }
  return columns.join(",");
}
export function exportRows(rows) {
  const lines = [];
  for (const row of rows) lines.push(encodeRow(row));
  return lines.join("\n");
}
`;
async function variant(t, source) {
  const directory = await mkdtemp(join(tmpdir(), "deepwright-csv-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "csv.mjs"), source);
  return check(directory);
}

test("baseline rejects empty-field and zero behavior while preserving escaping", () => {
  const report = check(fixture);
  assert.equal(report.ok, false);
  assert.equal(report.results.filter(({ pass }) => !pass).length, 8);
  assert.ok(report.results.filter(({ name }) => name.includes("escaping")).every(({ pass }) => pass));
});
for (const [name, source] of [["map implementation", reference], ["loop implementation", alternate]]) {
  test(`CSV observer accepts ${name}`, async (t) => assert.equal((await variant(t, source)).ok, true));
}
for (const [name, source] of [
  ["drops empty fields", reference.replace("fields.map", 'fields.filter(field => field !== "").map')],
  ["drops zero", reference.replace("fields.map", "fields.filter(field => field !== 0).map")],
  ["converts zero to empty", reference.replace("String(field)", 'String(field || "")')],
  ["reverses fields", reference.replace("fields.map", "[...fields].reverse().map")],
  ["omits quote escaping", reference.replace("text.replaceAll('\"', '\"\"')", "text")],
  ["drops empty rows", reference.replace("rows.map(encodeRow)", "rows.filter(row => row.length).map(encodeRow)")],
  ["bypasses encoder in export", reference.replace("rows.map(encodeRow)", 'rows.map(row => row.join(","))')],
]) {
  test(`CSV observer rejects a variant that ${name}`, async (t) => {
    assert.notEqual(source, reference);
    assert.equal((await variant(t, source)).ok, false);
  });
}
