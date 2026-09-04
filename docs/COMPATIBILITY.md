# Compatibility

Deepwright targets the current stable Codex plugin interface.

| Surface | Automated coverage | Manual release check |
|---|---|---|
| Codex CLI on macOS | Manifest, policies, tool tests, local marketplace add, plugin install | Invoke `$deepwright:deepwright` in a sample repository |
| Codex CLI on Linux | Manifest, policies, tool tests, local marketplace add, plugin install | Invoke `$deepwright:deepwright` in a sample repository |
| Codex in the macOS desktop app | Same plugin artifact and standard skill metadata | Discover, install, select with `@`, invoke, restart, and update |

## Desktop release check

1. Clone the repository into a fresh path.
2. Open that path as a Codex project in the ChatGPT desktop app.
3. Restart the app and install Deepwright from the repo marketplace.
4. Confirm the Investigator Owl identity and the displayed **Deepwright** and **Rivet** skills appear.
5. Start a new Codex chat, type `@`, select **Deepwright**, and ask it to inspect a harmless sample repository and produce a route preview without editing.
6. In another bounded prompt, select **Deepwright** or **Rivet**, ask it to make one reversible change, verify the actual output, and report the evidence.
7. Disable and re-enable the plugin; confirm the skills disappear and return.
8. Pull an update into the checkout, restart the app, complete any update or reinstall offered in the Plugins Directory, start a new chat, and confirm the new version is visible.

These desktop steps are a manual release check. CI validates the same artifact
and its CLI installation on macOS, but it does not exercise the desktop UI.

## Graceful degradation

- GitHub work prefers an installed GitHub connector, then authenticated `gh`.
- When neither exists, Deepwright reports the missing capability instead of fabricating repository state.
- Subagent workflows use the host's exposed collaboration mechanism and fall back to a sequential review.
- Optional role configuration is ignored when its model ID is not confirmed by the host.
- The core skills do not require Node. Node 20.19+ is required only for the bundled orchestration and PR-watching executables.
- Read-only discovery and status helpers also use Node 20.19+. Their local metadata checks do not prove skill activation in another session.
- AGENTS.md and CLAUDE.md fallback exports are pointer text, not native plugin installations. The target host must be able to read the referenced checkout, follow its instructions, and expose any required capabilities. Cross-host live execution is not covered by the Codex installation smoke.

## Discovery release check

Run the no-argument start page, `skills review --compact`, `playbooks performance`, `skill interrogate`, `invoke interrogate`, `config show`, `config check`, and `status --json` through the bundled helper, including from a checkout path containing spaces. Confirm a missing config uses defaults and malformed TOML fails without printing its contents. Confirm the printed Codex prompt token resolves in a fresh CLI session and the corresponding display name resolves in the desktop `@` picker. Confirm a trivial question does not start a broad workflow and a diagnosis-only request does not edit files.

The automated suite checks output contracts and source metadata. Actual model selection, macOS desktop interaction, and cross-agent instruction loading require the manual checks above; do not infer them from terminal status.
