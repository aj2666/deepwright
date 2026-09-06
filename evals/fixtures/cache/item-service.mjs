export function createItemService({ store, cache }) {
  return {
    async getById(id) {
      const cached = cache.get(id);
      if (cached !== undefined) return { item: cached, cacheStatus: "HIT" };
      const item = await store.findById(id);
      if (item !== undefined) cache.set(id, item);
      return { item, cacheStatus: "MISS" };
    },
  };
}
