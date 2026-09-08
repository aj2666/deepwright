# Item lookup and title updates

Start the service with `node server.mjs`; it binds to an available loopback port
and prints its address. The store and cache are in memory, with no packages,
credentials, or external services required. Each server has its own cache.

`GET /items/:id` returns the saved item as JSON. Successful lookups have an
`X-Cache` header of `MISS` on the first lookup and `HIT` on repeated lookups when
the item has not changed. Missing items return 404 and
`{ "error": "Item not found" }`; missing results are not cached.

`PUT /items/:id` accepts a JSON object with a `title` string containing at least
one non-whitespace character. A successful update returns 200 and the saved item,
preserving its ID and the title exactly as supplied. It changes only that item.
GET remains available during a pending write and returns the last saved version.
Once the PUT has completed successfully, subsequent GET requests must return the
new saved title, including when another GET occurred while the write was pending.

Malformed JSON returns 400 and `{ "error": "Invalid JSON" }`; an invalid title
returns 400 and `{ "error": "Invalid title" }`. Updating a missing item returns
404 and `{ "error": "Item not found" }`. A rejected save returns 500 and
`{ "error": "Update failed" }`; it must neither claim success nor expose the
rejected title through the store or later GET requests.

Unknown routes and unsupported methods remain 404. Malformed percent encoding
in an item ID returns 400 and `{ "error": "Invalid item ID" }`. Existing lookup
behavior and unrelated items must remain unchanged.

Run `node --test app.test.mjs update.test.mjs` for the local checks.
