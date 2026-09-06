export function formatSettings(entries) {
  return entries.sort((left, right) => left.key.localeCompare(right.key))
    .map(({ key, value }) => `${key}=${value}`).join("\n");
}
