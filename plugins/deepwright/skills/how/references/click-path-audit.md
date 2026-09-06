# Trace a user action through state

Use for UI bugs or explanations where one action invokes multiple handlers, store operations, effects, or asynchronous completions. Read-only explanation and review stay read-only; executing the UI is appropriate only within the enclosing task's allowed effects.

Start with the user's intended result and concrete starting state. Find the real event handler and list its calls in execution order. For each state-changing action, read what it sets, clears, or derives, including resets hidden inside helpers. Track the relevant state fields through the entire chain and compare the final visible state with the intended result.

For example, `selectItem(id); closePicker()` may set the selection and then clear it if closing resets the selection store. Explaining each action in isolation would miss why the click appears to do nothing.

Follow applicable timing edges: effects after render, captured values in callbacks, multiple requests finishing out of order, cancellation, and navigation or unmount cleanup. Separate scheduling an operation from completing it. Name the interleaving needed for a suspected race and what makes it reachable; do not infer runtime order merely from source layout.

Return a short trigger → call → state → visible-result trace with source pointers, the first point where intent diverges, and any unresolved timing assumptions. For an authorized fix, test the actual handler composition or UI event and resulting state; isolated action tests can all pass while their composition fails. Control async completion order where it is the discriminating case. Recheck nearby paths that share a reset or state owner without expanding into an unrelated frontend audit.
