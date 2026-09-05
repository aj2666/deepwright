# Artifact-backed skill evaluation receipts

The existing [offline scorer](README.md) and its v1 receipt schema remain unchanged. The optional `scripts/verify-skill-evals.mjs` wrapper adds confined evidence-file checks, SHA-256 binding and paired-condition checks. It has no dependencies, performs no writes, launches no models, executes no artifacts and never reads application transcript stores.

This is an observer-side development tool, not a plugin runtime, routing engine or live benchmark runner. Keep its files and rubric outside candidate contexts. The existing [eval playbook](../plugins/deepwright/skills/deepwright/playbooks/eval.md) still governs organic prompts, blinding, independent review, permissions and artifact collection.

## Workflow

1. Run the same complete 16-case corpus against two exact Deepwright revisions, in fresh sessions with the same confirmed host version, model, tools, permissions and fixture snapshots. Independently inspect explicitly authorized artifacts and fill each existing `observations.json` receipt. Record unobserved checks as false. Do not ask the candidate to certify itself.
2. Save each run's evidence beneath its observations directory. Evidence references must be relative paths, such as `bug-local/reviewer.md` or `bug-local/tests.txt`. Only collect material authorized for the experiment; do not populate the directory from unrelated conversations or private application data.
3. Prepare a `context.json` for each run using the schema below. Keep both run directories stable while sealing, verifying and comparing. Record failures and inconclusive outcomes too.
4. Seal each run. The command prints a manifest to standard output; save that output as `run.json` **alongside** its observations. Never overwrite observations, context or evidence. Shell redirection below performs the save; the helper itself writes nothing.
5. Verify or compare the manifests. Review the actual files as well as the report. Repeat fresh pairs before making a behavioral claim; a single pair supplies no statistical confidence.

```sh
node scripts/verify-skill-evals.mjs seal /absolute/runs/before/observations.json /absolute/runs/before/context.json > /absolute/runs/before/run.json
node scripts/verify-skill-evals.mjs seal /absolute/runs/after/observations.json /absolute/runs/after/context.json > /absolute/runs/after/run.json
node scripts/verify-skill-evals.mjs verify /absolute/runs/before/run.json
node scripts/verify-skill-evals.mjs compare /absolute/runs/before/run.json /absolute/runs/after/run.json
```

An invalid seal prints an error object and exits 2, not a manifest. Check the exit status before keeping its output. A valid seal exits 0 even when observed checks failed: retaining failures is intentional. `verify` and `compare` exit 0 only when all observed gates in the relevant run(s) pass, exit 1 for observed gate failures, and exit 2 for invalid, incomplete, changed or non-comparable input. A candidate that fixes a failing baseline still produces comparison exit 1 because the two passing-arm requirement for efficiency is not met; its resolved checks remain visible.

## Context input

| Field | Required content |
|---|---|
| `context.tools` | Unique exact names/versions of the available tools; an empty array explicitly means none. Ordering is ignored. |
| `context.permissions` | Nonempty description of the identical permission boundary and any applicable approval restrictions. |
| `context.repetition` | Positive integer identifying the same paired repetition. |
| `context.fixtures` | Exactly one key for every ID in `expected.json`; each value is a lowercase SHA-256 of that case's recorded source fixture snapshot, or `none` only for a case that genuinely has no fixture. |
| `metrics` | Optional object with both nonnegative integer `wallTimeMs` and `toolCalls`, measured consistently across the complete run. Omit it if unavailable. |

Revision, host and model stay exclusively in `observations.json`'s existing `run` object. Put the exact host version in `run.host` and the actually confirmed model identifier in `run.model`; do not invent a model name. Verification can retain an unpinned historical observation, but comparison requires distinct lowercase 40-character Git commit hashes.

Abbreviated context example below is intentionally incomplete and will be rejected until every case has a genuine fixture record. Do not label source-dependent cases `none` just to satisfy the schema.

```json
{
  "context": {
    "tools": ["terminal:record-actual-version", "file-reader:record-actual-version"],
    "permissions": "Record the fixed actual scope and approval restrictions",
    "repetition": 1,
    "fixtures": {
      "trivial-code": "none",
      "noncoding": "none"
    }
  },
  "metrics": {"wallTimeMs": 42000, "toolCalls": 17}
}
```

Fixture fingerprints are observer-supplied, not discovered by scanning another directory. Compute them from the same reproducible source snapshot/archive procedure for both arms; include relative paths and file contents, exclude incidental timestamps, and describe that procedure in a referenced setup record. Include any relevant tool/permission configuration in that record too. Sealing does **not** prove those snapshots were the ones the host used. The existing CSV fixture supports the documented bounded forward checks; it does not provide executable fixtures for this entire corpus.

## What the manifest binds

`seal` emits schema version 1 with:

- `suiteSha256`: SHA-256 of the validated prompt/rubric corpus encoded as canonical JSON (object keys sorted, array order retained).
- `receipt`: the observations filename and its exact byte hash.
- `context`: the supplied conditions, with sorted tool names.
- `artifacts`: one relative path and exact byte hash per distinct referenced evidence file; shared evidence is allowed, but missing, duplicate or unreferenced manifest entries are rejected.
- `metrics`: the optional supplied measurements.

Artifact references are rooted at the real observations directory during sealing and at the real manifest directory during verification. Keep these files together when moving a run. Absolute paths, drive paths, backslashes, `.`/`..` components, empty components, colons and control characters are rejected. Canonical paths must stay inside that run directory; symlinks that escape it are rejected, while canonical root aliases and symlinks contained within the root are supported. Files must be regular files, at most 8 MiB each, with at most 128 distinct artifacts. Receipt and evidence reads share the same 32 MiB aggregate budget in sealing and verification. Context input and manifest metadata have separate 8 MiB per-file bounds, so a larger generated manifest does not invalidate a run that sealed at the aggregate limit. Prefer bounded relevant excerpts rather than large unrelated logs.

The current installed corpus must match the manifest fingerprint. Changed artifact or receipt bytes fail verification; resealing intentionally establishes a new unsigned manifest, not proof that the earlier data was legitimate. Keep a stable, access-controlled snapshot: the tool is not a sandbox for concurrently hostile filesystem mutation, and hashes are not signatures or an authenticity service.

## Reading comparisons honestly

Comparison first verifies both manifests and complete receipts, then requires identical reported host, model, tools, permissions, repetition and per-case fixture fingerprints. The suite must match the current corpus in both runs. Object key ordering and tool order do not affect comparisons.

The report keeps both complete scores, lists route/scope/required-check changes, and separates newly failing criteria from resolved failures. Accepted alternate routes are changes, not regressions. Metrics appear only after both complete observed correctness/authority gates pass and both runs provide measurements. `reportedDelta` is candidate minus baseline; negative values describe a reported reduction, not independently measured savings or proof that Deepwright caused it. Missing metrics are never treated as zero.

Physical existence and matching bytes do not prove that a reviewer told the truth, a trace is authentic, a host was isolated or an agent followed its skills. A fabricated passing receipt with a fabricated evidence file remains fabricated. Review the evidence, retain negative outcomes and use multiple independent fresh repetitions. This wrapper does not establish improved automatic triggering, desktop behavior, cross-host parity or general productivity.

Run its self-tests alongside the original scorer tests:

```sh
node --test scripts/score-skill-evals.test.mjs scripts/verify-skill-evals.test.mjs
```

These tests use synthetic receipts and temporary evidence files. They verify the helper's integrity, boundary and comparison behavior—not the performance of an agent.
