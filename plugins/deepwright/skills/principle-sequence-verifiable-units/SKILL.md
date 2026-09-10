---
name: principle-sequence-verifiable-units
description: "Use when planning a migration, sweep, or feature; order coherent, independently checkable units so failures are localized before dependent work."
license: MIT
disable-model-invocation: true
---

# Sequence Work into Verifiable Units

## Purpose

Order a migration, sweep, or feature into coherent units with meaningful checks. Localizing a failure before building on it makes execution and review easier.

## Instructions

- Record the starting revision when changes need before/after comparison. Protect pre-existing user work and keep the original task's scope visible.
- Choose a unit that ends in a checkable state: one behavior with its test, a coupled API-and-callers migration, or a bounded batch produced by one deterministic transformation.
- Verify a completed unit before starting work that depends on it. Investigate unexpected failures rather than carrying them forward as unexplained background noise.
- Scale checks to the unit. Do not demand a full suite after each line or break a coherent edit into artificial fragments. For a repeated transformation, verify representative cases before widening and check the affected batch afterward.
- When commits or pull requests are authorized, order them so a reviewer can understand the proof. A reproducer followed by a fix, or a baseline followed by a treatment, can be useful when the repository's delivery rules permit it.
- Without delivery authorization, keep the same logical sequence in local edits and evidence. Rebase only when history rewriting is permitted and uncommitted work is protected.

## Examples

A migration changes a parser's return type and five dependent callers. Treat the type and tightly coupled callers as one unit, then run the type checker and parser/consumer tests. Move the independent formatting cleanup into a later unit.

Expected outcome: a parser regression is found before the cleanup obscures it, and the completed migration can be reviewed as one behavior change. Running the full suite after every temporarily broken call-site edit would not add useful evidence.

## Limitations

Some valid units are larger than one file and some intermediate states cannot compile. [Outcome-Oriented Execution](../principle-outcome-oriented-execution/SKILL.md) covers planned local instability. Do not ship or declare completion with unexplained failures. Use [Prove It Works](../principle-prove-it-works/SKILL.md) for the proof path and [Build the Lever](../principle-build-the-lever/SKILL.md) when automation makes repeated checks reliable.
