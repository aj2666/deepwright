# Fixture loader

`loadFixture(name)` reads a named JSON fixture shipped in this project's `data`
directory and returns its decoded contents. Names begin with a lowercase
letter and contain only lowercase letters, digits, and hyphens. Invalid names
reject with `RangeError`; read and JSON decoding errors are preserved.

Run `node cli.mjs users` to print the users fixture or
`node --test loader.test.mjs` to run the tests. The CLI may also be invoked by
its absolute path from another working directory. No packages, network access,
credentials, or random data are needed.
