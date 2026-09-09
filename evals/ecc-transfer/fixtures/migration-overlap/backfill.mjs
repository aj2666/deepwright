export async function backfill(store) {
  const rows = await store.pending();
  for (const row of rows) {
    await store.write(row.id, { displayName: row.name });
  }
}
