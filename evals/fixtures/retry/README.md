# Request helper

`request(operation)` calls an operation with its zero-based attempt number.
It returns the first successful result. A failure is retried twice; after
three failed attempts it rejects with the original final error.

Run the current tests with `node --test request.test.mjs`. The helper uses no
network, credentials, packages, or persistent state.
