import { main } from "../discovery/cli.ts";

process.exitCode = await main(process.argv.slice(2));
