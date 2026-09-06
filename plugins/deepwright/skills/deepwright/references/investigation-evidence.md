# Testing an explanation

Use this when a diagnosis, historical explanation, or recommendation depends on
uncertain or conflicting evidence. A direct explanation of a small function does
not need competing hypotheses or an extra reviewer.

## Find the observation that could change the answer

State the claim being considered and the strongest plausible alternative supported
by the available context. Include the user's proposed explanation as a candidate,
not an established cause. Ask what observation would look different under those
explanations. Prefer inspecting that observation over collecting more examples
that both explanations predict.

For each material result, decide whether it supports, weakens, or does not
distinguish the explanations. Keep a contradiction visible even when most results
favor one account. There is no need to classify every irrelevant search result or
invent a rival when the requested fact is directly established.

Example: requests time out and a summary blames retries. More timeout counts fit
both excessive retry delay and a slow upstream call. The elapsed time of each
attempt and the configured delay distinguish them. If those timings are absent,
the source can establish how retries are configured, but cannot establish which
delay dominated an incident.

## Check the basis of the claim

Read the original source, record, or existing execution receipt when a summary
cannot settle the question. Separate observed behavior from a name, comment,
author's explanation, or another agent's interpretation. Each can answer different
questions: a commit message can state historical intent; a matching execution
receipt can establish what a run did.

Use the [coverage contract](evidence-coverage.md) for missing or incomplete reads
and overlapping reports. Trace apparent corroboration to its origin: a PR, a
summary quoting that PR, and two workers repeating it still rest on one account.
One decisive observation may settle a narrow claim; do not impose a source-count
quota. Agreement among reviewers helps locate a claim worth checking but does not
replace its evidence.

A separate critic is useful when a consequential or disputed conclusion would
benefit from independence. Give that critic the specific claim, the strongest
alternative, the original evidence pointers and snapshot, and the bounded question
to resolve. Ask what survives examination, without requiring an objection. A
local pass is sufficient when delegation adds no useful independence or is
unavailable; keep the distinction clear.

## Choose whether to continue

Reconcile returned evidence before dispatching more investigation. Name the
remaining uncertainty and the next authorized observation that could change the
answer. A specialist should answer that question, return its evidence and limits,
and leave unrelated leads for the parent to assess.

Stop when the requested answer is established, or when the relevant evidence is
exhausted or unavailable and further authorized checks cannot distinguish the
remaining explanations. In the latter case, report the conclusion as unresolved,
name the missing observation, and identify the next useful lead. Repeating an
unchanged failed lookup or gathering equivalent summaries does not close that
gap. Respect any supplied work allowance; exhausting it leaves unresolved work
explicit rather than turning it into a confident verdict.

When material new evidence or a changed snapshot affects a settled explanation,
recheck the affected conclusion against the new and earlier evidence. Preserve
unaffected findings; a changed detail does not require repeating the entire inquiry.
