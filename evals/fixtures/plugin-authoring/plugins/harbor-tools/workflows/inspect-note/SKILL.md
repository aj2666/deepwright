---
name: inspect-note
description: "Explain a supplied note's save path and available evidence without editing. Use for an explicit inspect-note request."
license: MIT
---

# Inspect a note

Trace the supplied note from the user action to storage and the displayed
result. Use the current request, named source files and provided receipts;
missing source or execution evidence stays unavailable.

Read the relevant functions and callers, identify the state transition, and
cite the boundary that establishes the explanation. A unit test's assertion
shows what it would check, not that it has executed. Keep this workflow
read-only and do not run commands or fix the application.

Return the save path, supporting file pointers, unresolved observation, and
the smallest check that could resolve it. If the request is to implement or
verify a fix, preserve that different task's authority instead of silently
starting it from this inspection.
