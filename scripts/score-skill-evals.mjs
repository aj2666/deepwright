#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isMain } from "./is-main.mjs";

export const LIMITATION = "Scores observer-supplied routing, scope, and check receipts only; does not verify traces, diffs, or actual agent behavior.";
const scopes = new Set(["read-only", "workspace-write", "checkpoint-only"]);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value, keys, label) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  requireValue(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), `${label} has missing or unknown fields`);
}
function strings(value, label) {
  requireValue(Array.isArray(value) && value.length > 0 && value.every(nonempty), `${label} must be a nonempty string array`);
  requireValue(new Set(value).size === value.length, `${label} contains duplicates`);
}
export async function loadSuite() {
  const read = async (name) => JSON.parse(await readFile(new URL(`../evals/${name}.json`, import.meta.url), "utf8"));
  const [prompts, expected] = await Promise.all([read("prompts"), read("expected")]);
  requireValue(Array.isArray(prompts) && prompts.length > 0 && Array.isArray(expected), "Invalid evaluation suite");
  const ids = new Set();
  for (const entry of prompts) {
    object(entry, ["id", "prompt"], "Prompt");
    requireValue(nonempty(entry.id) && nonempty(entry.prompt) && !ids.has(entry.id), "Invalid or duplicate prompt ID");
    ids.add(entry.id);
  }
  const seen = new Set();
  for (const entry of expected) {
    object(entry, ["id", "routes", "scope", "requiredChecks"], "Expectation");
    requireValue(ids.has(entry.id) && !seen.has(entry.id), "Unknown or duplicate expected ID");
    seen.add(entry.id);
    strings(entry.routes, `${entry.id}.routes`);
    strings(entry.requiredChecks, `${entry.id}.requiredChecks`);
    requireValue(scopes.has(entry.scope), `Invalid scope for ${entry.id}`);
  }
  requireValue(seen.size === ids.size, "Every prompt requires an expectation");
  return { prompts, expected };
}
export function scoreReceipts(receipt, expected) {
  object(receipt, ["schemaVersion", "run", "cases"], "Receipt");
  requireValue(receipt.schemaVersion === 1, "schemaVersion must be 1");
  object(receipt.run, ["revision", "host", "model"], "run");
  requireValue(Object.values(receipt.run).every(nonempty), "run metadata must contain nonempty strings");
  requireValue(Array.isArray(receipt.cases), "cases must be an array");
  const expectations = new Map(expected.map((entry) => [entry.id, entry]));
  const seen = new Set();
  const results = [];
  for (const entry of receipt.cases) {
    object(entry, ["id", "route", "scope", "checks", "evidence"], "Case");
    requireValue(nonempty(entry.id) && expectations.has(entry.id), `Unknown case ID: ${String(entry.id)}`);
    requireValue(!seen.has(entry.id), `Duplicate case ID: ${entry.id}`);
    seen.add(entry.id);
    const target = expectations.get(entry.id);
    requireValue(nonempty(entry.route) && scopes.has(entry.scope), `Invalid route or scope: ${entry.id}`);
    object(entry.checks, target.requiredChecks, `${entry.id}.checks`);
    requireValue(Object.values(entry.checks).every((value) => typeof value === "boolean"), `${entry.id}.checks must be booleans, not claims or null`);
    strings(entry.evidence, `${entry.id}.evidence`);
    const failures = [];
    if (!target.routes.includes(entry.route)) failures.push(`route: expected ${target.routes.join(" or ")}, observed ${entry.route}`);
    if (target.scope !== entry.scope) failures.push(`scope: expected ${target.scope}, observed ${entry.scope}`);
    for (const check of target.requiredChecks) if (!entry.checks[check]) failures.push(`check: ${check}`);
    results.push({ id: entry.id, pass: failures.length === 0, failures });
  }
  const missing = expected.filter((entry) => !seen.has(entry.id)).map((entry) => entry.id);
  requireValue(missing.length === 0, `Missing cases: ${missing.join(", ")}`);
  const passed = results.filter((entry) => entry.pass).length;
  return { schemaVersion: 1, ok: passed === expected.length, run: receipt.run, total: expected.length, passed, failed: expected.length - passed, results, limitation: LIMITATION };
}
async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: node scripts/score-skill-evals.mjs <observations.json>\nScores the complete evaluation batch offline. Exit: 0 pass, 1 failed checks, 2 invalid input.\n" + LIMITATION);
    return;
  }
  try {
    requireValue(args.length === 1 && !args[0].startsWith("-"), "Expected one observations.json path; use --help");
    const { expected } = await loadSuite();
    const receipt = JSON.parse(await readFile(args[0], "utf8"));
    const report = scoreReceipts(receipt, expected);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ schemaVersion: 1, ok: false, error: error.message, limitation: LIMITATION }, null, 2));
    process.exitCode = 2;
  }
}
if (await isMain(import.meta.url)) await main(process.argv.slice(2));
