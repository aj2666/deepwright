### Visual parity

**You own pixel-exact equivalence. The baseline is the spec; you do not touch it.** For "make X match Y exactly", styling-system migrations, porting a UI across frameworks. Equivalence is verified by image diff, not by eye.

1. Establish the baseline first, before any migration: a visual regression harness that screenshots the current component across its states, plus the target when matching two implementations. No baseline, no parity claim. A blocking prerequisite, not a follow-up.
2. Anti-shortcut clauses, stated and held: no harness modifications, no baseline tampering, no component restructuring to make a diff pass. If the baseline looks wrong, stop and ask; do not edit it without explicit authorization.
3. Migrate one component at a time. Each is an independent artifact, so parallelize across worktrees when host capacity allows, one owner per component (`$principle-separate-before-serializing-shared-state`). Shared primitives migrate first as a blocking phase. If collaboration is unavailable, run components sequentially.
4. Verify each component against its baseline with image diff on the matching surface through an available browser, simulator, or application-control capability. A nonzero diff is a fail; investigate the pixel delta rather than waving it through. Iterate in bounded passes and checkpoint results in `.deepwright/runs/<run-slug>/`; do not assume a persistent loop command exists.
5. Run **Opening a PR** per component or safe batch only when the user asked for PRs.

**Reply:** components migrated, the diff result for each, the baseline harness location, what's left.
