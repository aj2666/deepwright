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

## Follow-up: inspect-only Setup

A third fresh thread received only a neutral project's location, the revised Setup skill's absolute path, and a request to report current settings and model availability without changing anything. It was not given expected outcomes or this record.

The project contained version 1, an unconfirmed example review-model identifier, two swarm workers, and one design candidate. The thread read Setup and its shared configuration reference, ran the bundled `config show --json` and `config check --json`, and inspected the actual host collaboration schema. It reported default versus project values, distinguished schema validity from model availability, refused to treat the example identifier as confirmed, and retained Architect's two-design minimum despite the one-candidate preference. It ran `doctor --json` and disclosed the optional missing `gh` warning.

The configuration SHA-256 remained `99b94e99db22c52266a9258f63bca7eedb30533d2353b5284217c30fdf3549e0` before and after the inspection. The reported settings matched a direct parent check of the bundled helper. No settings were rewritten. This is an explicit local Setup smoke check, not proof of implicit discovery, desktop UI behavior, or a statistically meaningful improvement; the same limitations above apply.
