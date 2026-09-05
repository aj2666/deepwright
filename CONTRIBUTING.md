# Contributing

Keep changes portable across Codex CLI and the macOS desktop app. Create a focused branch, describe the actual behavior exercised, and merge only after the checks pass.

## Preserve the package contract

Keep every skill's `name` equal to its directory and preserve `agents/openai.yaml`. The Deepwright router is the only implicit skill. Markdown under `plugins/deepwright/skills/` is runtime instruction content: keep its playbooks, principles, and supporting references together.

Do not add hard-coded model IDs, hidden transcript paths, credentials, Cursor-only syntax, or undeclared MCP dependencies. Use `$skill-creator` for substantial skill changes. Keep supporting material inside the owning skill directory.

Keep user documentation in the root README and terminal reference, contributor checks here, and evaluation instructions in `evals/README.md`. Do not commit one-off agent transcripts, comparison diaries, or duplicate walkthroughs. Preserve all licenses and attribution notices.

## Automated checks

```bash
npm ci --prefix plugins/deepwright/skills/deepwright/scripts
npm audit --prefix plugins/deepwright/skills/deepwright/scripts --package-lock-only --audit-level=high
npm test
```

`npm test` runs package/documentation validation, helper typechecking/build/tests, and evaluation tests. Commit rebuilt bundles when helper source changes; CI checks that rebuilding produces no differences. CI also checks shell launchers and performs fresh Codex marketplace registration and plugin installation on Linux / Node 20.19.0 and macOS / Node 24.

Keep tests and fixtures when pruning documentation. The CSV evaluation fixture is intentionally defective; its neutral contract remains beside it. Offline scorer/verifier tests check the tooling, not actual model behavior. Use the [evaluation protocol](evals/README.md) for live comparisons.

## Manual release checks

Automated CLI installation does not exercise the desktop UI, confirm model availability, or prove skill activation in another session.

### CLI and discovery

From a checkout whose path contains spaces, exercise the no-argument start page, `skills review --compact`, `playbooks performance`, `skill interrogate`, `invoke interrogate`, `config show`, `config check`, and `status --json` through the bundled helper. Confirm that absent configuration uses defaults and malformed TOML fails without printing its contents.

In fresh CLI and desktop sessions, verify that the printed CLI token and desktop display name resolve. Confirm that a trivial question does not start a broad workflow and a diagnosis-only task does not edit files. See the [terminal reference](docs/TERMINAL.md) for command contracts.

### macOS desktop

1. Clone into a fresh path, open it as a Codex project, restart the app, and install from the repository marketplace.
2. Confirm the Investigator Owl identity and the displayed Deepwright and Rivet skills. In a new chat, use the `@` picker for a harmless inspection with no editing.
3. In a separate bounded prompt, request one reversible change and verify the actual result and reported evidence.
4. Disable and re-enable the plugin; confirm skills disappear and return.
5. Update the checkout, restart, complete any offered update or reinstall, and start a new chat. Confirm the intended version is visible.

### Capability fallbacks

GitHub work prefers an available connector, then authenticated `gh`; missing access must be reported rather than invented. Delegation uses host-exposed capabilities and falls back to disclosed sequential work. Unconfirmed model overrides inherit the parent model.

The core skills do not require Node; optional helpers require Node 20.19+. AGENTS.md and CLAUDE.md exports are pointers, not native installations. Verify path accessibility and instruction loading in the target host before claiming cross-host support.

## Release and publication

The existing main-branch workflow publishes a new manifest version only after both platform jobs pass. Keep repository and plugin versions aligned and provide a matching changelog section when making a release. Do not move previously published version tags.

Before changing repository visibility, review Git history, branches, tags, releases, and discussions for material not intended for publication. Deleting a file from the current tree does not remove its historical copies. Visibility changes and history rewrites are separate operations from a documentation cleanup.
