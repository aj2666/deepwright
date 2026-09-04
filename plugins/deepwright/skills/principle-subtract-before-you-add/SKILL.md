---
name: principle-subtract-before-you-add
description: "Remove dead weight before adding new structure. Use for $deepwright:principle-subtract-before-you-add."
---

# Subtract Before You Add

When evolving a system, remove in-scope complexity first, then build. Deletion gives you a simpler base, which makes the next addition smaller and less brittle.

**Why:** Adding to a complex system compounds complexity. Removing first cuts the surface area, reveals the essential structure, and usually makes the next design obvious. Default to subtraction.

Make simplification a continual investment inside the requested change. Preserve pre-existing user work, public behavior, data, compatibility promises, and files outside the authorized scope. Report broader deletion opportunities instead of taking them silently.

**The pattern:**
- Sequence proven, authorized removal before construction
- Cut before you polish (get to the minimum before investing in quality)
- Design for observed usage, not speculative edge cases
- No speculative validators, parsers, or guards beyond what the spec demands
- Out-of-spec features drag validators behind them. Persistence, retry-on-startup, and schema migration each need guards to defend their inputs.
- Simplify prompts (remove redundant instructions, excessive templates)
- When an in-scope reference has no novel content and no supported consumer, remove it rather than leaving a stub
