import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { updateNote, previewNote, publicServiceInfo } from "../evals/fixtures/service-review/handlers.mjs";
import { MemoryStore } from "../evals/fixtures/service-review/store.mjs";

const editor = { role: "editor", workspaceIds: ["cedar"] };

async function observe(update) {
  const store = new MemoryStore();
  const denied = await update(editor, "note-harbor", { title: "Changed" }, store);
  const protectedNote = await store.get("note-harbor");
  const diskFailure = Object.assign(new MemoryStore(), { async save() { throw new Error("Storage unavailable"); } });
  const failed = await update(editor, "note-cedar", { title: "Unsaved" }, diskFailure);
  return {
    ownership: denied.status === 404 && protectedNote.title === "Support checklist" && !denied.body.note,
    failedSave: failed.status >= 500 && !failed.body.note && (await diskFailure.get("note-cedar")).title === "Release draft",
  };
}

test("service review has reachable cross-workspace mutation and false successful save", async () => {
  assert.deepEqual(await observe(updateNote), { ownership: false, failedSave: false });
});

test("independent correct enforcement and error response clear both review mechanisms", async () => {
  const source = await readFile(new URL("../evals/fixtures/service-review/handlers.mjs", import.meta.url), "utf8");
  const fixed = source
    .replace('if (!note) return', 'if (!note || !session.workspaceIds.includes(note.workspaceId)) return')
    .replace('} catch {\n    return { status: 200, body: { note: updated } };', '} catch {\n    return { status: 500, body: { error: "Could not save" } };');
  const corrected = await import(`data:text/javascript,${encodeURIComponent(fixed)}`);
  assert.deepEqual(await observe(corrected.updateNote), { ownership: true, failedSave: true });
  const store = new MemoryStore();
  assert.equal((await corrected.updateNote(editor, "note-cedar", { title: " Saved " }, store)).body.note.title, "Saved");
});

test("legitimate preview cancellation and public metadata remain nonissues", async () => {
  assert.deepEqual(await previewNote("text", async () => { throw { name: "AbortError" }; }), { status: 200, body: { cancelled: true } });
  const unexpected = new Error("Renderer failed");
  await assert.rejects(previewNote("text", async () => { throw unexpected; }), (error) => error === unexpected);
  assert.deepEqual(publicServiceInfo(), { status: 200, body: { name: "Team notes", version: 1 } });
});
