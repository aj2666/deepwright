export async function saveTitle(state, storage) {
  const title = state.title;
  state.saving = true;
  state.message = "Saving";
  try {
    await storage.write(title);
    state.message = "Saved";
    return true;
  } catch {
    state.message = "Could not save. Try again.";
    return false;
  } finally {
    state.saving = false;
  }
}

export function cancelPreview(state) {
  state.previewOpen = false;
}
