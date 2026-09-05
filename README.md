<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="plugins/deepwright/assets/logo-dark.png">
    <img src="plugins/deepwright/assets/logo.png" alt="Deepwright's Investigator Owl — sharp, skeptical, and curious" width="220">
  </picture>
</p>

# Deepwright

**Go deep. Ship sound.**

Deepwright is an evidence-first engineering plugin for Codex. Owl routes complex work through investigation, specification, design, implementation, review, and verification on the real artifact. The Investigator Owl keeps an eye on the evidence.

One implicit router selects the smallest fitting workflow; focused skills remain explicitly invoked. Optional Node 20.19+ helpers provide terminal discovery, project configuration checks, orchestration, and PR watching. The skills themselves do not require Node. The helper's start page reports the current skill and playbook inventory from the installed files.

Deepwright is a native skills-only Codex package. It does not install lifecycle hooks, an MCP server, global settings, or background automation. A request to investigate, specify, plan, or review is not permission to implement, deploy, merge, or take other external actions.

## Install in Codex CLI

You need Codex CLI with plugin support and Git. While this repository is private, you also need repository access and working GitHub authentication.

```bash
codex plugin marketplace add https://github.com/aj2666/deepwright.git --ref main --json
codex plugin add deepwright@deepwright --json
codex plugin list --json
```

SSH is also supported: use `git@github.com:aj2666/deepwright.git` as the marketplace source. Start a **new Codex session** after installation.

Give Owl a goal, a boundary, and a checkable finish condition:

```text
$deepwright:deepwright investigate why this export loses columns. explain the cause and evidence without editing files.
```

```text
$deepwright:owl-agent implement this feature, verify the result, and report what you tested. do not deploy or merge.
```

These are **Codex prompt tokens**, not shell commands. See the [Codex plugin CLI reference](https://learn.chatgpt.com/docs/developer-commands).

## Update

```bash
codex plugin marketplace upgrade deepwright --json
codex plugin add deepwright@deepwright --json
codex plugin list --json
```

Start a fresh Codex session after reinstalling.

## macOS desktop app

Clone the repository and open it as a Codex project in the ChatGPT desktop app. Restart the app, then select the **Deepwright** source in the Plugins Directory and install the plugin. In a fresh chat, type `@` and select **Deepwright**, **Owl**, or a focused skill.

After updating the checkout, restart the app, complete any update or reinstall offered in the Plugins Directory, and start a new chat. Desktop invocation uses the `@` picker rather than the CLI tokens above. See OpenAI's [Plugins guide](https://learn.chatgpt.com/docs/plugins) and [Build plugins](https://developers.openai.com/plugins/build/plugins).

## Choose a workflow

| Task | Skill |
|---|---|
| Route an engineering task | [Deepwright / Owl](plugins/deepwright/skills/deepwright/SKILL.md) |
| Define behavior and acceptance criteria | [Spec](plugins/deepwright/skills/spec/SKILL.md) |
| Understand behavior or rationale | [How](plugins/deepwright/skills/how/SKILL.md) / [Why](plugins/deepwright/skills/why/SKILL.md) |
| Design before implementation | [Architect](plugins/deepwright/skills/architect/SKILL.md) |
| Review correctness, quality, and requirements without fixes | [Interrogate](plugins/deepwright/skills/interrogate/SKILL.md) |
| Build features or fix bugs through a test loop | [TDD](plugins/deepwright/skills/tdd/SKILL.md) |
| Inspect or change project preferences | [Setup Deepwright](plugins/deepwright/skills/setup-deepwright/SKILL.md) |

From a checkout, the optional helper reads canonical metadata and prints guidance:

```bash
plugins/deepwright/skills/deepwright/scripts/deepwright
plugins/deepwright/skills/deepwright/scripts/deepwright skills review --compact
plugins/deepwright/skills/deepwright/scripts/deepwright playbooks performance
plugins/deepwright/skills/deepwright/scripts/deepwright invoke interrogate
plugins/deepwright/skills/deepwright/scripts/deepwright status --json
```

These discovery commands do not launch agents or modify files. All skills remain available through the catalog. See the [terminal reference](docs/TERMINAL.md) for command options and opt-in, print-only AGENTS.md / CLAUDE.md pointers.

## Specify, build, and review

Use `$deepwright:spec` to turn an idea or existing conversation into acceptance criteria without starting implementation. It reuses settled decisions, investigates available facts, and surfaces consequential open choices. The draft stays in the conversation unless writing a document is authorized.

For an authorized feature build, Owl carries those same criteria through design, behavioral test slices, real-surface verification, and final requirements-aware review. A small, clear change needs a short checklist, not a formal spec or repeated interview. Multi-phase plans tie each unit to observable behavior and genuine dependencies; planning alone does not publish tickets or start the build.

The [acceptance contract](plugins/deepwright/skills/spec/references/acceptance-contract.md) distinguishes proved, failed, blocked, and not-applicable criteria. Missing evidence remains blocked. A green test suite or an implementer's claim does not prove every requirement, and a read-only review does not run tests that may write files or contact services.

## Optional configuration

Deepwright works without configuration. Use `$deepwright:setup-deepwright` to inspect preferences or explicitly request changes to `.codex/deepwright.toml`. It never edits Codex's main configuration.

The helper's `config show`, `config check`, and `config template` commands inspect settings, validate them, or print defaults without writing. Run them from the intended project root. Missing settings inherit defaults; invalid configuration is not partially applied. Only the active host can confirm model availability and concurrency. See the [configuration contract](plugins/deepwright/skills/deepwright/references/configuration.md).

## Development

```bash
npm ci --prefix plugins/deepwright/skills/deepwright/scripts
npm test
```

CI covers dependency auditing, typechecking, helper and evaluator tests, reproducible bundles, package/documentation validation, and real Codex CLI installation on Linux and macOS. Desktop interaction and live-agent behavior require separate manual checks; passing tooling tests does not establish improved model routing or productivity.

See [Contributing and release checks](CONTRIBUTING.md), the [evaluation protocol](evals/README.md), and the [security policy](SECURITY.md).

The `plugins/deepwright/skills/` directory contains the actual skill instructions, playbooks, principles, and supporting references—not disposable documentation. The marketplace lives in `.agents/plugins/marketplace.json`; the plugin manifest is `plugins/deepwright/.codex-plugin/plugin.json`.

## Origins and license

Deepwright is a substantial Codex-native adaptation of Cursor's MIT-licensed `pstack` plugin. Its workflow concepts were adapted into standard Codex skills and its optional helpers were ported from Bun to Node. Specification, testing, and requirements-review guidance also adapts material from Matt Pocock's MIT-licensed skills. Source revisions, attribution, and dependency notices are preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Repository additions use the root [Apache-2.0 license](LICENSE). The distributed plugin retains its [MIT license](plugins/deepwright/LICENSE) and [notice](plugins/deepwright/NOTICE.md).

Deepwright is independent and is not affiliated with or endorsed by Cursor or OpenAI.
