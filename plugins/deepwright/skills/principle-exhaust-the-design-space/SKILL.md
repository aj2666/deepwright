---
name: principle-exhaust-the-design-space
description: "Compare distinct designs before a one-way decision. Use for $deepwright:principle-exhaust-the-design-space."
license: MIT
---

# Exhaust the Design Space

## Purpose

Compare meaningfully different designs before an expensive or difficult-to-reverse choice. This is useful for novel interactions and architecture with competing constraints, not routine implementation of an established pattern.

## Instructions

- Identify the decision, the user's desired outcome, and the constraints that could change the choice: latency, accessibility, compatibility, operational cost, or reversibility.
- Explore a few distinct options at the cheapest useful fidelity. A sketch or API example may answer the question; build a prototype only when behavior or feel is the uncertainty.
- Use two or three options as a starting point, not a quota. Eliminate a dominated option without building it, and stop when the remaining uncertainty would not change the decision.
- Compare the options against the same representative task and a relevant failure case. A visual variation of the same interaction does not test a different design.
- Explain the selected option, its tradeoff, and the evidence that supports it. Keep prototypes within the requested scope; discarding a prototype does not authorize discarding user work.

- Retain a concise decision record in the existing task evidence so implementation and review can refer to the same constraints. A new repository document is optional, not a prerequisite.

## Examples

A developer dashboard needs a filter shared across three panels. Compare a global filter bar with filters embedded in each panel using one normal task and a no-results state. A rough interactive sketch shows the embedded controls allow conflicting filters that confuse cross-panel comparisons.

Expected outcome: select the global filter for the shared query, retain panel-specific controls only where they represent separate data, and verify keyboard use and clearing the filter. Production implementation starts after the central uncertainty is resolved.

## Limitations

Skip competing prototypes for a clear bug fix, mandated interface, or reversible choice already supported by local precedent. If the alternatives depend on missing product direction, expose that decision and continue independent work; do not invent a requirement to make one option win. This principle does not require exhaustive search or repeated user approvals.
