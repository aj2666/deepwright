# Change a product interface

Use for frontend or native UI work that changes how someone completes a task. Select the affected checks below; do not turn a copy edit or established styling adjustment into a redesign or a full accessibility audit. Preserve the enclosing workflow: a specification proposes checks, an authorized build exercises them, and a read-only review inspects source and existing evidence.

## Choose the journey and its checks

Start from the existing component system and one concrete journey: the entry point, user action, resulting state, and recovery if it fails. Reuse the acceptance criteria and identify which interactions actually change.

- **Controls and meaning.** Reuse semantic controls and the project's established interaction pattern. Check the accessible name, role, label, and state a user needs to operate a changed control. A clickable element or decorative icon is not automatically a usable button; adding ARIA alone does not supply keyboard behavior.
- **Keyboard and focus.** For a changed dialog, menu, form, or composite widget, check the relevant keyboard path, visible focus, and where focus goes when content opens, closes, disappears, or reports an error. Follow the existing widget convention instead of assigning every interaction the same keys. For a dialog, verify entry, dismissal, and return to a sensible surviving control; do not assume a mouse click establishes keyboard completion.
- **State and recovery.** Check the meaningful loading, empty, validation, failure, and success transitions for this journey. Preserve entered work where the contract requires it. A delayed response must not replace a newer selection or make a cancelled action appear successful. When handlers compose asynchronous updates or resets, use [click-path tracing](../../how/references/click-path-audit.md) to choose the event sequence and final-state assertion.
- **Layout and presentation.** For changed layout, check representative supported narrow and wide viewports and content that can wrap or grow. Inspect zoom/reflow, clipping, focus visibility, and contrast when the change affects them, using the project's accessibility target. Respect existing reduced-motion behavior when adding animation. Do not claim standards conformance from a screenshot or one automated scan.

A small addition using a proven component may need only its changed state and one regression journey. Preserve existing coverage; do not invent unrelated widget requirements or install a new browser or accessibility package merely because a check is useful.

## Verify the composed result

When writing or debugging browser tests, use [browser verification](browser-verification.md) for action/wait ordering, observable readiness, isolated state, and honest retry evidence.

Use the repository's existing harness or available host control on an authorized local surface. Exercise the action through the real entry point, then check the visible result and any required saved state. Inspect the resulting accessibility tree or semantic markup when that is the relevant contract. A direct store call does not prove that the control is reachable, named, or wired correctly.

Retain a compact receipt: criterion, build or snapshot, viewport/input method, action sequence, observed outcome, and the artifact that supports it. Keep interaction assertions separate from screenshots. For exact visual matching, use [Visual parity](../playbooks/visual-parity.md); an image match does not establish behavior or accessibility.

If the browser fails to launch, a selector is invalid, or the target cannot be reached, preserve that failed check under the [coverage contract](evidence-coverage.md). Source inspection may still establish a defect, but the missing interaction proof remains blocked. Give the smallest reproducible manual check when automated control is unavailable; do not report it as executed.

## Review and evidence

For read-only review, apply only the relevant questions above to source and matching receipts. Trace a concrete reachable consequence before reporting a defect; distinguish inaccessible behavior from an untested requirement. Describe missing checks without driving the app, editing files, or installing tools under the review's no-write boundary.

Example: a save dialog looks correct in a screenshot but its close handler removes the focused element. Inspect whether focus returns to a usable control and whether an existing keyboard receipt exercises save and dismissal. Report a traced focus defect or missing evidence separately; the screenshot proves neither outcome.
