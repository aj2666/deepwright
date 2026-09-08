# Contributing

Keep changes portable across Codex CLI and the macOS desktop app. Create a focused branch, describe the actual behavior exercised, and merge only after the checks pass.

## Preserve the package contract

Keep every skill's `name` equal to its directory and preserve `agents/openai.yaml`. The Deepwright router is the only implicit skill. Markdown under `plugins/deepwright/skills/` is runtime instruction content: keep its playbooks, principles, and supporting references together.

Do not add hard-coded model IDs, hidden transcript paths, credentials, Cursor-only syntax, or undeclared MCP dependencies. Use `$skill-creator` for substantial skill changes. Keep supporting material inside the owning skill directory.

Keep user documentation in the root README and terminal reference, contributor checks here, and evaluation instructions in `evals/README.md`. Do not commit one-off agent transcripts, comparison diaries, or duplicate walkthroughs. Preserve all licenses and attribution notices.

## Automated checks

```bash
npm ci --prefix plugins/deepwright/skills/deepwright/scripts
npm audit --prefix plugins/deepwright/skills/deepwright/scripts --package-lock-only --audit-level=high
npm test
```

`npm test` runs package/documentation validation, helper typechecking/build/tests, evaluation fixtures, metadata contract controls, and run-evidence recovery tests. Commit rebuilt bundles when helper source changes; CI checks that rebuilding produces no differences. Metadata validation and terminal discovery share the same parser; positive and independently defective distribution fixtures must exercise both the validator and the installed bundle. CI also checks shell launchers and performs fresh Codex marketplace registration and plugin installation on Linux / Node 20.19.0 and macOS / Node 24.

A separate workflow job runs actionlint 1.7.12 from its pinned release archive, verified by SHA-256 before execution. When changing workflows, run the same version locally and retain the checksum check when updating it.

Keep tests and fixtures when pruning documentation. The CSV evaluation fixture is intentionally defective; its neutral contract remains beside it. Offline scorer/verifier tests check the tooling, not actual model behavior. Use the [evaluation protocol](evals/README.md) for live comparisons.

Validation excludes the root `.deepwright/runs/` scratch-evidence directory so retained logs and research cannot become distribution documentation. Authored documentation elsewhere, including `.deepwright/plans/`, untracked files, and similarly named nested directories, remains checked. Keep one authoritative plan for a release program and reference supporting receipts from it.

Match verification to the surface being shipped:

| Surface | Required evidence |
| --- | --- |
| Skill instructions and references | Package links/metadata, content snapshot, focused behavioral tasks with ordinary prompts, scope counterexamples, and independent artifact review |
| Optional Node helpers and bundled dependencies | Real command effects and failures, import/alias controls, typecheck, reproducible bundle, dependency audit, and license notices |
| Maintainer evaluation tools and fixtures | Independently correct and faulty controls, retained failures, host execution bounds, and no observer answers in candidate contexts |
| Host installation and activation | Supported isolated installation, native discovery with exact loaded contents, then a fresh task demonstrating invocation and sibling-reference access |

Treat these as separate evidence. A source-tree validator does not establish installed bytes, and a native discovery response does not establish that an agent followed a workflow. Match baseline and candidate host/model/permissions/fixture conditions; disclose supplied-instruction staging and unavailable native installation instead of promoting them to installation evidence.

For catalog maintenance, `npm run skills:stocktake -- snapshot` prints content fingerprints for maintained skill files; save snapshots outside the catalog, then use `compare <before.json> <after.json>` to select changes and dependent skills for review. It includes references, metadata, scripts, assets, and bundles; it excludes `.git` and `node_modules`. Review dynamic dependencies manually. `npm run eval:analyze -- <baseline/run.json> <candidate/run.json> [...]` groups failures from verified matched pairs without editing skills. Both repository tools are covered by `test:evals`; neither is an installed plugin command or a quality/promotion oracle.

## Static skill checks

CI also runs the base installation of [NVIDIA SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator) on all 47 bundled skills. Its source revision and Python dependencies are pinned in [.github/requirements/skillevaluator.txt](.github/requirements/skillevaluator.txt). This separate job runs without provider credentials or live-agent execution, preserves per-skill JSON/Markdown reports in the `skillevaluator-reports` artifact, and gates the release job alongside the existing checks.

| Check | What it contributes |
| --- | --- |
| Schema | Frontmatter, naming, structure, and instruction-body checks |
| PII | Pattern-based sensitive-data checks on supported text files |
| License | Detected per-skill license declarations; absent declarations remain warnings |
| Unicode | Hidden or suspicious Unicode payload detection on supported files |
| Quality | Heuristic scores for correctness, discoverability, reliability, and efficiency; minimum 90 per skill (grade A) |
| Lint | Advisory Python script checks; our Node and shell checks remain necessary |

The [policy overlay](.github/skillevaluator-policy.yaml) makes only missing per-skill author metadata advisory: the plugin manifest and distribution notices own attribution. Supplied author values still undergo format validation. Keep package license validation: SkillEvaluator does not establish that every skill inherits the correct plugin license. Its scores are editing signals, not measurements of agent usefulness; do not add boilerplate sections or invented metadata merely to raise them.

To reproduce the CI gate, use Python 3.13 in an isolated environment outside the checkout:

```sh
python3.13 -m venv /tmp/deepwright-skill-check-env
/tmp/deepwright-skill-check-env/bin/python -m pip install -r .github/requirements/skillevaluator.txt
PATH="/tmp/deepwright-skill-check-env/bin:$PATH" npm run check:skills
PATH="/tmp/deepwright-skill-check-env/bin:$PATH" python3 -m unittest discover -s scripts -p test_skillevaluator.py
```

Each default run creates a fresh report directory under the system temporary directory and prints its path. To inspect one skill or choose an output location, pass the target and a new directory:

```sh
PATH="/tmp/deepwright-skill-check-env/bin:$PATH" npm run check:skills -- plugins/deepwright/skills/spec /tmp/deepwright-spec-report
```

The integration tests run the real evaluator against valid and defective fixtures, including a valid skill below grade A, malformed frontmatter, hidden Unicode, excessive instruction context, an empty catalog, and a mixed passing/failing catalog. Nonzero exits remain failures; reports from earlier runs are never reused.

For dependency updates, change the reviewed upstream commit in [.github/requirements/skillevaluator.in](.github/requirements/skillevaluator.in), regenerate the lock with `uv pip compile --python 3.13 .github/requirements/skillevaluator.in --output-file .github/requirements/skillevaluator.txt`, then rerun both the fixtures and the full catalog. Review score and policy changes before raising the threshold.

The enabled subset excludes the external security scanners, LLM rubric scoring, semantic overlap, and live evaluation. A later live pilot needs reviewed tasks, confirmed plugin invocation and sibling-skill access, a restricted execution environment, and explicit provider/runtime configuration. Do not treat standalone skill staging as proof that Deepwright's plugin-qualified invocations work. See the [evaluation protocol](evals/README.md) for the independent behavioral evidence still required.

## Maintain Deepwright itself

The repository-local [maintainer skill](.agents/skills/deepwright-maintain/SKILL.md)
coordinates Reflect, scoped lessons, skill authoring, and evaluation. It is not
part of the distributed plugin and does not create a scheduler, collect hidden
history, or change the installed plugin cache. Keep its `agents/openai.yaml`
explicit-only policy; discovery settings do not grant write permission.

From a fresh supported Codex session in this development checkout:

```text
$deepwright-maintain audit this checkout and the evidence I supply. Propose one justified improvement or return no change. Do not edit or publish.
```

Implementation, commits, publication, and installation retain their separate
authorization boundaries. The maintainer must preserve inherited work and use
an isolated candidate for authorized repairs. Missing live execution means
behavior unverified, not improved. Explicit invocation and behavioral outcomes
still require qualification in the actual host.

With the pinned SkillEvaluator environment active, check the local skill with:

```sh
npm run check:skills -- .agents/skills/deepwright-maintain
```

CI runs this static check separately from the bundled catalog and retains both
sets of reports. `npm test` does not include the SkillEvaluator gate. Static
scores do not establish routing, scope compliance, or successful self-repair.

The [maintenance evaluation plan](evals/maintenance-evaluation-plan.md) is for
independent evaluators, not a runtime skill reference. Its scenarios are proposed,
not executed fixtures. Do not inject it into candidate contexts; keep observer
resources inaccessible through host-enforced boundaries. A separate directory
alone is not isolation. Implement the live execution path and adversarial checks
before relying on automatic promotion; do not weaken the existing full-corpus
scorer to accept a partial maintenance trial.

## Manual release checks

Automated CLI installation does not exercise the desktop UI, confirm model availability, or prove skill activation in another session.

### Exact native catalog and package contents

Where an authorized host exposes Codex's native `skills/list` method, save the actual request for one explicit project cwd and its complete matching JSON-RPC response. Use a frozen expected package separately from the installed package:

```sh
npm run verify:installed -- --request /absolute/evidence/request.json --response /absolute/evidence/response.json --cwd /absolute/project --plugin-id deepwright@deepwright --expected-plugin /absolute/frozen/plugins/deepwright
```

The request must use `method: "skills/list"`, a string or integer `id`, and `params.cwds` containing exactly the expected cwd; optional `forceReload` is boolean. The response must have the same id and exactly that cwd in `result.data`. The verifier checks loading errors, enabled plugin-qualified skills, plugin identity, descriptions, and native skill paths. It derives one independent loaded package root and compares every regular file, including manifest, references, assets, bundles, and licenses; only `.git` and `node_modules` directories are excluded. Symlinked package contents, overlapping source/loaded roots, duplicate or missing skills, and different bytes fail closed.

Exit 0 means the saved catalog and current package bytes match, 1 means a mismatch, and 2 means invalid or unavailable evidence. JSON inputs are limited to 8 MiB each; each package tree to 64 MiB and 10,000 files. This read-only repository helper neither installs the plugin nor obtains/authenticates native responses. Its synthetic controls establish verifier behavior only. If native capture or a supported isolated installation is unavailable, record that gate as unverified. Separately observe a fresh task's invocation and sibling-file access; matching catalog bytes do not prove either.

### CLI and discovery

From a checkout whose path contains spaces, exercise the no-argument start page, `skills review --compact`, `playbooks performance`, `skill interrogate`, `invoke interrogate`, `config show`, `config check`, and `status --json` through the bundled helper. Confirm that absent configuration uses defaults and malformed TOML fails without printing its contents.

In fresh CLI and desktop sessions, verify that the printed CLI token and desktop display name resolve. Confirm that a trivial question does not start a broad workflow and a diagnosis-only task does not edit files. See the [terminal reference](docs/TERMINAL.md) for command contracts.

### macOS desktop

1. Clone into a fresh path, open it as a Codex project, restart the app, and install from the repository marketplace.
2. Confirm the Investigator Owl identity and the displayed Deepwright and Owl skills. In a new chat, use the `@` picker for a harmless inspection with no editing.
3. In a separate bounded prompt, request one reversible change and verify the actual result and reported evidence.
4. Disable and re-enable the plugin; confirm skills disappear and return.
5. Update the checkout, restart, complete any offered update or reinstall, and start a new chat. Confirm the intended version is visible.

### Capability fallbacks

GitHub work prefers an available connector, then authenticated `gh`; missing access must be reported rather than invented. Delegation uses host-exposed capabilities and falls back to disclosed sequential work. Unconfirmed model overrides inherit the parent model.

The core skills do not require Node; optional helpers require Node 20.19+. AGENTS.md and CLAUDE.md exports are pointers, not native installations. Verify path accessibility and instruction loading in the target host before claiming cross-host support.

## Release and publication

The existing main-branch workflow publishes a new manifest version only after both platform jobs, static skill quality, and workflow lint pass. Keep repository and plugin versions aligned and provide a matching changelog section when making a release. Do not move previously published version tags.

Before changing repository visibility, review Git history, branches, tags, releases, and discussions for material not intended for publication. Deleting a file from the current tree does not remove its historical copies. Visibility changes and history rewrites are separate operations from a documentation cleanup.
