import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../evals/fixtures/parser/", import.meta.url));
const checks = fileURLToPath(new URL("../evals/checks/parser.mjs", import.meta.url));
const expectedCheckCount = 23;
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
function run(project, extra = []) {
  const result = spawnSync(process.execPath, [checks, project, ...extra], {
    env: childEnv, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
function readReport(result) {
  const report = JSON.parse(result.stdout);
  assert.equal(report.total, expectedCheckCount);
  assert.equal(report.results.length, expectedCheckCount);
  assert.equal(new Set(report.results.map(({ name }) => name)).size, expectedCheckCount);
  assert.ok(report.results.every(({ pass }) => typeof pass === "boolean"));
  assert.equal(report.ok, report.results.every(({ pass }) => pass));
  assert.equal(result.status, report.ok ? 0 : 1, result.stderr);
  return report;
}

// Observer controls stay outside candidate projects and measure the checker only.
const reference = `export function parseSettings(source) {
  if (typeof source !== "string") throw new TypeError("source must be a string");
  if (source.trim() === "") return [];
  return source.trim().split(/\\r?\\n/).map((line, index) => {
    const separator = line.indexOf("=");
    if (separator < 0) throw new SyntaxError("Expected key=value");
    const key = line.slice(0, separator).trim();
    if (!/^[a-z][a-z0-9_-]*$/i.test(key)) throw new SyntaxError("Invalid key");
    return { key, value: line.slice(separator + 1).trim() };
  });
}\n`;
const alternate = `export function parseSettings(source) {
  if (typeof source !== "string") throw new TypeError("Expected text");
  const text = source.trim();
  const entries = [];
  for (const line of text ? text.split("\\n") : []) {
    const parts = line.split("=");
    if (parts.length < 2) throw new SyntaxError("Missing separator");
    const key = parts.shift().trim();
    if (!/^[a-z][a-z0-9_-]*$/i.test(key)) throw new SyntaxError("Bad key");
    entries.push({ key, value: parts.join("=").trim() });
  }
  return entries;
}\n`;

async function checkSource(t, source) {
  const root = await mkdtemp(join(tmpdir(), "deepwright-parser-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "parser.mjs"), source);
  return readReport(run(root));
}

test("baseline parser fails only empty-input acceptance checks", () => {
  const report = readReport(run(fixture));
  const failed = report.results.filter(({ pass }) => !pass);
  assert.equal(failed.length, 4);
  assert.ok(failed.every(({ name }) => name.startsWith("empty input:")));
  assert.equal(report.ok, false);
});

test("the candidate's current parser and formatter tests pass before new work", () => {
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "parser.test.mjs", "formatter.test.mjs"], {
    cwd: fixture, env: childEnv, encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 5(?:\r?\n|$)/);
  assert.match(result.stdout, /# fail 0(?:\r?\n|$)/);
});

test("the supplied local CLI input reproduces the parser failure", async () => {
  assert.equal((await readFile(join(fixture, "empty.settings"))).length, 0);
  const result = spawnSync(process.execPath, ["cli.mjs", "empty.settings"], {
    cwd: fixture, env: childEnv, encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SyntaxError: Expected key=value on line 1/);
  const sample = spawnSync(process.execPath, ["cli.mjs", "sample.settings"], {
    cwd: fixture, env: childEnv, encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(sample.error);
  assert.equal(sample.status, 0, sample.stderr);
  assert.deepEqual(JSON.parse(sample.stdout), [
    { key: "port", value: "8080" }, { key: "host", value: "localhost" },
  ]);
});

test("formatter review has an independent order and mutation defect", async () => {
  const { formatSettings } = await import(new URL("../evals/fixtures/parser/formatter.mjs", import.meta.url));
  const entries = [{ key: "zeta", value: "last" }, { key: "alpha", value: "first" }];
  const before = structuredClone(entries);
  assert.notEqual(formatSettings(entries), "zeta=last\nalpha=first");
  assert.notDeepEqual(entries, before);
});

for (const [name, source] of [["early empty guard", reference], ["iterative entry collection", alternate]]) {
  test(`observer accepts correct ${name}`, async (t) => {
    assert.equal((await checkSource(t, source)).ok, true);
  });
}

const mutants = [
  ["zero-length handling only", reference.replace('source.trim() === ""', 'source === ""'), /empty input: spaces/],
  ["non-string values treated as empty", reference.replace('  if (typeof source', '  if (!source) return [];\n  if (typeof source'), /rejects non-string input: null/],
  ["drops empty values", reference.replace("  });", "  }).filter((entry) => entry.value);"), /empty setting value/],
  ["splits away later equals signs", reference.replace("line.slice(separator + 1).trim()", 'line.split("=")[1].trim()'), /equals signs/],
  ["reverses entry order", reference.replace("  });", "  }).reverse();"), /original entry order/],
  ["keeps whitespace around values", reference.replace("line.slice(separator + 1).trim()", "line.slice(separator + 1)"), /trimmed keys and values/],
  ["skips interior blank lines", reference.replace('.map((line, index)', '.filter((line) => line.trim()).map((line, index)'), /interior blank line/],
  ["allows invalid key punctuation", reference.replace("!/^[a-z][a-z0-9_-]*$/i.test(key)", "!key"), /key punctuation/],
  ["wraps syntax failures as generic errors", reference.replaceAll("new SyntaxError", "new Error"), /rejects invalid line/],
];
for (const [name, source, failure] of mutants) {
  test(`observer rejects ${name} for a matching behavioral failure`, async (t) => {
    assert.notEqual(source, reference, "mutation must change the implementation");
    const report = await checkSource(t, source);
    assert.equal(report.ok, false);
    assert.ok(report.results.some(({ name: check, pass }) => !pass && failure.test(check)), name);
  });
}

test("observer requires exactly one explicit project directory", () => {
  for (const result of [run(""), run(fixture, ["extra"])]) {
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /Usage: node evals\/checks\/parser.mjs/);
  }
});
