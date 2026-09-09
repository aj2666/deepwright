# Settings text

`parseSettings(source)` reads newline-separated `key=value` entries and returns
an array of `{ key, value }` objects in their original order. Keys begin with a
letter and contain only letters, digits, underscores, and hyphens. Keys and
values have surrounding whitespace removed; values may be empty or contain
additional equals signs. Duplicate keys remain separate entries. Both LF and
CRLF line endings are accepted. Surrounding whitespace is ignored, and empty
or whitespace-only source represents no entries. Invalid lines throw
`SyntaxError`; a non-string source throws `TypeError`.

`formatSettings(entries)` joins valid settings entries as `key=value` lines,
without a final newline. It preserves entry order and leaves the caller's array
and objects unchanged. An empty array produces an empty string.

Run the existing tests with `node --test parser.test.mjs formatter.test.mjs`.
Read a settings file with `node cli.mjs sample.settings` or
`node cli.mjs empty.settings`. The CLI prints the parsed entries as JSON. These
commands need only Node; they use no network or external packages.
