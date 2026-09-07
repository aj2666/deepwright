import test from "node:test";
import assert from "node:assert/strict";
import { saveTitle, cancelPreview } from "./save.mjs";

test("failed storage retains work and allows an explicit successful retry", async () => {
  const state = { title: "Draft", saving: false, message: "" };
  assert.equal(await saveTitle(state, { async write() { throw new Error("offline"); } }), false);
  assert.equal(state.title, "Draft");
  assert.equal(state.message, "Could not save. Try again.");
  assert.equal(state.saving, false);
  let saved;
  assert.equal(await saveTitle(state, { async write(value) { saved = value; } }), true);
  assert.equal(saved, "Draft");
  assert.equal(state.message, "Saved");
});

test("cancelling preview does not change the saved title or status", () => {
  const state = { title: "Draft", message: "Saved", previewOpen: true };
  cancelPreview(state);
  assert.deepEqual(state, { title: "Draft", message: "Saved", previewOpen: false });
});
