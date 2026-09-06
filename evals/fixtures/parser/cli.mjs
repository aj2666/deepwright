import { readFile } from "node:fs/promises";
import { parseSettings } from "./parser.mjs";

const [filename, ...extra] = process.argv.slice(2);
if (!filename || extra.length) throw new Error("Usage: node cli.mjs <settings-file>");
console.log(JSON.stringify(parseSettings(await readFile(filename, "utf8")), null, 2));
