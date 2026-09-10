# Project configuration contract

Deepwright works without configuration. Read only `.codex/deepwright.toml` at the active project root; do not search ancestors, home directories, environment variables, or read host configuration files directly. Native host settings are queried only through the explicit public-CLI path below. The filename is the shared project contract for every host, not a Codex-only native config.

Use the optional bundled `../scripts/deepwright config show --json --host <host>` to inspect effective settings and their default/project/host provenance, or `config check` to validate without showing values. Resolve the executable relative to this reference and run it from the intended project root. `config template` prints the defaults below without writing. If Node is unavailable, follow this same contract directly; the helper is not a prerequisite for skills.

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

The helper bounds input to 64 KiB, accepts regular files only, and confines symlink targets to the canonical project directory. Do not read a configuration pointer outside the project. Its diagnostics deliberately omit raw source lines. Schema validation is not host validation: only an explicit `--host` request may query that host, and only Oh My Pi is queried today. `inherit-parent` means omit a Deepwright model override.

On `--host omp`, Deepwright maps worker roles onto Oh My Pi public `modelRoles`: `code` → `task`, `research` → `smol`, `review` → `slow`. A project override still uses the exact identifier from this file after the host confirms it. If a mapped native role is unset, Oh My Pi's documented fallback applies: `task` inherits the current session model, while `smol` and `slow` inherit a configured `default` role when present, otherwise the host's built-in priority chain. Native query failures fail closed for host-dependent checks. Native resolution is not proof that a session will execute that model.

For JSON consumers, `hostValidation: passed` means the public host queries succeeded. `hostRoles` records native bindings and fallbacks without exposing native model IDs. For project overrides, `catalogMatch` checks an exact catalogue selector, optionally followed by a recognized OMP thinking suffix; it does not verify authentication, runtime availability, or model execution. Unsupported or unrecognized selectors stay in `unverifiedModelRoles`: use the native fallback and disclose that limit rather than treating `ok` as approval to execute the override.

Precedence: explicit user task requirements, then valid project preferences, then native host role mapping when `--host omp` and `inherit-parent` apply, then defaults. Always preserve workflow invariants and the host's advertised concurrency limit. A one-candidate preference cannot remove Architect's requirement for two distinct designs; generate them sequentially if capacity requires it. Never invent model IDs or multiply workers merely because a large count is configured.

Inspection stays read-only. Setup may change this file only when the user requests configuration changes; preserve unrelated settings and comments where accurate. Configuration grants no new permissions and starts no background mode, worker, MCP server, or external action.
