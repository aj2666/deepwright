---
name: typescript-best-practices
description: "Improve TypeScript domain types, boundary validation, and narrowing while preserving runtime behavior and repository conventions. Use for $deepwright:typescript-best-practices."
license: MIT
---

# TypeScript best practices

## Purpose

Apply `$deepwright:principle-type-system-discipline` to TypeScript code. Make invalid states harder to express and external data safer to consume without introducing unnecessary types, dependencies, or API churn.

## Prerequisites

Read the affected code, the repository's TypeScript version and `tsconfig`, and its existing validation library and type-check command. Scope the work from the request: a review returns findings; an authorized implementation may change code. Preserve the project's public API and brand/discriminant conventions unless the requested fix requires changing them.

## Instructions

Trace data from its boundary to the operation that needs it. Choose the smallest type or validation change that removes a real unsafe state, then check the affected callers and runtime failure cases.

| Rule | Apply it when |
|------|---------------|
| Discriminated unions | Mutually exclusive states currently live in boolean/optional-field bags. Use the project's literal discriminant convention. Optional fields remain appropriate for truly optional independent data. |
| Branded types | Two primitives have different domain meanings that callers could mix up. Validate once through a constructor/parser; use the existing brand convention. |
| Constructive modeling | A tuple, union, or owned representation can express an invariant directly. Numeric constraints still need validation; `durationMs: number` permits negatives and `NaN`. |
| Simplest total type | Keep `T[]` when empty input has a valid result. Use a non-empty tuple or an optional result when the operation requires a first item. |
| `unknown` over `any` | Data crosses an untrusted boundary. Narrow or parse before property access; don't spread an unchecked `any` through domain code. |
| Schemas before guards | The repository already has a runtime schema library. Reuse it and derive the type instead of maintaining parallel schema/interface/guard definitions. |
| Assertions | Prefer narrowing and checked construction over `as`. Isolate a necessary assertion beside the invariant that justifies it. Assertions and `as const` do not validate runtime data. |
| Narrowing | Prefer a discriminant, `in`, or `typeof`/`instanceof` check to a custom predicate; a predicate must verify every claim it makes. |
| Exhaustiveness | Every variant needs deliberate handling. Use a `never` check and the repository's error convention when extending the union should fail compilation. |
| `satisfies` | A value authored in code should meet a type without a broad assertion. It checks assignability at compile time; literal inference still depends on the expression and contextual type. |
| Boundary validation | Parse incoming data into domain types at the trust boundary; avoid repeating the same validation deep in trusted call chains. Apply `$deepwright:principle-boundary-discipline`. |
| Derived types | A generated or existing type already owns the shape. Consider `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, or `typeof` before duplicating it. |
| Object arguments | Several positional arguments can be confused or optional settings are growing. Keep established small APIs and measured hot paths simple. |
| Real tests | The implementation can run safely locally. Exercise the real behavior; isolate unavailable external boundaries with the repository's existing test seams. |
| Structured telemetry | A shipped diagnostic needs context. Use the project's logger and redact sensitive values; avoid adding ad hoc console noise. |

Run the existing type-check command and the targeted behavior checks appropriate to the change. For example, a new input parser needs malformed input coverage as well as a successful typed call. Do not change compiler settings across the repository merely to improve a narrow patch.

## Examples

```ts
type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "failed"; message: string };

function display(state: LoadState): string {
  switch (state.kind) {
    case "loading": return "Loading";
    case "ready": return state.text;
    case "failed": return state.message;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
```

For “make this loading state safe,” this shape requires a message for `failed` and text for `ready`, and makes an added variant require a display decision. Structural typing can still admit extra properties from an existing object; exact runtime field rejection needs a separate boundary policy. Expected result: existing behavior remains covered, and a new unhandled variant fails type checking.

Read [references/patterns.md](references/patterns.md) for focused examples of parsing, brands, tuple access, exhaustiveness, and derived types; load the relevant section rather than applying every pattern to every file.

## Limitations

Type checking cannot validate network payloads or numeric ranges at runtime.

## Troubleshooting

If a stronger type still needs `!` or a cast at every call, inspect the invariant and ownership before adding more assertions. With `noUncheckedIndexedAccess`, arbitrary array indices can still yield `undefined`, even on a non-empty tuple.

If the installed compiler or dependencies are unavailable, report the exact blocked validation step. Inspect the locked version's capabilities rather than installing a new compiler or changing syntax requirements without scope. A broad baseline type failure should be separated from diagnostics introduced by the patch.
