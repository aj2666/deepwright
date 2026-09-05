# Project configuration contract

Deepwright works without configuration. Read only `.codex/deepwright.toml` at the active project root; do not search ancestors, home directories, environment variables, or the host's main configuration.

Use the optional bundled `../scripts/deepwright config show --json` to inspect effective settings and their default/project provenance, or `config check` to validate without showing values. Resolve the executable relative to this reference and run it from the intended project root. `config template` prints the defaults below without writing. If Node is unavailable, follow this same contract directly; the helper is not a prerequisite for skills.

```toml
version = 1

[roles]
code = "inherit-parent"
research = "inherit-parent"
review = "inherit-parent"

[parallelism]
swarm_workers = 4
design_candidates = 3
reviewers = 3
```

Missing files and missing keys use these defaults. Accept only these tables and keys: explicit `version` is TOML integer 1; parallelism fields are positive safe-range TOML integers; role choices are model identifiers of 1–256 printable ASCII characters without whitespace, or `inherit-parent`. Unknown keys, syntax errors, unsupported versions, and wrong types make the whole file invalid. Do not partially apply invalid settings or silently rewrite the file. Report the problem and continue only work that does not depend on those settings; use inherited models when an override is unverified and disclose that fallback.

The helper bounds input to 64 KiB, accepts regular files only, and confines symlink targets to the canonical project directory. Do not read a configuration pointer outside the project. Its diagnostics deliberately omit raw source lines. Schema validation is not host validation: only the active host can confirm model availability and execution capacity. `inherit-parent` means omit a model override.

Precedence: explicit user task requirements, then valid project preferences, then defaults. Always preserve workflow invariants and the host's advertised concurrency limit. A one-candidate preference cannot remove Architect's requirement for two distinct designs; generate them sequentially if capacity requires it. Never invent model IDs or multiply workers merely because a large count is configured.

Inspection stays read-only. Setup may change this file only when the user requests configuration changes; preserve unrelated settings and comments where accurate. Configuration grants no new permissions and starts no background mode, worker, MCP server, or external action.
