# Deepwright tools

The committed files in `dist/` are self-contained Node.js 20.19+ bundles. Running
the plugin does not install packages, write into the plugin directory, or need
`node_modules`.

- `./deepwright doctor [--json]` checks the local runtime and plugin layout.
- `./orch/orch` runs the orchestration state CLI.
- `./watch-pr/watch-pr` runs the GitHub pull-request watcher.

Git is required for repository operations. The GitHub CLI and an authenticated
GitHub session are needed only for `watch-pr`; the doctor reports those as an
optional capability.

For development, run `npm ci`, then `npm run check`. The check type-checks the
sources, rebuilds all bundles with esbuild, and runs the Vitest suite. Do not
edit generated files in `dist/` directly.
