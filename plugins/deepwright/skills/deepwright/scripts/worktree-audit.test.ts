import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "worktree-audit.sh"
);
const directories: string[] = [];

function git(repo: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("worktree-audit", () => {
  it("derives the default ref and holds an untracked linked worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwright worktree audit "));
    directories.push(root);
    const repo = join(root, "repo");
    const linked = join(root, "linked worktree");
    git(root, ["init", "--initial-branch=trunk", repo]);
    git(repo, ["config", "user.name", "Deepwright Test"]);
    git(repo, ["config", "user.email", "deepwright@example.com"]);
    await writeFile(join(repo, "tracked.txt"), "tracked\n");
    git(repo, ["add", "tracked.txt"]);
    git(repo, ["commit", "-m", "initial"]);
    git(repo, ["branch", "topic"]);
    git(repo, ["update-ref", "refs/remotes/upstream/trunk", "HEAD"]);
    git(repo, [
      "symbolic-ref",
      "refs/remotes/upstream/HEAD",
      "refs/remotes/upstream/trunk",
    ]);
    git(repo, ["worktree", "add", linked, "topic"]);
    await writeFile(join(linked, "untracked.txt"), "keep me\n");

    const before = git(repo, ["status", "--porcelain=v1"]);
    const result = spawnSync("bash", [SCRIPT, repo], { encoding: "utf8" });
    if (result.error) throw result.error;
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# default-branch\ttrunk");
    const topic = result.stdout
      .split(/\r?\n/)
      .find((line) => line.split("\t")[2] === "topic");
    expect(topic).toBeDefined();
    const columns = topic?.split("\t") ?? [];
    expect(columns.slice(1, 9)).toEqual([
      "no",
      "topic",
      git(repo, ["rev-parse", "topic"]),
      "YES",
      "0",
      "1",
      "not-queried",
      "hold-uncommitted",
    ]);
    expect(git(repo, ["status", "--porcelain=v1"])).toBe(before);
  });

  it("contains no network, prune, deletion, or private-app-data command", async () => {
    const source = await readFile(SCRIPT, "utf8");
    expect(source).not.toMatch(/\bgit\s+fetch\b/);
    expect(source).not.toMatch(/\bgit\s+worktree\s+prune\b/);
    expect(source).not.toMatch(/\brm\s/);
    expect(source).not.toMatch(/\.codex\//);
    expect(source).not.toContain(["agent", "transcripts"].join("-"));
    expect(source).not.toMatch(/\bgh\s/);
  });
});
