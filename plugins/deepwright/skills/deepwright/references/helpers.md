# Optional helpers

Read this before relying on a bundled helper for discovery, coordination state, PR watching, plan checks, run evidence, or worktree audits. Helpers are optional accelerators; the core workflow must still work from canonical files and available host tools when an executable or GitHub CLI is unavailable.

Resolve `scripts/` from the Deepwright skill directory, one level above this reference. Run project-sensitive commands from the intended project root. Use only the helper needed for the current task, and run `scripts/deepwright doctor` before relying on it. `status` reports local discovery/configuration validity; it does not verify another session's activation, model availability, or MCP connections.

The optional `scripts/deepwright` command shows a compact start page. When discovery is uncertain, `find "<task>"` ranks canonical skill and playbook metadata; it only suggests entries. `skills [query] --compact` and `playbooks [query]` retain literal matching; `skill <name>` shows details, and `invoke <name>` prints CLI/desktop guidance. Read the selected skill or playbook in full before using it: a result summary does not replace its instructions or authorize execution.

| Script | Purpose | Example arguments |
| --- | --- | --- |
| `scripts/deepwright` | Check runtime/layout, discover workflows, inspect project settings | `doctor --json`, `skills review --compact`, `config check` |
| `scripts/orch/orch` | Track authorized coordination state | `--help` before selecting a state-changing command |
| `scripts/watch-pr/watch-pr` | Observe PR checks and review status through authenticated GitHub access | `--help` to select the actual PR and watch limits |
| `scripts/run-evidence.mjs` | Preserve selected evidence and a fixed attempt allowance across resumes | `node scripts/run-evidence.mjs --help`; read the [run record contract](run-evidence.md) before writing |
