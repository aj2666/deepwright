import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSamePackage,
  inventory,
  isolatedHostEnv,
} from "./verify-portable-hosts.mjs";

const cli = fileURLToPath(new URL("./verify-portable-hosts.mjs", import.meta.url));

test("CLI import remains inert with an eval argument naming the verifier", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", "await import(process.argv[1]); console.log('imported');", cli], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "imported\n");
});

test("isolated host env unsets XDG, PI, and OMP state without rewriting caller env", () => {
  const home = "/tmp/deepwright-isolated-home";
  const from = {
    HOME: "/Users/someone",
    USERPROFILE: "/Users/someone",
    PATH: "/bin",
    XDG_DATA_HOME: "/Users/someone/.local/share",
    XDG_STATE_HOME: "/Users/someone/.local/state",
    XDG_CONFIG_HOME: "/Users/someone/.config",
    XDG_CUSTOM_ROOT: "/Users/someone/custom-state",
    PI_CODING_AGENT_DIR: "/Users/someone/.omp/agent",
    PI_CONFIG_DIR: ".omp",
    PI_PROFILE: "work",
    OMP_PROFILE: "work",
    OMP_WORKTREE_DIR: "/Users/someone/.omp/wt",
    CLAUDE_CONFIG_DIR: "/Users/someone/.claude",
    KEEP_ME: "yes",
  };
  const env = isolatedHostEnv(home, { DEEPWRIGHT_HOSTS_MODE: "inspect-marketplace" }, from);
  const child = spawnSync(process.execPath, ["-e", "console.log(JSON.stringify(process.env))"], { env, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const childEnv = JSON.parse(child.stdout);
  assert.deepEqual(Object.keys(childEnv).filter(key => /^(XDG_|PI_|OMP_)/.test(key)), []);
  assert.equal(childEnv.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(childEnv.HOME, home);
  assert.equal(childEnv.USERPROFILE, home);
  assert.equal(from.XDG_DATA_HOME, "/Users/someone/.local/share");
  assert.equal(from.HOME, "/Users/someone");
});

test("package inventory includes manifests, assets, and licenses and excludes git and node_modules", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "deepwright-hosts-inventory-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, ".claude-plugin"));
  await mkdir(path.join(root, "assets"));
  await mkdir(path.join(root, ".git/objects"), { recursive: true });
  await mkdir(path.join(root, "node_modules/left-pad"), { recursive: true });
  await writeFile(path.join(root, ".claude-plugin/plugin.json"), "{\"name\":\"deepwright\"}\n");
  await writeFile(path.join(root, "LICENSE"), "Apache-2.0\n");
  await writeFile(path.join(root, "assets/icon.bin"), Buffer.from([0, 1, 2, 3]));
  await writeFile(path.join(root, ".git/objects/pack"), "git");
  await writeFile(path.join(root, "node_modules/left-pad/index.js"), "module.exports=0;\n");
  const found = await inventory(root);
  assert.deepEqual(found.files.map(file => file.path), [
    ".claude-plugin/plugin.json",
    "LICENSE",
    "assets/icon.bin",
  ]);
  const copy = await inventory(root);
  assertSamePackage(found, copy, "identical trees");
  await writeFile(path.join(root, "assets/icon.bin"), Buffer.from([0, 1, 2, 4]));
  const changed = await inventory(root);
  assert.throws(() => assertSamePackage(found, changed, "same-size byte drift"));
});
