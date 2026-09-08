export function createRouter(service) {
  return async (request) => {
    const url = new URL(request.url, "http://localhost");
    const match = /^\/items\/([^/]+)$/.exec(url.pathname);
    if (!match || !["GET", "PUT"].includes(request.method)) return { status: 404, body: { error: "Not found" } };
    let id;
    try { id = decodeURIComponent(match[1]); }
    catch { return { status: 400, body: { error: "Invalid item ID" } }; }
    if (request.method === "GET") {
      const { item, cacheStatus } = await service.getById(id);
      return item === undefined
        ? { status: 404, body: { error: "Item not found" } }
        : { status: 200, body: item, cacheStatus };
    }
    let body;
    try {
      request.setEncoding("utf8");
      let source = "";
      for await (const chunk of request) source += chunk;
      body = JSON.parse(source);
    } catch { return { status: 400, body: { error: "Invalid JSON" } }; }
    if (typeof body?.title !== "string" || !body.title.trim()) return { status: 400, body: { error: "Invalid title" } };
    try {
      const item = await service.updateTitle(id, body.title);
      return item === undefined
        ? { status: 404, body: { error: "Item not found" } }
        : { status: 200, body: item };
    } catch { return { status: 500, body: { error: "Update failed" } }; }
  };
}
