import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.mjs";
import { listItems } from "./application.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);

export function createReadingListServer({ dataDir = join(root, "data") } = {}) {
  const store = createStore(dataDir);
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const json = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method === "GET" && pathname === "/api/items") {
        json(200, await listItems(store));
      } else if (request.method === "GET" && publicFiles.has(pathname)) {
        const [filename, contentType] = publicFiles.get(pathname);
        response.writeHead(200, { "Content-Type": contentType });
        response.end(await readFile(join(root, "public", filename)));
      } else {
        json(404, { error: "Not found" });
      }
    } catch {
      json(500, { error: "The reading list is unavailable. Please try again." });
    }
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createReadingListServer({ dataDir: process.env.READING_LIST_DATA_DIR || join(root, "data") });
  server.listen(Number(process.env.READING_LIST_PORT || 0), "127.0.0.1", () => {
    console.log(`http://127.0.0.1:${server.address().port}`);
  });
}
