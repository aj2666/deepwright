---
name: principle-outcome-oriented-execution
description: "Use when a planned rewrite or migration needs coupled changes; converge on a verified target without preserving unnecessary intermediate interfaces."
license: MIT
disable-model-invocation: true
---

# Outcome-Oriented Execution

## Purpose

Converge on an agreed, verifiable end state during a planned rewrite or migration. Temporary local instability can be appropriate when preserving every intermediate interface would create unnecessary compatibility code.

## Instructions

- Define the target contract and observable completion checks before the migration. Identify which existing behaviors must remain supported.
- Name where intermediate breakage is acceptable, such as an isolated working branch, and where it is not, such as a deployed service or a shared package consumed independently.
- Group tightly coupled edits into coherent units. Run useful checks for each completed unit and keep failures attributable to known unfinished work rather than ignoring new regressions.
- Avoid compatibility scaffolding that exists only to keep an unshipped intermediate step green. Keep adapters required by rollout, supported consumers, or recovery.
- Complete the relevant static and runtime verification before declaring the migration done. Match checks to the actual change; a documentation-only update does not require a runtime suite.
- Keep changes reversible and preserve user work. Commits, pushes, releases, and history rewriting still depend on the task's authorization.

## Examples

A local refactor replaces `Result<T, string>` with a structured error type across one package. Change the type and its dependent callers as one unit, accepting expected type errors during the edit. Then run the type checker and contract tests before starting an independent feature.

Expected outcome: the completed unit has one error model and preserves error behavior. An independently deployed consumer still expecting a string needs a compatible rollout; it cannot be treated as temporary local breakage.

## Limitations

This does not justify shipping a broken increment, hiding unexplained test failures, or leaving the user with an incomplete migration. If the task must stop early, restore a coherent state when authorized and feasible, or clearly identify the remaining breakage and recovery step. Scale verification to risk without using the final target to excuse skipped evidence.
