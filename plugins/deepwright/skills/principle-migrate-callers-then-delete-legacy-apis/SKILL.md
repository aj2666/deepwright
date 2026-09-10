---
name: principle-migrate-callers-then-delete-legacy-apis
description: "Use when a coordinated internal API refactor permits a clean cutover; migrate all supported callers before deleting the obsolete interface."
license: MIT
disable-model-invocation: true
---

# Migrate Callers Then Delete Legacy APIs

## Purpose

Complete an internal API refactor by migrating its callers and removing the obsolete path. Apply this when a coordinated change is supported and no external compatibility promise requires the old interface.

## Instructions

- Establish the compatibility boundary before deletion. Inspect exports, package entry points, generated bindings, examples, scripts, tests, and supported external consumers, not only direct source calls.
- Inventory callers of the old contract and map them to the replacement. Include string-based registration or configuration if the API can be selected dynamically.
- Migrate in coherent units and verify the replacement behavior. Delete the old implementation after its supported callers move; do not retain it solely to avoid completing an in-scope migration.
- Update contract tests and usage examples. Keep regression coverage for promised success and error behavior, including missing records or invalid input, even when the old implementation is removed.
- Use a temporary adapter only when rollout or compatibility actually requires it. Identify its consumers and removal condition; do not quietly treat it as permanent architecture.
- Keep deletion inside the authorized scope and preserve pre-existing user changes. Report consumers that cannot be migrated in this task.

## Examples

An internal `getUser(id, true)` API becomes `getUserWithOrders(id)`. Search runtime code, test fixtures, and CLI scripts; migrate the supported callers and assert the same not-found behavior. Then remove the boolean overload and its implementation-only tests.

Expected outcome: source and generated entry points expose one supported path, all callers type-check, and the not-found regression still passes. If the old overload is publicly exported in a released package, keep compatibility until an authorized release plan permits removal.

## Limitations

A text search with no matches does not prove there are no external or dynamic callers. When that boundary is uncertain, document the uncertainty and preserve compatibility. A staged deployment across independently released services may need an adapter; forcing immediate deletion there can break running consumers.
