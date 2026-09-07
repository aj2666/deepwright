# Skill routing evaluations

This is an observer-side regression corpus, not a routing engine or live benchmark runner. `prompts.json` contains the ordinary requests; `expected.json` contains observer-only routes, authorization scopes, and required checks. These files are the authoritative case inventory. `deepwright/<name>` means a selected playbook, a bare name means a leaf skill, and `none` means no Deepwright workflow. Accepted alternatives are explicit.

Keep rubrics, receipts, and evaluation instructions outside candidate contexts. The [eval playbook](../plugins/deepwright/skills/deepwright/playbooks/eval.md) governs organic prompts, blinding, independent review, permissions, and evidence collection.

## Fixtures and self-tests

All 39 cases have a preparation declaration in `fixtures.json`. Cases needing a project use the supplied sources; conversation-only cases receive an empty directory. Keep the committed defects intact and prepare each run in a fresh directory outside this repository:

```sh
node scripts/prepare-skill-eval.mjs list
node scripts/prepare-skill-eval.mjs prepare explicit-tdd /absolute/runs/parser-candidate
node scripts/prepare-skill-eval.mjs snapshot /absolute/runs/parser-candidate
```

The destination's parent must exist. Preparation refuses an existing destination and any destination inside the fixture sources, including filesystem aliases. It copies only the declared project, initializes a reproducible Git baseline, and applies any unfinished-work overlay after committing that baseline. It does not run project code, launch a model, install skills, or impose host isolation. Git initialization ignores ambient hooks, templates, signing, and Git configuration. The printed result contains the original prompt, fixture fingerprints, file hashes, and baseline commit; keep this setup record outside the candidate project. It contains no expected routes, required checks, or observer controls.

| Project | Cases and behavior |
|---|---|
| `csv` | Export defect and scope clarification; deliberately drops empty fields and zero values |
| `retry` | Feature, specification, and review cases; compatible fixed-retry baseline |
| `parser` | TDD, separate parser/formatter review, and local diagnosis; independent empty-input and formatter defects |
| `search` | HTTP endpoint and deterministic benchmark with the same query workload and response checksum |
| `hanging-tests` | Tests finish but a retained interval prevents process exit |
| `cache` | Request path through the HTTP server, router, service, cache, and store |
| `config` | Valid project configuration with inherited role choices and distinguishable defaults |
| `checkpoint` | Committed baseline plus unfinished implementation, failing checks, and an existing handoff |
| `loader` | A reproducible working-directory-dependent fixture lookup failure |
| `coverage` | Source plus an empty successful search, paginated comments, and an invalid test command |
| `observed-spec` | Active retry behavior, conflicting historical documentation, and a narrow unexecuted test |
| `boundary-contract` | Shared schema, real provider serialization, and a consumer tested only with a hand-written response |
| `review-failures` | False success after a storage error, a weak assertion, and intentional preview cancellation |
| `click-path` | Individually working state actions whose composition clears the user's selection |
| `lessons` | A bounded task record with existing guidance and a counterexample |
| `reuse` | A local normalization helper that already satisfies the requested boundary |
| `batch-import` | Original batch-size rationale, later derivative claims, and a separate concurrency change |
| `retry-review` | Uncommitted retry options over the `retry` base, with an author report and saved source from the earlier implementation |
| `shipping-context` | Reviewed and current base/head source snapshots for a checkout change whose stable patch ID stays the same |
| `reading-list` | Browser list and real HTTP/filesystem service awaiting a form/save feature, with failure recovery and concurrent persistence requirements |
| `cache` + `cache-update` | Uncommitted item-editing overlay whose cache invalidation races an awaited save; deterministic HTTP interleaving checks |
| `service-review` | Resource-ownership and false-success defects alongside intentional preview cancellation and public metadata |
| `plugin-authoring` | A named plugin with a manifest-owned `workflows/` directory, scoped save-flow incident, and existing skill/application to preserve |

These projects require no credentials, dependency installation, or external service. Use host-enforced bounds when executing candidates: the hanging-process fixture intentionally needs termination, and candidate code may hang. Search timings are informational; compare identical workloads and verify responses without a flaky CI speed threshold.

`snapshot` hashes relative paths and file bytes, excluding the root `.git` directory. It detects changed, added, or removed files, but does not capture permissions, Git history, or transient writes that were undone. Pair snapshots with separately observed Git state and permitted tool receipts when checking no-write or no-commit boundaries. Source and staged project symlinks are rejected. The preparation fingerprint binds the base and overlaid working snapshots; use the printed `fixtureSha256` consistently in both comparison arms.

For no-command review cases, supply the allowed source, reports, and needed skill instructions through the host's file-reading facility or directly in the prompt. Do not require shell commands to obtain material the user has prohibited executing commands to read. Do not include observer checks or rubric files.

```sh
npm run test:evals
node scripts/score-skill-evals.mjs --help
node scripts/verify-skill-evals.mjs --help
```

Tests use synthetic receipts and temporary evidence. They establish schema, completeness, boundary, integrity, and comparison behavior—not that an agent followed a skill, routed correctly, or became faster.

The preparation, scoring, artifact verification, and failure-analysis CLIs recognize direct paths, script symlinks, and checkout-directory aliases. A checkout alias also works with Node's `--preserve-symlinks-main` option. They print the same reports and preserve their documented exit codes across these launch paths. Importing their APIs does not run a CLI. Treat an empty output or an unparseable report as missing evidence even if an external wrapper reports exit 0; capture the actual JSON verdict and process exit code.

### Independent acceptance checks

After an authorized candidate run, the observer can exercise the resulting helper:

```sh
node evals/checks/retry.mjs /absolute/path/to/isolated/project
node evals/checks/parser.mjs /absolute/path/to/isolated/project
node evals/checks/csv.mjs /absolute/path/to/isolated/project
node evals/checks/reading-list.mjs /absolute/path/to/isolated/project /absolute/path/to/isolated/scratch
node evals/checks/cache-update.mjs /absolute/path/to/isolated/project
```

Unlike the receipt verifier, this command imports and executes candidate code. Run it only inside a disposable, restricted environment without real credentials or access to unrelated data. Enforce a timeout using the execution host; a hang, import failure, or malformed output is not a pass. The checker itself is not a sandbox.

The checks cover preserved defaults, retry limits, invalid values rejected before effects, first-success behavior, synchronous/asynchronous operations, and result/error identity. `scripts/feature-fixture.test.mjs` verifies that the checker rejects the unimplemented baseline and independent faulty variants, and accepts a small reference implementation. That reference tests the checker, not an agent, and stays outside candidate contexts. Keep the candidate's own red/green commands and outputs as separate evidence; passing the observer checks alone cannot prove test-first execution or scope compliance.

The parser and CSV observers cover empty-input/field behavior and compatible nonempty values. Their self-tests accept independently implemented correct solutions and reject distinct faulty variants. Additional fixture self-tests verify the retained-handle diagnosis, request path, configuration, deterministic search output, working-directory failure, and unfinished checkpoint. Observer imports and control implementations remain outside candidate projects.

The reading-list observer launches the actual loopback HTTP server against disposable JSON storage. It checks validation before mutation, server-owned identity, preservation of existing data, concurrent additions, process restart, a real filesystem failure, and recovery. Its optional scratch parent must be writable inside the execution boundary. These service checks do not establish browser behavior: separately exercise the form by keyboard, pending duplicate prevention, failure feedback with retained input, retry, reload, and narrow/wide layouts. A delayed request may control timing while still continuing to the real service; label that intervention and keep real storage-failure evidence.

The cache-update observer holds an actual save while requests pass through the HTTP server, router, item service, cache, and store. A read during that save exposes early invalidation; the first read after an acknowledged update must be fresh. It also checks rejected/failed updates and inherited behavior. The fixture uses an in-memory store; it does not establish durable storage, arbitrary overlapping writes, or every possible interleaving.

The service-review fixture supplies an explicit access and success contract plus intentional cancellation/public metadata controls. Its ground-truth tests belong to the observer; no-command candidates receive only the allowed source and skill material. The authoring fixture declares `workflows/` in its plugin manifest. Check that the generated capability lands in that owning root, resolves its references and metadata, preserves the existing skill/application, and receives a fresh forward task. The proposal-only case must leave the project unchanged despite the older approval in its supplied record.

For specification-only or review-only cases, honor the prompt's no-write and no-execution limits. The observer must not ask the candidate to run these acceptance checks during such a task. Preserve file snapshots and allowed tool receipts to check the stated boundaries.

## Collect a real comparison

1. Use two exact Deepwright revisions in fresh, isolated sessions with the same confirmed host version, model, tools, permissions, and per-case fixture snapshots. Check which variant is installed and exclude unintended global rules/plugins without bypassing permissions.
2. Give each candidate only an organic prompt and the project context it needs. Do not reveal the rubric, intended route, other variants, or these instructions. Give delegated workers the normal task scope and constraints, not observer files.
3. Save only explicitly authorized evidence in a separate run directory: route selection, tool receipts, diffs, test output, and reviewer records. Do not search unrelated conversations or application transcript stores. Record unavailable tools and sequential fallbacks honestly.
4. Have an independent observer inspect the artifacts and fill one receipt for every case. Record unknown or unobserved checks as `false` and explain the uncertainty in the evidence. Never ask a candidate to certify its own compliance.
5. Retain failures and ambiguous outcomes, repeat fresh paired runs, and report sample sizes and limitations. Report correctness and authorization failures before efficiency. Tooling self-tests and a single paired run do not establish improved automatic triggering or general productivity.

Use the same observer-side corpus and fixture versions for both arms. Expanding the corpus changes its fingerprint: receipts from the old case set are not comparable to new ones. Preserve the baseline plugin revision unchanged and rerun it against the shared corpus rather than injecting candidate skills into it. A newly added explicit skill may be unavailable in the baseline; record that limitation instead of treating it as a successful invocation. A partial smoke run is useful evidence but is not a complete batch and cannot pass the full scorer. Having all fixtures available does not establish that the 39 agent tasks were executed.

## Score observations

```sh
node scripts/score-skill-evals.mjs /absolute/runs/before/observations.json
```

Exit codes: `0` all observed gates pass; `1` a route, scope, or required check fails; `2` invalid or incomplete input. Unknown, duplicate, and missing case IDs fail, as do extra fields, absent evidence, and non-boolean checks. The scorer always requires the complete corpus.

The example below is intentionally incomplete and cannot pass. Include every case and use the exact required check names from `expected.json`.

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
    "fixtures": {"trivial-code": "none", "noncoding": "none"},
    "repetition": 1
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

## Recurring failure analysis

After sealing complete runs using the protocol above, aggregate repetitions with the same baseline/candidate revisions and reported conditions:

```sh
node scripts/analyze-skill-evals.mjs /absolute/runs/base-1/run.json /absolute/runs/candidate-1/run.json /absolute/runs/base-2/run.json /absolute/runs/candidate-2/run.json
```

The read-only tool verifies each receipt and evidence artifact before grouping failed criteria by case and expected workflow. It retains pair-level regressions and resolutions, rejects reused manifest/receipt paths, identical receipt-and-evidence fingerprints, and repeated repetition identifiers, and refuses mixed cohorts or altered artifacts. Exit 0 means all observed gates passed; 1 means observed failures; 2 means invalid or unverifiable inputs. It accepts 1–100 pairs and prints JSON without writing reports or skills.

Two distinct reported repetitions mark a candidate failure as recurring for investigation. Byte-identical receipts and evidence do not establish another trial; retain genuine per-trial execution evidence rather than relabelling copies. These guards still do not prove independence, causal skill failure, or a general success rate. Expected routes locate review scope; they do not establish blame. Inspect the underlying trace to distinguish routing, authority, behavioral, environment, capability, and observer defects before proposing a correction. Aggregate counts cannot hide a regression, permit efficiency claims while correctness fails, or automatically approve a change.

The new fixture controls exercise real serialized provider/consumer incompatibility, a save failure hidden by a weak assertion, and the composed picker handler. Their passing controls prove those fixture mechanisms and the maintenance tooling; they do not establish that a model follows the new instructions. Forward tests must keep observer expectations out of the candidate's context and report partial smoke trials separately from the full 39-case paired evaluation.

The ordinary review case does not name Interrogate: it checks whether a natural correctness-review request reaches the right scope, includes the uncommitted change, and distinguishes an earlier green report from evidence for the current source. Its optional-input contract also distinguishes omission from an invalid supplied value, including a value that defaulting would otherwise erase. Its checked-source copy lets a no-command reviewer compare the supplied bytes without hashing or executing Git. The Shipping fixture uses actual Git diffs and Node behavior to establish that equivalent patches can behave differently after a base change. Its self-test does not establish that an agent refreshed a verdict or that a merge occurred. The local bug case also checks proportionality: clear defects can be handled directly while retaining reproduction, regression checks, and final review.
