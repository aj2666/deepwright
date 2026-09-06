---
name: principle-boundary-discipline
description: "Validate boundaries and trust typed internals. Use for $deepwright:principle-boundary-discipline."
license: MIT
---

# Boundary Discipline

## Purpose

Place validation and type narrowing where raw or independently changing data enters the system. Use this to remove duplicated checks and keep framework wiring separate from domain decisions.

## Instructions

- Identify the boundary: CLI arguments, config, external APIs, database reads, plugin callbacks, or any input whose invariant the current component does not own.
- Parse raw values into domain types once. Return actionable errors at that boundary; keep transport and storage representations out of public domain interfaces.
- Trust established invariants within the region that maintains them. Internal mutation, unsafe casts, independently updated records, and concurrent actors can invalidate an earlier check; treat those transitions as new boundaries.
- Put domain decisions in pure functions when practical. Keep the shell responsible for I/O, transactions, and translating failures. A pure core can still return an explicit domain error such as insufficient inventory.
- Remove redundant checks only after tracing who establishes and preserves the invariant. Preserve useful assertions for detecting programmer errors and checks for genuinely changing conditions.

- Trace one invalid input and one legitimate domain failure through the proposed boundary. Confirm callers receive useful errors without learning transport-specific details.

## Examples

A checkout endpoint accepts `{ "quantity": "2" }`. Parse it into a positive integer before calling pricing logic; reject `"many"` there with a field error. Pass the parsed value to a pure `priceOrder` function instead of reparsing it in every helper. Reserve stock with an atomic conditional update that succeeds only when enough remains; a separate read followed by a write can race even inside a transaction.

Expected outcome: malformed requests fail at entry and pricing tests need no HTTP framework. With one item remaining, two interleaving reservation attempts must yield one success and one insufficient-stock result. Exercise that contention at the actual storage boundary before claiming overselling is prevented.

## Limitations

Types do not validate runtime JSON, establish authorization, or guarantee freshness. If a removed internal check exposes a failure, trace the missing invariant owner and repair that boundary; do not assume the value is safe merely because its type says so. Keep framework extraction local when a separate module would add more indirection than it removes.
