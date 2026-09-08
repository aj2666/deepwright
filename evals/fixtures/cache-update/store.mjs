export function createStore() {
  const items = new Map([
    ["book-1", { id: "book-1", title: "Cedar field guide" }],
    ["book-2", { id: "book-2", title: "Harbor atlas" }],
  ]);
  return {
    async findById(id) { return items.get(id); },
    async save(item) {
      if (!items.has(item.id)) return undefined;
      const saved = { ...item };
      items.set(saved.id, saved);
      return saved;
    },
  };
}
