#!/usr/bin/env node
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSuite, scoreReceipts } from "./score-skill-evals.mjs";

export const LIMITATION = "Verifies confined artifact bytes and matching reported conditions, not reviewer truth, actual host isolation, or agent behavior. Hashes are not signatures. One pair is not statistical or causal evidence.";
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_RUN_BYTES = 32 * 1024 * 1024;
const MAX_ARTIFACTS = 128;
const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const nonempty = (value) => typeof value === "string" && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value, required, optional, label) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  requireValue(required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => [...required, ...optional].includes(key)), `${label} has missing or unknown fields`);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
function relativeName(value) {
  requireValue(nonempty(value) && !/[\\:]/.test(value) && !path.posix.isAbsolute(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== ".."), "Artifact paths must be portable, confined relative file paths");
  return value;
}
function reference(value, label) {
  object(value, ["path", "sha256"], [], label);
  relativeName(value.path);
  requireValue(typeof value.sha256 === "string" && hashPattern.test(value.sha256), `${label} requires a lowercase SHA-256`);
}
async function readBounded(filename, budget) {
  // Nonblocking open lets us reject pipes/devices without waiting for input.
  const handle = await open(filename, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    requireValue(stat.isFile(), "Evidence and metadata must be regular files");
    requireValue(stat.size <= MAX_FILE_BYTES, "File exceeds the 8 MiB evidence limit");
    requireValue(budget.bytes + stat.size <= MAX_RUN_BYTES, "Run exceeds the 32 MiB evidence limit");
    const buffer = Buffer.alloc(stat.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    requireValue(count === stat.size, "File size changed while reading; use a stable run snapshot");
    budget.bytes += count;
    return buffer.subarray(0, count);
  } finally {
    await handle.close();
  }
}
async function readRelative(root, name, budget) {
  relativeName(name);
  const filename = await realpath(path.join(root, ...name.split("/")));
  const relative = path.relative(root, filename);
  requireValue(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "Evidence resolves outside the authorized run directory");
  return readBounded(filename, budget);
}
async function suiteInfo() {
  const suite = await loadSuite();
  return { ...suite, sha256: digest(JSON.stringify(canonical(suite))) };
}
function contextInput(input, expected) {
  object(input, ["context"], ["metrics"], "Context input");
  object(input.context, ["tools", "permissions", "repetition", "fixtures"], [], "context");
  const { tools, permissions, repetition, fixtures } = input.context;
  requireValue(Array.isArray(tools) && tools.every(nonempty) && new Set(tools).size === tools.length, "context.tools must contain unique tool names (or be empty)");
  requireValue(nonempty(permissions), "context.permissions must describe the fixed permission boundary");
  requireValue(Number.isSafeInteger(repetition) && repetition > 0, "context.repetition must be a positive integer");
  object(fixtures, expected.map((entry) => entry.id), [], "context.fixtures");
  requireValue(Object.values(fixtures).every((value) => typeof value === "string" && (value === "none" || hashPattern.test(value))), "Every fixture requires a SHA-256 or explicit none");
  if (Object.hasOwn(input, "metrics")) {
    object(input.metrics, ["wallTimeMs", "toolCalls"], [], "metrics");
    requireValue(Object.values(input.metrics).every((value) => Number.isSafeInteger(value) && value >= 0), "metrics must be nonnegative safe integers");
  }
  return { context: { tools: [...tools].sort(), permissions, repetition, fixtures }, ...(Object.hasOwn(input, "metrics") ? { metrics: input.metrics } : {}) };
}
function evidenceNames(receipt) {
  const names = [...new Set(receipt.cases.flatMap((entry) => entry.evidence))].sort();
  requireValue(names.length <= MAX_ARTIFACTS, "Run exceeds the 128-artifact limit");
  names.forEach(relativeName);
  return names;
}
export async function sealRun(observationsPath, contextPath) {
  const budget = { bytes: 0 };
  const observations = await realpath(observationsPath);
  const root = path.dirname(observations);
  const receiptBytes = await readBounded(observations, budget);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  const suite = await suiteInfo();
  scoreReceipts(receipt, suite.expected); // Validate completeness; failed observations must remain sealable.
  // Metadata has its own per-file bound; only receipt + evidence share the run budget.
  const input = contextInput(JSON.parse((await readBounded(await realpath(contextPath), { bytes: 0 })).toString("utf8")), suite.expected);
  const artifacts = [];
  for (const name of evidenceNames(receipt)) artifacts.push({ path: name, sha256: digest(await readRelative(root, name, budget)) });
  return { schemaVersion: 1, suiteSha256: suite.sha256, receipt: { path: relativeName(path.basename(observations)), sha256: digest(receiptBytes) }, ...input, artifacts };
}
async function verified(manifestPath) {
  const budget = { bytes: 0 };
  const filename = await realpath(manifestPath);
  const root = path.dirname(filename);
  const manifest = JSON.parse((await readBounded(filename, { bytes: 0 })).toString("utf8"));
  object(manifest, ["schemaVersion", "suiteSha256", "receipt", "context", "artifacts"], ["metrics"], "Manifest");
  requireValue(manifest.schemaVersion === 1, "Manifest schemaVersion must be 1");
  const suite = await suiteInfo();
  requireValue(manifest.suiteSha256 === suite.sha256, "Suite fingerprint differs from the current prompt/rubric corpus");
  const input = contextInput({ context: manifest.context, ...(Object.hasOwn(manifest, "metrics") ? { metrics: manifest.metrics } : {}) }, suite.expected);
  reference(manifest.receipt, "receipt");
  const bytes = await readRelative(root, manifest.receipt.path, budget);
  requireValue(digest(bytes) === manifest.receipt.sha256, "Receipt SHA-256 mismatch");
  const receipt = JSON.parse(bytes.toString("utf8"));
  const score = scoreReceipts(receipt, suite.expected);
  const names = evidenceNames(receipt);
  requireValue(Array.isArray(manifest.artifacts) && manifest.artifacts.length === names.length, "Manifest must bind exactly the referenced evidence files");
  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    reference(artifact, "artifact");
    requireValue(names.includes(artifact.path) && !seen.has(artifact.path), "Unknown or duplicate artifact path");
    seen.add(artifact.path);
    requireValue(digest(await readRelative(root, artifact.path, budget)) === artifact.sha256, `Evidence SHA-256 mismatch: ${artifact.path}`);
  }
  return { manifest: { ...manifest, ...input }, receipt, receiptPath: await realpath(path.join(root, manifest.receipt.path)), score, expected: suite.expected };
}
export async function verifyRun(manifestPath) {
  const { manifest, score } = await verified(manifestPath);
  return { schemaVersion: 1, kind: "verification", ok: score.ok, artifactIntegrity: true, verifiedArtifacts: manifest.artifacts.length, suiteSha256: manifest.suiteSha256, context: manifest.context, score, limitation: LIMITATION };
}
function criteria(entry, expected) {
  return { route: expected.routes.includes(entry.route), scope: entry.scope === expected.scope, ...Object.fromEntries(expected.requiredChecks.map((check) => [`check:${check}`, entry.checks[check]])) };
}
export async function compareRuns(baselinePath, candidatePath) {
  const baseline = await verified(baselinePath);
  const candidate = await verified(candidatePath);
  return compareVerified(baseline, candidate);
}
function compareVerified(baseline, candidate) {
  for (const field of ["host", "model"]) requireValue(baseline.receipt.run[field] === candidate.receipt.run[field], `Paired ${field} differs`);
  for (const field of ["tools", "permissions", "repetition", "fixtures"]) requireValue(same(baseline.manifest.context[field], candidate.manifest.context[field]), `Paired ${field} differs`);
  requireValue([baseline, candidate].every((run) => commitPattern.test(run.receipt.run.revision)), "Comparisons require exact lowercase 40-hex Git revisions");
  requireValue(baseline.receipt.run.revision !== candidate.receipt.run.revision, "Comparisons require distinct revisions");
  const before = new Map(baseline.receipt.cases.map((entry) => [entry.id, entry]));
  const after = new Map(candidate.receipt.cases.map((entry) => [entry.id, entry]));
  const changes = [], regressions = [], resolvedFailures = [];
  for (const expected of baseline.expected) {
    const left = before.get(expected.id), right = after.get(expected.id);
    const fields = [];
    for (const field of ["route", "scope"]) if (left[field] !== right[field]) fields.push({ field, before: left[field], after: right[field] });
    for (const check of expected.requiredChecks) if (left.checks[check] !== right.checks[check]) fields.push({ field: `check:${check}`, before: left.checks[check], after: right.checks[check] });
    if (fields.length) changes.push({ id: expected.id, fields });
    const leftCriteria = criteria(left, expected), rightCriteria = criteria(right, expected);
    const worse = Object.keys(leftCriteria).filter((key) => leftCriteria[key] && !rightCriteria[key]);
    const better = Object.keys(leftCriteria).filter((key) => !leftCriteria[key] && rightCriteria[key]);
    if (worse.length) regressions.push({ id: expected.id, criteria: worse });
    if (better.length) resolvedFailures.push({ id: expected.id, criteria: better });
  }
  const eligible = baseline.score.ok && candidate.score.ok;
  const hasMetrics = Object.hasOwn(baseline.manifest, "metrics") && Object.hasOwn(candidate.manifest, "metrics");
  const efficiency = !eligible ? { eligible: false, reason: "Both complete correctness and authority gates must pass first" }
    : !hasMetrics ? { eligible: true, available: false, reason: "Both runs need reported metrics; no savings inferred" }
      : { eligible: true, available: true, reportedDelta: Object.fromEntries(["wallTimeMs", "toolCalls"].map((key) => [key, candidate.manifest.metrics[key] - baseline.manifest.metrics[key]])), limitation: "Candidate minus baseline; observer-reported measurements, not independently timed" };
  return { schemaVersion: 1, kind: "comparison", ok: eligible, pairedRuns: 1, artifactIntegrity: true, reportedConditionsMatch: true, baseline: baseline.score, candidate: candidate.score, changes, regressions, resolvedFailures, efficiency, limitation: LIMITATION };
}

export async function analyzeRuns(pairs) {
  requireValue(Array.isArray(pairs) && pairs.length > 0 && pairs.length <= 100, "Supply 1 through 100 baseline/candidate pairs");
  const paths = new Set(), receipts = new Set(), fingerprints = new Set(), repetitions = new Set(), results = [], failures = new Map();
  let cohort;
  for (const pair of pairs) {
    requireValue(Array.isArray(pair) && pair.length === 2 && pair.every(nonempty), "Each pair requires two manifest paths");
    for (const filename of pair) {
      const resolved = await realpath(filename);
      requireValue(!paths.has(resolved), "A manifest cannot be reused across pairs");
      paths.add(resolved);
    }
    const baseline = await verified(pair[0]), candidate = await verified(pair[1]);
    for (const run of [baseline, candidate]) {
      requireValue(!receipts.has(run.receiptPath), "An underlying receipt cannot be reused across runs");
      receipts.add(run.receiptPath);
      const fingerprint = digest(JSON.stringify(canonical({ receipt: run.manifest.receipt.sha256,
        artifacts: [...run.manifest.artifacts].sort((a, b) => a.path.localeCompare(b.path)) })));
      requireValue(!fingerprints.has(fingerprint), "Identical receipt and evidence fingerprints cannot count as another run");
      fingerprints.add(fingerprint);
    }
    const comparison = compareVerified(baseline, candidate);
    const { repetition, ...conditions } = baseline.manifest.context;
    const current = { ...baseline.receipt.run, candidateRevision: candidate.receipt.run.revision, conditions, suiteSha256: baseline.manifest.suiteSha256 };
    if (cohort) requireValue(same(cohort, current), "Batch conditions or revisions differ; analyze separate cohorts");
    else cohort = current;
    requireValue(!repetitions.has(repetition), "Repeated repetition identifier");
    repetitions.add(repetition);
    results.push({ repetition, ...comparison });
    for (const [arm, run] of [["baseline", baseline], ["candidate", candidate]]) {
      for (const result of run.score.results) {
        const expectation = run.expected.find((entry) => entry.id === result.id);
        for (const failure of result.failures) {
          const category = failure.startsWith("route:") ? "routing" : failure.startsWith("scope:") ? "authority" : "behavior";
          const criterion = category === "behavior" ? failure.slice(7) : category;
          const key = JSON.stringify([result.id, category, criterion]);
          if (!failures.has(key)) failures.set(key, { case: result.id, expectedRoutes: expectation.routes, category, criterion, baseline: [], candidate: [] });
          failures.get(key)[arm].push(repetition);
        }
      }
    }
  }
  const recurring = [...failures.values()].map((entry) => ({ ...entry,
    baseline: entry.baseline.sort((a, b) => a - b), candidate: entry.candidate.sort((a, b) => a - b),
    recurringInCandidate: entry.candidate.length >= 2,
  })).sort((a, b) => b.candidate.length - a.candidate.length || a.case.localeCompare(b.case) || a.criterion.localeCompare(b.criterion));
  return { schemaVersion: 1, kind: "failure-analysis", ok: results.every((entry) => entry.ok), pairedRuns: results.length,
    cohort, failures: recurring, pairs: results.sort((a, b) => a.repetition - b.repetition),
    limitation: LIMITATION + " Counts describe distinct reported repetitions, not independent trials or causal skill defects. Expected routes locate review scope, not blame. No automatic promotion or skill edits." };
}
async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: node scripts/verify-skill-evals.mjs seal <observations.json> <context.json>\n       node scripts/verify-skill-evals.mjs verify <run.json>\n       node scripts/verify-skill-evals.mjs compare <baseline/run.json> <candidate/run.json>\nOffline, read-only. Seal prints JSON: save it alongside observations, without overwriting inputs.\nExit: 0 sealed/passing, 1 observed gate failure, 2 invalid/unverifiable input.\n" + LIMITATION);
    return;
  }
  try {
    const [command, ...files] = args;
    requireValue((command === "verify" && files.length === 1) || (["seal", "compare"].includes(command) && files.length === 2), "Invalid arguments; use --help");
    const report = command === "seal" ? await sealRun(...files) : command === "verify" ? await verifyRun(...files) : await compareRuns(...files);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = command === "seal" || report.ok ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ schemaVersion: 1, ok: false, error: error.message, limitation: LIMITATION }, null, 2));
    process.exitCode = 2;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
