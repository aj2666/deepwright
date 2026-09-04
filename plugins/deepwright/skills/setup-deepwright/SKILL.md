---
name: setup-deepwright
description: "Configure Deepwright role models and parallelism. Use for $deepwright:setup-deepwright."
---

# Set up Deepwright

Deepwright works without configuration. By default, every delegated role inherits the current Codex model and the host decides which execution features are available.

## Steps

1. Inspect the host's available subagent or collaboration tool schema. Record only model identifiers and options the host actually exposes.
2. Read `.codex/deepwright.toml` in the active repository when it exists. Treat it as the current state.
3. Show the current choices and any confirmed model overrides. Never infer a model slug from marketing names or old configuration.
4. Write the complete project file atomically at `.codex/deepwright.toml`. Preserve comments only when they remain accurate.
5. Re-read and validate the file. Reject an explicit model that was not confirmed available in this host.
6. Resolve and run the bundled [`../deepwright/scripts/deepwright`](../deepwright/scripts/deepwright) `doctor` command. Report warnings without treating an optional tool as a core failure.

Use this shape:

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

Rules:

- `inherit-parent` is always valid and means to omit a model override.
- A role may use a real model identifier only after the current host confirms it.
- Parallelism values must be positive integers and should respect host limits.
- An absent key uses the defaults above.
- Do not edit the Codex host's main `config.toml`; Deepwright owns only `deepwright.toml`.
- Configuration never grants permission for merges, deployments, messages, or other external writes.

After setup, tell the user to begin a new chat when their Codex client does not refresh plugin files in the active thread.
