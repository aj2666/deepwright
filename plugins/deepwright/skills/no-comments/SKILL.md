---
name: no-comments
description: "Remove redundant comments and stale suppressions within a requested file or diff scope, retaining necessary contracts. Use for $deepwright:no-comments."
license: MIT
---

# No comments

## Purpose

Make code easier to read by deleting narration and stale instructions, while preserving comments that carry a contract or a constraint the code cannot express.

## Prerequisites

Use the caller's files or diff. Otherwise compare the working tree with the repository's actual base branch, including relevant local edits. If the base is unknown or there is no diff, request a scope instead of cleaning the whole repository. Read the local contribution instructions before choosing validation commands.

## Instructions

1. Apply `$deepwright:comment-auditor` to the exact diff or file scope. If the skill is unavailable, inspect comments locally using the retention rules below and report that fallback.
2. For a broad or uncertain cleanup, use a fresh read-only reviewer when delegation is available and useful. A small, obvious deletion can be reviewed directly. Give any reviewer the same exact scope and auditor boundaries.
3. Verify each proposed deletion against nearby code. Keep legal headers, public API contracts, proven external constraints, precise issue links that code cannot express, and necessary style-only tool directives.
4. Remove narration, commented-out code, stale warnings, and explanations of behavior the code can make obvious. Preserve user edits outside the agreed scope.
5. Treat correctness-related lint or type suppressions as design findings. Fix the root cause when it is in scope. Do not widen scope without the user's authorization.
6. Prefer a type, invariant, test, lint, or runtime guard over a `do not remove` comment when that structure is cheaper and clearer.
7. Inspect the final diff for accidental behavior changes. Run the relevant formatter, lint, type check, and tests after edits; choose checks affected by the deletion or root-cause fix rather than adding tests that only assert wording.

## Examples

Input:

```ts
// Return early when no items exist.
if (items.length === 0) return [];

// @ts-expect-error payload type is wrong
send(payload);
```

Delete the first comment after checking its context. Keep the suppression until its cause is understood. If the caller requested comment edits only, report the type problem for a separate change. If a scoped type correction is authorized, make it and run the relevant type check before claiming the suppression is unnecessary.

## Output

Report deletions, retained exceptions, root-cause fixes, validation results, and open constraints.

## Troubleshooting

If a check fails, distinguish an existing failure from one introduced by the edit when evidence allows it. Do not claim success when a required check is unavailable.

## Limitations

If a comment's necessity remains ambiguous after inspecting the live path, keep it and report the uncertainty. Aggression is not evidence.
