---
name: principle-experience-first
description: "Optimize product choices for the user's experience."
license: MIT
disable-model-invocation: true
---

# Experience First

## Purpose

Judge a product or API decision by the person completing the task. For a UI that is the end user; for a library it includes the developer importing it and the maintainer who must understand it later.

## Instructions

- Name the central workflow and the friction the change should remove. Prefer an observable outcome, such as recovering from an invalid configuration without losing work, over a vague goal of delight.
- Make every added feature, control, or option earn its place in that workflow. Preserve the user's stated requirements while reducing unnecessary steps and choices.
- Compare user impact with implementation and maintenance cost. Accessibility, reliability, performance, and clear failure recovery are part of the experience.
- Prototype when interaction behavior is uncertain. For API work, a realistic calling example can reveal friction before implementing an abstraction.
- Check the core path and relevant loading, empty, error, and recovery states. Polish details that affect understanding or task completion, then stop at the requested scope.

- Use the requested task as the acceptance check: can the intended person finish it and recover from a failure with the information the product provides?

## Examples

A command fails with `invalid config` after five minutes of processing. Validate the configuration before expensive work and report the field, accepted format, and next action. Preserve the configuration file instead of silently replacing it with defaults.

Expected outcome: a developer can correct the problem from the error message and rerun successfully. Verify the invalid-input path and a valid configuration, including a path containing spaces.

## Limitations

Visual polish does not justify losing data, excluding keyboard users, changing the requested product direction, or creating disproportionate maintenance cost. If a preferred interaction would violate an essential constraint, explain the tradeoff and choose a workable experience. [Foundational Thinking](../principle-foundational-thinking/SKILL.md) helps sequence supporting work; this principle defines the target.
