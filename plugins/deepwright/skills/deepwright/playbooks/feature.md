### Feature

**You own the design. Plan, review, verify.** Delegate implementation; stay in the lead.

1. Invoke `$how` over the affected subsystem.
2. Invoke `$architect` for design exploration. Skipping stays as `architect skipped: <reason>`; do not fold the design decision silently into implementation.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (`$principle-separate-before-serializing-shared-state`). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. When the host exposes collaboration tools, delegate code-writing to a subagent with a specific scope: file paths, the named data shape and organizing structure per `$principle-model-the-domain`, and checkable success criteria. Review its diff yourself. When multiple valid shapes exist, invoke `$arena` so independent runners surface the alternatives and a separate reviewer guards the choice. If collaboration is unavailable, implement sequentially and reserve a separate review pass; do not stall waiting for a capability the host does not expose. Comments follow the repository's policy. Make surgical edits, re-ground against the source for upstream-derived files, port shared-primitive improvements to every consumer, and verify each.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass; flag it.
6. Shape the work into small, ordered commits. Rebase only an isolated, unshared task branch and only when the task authorizes history rewriting; otherwise preserve existing history and add ordered commits. Stack dependent follow-ups only when branch and PR topology changes are authorized.
   Use `$principle-sequence-verifiable-units`, building, verifying, and committing each small unit before the next.
7. If the design is contested, invoke `$interrogate` before shipping.
8. Run **Opening a PR** only when the user asked for a PR or the authorized workflow explicitly includes one.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline; that owner fans out internally after the blocking phase. Parent-level fan-out is for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries; spawn a fresh owner rather than chaining interrupts.

**Reply:** what you built, what you chose and why, open decisions. Tables for design alternatives.
