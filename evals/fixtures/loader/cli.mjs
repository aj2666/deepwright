import { loadFixture } from "./loader.mjs";

const [name, ...extra] = process.argv.slice(2);
if (!name || extra.length) throw new Error("Usage: node cli.mjs <fixture-name>");
console.log(JSON.stringify(await loadFixture(name), null, 2));
