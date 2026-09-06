---
name: principle-fix-root-causes
description: "Reproduce symptoms and fix their underlying mechanism. Use for $deepwright:principle-fix-root-causes."
license: MIT
---

# Fix Root Causes

## Purpose

Trace a reported symptom to the mechanism that produces it and fix that mechanism within scope. Keep mitigations distinct from confirmed fixes so workarounds do not quietly become permanent architecture.

## Instructions

- Capture expected and observed behavior, inputs, environment, and a reproducible case when available. If a production-only issue cannot be reproduced locally, use logs or traces to state a testable hypothesis and its uncertainty.
- Follow the data and control flow to the failed invariant. Add focused instrumentation when evidence is missing; avoid speculative changes that make the symptom disappear without explaining it.
- Distinguish a necessary boundary guard from a symptom patch. A null check is correct when absence is allowed; it hides a defect when ownership requires the value to exist.
- Test that the fix addresses the original case and a neighboring valid case. Search for the same mechanism elsewhere, fixing only in-scope occurrences and reporting the rest with evidence.
- For restart failures, inspect persisted config, caches, locks, serialized state, and startup ordering. Reproduce with the affected state in isolation before changing or clearing it.
- If urgent containment is needed, apply an authorized reversible mitigation and describe what remains unproven. Do not delay recovery solely to achieve a perfect explanation.

## Examples

An app fails only after restart with a missing-field error. A fixture copied from the previous schema reproduces it; a fresh fixture does not. Add a version-aware parser or supported migration at startup, preserving a useful error for unsupported future versions.

Expected outcome: the old fixture loads correctly after repeated restarts, current state still works, and corrupt state fails clearly. Deleting the user's cache is unnecessary and would remove the evidence.

## Limitations

There may be several interacting causes, and a single root cause may remain uncertain. Report that uncertainty instead of treating a plausible story as proof. Do not log credentials or erase live state to gather evidence. A long comment may explain a real external constraint; its length alone does not prove the implementation is wrong.
