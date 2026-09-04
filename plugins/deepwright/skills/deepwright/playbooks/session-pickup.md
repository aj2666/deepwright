### Session pickup

**You own the resume point. Read the authorized trail, do not redo it.** For "take over this", "resume this conversation", "continue from <resume-note path>", "pick up where X left off", a user-provided handoff URL, or a pushed branch the user asked you to continue.

A pickup is inheritance. The prior agent already paid the cost of reading the code, running the repros, making the design choices. Redoing loses the bias check and burns context. Resist the urge to re-derive; read.

1. Locate the prior trail from the current conversation, a user-provided attachment or URL, `.deepwright/runs/<run-slug>/resume.md`, the run ledger, or the named branch and PR. Do not search Codex application data, hidden transcript directories, or unrelated conversations. If a provided handoff is long, use host collaboration tools for a read-only summary when available; otherwise read it in bounded chunks.
2. Reconstruct operational state: branch and worktree, the repository's default branch, what already landed (`git log`, `git diff` against the resolved base), open checklist items, decisions, and current GitHub state through the connector or authenticated `gh`. Treat the prior trail as input, but verify mutable facts.
3. Diff done vs pending. Compare what shipped against what was planned, name the resume point, do not re-run the prior repro or redo completed work. A "let me verify from scratch" pass is the tell that you're treating the trail as untrustworthy when it's actually authoritative.
4. Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup playbook ends here; the routed playbook owns the rest.
5. Verify inherited claims against the original goal on the real artifact (`$deepwright:principle-prove-it-works`). A prior self-report is not proof.

**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome.
