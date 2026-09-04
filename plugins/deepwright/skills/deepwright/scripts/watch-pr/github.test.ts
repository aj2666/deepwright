import { describe, expect, it } from "vitest";
import {
  ChecksUnavailable,
  MAX_CHECK_ROLLUP_PAGES,
  OPEN_PULL_REQUEST_LIMIT,
  WatcherQueryError,
  collectReviewThreads,
  commandFailureDetail,
  connectionEndCursor,
  mapRollupNode,
  orderStack,
  parseOpenPullRequests,
  parsePullRequest,
  parseReviewThreads,
  run,
  resolveChecks,
  resolveContext,
} from "./github.ts";
import {
  fakeReader,
  failedCheck,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";
import { parsePrNumber } from "./types.ts";

const context = {
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(42),
};

function reviewThreadResponse(args: {
  readonly nodes: readonly unknown[];
  readonly hasNextPage?: boolean;
  readonly endCursor?: string | null;
}): unknown {
  return {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: {
              hasNextPage: args.hasNextPage ?? false,
              endCursor: args.endCursor ?? null,
            },
            nodes: args.nodes,
          },
        },
      },
    },
  };
}

it("reports a missing command as a normal command result", async () => {
  const result = await run(["deepwright-command-that-does-not-exist"]);
  expect(result).toMatchObject({ code: 127, stdout: "" });
  expect(result.stderr).toContain("deepwright-command-that-does-not-exist");
});

it("bounds each external status command", async () => {
  const result = await run(
    [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    25
  );
  expect(result.code).toBe(124);
  expect(result.stderr).toContain("timed out after 25ms");
});

it("explains that gh is optional for the skill but required by the watcher", () => {
  expect(
    commandFailureDetail(["gh", "pr", "view"], {
      code: 127,
      stdout: "",
      stderr: "spawn gh ENOENT",
    })
  ).toContain("optional standalone watch-pr helper requires an authenticated gh CLI");
});

describe("checks fallback chain", () => {
  it("uses a non-empty fast-path result without a rollup query", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [passingCheck("fast")] },
    });
    const read = await resolveChecks(reader, context);
    expect(read.source).toBe("gh-pr-checks");
    expect(read.checks.map((check) => check.name)).toEqual(["fast"]);
    expect(reader.calls).toEqual(["checksFastPath"]);
  });

  it("paginates GraphQL when the fast path is unusable", async () => {
    const reader = fakeReader({
      fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
      rollupPages: [
        { checks: [passingCheck("first")], endCursor: "next" },
        { checks: [failedCheck("second")], endCursor: null },
      ],
    });
    const read = await resolveChecks(reader, context);
    expect(read.source).toBe("graphql-rollup");
    expect(read.checks.map((check) => check.name)).toEqual(["first", "second"]);
    expect(reader.calls).toEqual([
      "checksFastPath",
      "checkRollupPage:null",
      "checkRollupPage:next",
    ]);
  });

  it("falls back when valid fast-path JSON represented an empty list", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [] },
      rollupPages: [{ checks: [pendingCheck("fallback")], endCursor: null }],
    });
    expect((await resolveChecks(reader, context)).checks[0].name).toBe(
      "fallback"
    );
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });

  it("fails closed when both paths are empty", async () => {
    const reader = fakeReader({
      fastPath: {
        kind: "unusable",
        exitCode: 8,
        stderr: "credential cannot read checks",
      },
    });
    await expect(resolveChecks(reader, context)).rejects.toBeInstanceOf(
      ChecksUnavailable
    );
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });

  it("fails closed when a check-rollup cursor repeats", async () => {
    const reader = fakeReader({
      fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
      rollupPages: [
        { checks: [passingCheck("first")], endCursor: "stuck" },
        { checks: [passingCheck("second")], endCursor: "stuck" },
      ],
    });
    await expect(resolveChecks(reader, context)).rejects.toMatchObject({
      failure: {
        kind: "missing-key",
        retryable: true,
        detail: "check rollup cursor did not advance: stuck",
      },
    });
  });

  it("fails closed when check-rollup pagination exceeds its safety cap", async () => {
    const reader = fakeReader({
      fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
      rollupPages: Array.from({ length: MAX_CHECK_ROLLUP_PAGES }, (_, index) => ({
        checks: [passingCheck(`page-${index + 1}`)],
        endCursor: `cursor-${index + 1}`,
      })),
    });
    await expect(resolveChecks(reader, context)).rejects.toThrow(
      `check rollup exceeded ${MAX_CHECK_ROLLUP_PAGES} pages`
    );
    expect(
      reader.calls.filter((call) => call.startsWith("checkRollupPage:"))
    ).toHaveLength(MAX_CHECK_ROLLUP_PAGES);
  });
});

it("requires a non-empty cursor whenever a check-rollup page continues", () => {
  for (const endCursor of [null, ""])
    expect(() =>
      connectionEndCursor(
        { hasNextPage: true, endCursor },
        "contexts.pageInfo"
      )
    ).toThrow("contexts.pageInfo.endCursor");
});

describe("rollup node mapping", () => {
  it("maps terminal and non-terminal CheckRun states fail closed", () => {
    const cases = [
      ["IN_PROGRESS", null, "pending", "PENDING"],
      ["COMPLETED", "SUCCESS", "passed", "SUCCESS"],
      ["COMPLETED", "NEUTRAL", "skipped", "NEUTRAL"],
      ["COMPLETED", "SKIPPED", "skipped", "SKIPPED"],
      ["COMPLETED", "ACTION_REQUIRED", "failed", "ACTION_REQUIRED"],
      ["COMPLETED", "TIMED_OUT", "failed", "FAILURE"],
      ["COMPLETED", "FUTURE_VALUE", "failed", "FAILURE"],
    ] as const;
    for (const [status, conclusion, kind, reportedState] of cases) {
      expect(
        mapRollupNode({
          __typename: "CheckRun",
          name: "ci",
          status,
          conclusion,
        })
      ).toMatchObject({ kind, reportedState });
    }
  });

  it("classifies an in-progress Code Review Gate from the rollup as the gate", () => {
    expect(
      mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "IN_PROGRESS",
        conclusion: null,
      })
    ).toMatchObject({ kind: "code-review-gate" });
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "Code Review Gate",
        state: "PENDING",
      })
    ).toMatchObject({ kind: "code-review-gate" });
  });

  it("maps StatusContext states and fails closed on unknown typenames", () => {
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "EXPECTED",
      })
    ).toMatchObject({ kind: "pending", reportedState: "PENDING" });
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "FUTURE_VALUE",
      })
    ).toMatchObject({ kind: "failed", reportedState: "FUTURE_VALUE" });
    expect(() => mapRollupNode({ __typename: "FutureNode" })).toThrow(
      "rollup node.__typename"
    );
  });
});

describe("closed enum parsing", () => {
  const rawPullRequest = {
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "head",
    headRefName: "feature",
    baseRefName: "main",
    state: "OPEN",
    mergedAt: null,
    isDraft: false,
  };

  it("accepts mergeStateStatus CONFLICTING", () => {
    expect(
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "CONFLICTING" },
        context
      ).mergeStateStatus
    ).toBe("CONFLICTING");
  });

  it("reads gh's empty reviewDecision as no decision rather than a parse failure", () => {
    expect(
      parsePullRequest({ ...rawPullRequest, reviewDecision: "" }, context)
        .reviewDecision
    ).toBeNull();
  });

  it("still rejects an unknown reviewDecision", () => {
    expect(() =>
      parsePullRequest({ ...rawPullRequest, reviewDecision: "MAYBE" }, context)
    ).toThrow(WatcherQueryError);
  });

  it("rejects unknown enum values as retryable errors carrying the raw value", () => {
    try {
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "FUTURE_STATE" },
        context
      );
      throw new Error("expected parser to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WatcherQueryError);
      if (!(error instanceof WatcherQueryError)) throw error;
      expect(error.failure).toMatchObject({
        kind: "missing-key",
        retryable: true,
        rawValue: '"FUTURE_STATE"',
      });
    }
  });

  it.each([
    ["OPEN", "2026-07-26T00:00:00Z"],
    ["CLOSED", "2026-07-26T00:00:00Z"],
    ["MERGED", null],
  ])("rejects contradictory state=%s mergedAt=%s", (state, mergedAt) => {
    expect(() =>
      parsePullRequest({ ...rawPullRequest, state, mergedAt }, context)
    ).toThrow("pull request.state/mergedAt consistency");
  });
});

it("annotates automated review threads with distinct review-pass counts", () => {
  const response = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "one",
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      body: "RUN_ID: run-1",
                      createdAt: "now",
                      path: "a.ts",
                      line: 1,
                      author: { login: "codex[bot]" },
                    },
                  ],
                },
              },
              {
                id: "two",
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      body: "CODEX_AUTOMATION_ID: run-2 severity high",
                      createdAt: "now",
                      path: null,
                      line: null,
                      author: { login: "openai-codex[bot]" },
                    },
                  ],
                },
              },
              {
                id: "resolved",
                isResolved: true,
                comments: {
                  nodes: [
                    {
                      body: "RUN_ID: run-3",
                      createdAt: "now",
                      path: null,
                      line: null,
                      author: { login: "bugbot" },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };
  const threads = parseReviewThreads(response);
  expect(threads).toHaveLength(2);
  expect(threads.map((thread) => thread.isAutomatedReview)).toEqual([
    true,
    true,
  ]);
  expect(threads.map((thread) => thread.automatedReviewPasses)).toEqual([3, 3]);
});

it("paginates every review thread before classifying unresolved threads", async () => {
  const first = {
    id: "first",
    isResolved: false,
    comments: {
      nodes: [
        {
          body: "RUN_ID: pass-1",
          createdAt: "now",
          path: "a.ts",
          line: 1,
          author: { login: "codex[bot]" },
        },
      ],
    },
  };
  const second = {
    id: "second",
    isResolved: false,
    comments: {
      nodes: [
        {
          body: "RUN_ID: pass-2",
          createdAt: "later",
          path: "b.ts",
          line: 2,
          author: { login: "codex[bot]" },
        },
      ],
    },
  };
  const afters: (string | null)[] = [];
  const threads = await collectReviewThreads(async (after) => {
    afters.push(after);
    return after === null
      ? reviewThreadResponse({
          nodes: [first],
          hasNextPage: true,
          endCursor: "page-2",
        })
      : reviewThreadResponse({ nodes: [second] });
  });
  expect(afters).toEqual([null, "page-2"]);
  expect(threads.map((thread) => thread.id)).toEqual(["first", "second"]);
  expect(threads.map((thread) => thread.automatedReviewPasses)).toEqual([2, 2]);
});

it("fails closed when review-thread pagination has no usable cursor", async () => {
  await expect(
    collectReviewThreads(async () =>
      reviewThreadResponse({
        nodes: [],
        hasNextPage: true,
        endCursor: null,
      })
    )
  ).rejects.toMatchObject({
    failure: { kind: "missing-key", retryable: true },
  });
});

it("refuses to parse a lone review-thread page that declares a successor", () => {
  expect(() =>
    parseReviewThreads(
      reviewThreadResponse({
        nodes: [],
        hasNextPage: true,
        endCursor: "not-fetched",
      })
    )
  ).toThrow("refusing to classify an incomplete thread set");
});

it("fails closed when a review-thread cursor does not advance", async () => {
  await expect(
    collectReviewThreads(async () =>
      reviewThreadResponse({
        nodes: [],
        hasNextPage: true,
        endCursor: "stuck",
      })
    )
  ).rejects.toMatchObject({
    failure: {
      kind: "missing-key",
      retryable: true,
      detail: "reviewThreads cursor did not advance: stuck",
    },
  });
});

describe("context and stack discovery", () => {
  it("returns a fully explicit context without any reader call", async () => {
    const reader = fakeReader();
    expect(
      await resolveContext({
        reader,
        owner: "explicit",
        repo: "repo",
        pr: context.number,
      })
    ).toEqual({ owner: "explicit", repo: "repo", number: context.number });
    expect(reader.calls).toEqual([]);
  });

  it("uses the local origin before currentPr for an explicit number", async () => {
    const reader = fakeReader({ origin: { owner: "local", repo: "checkout" } });
    expect(
      await resolveContext({
        reader,
        owner: null,
        repo: null,
        pr: context.number,
      })
    ).toEqual({ owner: "local", repo: "checkout", number: context.number });
    expect(reader.calls).toEqual(["originRepo"]);
  });

  it("orders the connected stack bottom-to-top", () => {
    const ordered = orderStack(context, [
      {
        number: parsePrNumber(41),
        headRefName: "base-feature",
        baseRefName: "main",
      },
      {
        number: context.number,
        headRefName: "feature",
        baseRefName: "base-feature",
      },
      {
        number: parsePrNumber(43),
        headRefName: "upstack",
        baseRefName: "feature",
      },
    ]);
    expect(ordered.map((item) => Number(item.number))).toEqual([41, 42, 43]);
  });

  it("fails closed when gh may have truncated open stack discovery", () => {
    const rows = Array.from({ length: OPEN_PULL_REQUEST_LIMIT }, (_, index) => ({
      number: index + 1,
      headRefName: `head-${index + 1}`,
      baseRefName: index === 0 ? "main" : `head-${index}`,
    }));
    expect(() => parseOpenPullRequests(rows)).toThrow(
      `open PR list reached the ${OPEN_PULL_REQUEST_LIMIT}-row gh limit`
    );
  });

  it("rejects duplicate PR identities before building stack maps", () => {
    const one = {
      number: parsePrNumber(1),
      headRefName: "one",
      baseRefName: "main",
    };
    expect(() =>
      orderStack(context, [one, { ...one, headRefName: "other" }])
    ).toThrow("duplicate PR number 1");
    expect(() =>
      orderStack(context, [
        one,
        { ...one, number: parsePrNumber(2) },
      ])
    ).toThrow("duplicate headRefName one");
  });

  it("rejects cyclic base/head graphs instead of looping", () => {
    expect(() =>
      orderStack(context, [
        {
          number: parsePrNumber(1),
          headRefName: "one",
          baseRefName: "two",
        },
        {
          number: parsePrNumber(2),
          headRefName: "two",
          baseRefName: "one",
        },
      ])
    ).toThrow("base/head graph contains a cycle");
  });
});
