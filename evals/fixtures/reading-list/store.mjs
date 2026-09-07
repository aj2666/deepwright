import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function createStore(directory) {
  const filename = join(directory, "items.json");
  return {
    async list() {
      const items = JSON.parse(await readFile(filename, "utf8"));
      if (!Array.isArray(items)) throw new Error("The reading list must be an array");
      return items;
    },
  };
}
