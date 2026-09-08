import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { evaluateRanker, lexicalRanker, literalRank, loadCanonicalCatalog, runBenchmark, validateCorpus, verifyFreeze } from "./benchmark-discovery.mjs";

const execFileAsync = promisify(execFile);

const catalog = {
  skills: [
    { name: "review", description: "Inspect correctness", path: "skills/review/SKILL.md" },
    { name: "write", description: "Create documentation", path: "skills/write/SKILL.md" },
  ],
  playbooks: [],
};

const corpus = {
  schemaVersion: 1,
  description: "Small observer controls; not agent instructions.",
  cases: [
    { id: "tune-natural", split: "tuning", category: "natural", query: "inspect correctness", relevant: ["skill:review"] },
    { id: "tune-exact", split: "tuning", category: "exact", query: "review", relevant: ["skill:review"] },
    { id: "tune-ambiguous", split: "tuning", category: "ambiguous", query: "inspect create", relevant: ["skill:review", "skill:write"] },
    { id: "tune-irrelevant", split: "tuning", category: "irrelevant", query: "banana dinner", relevant: [] },
    { id: "heldout-natural", split: "heldout", category: "natural", query: "create documentation", relevant: ["skill:write"] },
    { id: "heldout-exact", split: "heldout", category: "exact", query: "$deepwright:write", relevant: ["skill:write"] },
    { id: "heldout-ambiguous", split: "heldout", category: "ambiguous", query: "correctness documentation", relevant: ["skill:review", "skill:write"] },
    { id: "heldout-irrelevant", split: "heldout", category: "irrelevant", query: "weather tomorrow", relevant: [] },
  ],
};
const tokenize = (text) => text.toLowerCase().match(/[a-z]+/gu) ?? [];
const lexical = lexicalRanker(tokenize, (entry) => tokenize([entry.name, entry.description].join(" ")));
const reference = (entries, query) => {
  const relevance = corpus.cases.find((entry) => entry.query === query).relevant;
  return entries.filter((entry) => relevance.includes("skill:" + entry.name));
};
const fast = { iterations: 2, warmup: 0 };

test("legacy literal search retains all-term substring filtering and catalog order", () => {
  assert.deepEqual(literalRank(catalog.skills, "INSPECT correct").map((entry) => entry.name), ["review"]);
  assert.deepEqual(literalRank(catalog.skills, "inspect absent"), []);
  assert.deepEqual(literalRank(catalog.skills, "", 1).map((entry) => entry.name), ["review"]);
});

test("a ranker that returns unrelated suggestions fails the no-match control", () => {
  const partial = { cases: [{ id: "dinner", split: "heldout", category: "irrelevant", query: "chickpea dinner", relevant: [] }] };
  const report = evaluateRanker(partial, catalog, (entries) => entries.slice(0, 1), fast);
  assert.equal(report.cases[0].pass, false);
  assert.equal(report.cases[0].noMatch, false);
});

test("corpus validation rejects missing coverage, unknown labels and relabeled duplicate queries", () => {
  assert.equal(validateCorpus(corpus, catalog), corpus);
  const changes = [
    (value) => { value.schemaVersion = 2; },
    (value) => { value.extra = true; },
    (value) => { value.cases[0].id = value.cases[1].id; },
    (value) => { value.cases[4].query = "  INSPECT  correctness "; },
    (value) => { value.cases[0].relevant = ["skill:missing"]; },
    (value) => { value.cases[0].relevant.push("skill:review"); },
    (value) => { value.cases[0].relevant = []; },
    (value) => { value.cases[3].relevant = ["skill:review"]; },
    (value) => { value.cases[1].relevant.push("skill:write"); },
    (value) => { value.cases[2].relevant = ["skill:review"]; },
    (value) => { value.cases[0].query = "read\nsecret"; },
    (value) => { value.cases = value.cases.filter((entry) => entry.id !== "heldout-ambiguous"); },
  ];
  for (const change of changes) {
    const value = structuredClone(corpus); change(value);
    assert.throws(() => validateCorpus(value, catalog));
  }
});

test("an empty poor ranker cannot pass by abstaining from every positive query", () => {
  const report = runBenchmark(corpus, catalog, { literal: literalRank, lexical, bm25: () => [] }, fast);
  assert.equal(report.ok, false);
  assert.equal(report.algorithms.bm25.measured.positiveHits, 0);
  assert.equal(report.algorithms.bm25.measured.noMatchPassed, 2);
  assert.ok(report.qualityGate.comparisons.lexical.regressions.includes("heldout-natural"));
  assert.equal(report.qualityGate.gates.exactIdsFirst, false);
});

test("a reference selection passes while keeping recall, no-match, byte and latency denominators separate", () => {
  const report = runBenchmark(corpus, catalog, { literal: literalRank, lexical, bm25: reference }, { iterations: 3, warmup: 1 });
  assert.equal(report.ok, true);
  const measured = report.algorithms.bm25.measured;
  assert.equal(measured.positiveQueries, 6);
  assert.equal(measured.positiveHits, 6);
  assert.equal(measured.hitRateAt3, 1);
  assert.equal(measured.meanRelevantRecallAt3, 1);
  assert.equal(measured.noMatchQueries, 2);
  assert.equal(measured.exactFirstHits, 2);
  assert.equal(measured.rankingLatencyMs.samples, 24);
  assert.ok(measured.rankingLatencyMs.min >= 0);
  assert.ok(measured.returnedBytes.total > 0);
  assert.equal(report.algorithms.bm25.splits.heldout.queries, 4);
  assert.equal(report.selectionOnly, true);
  assert.match(report.limitation, /not workflow execution/u);
});

test("tuning-only output does not claim heldout gates passed", () => {
  const report = runBenchmark(corpus, catalog, { literal: literalRank, lexical, bm25: reference }, { ...fast, split: "tuning" });
  assert.equal(report.ok, false);
  assert.equal(report.qualityGate.eligible, false);
  assert.equal(report.algorithms.bm25.cases.length, 4);
  assert.equal(report.algorithms.bm25.splits.heldout.hitRateAt3, null);
  assert.equal(report.algorithms.bm25.splits.heldout.rankingLatencyMs, null);
});

test("equal comparator misses cannot bypass the accepted 90% heldout positive-hit requirement", () => {
  const sharedMiss = (entries, query) => query === "create documentation" ? [] : reference(entries, query);
  const report = runBenchmark(corpus, catalog, { literal: sharedMiss, lexical: sharedMiss, bm25: sharedMiss }, fast);
  assert.equal(report.algorithms.bm25.splits.heldout.hitRateAt3, 2 / 3);
  assert.equal(report.qualityGate.gates.exactIdsFirst, true);
  assert.equal(report.qualityGate.gates.irrelevantInputsEmpty, true);
  assert.equal(report.qualityGate.gates.noRegressionAgainstLiteral, true);
  assert.equal(report.qualityGate.gates.noRegressionAgainstLexical, true);
  assert.equal(report.ok, false);
  assert.equal(report.qualityGate.gates.heldoutPositiveHitRateAtLeast90Percent, false);
});

test("partial relevance and exact-ID order cannot hide behind a positive hit", () => {
  const one = evaluateRanker(corpus, catalog, (entries) => entries.slice(0, 1), fast);
  assert.equal(one.cases.find((entry) => entry.id === "tune-ambiguous").recallAt3, 0.5);
  const reversed = evaluateRanker(corpus, catalog, (entries) => [...entries].reverse(), fast);
  const exact = reversed.cases.find((entry) => entry.id === "tune-exact");
  assert.equal(exact.hit, true);
  assert.equal(exact.exactTop1, false);
});

test("invalid, fabricated, mutating or unstable ranker output is rejected", () => {
  const rankers = [
    () => undefined,
    () => Promise.resolve([]),
    () => [{ name: "fabricated" }],
    (entries) => entries.length ? [entries[0], entries[0]] : [],
    (entries) => entries.map((entry) => ({ ...entry, description: "invented" })),
    (entries) => entries.map((entry) => ({ ...entry, score: Infinity })),
    (entries) => entries.map((entry) => ({ ...entry, execute: "pretend" })),
    (entries) => { entries.push(catalog.skills[0]); return entries; },
  ];
  for (const rank of rankers) assert.throws(() => evaluateRanker(corpus, catalog, rank, fast));
  let calls = 0;
  assert.throws(() => evaluateRanker(corpus, catalog, (entries) => entries.length ? [entries[calls++ % entries.length]] : [], fast), /changed across repetitions/u);
  const larger = { skills: ["a", "b", "c", "d"].map((name) => ({ name, path: name, description: name })), playbooks: [] };
  assert.throws(() => evaluateRanker(corpus, larger, (entries) => entries, fast), /at most three/u);
});

test("ranking annotations do not inflate normalized returned bytes or execute metadata text", () => {
  const selected = { skills: [{ ...catalog.skills[0], description: "globalThis.discoverySentinel = 99; $(touch sentinel)" }], playbooks: [] };
  const partial = { cases: [corpus.cases[0]] };
  globalThis.discoverySentinel = 0;
  const plain = evaluateRanker(partial, selected, (entries) => entries, fast);
  const annotated = evaluateRanker(partial, selected, (entries) => entries.map((entry) => ({ ...entry, score: 2, matchedTerms: ["review"] })), fast);
  assert.equal(plain.cases[0].returnedBytes, annotated.cases[0].returnedBytes);
  assert.equal(globalThis.discoverySentinel, 0);
  delete globalThis.discoverySentinel;
});

test("freeze verification rejects changed corpus or heldout bytes", () => {
  const bytes = Buffer.from(JSON.stringify(corpus));
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const freeze = { corpusSha256: digest(bytes), heldoutSha256: digest(JSON.stringify(corpus.cases.filter((entry) => entry.split === "heldout"))) };
  assert.equal(verifyFreeze(bytes, freeze).corpusSha256, freeze.corpusSha256);
  assert.throws(() => verifyFreeze(Buffer.concat([bytes, Buffer.from("\n")]), freeze), /corpus SHA/u);
  assert.throws(() => verifyFreeze(bytes, { ...freeze, heldoutSha256: "0".repeat(64) }), /heldout SHA/u);
});

test("catalog loading uses list commands and normalizes one shared metadata snapshot", async (t) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "discovery catalog ")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "skills", "deepwright", "scripts", "dist");
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, "deepwright.mjs");
  const fixture = { skills: catalog.skills.map((entry) => ({ ...entry, path: path.join(root, entry.path) })), playbooks: [] };
  await writeFile(filename, `const catalog = ${JSON.stringify(fixture)}; const command = process.argv[2]; if (!['skills', 'playbooks'].includes(command) || process.argv[3] !== '--json') process.exit(3); console.log(JSON.stringify({tool:'deepwright', command, [command]:catalog[command]}));\n`);
  const loaded = await loadCanonicalCatalog(root);
  assert.deepEqual(loaded.catalog, catalog);
  assert.match(loaded.source.catalogSha256, /^[a-f0-9]{64}$/u);
  assert.ok(loaded.source.catalogLoadingMs >= 0);
  await writeFile(filename, "console.log(JSON.stringify({tool:'deepwright',command:process.argv[2],[process.argv[2]]:[{name:'outside',description:'escape',path:'/outside/root'}]}));\n");
  await assert.rejects(loadCanonicalCatalog(root), /leaves plugin root/u);
});

test("CLI help needs no ranker or catalog and malformed input exits two with JSON", async () => {
  const cli = new URL("./benchmark-discovery.mjs", import.meta.url);
  const help = await execFileAsync(process.execPath, [cli.pathname, "--help"]);
  assert.match(help.stdout, /heldout not run/u);
  await assert.rejects(execFileAsync(process.execPath, [cli.pathname, "--iterations", "0"]), (error) => {
    assert.equal(error.code, 2);
    assert.equal(JSON.parse(error.stdout).ok, false);
    return true;
  });
  const imported = await execFileAsync(process.execPath, ["--input-type=module", "-e", "await import(process.argv[1])", cli.href]);
  assert.equal(imported.stdout, "");
});
