---
name: principle-separate-before-serializing-shared-state
description: "Separate writers before adding synchronization. Use for $deepwright:principle-separate-before-serializing-shared-state."
license: MIT
---

# Separate Before Serializing Shared State

## Purpose

Reduce concurrency failures by removing unnecessary shared mutable state. When actors truly need one canonical object, enforce coordination with a mechanism rather than an instruction to take turns.

## Instructions

- Identify shared write targets and invariants: files, database rows, branch refs, caches, and API contracts. Two independent fields in one rewritten JSON file still share a write target.
- Determine whether actors publish independent facts or jointly maintain one invariant. Give independent facts separate owned files, keys, branches, or directories, then combine them when reading or reporting.
- Define ownership and publication behavior so readers avoid partial output. Separate files still need atomic publication when readers can observe a write in progress.
- For a real shared invariant, use an appropriate transaction, single writer, lock, compare-and-swap, or sequential phase. Cover the entire read-modify-write operation, including lock release and failure recovery.
- Verify a concurrent interleaving that previously lost data and a failed writer. Document who owns reconciliation instead of assuming a convention prevents races.

- Keep each actor inside its assigned write scope. Separate branches or files organize authorized work; they do not authorize additional writers or changes to shared infrastructure.

## Examples

An indexer and a metrics worker both rewrite `state.json` with their latest timestamp. Each can overwrite the other's update. Give them owned `indexer-state.json` and `metrics-state.json` files, publish atomically, and combine their values in the status reader.

Expected outcome: simultaneous updates preserve both facts and a partial metrics write cannot corrupt indexer state. If both workers instead allocate from one unique sequence, keep a canonical counter and use an atomic allocation operation.

## Limitations

Splitting data does not preserve an invariant that spans both values, and separate files do not form a transaction. If a consistent cross-value snapshot is required, use versioned publication or a transactional store. Lock correctness depends on ownership, scope, and crash behavior; an old-looking lock or a PID alone is not sufficient evidence to delete it.
