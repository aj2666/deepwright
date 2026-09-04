---
name: principle-sequence-verifiable-units
description: "Break work into independently checkable units. Use for $deepwright:principle-sequence-verifiable-units."
---

# Sequence work into verifiable units

Order work as a sequence of small units, each ending in a state you can check, and don't advance until the current one is green. The same discipline runs at two altitudes, how you execute and how you deliver.

**Why:** A break caught at the unit that caused it is cheap to localize. A break caught after a batch is buried, and you have already built further on a broken base. Sequencing those same units into a delivery a reviewer can replay turns "trust me" into "watch it go red, then green."

**Execution.** In a sweep, migration, or any run of similar edits, verify each change before starting the next. Never batch the edits and verify once at the end. Each unit is a before/after bracket: known-good state, one change, run the check, then proceed. Record the actual base revision before work starts. Rebase only when the repository workflow and user authorization permit history rewriting, and only after protecting uncommitted work. When a lever does the edits, the per-unit check is nearly free; run it anyway.

**Delivery.** When the task authorizes commits or pull requests, order them so they prove the work. One useful shape is the failing test first, then the fix on top: the first unit shows the bug is real and the next shows it resolved. Other story orders are a subtraction before the reshape, a baseline capture before the treatment, or a scaffold before the feature. Without delivery authorization, apply the same sequence to local edits and checks without creating commits or external records.

**Pattern:**
- Pick the smallest unit that ends in a check: an edit plus its test, or a commit that stands alone.
- Verify before advancing. Red to green per unit, never deferred to a final batch.
- Order the units so the sequence builds confidence on its own, for you while executing and for a reviewer reading the stack.

This complements `$deepwright:principle-prove-it-works`, which keeps each check real, and `$deepwright:principle-build-the-lever`, which makes each unit cheap to verify.
