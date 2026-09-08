# Verify a staged data migration

Use when a schema change or backfill must coexist with existing records, concurrent writers, or more than one application version. For a small atomic local change, use only the relevant checks. Reuse [service and data work](service-data.md); permission to edit a migration is not permission to run it against shared or production data.

## Define the coexistence period

Name the old and new shapes, approved application-version pairings, invariant, and source of truth at each phase. Add compatible schema support first. Establish how every supported writer maintains or reconciles the new representation before relying on a backfill. Change readers only after verification, and remove the old representation only when incompatible readers and writers are gone.

A dual-write label is not enough. Identify what happens when one write fails, an old application still writes only the old field, or a backfill reads a value before a newer edit. Choose the actual atomic update, version condition, synchronization mechanism, or reconciliation step that keeps the invariant true. Do not prescribe dual writes when a simpler atomic migration satisfies the deployment contract.

## Make interruption and overlap testable

Use bounded batches and a progress record tied to completed effects. Commit the batch's effects before recording them as complete. Replaying a completed batch must converge on the same required state; interruption must not skip unfinished records. Decide how conflicts, invalid rows, deletions, and permanently failing records are retried or reported.

A stale snapshot must not overwrite a newer live write. Verify the current version or state at the write boundary, or use an equivalent mechanism, and account for rows skipped because of conflicts. A zero-row batch is not completion when locked, skipped, or unresolved records may remain. Establish the completion condition from the invariant, not just the last loop count.

Test a fresh start, partial completion followed by resume, repeat execution, and a relevant concurrent update on disposable representative data. Include supported old/new clients and meaningful null, duplicate, or invalid values. Keep production-sized lock and timing claims unverified when only a small fixture was exercised.

## Separate recovery from reversal

Keep applied migrations immutable. State whether recovery uses a forward repair, compatible application rollback, or a tested restore. A down script that drops the new data is not automatically a safe rollback. Retain required data until the rollback window and compatibility obligations are satisfied.

Inspect the database engine, version, migration tool's transaction behavior, lock requirements, and statement limits before choosing DDL. A fast metadata change is not necessarily lock-free; index and default behavior are engine-specific. Verify those claims in the engine's documentation rather than copying a universal SQL recipe. For PostgreSQL, see [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html).

Return the tested starting state, interleaving or interruption point, final invariant, preserved data, recovery limitation, and matching evidence. In design or review mode, describe these checks without executing them.
