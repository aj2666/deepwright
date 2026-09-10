---
name: principle-build-the-lever
description: "Use when repetitive or error-prone work justifies a reusable command, codemod, or check instead of repeated manual edits."
license: MIT
disable-model-invocation: true
---

# Build the Lever

## Purpose

When repeated or error-prone work earns it, build the smallest tool that performs or verifies it. A rerunnable artifact improves both throughput and reviewability.

## Instructions

- Compare the time and failure risk of a tool with the manual work, including review and future reruns. A one-off can justify a small script; a trivial edit rarely needs a framework.
- Work through a representative unit to learn the recipe. Compare the tool's result with that expected result before widening its scope, and include an awkward case such as an already-migrated input.
- Prefer an existing command. Otherwise use a codemod for syntax-aware edits, a generator for repetitive files, a query for analysis, or a deterministic check for verification.
- Bound the targets and preserve unexpected content. Support a preview or dry run when an incorrect rewrite would be costly. Make reruns leave completed work unchanged and return a clear error for unsupported cases.
- Use deterministic tooling before delegating identical manual edits. Delegate only independent judgment or cases the tool cannot handle reliably.
- For analysis-only work, keep new helpers in task-owned scratch space. Add repository tooling only inside the authorized write scope; creating reusable skills, commits, or remote records requires the corresponding authorization.

## Examples

Twelve callers need to replace `legacyGet(id)` with `client.get({ id })`. Confirm one ordinary caller and one aliased import by hand, then use a syntax-aware codemod with a preview. Skip and report ambiguous bindings instead of rewriting every matching string.

Expected outcome: the preview lists exactly the intended callers, tests pass for the new API, and a second run produces no diff. A shadowed local `legacyGet` remains untouched and is reported for review.

## Limitations

Stop extending the tool when manual treatment of a few exceptional cases is cheaper and clearer. A repeatable wrong transformation is still wrong: verify behavior as well as text. See [Laziness Protocol](../principle-laziness-protocol/SKILL.md) for scope and [Prove It Works](../principle-prove-it-works/SKILL.md) for proof. [Encode Lessons in Structure](../principle-encode-lessons-in-structure/SKILL.md) addresses durable prevention, rather than the immediate work.
