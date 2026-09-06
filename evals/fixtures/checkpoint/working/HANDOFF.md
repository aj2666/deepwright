# Retry option work

Implementation is paused with uncommitted changes to `request.mjs` and
`request.test.mjs`.

The requested feature is `request(operation, { maxRetries })`: default to two
retries, allow integers from zero through five, and reject invalid supplied
values before calling the operation. Preserve returned values and the final
thrown error for synchronous and asynchronous operations.

Option parsing and validation are implemented, and the original two tests are
still present. The retry loop still stops at the hard-coded value `2`, so the
new option does not yet control the number of attempts.

The last recorded `node --test request.test.mjs` run had three passing tests and
two failing tests: `zero retries allows exactly one attempt` and
`five retries allows exactly six attempts`. Both observed attempt lists were
`[0, 1, 2]`. The original behavior and invalid-option test passed.

Unfinished work is to connect the validated limit to the stopping condition,
then verify the full option contract. The next verification command is
`node --test request.test.mjs` from the project root. Inspect the current diff
and compare fresh results with this checkpoint before deciding on further work.
