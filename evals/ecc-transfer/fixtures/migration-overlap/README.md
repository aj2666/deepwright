# Display-name backfill

Existing rows have `id`, `name`, `displayName`, and `version`. Backfill rows whose
`displayName` is null. A live name edit updates both name fields and increments
`version`; backfill must not overwrite that newer value. Resume after a write failure
and preserve completed data on repeated runs. Work with the supplied local store API.

The store provides `pending()` for a copied snapshot, `write(id, patch)`,
`writeIfVersion(id, expectedVersion, patch)` for an atomic conditional write, and
`copyCurrentNameIfMissing(id)` for an atomic copy only while the target remains null.
Conditional methods return false on a conflict or already-completed row. Unfinished
rows can be retried on the next run. No database or service is involved in this project.
