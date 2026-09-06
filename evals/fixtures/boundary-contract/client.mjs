export function label(json) {
  const profile = JSON.parse(json);
  return profile.note === null ? 'No note' : profile.note.toUpperCase();
}
