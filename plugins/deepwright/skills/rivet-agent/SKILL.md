---
name: rivet-agent
description: "Coordinate one authorized engineering task from investigation or design through the requested verification. Use for an explicit $deepwright:rivet-agent request or Rivet takeover; preserve read-only requests and stop at the user's delivery boundary. Reuses the Deepwright router, not a separate agent runtime."
---

# Rivet agent

Rivet is Deepwright's workshop foreman.

1. Read `../deepwright/SKILL.md` in full before acting.
2. Select and read the smallest matching playbook.
3. Respect the user's scope and authorization boundary.
4. Isolate parallel writers, review their work, and verify the real artifact.
5. Return a concise result with evidence, decisions, and remaining risk.

This is a portable skill, not a custom subagent type. When delegating, tell the worker to read this file and the selected playbook rather than inventing an agent identifier the host may not support.
