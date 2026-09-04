# Migration from pstack

Deepwright began as a Codex-native adaptation of the MIT-licensed `pstack` directory at Cursor plugins commit `93b00b89ef425a9c1bac0d0b317dfc49c930ac99`.

| Upstream concept | Deepwright |
|---|---|
| pstack | Deepwright |
| Poteto | Rivet |
| Cursor plugin manifest | `.codex-plugin/plugin.json` |
| Cursor agents and slash commands | Standard Codex skills invoked with `$skill-name` |
| Hard-coded provider model IDs | Host defaults or confirmed IDs in `.codex/deepwright.toml` |
| Cursor `Task` syntax | Host collaboration or subagent capability |
| Bun-only helper scripts | Node 20.19+ bundled executables |
| Local transcript assumptions | Current conversation and `.deepwright/runs/` evidence |

## Deliberate removals

- The dormant Benny scheduled automation was not copied. Scheduled work is account-level behavior and must be created explicitly by its owner.
- The Grok bot UI helper was not copied. It depended on Cursor-specific UI and external tooling.
- Cursor agent files were not disguised as Codex agents. Their useful behavior became `$deepwright:rivet-agent`, `$deepwright:comment-auditor`, and regular skills.
- Vendor-specific control skills remain optional ideas, never undeclared dependencies.

## Compatibility principles

- The installed plugin is skills-only for the broadest CLI and desktop compatibility.
- Optional helpers degrade cleanly when `gh` or a GitHub connector is unavailable.
- No migration step edits a user's main Codex configuration.
- External writes, pushes, PRs, merges, deployments, and messages still require task-level authorization.
