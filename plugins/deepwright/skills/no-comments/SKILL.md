---
name: no-comments
description: "Remove narrating comments and stale suppressions. Use for $no-comments."
---

# No comments

Use the caller's files or diff. Otherwise compare the working tree with the repository's actual base branch.

1. Invoke `$comment-auditor` with the exact diff or file scope.
2. When delegation is available, give one fresh reviewer the exact scope and the auditor instructions. The reviewer must not edit application code.
3. Verify every proposed deletion against nearby code. Keep legal headers, public API contracts, proven external constraints, and precise issue links that code cannot express.
4. Remove narration, commented-out code, stale warnings, and explanations of behavior the code can make obvious.
5. Treat correctness-related lint or type suppressions as design findings. Fix the root cause when it is in scope. Do not widen scope without the user's authorization.
6. Prefer a type, invariant, test, lint, or runtime guard over a `do not remove` comment when that structure is cheaper and clearer.
7. Run the relevant formatter, lint, type check, and tests after edits.
8. Report deletions, retained exceptions, root-cause fixes, checks, and open constraints.

If a comment's necessity remains ambiguous after inspecting the live path, keep it and report the uncertainty. Aggression is not evidence.
