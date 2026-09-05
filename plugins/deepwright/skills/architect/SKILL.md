---
name: architect
description: "Design code structure before implementation. Use for $deepwright:architect."
---

# Architect

Design before implementing. Sketch types, function signatures, class shapes, and module boundaries with `not implemented` bodies and pseudocode. Synthesize across independent design perspectives, then fill in code against the chosen sketch. If implementation proves the sketch wrong, throw it out and redesign.

## Start

Open a plan or checklist with one entry per phase before starting. Autonomous mode without checkpoints needs the list to show phase position and keep phases from silently disappearing.

1. Ground
2. Sketch
3. Agree
4. Implement
5. Scrap

## Phase A: Ground the problem

Build a real mental model of every system the new code touches. Run `$deepwright:how` over the relevant subsystems. Critique mode if existing structure is the constraint or the design must push back on it.

Naming a file isn't grounding. Produce the traced model `$deepwright:how` prescribes. If the design redefines ownership or layering, also run `$deepwright:why` on the existing shape so the rationale becomes a constraint, not a guess.

Skip Phase A only when the work is genuinely greenfield with no surrounding system to integrate.

## Phase B: Sketch

Run `$deepwright:arena` with the design-sketch task and the Phase A grounding artifacts. Before delegating, read `references/runner-prompt.md` and `references/rationale-template.md` from this skill. Embed their relevant content plus the task and grounding directly in every runner brief; do not expect a delegated worker to resolve plugin-relative paths from the target repository. Each candidate produces a design package shaped by the supplied rationale template: the caller's usage written first, then the type sketch, function signatures, module map, and prose rationale derived from it.

Apply [the configuration contract](../deepwright/references/configuration.md) to `parallelism.design_candidates` and `roles.code`: explicit task requirements precede valid project preferences, then defaults. Preserve the two-design minimum below even if the preference is one, using sequential candidates when capacity requires it. Inherit the parent model unless the host confirms the configured exact identifier. Independent structures matter more than invented model diversity.

Design it twice. Require at least two structurally distinct candidates before synthesis, even when the first looks sufficient. This applies `$deepwright:principle-exhaust-the-design-space`. Whole-shape alternatives, not point fixes inside one shape.

Screen every candidate against [`references/design-red-flags.md`](references/design-red-flags.md) before synthesis. Reject or revise shallow modules, information leakage, temporal decomposition, and pass-through methods.

Compare viable candidates on interface depth. Prefer the design that hides more complexity behind a smaller, simpler public surface. A rich interface can keep call chains short by concentrating capability instead of scattering it across layers.

Arena returns one synthesized design package. The synthesis decision populates the rationale's "Synthesis decision" section.

## Phase C: Agree (opt-in)

If the request is design-only, return the synthesized design and stop. If the parent task explicitly includes implementation, proceed to Phase D after the design is internally coherent.

Pause for a checkpoint when the invoker requests one or the design reveals a material product, compatibility, data, cost, or scope choice that the original request did not settle.

When implementation and commits are authorized, the synthesis may ship as its own commit. That is the scaffold-first mode of `$deepwright:principle-foundational-thinking`; subsequent commits read as filling in bodies against a stable contract. Planned and scoped breakage during fill-in is fine under `$deepwright:principle-outcome-oriented-execution`. For adversarial pressure on the design before implementing, run `$deepwright:interrogate` on the synthesized sketch.

If the human pushes back on the shape (in a checkpoint or after the fact), treat that as Phase A evidence. Re-ground and re-run Phase B before writing more code.

## Phase D: Implement against the sketch

Replace `not implemented` bodies with code, pseudocode with logic. The synthesized sketch is the contract.

Deviations from the sketch are signal worth surfacing, not friction to absorb silently. If a function needs a parameter the sketch didn't anticipate, ask whether the sketch was wrong, the requirement was missed, or the implementation is overreaching. Surface it; don't bolt it on.

## Phase E: Scrap when the architecture is wrong

If implementation keeps producing friction the sketch can't absorb, throw the sketch out. Do not bolt fixes onto a wrong design; apply `$deepwright:principle-redesign-from-first-principles` and `$deepwright:principle-fix-root-causes`.

The signal is a *pattern*, not single instances. Tells:

- The same shape of workaround appearing repeatedly across unrelated code.
- Multiple unrelated edge cases that all need special-case branches.
- Types that need escape hatches (`any`, casts, optional fields always set in practice) to compile.
- The "we need a lock" reflex when the sketch said the state wasn't shared.
- Callers having to know the abstraction's internal rules to use it.
- Two or more independent Phase D deviations of the same shape across the implementation. Surfacing deviations is Phase D's job; a repeated pattern of them is Phase E's trigger.

Use judgment. A few edge cases don't condemn an architecture. Some problems are legitimately complex; complexity in the data is not complexity in the design. The rewrite signal is repeated friction of the same shape, not single hard cases.

When you scrap:

1. Re-run `$deepwright:how` over what has been built. The implementation lessons enter the new design as inputs, not vibes.
2. Redesign as if the new constraints had been day-one assumptions under `$deepwright:principle-redesign-from-first-principles`.
3. Apply `$deepwright:principle-subtract-before-you-add`. The new sketch should be smaller than the old one before it grows.
4. Return to Phase B and re-run `$deepwright:arena`.

## Outputs

The caller's usage is written first and the type sketch derived from it. One file with new types and signatures for small changes; module map plus type definitions for larger work. The rationale ships alongside, shaped per `references/rationale-template.md`, including the usage sketch and the synthesis decision.
