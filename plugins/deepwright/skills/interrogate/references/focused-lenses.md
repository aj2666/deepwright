# Focused review lenses

Select a lens when the change has the corresponding risk. Add its questions to the existing reviewer brief; do not create extra reviewers or apply every lens to every change. Preserve Interrogate's read-only scope and evidence requirements.

## Failure visibility

For changed catches, retries, timeouts, cancellation, background work, or fallback paths, trace one concrete failure from its origin to the caller or operator who must respond. Look for discarded errors, unawaited work, success-shaped fallback values, and cleanup that replaces the original failure. Check whether partial results retain their limitations and whether retries can repeat a side effect.

A fallback may be the intended contract. Establish its trigger, returned meaning, and recovery or observability path before calling it a bug. Do not prescribe logging every exception: expected cancellation, privacy, noise, and error ownership matter. Report the reachable failure path, observable consequence, and source location; absence of a log alone is not a finding.

## Test quality

Map changed behavior to actual assertions at the appropriate boundary. Distinguish a test name, execution, and a check of the intended result. Inspect whether mocks bypass the changed integration path, assertions permit both correct and broken results, or only the happy path is exercised. Prioritize missing checks for failures, state transitions, and compatibility that could change the verdict.

Propose a discriminating regression check: the concrete input or event order, the expected observable result, and the plausible defect it would catch. Avoid line-coverage targets and tests that mirror private implementation. Existing tests without matching execution receipts establish assertion coverage only. Under read-only review, describe the check; do not execute a test that might write or contact services.

Keep confirmed defects separate from missing evidence. Rank by user impact and reachability, not by how many checklist items can be filled. If the available source cannot establish a failure, name the missing observation rather than asserting it occurred.

## Agent configuration and extensions

For changes to skills, host permissions, hooks, plugin installation, or tool-server launchers, use [agent-configuration security](agent-config-security.md). Trace active authority and data movement without executing the configuration. Keep scanner results, host enforcement, and source findings separate.
