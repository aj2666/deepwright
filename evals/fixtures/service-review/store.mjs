export class MemoryStore {
  #notes = new Map([
    ["note-cedar", { id: "note-cedar", workspaceId: "cedar", title: "Release draft" }],
    ["note-harbor", { id: "note-harbor", workspaceId: "harbor", title: "Support checklist" }],
  ]);

  async get(id) {
    const note = this.#notes.get(id);
    return note ? { ...note } : undefined;
  }

  async save(note) {
    this.#notes.set(note.id, { ...note });
  }
}
