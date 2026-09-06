# Item lookup service

Start the service with `node server.mjs`; it binds to an available loopback port
and prints its address. `GET /items/book-1` returns an item as JSON. Successful
lookups have an `X-Cache` header of `MISS` on the first request and `HIT` on later
requests for the same ID. Items absent from the store return status 404 and
`{ "error": "Item not found" }`; missing results are not cached. Unknown routes
also return 404.

Run `node --test app.test.mjs` for local correctness checks. The default store
and cache are in memory, so no packages, credentials, or external services are
required. Each server has its own cache.
