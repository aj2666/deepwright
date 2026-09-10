---
name: principle-laziness-protocol
description: "Use when choosing how to implement a change; prefer deletion, reuse, and the smallest coherent solution that preserves required behavior."
license: MIT
disable-model-invocation: true
---

# Laziness Protocol

## Purpose

Solve the requested problem with the least lasting complexity. Use a maintainer's effort as the cost model: the result should be easy to understand, change, and verify.

## Instructions

- Look for proven in-scope deletion or reuse before adding another abstraction. Preserve required behavior, user work, and compatibility promises.
- Keep call paths understandable. Collapse pass-through layers that hide no meaningful decision; retain boundaries that compress complexity or enforce ownership.
- Consolidate a repeated decision at its source and pass the result through an existing interface when appropriate. Do not bypass a boundary merely to avoid plumbing one more argument.
- Choose the smallest coherent diff that solves the problem. Fewer lines are useful only when they reduce maintenance work and preserve correctness.
- When a new signal must cross many layers, check whether the decision belongs closer to its owner. Prefer a small domain model over hidden globals or duplicated flags.
- Verify the changed behavior with existing focused checks. Remove tiny representation leaks when they are part of the task, without turning a local fix into an unrelated cleanup sweep.

## Examples

Two screens independently compute whether an archived record is editable. Move that existing rule into the record module and call it from both screens. Keep screen-specific error text local instead of creating a configurable permissions framework.

Expected outcome: changing the archive rule requires one edit, both screens agree, and tests cover active and archived records. A third helper that merely forwards the same arguments adds no value.

## Limitations

Simplicity is not the fewest files, shortest expression, or shallowest possible call stack. Keep a security or transaction boundary even with one caller. If a tiny patch hides a broken invariant or duplicates a policy, a slightly larger coherent fix may be easier to maintain. Stop simplifying when the remaining complexity represents a real requirement.
