#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isMain } from "./is-main.mjs";

const execFileAsync = promisify(execFile);
const splits = ["tuning", "heldout"];
const categories = ["natural", "exact", "ambiguous", "irrelevant"];
const algorithms = ["literal", "lexical", "bm25"];
const buckets = [["skills", "skill"], ["playbooks", "playbook"]];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const text = (value) => typeof value === "string" && value.trim() !== "" && !/[\u0000-\u001f\u007f]/u.test(value);
const check = (value, message) => { if (!value) throw new Error(message); };
const ordered = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export const LIMITATION = "Measures advisory metadata selection, not workflow execution, automatic routing, correctness of agent work, or token/cost savings. Top three is per skill/playbook bucket, up to six suggestions. Returned bytes serialize the same canonical metadata projection for every algorithm, excluding scores and match annotations. Latency is synchronous in-process ranking after metadata loading, excluding CLI startup, file reads, serialization and agent work; timings share one process and are not independent trials.";

function object(value, required, optional, label) {
  check(value && typeof value === "object" && !Array.isArray(value), label + " must be an object");
  check(required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => [...required, ...optional].includes(key)), label + " has missing or unknown fields");
}

export function validateCatalog(catalog) {
  object(catalog, ["skills", "playbooks"], [], "Catalog");
  const result = {};
  for (const [bucket] of buckets) {
    const entries = catalog[bucket], seen = new Set();
    check(Array.isArray(entries) && entries.length <= 1000, "Invalid catalog bucket");
    result[bucket] = Object.freeze(entries.map((entry) => {
      object(entry, ["name", "description", "path"], ["displayName", "invocation", "implicit"], "Catalog entry");
      check(typeof entry.name === "string" && namePattern.test(entry.name) && !seen.has(entry.name), "Invalid or duplicate catalog name");
      seen.add(entry.name);
      for (const key of ["description", "path", "displayName", "invocation"]) {
        if (Object.hasOwn(entry, key)) check(text(entry[key]), "Invalid catalog " + key);
      }
      if (Object.hasOwn(entry, "implicit")) check(typeof entry.implicit === "boolean", "Invalid implicit metadata");
      return Object.freeze({ ...entry });
    }));
  }
  check(result.skills.length + result.playbooks.length > 0, "Catalog must not be empty");
  return Object.freeze(result);
}

export function validateCorpus(corpus, catalog) {
  object(corpus, ["schemaVersion", "description", "cases"], [], "Corpus");
  check(corpus.schemaVersion === 1 && text(corpus.description), "Invalid corpus version or description");
  check(Array.isArray(corpus.cases) && corpus.cases.length > 0 && corpus.cases.length <= 1000, "Invalid corpus case count");
  const validCatalog = validateCatalog(catalog);
  const known = new Set(buckets.flatMap(([bucket, kind]) => validCatalog[bucket].map((entry) => kind + ":" + entry.name)));
  const ids = new Set(), queries = new Set();
  for (const entry of corpus.cases) {
    object(entry, ["id", "split", "category", "query", "relevant"], [], "Query case");
    check(typeof entry.id === "string" && namePattern.test(entry.id) && !ids.has(entry.id), "Invalid or duplicate query ID");
    ids.add(entry.id);
    check(splits.includes(entry.split) && categories.includes(entry.category), "Invalid query split or category");
    check(text(entry.query) && entry.query.length <= 1024, "Invalid query text");
    const normalized = entry.query.trim().toLowerCase().replace(/\s+/gu, " ");
    check(!queries.has(normalized), "Duplicate query text across corpus");
    queries.add(normalized);
    check(Array.isArray(entry.relevant) && new Set(entry.relevant).size === entry.relevant.length && entry.relevant.every((id) => known.has(id)), "Unknown or duplicate relevance label");
    check(entry.category === "irrelevant" ? entry.relevant.length === 0 : entry.relevant.length > 0, "Only irrelevant cases may have no relevance labels");
    if (entry.category === "exact") check(entry.relevant.length === 1, "Exact queries require one expected ID");
    if (entry.category === "ambiguous") check(entry.relevant.length > 1, "Ambiguous queries require alternatives");
  }
  for (const split of splits) for (const category of categories) {
    check(corpus.cases.some((entry) => entry.split === split && entry.category === category), "Every split requires " + category + " coverage");
  }
  return corpus;
}

// Reproduce the pre-find searchEntries filter on canonical metadata only.
export function literalRank(entries, query, limit = 3) {
  const terms = query.toLowerCase().split(/\s+/u).filter(Boolean);
  return entries.filter((entry) => {
    const text = [entry.name, entry.displayName ?? "", entry.description].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  }).slice(0, limit);
}

// Shared metadata projection and tokenizer; deliberately no BM25 or corpus IDF.
export function lexicalRanker(searchTerms, searchDocument) {
  return (entries, query, limit = 3) => {
    const terms = [...new Set(searchTerms(query))];
    const normalized = query.trim().toLowerCase();
    return entries.map((entry) => {
      const document = new Set(searchDocument(entry));
      const overlap = terms.filter((term) => document.has(term)).length;
      const exact = normalized === entry.name.toLowerCase() || normalized === "$deepwright:" + entry.name.toLowerCase();
      return { entry, score: overlap + (exact ? terms.length + 1 : 0) };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || ordered(a.entry.name, b.entry.name))
      .slice(0, limit).map((item) => item.entry);
  };
}

function canonicalSelection(selected, entries) {
  check(Array.isArray(selected) && selected.length <= 3, "Ranker must return at most three entries per bucket");
  const names = new Set();
  return selected.map((entry) => {
    check(entry && typeof entry === "object" && !Array.isArray(entry), "Invalid ranker entry");
    const original = entries.find((item) => item.name === entry.name);
    check(original && !names.has(entry.name), "Unknown or duplicate ranker result");
    names.add(entry.name);
    check(Object.keys(original).every((key) => original[key] === entry[key]), "Ranker changed canonical metadata");
    check(Object.keys(entry).every((key) => Object.hasOwn(original, key) || ["score", "matchedTerms"].includes(key)), "Unexpected ranker result field");
    if (Object.hasOwn(entry, "score")) check(Number.isFinite(entry.score) && entry.score >= 0, "Invalid ranker score");
    if (Object.hasOwn(entry, "matchedTerms")) check(Array.isArray(entry.matchedTerms) && entry.matchedTerms.every(text), "Invalid matched terms");
    return original;
  });
}

function distribution(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1), mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
}

function summarize(rows, timings) {
  const positive = rows.filter((entry) => entry.relevant.length), negative = rows.filter((entry) => !entry.relevant.length);
  const exact = rows.filter((entry) => entry.category === "exact");
  const positiveHits = positive.filter((entry) => entry.hit).length;
  const noMatchPassed = negative.filter((entry) => entry.noMatch).length;
  const exactFirstHits = exact.filter((entry) => entry.exactTop1).length;
  return {
    queries: rows.length, positiveQueries: positive.length, positiveHits,
    hitRateAt3: positive.length ? positiveHits / positive.length : null,
    meanRelevantRecallAt3: positive.length ? positive.reduce((sum, entry) => sum + entry.recallAt3, 0) / positive.length : null,
    noMatchQueries: negative.length, noMatchPassed, noMatchAccuracy: negative.length ? noMatchPassed / negative.length : null,
    exactQueries: exact.length, exactFirstHits, exactTop1Rate: exact.length ? exactFirstHits / exact.length : null,
    returnedBytes: { total: rows.reduce((sum, entry) => sum + entry.returnedBytes, 0), distribution: distribution(rows.map((entry) => entry.returnedBytes)) },
    rankingLatencyMs: distribution(rows.flatMap((entry) => timings.get(entry.id))),
  };
}

export function evaluateRanker(corpus, catalog, ranker, { split = "all", iterations = 25, warmup = 5 } = {}) {
  check(["all", ...splits].includes(split), "Invalid selected split");
  check(Number.isSafeInteger(iterations) && iterations >= 1 && iterations <= 1000, "Iterations must be an integer from 1 through 1000");
  check(Number.isSafeInteger(warmup) && warmup >= 0 && warmup <= 100, "Warmup must be an integer from 0 through 100");
  check(typeof ranker === "function", "Ranker must be callable");
  const metadata = validateCatalog(catalog), timings = new Map();
  const rows = corpus.cases.filter((entry) => split === "all" || entry.split === split).map((entry) => {
    let selected, signature;
    const samples = [];
    for (let iteration = -warmup; iteration < iterations; iteration++) {
      const started = performance.now();
      const skills = ranker(metadata.skills, entry.query, 3);
      const playbooks = ranker(metadata.playbooks, entry.query, 3);
      const elapsed = performance.now() - started;
      selected = { skills: canonicalSelection(skills, metadata.skills), playbooks: canonicalSelection(playbooks, metadata.playbooks) };
      const current = JSON.stringify(selected);
      check(signature === undefined || signature === current, "Ranker results changed across repetitions");
      signature = current;
      if (iteration >= 0) samples.push(elapsed);
    }
    timings.set(entry.id, samples);
    const ids = buckets.flatMap(([bucket, kind]) => selected[bucket].map((item) => kind + ":" + item.name));
    const firstIds = buckets.flatMap(([bucket, kind]) => selected[bucket].length ? [kind + ":" + selected[bucket][0].name] : []);
    const noMatch = ids.length === 0;
    const relevantFound = entry.relevant.filter((id) => ids.includes(id)).length;
    const hit = relevantFound > 0;
    return {
      ...entry, selected: Object.fromEntries(buckets.map(([bucket]) => [bucket, selected[bucket].map((item) => item.name)])),
      noMatch, hit, recallAt3: entry.relevant.length ? relevantFound / entry.relevant.length : null,
      exactTop1: entry.category === "exact" ? entry.relevant.some((id) => firstIds.includes(id)) : null,
      pass: entry.relevant.length ? hit : noMatch, returnedBytes: Buffer.byteLength(signature, "utf8"),
      rankingLatencyMs: distribution(samples),
    };
  });
  check(rows.length > 0, "No cases in selected split");
  return {
    split, iterations, warmup, measured: summarize(rows, timings),
    splits: Object.fromEntries(splits.map((name) => [name, summarize(rows.filter((entry) => entry.split === name), timings)])),
    categories: Object.fromEntries(categories.map((name) => [name, summarize(rows.filter((entry) => entry.category === name), timings)])),
    cases: rows,
  };
}

export function compareRankers(reports) {
  const heldout = reports.bm25.cases.filter((entry) => entry.split === "heldout");
  const positive = heldout.filter((entry) => entry.relevant.length > 0);
  const comparisons = Object.fromEntries(["literal", "lexical"].map((name) => {
    const previous = new Map(reports[name].cases.map((entry) => [entry.id, entry]));
    return [name, {
      regressions: heldout.filter((entry) => previous.get(entry.id)?.pass && !entry.pass).map((entry) => entry.id),
      resolutions: heldout.filter((entry) => !previous.get(entry.id)?.pass && entry.pass).map((entry) => entry.id),
    }];
  }));
  const eligible = heldout.length > 0;
  const gates = {
    heldoutObserved: eligible,
    heldoutPositiveHitRateAtLeast90Percent: positive.length > 0 && positive.filter((entry) => entry.hit).length / positive.length >= 0.9,
    exactIdsFirst: eligible && heldout.filter((entry) => entry.category === "exact").every((entry) => entry.exactTop1),
    irrelevantInputsEmpty: eligible && heldout.filter((entry) => entry.category === "irrelevant").every((entry) => entry.noMatch),
    noRegressionAgainstLiteral: eligible && comparisons.literal.regressions.length === 0,
    noRegressionAgainstLexical: eligible && comparisons.lexical.regressions.length === 0,
  };
  return { eligible, pass: Object.values(gates).every(Boolean), minimumHeldoutPositiveHitRate: 0.9, gates, comparisons, limitation: "These small-corpus selection gates do not automatically approve promotion. Equal outcomes do not establish a benefit from BM25 over lexical overlap. Review misses and measurements separately." };
}

export function runBenchmark(corpus, catalog, rankers, options = {}) {
  validateCorpus(corpus, catalog);
  object(rankers, algorithms, [], "Rankers");
  const reports = Object.fromEntries(algorithms.map((name) => [name, evaluateRanker(corpus, catalog, rankers[name], options)]));
  const qualityGate = compareRankers(reports);
  return { schemaVersion: 1, kind: "discovery-benchmark", ok: qualityGate.pass, selectionOnly: true, limitPerBucket: 3, algorithms: reports, qualityGate, limitation: LIMITATION };
}

export async function loadCanonicalCatalog(pluginRoot) {
  const root = await realpath(pluginRoot);
  const cli = path.join(root, "skills", "deepwright", "scripts", "dist", "deepwright.mjs");
  const cliSha256 = hash(await readFile(cli));
  const started = performance.now();
  const catalog = Object.fromEntries(await Promise.all(buckets.map(async ([bucket]) => {
    const { stdout } = await execFileAsync(process.execPath, [cli, bucket, "--json"], { cwd: root, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    const report = JSON.parse(stdout);
    check(report.tool === "deepwright" && report.command === bucket && Array.isArray(report[bucket]), "Invalid canonical metadata report");
    return [bucket, report[bucket].map((entry) => {
      const relative = path.relative(root, entry.path);
      check(relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative), "Canonical metadata path leaves plugin root");
      return { ...entry, path: relative.split(path.sep).join("/") };
    })];
  })));
  check(hash(await readFile(cli)) === cliSha256, "CLI changed while loading metadata; use a stable snapshot");
  const validated = validateCatalog(catalog);
  return {
    catalog: validated,
    source: { pluginRoot: root, cliSha256, catalogSha256: hash(JSON.stringify(validated)), catalogLoadingMs: performance.now() - started },
  };
}

export function verifyFreeze(bytes, freeze) {
  const corpus = JSON.parse(bytes.toString("utf8"));
  check(freeze && freeze.corpusSha256 === hash(bytes), "Frozen corpus SHA-256 differs");
  check(freeze.heldoutSha256 === hash(JSON.stringify(corpus.cases.filter((entry) => entry.split === "heldout"))), "Frozen heldout SHA-256 differs");
  return { corpusSha256: freeze.corpusSha256, heldoutSha256: freeze.heldoutSha256, createdAt: freeze.createdAt ?? null, limitation: "A matching receipt preserves bytes; it does not prove blinding or author independence." };
}

const usage = "Usage: node scripts/benchmark-discovery.mjs [--plugin-root PATH] [--corpus PATH] [--freeze PATH] [--split tuning|heldout|all] [--iterations 1..1000]\nPrint-only observer benchmark. Uses the specified plugin's built skills/playbooks listing once and current ranking.mjs. All algorithms receive the same canonical metadata. Exit 0: heldout gates pass; 1: gates fail or heldout not run; 2: invalid input or unavailable capability.\n";

export async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { console.log(usage + LIMITATION); return; }
  try {
    const options = {}, allowed = ["--plugin-root", "--corpus", "--freeze", "--split", "--iterations"];
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index], value = args[index + 1];
      check(allowed.includes(key) && value && !value.startsWith("--") && !Object.hasOwn(options, key), "Invalid or repeated arguments; use --help");
      options[key] = value;
    }
    if (options["--iterations"] !== undefined) check(/^[1-9]\d*$/u.test(options["--iterations"]), "Invalid iteration count");
    const bytes = await readFile(options["--corpus"] ?? new URL("../evals/discovery/queries.json", import.meta.url));
    const corpus = JSON.parse(bytes.toString("utf8"));
    const frozen = options["--freeze"] ? verifyFreeze(bytes, JSON.parse(await readFile(options["--freeze"], "utf8"))) : null;
    const loaded = await loadCanonicalCatalog(options["--plugin-root"] ?? fileURLToPath(new URL("../plugins/deepwright", import.meta.url)));
    const moduleUrl = new URL("../plugins/deepwright/skills/deepwright/scripts/discovery/ranking.mjs", import.meta.url);
    const rankerSha256 = hash(await readFile(moduleUrl));
    const { rankEntries, searchTerms, searchDocument } = await import(moduleUrl);
    const report = runBenchmark(corpus, loaded.catalog, { literal: literalRank, lexical: lexicalRanker(searchTerms, searchDocument), bm25: rankEntries }, {
      split: options["--split"] ?? "all", iterations: options["--iterations"] === undefined ? 25 : Number(options["--iterations"]),
    });
    check(hash(await readFile(moduleUrl)) === rankerSha256, "Ranker changed during measurement; use a stable snapshot");
    console.log(JSON.stringify({ ...report, catalog: loaded.catalog, source: { ...loaded.source, node: process.version, corpusSha256: hash(bytes), rankerSha256, observerSha256: hash(await readFile(new URL("./benchmark-discovery.mjs", import.meta.url))), freeze: frozen } }, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ schemaVersion: 1, kind: "discovery-benchmark", ok: false, error: error.message, limitation: LIMITATION }, null, 2));
    process.exitCode = 2;
  }
}

if (await isMain(import.meta.url)) await main(process.argv.slice(2));
