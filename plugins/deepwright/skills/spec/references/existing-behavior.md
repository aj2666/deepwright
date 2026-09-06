# Document existing behavior

Use when the user asks to recover a specification from an existing system, document undocumented behavior, or establish a compatibility baseline. This is a read-only mode unless the user authorized a documentation file. It does not repair the system or approve its current behavior as a future requirement.

Start with the requested capability and revision or working-tree snapshot. Find its public entry points, then trace the relevant callers, enforcement branches, storage or external boundaries, and tests. Sample representative paths to orient yourself; expand when callers differ, branches contradict the sample, or a boundary remains unresolved. A sample supports claims about that sample, not the entire repository. There is no fixed file quota.

Record each material behavior with:

| Field | Evidence to retain |
| --- | --- |
| Behavior | Trigger, input constraints, output or side effect, and relevant failure behavior |
| Implementation | Revision-specific file and symbol or line that enforces it; distinguish a declaration from the active call path |
| Tests | What existing assertions actually establish, their location, and whether execution was observed on this snapshot |
| Confidence and gaps | Inspected, executed, inferred, contradicted, or unread; name the unresolved branch or unavailable source |
| Disposition | Observed behavior; separately identify a supplied compatibility requirement or proposed change and its authority |

Preserve contradictions. If documentation says retries default to three but the active loop permits two retries, report both sources and the enforced value. If a test exists without a matching execution receipt, say the assertion exists, not that it passed. If an error is swallowed, describe that behavior and its consequence; do not turn it into a requirement to keep swallowing errors.

Finish with a compact inventory, coverage limits, and consequential open decisions. Use the project's existing documentation format when file output was requested; do not introduce a specification framework or directory convention. Carry only user-approved compatibility constraints into [acceptance criteria](acceptance-contract.md). Stop when the requested paths are explained and remaining gaps are explicit, rather than exploring unrelated modules to manufacture completeness.
