---
name: setup-deepwright
description: "Inspect or configure Deepwright role models and parallelism. Use for project preferences, not host-wide settings."
license: MIT
disable-model-invocation: true
---

# Set up Deepwright

## Purpose

Deepwright works without configuration. By default, every delegated role inherits the current session model and the host decides which execution features are available.

## Instructions

1. Inspect the host's available subagent or collaboration tool schema. Record only model identifiers and options the host actually exposes.
2. Read [the shared configuration contract](../deepwright/references/configuration.md). Inspect `.codex/deepwright.toml` in the active repository using the optional `config show` helper when available; validate the same contract directly when Node is unavailable.
3. Show the current choices and any confirmed model overrides. Never infer a model slug from marketing names or old configuration.
4. For an inspection-only request, report the current state and stop without writing. For requested changes, validate the proposed complete configuration and confirm explicit models before modifying the file. If a requested override is unavailable, explain the blocked choice and offer `inherit-parent`; do not silently persist an unconfirmed model.
5. Write an authorized, valid configuration atomically at `.codex/deepwright.toml`, preserving unrelated choices and accurate comments. Re-read and validate the result; report a write or validation failure without claiming setup succeeded.
6. When Node is available, resolve and run the bundled [`../deepwright/scripts/deepwright`](../deepwright/scripts/deepwright) `doctor` command with an explicit `--host` for the current host. Report optional-tool warnings separately from configuration errors. Doctor does not activate a plugin.

Use the defaults in the shared contract, or print them with the bundled `deepwright config template`. The helper never writes them. Run `config check` after an authorized change when Node is available; it validates TOML/schema. Host model availability is checked only for `--host omp`.

Rules:

- `inherit-parent` is always valid and means to omit a Deepwright model override.
- On Oh My Pi, `inherit-parent` maps `code` to `task`, `research` to `smol`, and `review` to `slow`. If that native role is unset, use Oh My Pi's documented fallback (`task` follows the session; `smol`/`slow` follow `default` or the built-in priority chain). Do not write those native names into `deepwright.toml`.
- A role may use a real model identifier only after the current host confirms it.
- Parallelism values must be positive integers and should respect host limits.
- An absent key uses the shared defaults. An invalid file is not partially applied.
- Do not edit the host's main configuration; Deepwright owns only `.codex/deepwright.toml`.
- Configuration never grants permission for merges, deployments, messages, or other external writes.

## Examples

**Inspection:** “Which review model will this project use?” Read the project configuration and the shared defaults. If the file is absent, report `inherit-parent` and, on Oh My Pi, the native `slow` fallback; do not create a template or search a home directory for preferences.

**Local change:** “Use one reviewer and keep the other settings.” After reading the current file, change only `parallelism.reviewers` to `1`, preserve role settings and comments, and validate the full result. One reviewer reduces independence; it does not remove the required review lenses.

## Limitations

Configuration validation checks syntax and supported values. Host confirmation distinguishes a configured identifier from actual availability; it does not prove a running worker used that model. Changing project preferences does not itself require reinstalling the plugin.

## Troubleshooting

If TOML is malformed, explain the offending field or error without dumping file contents. Do not partially apply valid-looking keys. Offer a minimal correction and apply it only within the requested scope. Without Node, inspect against the shared contract and disclose that the helper was not run; missing optional tooling does not require an installation.
