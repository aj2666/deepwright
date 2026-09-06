### Pause safely

**You own a clean stop. Leave a checkpoint a cold-start agent can resume from.** For "pause safely", "I need to go offline", "restart Codex", or "board my flight", and when context is about to compact or summarize. This is explicit only. On "keep going", "going to bed, keep going", or "don't stop", do not pause. Those mean continue, and Autonomous run already checkpoints per iteration.

1. Stop at a safe boundary. Finish the current atomic step or back out of it. Never stop mid-edit in a known-broken state. Start nothing new. Ask active subagents to stop through the host collaboration tools, then collect any useful results already produced.
2. Do not cross an external or destructive line merely to pause. Do not open a PR, push, merge, deploy, or delete anything unless the user already authorized that exact action and it is needed to leave the requested state safe.
3. Make the work durable without overwriting user history. If the current task already authorizes commits, stage only agent-owned paths, inspect for unrelated changes or secrets, and make one clear `wip:` commit. If ownership is unclear, do not commit; record the status and ask. Never force-push or reset user changes as part of pausing.
4. Write `.deepwright/runs/<run-slug>/resume.md`. Capture intent, current branch and worktree, progress, verification evidence, pending steps, key files, active PRs, and gotchas. If a `$deepwright:show-me-your-work` trail exists, link to it instead of duplicating it. Keep secrets and private conversation text out of the note.

Include material [coverage gaps](../references/evidence-coverage.md). If the task uses the optional [run evidence helper](../references/run-evidence.md), preserve its run path, consumed/remaining attempts, and deadline; append a checkpoint only within existing local write authority. Pausing does not replenish the allowance or require adopting the helper mid-task.

**Reply:** where you are in the loop, what's on disk versus still in your head (paths, no diff dumps), the commits you made and whether the tree is clean, and the first action on resume. This is a pause, not a final report. Resume is the Session pickup playbook reading this note.
