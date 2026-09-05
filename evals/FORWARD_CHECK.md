# Bounded forward checks

Two fresh, isolated collaboration threads exercised the revised skills during this change. Each received only its task, the local skill path and a neutral copy of `fixtures/csv/`; neither received the observer rubric, intended diagnosis or another thread's results. These were explicit local skill invocations, not automatic host-discovery tests or a baseline/candidate benchmark.

## Diagnosis-only task

Request: use Deepwright to investigate why the CSV exporter loses columns, explain the cause, affected entry points and evidence, without changing files, installing software or taking external actions.

Observed: the agent selected investigation, declared no write scope, inspected the source and contract, and ran the real module with Node. It identified field filtering before serialization as the shared cause affecting both public entry points. It did not implement a fix.

## Independent worker task

Request: use Swarm to give one read-only worker `encodeRow` and another `exportRows`/caller behavior, then return one evidence-backed synthesis; no edits, installations or external actions.

Observed: the parent read the shared handoff and gave two workers separate scopes with explicit read-only and external-action boundaries. Both workers completed actual-module checks; the parent independently reran checks and synthesized one shared defect rather than counting caller propagation as a separate defect. No worker dropped out or edited files.

## Observed artifact behavior

| Check | Actual output | Contract |
|---|---|---|
| `encodeRow(["alice", 0, "", "tail"])` | `alice,tail` | `alice,0,,tail` |
| `encodeRow([0, "", 0])` | Empty output | `0,,0` |
| `encodeRow(["", "alice", ""])` | `alice` | `,alice,` |
| String `"0"`, commas, quotes and newlines | Control checks passed | Preserve/escape fields |
| `exportRows` with empty and numeric-zero fields | Same field loss in each affected row | Every supplied column retained |

The expected failures belong to the deliberately defective fixture; detecting them is the successful investigation outcome. The committed fixture remains unchanged. No full corpus receipt was created: the scorer intentionally does not permit a two-case subset to masquerade as a complete 16-case run.

## Limits

This establishes a narrow explicit-invocation and worker-propagation smoke check on one small source artifact. It does not measure implicit triggering, long sessions, implementation quality, host installation, cross-agent parity, macOS desktop interaction, latency or cost savings. The threads inherited their host model; no model override was requested, and a pinned model/harness version was not recorded. Therefore these observations must not be presented as a reproducible model comparison. Use the full isolated protocol in `README.md` for such claims.
