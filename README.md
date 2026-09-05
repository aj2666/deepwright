<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="plugins/deepwright/assets/logo-dark.png">
    <img src="plugins/deepwright/assets/logo.png" alt="Deepwright's Investigator Owl — sharp, skeptical, and curious" width="220">
  </picture>
</p>

# Deepwright

**Go deep. Ship sound.**

Meet **the Investigator Owl** — sharp, skeptical, and curious. Deepwright's black-and-white mascot keeps an eye on the evidence.

Deepwright is an evidence-first engineering plugin for Codex. Rivet, its engineering router, routes complex work through focused playbooks for investigation, design, implementation, review, and proof on the real artifact.

This repository is a native Codex package—not a compatibility wrapper. It uses the required [`.codex-plugin/plugin.json`](https://developers.openai.com/plugins/build/plugins) manifest, standard skill folders, and per-skill invocation policy. It has no Cursor agents, slash commands, hooks, or hard-coded model names.

## What ships

- **Rivet orchestration:** `$deepwright:deepwright` selects the smallest fitting engineering playbook and owns the final evidence.
- **23 playbooks:** bugs, features, refactors, performance, runtime and trace forensics, visual parity, PRs, shipping, and multi-phase programs.
- **Focused tools:** `$deepwright:architect`, `$deepwright:arena`, `$deepwright:interrogate`, `$deepwright:swarm`, `$deepwright:tdd`, and more.
- **21 engineering principles:** loaded only when they change a decision.
- **Portable helpers:** optional Node 20.19+ orchestration and PR-watching CLIs with no Bun dependency.
- **Safe defaults:** no bundled credentials, MCP server, background automation, deployment, merge, or external write without the authority supplied by the task.

The plugin is skills-only. Rivet's `$deepwright:deepwright` router is the single implicit entry point for natural, non-trivial engineering requests; focused leaf skills stay explicit so a narrow question cannot accidentally start a wide workflow. Skills are the portable workflow layer supported by Codex CLI and the Codex experience in the ChatGPT desktop app; they progressively load when invoked instead of flooding the initial context. See OpenAI's [skill documentation](https://learn.chatgpt.com/docs/build-skills).

## Install in Codex CLI

Prerequisites: Codex CLI, Git, and access to this private GitHub repository.

```bash
codex plugin marketplace add git@github.com:aj2666/deepwright.git --ref main --json
codex plugin add deepwright@deepwright --json
codex plugin list --json
```

Start a new Codex CLI session after installation so the bundled skills are
loaded.

GitHub HTTPS works too when your Git credential helper can authenticate:

```bash
codex plugin marketplace add https://github.com/aj2666/deepwright.git --ref main --json
```

Codex accepts local directories, GitHub shorthand, HTTPS URLs, and SSH URLs as marketplace sources. See the [Codex plugin CLI reference](https://learn.chatgpt.com/docs/developer-commands).

In Codex CLI, start a task with:

```text
$deepwright:deepwright investigate this bug, fix the root cause, and prove it on the real surface
```

Or invoke Rivet directly:

```text
$deepwright:rivet-agent take this feature from design through verified delivery
```

## Update in Codex CLI

Refresh the Git marketplace, reinstall the plugin, and then start a new Codex
session:

```bash
codex plugin marketplace upgrade deepwright --json
codex plugin add deepwright@deepwright --json
codex plugin list --json
```

## Install in the macOS desktop app

1. Clone the private repository with your normal GitHub credentials.
2. Open the cloned folder as the project in Codex.
3. Restart the ChatGPT desktop app so it discovers `.agents/plugins/marketplace.json`.
4. Open the Plugins Directory, choose the **Deepwright** source, and install **Deepwright**.
5. Start a fresh Codex chat, type `@`, select **Deepwright** or one of its bundled skills, and ask it to inspect a harmless sample repository without editing.

The `$deepwright:...` examples in this repository are Codex CLI syntax. In the
desktop app, use the `@` picker and the displayed **Deepwright** and **Rivet**
names. OpenAI's [Plugins guide](https://learn.chatgpt.com/docs/plugins)
documents the fresh-chat and `@` invocation behavior. After pulling an update
to the checkout, restart the app, complete any update or reinstall offered in
the Plugins Directory, and start a new chat.

Repo marketplaces and plugin skills are supported in the desktop app; OpenAI documents the discovery flow in [Build plugins](https://developers.openai.com/plugins/build/plugins) and [Build skills](https://learn.chatgpt.com/docs/build-skills).

## Optional configuration

Deepwright works without configuration. Run `$deepwright:setup-deepwright` to create `.codex/deepwright.toml` for repository-specific role choices and parallelism. It never edits Codex's main config.

Only use model IDs that the active Codex host confirms are available. Missing role settings inherit the parent model.

## Find and invoke a skill

All 46 skills remain available. These are useful starting points, not a second routing system:

| Need | Existing skill |
|---|---|
| Choose a workflow for an engineering task | Deepwright / Rivet |
| Understand behavior or rationale | How / Why |
| Design before implementation | Architect |
| Review a design or diff without applying fixes | Interrogate |
| Implement through a focused test loop | TDD |
| Configure optional roles and parallelism | Setup Deepwright |

From this checkout, use the optional helper in your shell:

```bash
plugins/deepwright/skills/deepwright/scripts/deepwright skills review
plugins/deepwright/skills/deepwright/scripts/deepwright playbooks performance
plugins/deepwright/skills/deepwright/scripts/deepwright skill interrogate
plugins/deepwright/skills/deepwright/scripts/deepwright invoke interrogate
plugins/deepwright/skills/deepwright/scripts/deepwright status --json
plugins/deepwright/skills/deepwright/scripts/deepwright config show
```

These commands only read files and print results. They do not launch an agent or modify the project. Paste the printed skill token into a **Codex prompt**, not your shell; use the `@` picker in the desktop app. Search reads current skill metadata, not a separately maintained catalog. See the [terminal and adapter guide](docs/TERMINAL.md).

For a host without native plugin discovery, `invoke deepwright --host agents` or `--host claude` prints an opt-in pointer block. Review it before manually merging it into existing repository instructions. No adapters, hooks, MCP server, or global settings are installed.

Run the helper with no arguments for a compact start page, or add `--compact` to skill search for one-line results. Playbook discovery uses the router's existing table, not a second workflow registry.

`status` validates the optional `.codex/deepwright.toml` in the current working directory without printing values. `config show` exposes effective preferences and their provenance; `config check` validates and `config template` prints defaults without writing. Schema validity does not mean the active Codex session has loaded the plugin, confirmed models, or connected MCP tools. Configuration remains optional; actual host capabilities and the user's task boundary take precedence.

## Verify this checkout

```bash
npm run validate
npm install --prefix plugins/deepwright/skills/deepwright/scripts
npm run test:tools
npm run test:evals
```

The GitHub Actions matrix runs the static validator, tool tests, and real Codex install smoke on Linux and macOS. The manual desktop checklist is in [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).

The [skill evaluation corpus](evals/README.md) separates prompts from observer rubrics. Its [artifact verifier](evals/ARTIFACTS.md) checks saved evidence digests and compares runs with matching reported conditions; efficiency is withheld unless correctness and scope gates pass. Passing these tooling tests is not evidence that a model's automatic triggering improved. The [Ponytail comparison](docs/PONYTAIL_REVIEW.md) explains what we adopted and deferred.

## Repository layout

```text
.agents/plugins/marketplace.json      Repo marketplace
plugins/deepwright/.codex-plugin/     Codex manifest
plugins/deepwright/skills/            Deepwright and supporting skills
plugins/deepwright/assets/            Native Deepwright identity
scripts/                              Compatibility validator
```

## Origins and license

Deepwright is a substantial Codex-native adaptation of Cursor's `pstack` plugin. The migration replaces Poteto with Rivet, converts agent and command concepts into standard skills, removes vendor-only automation, and ports bundled tooling from Bun to Node. See [`MIGRATION.md`](MIGRATION.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Repository additions are available under the root Apache-2.0 license. The distributed plugin retains the upstream MIT license and notice in `plugins/deepwright/`.

Deepwright is independent and is not affiliated with or endorsed by Cursor or OpenAI.
