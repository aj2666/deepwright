import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCatalog } from "./catalog.mjs";
import { createSearch } from "./search.mjs";

export function createSearchServer(records = createCatalog()) {
  const search = createSearch(records);
  return createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("Content-Type", "application/json");
    if (request.method !== "GET" || url.pathname !== "/search") {
      response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
      return;
    }
    response.end(JSON.stringify(search(url.searchParams.get("q") ?? "")));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createSearchServer();
  server.listen(0, "127.0.0.1", () => {
    console.log(`http://127.0.0.1:${server.address().port}/search?q=harbor`);
  });
}
