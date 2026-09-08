# Save-flow maintenance note

Approved addition: create the focused `verify-save-flow` workflow in Harbor
Tools. It should inspect the caller, storage result and visible success or
failure state, then exercise meaningful failure/recovery checks only when
execution is authorized. Give it a narrow explicit activation and a useful
handoff with matching source/receipt evidence.

Two supplied local changes previously showed a success banner when storage
rejected. Both had a test that checked only whether the save promise resolved.
The current `app/save.mjs` preserves the submitted title and displays an error
after a failed write. A real rejected-storage test now checks that behavior.
Use that existing implementation as a behavior example; this assignment is
not a request to modify application code.

Counterexample: preview cancellation is a normal user action. It is neither a
failed save nor a reason to retry a write. A wording-only banner edit does not
need a new browser dependency or a full benchmark.

Available evidence is limited to this record and the supplied files. No
production logs, hidden histories, remote systems, or installed host evidence
are provided. Existing tests are available to run locally under the stated
permissions, but their presence alone is not a passing execution receipt.
