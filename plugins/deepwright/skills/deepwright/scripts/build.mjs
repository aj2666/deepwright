#!/usr/bin/env node

import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(scriptsDirectory, "dist");

await build({
  absWorkingDir: scriptsDirectory,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __deepwrightCreateRequire } from "node:module";',
      "const require = __deepwrightCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  bundle: true,
  entryNames: "[name]",
  entryPoints: {
    deepwright: "doctor/entry.ts",
    orch: "orch/entry.ts",
    "watch-pr": "watch-pr/entry.ts",
  },
  format: "esm",
  legalComments: "eof",
  minify: false,
  outExtension: { ".js": ".mjs" },
  outdir: outputDirectory,
  platform: "node",
  sourcemap: false,
  target: "node20",
});

await Promise.all(
  ["deepwright.mjs", "orch.mjs", "watch-pr.mjs"].map((name) =>
    chmod(join(outputDirectory, name), 0o755)
  )
);
