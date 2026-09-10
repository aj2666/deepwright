### Session pickup

**You own the resume point. Read the authorized trail before repeating work.** For "take over this", "resume this conversation", "continue from <resume-note path>", "pick up where X left off", a user-provided handoff URL, or a pushed branch the user asked you to continue.

A pickup reuses prior work whose evidence still applies. Read the trail before repeating an investigation, and distinguish the evidence behind an earlier decision from facts that may have changed.

1. Locate the prior trail from the current conversation, a user-provided attachment or URL, `.deepwright/runs/<run-slug>/resume.md`, the run ledger, or the named branch and PR. Do not search host application data, hidden transcript directories, or unrelated conversations. If a provided handoff is long, use host collaboration tools for a read-only summary when available; otherwise read it in bounded chunks.
2. Reconstruct operational state: branch and worktree, the repository's default branch, what already landed (`git log`, `git diff` against the resolved base), open checklist items, decisions, and current GitHub state through the connector or authenticated `gh`. Treat the prior trail as input, but verify mutable facts.
3. Diff done vs pending. Compare what shipped against what was planned and name the resume point. Reuse checks that still match the artifact; repeat only affected checks when the snapshot changed or the earlier evidence cannot establish the claim. Preserve missing and partial coverage rather than treating the handoff as proof.
4. Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup playbook ends here; the routed playbook owns the rest.
5. Verify inherited claims against the original goal on the real artifact ([Prove It Works](../../principle-prove-it-works/SKILL.md)). A prior self-report is not proof.

When an existing [run evidence record](../references/run-evidence.md) is named, read its status and keep the same run ID, consumed attempts, remaining allowance, and deadline. Do not reset a timebox by starting a fresh record. Read-only pickup stops at the grounded next step; it does not claim an attempt, append records, or resume implementation. The historical record and current Git/CI checks answer different questions.

**Reply:** where the prior agent stopped, which evidence still applies, what needed a fresh check, the resume point, and the outcome.
