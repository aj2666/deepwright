---
name: principle-subtract-before-you-add
description: "Remove dead weight before adding new structure. Use for $deepwright:principle-subtract-before-you-add."
license: MIT
---

# Subtract Before You Add

## Purpose

Remove proven, in-scope complexity before building on it when doing so makes the requested change smaller and clearer. Simplification should preserve supported behavior and the user's existing work.

## Instructions

- Identify a specific removal candidate and the evidence that it is unused or redundant. Inspect supported callers, exports, documentation, and dynamic use where relevant; a name that looks old is not evidence.
- Remove dead branches, duplicated decisions, pass-through layers, or redundant instructions when they belong to the requested change. Verify the remaining behavior before depending on the simpler structure.
- Design for observed requirements. Avoid speculative persistence, retry systems, parsers, and configuration options that bring their own lifecycle and validation costs.
- Retain validation that protects real external input and invariants. Simplification is not a reason to remove error handling simply because the happy path succeeds.
- If an in-scope reference adds no information and has no supported consumer, remove it rather than leaving a stub. Keep attribution and required legal notices.
- Preserve compatibility promises, data, pre-existing user changes, and files outside the authorized scope. Report broader cleanup opportunities instead of silently including them.

## Examples

A requested settings change touches two implementations of the same default calculation. One is an unused internal helper with no export, dynamic registration, or documented consumer. Remove it, update the live calculation, and run settings tests for both default and explicit values.

Expected outcome: there is one supported default rule and less surface to change next time. If a helper is part of a public package, missing local callers is insufficient grounds for deletion.

## Limitations

Subtraction need not precede every feature or bug fix. Leave unrelated cleanup for a separate task when it obscures the change or depends on uncertain usage. If removal reveals a hidden consumer or failing contract test, restore the required behavior and reconsider the boundary rather than deleting the evidence.
