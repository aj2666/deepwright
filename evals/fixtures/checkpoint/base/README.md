# Request helper

`request(operation)` calls an operation with its zero-based attempt number.
It returns the first successful result. A failure is retried twice; after
three failed attempts it rejects with the original final error. Operations
may return a value, throw, or return a promise.

Run `node --test request.test.mjs` from this directory. No network, packages,
credentials, or persistent state are needed.
