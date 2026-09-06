# Checkout readiness

The checkout change adds the configured tax to an order subtotal. For nonnegative
subtotals up to 1,000,000, `await total(subtotal)` must produce a finite number
equal to the subtotal plus its configured tax. Callers already await the result,
so the helper may return a number or a promise.

`reviewed/base/` and `reviewed/head/` contain the source snapshots from the earlier
review context. `current/base/` and `current/head/` contain the latest base and
the proposed checkout change carried onto it. Each directory is self-contained.
The snapshots contain no Git history, review verdict, or test execution receipt.

Assess whether the current proposal is ready against the stated behavior before
any shipping action. The available materials are these local source snapshots;
no remote service or dependency installation is needed.
