# Team notes endpoint

This small JavaScript service receives an already authenticated `session` from
the host. Its `workspaceIds` are the workspaces that principal may access;
`role: "editor"` allows editing inside those workspaces. Authentication does not
grant membership in every workspace. Missing sessions receive 401, viewers
cannot edit, and an editor requesting another workspace's note receives 404
without changing or revealing that note.

`updateNote(session, id, body, store)` accepts a nonempty title of at most 120
characters. A 200 response means the returned note has been saved. Storage
failure must produce a failure response, leaving the previous note intact so
the client can retain the entered title and offer retry.

`previewNote` operates on text already supplied by the caller. Cancellation is
an expected UI action and returns `{cancelled: true}`; it neither edits a note
nor represents a failed save. `publicServiceInfo` is intentionally public and
contains no note or tenant data.

`MemoryStore` is synthetic process-local storage for this project. The unit
tests cover ordinary operations; they do not establish complete authorization
or failure-path coverage. Run `node --test` only when execution is authorized.
