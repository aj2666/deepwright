# Label processing

`normalizeLabel(value)` trims surrounding whitespace and replaces internal
whitespace runs with one space. It rejects non-string values with `TypeError`
and records how many labels were processed. Metrics are available through
`readMetrics()`.

Run `node labels.test.mjs` to execute the tests with Node's built-in test
harness. The tests also work with `node --test labels.test.mjs`. Neither command
needs packages, external services, or network access.
