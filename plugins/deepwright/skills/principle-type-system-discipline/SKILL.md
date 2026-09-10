---
name: principle-type-system-discipline
description: "Use types to make invalid states unrepresentable."
license: MIT
disable-model-invocation: true
---

# Type System Discipline

## Purpose

Use a typed language to prevent meaningful invalid states, mismatched identifiers, and unhandled variants. Strengthen the model where it makes an operation total or enforces a real invariant; avoid type ceremony that adds no safety.

## Instructions

- Model alternatives with sum types: discriminated unions, payload enums, sealed classes, or the language's equivalent. A bag of optional fields often allows combinations the domain cannot support.
- Construct valid shapes rather than storing values that must continually be synchronized. A non-empty collection can be a head plus a remainder; a completed item can carry its completion time only in the completed variant.
- Use semantic types when interchangeable primitives cause realistic mistakes, such as `UserId` and `OrderId`. Validate at creation, then preserve the invariant downstream.
- Treat runtime JSON, RPC payloads, CLI input, config, and independently stored records as unvalidated until parsed. Place that check at the owning boundary; [Boundary Discipline](../principle-boundary-discipline/SKILL.md) explains where earlier validation can stop being sufficient.
- Prefer narrowing or a better model to unsafe casts and assertions. When interop genuinely requires an escape hatch, isolate it, document the established invariant, and validate or test that boundary.
- Make variant handling exhaustive using the language's compiler-supported idiom. Adding a new case should identify the consumers that need a decision, rather than silently falling through a default.
- Derive types from an authoritative schema when tooling already supports it. Do not maintain a parallel handwritten shape that will drift from the contract.
- Stop strengthening when additional precision no longer prevents a concrete failure. A sum accepts an empty list and returns zero; an operation requiring a first element needs an explicit empty case or a non-empty input.

## Examples

A task uses `{ completed: boolean; completedAt?: Date }`, allowing a completed task with no timestamp. Represent its lifecycle directly:

```ts
type TaskState =
  | { kind: 'open' }
  | { kind: 'done'; at: Date };

function completionTime(state: TaskState): Date | null {
  switch (state.kind) {
    case 'open': return null;
    case 'done': return state.at;
    default: {
      const unexpected: never = state;
      return unexpected;
    }
  }
}
```

Expected outcome: constructing `done` without `at` fails the type check, and adding a new state makes the exhaustive consumer require an update. Parse external timestamps separately and reject invalid dates before constructing the domain state.

## Limitations

Compilation does not prove authorization, freshness, numeric validity, or business correctness. Mutable aliases and unchecked casts can invalidate a type-level promise. If a stronger type spreads assertions across callers or blocks harmless reuse, revisit its construction or use an explicit error result. Brand identifiers where confusion matters, not every primitive by default.
