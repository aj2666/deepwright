# `watch-pr`

`watch-pr` is the optional standalone fallback for pull-request monitoring. The
Deepwright skill prefers a connected GitHub tool when the host provides one;
this executable is for local shells with an authenticated GitHub CLI (`gh`). If
`gh` is missing, it exits with a structured `BLOCKER` verdict instead of trying
to install or authenticate anything.

```sh
./watch-pr --owner OWNER --repo REPO --pr 123
```

Polling is bounded to one hour by default. Set another positive deadline with
`--timeout SECONDS`. Use `--timeout 0` only when an intentionally unbounded
interactive watch is appropriate. Each external status query also has a
two-minute hard stop. `--status-only` performs one read and exits.

Readiness is fail-closed: every review-thread and check-rollup page must be
read; truncated stack discovery is rejected; and unresolved threads, pending
or failing checks, required reviews, or unproven mergeability block. `READY`
requires the same exact head before and after evidence collection, an observed
successful head rollup, `mergeable=MERGEABLE`, and
`mergeStateStatus=CLEAN`. GitHub's aggregate `BLOCKED` state can therefore
never become `READY` merely because a visible check passed.
