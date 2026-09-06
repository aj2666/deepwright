# Request helper

`request(operation)` calls an operation with its zero-based attempt number.
It returns the first successful result. A failure is retried twice; after
three failed attempts it rejects with the original final error.

The proposed change adds an optional `{ maxRetries }` argument. It must accept
integers from 0 through 5, preserve two retries when options or `maxRetries` are
omitted, and reject other supplied values before calling the operation. Zero
means one attempt. Synchronous and asynchronous operations remain supported,
and successful values and final errors retain their identity.

The author's check report is in `reports/author-checks.json`. It identifies the
source bytes checked, a saved copy of that source, and the command and result
the author supplied. The existing tests remain in `request.test.mjs`.
