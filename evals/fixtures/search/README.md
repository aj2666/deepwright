# Catalog search

The local service accepts `GET /search?q=<text>` and returns JSON containing
`results` and `total`. A result contains an `id` and `title`. Queries match a
case-insensitive substring of a title after surrounding query whitespace is
removed. Results preserve catalog order. An empty query returns no results.

`createSearch(serializedRecords)` creates an independent search function over a
snapshot of valid JSON catalog records. It does not alter the supplied array.
`createCatalog()` supplies 2,400 deterministic records for local use.

Run `node server.mjs` to start a server bound to an available loopback port;
the process prints its address. Run `node --test search.test.mjs` for correctness
checks. Neither command requires packages or external services.

`node bench.mjs` starts a local server, runs two warmup rounds and seven measured
rounds of the same six queries, and closes the server. Its JSON report includes
the catalog size, queries, all measured milliseconds, their median, and a SHA-256
checksum of the responses. A round covers the full query sequence. Keep the
catalog and workload identical when comparing runs; timings depend on the host.
