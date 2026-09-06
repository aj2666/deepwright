export function createRouter(service) {
  return async (request) => {
    const url = new URL(request.url, "http://localhost");
    const match = /^\/items\/([^/]+)$/.exec(url.pathname);
    if (request.method !== "GET" || !match) return { status: 404, body: { error: "Not found" } };
    let id;
    try { id = decodeURIComponent(match[1]); }
    catch { return { status: 400, body: { error: "Invalid item ID" } }; }
    const { item, cacheStatus } = await service.getById(id);
    return item === undefined
      ? { status: 404, body: { error: "Item not found" } }
      : { status: 200, body: item, cacheStatus };
  };
}
