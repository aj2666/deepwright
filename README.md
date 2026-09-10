<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="plugins/deepwright/assets/logo-dark.png">
    <img src="plugins/deepwright/assets/logo.png" alt="Deepwright" width="220">
  </picture>
</p>

# Deepwright

Deepwright is a plugin for Codex, Claude Code, and Oh My Pi for investigating code, planning work, building features, fixing bugs, and reviewing changes. Describe what you need and what should stay untouched; Deepwright chooses a workflow for the task.

## Install

### Codex CLI

You need Codex CLI with plugin support and Git. This private repository also requires GitHub access and authentication.

```bash
codex plugin marketplace add https://github.com/aj2666/deepwright.git --ref main --json
codex plugin add deepwright@deepwright --json
codex plugin list --json
```

For SSH, use `git@github.com:aj2666/deepwright.git` as the marketplace source. Start a new Codex session after installing.

### macOS desktop

Clone the repository and open it as a Codex project in the ChatGPT desktop app. Restart the app, install **Deepwright** from the Plugins Directory, then start a fresh chat. Use the `@` picker to choose Deepwright or a specific skill.

### Claude Code and Oh My Pi

Claude Code and Oh My Pi load the same `plugins/deepwright/skills/` tree through the Claude-compatible marketplace. They do not need a copied skill catalog or extension runtime.

```bash
claude plugin marketplace add https://github.com/aj2666/deepwright.git
claude plugin install deepwright@deepwright
```

```bash
omp plugin marketplace add https://github.com/aj2666/deepwright.git
omp plugin install deepwright@deepwright
```

For this local checkout, replace the marketplace URL with the absolute path to the repository root. For a session without installation, launch either host from your target project with `--plugin-dir /absolute/path/to/deepwright/plugins/deepwright`. Start a fresh session after installation or updates.

| Host | Prompt to route a task | Prompt to review |
|---|---|---|
| Claude Code | `/deepwright:deepwright <task>` | `/deepwright:interrogate <task>` |
| Oh My Pi | `/skill:deepwright <task>` | `/skill:interrogate <task>` |

These are chat prompts, not shell commands. Oh My Pi requires skill slash commands to be enabled and uses unqualified skill names; check for collisions with another installed skill of the same name. Claude Code namespaces plugin skills. Supporting paths stay relative to the installed skill.

Oh My Pi must enable the `claude-plugins` discovery provider, `skills.enabled`, and `skills.enableSkillCommands`. Check them with `omp config get disabledProviders --json`, `omp config get skills.enabled --json`, and `omp config get skills.enableSkillCommands --json`. If `claude-plugins` appears in `disabledProviders`, remove only that entry; preserve unrelated provider settings. The router is the sole automatically discoverable Deepwright skill; all 47 skills remain explicitly callable.

The optional helper accepts `--host omp` for native prompts and read-only OMP configuration diagnostics; see the [terminal reference](docs/TERMINAL.md). It does not rewrite OMP model settings.

## Use Owl as a desktop pet

<img src="plugins/deepwright/assets/pets/deepwright/preview.gif" alt="The Deepwright owl blinks" width="192">

The Investigator Owl is available as a custom v2 pet for compatible Codex desktop versions, with nine animations and 16 gaze directions. Install it separately from the plugin.

From the repository root, copy the pet into your Codex pet directory:

```bash
pet_dir="${CODEX_HOME:-$HOME/.codex}/pets/deepwright"
mkdir -p "$pet_dir"
cp plugins/deepwright/assets/pets/deepwright/pet.json "$pet_dir/pet.json"
cp plugins/deepwright/assets/pets/deepwright/spritesheet.webp "$pet_dir/spritesheet.webp"
```

These commands replace an existing pet named `deepwright`. The [pet manifest](plugins/deepwright/assets/pets/deepwright/pet.json) and [spritesheet](plugins/deepwright/assets/pets/deepwright/spritesheet.webp) must stay together. The asset uses 192 x 208 cells in a 1536 x 2288 transparent atlas and is covered by the plugin's [MIT license](plugins/deepwright/LICENSE).

## Use Deepwright

Enter these examples in a **Codex CLI prompt**, not in your terminal.

Investigate without changing files:

```text
$deepwright:deepwright Explain why this export loses columns. Show the cause and evidence, but do not edit files.
```

Build a feature and check the result:

```text
$deepwright:deepwright Add a case-insensitive name filter. Keep the current behavior when the filter is empty, add tests, and verify the result. Do not deploy or merge.
```

Review your changes:

```text
$deepwright:interrogate Review my changes for bugs and missing requirements. Include uncommitted files. Do not edit files or post comments.
```

For a specific task, choose a skill directly:

| Task | Skill |
|---|---|
| Define requirements before building | [Spec](plugins/deepwright/skills/spec/SKILL.md) - `$deepwright:spec` |
| Understand how code works | [How](plugins/deepwright/skills/how/SKILL.md) - `$deepwright:how` |
| Investigate a design decision | [Why](plugins/deepwright/skills/why/SKILL.md) - `$deepwright:why` |
| Review code and requirements | [Interrogate](plugins/deepwright/skills/interrogate/SKILL.md) - `$deepwright:interrogate` |
| Rewrite prose without changing its meaning | [Unslop](plugins/deepwright/skills/unslop/SKILL.md) - `$deepwright:unslop` |

See the [workflow guide](plugins/deepwright/skills/deepwright/SKILL.md) for more tasks. A request to explain, plan, or review does not authorize implementation or shipping. Deepwright does not install background automation or change global settings.

## Update

```bash
codex plugin marketplace upgrade deepwright --json
codex plugin add deepwright@deepwright --json
codex plugin list --json
```

Start a fresh Codex session afterward. On desktop, update your checkout, restart the app, complete any plugin update or reinstall, and start a new chat.

## Optional helpers and settings

The skills work without Node.js. The terminal helper requires Node 20.19 or newer and can help you find a workflow from a checkout:

```bash
plugins/deepwright/skills/deepwright/scripts/deepwright
plugins/deepwright/skills/deepwright/scripts/deepwright find "review my code for security problems"
```

These discovery commands print guidance; they do not launch agents or change files. See the [terminal guide](docs/TERMINAL.md) for all commands.

Deepwright works without configuration. Use `$deepwright:setup-deepwright` to inspect preferences or request changes to `.codex/deepwright.toml`. See the [settings reference](plugins/deepwright/skills/deepwright/references/configuration.md).

## Development

From the repository root:

```bash
npm ci --prefix plugins/deepwright/skills/deepwright/scripts
npm test
```

See [Contributing](CONTRIBUTING.md) for development and release checks, [Evaluations](evals/README.md) for workflow testing, and [Security](SECURITY.md) for reporting vulnerabilities.

The `plugins/deepwright/skills/` directory contains the actual skill instructions, playbooks, principles, and supporting references, not disposable documentation. The marketplace lives in `.agents/plugins/marketplace.json`; the Codex plugin manifest is `plugins/deepwright/.codex-plugin/plugin.json`. Claude Code and Oh My Pi share `.claude-plugin/marketplace.json` and `plugins/deepwright/.claude-plugin/plugin.json`. Keep plugin versions synchronized.

## License

Repository additions use [Apache-2.0](LICENSE). The distributed plugin's license terms are in [plugins/deepwright/LICENSE](plugins/deepwright/LICENSE).
