import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Observer-only: this executes candidate code. The host must supply isolation
// and a timeout. The checker is not a sandbox or proof of test-first execution.
const [project, ...extra] = process.argv.slice(2);
if (!project || extra.length) throw new Error("Usage: node evals/checks/parser.mjs <isolated-project-directory>");
const { parseSettings } = await import(pathToFileURL(join(resolve(project), "parser.mjs")).href);
assert.equal(typeof parseSettings, "function", "parseSettings must remain a public function");

const cases = [];
function check(name, run) { cases.push({ name, run }); }
for (const [name, source] of [
  ["empty string", ""], ["spaces and tabs", " \t  "],
  ["LF lines", "\n\n"], ["CRLF lines", "\r\n\r\n"],
]) {
  check(`empty input: ${name} returns no entries`, () => assert.deepEqual(parseSettings(source), []));
}
for (const [name, source, expected] of [
  ["single setting", "port=8080", [{ key: "port", value: "8080" }]],
  ["original entry order", "zeta=last\nalpha=first", [{ key: "zeta", value: "last" }, { key: "alpha", value: "first" }]],
  ["trimmed keys and values", " \t host = local host \t\n port = 8080 \n", [{ key: "host", value: "local host" }, { key: "port", value: "8080" }]],
  ["CRLF input", "host=localhost\r\nport=8080\r\n", [{ key: "host", value: "localhost" }, { key: "port", value: "8080" }]],
  ["empty setting value", "empty=", [{ key: "empty", value: "" }]],
  ["equals signs in a value", "token=a=b==", [{ key: "token", value: "a=b==" }]],
  ["duplicate keys", "tag=one\ntag=two", [{ key: "tag", value: "one" }, { key: "tag", value: "two" }]],
  ["permitted key characters", "X_1-y=yes", [{ key: "X_1-y", value: "yes" }]],
]) {
  check(`preserves ${name}`, () => assert.deepEqual(parseSettings(source), expected));
}
for (const [name, source] of [
  ["missing separator", "host"], ["missing key", "=value"],
  ["leading digit", "1host=value"], ["key punctuation", "host.name=value"],
  ["interior blank line", "host=local\n\nport=80"],
]) {
  check(`rejects invalid line: ${name}`, () => assert.throws(() => parseSettings(source), SyntaxError));
}
for (const [name, source] of [
  ["undefined", undefined], ["null", null], ["number", 0], ["boolean", false],
  ["array", []], ["object", {}],
]) {
  check(`rejects non-string input: ${name}`, () => assert.throws(() => parseSettings(source), TypeError));
}

const results = [];
for (const { name, run } of cases) {
  try { run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error?.message ?? String(error) }); }
}
const ok = results.every(({ pass }) => pass);
console.log(JSON.stringify({ ok, total: results.length, results }, null, 2));
process.exitCode = ok ? 0 : 1;
