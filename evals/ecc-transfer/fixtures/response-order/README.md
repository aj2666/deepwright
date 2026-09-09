# Save response coordination

`saveAndObserve(page, signal)` clicks Save once and returns its POST `/save` response.
The page interface provides `clickSave()` and `waitForResponse(predicate, { signal })`.
The response can arrive during the click or later. Other responses must not complete
this operation. Failed save responses remain observable; this function does not claim
that a response alone proves visible or persisted state. Preserve abort behavior.
