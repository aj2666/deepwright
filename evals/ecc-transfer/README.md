# Supplemental ECC-transfer qualification

This collection is separate from the authoritative full corpus in [the evaluation protocol](../README.md).
It does not change that corpus, its fingerprints, or its complete-batch scoring rules.
`prompts.json` contains ordinary requests and project selections. `expected.json` is observer-only.
Neither the expectations nor the control implementations in `scripts/ecc-transfer.test.mjs`
belong in a candidate context. A directory boundary alone is not host isolation.

For a live trial, prepare a fresh disposable directory using only the selected project's
files under `fixtures/`; use an empty directory for conversation-only cases. Give the
candidate the selected prompt and normal task context, never the entire collection.
Pin the baseline and candidate plugin revisions and use the same confirmed host, model,
tools, permissions, and starting files. Capture only authorized receipts. Preserve
first attempts, failures, denied actions, and missing capabilities. An independent
observer must inspect the actual output and action receipts against every required check.
Do not ask a candidate to certify its own compliance. Repeat fresh matched trials and
report per-case outcomes before making an improvement claim.

Run the fixture controls from the repository root:

```sh
node --test scripts/ecc-transfer.test.mjs
```

These dependency-free checks reproduce a masked build failure, a missed immediate
response, and a stale backfill write. Independently corrected controls establish that
the mechanisms are discriminating. The response fixture uses an in-process event
emitter, not a browser. The backfill fixture uses an in-memory store, not SQL. Passing
these controls proves neither real browser behavior, database locking, nor model
compliance with the new instructions. Configuration, retrieval, and decision-record
cases need independent live observation; their inventory checks are structural only.

This collection has no model launcher, authenticated trace capture, automatic promotion,
or claim of completed behavioral qualification. Partial runs are smoke evidence only.
No supplemental result may be presented as a pass of the repository's full corpus.
