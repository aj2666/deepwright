# Notes documentation build

Run `node build.mjs` to build the heading. It must print `# Notes` and exit zero.
`renderTitle` is the existing public API: it trims a string and rejects non-string input.
Preserve that API, the lockfile, and the existing tests. No dependency installation is needed.
