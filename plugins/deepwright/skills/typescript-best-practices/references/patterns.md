# TypeScript patterns

Use the section relevant to the current defect. Examples demonstrate one boundary or invariant at a time; preserve the repository's established names, schema library, and error handling.

## Branded types

Brands distinguish domain meanings. Keep the constructor beside the brand and use the repository's existing brand shape. A cast at this validated boundary creates the brand; it does not perform the validation.

```ts
type RetryDelayMs = number & { readonly __brand: "RetryDelayMs" };

function parseRetryDelayMs(input: unknown): RetryDelayMs {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    throw new Error("Expected a finite non-negative retry delay");
  }
  return input as RetryDelayMs;
}
```

Expected behavior: `0` is accepted; `-1`, `NaN`, and `"10"` are rejected. Don't brand every primitive: use a brand when preserving this validated distinction changes downstream safety.

## Discriminated unions

When state combinations are mutually exclusive, encode them as variants instead of boolean/optional-field combinations.

```ts
type DiffState =
  | { kind: "loading" }
  | { kind: "ready"; diff: string }
  | { kind: "error"; message: string };

function summary(state: DiffState): string {
  if (state.kind === "ready") return state.diff;
  if (state.kind === "error") return state.message;
  return "Loading";
}
```

Optional data that can legitimately accompany every variant need not become another state. Choose the project's discriminant convention (`kind`, `type`, or `tag`).

## Constructive modeling and total access

Represent a non-empty read-only sequence with a tuple when the operation requires a first element:

```ts
type NonEmpty<T> = readonly [T, ...T[]];

function first<T>(items: NonEmpty<T>): T {
  return items[0];
}

function isNonEmpty<T>(items: readonly T[]): items is NonEmpty<T> {
  return items.length > 0;
}
```

Expected result: `first([])` is a compile error; `first(["a"])` returns `"a"`. Keep `T[]` when empty input already has a total result, such as a sum starting from zero. Returning `T | undefined` is also appropriate when the caller owns the empty case.

The tuple guarantees index `0`, not every computed index. Under `noUncheckedIndexedAccess`, `items[index]` can still be `T | undefined`; check the result or use iteration rather than asserting it away. A read-only view also does not freeze an array held by another mutable alias, so preserve ownership if a non-empty value is retained across mutations. The compiler's indexed-access behavior is described in the [TypeScript option reference](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html).

For pairwise data, `readonly (readonly [T, T])[]` expresses pairs directly. For time spans, storing start plus duration can avoid synchronizing endpoints, but a plain `number` duration still permits negative, infinite, and `NaN` values. Validate numeric and date constraints at construction; use a validated duration type when consumers must rely on that guarantee.

## `unknown`, schemas, and checked construction

External data is `unknown` until validated. Prefer the repository's existing schema and infer its TypeScript type; do not introduce a schema dependency for one small parser.

For a small shape without a schema system, construct the checked result directly:

```ts
type User = { id: string; role: "admin" | "member" };

function parseUser(data: unknown): User {
  if (typeof data !== "object" || data === null) {
    throw new Error("Expected user object");
  }
  if (!("id" in data) || typeof data.id !== "string") {
    throw new Error("Expected user id");
  }
  if (!("role" in data) || (data.role !== "admin" && data.role !== "member")) {
    throw new Error("Expected admin or member role");
  }
  return { id: data.id, role: data.role };
}
```

Expected behavior: malformed roles are rejected, and only validated fields enter the result. This parser illustrates shape validation, not authorization or a complete user-domain policy. Return the repository's error/result type when parse failure is an expected branch.

If a repository already uses Zod, the equivalent source of truth can be a schema:

```ts
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  role: z.enum(["admin", "member"]),
});

type User = z.infer<typeof UserSchema>;
```

Parse unknown data with that schema at the boundary, using `safeParse` when failure belongs in ordinary control flow. Follow the project's version and schema conventions; equivalent libraries have their own inference helpers.

## Assertions and narrowing

Assertions are erased and provide no runtime check. Prefer checked construction, a discriminant branch, `in`, or `typeof`/`instanceof` to `as`. Keep necessary assertions small and adjacent to their justification, such as adding a brand after validation. `as const` controls inference; it does not validate or freeze a runtime object. See the [TypeScript assertion documentation](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions).

A custom guard must check the type it claims. For a value already typed as a union, checking its discriminant is enough; for unknown external input, checking only the discriminant does not validate the other fields.

```ts
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number };

function isCircle(shape: Shape): shape is Extract<Shape, { kind: "circle" }> {
  return shape.kind === "circle";
}
```

Use a guard when it improves reuse (for example, in `filter`); a one-off `if (shape.kind === "circle")` usually needs no helper.

## Exhaustiveness

A `never` check makes adding an unhandled variant a compiler error:

```ts
type Action = { kind: "save" } | { kind: "cancel" };

function label(action: Action): string {
  switch (action.kind) {
    case "save": return "Save";
    case "cancel": return "Cancel";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
```

For a void switch, `const exhaustive: never = action; void exhaustive;` supplies the same compile-time check. Follow the repository's runtime assertion/error convention if unexpected values must also throw. This check does not make unparsed input trustworthy.

## `satisfies` and literal inference

Use `satisfies` to check assignability for a value authored in code while retaining its useful inferred shape. It is a compile-time operator, not a runtime parser; inference still depends on the contextual type. See the [TypeScript 4.9 documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator).

```ts
type Config = { theme: "dark" | "light"; columns: number };
const config = { theme: "dark", columns: 3 } satisfies Config;
const dark: "dark" = config.theme;
```

Here the union preserves `theme` as `"dark"`, while `columns` is `number`; do not promise that `satisfies` preserves every literal. Use `as const` only when literal/readonly inference is part of the intended contract.

## Boundary validation and compatibility

Parse external payloads, persisted JSON, environment values, or IPC messages at the trust boundary, then pass domain types inward. Re-validate when a value crosses a new trust boundary, not mechanically in every internal call.

Unknown-field handling is a protocol decision. Follow the actual serializer/schema options and compatibility contract; there is no universal `ignoreUnknownFields` option for JSON or every RPC library. Strict command input and forward-compatible responses may need different policies. Persisted data may require version-aware parsing and migration rather than a catch block that silently discards failures.

## Derived types

When an existing generated type owns a shape, derive the view that a consumer needs. For a repository-generated `ChecksMessage`, a rendering function might use:

```ts
type CheckSummary = Pick<ChecksMessage, "totalCount" | "checks">;
```

Import `ChecksMessage` from the repository's actual generated module. Do not copy a transport type into a domain model merely to avoid declaring a meaningful domain concept: derive where the semantics agree, parse where they differ.

## Object arguments

An options object helps when callers could swap positional values or need several optional settings:

```ts
type Selection = { line: number; column: number };
type OpenFileOptions = { uri: string; selection?: Selection };

function describeOpen(options: OpenFileOptions): string {
  const location = options.selection;
  return location
    ? `${options.uri}:${location.line}:${location.column}`
    : options.uri;
}
```

Expected result: the call names both the document and the selection. Keep a simple established signature when an object would add no clarity; preserve public compatibility unless a change is part of the task. Decide hot-path representation from measurements, not an assumed allocation problem.
