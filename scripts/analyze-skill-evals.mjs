#!/usr/bin/env node
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeRuns } from "./verify-skill-evals.mjs";

export async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: node scripts/analyze-skill-evals.mjs <baseline/run.json> <candidate/run.json> [<baseline/run.json> <candidate/run.json> ...]\nRead-only aggregation of verified matched pairs. Exit 0: all gates pass; 1: observed failures; 2: invalid evidence. No skill edits or promotion.");
    return;
  }
  try {
    if (!args.length || args.length % 2) throw new Error("Supply baseline/candidate manifest pairs; use --help");
    const pairs = Array.from({ length: args.length / 2 }, (_, index) => args.slice(index * 2, index * 2 + 2));
    const report = await analyzeRuns(pairs);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ schemaVersion: 1, ok: false, error: error.message }));
    process.exitCode = 2;
  }
}
if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
