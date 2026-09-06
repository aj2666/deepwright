---
name: principle-prove-it-works
description: "Verify behavior against the real artifact. Use for $deepwright:principle-prove-it-works."
license: MIT
---

# Prove It Works

## Purpose

Verify the requested behavior through the actual artifact or closest authorized execution path. Compilation, a delegate's summary, or an output timestamp may support a check but does not establish the user-visible outcome by itself.

## Instructions

- Translate the requested outcome into observable evidence. For a bug, reproduce the relevant failure when practical; for a generated artifact, inspect the output the user will receive.
- Choose a proof proportional to the change. Reuse focused checks first, and add broader execution only when changed behavior, failures, or unresolved risks justify it.
- Identify effects before running a proof path: local writes, credentials, network access, messages, billing, shared data, and cloud resources. Prefer isolated fixtures, a local service, sandbox, or dry run when they prove the required behavior.
- Observe the chain from input to output and verify relevant authorized side effects. Check process liveness directly and read actual values rather than assuming derived state is current.
- When a result conflicts with expectations, inspect both the observation method and the system. Confirm that the test used the intended revision, inputs, and artifact before drawing a conclusion.
- Inspect delegated output directly through its diff, contents, or runtime behavior. Keep the evidence visible and distinguish verified results from remaining assumptions.
- If the closest real path needs unavailable infrastructure or new permission, use the strongest safe proof and name the remaining validation gap. Missing authority does not become permission to test against live data.

## Examples

A CLI fix claims to support configuration paths containing spaces. Build the CLI if required, create an isolated fixture named `sample config.json`, and run the actual command against it. Assert the parsed output and exit status; also run malformed input and inspect its error.

Expected outcome: the real executable accepts the valid path and rejects invalid content clearly. A unit test of an internal parser alone would leave command-line argument handling unverified.

## Limitations

Do not add tests that merely mirror the implementation or repeat a passing suite without a reason. No finite check proves every behavior; state coverage accurately. A deterministic scratch check can suffice for analysis-only work. Add repository tooling only within write scope, and commit proof only when commits are authorized; use [Show Me Your Work](../show-me-your-work/SKILL.md) when a complex delivery needs that audit trail.
