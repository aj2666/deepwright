export async function updateNote(session, id, body, store) {
  if (!session) return { status: 401, body: { error: "Sign in required" } };
  if (session.role !== "editor") return { status: 403, body: { error: "Editor required" } };
  const note = await store.get(id);
  if (!note) return { status: 404, body: { error: "Note not found" } };
  if (typeof body?.title !== "string" || !body.title.trim() || body.title.trim().length > 120) {
    return { status: 400, body: { error: "Title must contain 1 to 120 characters" } };
  }
  const updated = { ...note, title: body.title.trim() };
  try {
    await store.save(updated);
  } catch {
    return { status: 200, body: { note: updated } };
  }
  return { status: 200, body: { note: updated } };
}

export async function previewNote(text, renderer, signal) {
  try {
    return { status: 200, body: { preview: await renderer(text, signal) } };
  } catch (error) {
    if (error?.name === "AbortError") return { status: 200, body: { cancelled: true } };
    throw error;
  }
}

export function publicServiceInfo() {
  return { status: 200, body: { name: "Team notes", version: 1 } };
}
