import { createHash } from "node:crypto";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCatalog } from "./catalog.mjs";
import { createSearchServer } from "./server.mjs";

const queries = ["harbor", "guide 000", "ORION", "  aster  ", "no-such-title", "field guide 12"];

export async function runBenchmark() {
  const catalogSize = 2400, warmups = 2, rounds = 7;
  const server = createSearchServer(createCatalog(catalogSize));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const samplesMs = [];
  let checksum;
  try {
    for (let round = 0; round < warmups + rounds; round += 1) {
      const responses = [];
      const start = performance.now();
      for (const query of queries) {
        const response = await fetch(`${base}/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`Search returned HTTP ${response.status}`);
        responses.push(await response.text());
      }
      const elapsed = performance.now() - start;
      const digest = createHash("sha256").update(responses.join("\n")).digest("hex");
      if (checksum !== undefined && checksum !== digest) throw new Error("Search results changed between rounds");
      checksum = digest;
      if (round >= warmups) samplesMs.push(elapsed);
    }
  } finally {
    const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  }
  const ordered = [...samplesMs].sort((left, right) => left - right);
  return { catalogSize, queries, warmups, rounds, samplesMs, medianMs: ordered[3], checksum };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runBenchmark(), null, 2));
}
