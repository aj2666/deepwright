---
name: principle-redesign-from-first-principles
description: "Integrate new requirements as foundations. Use for $deepwright:principle-redesign-from-first-principles."
license: MIT
---

# Redesign From First Principles

## Purpose

Integrate a new requirement into the existing design as a coherent capability. Use the hypothetical clean design to identify the right local change, without treating every feature as permission for a rewrite.

## Instructions

- Read the affected interfaces and callers to understand the current invariant, the new requirement, and compatibility constraints.
- Ask what the model or interface would be if this requirement had existed from the start. Compare that shape with the current design and identify the smallest change that closes the gap.
- Update the affected types, callers, tests, docs, and examples so they describe one contract. Search references to the changed concept rather than reading unrelated files indiscriminately.
- Deliver the redesign in coherent increments that can be verified. Preserve established behavior and user work unless changing them is explicitly part of the request.
- Explain a significant tradeoff, especially when a compatibility boundary means the ideal internal shape cannot be exposed immediately.

- Retain a reproducer or contract example for the new requirement so a cleaner-looking design is checked against the behavior that motivated it.

## Examples

A file exporter accepts one format and now needs a second. The current code spreads format-specific filename, encoding, and header choices across callers. Move those existing decisions into a small format definition consumed by the exporter instead of adding a second boolean to each call.

Expected outcome: each supported format has a consistent filename and content, existing exports remain compatible, and tests cover both formats plus an unsupported-format error. A plugin framework for unknown future formats is unnecessary.

## Limitations

An incremental patch is appropriate when the existing design already fits the requirement. If the clean design would require an unrelated migration or a public breaking change, preserve the boundary and propose that work separately. First-principles thinking should remove accidental complexity, not erase useful constraints or expand the task.
