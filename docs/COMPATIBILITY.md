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
4. Confirm the orange Deepwright identity and the displayed **Deepwright** and **Rivet** skills appear.
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
