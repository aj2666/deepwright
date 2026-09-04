# Steer with principle names

Deepwright bundles focused engineering principles. Rivet carries their index in
the router and reads a full principle only when it can change a decision in the
current task. When one applies, the response should name the principle and the
decision it changed.

You normally do not need to invoke a principle skill directly. Use its name to
steer the work, or invoke its fully qualified `$deepwright:<skill>` name when
you want an explicit review.

## Steering in practice

When a change is about to bolt a new adapter onto three old ones:

```text
Use Subtract Before You Add. Delete obsolete adapters first, then design what remains.
```

When a build is being treated as proof of behavior:

```text
Apply Prove It Works. Run the real import flow and show the written records.
```

When simultaneous writers are about to share a checkout:

```text
Apply Separate Before Serializing Shared State. Give each writer a dedicated worktree.
```

A principle citation without a changed decision is decoration. Ask Rivet to say
what changed and which evidence justified it.

## The principles, briefly

The core principles decide how much to build and when to rethink the design:

- [Laziness Protocol](../../skills/principle-laziness-protocol/SKILL.md) prefers deletion and the smallest change that solves the problem.
- [Foundational Thinking](../../skills/principle-foundational-thinking/SKILL.md) chooses the core data structures before writing logic.
- [Redesign from First Principles](../../skills/principle-redesign-from-first-principles/SKILL.md) integrates a new requirement as if it had been there from day one.
- [Subtract Before You Add](../../skills/principle-subtract-before-you-add/SKILL.md) removes dead weight before building on top of it.
- [Minimize Reader Load](../../skills/principle-minimize-reader-load/SKILL.md) collapses layers and hidden state a reader must hold in their head.
- [Outcome-Oriented Execution](../../skills/principle-outcome-oriented-execution/SKILL.md) converges rewrites on the target design instead of preserving throwaway compatibility states.
- [Experience First](../../skills/principle-experience-first/SKILL.md) chooses the user's result over implementation convenience.
- [Exhaust the Design Space](../../skills/principle-exhaust-the-design-space/SKILL.md) builds competing prototypes when there is no useful precedent.
- [Build the Lever](../../skills/principle-build-the-lever/SKILL.md) builds the script that does or proves the work so a reviewer can rerun it.

The architecture principles decide where state, validation, and compatibility
live:

- [Model the Domain](../../skills/principle-model-the-domain/SKILL.md) encodes repeated rules in one structure, not scattered conditionals.
- [Boundary Discipline](../../skills/principle-boundary-discipline/SKILL.md) validates at the boundary and trusts internal types.
- [Type System Discipline](../../skills/principle-type-system-discipline/SKILL.md) makes illegal states unrepresentable.
- [Make Operations Idempotent](../../skills/principle-make-operations-idempotent/SKILL.md) converges retries on the same end state.
- [Migrate Callers Then Delete Legacy APIs](../../skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md) migrates and deletes in one wave.
- [Separate Before Serializing Shared State](../../skills/principle-separate-before-serializing-shared-state/SKILL.md) removes sharing before adding coordination.

The verification principles define what counts as proof:

- [Prove It Works](../../skills/principle-prove-it-works/SKILL.md) verifies the real artifact, not a proxy.
- [Fix Root Causes](../../skills/principle-fix-root-causes/SKILL.md) reproduces and traces to the cause before changing code.
- [Sequence Work into Verifiable Units](../../skills/principle-sequence-verifiable-units/SKILL.md) ends each small unit in a check before starting the next.

The delegation principles keep parallel work sane:

- [Guard the Context Window](../../skills/principle-guard-the-context-window/SKILL.md) sends bounded bulk reading to Codex subagents when capacity exists and keeps their findings in the main run.
- [Never Block on the Human](../../skills/principle-never-block-on-the-human/SKILL.md) proceeds with reversible, in-scope work. It never bypasses permissions or guesses a material user choice.

The meta principle closes the loop:

- [Encode Lessons in Structure](../../skills/principle-encode-lessons-in-structure/SKILL.md) turns repeated advice into a lint, check, type, test, or script.

Do not memorize the list. Return to it when a concrete decision feels wrong,
then invoke `$deepwright:deepwright` again with the principle you want Rivet to apply.

Next: [Make it yours](./09-make-it-yours.md).
