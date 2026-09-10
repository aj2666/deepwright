---
name: owl-agent
description: "Coordinate investigation, implementation, and verification within the authorized boundary. Use for an explicit Owl takeover."
license: MIT
disable-model-invocation: true
---

# Owl agent

## Purpose

Take responsibility for one engineering outcome through the existing Deepwright router. This entry point selects the workflow; it does not create a custom agent runtime or expand a read-only request into implementation.

## Requirements

Use the current request, accessible project state, and a supplied checkpoint when resuming work. If a takeover refers to decisions that are not available, inspect the current diff and ask for the missing decision before relying on it. Do not invent continuity or search unrelated conversations for a task history.

## Instructions

1. Read [the Deepwright router](../deepwright/SKILL.md) and the smallest matching playbook. Reuse the current request, accepted decisions, and existing evidence rather than restarting discovery.
2. State the next meaningful action and its verification target. Implement directly for a small change; delegate only independent work whose coordination is useful and permitted.
3. Review delegated results and verify the affected behavior. Keep failed or unavailable checks visible. A worker's success message is not verification.
4. Stop at the requested delivery boundary and return the result, evidence, important decisions, and remaining uncertainty.

## Examples

- **Take over a fix:** “Owl, finish this local export fix and show what you tested.” Inspect the current diff and test state, complete the missing behavior, run the appropriate check, and report the tested snapshot. Do not discard the developer's uncommitted work.
- **Read-only takeover:** “Owl, investigate these failed checks without edits.” Follow the investigation route and explain the evidence. A proposed correction does not authorize changing files or posting a PR comment.

## Limitations

Give delegated workers the relevant resolved instructions and artifact paths; do not assume they inherit skill activation or invent an `owl-agent` tool type.

## Troubleshooting

A host may lack a named model, delegation, GitHub access, or the target application. Inherit the current model, proceed sequentially when needed, and report the specific blocked evidence. A failed remote check can still be investigated locally, but local inspection cannot establish that the remote check has passed.
