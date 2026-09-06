# Run evidence and remaining work allowance

Use this optional helper for a multi-iteration task whose evidence or remaining
allowance must survive a new process or session. A small task can keep its scoped
coverage and next step in the conversation. Existing project records remain useful;
this helper is not a required database, scheduler, or replacement for them.

The dependency-free Node helper is [run-evidence.mjs](../scripts/run-evidence.mjs).
It preserves selected files as content-addressed snapshots, appends decisions and
checkpoints, and records attempt claims against one fixed limit and deadline.
It never executes evidence, launches an agent, changes host configuration, or
grants permission. Node 20.19+ is needed only when using the helper.

## Start an authorized run

After the task authorizes local record creation, choose a new directory such as
`.deepwright/runs/parser-fix/evidence`. Keep this dedicated directory separate from
the source files being captured. Prepare the following specification using the
actual workspace, agreed scope, and a future deadline; the values below are examples.

```json
{
  "schemaVersion": 1,
  "runId": "parser-fix",
  "task": "Fix empty input handling and verify compatibility",
  "scope": "Local parser edits and tests; no external actions",
  "workspace": "/absolute/path/to/project",
  "maxAttempts": 4,
  "deadline": "2030-01-01T12:00:00.000Z"
}
```

An attempt is a bounded work iteration, not a token, model call, or successful
result. Agree what one attempt means for this task and include it in `task` or
`scope`. `maxAttempts` accepts integers from 1 through 1000. The directory and
run ID identify the same ongoing task across resumes. Do not create a fresh run
to evade its exhausted allowance.

From the Deepwright skill directory, using the resolved paths for this installation:

```sh
node scripts/run-evidence.mjs init /absolute/path/to/run-evidence /absolute/path/to/spec.json
node scripts/run-evidence.mjs claim /absolute/path/to/run-evidence
```

Claim before starting each iteration. A failed or interrupted iteration consumes
its claim. Claims are serialized across helper processes; exhaustion or a backwards
clock refuses the next claim. The helper checks elapsed wall time when accepting
the claim; it does not interrupt work already running. Stop or checkpoint at the
deadline using the host's available controls.

## Preserve a decision or checkpoint

Record what was decided and its [evidence coverage](evidence-coverage.md). Select
only task-relevant, authorized evidence files. File paths are relative to the
declared workspace; escaping paths and files inside the run directory are refused.
Source files are read without modification. Nothing scans the workspace or private
conversation stores to find evidence automatically.

```json
{
  "kind": "decision",
  "summary": "The supplied source shows the empty-input branch; runtime behavior remains unverified.",
  "coverage": [
    {"source":"parser.mjs","scope":"empty-input branch","status":"complete","limitations":[]},
    {"source":"parser tests","scope":"runtime empty-input behavior","status":"not-run","limitations":["Tests have not run against this change."]}
  ],
  "files": [{"path":"parser.mjs","label":"source examined"}]
}
```

```sh
node scripts/run-evidence.mjs record /absolute/path/to/run-evidence /absolute/path/to/decision.json
node scripts/run-evidence.mjs status /absolute/path/to/run-evidence
```

`kind` is `decision`, `checkpoint`, or `result`. Each record has a summary, coverage,
and zero through 32 selected files. Missing access can be recorded with no file;
an absent snapshot must never be described as captured. Limit each file to 8 MiB,
selected file bytes to 32 MiB per record, and encoded record metadata to 8 MiB.
There are at most 10,000 events per run. The helper refuses oversized input instead
of truncating evidence silently.

Later changes create new snapshots and events. The original records retain the
bytes that supported the earlier decision. `status` verifies hashes and sequence
against the committed head, reports consumed/remaining attempts, and returns the
historical records. It performs no writes and does not reread the live source files.
Checkpoint/result records are allowed after attempt or deadline exhaustion so
unfinished work can be reported honestly; they do not replenish the allowance.
At the 10,000-event capacity, `status` reports `nextAttemptAllowed: false` with
`event limit reached`, and no further event can be appended. Preserve the full
run and leave any additional handoff outside its event log; do not delete history
or start another run to evade the original allowance.

## Resume and recover

Read the existing run with `status` and carry its identity, remaining attempts,
deadline, evidence gaps, and next useful check into the handoff. Separately inspect
current Git, CI, files, and permissions as needed. A historical passing receipt is
not a fresh verification of changed code; preserve both observations with their
respective sources. A `result` record is a supplied account, not a completion or
approval gate.

An existing writer lock is never stolen. If a writer was interrupted, confirm it
has stopped before explicitly removing its `.write-lock` directory. Missing,
corrupt, or incompletely published events fail closed. Restore a known intact copy
or perform a reviewed recovery that preserves the history; do not delete claims
to recover an allowance. The helper does not silently repair an ambiguous history.

The hashes and committed head detect accidental changes or missing records while
the head is intact. They are unsigned: someone who rewrites the records and head
can fabricate a new history. These files are not an execution sandbox, authenticated
audit trail, or proof that an agent followed the stated scope. The helper cannot
enforce a host's token/cost limits or detect work performed without a claim. Keep
unavailable host usage unknown and enforce execution permissions in the host.

All commands print JSON except help. Exit `0` means the requested bookkeeping
operation succeeded; exit `1` means refused, invalid, or unavailable. In particular,
a successful `status` with `nextAttemptAllowed: false` does not allow another attempt.
