# Profile boundary

Approved contract: GET /profile returns JSON containing id (string) and note (string or null). Both keys must be present. Null means no note. The web client and provider will ship independently; the currently deployed client remains supported.

The draft implementation and current tests are supplied for design review. No execution receipt is supplied. Keep the existing format in contract.json.
