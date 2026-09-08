# Reading room

A small personal reading list. The current app displays saved links from a local
JSON file. It uses plain browser JavaScript and Node's HTTP and filesystem APIs.
There are no packages to install or external services to configure.

Run `node server.mjs` with Node 20.19 or later. It binds an available port on
`127.0.0.1` and prints the address. `READING_LIST_PORT` selects a specific port;
`READING_LIST_DATA_DIR` selects a directory containing `items.json`. By default,
the app uses the supplied `data` directory. Run `node --test app.test.mjs` for the
existing behavior checks.

## Add an item

The next feature is a title and URL form, using the page's existing visual style.
Submitting it should save through the API, show the new item, and clear the form
only after a successful save. Provide associated field labels, keyboard access,
and understandable validation and status messages. While a submission is pending,
prevent repeated submission of that same form. If saving fails, retain both inputs
and let the person retry. The page should work on a narrow phone screen as well
as a desktop. Keep the existing items visible and keep their links working.

`GET /api/items` remains `{ "items": [...] }`. Each item has a distinct nonempty
string `id`, a `title`, and a `url`; item order is insertion order. The file stores
the same items as a JSON array. Reading the list does not change the file.

Add `POST /api/items` accepting a JSON object with `title` and `url`:

- Both fields must be strings. Trim surrounding whitespace. The trimmed title
  must contain 1 through 120 characters. The URL must be an absolute HTTP or HTTPS
  URL with a hostname; relative URLs and other protocols are invalid.
- Success returns status 201 and `{ "item": { "id": "...", "title": "...", "url": "..." } }`.
  Generate the ID on the server and retain the trimmed URL text.
- Invalid JSON or input returns status 400 and `{ "error": "..." }` with a
  nonempty message. Invalid requests must not change the list or stored bytes.
- Only report success after the item has been saved. Preserve every existing
  item, including when requests arrive together. Saved items must remain after
  restarting the process.
- A storage failure returns status 500 and error JSON. A later retry must work
  after storage becomes available again. Do not replace unreadable or malformed
  existing data with an empty list.

Unknown API paths and unsupported methods keep returning 404. Keep the existing
tests and add checks for the new behavior. The app is local and single-user;
accounts, remote link fetching, dependencies, and deployment are outside this change.

For local storage-failure diagnosis, start with a disposable data directory,
then replace that directory with a regular file while the server is running.
Filesystem operations beneath that path will fail with `ENOTDIR`. Restore the
directory to exercise recovery without relying on platform-specific permissions.
