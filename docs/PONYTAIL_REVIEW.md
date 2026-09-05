# Selective Ponytail review

Reviewed 2026-09-04. Deepwright baseline: [`981b863`](https://github.com/aj2666/deepwright/tree/981b863be15112d4ab7e45157634967ef33cca2b). Ponytail source: [`974d940`](https://github.com/DietrichGebert/ponytail/tree/974d940a1c5344210874150b98ff0d2c861fab6a). Findings below distinguish inspected code from executed checks. Ponytail code and hosted agents were not executed; no Ponytail implementation was copied.

The implementation also preserves the subsequent Investigator Owl branding from Deepwright [`014aa56`](https://github.com/aj2666/deepwright/commit/014aa56003aeb182f288cbbcaebd4c1ceb417ea7). Its assets are unchanged by this work.

## 1. What our system already does well

- **Progressive disclosure:** 46 standard skills, 23 routed playbooks and 21 principles. One implicit router, 45 explicit leaves. The router selects one playbook rather than loading the whole library. Existing compatibility validation enforces this policy.
- **Single workflow architecture:** Rivet is already a thin pointer to the router. Task-specific skills add useful specialization, not competing top-level runtimes.
- **Task-scoped authority:** diagnosis and review do not authorize fixes; editing does not imply permission to deploy, merge, message people or change accounts. Read-only leaves carry explicit boundaries.
- **Delegation with ownership:** isolated writers, capability-aware model inheritance, bounded concurrency, independent review and disclosed sequential fallbacks. Existing reviewer templates are embedded into worker briefs when paths are inaccessible.
- **Verification:** real-artifact proof and a blinded evaluation playbook. The baseline helper suite passed 127 tests across eight files locally; this establishes helper behavior, not LLM routing accuracy.
- **Portable packaging:** committed Node bundles, no runtime dependency installation, symlink-launcher tests, Linux/macOS CI and real Codex plugin-installation smoke. Desktop interaction remains a manual check.
- **Small configuration and honest integration:** optional project-local TOML, no invented model IDs, connector-first GitHub access and graceful degradation. There is no unnecessary daemon or MCP process.

The main gaps were searchable discovery, invocation guidance, explicit negative triggers, local config visibility and a committed skill-evaluation corpus. These do not require replacing the architecture.

## 2. Useful ideas to adopt

| Area | What Ponytail actually provides | Selective Deepwright decision |
|---|---|---|
| Six-skill structure | A main persona plus review, audit, debt, gain and help; the latter surfaces are focused and mostly one-shot. | Adopt clear entry points and discoverable help, not the number six. Expose all existing skills through metadata search. |
| Mode handling | Explicit mode names, deactivation commands and separation of one-shot help/report skills. | Make task boundaries and stop behavior explicit; retain task-local routing instead of a persistent persona. |
| Terminal invocation | Host-specific command and alias conventions. | Print exact Codex prompt/picker guidance and opt-in instruction-file pointers; never execute model or shell commands. |
| Lifecycle hooks | Activation and prompt hooks, bounded input handling and host-specific output formats. | Learn the boundary-testing discipline; preserve existing pause/resume playbooks without installing hooks. |
| Subagent propagation | A dedicated worker hook because parent activation may not carry over. | Add one shared filled-and-embedded worker contract, including scope, resolved inputs, capabilities and verification. |
| AGENTS.md fallback | Compact policy available to agents without native skill loading. | Print a pointer to the canonical skill; do not maintain another full policy body or overwrite instructions. |
| Cross-agent adapters | Reuse of core instruction builders and aliases, alongside host-specific integration code. | Translate only discovery, invocation and paths. Do not build a second runtime. |
| Lightweight config | Small defaults with documented resolution behavior. | Keep existing optional TOML; expose file presence. Defer runtime decoding rather than add a partial parser or another config hierarchy. |
| Status visibility | Current/default mode and active indicators, especially in Pi. | Report what the helper can observe; explicitly leave host activation, model availability and MCP state unknown. |
| MCP | Read-only instructions through a prompt and tool using the shared builder. | Keep it a possible future transport seam, not a dependency for current native-skill users. |
| Tests | Boundary regressions, rule-copy checks, known-good/bad grader examples. | Add CLI/adapter contracts and self-tested, fail-closed receipt scoring. |
| Benchmarks | Recorded outcomes, correctness/completeness gates and candid disclosures of confounded or neutral results. | Preserve isolated inputs and artifacts; gate efficiency on correctness and authority. Claim no performance gain without measurement. |

Source details: [six-skill help](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/skills/ponytail-help/SKILL.md), [root triggers](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/skills/ponytail/SKILL.md), [shared builder](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/hooks/ponytail-instructions.js), [worker hook](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/hooks/ponytail-subagent.js), [Pi adapter](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/pi-extension/index.js), [configuration](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/hooks/ponytail-config.js).

## 3. Ideas not to adopt

**Persistent global modes and automatic reactivation.** The hook runtime and OpenCode use host-wide flag files rather than session-keyed state. Session-start activation resets the configured default. Bare invocation also has different semantics across adapters. These are code-derived concurrency/consistency risks, not executed reproductions. Deepwright needs neither sticky intensity levels nor an every-turn persona. [Runtime state](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/hooks/ponytail-runtime.js), [activation](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/hooks/ponytail-activate.js), [mode tracker](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/hooks/ponytail-mode-tracker.js).

**Copied rule trees or broad host claims.** Ponytail checks several compact copies against AGENTS.md, but checks only selected invariants against its longer runtime skill. Generating pointers avoids that drift class. Synthetic protocol tests are not proof of live integration in every supported host. Deepwright will not promise native cross-agent plugin installation from a text adapter. [Rule-copy checks](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/scripts/check-rule-copies.js), [portability notes](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/docs/agent-portability.md).

**MCP solely for static instructions.** Ponytail's own MCP documentation says that exposing instructions does not guarantee automatic activation. Deepwright already has native skills and existing connectors. A future MCP-only consumer would justify a small read-only adapter; no current need justifies the server and dependencies. [MCP README](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/ponytail-mcp/README.md), [implementation](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/ponytail-mcp/index.js).

**Optimizing for deletion or line count as a universal objective.** Keep Deepwright's correctness, maintainability, accessibility and real-verification criteria. Do not replace established test suites with a universal one-check minimum or reduce the skill library merely to resemble another project.

**Copying the benchmark engine or its headline savings.** Some Ponytail gates execute artifacts; others use keyword/structural checks. Unknown probes can be treated as skipped passes. Its agentic runner uses a specific provider CLI and permission configuration, not Deepwright's actual workflow. These are not comparable general productivity measurements. [Behavior checks](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/benchmarks/behavior.js), [correctness checks](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/benchmarks/correctness.js), [runner](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/benchmarks/agentic/run.py).

The agentic methodology discloses a globally installed hook that contaminated an earlier baseline; later isolation addressed it. The focused June 22 report found the reuse behavior already successful in both arms, leaving that change's benefit unproven. Adopt this reporting honesty, not the savings numbers. [Methodology](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/benchmarks/agentic/README.md), [focused results](https://github.com/DietrichGebert/ponytail/blob/974d940a1c5344210874150b98ff0d2c861fab6a/benchmarks/results/2026-06-22-issue-245-217-comprehension.md).

## 4. Smallest architecture changes

The primary path remains **Codex plugin → Deepwright/Rivet → selected playbook → explicit skills**.

1. Extend the existing optional terminal entry point with metadata-derived `skills`, `skill`, `invoke` and `status`. Keep `doctor`, orchestration and PR watching intact.
2. Tighten the one implicit router's description with natural engineering phrases and negative cases; clarify read-only and stop boundaries. Do not enable implicit invocation for all leaves.
3. Share one small worker-handoff reference between the router and Swarm. Preserve existing specialized reviewer templates and intentional self-contained safety clauses.
4. Print opt-in AGENTS.md/CLAUDE.md pointers to canonical files. No automatic writes, new host plugins, generated skill copies, persistent state or configuration hierarchy.
5. Add a separated prompt/rubric corpus, strict offline receipt scorer, and regression tests. Keep CI installation smoke and manual desktop checks. Validate work branches without releasing them.

See [terminal usage](TERMINAL.md), [evaluation protocol](../evals/README.md) and [compatibility limits](COMPATIBILITY.md). OpenAI's [skill documentation](https://learn.chatgpt.com/docs/build-skills) supports metadata-driven selection, progressive loading and separate CLI/desktop invocation surfaces; its [evaluation guidance](https://developers.openai.com/blog/eval-skills) emphasizes observed behavior and artifacts.

This change does **not** establish improved model trigger accuracy, cross-host execution parity, macOS desktop behavior, or cost/latency savings. Contract tests and a small forward check establish narrower facts. Those broader claims require isolated live-host evaluation using the committed protocol.

Local verification for this change: 178 helper tests (including 51 new discovery regressions), seven offline scorer tests, TypeScript checks and 46-skill compatibility validation passed. Rebuilding the three committed bundles produced identical hashes; orchestration and PR-watcher bundles are unchanged from the baseline. Two [bounded forward checks](../evals/FORWARD_CHECK.md) exercised diagnosis-only and independent-worker behavior. Review caught and corrected repeated-space path corruption and silently truncated metadata. The first macOS CI run also exposed a test fixture's unresolved `/var` versus canonical `/private/var` assumption; the expectations were corrected and an explicit symlink-root regression added without weakening the helper's canonical-path contract.
