import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const temporaryDirectories: string[] = [];

function run(
  path: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env
) {
  const result = spawnSync(path, args, { encoding: "utf8", env });
  if (result.error) throw result.error;
  return result;
}

async function executableOnPath(name: string): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory.length === 0) continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH.
    }
  }
  throw new Error(`${name} was not found on PATH`);
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("committed launchers", () => {
  it.each([
    ["deepwright", ["doctor", "--json"]],
    ["orch/orch", ["--help"]],
    ["watch-pr/watch-pr", ["--help"]],
  ] as const)("executes %s from its installed path", (relative, args) => {
    const result = run(join(scriptsDirectory, relative), args);
    expect(result.status, result.stderr).toBe(0);
  });

  it("keeps npm bin symlinks on self-contained bundles", async () => {
    const packageJson = JSON.parse(
      await readFile(join(scriptsDirectory, "package.json"), "utf8")
    ) as { readonly bin: Readonly<Record<string, string>> };
    expect(packageJson.bin).toEqual({
      deepwright: "dist/deepwright.mjs",
      "deepwright-orch": "dist/orch.mjs",
      "deepwright-watch-pr": "dist/watch-pr.mjs",
    });

    const binDirectory = await mkdtemp(join(tmpdir(), "deepwright-bin-"));
    temporaryDirectories.push(binDirectory);
    for (const [name, target] of Object.entries(packageJson.bin)) {
      const link = join(binDirectory, name);
      await symlink(join(scriptsDirectory, target), link);
      const args = name === "deepwright" ? ["doctor", "--json"] : ["--help"];
      const result = run(link, args);
      expect(result.status, result.stderr).toBe(0);
    }
  });

  it("enforces the Node.js 20.19.0 launcher boundary", async () => {
    const binDirectory = await mkdtemp(join(tmpdir(), "deepwright-node-"));
    temporaryDirectories.push(binDirectory);
    const fakeNode = join(binDirectory, "node");
    await writeFile(
      fakeNode,
      `#!/bin/sh
if [ "$1" = "-p" ]; then
  printf '%s\\n' "$FAKE_NODE_VERSION"
  exit 0
fi
exec "$REAL_NODE" "$@"
`
    );
    await chmod(fakeNode, 0o755);
    const wrapper = join(scriptsDirectory, "deepwright");
    const realNode = await executableOnPath("node");
    const baseEnvironment = {
      ...process.env,
      PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
      REAL_NODE: realNode,
    };

    const unsupported = run(wrapper, ["doctor", "--json"], {
      ...baseEnvironment,
      FAKE_NODE_VERSION: "20.18.99",
    });
    expect(unsupported.status).toBe(1);
    expect(unsupported.stdout).toContain(
      "version 20.19.0 or newer is required"
    );

    const minimum = run(wrapper, ["doctor", "--json"], {
      ...baseEnvironment,
      FAKE_NODE_VERSION: "20.19.0",
    });
    expect(minimum.status, minimum.stderr).toBe(0);
  });
});
