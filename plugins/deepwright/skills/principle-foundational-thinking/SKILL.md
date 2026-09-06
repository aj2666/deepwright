---
name: principle-foundational-thinking
description: "Choose models and invariants before logic. Use for $deepwright:principle-foundational-thinking."
license: MIT
---

# Foundational Thinking

## Purpose

Choose data shapes, ownership, and invariants that make the requested behavior simple. Invest in foundations when they reduce downstream work or preserve a concrete option, rather than preparing for unspecified future features.

## Instructions

- Start with the dominant access patterns and the states the system must prevent. Define the relevant types and ownership before distributing logic across callers.
- Choose structures for the actual read, update, and concurrency needs. Before sharing mutable state, determine what another actor could change and whether isolated ownership would suffice.
- Reuse structural concepts while leaving a few similar statements explicit when a shared abstraction would add indirection. Types should converge around the same domain rule, not superficial syntax.
- Establish missing scaffolding only when the next work depends on it. A focused test harness or shared type can come first; a small fix in a tested module need not rebuild CI or reorganize the repository.
- Sequence coherent increments with meaningful verification. Remove proven in-scope dead weight before building on it, while preserving compatibility and existing user changes.

- Validate the model with one normal operation and a forbidden transition before widening the refactor. A failing example can reveal a missing invariant more cheaply than a complete implementation.

## Examples

A task queue stores status in three booleans and checks their combinations in every worker. The next feature adds cancellation. Define a task state union with permitted transitions and one owner for updates, then adapt the existing workers.

Expected outcome: `running` and `cancelled` cannot be set simultaneously, transition tests cover cancellation races, and callers use the shared model instead of adding another coordination flag. No general workflow engine is needed.

## Limitations

A foundational change can be more expensive than the requested feature. If changing the model would force unrelated migrations, use the existing boundary or propose a separate refactor. Prefer a local invariant over architecture for hypothetical scale, and do not demand tests before every low-impact edit when existing checks already prove it.
