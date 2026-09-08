import test from "node:test";
import assert from "node:assert/strict";
import { updateNote, previewNote, publicServiceInfo } from "./handlers.mjs";
import { MemoryStore } from "./store.mjs";

test("an editor can save a note in their workspace", async () => {
  const store = new MemoryStore();
  const result = await updateNote({ role: "editor", workspaceIds: ["cedar"] }, "note-cedar", { title: "Ready" }, store);
  assert.equal(result.status, 200);
  assert.equal((await store.get("note-cedar")).title, "Ready");
});

test("unauthenticated and viewer sessions cannot edit", async () => {
  const store = new MemoryStore();
  assert.equal((await updateNote(null, "note-cedar", { title: "Ready" }, store)).status, 401);
  assert.equal((await updateNote({ role: "viewer", workspaceIds: ["cedar"] }, "note-cedar", { title: "Ready" }, store)).status, 403);
  assert.equal((await store.get("note-cedar")).title, "Release draft");
});

test("cancelled preview is distinct from a storage operation and service info is public", async () => {
  const result = await previewNote("draft", async () => { throw Object.assign(new Error("cancelled"), { name: "AbortError" }); });
  assert.deepEqual(result, { status: 200, body: { cancelled: true } });
  assert.deepEqual(publicServiceInfo(), { status: 200, body: { name: "Team notes", version: 1 } });
});
