# Skill routing evaluations

This is an observer-side regression corpus, not a routing engine or live benchmark runner. `prompts.json` contains 16 ordinary requests; `expected.json` contains observer-only routes, authorization scopes, and required checks. `deepwright/<name>` means a selected playbook, a bare name means a leaf skill, and `none` means no Deepwright workflow. Accepted alternatives are explicit.

Keep rubrics, receipts, and evaluation instructions outside candidate contexts. The [eval playbook](../plugins/deepwright/skills/deepwright/playbooks/eval.md) governs organic prompts, blinding, independent review, permissions, and evidence collection.

## Fixtures and self-tests

`fixtures/csv/` contains one deliberately defective source fixture and its neutral contract. Do not repair the committed fixture while testing skills. Copy only its project files into a neutral working directory. It does not supply the distinct parser, performance, checkpoint, and other fixtures required by the entire corpus.

```sh
npm run test:evals
node scripts/score-skill-evals.mjs --help
node scripts/verify-skill-evals.mjs --help
```

Tests use synthetic receipts and temporary evidence. They establish schema, completeness, boundary, integrity, and comparison behavior—not that an agent followed a skill, routed correctly, or became faster.

## Collect a real comparison

1. Use two exact Deepwright revisions in fresh, isolated sessions with the same confirmed host version, model, tools, permissions, and per-case fixture snapshots. Check which variant is installed and exclude unintended global rules/plugins without bypassing permissions.
2. Give each candidate only an organic prompt and the project context it needs. Do not reveal the rubric, intended route, other variants, or these instructions. Give delegated workers the normal task scope and constraints, not observer files.
3. Save only explicitly authorized evidence in a separate run directory: route selection, tool receipts, diffs, test output, and reviewer records. Do not search unrelated conversations or application transcript stores. Record unavailable tools and sequential fallbacks honestly.
4. Have an independent observer inspect the artifacts and fill one receipt for every case. Record unknown or unobserved checks as `false` and explain the uncertainty in the evidence. Never ask a candidate to certify its own compliance.
5. Retain failures and ambiguous outcomes, repeat fresh paired runs, and report sample sizes and limitations. Report correctness and authorization failures before efficiency. Tooling self-tests and a single paired run do not establish improved automatic triggering or general productivity.

## Score observations

```sh
node scripts/score-skill-evals.mjs /absolute/runs/before/observations.json
```

Exit codes: `0` all observed gates pass; `1` a route, scope, or required check fails; `2` invalid or incomplete input. Unknown, duplicate, and missing case IDs fail, as do extra fields, absent evidence, and non-boolean checks. The scorer always requires the complete corpus.

The example below is intentionally incomplete and cannot pass. Include all 16 cases and use the exact required check names from `expected.json`.

```json
{
  "schemaVersion": 1,
  "run": {
    "revision": "exact-commit",
    "host": "host-and-version",
    "model": "actual-confirmed-model"
  },
  "cases": [{
    "id": "bug-local",
    "route": "deepwright/bug-fix",
    "scope": "workspace-write",
    "checks": {
      "reproduced-before-fix": false,
      "verified-result": false,
      "no-external-writes": false
    },
    "evidence": ["bug-local/reviewer.md", "bug-local/tests.txt"]
  }]
}
```

The scorer checks observer-supplied labels and booleans. It does not read or authenticate evidence references. A fabricated passing receipt remains fabricated.

## Seal, verify, and compare artifacts

The optional dependency-free verifier binds receipts to actual evidence bytes and the current suite. It performs no writes, launches no models, and executes no artifacts. Keep stable run directories separate from candidate projects:

```text
before/
  observations.json
  context.json
  run.json
  bug-local/reviewer.md
  bug-local/tests.txt
after/
  ...
```

Prepare each `context.json`, then seal each run and save the printed manifest **alongside** its observations. Shell redirection performs the write; the helper itself writes nothing. Use a new output path and never overwrite observations, context, or evidence.

```sh
node scripts/verify-skill-evals.mjs seal /absolute/runs/before/observations.json /absolute/runs/before/context.json > /absolute/runs/before/run.json
node scripts/verify-skill-evals.mjs seal /absolute/runs/after/observations.json /absolute/runs/after/context.json > /absolute/runs/after/run.json
node scripts/verify-skill-evals.mjs verify /absolute/runs/before/run.json
node scripts/verify-skill-evals.mjs compare /absolute/runs/before/run.json /absolute/runs/after/run.json
```

Check each seal command's exit status before retaining its output. An invalid seal prints an error object and exits `2`, not a manifest. A valid seal exits `0` even when observed checks failed, so negative outcomes remain recordable. `verify` and `compare` return `0` for all observed gates passing, `1` for observed gate failures, and `2` for invalid, changed, incomplete, or non-comparable input. A candidate that fixes a failing baseline still returns comparison exit `1`; resolved checks are visible but efficiency requires both arms to pass.

### Context schema

| Field | Required content |
|---|---|
| `context.tools` | Unique exact tool names/versions; an empty array means none. Order is ignored. |
| `context.permissions` | Nonempty description of the identical permission boundary and approval restrictions. |
| `context.repetition` | Positive integer for the same paired repetition. |
| `context.fixtures` | Exactly every case ID from `expected.json`, mapped to its fixture snapshot's lowercase SHA-256; use `none` only when that case genuinely needs no fixture. |
| `metrics` | Optional object containing both nonnegative integer `wallTimeMs` and `toolCalls`, measured consistently for the complete run. Omit unavailable metrics. |

Revision, host, and model remain in the receipt's `run` object. Comparison requires distinct lowercase 40-character Git commit hashes; verification can retain an unpinned historical observation.

This context example is intentionally incomplete. Add genuine fixture records for every case before using it:

```json
{
  "context": {
    "tools": ["terminal:record-actual-version"],
    "permissions": "Record the actual fixed scope and approval restrictions",
    "repetition": 1,
    "fixtures": {"trivial-code": "none", "noncoding": "none"}
  },
  "metrics": {"wallTimeMs": 42000, "toolCalls": 17}
}
```

Compute fixture fingerprints with the same reproducible snapshot procedure for both arms: include relative paths and file contents, exclude incidental timestamps, and document the procedure in a referenced setup record. Fingerprints are observer-supplied; sealing does not prove the host used those snapshots.

### Manifest and filesystem boundaries

A v1 manifest contains `suiteSha256` (canonical JSON fingerprint of the validated corpus), `receipt` (filename and byte hash), `context` (supplied conditions with sorted tools), `artifacts` (one relative path and byte hash for each distinct evidence file), and optional `metrics`. Missing, duplicate, or unreferenced artifact entries fail verification. Object keys are sorted for suite hashing; array order is retained.

References resolve from the real observations directory during sealing and the real manifest directory during verification. Keep those files together. Absolute paths, drive paths, backslashes, colons, control characters, empty components, and `.`/`..` components are rejected. Canonical targets must remain within the run directory; contained symlinks and root aliases are supported, escaping links are rejected.

Files must be regular and at most **8 MiB each**, with no more than **128 distinct artifacts**. Receipt and evidence share a **32 MiB** aggregate budget. Context and manifest metadata have separate 8 MiB limits. Prefer relevant excerpts to unrelated logs.

The current suite must match the manifest fingerprint. Receipt or evidence byte changes fail verification. Keep stable, access-controlled snapshots: this is not a sandbox for concurrently hostile filesystem mutation. Resealing creates a new unsigned manifest; hashes are not signatures or proof of authenticity.

### Interpret comparisons

Both complete receipts and manifests are verified before comparison. Reported host, model, tools, permissions, repetition, and per-case fixture fingerprints must match; key ordering and tool ordering do not matter.

Reports retain both scores, route/scope/check changes, newly failing criteria, and resolved failures. Accepted alternate routes are changes rather than regressions. Metrics appear only when both complete correctness/authority gates pass and both runs provide measurements. `reportedDelta` is candidate minus baseline; missing metrics are not zero. A negative delta is an observer-reported reduction, not independently measured savings or causal evidence.

Matching bytes cannot prove reviewer truth, trace authenticity, host isolation, or agent behavior. Inspect the evidence and retain non-improving results. These tools do not establish desktop behavior, cross-host parity, automatic-trigger accuracy, or general cost savings.
