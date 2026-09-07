export async function listItems(store) {
  return { items: await store.list() };
}
