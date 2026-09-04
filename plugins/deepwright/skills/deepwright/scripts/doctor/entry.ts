import { main } from "./doctor.ts";

process.exitCode = await main(process.argv.slice(2));
