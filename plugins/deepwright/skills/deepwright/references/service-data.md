# Change a service or persisted data

Use when a backend, API, job, or data change affects access, persisted state, or a consumer's observable contract. Select the relevant boundaries; a pure formatting helper needs neither a database exercise nor an authentication audit. Specification and design produce the contract and checks; implementation executes authorized checks; read-only review uses source and existing receipts.

## Identify what must remain true

Trace the request or job from its actual caller through enforcement and storage to the response or effect. Reuse [the shared boundary contract](../../architect/references/shared-boundary-contract.md) for request/response shapes, serialization, and supported old/new consumers. Add only the invariants the current change puts at risk:

- **Access and ownership.** Distinguish the authenticated principal from permission to act on the requested resource. Trace where tenant, owner, role, or capability restrictions are enforced; accepting a resource identifier is not proof of access. Include a permitted operation and the relevant denied principal/resource pairing. Check that denial leaves protected data and side effects unchanged, and that errors do not expose information the contract forbids. Do not invent a role policy when the user has left it unsettled.
- **Persistence and partial failure.** Name the durable outcome and the atomic boundary. Identify effects outside a transaction, such as queued jobs or remote calls, and what the caller observes if a later step fails. Reuse [Idempotency](../../principle-make-operations-idempotent/SKILL.md) for retry identity and uncertain outcomes. A rolled-back database write cannot undo an external effect; select a check at the failure point that could violate the invariant.
- **Concurrency.** When multiple requests can update the same invariant, check the actual transaction, conditional update, or ownership mechanism at storage. Choose a representative interleaving, such as two reservations for one remaining item. Independent sequential unit tests cannot establish that both writers will not succeed.
- **Data evolution.** For a schema change or backfill, inspect representative existing records, constraints, and the supported application versions before choosing a migration. Separate adding support, moving data/callers, and removing obsolete shape when they cannot change together. State how interrupted work resumes and how data is recovered if the new behavior fails; a destructive migration may need restoration or a forward repair rather than a fictional reversible down step. Exercise this on disposable representative data, never infer permission to migrate shared data from permission to edit migration code.
- **Collections.** When changing pagination, ordering, or filtering, establish the order and tie-breaker, cursor or offset meaning, and relevant empty/last-page behavior. Check tied values and an insert or delete between pages when the promised consistency requires it. Do not add snapshot guarantees or a new pagination scheme the product does not require.

Keep only the applicable checks. A response-field addition with one owner may need serialization and compatibility evidence; it does not automatically need a migration, retry design, or new infrastructure.

## Verify at the affected boundary

Use the existing service and disposable storage harness when available. Exercise requests through the enforcement path and inspect the durable result, including a relevant rejected or interrupted operation. Use [TDD](../../tdd/SKILL.md) for behavioral slices and the shared boundary checks for real provider/consumer pairing. Mocking the authorization or persistence layer away does not prove its invariant.

Return the criterion, request/job scenario, principal and fixture role without credentials, tested snapshot, observed response and persisted effects, and the matching receipt. For migrations, name the starting data shape, interrupted state when relevant, resulting records/invariants, and untested compatibility pairings. Keep supplied assumptions distinct from approved requirements.

If a database, credential flow, or service is unavailable, separate the verified local contract from blocked integration. A failed harness command is an error, not a successful empty query. Use the [coverage contract](evidence-coverage.md); do not replace the missing boundary with a permissive mock and declare it proved, provision a new service, or try a shared environment merely to finish the check.

## Review and evidence

For read-only review, use the applicable invariants as questions about the actual enforcement and persistence path. A security finding needs the reachable input, missing restriction, and protected effect; a generic warning is insufficient. Compare assertions with matching execution receipts and distinguish a confirmed defect from absent evidence. Propose a discriminating request or event order for a missing check without executing it or changing data under the review's no-write boundary.

Example: an authenticated update endpoint filters by record ID but omits the tenant condition used by its read endpoint. Trace whether another enforcement layer restricts the update. If none does, identify the cross-tenant update path and expected denial check; successful same-tenant unit tests do not clear it.
