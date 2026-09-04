---
name: blast-radius
description: "Find downstream risks and prove a change is safe. Use for $blast-radius."
---

# Blast radius

Find what a change could break somewhere else before it ships. A review request is read-only unless the user also asks for changes.

Companion to `$how` and `$why`. `$how` tells you what the code does. `$why` tells you why it is shaped that way. Blast radius tells you what it breaks somewhere else.

Listing the callers is not the job. The agent can grep those in a second. The job is the breakage grep won't show you.

## Don't trust your own writeup

A blast-radius writeup that only sounds right is not proof. Find the one or two facts the change depends on and verify them with existing tests, a safe read-only command, or an ephemeral scratch check. Add a repository test or script only when edits are authorized.

### How sure are you

For each fact the change's safety depends on, get it as far down this list as is cheap, and say where it stopped.

1. You said so. Worthless on its own.
2. You pointed at the line. A real `file:line`, or the library's own source.
3. You showed the bad case can't happen. You walked the failure step by step and it doesn't reach.
4. You ran it. A script or test that calls the real code and fails loud if you're wrong.
5. You reproduced it in the running app.

Any safety fact you can't get to step 4, say so out loud. Don't write it up as settled. Step 4 is usually one small script that imports the same library the app ships and calls the exact function you're worried about.

## Steps

1. Read the change. Inspect the diff, the symbols it adds, changes, and deletes, and what it now does differently, including the part the diff does not spell out. Use `$why` to pull the PR and commits when rationale matters.
2. Find the one fact it's safe because of. Most changes that look scary are safe because of a single fact, like "this call only drops already-dead cache entries and does nothing else". Find that fact. If it holds, most of the scary cases die at once. Spend your time here, not on a long list of maybes.
3. Look where grep stops. Read the source of the library you call, and check its pinned version and any local patch. Work out when things run: microtasks, unmount and teardown, Solid versus React. Follow what a symbol search misses: the JSON an API returns, a DB column, a wire format, another language reading the same bytes, a feature flag, code three hops downstream.
4. Be honest about each risk. Give it a real chance of happening and a real cost if it does. Keep the risks you confirmed; list the ones you checked and cleared separately. Apply `$why`'s evidence rules. Cite a real `file:line`; never make up a caller or an API. A scoped null search is a result, not proof that nothing exists elsewhere.
5. Prove the one fact with the strongest safe evidence available. Prefer an existing test or command. For read-only work, keep any new probe in a task-owned scratch location and do not alter product data or external state. If you cannot prove it safely, mark it unproven.
6. For a big or wide change, run `$arena` with independent briefs and merge the strongest evidenced findings. Use only model overrides that the host confirms.

## What to hand back

- **What it does.** What changed, including the part that isn't obvious.
- **The one fact it's safe because of.** State it, say which step you got it to, and show the proof. If you couldn't prove it, write unproven.
- **Risks.** Only the real ones. Each names how it breaks, the `file:line`, how likely and how bad, and how to check. Paste the proof for the ones that matter.
- **Cleared.** What you checked and why it's fine.
- **Before you merge.** The cheapest safe test or repro that catches the real bug, with any proposed repository change clearly labeled.

Write it through `$unslop`, cite real code, and strip anything private before it goes anywhere public.

**Reply:** the writeup above, with the one safety fact either proven or marked unproven.
