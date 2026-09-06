# Evidence coverage

Use this contract when a review, search, delegated result, or resumed task could
otherwise turn an incomplete check into a broad conclusion. A short report can
express it in one sentence; no file or JSON is required.

Name the source, the scope actually inspected, its coverage, and any limitation.
Coverage describes the observation, independently of whether it found a defect.

| Coverage | Meaning |
|---|---|
| complete | The stated scope was inspected without known omissions. Zero findings is a valid result. |
| partial | Some of the stated scope was inspected; name the missing pages, files, conditions, or truncated output. |
| unavailable | The check could not be served because access, a dependency, or the source was unavailable. |
| not-run | The check was not attempted, for example because execution was outside the authorized scope. |
| error | The attempt was invalid or failed, such as a malformed query or a broken checking command. Preserve the error; do not recast it as a clean result or a source outage. |

A successful empty search is different from a failed lookup. A capped first page
is partial even if every returned item was inspected. State the bounds of a
complete check: "all changed files at this SHA" does not cover the whole product.
An error in one source does not erase useful evidence from another.

When combining workers, preserve each source's coverage. Several workers repeating
one result do not provide independent confirmation. Resolve overlapping claims
against their original evidence. Mark acceptance criteria blocked when missing
coverage prevents a conclusion; a complete inspection alone does not prove runtime
behavior or authorize further actions.

Examples:

- "Complete: inspected the three changed parser files at the supplied revision;
  no format-contract mismatch found. Runtime tests were not run: this review
  prohibits execution."
- "Partial: reviewed 25 of the 80 returned PR comments. The remaining pages were
  not fetched, so unresolved review threads cannot yet be ruled out."
- "Error: the test command exited before collecting tests because its argument
  was invalid. No test result was established."

For an optional machine-readable record, use an array of objects with exactly
`source`, `scope`, `status`, and `limitations`. `source` and `scope` are nonempty
strings, `status` is one of the five values above, and `limitations` is an array
of nonempty strings. Complete coverage has no known limitations within that scope;
every other status names at least one limitation. Keep separate entries for static
inspection and runtime verification rather than claiming both are complete.

```json
[
  {"source":"parser.mjs","scope":"public input validation","status":"complete","limitations":[]},
  {"source":"runtime tests","scope":"parser test suite","status":"not-run","limitations":["The user requested inspection without execution."]}
]
```

The optional [run evidence helper](run-evidence.md) validates this structure and
stores selected evidence bytes. Validation checks consistency of supplied records,
not whether a reviewer told the truth or examined every relevant source.
