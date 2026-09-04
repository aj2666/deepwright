### Opening a PR

Run this only when the user explicitly asks to open a PR or the authorized workflow clearly includes PR creation. Otherwise prepare the local change and report that no external write was made.

**Worktree.** Discover the repository's default branch. Preserve unrelated user changes. When host collaboration tools are available, give each writer an exclusive branch or worktree; otherwise serialize writers. For a dirty tree, create a separate worktree if safe or ask how to handle overlapping changes. Never hard-reset, discard, or overwrite user work to make a PR.

**Commits.** Stage only agent-owned paths and inspect the staged diff for unrelated changes or secrets. Create small, ordered commits when the task authorizes commits. Rewrite only an unshared task branch; never rebase or amend shared user history without explicit authorization.

**PRs.** Run `$deepwright:no-comments` before review. Write every PR title, description, and commit body with `$deepwright:technical-writing`, then apply `$deepwright:unslop`. If a named skill is unavailable, perform the equivalent review directly instead of failing. Use one word for each action, keep articles, and prefer a plain verb to a gerund.

**Titles.** Use Conventional Commits in the form `type(scope): subject`. Use `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf` as the type. Use the changed area, such as `Deepwright` or `deepwright`, as the scope. Keep the subject short and imperative. Apply the same `$deepwright:technical-writing` and `$deepwright:unslop` pass as the body. Name a real symbol when one carries the change. For example, `fix(Deepwright): retarget opening-a-pr babysit trigger`. Do not add a trailing period.

**Descriptions.** Use these sections in order. Drop a section when it is empty.

- `## Why`. State the intent and why this approach fits.
- `## Scope`. State facts from the diff. Name real symbols and paths. Name both sides of a rename or retarget. State what is in and out when the boundary matters.
- `## Tradeoffs`. State real choices only. Skip this section when there are none.
- `## Blast Radius`. State who and what the change touches. Explain why the change is safe or risky. If the default branch is red without the fix, name the continuing cost.
- `## Verification`. State how you ran each check and its rigor. Name the real surface and capability, such as a browser scenario, CLI transcript, simulator run, or targeted tests. State each outcome, not only the command name.

After these sections, attach videos or screenshots when they prove a claim. Do not use `## Summary` or `## Test plan` boilerplate. A commit body does not restate its subject.

**GitHub access.** Resolve the exact repository, remote, account, base branch, and head branch before the first external write. Prefer the available GitHub connector when it exposes the operation. Otherwise use authenticated `gh`. Keep one backend for a mutation sequence, and re-read the PR after every write. If neither path is available, stop after the local branch and give the command or permission needed.

**Size and stacks.** Prefer narrow, independently verifiable PRs. A stack is a base-branch chain: the root targets the default branch and each child targets its parent branch. Use the available GitHub connector or `gh pr create --base <parent-branch>` and `gh pr edit <pr> --base <parent-branch>`. Rebase only private task branches. Rewriting or force-pushing an existing shared branch needs explicit authorization for that branch.

**Readiness.** Follow the user's draft preference. If none is stated, open a ready PR only when the change and its verification are complete; otherwise use a draft. With `gh`, use `--draft` deliberately or omit it deliberately. Re-read PR state through the selected GitHub backend before reporting it.

**Babysit.** Opening a PR does not authorize an open-ended watcher or a merge. Post the URL and finish the requested build. Run a bounded babysit pass only when the user asks. Push back when feedback drifts from intent.

A delegated PR owner invokes `$deepwright:interrogate`, `$deepwright:no-comments`, and `$deepwright:unslop` when applicable. It returns the URL and exact head SHA, then stops; it does not babysit or merge unless those actions were separately authorized.
