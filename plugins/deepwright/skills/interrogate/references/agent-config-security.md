# Review agent configuration and executable extensions

Use when the requested review changes an agent's configuration, skills, hook commands, plugins, tool-server launchers, or permissions. Review only the named project or supplied configuration. Do not inspect personal directories or unrelated histories, launch extensions, install a scanner, or apply suggested fixes as a side effect of review.

## Trace authority and data movement

Identify the active host and supported configuration schema before interpreting a field. Distinguish documented host enforcement from prose asking an agent to behave. A parser accepting a preference does not prove that another session loaded it or that the host enforces it.

Trace each relevant path from its untrusted input to execution or an external destination. Look for shell interpolation of filenames or tool output, instructions that treat retrieved text as authorization, overly broad writable roots, privilege changes, and commands that read more than the task requires. Resolve whether a suspicious instruction is active configuration, an inert example, a quotation, or a test fixture before reporting a reachable defect.

For executable packages or tool servers, inspect source identity, version selection, installation-time scripts, declared permissions, and access to credentials. A floating download or install-and-run launcher adds a supply-chain boundary; a pinned version improves reproducibility but does not establish trust. Prefer the project's reviewed installation path. Do not fetch or execute unreviewed code to complete the audit.

Inspect changed logging, tracing, uploads, and retention for exposure of credentials, private prompts, or unrelated files. Report the field or source location with sensitive values redacted. Do not copy a secret into the finding, test fixture, issue, or PR. Credential rotation and external incident response need their own authorization.

## Avoid false security verdicts

Missing hooks, an absent model override, or a legitimately required shell tool are not vulnerabilities by themselves. Establish the unexpected capability, reachable input, and protected effect. A scanner grade, clean grep, or a configuration syntax pass is not proof of safety. Scanner output can support a finding only within its actual scope and version; missing tools or unsupported fields remain evidence gaps.

For each actionable finding, return the source location, trigger, trust boundary crossed, plausible consequence, and smallest corrective proposal. Include counterevidence such as host-enforced isolation or literal argument passing. Separate confirmed source defects from risks that need host validation. A no-finding result may still have incomplete coverage.

Example: a hook interpolates a changed filename into a shell command. Trace whether the host supplies arbitrary filenames and whether the command treats them as shell syntax. Propose literal arguments or a reviewed equivalent. Do not execute a malicious filename or modify permissions during a read-only review.
