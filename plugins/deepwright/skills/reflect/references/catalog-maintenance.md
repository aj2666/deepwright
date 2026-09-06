# Review an authorized skill catalog

Use when the user asks to assess or maintain a named catalog. Restrict reads to that catalog and supplied evaluation or usage evidence. Do not enumerate personal skill directories, other projects, or private histories to invent a usage score.

For a first review, inspect the catalog's discovery metadata and the relevant bodies and references. For a repeat review, compare file contents, including reference files, agent metadata, scripts, and assets. A changed timestamp alone is not a content change. Account for added and deleted files, removed skills, and dependent skills whose guidance points to changed material.

Repository maintainers can use the print-only `scripts/skill-stocktake.mjs` tool: `snapshot [plugin-root]` emits content fingerprints; `compare <before.json> <after.json>` names additions, removals, changes, and transitive dependents. Save snapshots outside the catalog. This repository tool excludes `.git` and `node_modules`, includes maintained bundles, and recognizes local Markdown links and explicit Deepwright invocations. Dynamic or prose-only dependencies still need manual inspection. It does not measure instruction quality, freshness of external facts, or actual use.

Review the selected skills for a discriminating trigger, fit to actual supported capabilities, decision-changing instructions, current reference validity, and overlap with another skill's purpose. Verify claims against accessible sources when they can have changed. Shared vocabulary alone does not establish duplication; skills may serve different tasks or authority boundaries.

Return a proposal table with the skill, disposition, evidence, and precise suggested action:

| Disposition | When justified |
| --- | --- |
| Keep | Purpose and guidance remain useful within the inspected scope |
| Improve | A demonstrated routing, clarity, or behavior problem needs a focused correction |
| Update | A changed capability, dependency, or reference invalidates specific guidance |
| Merge | Two skills duplicate the same task and their callers can retain a clear route |
| Retire | The capability is obsolete or superseded, with identified callers and a migration path |

Missing usage data is unknown, not unused. Static scores are editing signals, not proof of usefulness. Do not rename, delete, merge, reinstall, or rewrite skills from a read-only stocktake request. For already approved catalog changes, preserve invocation names by default and check callers, references, packaging, and affected behavioral cases before reporting completion.
