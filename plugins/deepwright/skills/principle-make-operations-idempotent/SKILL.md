---
name: principle-make-operations-idempotent
description: "Make retries converge on the same end state. Use for $deepwright:principle-make-operations-idempotent."
license: MIT
---

# Make Operations Idempotent

## Purpose

Make retries and restart recovery converge on the intended state without duplicating effects. Apply this to lifecycle commands, job processing, provisioning, and other operations that may be repeated or interrupted.

## Instructions

- Identify the desired state, the operation's identity, and each effect. Separate safe repeated reads from writes that can duplicate records, charge money, send messages, or delete data.
- Reconcile observed and desired state instead of assuming a fresh start. Adopt resources only when ownership and identity match; distinguish task-owned stale artifacts from user data.
- Prefer atomic transactions, conditional writes, durable deduplication records, or provider-supported idempotency keys. Reuse the same key for retries of one logical action; a new action needs its own identity.
- Design interruption recovery at meaningful durable-write boundaries. Do not repeat a non-idempotent external call after an uncertain response until its outcome can be established safely.
- Verify a normal run, an immediate rerun, and recovery from representative partial states. Bound retries and return an actionable error when reconciliation cannot resolve the state.
- Recover locks according to their actual ownership model. A PID alone can be reused and may refer to another host; use a platform lock or sufficient owner/lease identity instead of deleting a lock merely because it looks old.

## Examples

A workspace setup command creates a task-owned directory and registers it with a local index. It crashes after directory creation. On retry, verify the directory's ownership marker and intended configuration, then add the missing index entry using a stable workspace ID.

Expected outcome: both a clean run and repeated interrupted runs produce one directory and one entry. If the directory belongs to someone else, return a conflict without replacing it.

## Limitations

Exactly-once external effects cannot be inferred from a local flag. If a provider offers no lookup or deduplication mechanism after an uncertain response, report the ambiguity and require reconciliation before another effect. Idempotence does not grant authorization to retry charges, messages, deployments, or destructive cleanup.
