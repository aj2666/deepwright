# Analyze recurring skill failures

Use only with evaluation receipts and artifacts the user supplied or authorized. Reuse the existing observer protocol: complete cases, exact revisions, artifact hashes, matching host/model/tools/permissions/fixtures, and matched repetition identifiers. Changed conditions belong in separate cohorts. Missing, malformed, or altered evidence is an input failure, not a zero-error run.

For repository maintainers, `node scripts/analyze-skill-evals.mjs <baseline/run.json> <candidate/run.json> [...]` aggregates already sealed matched pairs. This repository development tool is not shipped as a plugin runtime command. It validates the underlying receipts and artifacts, groups failed criteria by expected workflow, and retains each pair's regressions and resolutions. Two reported repetitions mark recurrence for investigation only. A repeated report is not proof of independent observations.

Triage the underlying evidence before proposing a change:

- Routing failure: did the intended skill load, or was the trigger missed?
- Authority failure: did the observed action exceed the request?
- Behavior failure: which acceptance check failed, and at which boundary?
- Cause still to determine: skill guidance, fixture/observer defect, unavailable capability, environment failure, or unclassified. Do not infer the cause from a failed boolean.

Read the owning skill and the actual failing trace. Retain counterexamples and compare like-for-like runs before proposing a narrow correction or structural check. Review regressions separately from aggregate pass counts. Efficiency remains ineligible unless both arms pass every correctness and authority gate. No count, confidence score, or apparent improvement automatically approves a skill revision; report the sample size and evidence limits, then use [scoped lessons](scoped-lessons.md) for the proposal.
