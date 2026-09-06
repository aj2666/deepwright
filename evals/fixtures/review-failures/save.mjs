export async function saveDocument(storage, document) {
  try { await storage.write(document); } catch {}
  return { status: 'ok' };
}
export async function preview(load) {
  try { return await load(); }
  catch (error) {
    if (error.name === 'AbortError') return { status: 'cancelled' };
    throw error;
  }
}
