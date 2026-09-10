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
| `deepwright find "review my code for security problems"` | Ranked suggestions from skill and playbook metadata |
| `deepwright find "make this API faster" --limit 2 --json` | Up to two results per kind, with paths, scores, and matched terms |
| `deepwright playbooks performance` | Request shapes and canonical paths from the existing router table |
| `deepwright playbooks accessibility` | Feature workflow with conditional product-interface guidance |
| `deepwright playbooks backend` | Feature workflow with conditional API and persisted-data guidance |
| `deepwright skills security --compact` | Focused Interrogate review entry point |
| `deepwright skill interrogate` | Summary, canonical file, selected-host guidance and policy |
| `deepwright invoke interrogate --host codex` | Codex CLI token and desktop picker guidance |
| `deepwright invoke deepwright --host agents` | Opt-in AGENTS.md pointer text |
| `deepwright invoke deepwright --host claude` | Native Claude Code prompt plus optional CLAUDE.md fallback |
| `deepwright invoke deepwright --host omp` | Native Oh My Pi skill prompt |
| `deepwright status` | Local version, discovery policy and config validity without setting values |
| `deepwright config show` | Effective preferences and default/project provenance |
| `deepwright config check` | Strict TOML/schema validation without setting values |
| `deepwright config template` | Default TOML printed to stdout; nothing written |
| `deepwright doctor` | Existing environment/installation checks |

Discovery, invocation, configuration and status accept `--json`. `--compact` is exclusive to human `skills` output and cannot combine with `--json`. The existing `skills` and `playbooks` searches are case-insensitive, require every whitespace-separated term somewhere in the combined metadata, and preserve name order. Playbooks are not additional skill tokens: ask Deepwright to use the fitting playbook. Names may be plain slugs, such as `interrogate`; use the exact names from `skills`. Unknown names and options fail with a usage error. Shell quoting matters when typing a dollar-prefixed Codex token: the simplest approach is to use a plain slug in this helper and paste its result into Codex.

`--host codex|agents|claude|omp` selects host guidance for every command. The default is `agents` (host-neutral); host selection is explicit rather than inferred from environment variables. Use `--host omp` for OMP-native prompts and its read-only configuration checks.

All discovery commands are read-only. Human output escapes terminal control characters; JSON remains machine-readable. The helper never evaluates task text as shell commands and does not offer an execute flag.

## Ranked suggestions

Use `find` when you have a task description rather than an exact catalog term. It ranks the same canonical names, display names, and descriptions using BM25 lexical scoring. It splits identifiers, normalizes Unicode and common English plurals, and ignores common connecting words. It does not understand synonyms or infer the requested permissions. Skill bodies and reference contents do not affect ranking.

Results have separate skill and playbook limits, each defaulting to three. `--limit` accepts integers from 1 to 10 and applies to each kind. Exact canonical names take precedence over display-name matches, then lexical scores determine order with name ties resolved deterministically. Scores compare entries within one query and kind; they are not confidence percentages and should not be compared across catalogs or queries.

The JSON envelope includes `schemaVersion: 2`, `tool`, `command`, `host`, `query`, `limit`, `algorithm`, `skills`, and `playbooks`. Each result retains canonical metadata plus `score` and normalized `matchedTerms`. Descriptions are capped at 240 Unicode code points with an ellipsis when shortened. No full instruction bodies are returned. Read the selected files in full and follow their applicable references before using them. A result never activates a skill or grants permission to act.

A supplied empty query, a query made entirely of ignored words, or a query with no lexical overlap returns empty arrays and exits 0, unless the query matches an exact name such as `deepwright`. Missing queries, inputs over 4096 UTF-8 bytes, and invalid limits exit 64. Catalog read or validation failures exit 1 without partial suggestions. Discovery rebuilds its metadata view on every call, so edits and removals take effect without a cache reset. If the optional helper is unavailable, use the canonical skill and playbook files directly.

## Native invocation versus fallback

For Codex, native plugin discovery is preferred. Paste `$deepwright:interrogate` into a CLI prompt, or select the displayed Interrogate skill with `@` in the desktop app. The terminal command only explains these actions; it does not activate a chat session.

Use fallback pointers only when the target agent can read the same checkout and lacks native skill discovery. `--host agents` prints an instruction-file pointer. `--host claude` prints the native `/deepwright:<skill>` prompt plus a fallback pointer; `--host omp` prints `/skill:<skill>`. Both reuse the same canonical skill body, without copying playbooks or principles.

The helper prints a short block for manual review. Merge a needed block into existing repository instructions; do not replace the file or duplicate an already-installed native plugin. Respect the target host's instruction precedence. No tool automatically writes AGENTS.md, CLAUDE.md, host configuration or global rules.

The generated path is absolute and machine-local. Regenerate it after moving the checkout, and verify accessibility in remote containers or worker environments. If an agent cannot read the path, supply the required skill content explicitly or report the missing capability; do not claim it was loaded. The helper does not register slash commands or install anything. Native Claude Code and Oh My Pi discovery comes from installing the [shared package](../README.md#claude-code-and-oh-my-pi).

## Configuration and status

The existing `.codex/deepwright.toml` remains the only optional Deepwright configuration convention. Invoke Setup Deepwright to inspect it or request specific changes. Inspection alone never writes. The [shared configuration contract](../plugins/deepwright/skills/deepwright/references/configuration.md) defines defaults, precedence, and limits. Explicit `--host omp` reads native role settings through the public OMP CLI; it does not read native config files directly or create another Deepwright configuration format.

Run these commands from the intended project root. They inspect only that directory, never walk ancestors, and never infer another session's workspace. Missing files and keys use defaults. A pinned, bundled TOML parser handles syntax, followed by Deepwright's strict allowlisted schema; floats are not integers, unknown fields fail, and invalid files produce no effective settings. Inputs are bounded to 64 KiB, regular-file only, with symlinks confined to the canonical project. Diagnostics omit raw source lines.

`config show` deliberately reveals project role identifiers and counts with their provenance; `config check` and `status` omit setting values. With `--host omp`, `hostRoles` maps code/research/review to task/smol/slow and reports native fallback choices. `hostValidation` covers successful public CLI queries, while `catalogMatch` describes catalogue membership for project overrides, not authentication or execution. `unverifiedModelRoles` must still fall back to the native role. `config template` prints a template; review it before saving and do not overwrite existing configuration accidentally.

Exit codes are `0` success, `1` read/validation failure, and `64` usage error. Missing project config succeeds with defaults; invalid config makes `status`, `config check`, and `config show` exit 1. OMP query failures also exit 1 instead of silently using non-OMP defaults. Discovery and configuration envelopes use `schemaVersion: 2`; status uses v3 for the host-validation contract. Raw skill metadata no longer has a Codex-only `invocation` field: `home`, `skill`, and `invoke` return selected-host `guidance` separately. No helper command applies settings to another process.

Status reports local plugin metadata and requested host configuration observations, not active-session state. Runtime model availability, MCP connections, and actual implicit invocation require separate native-session evidence. `doctor --host omp` checks the CLI, skill-command settings, discovery provider, and registry identity/version; warnings about missing or conflicting installations never claim activation. Neither output grants authorization or changes the user's task scope.

## Optional run evidence

For tasks that need historical evidence and a remaining work allowance across resumes, the separate dependency-free `plugins/deepwright/skills/deepwright/scripts/run-evidence.mjs` supports `init`, `claim`, `record`, and `status`. Invoke it with Node and explicit paths. `status` is read-only; the other commands write a dedicated run directory. This is separate from the discovery helper's read-only commands.

The [run evidence reference](../plugins/deepwright/skills/deepwright/references/run-evidence.md) provides the JSON schemas and complete command examples. A run keeps one fixed attempt limit and deadline, preserves selected files by content hash, and refuses inconsistent history. Claim an attempt before beginning the agreed iteration; checkpoints can still record unfinished work after exhaustion. The helper does not launch agents or enforce host token, cost, permission, or running-process limits.

## Maintenance

Edit `SKILL.md` and `agents/openai.yaml` as the source of truth. Discovery reads their current values. Keep their supported one-line metadata shape; malformed or unsupported metadata fails clearly rather than silently inventing catalog entries. The router must declare `disable-model-invocation: false`; all leaves must declare `true`, matching the inverse of their Codex implicit-invocation policy. Playbook browsing validates the router table against its actual files. The catalog does not read every playbook body or inject all skills into model context. Config defaults live in the shared runtime module and are checked against the human-readable contract.

Run `npm test` after changes. Commit rebuilt helper bundles using the existing build workflow. See [manual release checks](../CONTRIBUTING.md#manual-release-checks) for the CLI, desktop and fallback verification boundaries.
