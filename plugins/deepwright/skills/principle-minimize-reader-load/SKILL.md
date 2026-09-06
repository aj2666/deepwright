---
name: principle-minimize-reader-load
description: "Reduce layers and hidden state for future readers. Use for $deepwright:principle-minimize-reader-load."
license: MIT
---

# Minimize Reader Load

## Purpose

Reduce the work needed to understand code along two independent axes: layers to trace and state to remember. A flat file full of mutable globals can be as hard to follow as a stack of pass-through adapters.

## Instructions

- Start with a concrete reader question: where a value comes from, who can change it, or which rule determines an outcome. Trace that path before proposing a refactor.
- Collapse layers that add no meaningful abstraction, invariant, or ownership. A one-caller wrapper may still earn its place if it hides a substantial implementation decision.
- Make adjacent layers change the abstraction. Avoid public interfaces that expose every private operation and force readers to learn both the surface and implementation.
- Shrink mutable state scope. Prefer return values over incidental mutation, locals over shared fields, and derived values over separately synchronized copies where practical.
- Name an invariant where it is established so callers learn it once. Make dependencies explicit without forcing unrelated implementation detail through every function.
- Compare the before and after trace, then verify behavior. A change is useful when a reader must follow fewer irrelevant decisions or remember fewer relationships.

## Examples

To answer why a Save button is disabled, a developer traces three stores that synchronize `dirty`, `canSave`, and `isDisabled`. Derive `canSave` from the owned form state and pending request, leaving one place that defines the rule.

Expected outcome: a reader finds the rule from the component in one short trace, and tests cover clean, dirty, invalid, and saving states. Do not move the same flags into one global object; that keeps the synchronization problem.

## Limitations

Do not optimize for a fixed number of files or an arbitrary reading time. Transaction boundaries, protocol adapters, and focused helpers can reduce total mental work despite adding a layer. If flattening mixes independent responsibilities or enlarges shared state, keep the boundary. [Guard the Context Window](../principle-guard-the-context-window/SKILL.md) applies the same attention constraint to agent work.
