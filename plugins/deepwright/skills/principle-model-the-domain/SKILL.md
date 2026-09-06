---
name: principle-model-the-domain
description: "Encode domain rules in explicit structures and types. Use for $deepwright:principle-model-the-domain."
license: MIT
---

# Model the Domain

## Purpose

Represent domain rules in a data structure owned by one part of the system, instead of scattering the same knowledge across conditionals and synchronized flags.

## Instructions

- Identify what the system must never allow and how consumers read and update the data. Repeated shape assumptions, growing branch chains, and booleans that must change together are useful signals.
- Choose the smallest structure that removes the specific complexity: a state machine for transitions, a typed model for shared invariants, a lookup table for declarative policy, or a queue/index for the access pattern.
- Make ownership follow domain knowledge rather than execution steps. Separate load/validate/save modules are unhelpful when each repeats the same rule; they can be useful boundaries when they own distinct mechanisms.
- Keep behavior near the model that owns it and expose the operations callers need. Use a reducer or command model when it makes legal state changes explicit, not simply because events might be useful later.
- Check the representation against current requirements and meaningful failure cases. Migrate affected callers coherently and keep validation at entry points for external data.

- Use a representative caller to check whether the model actually reduces decisions. If callers still recreate the old branch chain, move the rule to its owner or reconsider the abstraction.

## Examples

A download is modeled with `started`, `finished`, and `failed` booleans. Replace conflicting combinations with `queued`, `running`, `succeeded(result)`, or `failed(error)`, and make transitions explicit in the download owner.

Expected outcome: the UI handles one state at a time, success requires a result, and tests reject a second completion after failure. Add a cancelling state only if cancellation is actually supported.

## Limitations

Keep clear, local conditionals when they already describe the domain well. A structure earns its cost by removing duplicated rules, invalid states, branching, or lifecycle risk. If a registry requires callbacks and special cases for every entry, an ordinary function or explicit match may be clearer. Do not add a generic engine to solve one bounded workflow.
