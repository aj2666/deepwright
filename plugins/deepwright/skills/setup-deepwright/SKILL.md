---
name: setup-deepwright
description: "Configure Deepwright role models and parallelism. Use for $deepwright:setup-deepwright."
---

# Set up Deepwright

Deepwright works without configuration. By default, every delegated role inherits the current Codex model and the host decides which execution features are available.

## Steps

1. Inspect the host's available subagent or collaboration tool schema. Record only model identifiers and options the host actually exposes.
2. Read [the shared configuration contract](../deepwright/references/configuration.md). Inspect `.codex/deepwright.toml` in the active repository using the optional `config show` helper when available; validate the same contract directly when Node is unavailable.
3. Show the current choices and any confirmed model overrides. Never infer a model slug from marketing names or old configuration.
4. For an inspection-only request, report the current state and stop without writing. Only when configuration changes were requested, write the complete project file atomically at `.codex/deepwright.toml`, preserving unrelated choices and accurate comments.
5. Re-read and validate the file. Reject an explicit model that was not confirmed available in this host.
6. Resolve and run the bundled [`../deepwright/scripts/deepwright`](../deepwright/scripts/deepwright) `doctor` command. Report warnings without treating an optional tool as a core failure.

Use the defaults in the shared contract, or print them with the bundled `deepwright config template`. The helper never writes them. Run `config check` after an authorized change when Node is available; it validates TOML/schema, not host model availability.

Rules:

- `inherit-parent` is always valid and means to omit a model override.
- A role may use a real model identifier only after the current host confirms it.
- Parallelism values must be positive integers and should respect host limits.
- An absent key uses the shared defaults. An invalid file is not partially applied.
- Do not edit the Codex host's main `config.toml`; Deepwright owns only `deepwright.toml`.
- Configuration never grants permission for merges, deployments, messages, or other external writes.

After setup, tell the user to begin a new chat when their Codex client does not refresh plugin files in the active thread.
