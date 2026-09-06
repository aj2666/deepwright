# Share the boundary before splitting implementation

Use when consumers and providers will be implemented separately, or a change crosses a serialized boundary. A local function with one owner usually needs only its existing typed interface. Do not add a schema framework merely to check this box.

Choose one authoritative contract artifact in the project's established format: an existing OpenAPI document, JSON Schema, protocol definition, or shared type. State the operation, request and response shapes, required versus optional fields, null and omitted semantics, error representation, and compatibility obligations that matter to this change. Record its revision or content fingerprint in each dependent brief. Examples illustrate the contract; they do not replace constraints.

Identify the provider, each affected consumer, test doubles, and the owner of contract changes. Implement against the same artifact. If it changes, notify dependent workers and recheck their affected assumptions before integration. Separate branches alone do not make mismatched interfaces independent.

Verify at the boundary that can lose information:

- Exercise real provider serialization and consumer parsing on representative success, empty or optional, and failure paths. A shared compile-time type cannot prove that JSON preserved an omitted value, date, identifier, or error shape.
- Check doubles against the same contract. A green consumer test with a hand-written response is insufficient evidence of provider compatibility.
- For a rolling migration, name the supported old/new provider-consumer combinations and test those combinations. Do not silently assume simultaneous deployment; do not invent backwards compatibility the product does not require.

Report which pairings and paths were checked and which remain unavailable. Agreement on a schema and separate passing unit tests do not prove integration. Keep contract changes tied to the original acceptance criteria; implementation convenience cannot redefine them.
