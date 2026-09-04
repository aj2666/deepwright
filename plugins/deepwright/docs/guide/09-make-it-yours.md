# Make Deepwright yours

Deepwright is a workflow plugin; Rivet is its opinionated foreman. You can keep
the routing and verification machinery while replacing preferences that should
be personal or project-specific. Model overrides are optional: workers inherit
the current Codex model unless the active host confirms another available
choice.

## Draft a mode with `$deepwright:automate-me`

```text
$deepwright:automate-me use this conversation and the examples I provide to draft my engineering mode.
```

[`$deepwright:automate-me`](../../skills/automate-me/SKILL.md) can extract repeated
preferences from the current conversation, user-supplied examples, repository
skills under `.agents/skills/`, and task evidence under
`.deepwright/runs/<run-id>/`. If an authorized Personal Context source is
available, you may explicitly include it. The skill must not assume that hidden
chat files or a client-specific history directory can be read.

Review the proposed preferences before writing them. Keep a preference only
when it would change a future decision, and label weak evidence as a question
rather than a rule. Use `$skill-creator` to build an approved repository skill
under `.agents/skills/<name>/`, or a personal skill under
`$HOME/.agents/skills/<name>/` only when that scope is explicitly requested.
Then validate it in a fresh task.

To update a mode later, provide the new evidence directly:

```text
$deepwright:automate-me update my mode from this conversation and .deepwright/runs/<run-id>/decisions.md. preserve rules not contradicted by new evidence.
```

## Capture a task's lessons with `$deepwright:reflect`

After a task exposes a reusable lesson:

```text
$deepwright:reflect identify the decisions that made this migration slow and propose structural safeguards. do not edit skills yet.
```

[`$deepwright:reflect`](../../skills/reflect/SKILL.md) reviews observable task evidence:
the current conversation, repository changes, commands and checks, decision
notes, and supplied subagent summaries. It sorts proposals into `Accepted`,
`Rejected`, and `Backlog`. Use available Codex subagents for independent review
when capacity exists; otherwise perform the passes serially. Reviewers inherit
the parent model unless the host confirms an override.

Approval of a lesson is not approval to edit a skill, push a branch, or open a
pull request. Apply those writes only when the user has asked for them.

## Author a focused skill

When the workflow is already clear:

```text
$skill-creator create a project skill for verifying database migrations. install it under .agents/skills/verify-migrations/.
```

The [Authoring or modifying a skill
playbook](../../skills/deepwright/playbooks/authoring-a-skill.md) defines the
quality bar: narrow triggers, explicit inputs and outputs, safe permissions,
linked references, and a reproducible validation case. Agent-facing prose is
executable policy, so remove claims the host cannot guarantee.

A skill that drives the real application has a dedicated path. Use
[`$deepwright:create-verification-skill`](../../skills/create-verification-skill/SKILL.md)
and maintain it with
[`$deepwright:maintain-verification-skill`](../../skills/maintain-verification-skill/SKILL.md).
[Verify and ship](./06-verify-and-ship.md#create-a-project-verification-skill)
covers the lifecycle.

If the user asks to publish a skill change in a pull request, use the authorized
GitHub connector first and authenticated `gh` as the CLI fallback. Resolve the
repository, base, and head before the external write.

## Write docs with `$deepwright:technical-writing`

```text
$deepwright:technical-writing review the README changes for ambiguity and missing prerequisites.
```

[`$deepwright:technical-writing`](../../skills/technical-writing/SKILL.md) selects the
document mode—tutorial, how-to, reference, or explanation—then removes sentences
that can be read two ways. Use it for skill docs, RFCs, READMEs, pull-request
descriptions, and commit messages. Use [`$deepwright:unslop`](../../skills/unslop/SKILL.md)
afterward when the prose still sounds padded or generic.

## Test a skill change blind

```text
$deepwright:deepwright run the eval playbook on this skill change. give both variants the same sanitized task and keep their identities hidden from the judge.
```

The [Eval playbook](../../skills/deepwright/playbooks/eval.md) compares outputs
in isolated directories under the same brief and rubric. Grade observable
artifacts: diffs, tests, tool receipts, verification evidence, and final
reports. Do not require access to private histories to prove instruction
following. A fresh judge should receive neutral candidate labels and no hint
about which result is the proposed change.

Read every output yourself before accepting the verdict. If the evidence and
score disagree, fix the rubric or task isolation before changing the skill.

**Pitfall:** do not patch a reusable skill in the middle of unrelated feature
work. Capture the evidence under `.deepwright/runs/<run-id>/`, finish the active task, then make and
evaluate the skill change as its own reviewable unit.

Next: [Recipes and pitfalls](./10-recipes-and-pitfalls.md).
