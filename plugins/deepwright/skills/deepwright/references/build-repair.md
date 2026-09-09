# Repair a build without weakening its checks

Use when compilation, typechecking, dependency resolution, or build configuration blocks the requested work. Preserve the enclosing task's permissions. A diagnosis or review describes the repair without editing files or executing prohibited commands.

## Find the first causal failure

Read the package's actual scripts, workspace boundaries, lockfile, and declared runtime. Use the existing command from its owning directory. Distinguish a missing executable or dependency installation from a source defect. Do not substitute a familiar command, fetch a package through an unreviewed launcher, or infer that all errors share one cause.

Capture the build process's exit status and relevant output before summarizing it. A successful `tail`, `head`, or `tee` does not establish that an earlier pipeline command passed. Prefer separate execution and output inspection. If a pipeline is necessary, use the shell's supported failure-propagation mechanism and retain the underlying process result. Truncation, early pipe closure, timeouts, and startup failures remain distinct from completed checks. Do not log secrets to obtain a fuller receipt.

Group cascading diagnostics by the first failing import, type, generated input, or configuration boundary. Read that boundary and its callers before making one small correction. A missing property may reveal a contract mismatch; adding an optional field or cast solely to silence the compiler is not a demonstrated repair.

## Keep the repair bounded

Preserve lockfiles, pinned versions, strictness, assertions, and failure exits. Do not delete a lockfile, widen a type to `any`, disable a rule, skip a test, or suppress errors just to make the build green. A legitimate configuration or dependency change needs its own causal explanation, authorized scope, and compatibility check.

Clear only a verified disposable cache when evidence points to stale generated state and cleanup is authorized. Prefer rebuilding the actual producer over editing generated output. Do not remove unrelated work or reinstall everything as the first diagnostic step.

Rerun the original command after the correction, then the focused behavioral checks for the affected contract. A green build proves buildability, not that the application requirement works. Use the existing regression workflow; avoid a repository-wide refactor for one compiler error.

## Finish or stop

Retain the original failure, changed input or source, exact command and working directory, completed result, and remaining verification gaps. Respect the task's existing attempt allowance. If another attempt would repeat the same evidence, report the unresolved cause and next discriminating observation instead of looping or expanding permissions.

Example: a wrapper exits zero after printing a failed build's last line. Inspect the underlying build result and repair its cause. Changing the final message or deleting the failing check does not fix the build.
