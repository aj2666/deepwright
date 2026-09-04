# Understand the code before changing it

Rivet offers four focused entry points. `$deepwright:how` traces current behavior.
`$deepwright:why` reconstructs the evidence behind it. `$deepwright:teach`
combines mechanism and history. `$deepwright:recall` rebuilds context only from
sources that are actually available.

## Trace behavior with `$deepwright:how`

```text
$deepwright:how how do we deduplicate notifications, and is there an N+1 query when subscribers load?
```

[`$deepwright:how`](../../skills/how/SKILL.md) follows the runtime path, names the important
types, and explains the non-obvious boundaries. For a large subsystem it can
delegate independent, read-only slices and return conclusions rather than raw
file dumps. For a narrow question it reads directly.

Ask for critique only after the mechanism is clear:

```text
$deepwright:how explain the sync service, then critique its ownership boundaries
```

## Reconstruct history with `$deepwright:why`

```text
$deepwright:why why was the retry limit set to five, and does that reason still hold?
```

[`$deepwright:why`](../../skills/why/SKILL.md) begins with repository history. When an
installed GitHub connector can access the repository, use it for pull requests,
issues, reviews, and other hosted evidence. In Codex CLI, authenticated `gh` is
the fallback when the connector is unavailable. Other configured tools—docs,
team chat, observability, error tracking—are optional sources, never assumed
dependencies.

The report must cite what it found, distinguish direct evidence from inference,
and report empty searches. “No recorded reason was found” is better than an
invented explanation.

## Build a teachable model with `$deepwright:teach`

```text
$deepwright:teach show how this pull request changes retries and convince me it fixes the cause rather than the symptom.
```

[`$deepwright:teach`](../../skills/teach/SKILL.md) composes `$deepwright:how` and
`$deepwright:why` as needed,
then builds one coherent explanation. Diagrams should clarify a real
relationship or state transition, not decorate the answer.

## Rebuild available context with `$deepwright:recall`

```text
$deepwright:recall catch me up on the export work using this branch, its pull requests, and the decision log.
```

[`$deepwright:recall`](../../skills/recall/SKILL.md) uses the current conversation,
repository state, `.deepwright/runs/<run-id>/` handoff or decision records, and
connected sources the user has authorized. It does not assume that private
client history is exposed as local files, and it does not search unrelated
chats or workspaces.

## Take over prior work with Session pickup

```text
$deepwright:deepwright take over this branch. inspect the commits, working tree, checks, and .deepwright/runs/<run-id>/handoff.md; continue without redoing verified work.
```

The [Session pickup playbook](../../skills/deepwright/playbooks/session-pickup.md)
reconstructs the state from durable evidence: the goal, branch and commits,
working tree, check results, pull-request state, and any explicit decision log
or handoff. It verifies inherited claims before building on them.

**Pitfall:** “the agent will read the code anyway” is not a substitute for a
traced model. Understanding the mechanism first is usually cheaper than fixing a
second regression.

Next: [Design the change](./04-design.md).
