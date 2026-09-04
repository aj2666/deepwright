import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEOUT_SECONDS,
  type CliRuntime,
  main,
  parseArgs,
} from "./cli.ts";
import { GhGitHubReader, WatcherQueryError } from "./github.ts";
import { fakeReader, passingCheck } from "./fakes.test-helper.ts";
import { renderJson, renderPretty } from "./render.ts";
import type {
  GitHubReader,
  WatchDeadline,
  WatcherVerdict,
} from "./types.ts";
import { parsePrNumber } from "./types.ts";

const silentIo = { stdout: () => {}, stderr: () => {} };

function waitForDeadline(deadline: WatchDeadline | undefined): Promise<never> {
  if (deadline === undefined) throw new Error("missing watch deadline");
  return new Promise((_, reject) => {
    const abort = (): void => reject(new Error("watch deadline reached"));
    if (deadline.signal.aborted) abort();
    else deadline.signal.addEventListener("abort", abort, { once: true });
  });
}

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("test exceeded outer wall-clock guard")),
          milliseconds
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function testRuntime(reader: GitHubReader): {
  readonly runtime: CliRuntime;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    runtime: {
      reader,
      clock: {
        now: () => 0,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep() {
          throw new Error("test unexpectedly slept");
        },
      },
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
  };
}

describe("parseArgs", () => {
  it("uses the specified defaults", () => {
    expect(parseArgs([], silentIo)).toMatchObject({
      owner: null,
      repo: null,
      pr: null,
      mode: "single",
      stackPrs: [],
      statusOnly: false,
      pretty: false,
      polling: {
        interval: 60,
        sweepInterval: 300,
        timeout: DEFAULT_TIMEOUT_SECONDS,
        maxQueryErrors: 5,
        allowDraft: false,
      },
    });
  });

  it("parses a frozen queued stack bottom-to-top", () => {
    const parsed = parseArgs(
      [
        "--queued-stack",
        "--stack-prs",
        "#10, 11,#12",
        "--interval",
        "2.5",
        "--sweep-interval",
        "30",
        "--timeout",
        "0",
        "--max-query-errors",
        "3",
        "--allow-draft",
        "--pretty",
      ],
      silentIo
    );
    expect(parsed.mode).toBe("queued-stack");
    expect(parsed.stackPrs.map(Number)).toEqual([10, 11, 12]);
    expect(parsed.polling).toEqual({
      interval: 2.5,
      sweepInterval: 30,
      timeout: 0,
      maxQueryErrors: 3,
      allowDraft: true,
    });
    expect(parsed.pretty).toBe(true);
  });

  it("rejects every invalid mode and numeric shape as usage", async () => {
    const invalid = [
      ["--unknown"],
      ["--interval", "0"],
      ["--sweep-interval", "-1"],
      ["--timeout", "-1"],
      ["--max-query-errors", "1.5"],
      ["--pr", "2147483648"],
      ["--owner", "owner"],
      ["--repo", "repo"],
      ["--stack", "--queued-stack"],
      ["--stack-prs", "1,2"],
      ["--queued-stack", "--stack-prs", "1,1"],
    ];
    for (const argv of invalid) {
      const harness = testRuntime(fakeReader());
      expect(await main(argv, harness.runtime)).toBe(64);
      expect(harness.stdout).toEqual([]);
      expect(harness.stderr.join("")).toContain("error:");
    }
  });
});

describe("rendering", () => {
  const context = {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const status = {
    schemaVersion: 1,
    sequence: 1,
    observedAt: "2026-07-26T00:00:00.000Z",
    mode: "single",
    kind: "STATUS",
    terminal: true,
    exitCode: 0,
    reason: "status-only",
    rows: [
      {
        kind: "merged",
        context,
        facts: {
          context,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          reviewDecision: "APPROVED",
          headRefOid: "head",
          headRefName: "feature",
          baseRefName: "main",
          state: "MERGED",
          mergedAt: "now",
          isDraft: false,
        },
      },
    ],
  } satisfies WatcherVerdict;

  it("emits compact valid JSON by default", () => {
    const rendered = renderJson(status);
    expect(rendered.endsWith("\n")).toBe(true);
    expect(JSON.parse(rendered)).toEqual(status);
  });

  it("renders the Markdown table from the same verdict only", () => {
    const rendered = renderPretty(status);
    expect(rendered).toContain("| PR | CI | Review | Merge |");
    expect(rendered).toContain(
      "| [#1](https://github.com/owner/repo/pull/1) | \u2014 | \u2014 | ✅ merged |"
    );
  });

  it("removes terminal controls from untrusted pretty output", () => {
    const hostile = {
      schemaVersion: 1,
      sequence: 1,
      observedAt: "2026-07-26T00:00:00.000Z",
      mode: "single",
      kind: "BLOCKER",
      terminal: true,
      exitCode: 3,
      blocker: {
        kind: "review-threads",
        pr: context,
        threads: [
          {
            id: "thread\u001b]0;spoof\u0007",
            firstComment: {
              authorLogin: "attacker\u202e",
              body: "body\rFORGED\nSECOND\u001b]52;c;c3Bvb2Y=\u0007",
              path: "file.ts\u001b[2J",
              line: 1,
              createdAt: "now",
            },
            isAutomatedReview: false,
            automatedReviewPasses: 0,
          },
        ],
      },
    } satisfies WatcherVerdict;
    const rendered = renderPretty(hostile);
    expect(rendered).not.toContain("\u001b");
    expect(rendered).not.toContain("\u0007");
    expect(rendered).not.toContain("\r");
    expect(rendered).not.toContain("\u202e");
    expect(rendered).toContain("body FORGED SECOND");
    const json = renderJson(hostile);
    expect(json).not.toContain("\u202e");
    expect(JSON.parse(json)).toEqual(hostile);
  });

  it("removes terminal controls from retry failure details", () => {
    const retry = {
      schemaVersion: 1,
      sequence: 1,
      observedAt: "2026-07-26T00:00:00.000Z",
      mode: "single",
      kind: "RETRY",
      terminal: false,
      consecutiveFailures: 1,
      retryInSeconds: 60,
      failure: {
        kind: "command-exit",
        retryable: true,
        detail: "network\u001b]0;spoof\u0007\r\nFORGED\u202e",
        code: 1,
      },
    } satisfies WatcherVerdict;
    const rendered = renderPretty(retry);
    expect(rendered).not.toContain("\u001b");
    expect(rendered).not.toContain("\u0007");
    expect(rendered).not.toContain("\r");
    expect(rendered).not.toContain("\u202e");
    expect(rendered).toContain("detail=network]0;spoof FORGED");
  });
});

describe("main", () => {
  it("returns EX_USAGE 64 and writes usage errors only to stderr", async () => {
    const harness = testRuntime(fakeReader());
    expect(await main(["--interval", "0"], harness.runtime)).toBe(64);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr.join("")).toContain(
      "option '--interval <seconds>' argument '0' is invalid"
    );
  });

  it("bypasses the queue machine for queued-stack status-only", async () => {
    const reader = fakeReader();
    const harness = testRuntime(reader);
    const code = await main(
      [
        "--owner",
        "owner",
        "--repo",
        "repo",
        "--queued-stack",
        "--stack-prs",
        "1",
        "--status-only",
      ],
      harness.runtime
    );
    expect(code).toBe(0);
    expect(harness.stdout).toHaveLength(1);
    const verdict: unknown = JSON.parse(harness.stdout[0]);
    expect(verdict).toMatchObject({
      kind: "STATUS",
      terminal: true,
      exitCode: 0,
      mode: "queued-stack",
    });
    expect(harness.stdout[0]).not.toContain('"kind":"QUEUE"');
  });

  it("returns exit 4 for an aggregate GitHub merge refusal", async () => {
    const reader = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    });
    const harness = testRuntime(reader);
    const code = await main(
      ["--owner", "owner", "--repo", "repo", "--pr", "1"],
      harness.runtime
    );
    expect(code).toBe(4);
    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({
      kind: "BLOCKER",
      exitCode: 4,
      blocker: {
        kind: "failing-checks",
        ci: { kind: "ci-github-rejected" },
      },
    });
  });

  it("shows help without touching the reader", async () => {
    const reader = fakeReader();
    const harness = testRuntime(reader);
    expect(await main(["--help"], harness.runtime)).toBe(0);
    expect(harness.stdout.join("")).toContain("JSON (NDJSON while polling)");
    expect(harness.stdout.join("")).toContain("0 disables the overall deadline");
    expect(harness.stdout.join("")).toContain("commands keep a 120s safety cap");
    expect(reader.calls).toEqual([]);
  });

  it("enforces the wall deadline during initial PR resolution", async () => {
    const base = fakeReader();
    const reader = {
      ...base,
      async currentPr(_pr: ReturnType<typeof parsePrNumber> | null, deadline?: WatchDeadline) {
        return waitForDeadline(deadline);
      },
    } satisfies GitHubReader;
    const harness = testRuntime(reader);
    const started = performance.now();
    const code = await within(
      main(["--timeout", "0.05"], harness.runtime),
      750
    );
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(20);
    expect(elapsed).toBeLessThan(500);
    expect(code).toBe(5);
    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({
      kind: "TIMEOUT",
      exitCode: 5,
      reason: { kind: "watch-deadline" },
    });
  });

  it("kills an in-flight gh process and returns exit 5 at the CLI deadline", async () => {
    const directory = await mkdtemp(
      join(process.cwd(), "deepwright-fake-gh-")
    );
    const fakeGh = join(directory, "gh");
    await writeFile(
      fakeGh,
      "#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n",
      { mode: 0o755 }
    );
    const previousPath = process.env.PATH;
    process.env.PATH = `${directory}${delimiter}${previousPath ?? ""}`;
    try {
      const harness = testRuntime(new GhGitHubReader());
      const started = performance.now();
      const code = await within(
        main(["--timeout", "0.2"], harness.runtime),
        1_500
      );
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(1_000);
      expect(code).toBe(5);
      expect(harness.stdout).toHaveLength(1);
      expect(JSON.parse(harness.stdout[0])).toMatchObject({
        kind: "TIMEOUT",
        exitCode: 5,
        reason: { kind: "watch-deadline" },
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("shares one wall deadline across discovery and status collection", async () => {
    const base = fakeReader();
    const signals: AbortSignal[] = [];
    const reader = {
      ...base,
      async currentPr(_pr: ReturnType<typeof parsePrNumber> | null, deadline?: WatchDeadline) {
        if (deadline === undefined) throw new Error("missing watch deadline");
        signals.push(deadline.signal);
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { owner: "owner", repo: "repo", number: parsePrNumber(1) };
      },
      async pullRequest(_context: Parameters<GitHubReader["pullRequest"]>[0], deadline?: WatchDeadline) {
        if (deadline === undefined) throw new Error("missing watch deadline");
        signals.push(deadline.signal);
        return waitForDeadline(deadline);
      },
    } satisfies GitHubReader;
    const harness = testRuntime(reader);
    const started = performance.now();
    const code = await within(
      main(["--timeout", "0.08"], harness.runtime),
      750
    );
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(500);
    expect(code).toBe(5);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBe(signals[1]);
    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({
      kind: "TIMEOUT",
      exitCode: 5,
      reason: { kind: "watch-deadline" },
    });
  });

  it("reports the optional gh dependency as a structured blocker", async () => {
    const base = fakeReader();
    const reader = {
      ...base,
      async pullRequest() {
        throw new WatcherQueryError({
          kind: "command-exit",
          retryable: false,
          code: 127,
          detail:
            "gh CLI is unavailable; Deepwright can inspect GitHub through a connected GitHub tool, but the optional standalone watch-pr helper requires an authenticated gh CLI",
        });
      },
    } satisfies GitHubReader;
    const harness = testRuntime(reader);
    expect(
      await main(
        ["--owner", "owner", "--repo", "repo", "--pr", "1"],
        harness.runtime
      )
    ).toBe(7);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({
      kind: "BLOCKER",
      exitCode: 7,
      blocker: {
        kind: "status-query",
        failure: { kind: "command-exit", code: 127 },
      },
    });
  });
});
