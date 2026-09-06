# Terminal discovery and portable pointers

The optional `deepwright` helper reads the installed plugin's existing Markdown and UI metadata. It does not maintain a second skill registry, decide which playbook a model should use, invoke a model, or install anything. Node 20.19+ is required; the skills themselves do not require Node.

In the examples below, `deepwright` means the executable at `plugins/deepwright/skills/deepwright/scripts/deepwright` in your checkout, or its existing installed launcher. Use the full path when it is not on PATH. Quote executable paths containing spaces. Nothing adds it to PATH automatically.

## Commands

| Shell command | Result |
|---|---|
| `deepwright` or `deepwright home` | Compact start page and command examples |
| `deepwright --help` | Available commands and options |
| `deepwright skills` | All existing skills, sorted by name |
| `deepwright skills review` | Metadata search; not semantic task routing |
| `deepwright skills "design review" --compact` | One-line results matching all words across metadata fields |
| `deepwright playbooks performance` | Request shapes and canonical paths from the existing router table |
| `deepwright skill interrogate` | Summary, canonical file, invocation and policy |
| `deepwright invoke interrogate` | Codex CLI token and desktop picker guidance |
| `deepwright invoke deepwright --host agents` | Opt-in AGENTS.md pointer text |
| `deepwright invoke deepwright --host claude` | Opt-in CLAUDE.md pointer text |
| `deepwright status` | Local version, discovery policy and config validity without setting values |
| `deepwright config show` | Effective preferences and default/project provenance |
| `deepwright config check` | Strict TOML/schema validation without setting values |
| `deepwright config template` | Default TOML printed to stdout; nothing written |
| `deepwright doctor` | Existing environment/installation checks |

Discovery, invocation, configuration and status accept `--json`. `--compact` is exclusive to human `skills` output and cannot combine with `--json`. Search is case-insensitive, requires every whitespace-separated term somewhere in the combined metadata, and preserves name order; it does not infer intent. Playbooks are not additional skill tokens: ask Deepwright to use the fitting playbook. Names may be plain slugs, such as `interrogate`; use the exact names from `skills`. Unknown names and options fail with a usage error. Shell quoting matters when typing a dollar-prefixed Codex token: the simplest approach is to use a plain slug in this helper and paste its result into Codex.

All discovery commands are read-only. Human output escapes terminal control characters; JSON remains machine-readable. The helper never evaluates task text as shell commands and does not offer an execute flag.

## Native invocation versus fallback

For Codex, native plugin discovery is preferred. Paste `$deepwright:interrogate` into a CLI prompt, or select the displayed Interrogate skill with `@` in the desktop app. The terminal command only explains these actions; it does not activate a chat session.

Use fallback pointers only when the target agent can read the same checkout and lacks native skill discovery. `--host agents` and `--host claude` translate instruction-file conventions, not engineering behavior. Both reuse the same canonical skill body, without copying playbooks or principles.

The helper prints a short block for manual review. Merge a needed block into existing repository instructions; do not replace the file or duplicate an already-installed native plugin. Respect the target host's instruction precedence. No tool automatically writes AGENTS.md, CLAUDE.md, host configuration or global rules.

The generated path is absolute and machine-local. Regenerate it after moving the checkout, and verify accessibility in remote containers or worker environments. If an agent cannot read the path, supply the required skill content explicitly or report the missing capability; do not claim it was loaded. These adapters do not register native slash commands, lifecycle hooks, worker types or MCP tools.

## Configuration and status

The existing `.codex/deepwright.toml` remains the only optional configuration convention. Invoke the Setup Deepwright skill to inspect it or request specific changes. Inspection alone never writes. The [shared configuration contract](../plugins/deepwright/skills/deepwright/references/configuration.md) defines defaults, precedence, and limits; this change introduces no environment override, global file or alternate format.

Run these commands from the intended project root. They inspect only that directory, never walk ancestors, and never infer another session's workspace. Missing files and keys use defaults. A pinned, bundled TOML parser handles syntax, followed by Deepwright's strict allowlisted schema; floats are not integers, unknown fields fail, and invalid files produce no effective settings. Inputs are bounded to 64 KiB, regular-file only, with symlinks confined to the canonical project. Diagnostics omit raw source lines.

`config show` deliberately reveals effective role identifiers and counts with their provenance. `config check` and `status` omit setting values. A valid identifier remains unverified until the active host confirms it. `config template` prints a template, not a shell command or automatic writer; review before saving and do not overwrite existing configuration accidentally.

Exit codes are `0` success, `1` read/validation failure, and `64` usage error. Missing config succeeds with defaults; invalid config makes `status`, `config check`, and `config show` exit 1. JSON status now uses `schemaVersion: 2` for the validated-config contract (replacing the earlier presence-only v1); other command envelopes are v1. No helper command applies settings to another process.

Status reports local plugin metadata, not active-session state. Model availability, MCP connections and actual implicit invocation cannot be observed by this standalone process. Use `doctor` for environment checks and a harmless fresh-session invocation for host-level verification. Neither output grants authorization or changes the user's task scope.

## Optional run evidence

For tasks that need historical evidence and a remaining work allowance across resumes, the separate dependency-free `plugins/deepwright/skills/deepwright/scripts/run-evidence.mjs` supports `init`, `claim`, `record`, and `status`. Invoke it with Node and explicit paths. `status` is read-only; the other commands write a dedicated run directory. This is separate from the discovery helper's read-only commands.

The [run evidence reference](../plugins/deepwright/skills/deepwright/references/run-evidence.md) provides the JSON schemas and complete command examples. A run keeps one fixed attempt limit and deadline, preserves selected files by content hash, and refuses inconsistent history. Claim an attempt before beginning the agreed iteration; checkpoints can still record unfinished work after exhaustion. The helper does not launch agents or enforce host token, cost, permission, or running-process limits.

## Maintenance

Edit `SKILL.md` and `agents/openai.yaml` as the source of truth. Discovery reads their current values. Keep their supported one-line metadata shape; malformed or unsupported metadata fails clearly rather than silently inventing catalog entries. Playbook browsing validates the router table against its actual files. The catalog does not read every playbook body or inject all skills into model context. Config defaults live in the shared runtime module and are checked against the human-readable contract.

Run `npm test` after changes. Commit rebuilt helper bundles using the existing build workflow. See [manual release checks](../CONTRIBUTING.md#manual-release-checks) for the CLI, desktop and fallback verification boundaries.
