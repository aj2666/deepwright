# Changelog

## 1.3.0 — 2026-09-05

- Rename Deepwright's engineering foreman from Rivet to Owl so the router matches the Investigator Owl product identity.
- Replace the explicit `$deepwright:rivet-agent` skill with `$deepwright:owl-agent` and update plugin prompts, desktop display metadata, and user documentation.
- Preserve the existing evidence-first routing, authorization, delegation, and verification behavior while changing the public name.

## 1.2.0 — 2026-09-05

- Update the Vitest development dependency to 4.1.11 to resolve its critical security advisory; gate CI on high and critical dependency-audit findings.
- Apply the shared configuration contract to every direct skill consumer; preserve fixed review lenses and remove duplicated configurable defaults.
- Require both bundled dependency licenses and their NOTICE references during package validation.
- Add a compact terminal start page, all-term metadata search, compact results, and playbook browsing derived from the existing router table.
- Validate optional project TOML with a pinned bundled parser; expose read-only show/check/template commands, default/project provenance, and versioned status without model-availability claims.
- Share configuration rules across Setup, the router, Swarm, and Architect; preserve inspection-only boundaries and workflow requirements.
- Add artifact sealing, digest verification, matched-run comparison, regression reporting, and correctness-gated efficiency metrics without launching models.

## 1.1.0 — 2026-09-05

- Add read-only terminal skill search, details, invocation guidance, and local status derived from canonical skill metadata.
- Offer print-only AGENTS.md and CLAUDE.md fallback pointers without installing adapters or duplicating skill logic.
- Clarify positive and negative router triggers, task-local scope, and explicit worker propagation; retain all 46 skills and the single implicit router.
- Add shared worker handoff guidance, discovery regressions, and a fail-closed offline evaluation-receipt scorer with a separated prompt/rubric corpus.
- Document the selective Ponytail review, configuration and status limitations, and honest benchmark methodology.
- Check work branches in CI without publishing a release; main-only release gates remain unchanged.

## 1.0.1 — 2026-09-04

- Use canonical plugin-qualified names for every bundled cross-skill invocation.
- Correct pending-CI handling, pull-request identity resolution, and orchestration lock takeover.
- Harden stacked-PR verification against fork collisions, mid-sweep head changes, malformed API data, deadline overruns, and terminal control sequences.
- Serialize concurrent ledger mutations and drain admitted writes before releasing a store lock.
- Make installed command wrappers safe when invoked through package-manager symlinks.
- Set Node 20.19.0 as the tested minimum for optional helper tooling.
- Align the documented orchestration schema with the bundled helper implementation.
- Clarify CLI reinstall, fresh-session, and macOS desktop `@` invocation flows.
- Publish a version tag and GitHub release only after both compatibility jobs pass.

## 1.0.0 — 2026-09-04

- Launch Deepwright and the Owl engineering foreman.
- Convert the upstream workflow into 46 standard Codex skills and 23 routed playbooks.
- Add Codex plugin and marketplace manifests for CLI and desktop discovery.
- Replace Cursor-specific agents, commands, models, transcript paths, and automation.
- Port optional orchestration and PR-watching tools from Bun to Node 20+.
- Add macOS and Linux validation, installation smoke tests, documentation, and native branding.
