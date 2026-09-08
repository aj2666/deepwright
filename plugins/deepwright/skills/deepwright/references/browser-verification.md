# Make browser verification discriminate between working and broken behavior

Use when authoring or debugging browser checks for a changed user journey. Reuse the project's installed test framework and [product-interface contract](product-interface.md). Do not install a browser, contact a shared environment, or drive the application under a read-only review request.

## Observe the action that matters

Choose a locator by the user's role and accessible name where practical, or an existing stable test identifier. Inspect ambiguity instead of adding positional selectors that happen to pass. Reuse page helpers when they hide repeated interaction details; do not require a new abstraction for a single scenario.

Assert the visible state or result that establishes readiness. Avoid arbitrary sleeps and blanket `networkidle` waits: unrelated background traffic can continue after the UI is usable. Use the installed framework's retrying assertions and bounded waits, not a one-time read of state that can still change.

When an action causes a response, navigation, download, or popup, register the waiter before triggering the action. Match the intended operation, including method and relevant identity when needed; an unrelated successful response must not satisfy the check. Await completion and assert the user-visible consequence. A response status alone does not establish rendering or durable persistence.

For an authorized persistence check, verify the required saved state through the actual local boundary or reload journey. A UI test with a mocked successful response does not prove that the server saved anything. Keep mocked error-path coverage and real integration evidence distinct.

## Preserve evidence of flakiness

Give tests isolated data and cleanup ownership. Do not share mutable records between parallel workers or rely on another test's order. Exercise immediate and delayed completion when timing caused the defect, plus the relevant failed or cancelled action.

Retain first-attempt failures and retry outcomes separately. A later pass is evidence of intermittent behavior, not proof of a fix. Quarantine requires an owner, reason, follow-up condition, and explicit reporting of lost coverage; never use silent skips or higher retry counts to qualify the affected requirement.

Keep traces, screenshots, and reports scoped and redacted before sharing; they can contain account data and request bodies. A missing trace remains missing. Record the actual browser, build, fixture, action, assertion, and result without claiming unsupported browser or accessibility coverage.

## Check the installed framework's contract

Playwright's [page API](https://playwright.dev/docs/api/class-page#page-wait-for-response) documents registering response waits before the action. Its [readiness guidance](https://playwright.dev/docs/api/class-page#page-wait-for-load-state) discourages `networkidle` as a test assertion. Check the repository's installed version before adapting an API example. These references do not require adopting Playwright in another framework.
