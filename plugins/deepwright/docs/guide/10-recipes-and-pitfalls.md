# Recipes and pitfalls

These prompts work in Codex CLI and the macOS desktop app after the Deepwright
plugin is installed. Use the fully qualified `$deepwright:<skill>` name that
states your intent; invoke `$deepwright:deepwright` when Rivet should choose the
playbook.

## Understand an unfamiliar subsystem

```text
Use $deepwright:how to explain how initialization works, then $deepwright:why to trace the change that introduced this failure.
```

Mechanics come first. Local `git` history supports `$deepwright:why`; for pull requests and
issues, use the authorized GitHub connector first and authenticated `gh` as the
CLI fallback.

## Compare designs

```text
$deepwright:arena compare independent designs for this cache boundary. use one rubric and recommend one coherent base.
```

The candidates share the brief and rubric, not a checkout. Model diversity is
optional; independent context and a fresh evidence-based review are required.

## Check independent slices

```text
$deepwright:swarm check every package under packages/ against its check.sh. return one PASS, ISSUES, or BLOCKED row per package.
```

Use separate worktrees only for simultaneous writers. Read-only workers can
share a checkout when the host supports subagents and capacity is available.

## Review without writes

```text
$deepwright:interrogate review the whole branch skeptically. report only behavior, correctness, security, or regression findings. do not edit files.
```

The prompt states intent; the sandbox enforces it. For an unattended CLI review:

```bash
codex exec --sandbox read-only \
  'Use $deepwright:interrogate to review the current branch. Do not edit files or perform GitHub writes.'
```

## Fix a bug through evidence

```text
$deepwright:deepwright reproduce the duplicate write first. if the repository has a cheap stable test path, use $deepwright:tdd. then fix it and rerun the real command.
```

A failing test is valuable when it models the behavior. A brittle mock harness
can be weaker evidence than exercising the product directly.

## Run while away on macOS desktop

Create a desktop scheduled task with a standalone contract:

```text
In the selected project, use $deepwright:deepwright to make every parser fixture pass and remove every old parser caller. Write decisions to .deepwright/runs/<run-id>/decisions.tsv. Do not push or change pull requests. Stop on success or after two independently verified blockers.
```

The Mac and desktop app must remain available for local-project work. A
scheduled prompt must repeat the repository or worktree, goal, definition of
done, permissions, and checkpoint path; it cannot rely on context from another
chat.

## Run while away from Codex CLI

Use an external scheduler or CI to invoke one idempotent run:

```bash
codex exec --sandbox workspace-write --ephemeral \
  'Use $deepwright:deepwright in this repository. Finish only when every parser fixture passes and no old parser callers remain. Record decisions at .deepwright/runs/<run-id>/decisions.tsv. Do not push, open, comment on, or merge pull requests.'
```

`codex exec` runs the prompt; CI, `launchd`, or another scheduler owns timing and
repetition. See the [unattended-work guide](./07-overnight.md) before enabling
writes.

## Redirect a drifting run

```text
The current goal is reproduction evidence. Do not implement a fix yet.
```

```text
Apply Prove It Works. Show the real output, not only the build log.
```

```text
$deepwright:unslop tighten that explanation and preserve every technical claim.
```

Follow-ups retain conversation context, but invoke `$deepwright:deepwright` again whenever
you need to guarantee Rivet routing.

## Get the result in plain words

```text
$deepwright:bro
```

[`$deepwright:bro`](../../skills/bro/SKILL.md) restates the preceding result in shorter,
plain language without changing the substance.

## Common pitfalls

- **Enumerating every skill.** A hand-written chain can fight the selected playbook. State the outcome and constraints; name a narrow skill only when its behavior matters.
- **A vague finish condition.** “Make it better” gives an unattended run no pass/fail predicate. Name the command, artifact, or observed state that proves completion.
- **Treating a prompt as enforcement.** “Do not edit” is an instruction. Select a read-only sandbox when enforcement matters.
- **Assuming writer isolation.** Codex subagents do not automatically get worktrees. Give simultaneous writers non-overlapping paths or create and verify one dedicated worktree per writer.
- **Using `$deepwright:arena` for coverage.** `$deepwright:arena` compares complete attempts and selects a coherent base. `$deepwright:swarm` partitions a matrix and aggregates every slice.
- **Accepting every review comment.** Verify findings against the current code and behavior. Dismiss noise with evidence.
- **Inventing model identifiers.** Workers inherit the parent Codex model by default. Store an override in `.codex/deepwright.toml` only after the active host confirms it.
- **Reporting success from a green build.** A build proves compilation. Exercise the command, flow, stored value, migration, or profile that changed.
- **Treating review permission as merge permission.** Opening, commenting on, pushing, merging, and deploying are separate external writes and require explicit authorization.
- **Writing a `SKILL.md` freehand.** Use `$skill-creator` and the [authoring playbook](../../skills/deepwright/playbooks/authoring-a-skill.md) so structure, links, safety, and validation are checked.

If you skipped ahead, return to [setup](./01-setup.md), invoke one real
`$deepwright:deepwright` task, and inspect the evidence Rivet reports.

Back to the [guide index](./README.md).
