---
name: principle-build-the-lever
description: "Automate repetitive work with reusable checks. Use for $deepwright:principle-build-the-lever."
---
# Build the Lever

When repeated or error-prone work earns it, build the smallest tool that does or proves it.

**Why:** Two payoffs. Throughput: a codemod, generator, or script does the work the same way every time and reruns for free. Confidence: the tool is one artifact a reviewer can read and rerun to check the work. Hand-done changes can only be re-verified by redoing them. A deterministic script turns "trust me" into "run this".

**Pattern:** Compare the cost of a lever with the cost and risk of the manual work. Build one when it improves repeatability or proof without expanding the user's requested scope.

- Do the first unit by hand to learn the recipe, then build the tool. Prove it by rerunning it on that unit and diffing against your hand-done version. Make the lever safe to rerun. A reviewer will.
- Codemod or script for edits, generator for repetitive files, a dump-to-sqlite query for analysis, a rerunnable check for verification.
- A deterministic lever beats fan-out. If the tool can process every unit in one pass, run it yourself; don't fan out delegates to hand-apply what a script can do.
- When you fan work out, put the shared recipe and fences in an existing in-scope brief or task-owned artifact. Create a reusable skill only when the user asked for one or approved that scope.
- For an analysis-only request, use an existing command or an ephemeral scratch script and return the evidence. Do not add repository files merely to satisfy this principle.
- Commit a useful lever only when commits are authorized and the artifact belongs in the repository. Otherwise keep it in the task's scratch evidence or propose it.

**Balance:** A one-off can earn a lever when it is the cheapest reliable proof, but not when building it costs more than the task. Apply [`$deepwright:principle-laziness-protocol`](../principle-laziness-protocol/SKILL.md): build the smallest script that does or proves the job, never a framework.

Distinct from [`$deepwright:principle-encode-lessons-in-structure`](../principle-encode-lessons-in-structure/SKILL.md), which makes a recurring instruction a durable guardrail. This is throughput and reviewability on the work in front of you. For verification, use [`$deepwright:principle-prove-it-works`](../principle-prove-it-works/SKILL.md).
