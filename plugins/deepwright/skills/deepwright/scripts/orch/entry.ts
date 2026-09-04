import { main } from "./orch.ts";

process.exitCode = await main(process.argv.slice(2));
