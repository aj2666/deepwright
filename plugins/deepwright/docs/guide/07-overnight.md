# Run unattended work safely

Deepwright can prepare a run that is safe to leave alone, but the mechanism
that keeps Rivet running belongs to the Codex surface. In the macOS desktop
app, use a scheduled task. In Codex CLI, use `codex exec` from a scheduler such
as CI or `launchd`. A skill invocation by itself is not a background service.

The safety contract is the same on both surfaces: a checkable finish condition,
an isolated workspace when parallel writers are involved, explicit permissions,
and a durable decision log you can inspect later.

## Write the unattended contract

```text
$deepwright:deepwright migrate every caller to the new parser in a fresh worktree from <base>.
Done means no old callers remain, all parser fixtures pass, and the old API is deleted.
Keep a decision log at .deepwright/runs/<run-id>/decisions.tsv. Commit local changes, but do not push, open, merge, or comment on a pull request.
If progress stops after two distinct approaches, record the blocker and stop.
```

A useful contract names:

- the exact goal and starting revision;
- an executable predicate for `done`;
- the writes that are allowed and forbidden;
- the evidence and audit path;
- a bounded escape condition for a genuine dead end.

Duration is not a finish condition. “Work for four hours” measures activity.
“Every fixture passes and no old callers remain” measures the result.

The [Autonomous run playbook](../../skills/deepwright/playbooks/autonomous-run.md)
and [`$deepwright:figure-it-out`](../../skills/figure-it-out/SKILL.md) turn this contract
into small phases. Each phase checks the current state, makes the smallest
justified change, verifies it, and records the result. A failed hypothesis is
discarded only when it was created in the isolated run; pre-existing user work
is never discarded.

## macOS desktop: create a scheduled task

Use the ChatGPT desktop app's scheduled-task controls when the run should start
later or recur. Point the task at the intended local project or worktree and put
the full contract in its prompt. Test that prompt once in an ordinary chat
before scheduling it.

For work on local files, the Mac and desktop app must remain available while the
task runs. A scheduled task does not enlarge its authorization: pushing,
opening or merging a pull request, posting comments, and deploying still need
the permission stated in the task.

An example scheduled-task prompt:

```text
In the selected project, use $deepwright:deepwright to run the parser-migration contract.
Re-check the finish predicate before every new change. Write the audit trail to
.deepwright/runs/<run-id>/decisions.tsv. Stop on success or on the stated escape condition.
Do not perform external GitHub writes.
```

## Codex CLI: invoke `codex exec`

Codex CLI does not use the desktop scheduled-task UI. For one unattended run,
invoke `codex exec`; for a later or recurring run, let CI, `launchd`, or another
external scheduler invoke that command.

```bash
codex exec --sandbox workspace-write --ephemeral \
  'Use $deepwright:deepwright to migrate every caller to the new parser. Done means no old callers remain, all parser fixtures pass, and the old API is deleted. Record decisions in .deepwright/runs/<run-id>/decisions.tsv. Stop on success or after two distinct blocked approaches. Do not push or change pull requests.'
```

One `codex exec` invocation is one run. Repetition, timing, retries, and alerting
belong to the external scheduler. Keep the command idempotent, use a dedicated
worktree for a writing job, and choose `--sandbox workspace-write` only when the
task actually needs repository writes. Actions requiring a new interactive
approval cannot be assumed to succeed in an unattended run.

## Audit durable evidence

[`$deepwright:show-me-your-work`](../../skills/show-me-your-work/SKILL.md) summarizes the
repository state, audit rows, commits, diffs, and verification receipts that the
run left behind:

```text
$deepwright:show-me-your-work summarize .deepwright/runs/<run-id>/decisions.tsv and verify each claimed result against the current branch.
```

Treat the log as a navigation aid, not truth by declaration. Check the current
head, dirty state, test results, and relevant artifacts. The audit must not
depend on private chat-history files being present.

## Queues and pull requests

The [Autopilot-stack](../../skills/deepwright/playbooks/autopilot-stack.md)
playbook can prepare a reviewable stack without landing it. The
[Autopilot-full](../../skills/deepwright/playbooks/autopilot-full.md) and
[Orchestrate](../../skills/deepwright/playbooks/orchestrate.md) playbooks are
appropriate only when the queue, dependencies, finish predicate, and external
write permissions are explicit.

For GitHub state, use the installed, authorized GitHub connector first and
authenticated `gh` as the CLI fallback. Never treat “run overnight” as permission
to push, open, comment on, merge, or deploy anything. If branch protection,
review, credentials, or another gate cannot be satisfied unattended, stop at
merge-ready and record the blocker.

Next: [Steer with principle names](./08-principles.md).
