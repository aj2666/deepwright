# Principle catalog

Use this catalog when a design, verification, delegation, or learning decision needs principle guidance. Choose only a principle that changes the decision and read its linked leaf skill in full. These summaries are discovery metadata, not replacement instructions.

## Core

- [Laziness Protocol](../../principle-laziness-protocol/SKILL.md) (`$deepwright:principle-laziness-protocol`). Prefer deletion and the smallest sufficient change.
- [Foundational Thinking](../../principle-foundational-thinking/SKILL.md) (`$deepwright:principle-foundational-thinking`). Choose the core types and structures before logic.
- [Redesign from First Principles](../../principle-redesign-from-first-principles/SKILL.md) (`$deepwright:principle-redesign-from-first-principles`). Integrate new requirements as foundations, not bolt-ons.
- [Subtract Before You Add](../../principle-subtract-before-you-add/SKILL.md) (`$deepwright:principle-subtract-before-you-add`). Remove dead weight before building on the result.
- [Minimize Reader Load](../../principle-minimize-reader-load/SKILL.md) (`$deepwright:principle-minimize-reader-load`). Collapse unnecessary layers and hidden state.
- [Outcome-Oriented Execution](../../principle-outcome-oriented-execution/SKILL.md) (`$deepwright:principle-outcome-oriented-execution`). Converge on the target instead of preserving throwaway transitions.
- [Experience First](../../principle-experience-first/SKILL.md) (`$deepwright:principle-experience-first`). Prefer a polished user outcome over implementation convenience.
- [Exhaust the Design Space](../../principle-exhaust-the-design-space/SKILL.md) (`$deepwright:principle-exhaust-the-design-space`). Compare prototypes when no precedent settles a consequential choice.
- [Build the Lever](../../principle-build-the-lever/SKILL.md) (`$deepwright:principle-build-the-lever`). Create a repeatable tool or check for non-trivial mechanical work.

## Architecture

- [Model the Domain](../../principle-model-the-domain/SKILL.md) (`$deepwright:principle-model-the-domain`). Encode repeated state assumptions in a type, table, registry, reducer, or state machine.
- [Boundary Discipline](../../principle-boundary-discipline/SKILL.md) (`$deepwright:principle-boundary-discipline`). Validate at system boundaries and keep internal logic simple.
- [Type System Discipline](../../principle-type-system-discipline/SKILL.md) (`$deepwright:principle-type-system-discipline`). Make invalid states hard or impossible to represent.
- [Make Operations Idempotent](../../principle-make-operations-idempotent/SKILL.md) (`$deepwright:principle-make-operations-idempotent`). Make retries converge on the same end state.
- [Migrate Callers, Then Delete Legacy APIs](../../principle-migrate-callers-then-delete-legacy-apis/SKILL.md) (`$deepwright:principle-migrate-callers-then-delete-legacy-apis`). Avoid permanent compatibility layers inside one migration.
- [Separate Before Serializing Shared State](../../principle-separate-before-serializing-shared-state/SKILL.md) (`$deepwright:principle-separate-before-serializing-shared-state`). Remove unnecessary shared writers before adding locks.

## Verification

- [Prove It Works](../../principle-prove-it-works/SKILL.md) (`$deepwright:principle-prove-it-works`). Exercise the behavior or inspect the actual output.
- [Fix Root Causes](../../principle-fix-root-causes/SKILL.md) (`$deepwright:principle-fix-root-causes`). Reproduce, trace, and fix the mechanism rather than masking a symptom.
- [Sequence Verifiable Units](../../principle-sequence-verifiable-units/SKILL.md) (`$deepwright:principle-sequence-verifiable-units`). End each delivery unit in a checkable state.

## Delegation and learning

- [Guard the Context Window](../../principle-guard-the-context-window/SKILL.md) (`$deepwright:principle-guard-the-context-window`). Delegate bulk reading and retain conclusions, not raw payloads.
- [Never Block on the Human](../../principle-never-block-on-the-human/SKILL.md) (`$deepwright:principle-never-block-on-the-human`). Advance safe reversible work; ask only when a real choice or permission is required.
- [Encode Lessons in Structure](../../principle-encode-lessons-in-structure/SKILL.md) (`$deepwright:principle-encode-lessons-in-structure`). Turn recurring corrections into tests, types, lints, or scripts.
