### Bug fix

**You own this task. Plan, review, verify.** Delegate investigation and the fix to subagents, stay in the lead.

Be scientific. Every shipped line traces to runtime evidence. Belt-and-suspenders that "might help" is a hypothesis, not a fix; it does not ship. When evidence refutes a hypothesis, revert what it motivated. The smallest change the evidence justifies ships, nothing more. Same discipline for Perf, where the evidence is the trace.

1. Reproduce it on a safe local, test, or otherwise authorized surface with the host's available browser, PTY, simulator, or application-control capability. Never synthesize triggers or add instrumentation against production or third-party systems without explicit authorization. If the host cannot reach the target, state the exact limitation and ask for the smallest missing artifact or user-run step. A bug you cannot reproduce cannot be proved fixed.
2. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `$how` over the affected subsystem and `$why` for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Do not guess. For a long hunt, iterate in bounded passes and checkpoint under `.deepwright/runs/<run-slug>/`; do not assume a persistent background command exists. Confirm the surviving *mechanism* with runtime evidence before the step-3 design review; a design grounded on a plausible-but-unconfirmed cause can be unanimously wrong while the real cause sits one subsystem over.
3. Plan the fix. If it crosses a function boundary, invoke `$architect` first. When the host exposes collaboration tools, delegate implementation to a subagent with a specific scope and acceptance criteria, then review the diff yourself. Otherwise implement sequentially and run an independent review pass. Never hard-code a provider or model name.
4. Verify on the same surface; the original repro now passes. "Inconclusive" or wrong-surface is not a pass; flag it. Unit tests show branch behavior, not bug absence.
5. Stage the commits so the failing repro lands before the fix in git history; the diff tells the story. Invoke `$tdd` for the failing-test-first cadence when the bug has a cheap local test path; skip it when the test would be expensive, integration-heavy, or unclear.
   This is `$principle-sequence-verifiable-units`: the failing test first and the fix on top.
6. Run **Opening a PR** only when the user asked for a PR or the authorized workflow explicitly includes one.

When collaboration tools are available, run `$how` and `$why` as parallel, read-only investigations. Otherwise run them sequentially.

**Reply:** what was broken, root cause, fix, and how you verified it. Include a minimal redacted failing-then-passing excerpt or point to a local receipt; never paste secrets, tokens, personal data, or an unnecessarily large log.
