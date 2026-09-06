import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryCache } from "./cache.mjs";
import { createStore } from "./store.mjs";
import { createItemService } from "./item-service.mjs";
import { createRouter } from "./router.mjs";

export function createAppServer({ store = createStore(), cache = new MemoryCache() } = {}) {
  const route = createRouter(createItemService({ store, cache }));
  return createServer(async (request, response) => {
    try {
      const result = await route(request);
      response.setHeader("Content-Type", "application/json");
      if (result.cacheStatus) response.setHeader("X-Cache", result.cacheStatus);
      response.writeHead(result.status).end(JSON.stringify(result.body));
    } catch {
      response.writeHead(500).end(JSON.stringify({ error: "Lookup failed" }));
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAppServer();
  server.listen(0, "127.0.0.1", () => {
    console.log(`http://127.0.0.1:${server.address().port}/items/book-1`);
  });
}
