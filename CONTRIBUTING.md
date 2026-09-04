# Contributing

Keep changes portable across Codex CLI and the macOS desktop app.

1. Create a focused branch.
2. Keep every skill's `name` equal to its directory and preserve `agents/openai.yaml`.
3. Do not add hard-coded model IDs, hidden transcript paths, credentials, Cursor-only syntax, or an undeclared MCP dependency.
4. Run `npm run validate`.
5. Install the tool dependencies and run `npm run test:tools` when helper code changes.
6. Let the Linux/macOS CI matrix run a fresh Codex marketplace and install smoke when plugin packaging changes.
7. Describe the real behavior you exercised in the pull request.

Use `$skill-creator` for substantial skill changes and keep supporting material inside the owning skill directory.
