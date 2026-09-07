# Harbor Tools

Harbor Tools is a small skills-only plugin for maintainers of a local notes
application. Its package lives in `plugins/harbor-tools`. The manifest declares
where its skills ship; the repository does not have a separate project-local
skill catalog.

`inspect-note` explains supplied note source and evidence without editing or
running commands. New focused workflows follow that skill's metadata and
explicit invocation policy. Preserve its behavior and package files when
extending the plugin.

`records/save-flow.md` is the authorized incident record for the proposed
`verify-save-flow` capability. The application source is supplied in `app/`.
All data and incidents are synthetic. Reading and editing this disposable
repository does not authorize installation, publication, network operations,
new packages, or commits.

The application uses JavaScript modules. `node --test app/save.test.mjs` checks
the supplied implementation when execution is authorized. The workflow being
authored should help a future maintainer verify a save journey through its
actual boundary and distinguish source inspection from executed checks.
