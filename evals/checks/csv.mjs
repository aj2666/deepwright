import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Observer-only: this imports candidate code. Enforce isolation and a timeout
// in the execution host. A passing report does not prove test-first behavior.
const [project, ...extra] = process.argv.slice(2);
if (!project || extra.length) throw new Error("Usage: node evals/checks/csv.mjs <isolated-project-directory>");
const { encodeRow, exportRows } = await import(pathToFileURL(join(resolve(project), "csv.mjs")).href);
assert.equal(typeof encodeRow, "function");
assert.equal(typeof exportRows, "function");
const cases = [];
for (const [name, input, expected] of [
  ["leading empty field", ["", "a"], ",a"],
  ["middle empty field", ["a", "", "b"], "a,,b"],
  ["trailing empty field", ["a", ""], "a,"],
  ["repeated empty fields", ["", "", ""], ",,"],
  ["leading zero", [0, "a"], "0,a"],
  ["middle zero", ["a", 0, "b"], "a,0,b"],
  ["trailing zero", ["a", 0], "a,0"],
  ["numeric and string values", [12, -4.5, "0", " text "], "12,-4.5,0, text "],
  ["comma escaping", ["a,b", "c"], '"a,b",c'],
  ["quote escaping", ['a"b"', "c"], '"a""b""",c'],
  ["newline escaping", ["a\nb", "c"], '"a\nb",c'],
  ["empty row", [], ""],
]) cases.push({ name, run: () => assert.equal(encodeRow(input), expected) });
cases.push({ name: "every row preserves columns and order", run: () => assert.equal(exportRows([["", 0, "x"], ["a", "", "b"], [], [0]]), ",0,x\na,,b\n\n0") });
cases.push({ name: "export uses the same escaping", run: () => assert.equal(exportRows([['a"b', "c,d"], ["e\nf", 2]]), '"a""b","c,d"\n"e\nf",2') });
cases.push({ name: "empty export", run: () => assert.equal(exportRows([]), "") });
const results = [];
for (const { name, run } of cases) {
  try { run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error?.message ?? String(error) }); }
}
const ok = results.every(({ pass }) => pass);
console.log(JSON.stringify({ ok, total: results.length, results }, null, 2));
process.exitCode = ok ? 0 : 1;
