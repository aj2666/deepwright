import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadFixture(name) {
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new RangeError("Invalid fixture name");
  }
  return JSON.parse(await readFile(join("data", `${name}.json`), "utf8"));
}
