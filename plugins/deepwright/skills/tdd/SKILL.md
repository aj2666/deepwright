---
name: tdd
description: "Build features and fix bugs through observable red-green-refactor steps. Use when a behavior change needs regression evidence."
license: MIT
---

# TDD

## Purpose

Make one required behavior executable, observe it fail for the right reason,
implement just enough to pass, then refactor while keeping the check green.
This workflow covers both new features and bug fixes; it does not authorize
commits, publication, merges, or unrelated changes.

## Requirements

Read [the acceptance contract](../spec/references/acceptance-contract.md).
Reuse the request's criteria and identify the behavior for this slice. For a
bug, first establish the intended behavior and smallest actual reproduction.
For a feature, preserve existing defaults and identify the next missing
capability. For read-only diagnosis or test review, inspect and report only;
do not start an implementation loop.

Use an existing public interface and the narrowest test that exercises the
real behavior, including multiple callers or persistence when the defect
requires them. Infer routine test choices from the project. Ask only when a
new interface or test environment changes an unsettled compatibility, data,
cost, security, or product decision. A test boundary is not required to be a
unit test: an integration, CLI, browser, or other real-surface check may be
more appropriate.

## Instructions

1. Write the smallest test for one criterion. Derive the expected outcome from
   the contract, a worked example, or an independent reference, not a copy of
   the implementation algorithm. Run existing nearby checks to distinguish
   pre-existing failures from the new failure when needed.
2. Run the new test before changing production behavior. Confirm the observed
   failure is the missing or broken behavior, not an import error, missing
   dependency, skipped test, or defective harness. A passing test does not
   demonstrate red; investigate before proceeding.
3. Implement only the required behavior. Keep defaults, unrelated callers, and
   rejected-input behavior compatible unless the contract says otherwise.
4. Run the same check and observe green. Refactor duplication or unclear
   structure within scope, then rerun it. Keep the test behavioral so internal
   restructuring does not require rewriting its expected outcome.
5. Record which criterion the evidence supports and what remains blocked.
   Repeat for the next behavior. Run relevant typechecking and adjacent tests
   as the change grows, and the appropriate full suite before handoff.

Do not write all imagined tests and then all implementation. Each slice must
respond to what the preceding run established. A previously implemented
behavior can receive additional regression coverage, but do not fabricate
failing-before evidence by deliberately breaking production code.

## Test quality

Use real internal behavior by default. Substitute external services, time,
randomness, or unsafe I/O at an established boundary when necessary; verify
the real integration separately where the contract requires it. Prefer a
local disposable database to mocking persistence away. Avoid mock-heavy
tests that only prove their own setup.

Assert outcomes rather than private methods or incidental call order. Call
counts and ordering are valid when they are the actual contract, as with
retry limits or idempotency. Storage checks are valid when stored state is
part of the required outcome. Do not delete existing tests until their
important behavioral coverage is demonstrably preserved.

## Limitations

Name the specific obstacle before fixing: inaccessible production-only state,
no reproducible trigger, disproportionate fixture setup, or an unsuitable
existing interface. Use the closest trustworthy executable check, such as a
fixture script, browser drive, replay, or targeted integration check. Do not
skip evidence merely because it requires integration rather than a unit test.
Do not build broad unrelated infrastructure to satisfy the ritual.

For intermittent bugs, record the repetition count and observed reproduction
rate; one successful run does not prove the bug is gone. A blocked or weak
signal stays visible as a limitation. Never weaken assertions to match a
wrong implementation, count skipped tests as passes, or rewrite criteria to
make the result green.

## Handoff

Report the behavior delivered, genuine failing-before and passing-after
commands/results, the tested revision or snapshot, refactoring performed,
adjacent validation, and remaining failed or blocked criteria. The enclosing
Feature or Bug Fix workflow owns broader review and delivery.


## Examples

**Default compatibility:** A helper retries twice and the user requests a configurable limit. First add a check that a limit of zero calls a failing operation once and preserves that failure. Observe the existing helper make three calls, then implement the limit and rerun the same check. Keep the old default tests and add invalid-input and asynchronous cases as later slices. The examples describe expected behavior; the actual test commands and outputs must come from the project.

**A misleading red:** A new test fails because its module cannot be imported. Fix the test setup before editing production behavior; the import failure does not demonstrate the requested regression. If the behavior is already correct, retain useful coverage and state that no failing-before behavior was observed.

## Troubleshooting

When a focused check passes but a neighboring test fails, investigate the shared contract before declaring green. If an external service is unavailable, separate the locally verified behavior from the blocked integration and avoid replacing it with mocks that erase the failure mechanism.
