import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../evals/fixtures/shipping-context/", import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
delete env.NODE_TEST_CONTEXT;
Object.assign(env, {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
});

function command(executable, args, cwd, status, input) {
  const result = spawnSync(executable, args, {
    cwd, env, input, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, status, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.ok(result.stdout.trim(), "The command must produce evidence, not just a successful exit");
  return result.stdout;
}

function patch(context) {
  // Both comparisons use base/ and head/ paths; no repository or commits exist.
  const diff = command("git", [
    "--no-pager", "diff", "--no-index", "--no-color", "--no-ext-diff", "--no-textconv",
    "--no-renames", "--diff-algorithm=myers", "--src-prefix=a/", "--dst-prefix=b/", "--", "base", "head",
  ], context, 1);
  assert.equal((diff.match(/^diff --git /gm) ?? []).length, 1);
  assert.match(diff, /^diff --git a\/base\/checkout\.mjs b\/head\/checkout\.mjs$/m);
  const output = command("git", ["patch-id", "--stable"], context, 0, diff).trim();
  const match = /^([a-f0-9]{40}) ([a-f0-9]{40})$/.exec(output);
  assert.ok(match, `Expected exactly one stable patch ID, received ${output}`);
  return { diff, id: match[1] };
}

function observe(snapshot) {
  // Observer assertions remain outside the neutral source snapshots.
  const source = `
    import { total } from "./checkout.mjs";
    import { taxRate } from "./pricing.mjs";
    const rate = taxRate();
    const result = await total(100);
    console.log(JSON.stringify({
      rate: await rate, asynchronousRate: rate instanceof Promise,
      total: String(result), finite: Number.isFinite(result), nan: Number.isNaN(result),
      type: typeof result,
    }));
  `;
  // String preserves NaN in the evidence; JSON numeric encoding would hide it as null.
  return JSON.parse(command(process.execPath, ["--input-type=module", "--eval", source], snapshot, 0));
}

test("the same stable patch ID can have different behavior after its surrounding base changes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "deepwright-shipping-context-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(fixture, directory, { recursive: true });
  const reviewed = patch(path.join(directory, "reviewed"));
  const current = patch(path.join(directory, "current"));
  assert.equal(current.diff, reviewed.diff);
  assert.equal(current.id, reviewed.id);

  const common = { rate: 0.2, total: "100", finite: true, nan: false, type: "number" };
  assert.deepEqual(observe(path.join(directory, "reviewed", "base")), { ...common, asynchronousRate: false });
  assert.deepEqual(observe(path.join(directory, "current", "base")), { ...common, asynchronousRate: true });
  const before = observe(path.join(directory, "reviewed", "head"));
  const after = observe(path.join(directory, "current", "head"));
  assert.deepEqual(before, { ...common, total: "120", asynchronousRate: false });
  assert.deepEqual(after, { ...common, total: "NaN", finite: false, nan: true, asynchronousRate: true });
  t.diagnostic(`Stable patch ID ${current.id}; reviewed total=${before.total}, current total=${after.total}.`);
});
