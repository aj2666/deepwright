import { describe, expect, it } from "vitest";
import { WatcherQueryError } from "./github.ts";
import {
  applyQueueSnapshot,
  assessGitHubMerge,
  classifyPr,
  createQueueState,
  createWatchDeadline,
  evaluateQueue,
  planQueue,
  queryBackoffSeconds,
  readSnapshot,
  runQueued,
  runSimple,
  selectTierMajorStackDecision,
} from "./policy.ts";
import {
  fakeReader,
  failedCheck,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";
import type {
  GitHubReader,
  NonEmpty,
  PollingOptions,
  PrContext,
  ProgressVerdict,
  PullRequestFacts,
  RollupState,
  WatchDeadline,
} from "./types.ts";
import { parsePrNumber } from "./types.ts";

const context = (number: number): PrContext => ({
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(number),
});
const options = {
  interval: 10,
  sweepInterval: 300,
  timeout: 0,
  maxQueryErrors: 5,
  allowDraft: false,
} satisfies PollingOptions;

it("keeps timeout zero unbounded at the watcher layer", () => {
  let now = 0;
  const handle = createWatchDeadline({ now: () => now }, 0);
  now = 1_000_000;
  expect(handle.deadline.remainingSeconds()).toBeNull();
  expect(handle.deadline.remainingMilliseconds()).toBeNull();
  expect(handle.deadline.expired()).toBe(false);
  expect(handle.deadline.signal.aborted).toBe(false);
  handle.dispose();
});

describe("readiness truth table", () => {
  it("allows only CLEAN with an observed exact head", () => {
    const cases: readonly [
      PullRequestFacts["mergeStateStatus"],
      RollupState,
      "allowed" | "refused",
    ][] = [
      ["BLOCKED", "FAILURE", "refused"],
      ["BLOCKED", "ERROR", "refused"],
      ["BLOCKED", "EXPECTED", "refused"],
      ["BLOCKED", "PENDING", "refused"],
      ["BLOCKED", "SUCCESS", "refused"],
      ["BLOCKED", null, "refused"],
      ["BEHIND", "SUCCESS", "refused"],
      ["CONFLICTING", "SUCCESS", "refused"],
      ["DIRTY", "SUCCESS", "refused"],
      ["DRAFT", "SUCCESS", "refused"],
      ["HAS_HOOKS", "SUCCESS", "refused"],
      ["UNSTABLE", "FAILURE", "refused"],
      ["UNKNOWN", "ERROR", "refused"],
      ["UNKNOWN", "EXPECTED", "refused"],
      ["UNKNOWN", "FAILURE", "refused"],
      ["UNKNOWN", "PENDING", "refused"],
      ["UNKNOWN", "SUCCESS", "refused"],
      ["UNKNOWN", null, "refused"],
      ["CLEAN", "ERROR", "refused"],
      ["CLEAN", "FAILURE", "refused"],
      ["CLEAN", "PENDING", "refused"],
      ["CLEAN", null, "refused"],
      ["CLEAN", "SUCCESS", "allowed"],
    ];
    for (const [mergeStateStatus, headRollupState, expected] of cases) {
      expect(
        assessGitHubMerge({
          mergeStateStatus,
          headRollupState,
          exactHeadObserved: true,
          isDraft: false,
          allowDraft: false,
        }).kind
      ).toBe(expected);
    }
    expect(
      assessGitHubMerge({
        mergeStateStatus: "CLEAN",
        headRollupState: "SUCCESS",
        exactHeadObserved: false,
        isDraft: false,
        allowDraft: false,
      })
    ).toMatchObject({
      kind: "refused",
      reason: "exact-head-unproven",
      exactHead: "unproven",
    });
  });

  it("permits DRAFT only for the matching explicit draft override", () => {
    expect(
      assessGitHubMerge({
        mergeStateStatus: "DRAFT",
        headRollupState: "SUCCESS",
        exactHeadObserved: true,
        isDraft: true,
        allowDraft: true,
      })
    ).toMatchObject({
      kind: "allowed",
      basis: "draft-override",
      mergeStateStatus: "DRAFT",
    });
    expect(
      assessGitHubMerge({
        mergeStateStatus: "DRAFT",
        headRollupState: "SUCCESS",
        exactHeadObserved: true,
        isDraft: false,
        allowDraft: true,
      }).kind
    ).toBe("refused");
  });

  it("refuses READY when GitHub reports BLOCKED despite passing visible checks", async () => {
    const reader = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "SUCCESS" }],
    });
    const snapshot = await readSnapshot({
      reader,
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "blocker",
      blocker: {
        kind: "failing-checks",
        ci: {
          kind: "ci-github-rejected",
          github: { mergeStateStatus: "BLOCKED", headRollupState: "SUCCESS" },
        },
      },
    });
  });

  it("turns a clean visible list plus GitHub refusal into an explicit CI blocker", async () => {
    const reader = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    });
    const snapshot = await readSnapshot({
      reader,
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(snapshot.kind).toBe("open");
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci.kind).toBe("ci-github-rejected");
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "blocker",
      blocker: { kind: "failing-checks" },
    });
  });
});

describe("snapshot query planning", () => {
  it("forwards one deadline through every snapshot reader call", async () => {
    const reader = fakeReader();
    const handle = createWatchDeadline({ now: () => 0 }, 0);
    try {
      await readSnapshot({
        reader,
        context: context(2),
        pendingHistory: "include",
        allowDraft: false,
        deadline: handle.deadline,
      });
      expect(reader.deadlines).toHaveLength(5);
      expect(reader.deadlines.every((item) => item === handle.deadline)).toBe(
        true
      );
    } finally {
      handle.dispose();
    }
  });

  it("proves the exact head before treating queued checks as pending", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [pendingCheck()] },
      commitRollups: [{ oid: "head", state: "PENDING" }],
    });
    const snapshot = await readSnapshot({
      reader,
      context: context(2),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(snapshot.kind).toBe("open");
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci.kind).toBe("ci-pending");
    expect(reader.calls).toEqual([
      "pullRequest",
      "reviewThreads",
      "checksFastPath",
      "commitRollups",
      "pullRequest",
    ]);
  });

  it.each([
    ["include", "BLOCKED", "PENDING"],
    ["include", "UNSTABLE", "EXPECTED"],
    ["omit", "BLOCKED", "PENDING"],
  ] as const)(
    "keeps exact-head pending CI nonterminal (%s, %s, %s)",
    async (pendingHistory, mergeStateStatus, headRollupState) => {
      const snapshot = await readSnapshot({
        reader: fakeReader({
          facts: { mergeStateStatus },
          fastPath: { kind: "checks", checks: [pendingCheck()] },
          commitRollups: [{ oid: "head", state: headRollupState }],
        }),
        context: context(2),
        pendingHistory,
        allowDraft: false,
      });
      expect(snapshot).toMatchObject({
        kind: "open",
        ci: { kind: "ci-pending" },
      });
      expect(classifyPr(snapshot).kind).toBe("waiting");
      expect(selectTierMajorStackDecision([snapshot]).kind).toBe("waiting");
    }
  );

  it("blocks pending output when the exact head rollup is unproven", async () => {
    const snapshot = await readSnapshot({
      reader: fakeReader({
        fastPath: { kind: "checks", checks: [pendingCheck()] },
        commitRollups: [{ oid: "different", state: "PENDING" }],
      }),
      context: context(2),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(snapshot).toMatchObject({
      kind: "open",
      ci: {
        kind: "ci-github-rejected",
        github: { reason: "exact-head-unproven" },
      },
    });
    expect(classifyPr(snapshot).kind).toBe("blocker");
  });

  it("queries rollups for settled and failed lists", async () => {
    const settled = fakeReader();
    await readSnapshot({
      reader: settled,
      context: context(3),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(settled.calls).toContain("commitRollups");

    const failed = fakeReader({
      fastPath: { kind: "checks", checks: [failedCheck()] },
    });
    await readSnapshot({
      reader: failed,
      context: context(4),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(failed.calls).toContain("commitRollups");
  });

  it("short-circuits merged rows before threads and checks", async () => {
    const reader = fakeReader({
      facts: { state: "MERGED", mergedAt: "2026-07-26T00:00:00Z" },
    });
    expect(
      (
        await readSnapshot({
          reader,
          context: context(5),
          pendingHistory: "include",
          allowDraft: false,
        })
      ).kind
    ).toBe("merged");
    expect(reader.calls).toEqual(["pullRequest"]);
  });

  it("rejects a snapshot when the head changes during evidence collection", async () => {
    const base = fakeReader({
      facts: { headRefOid: "before" },
      commitRollups: [{ oid: "before", state: "SUCCESS" }],
    });
    let reads = 0;
    const reader = {
      ...base,
      async pullRequest(pr: PrContext, deadline: WatchDeadline | undefined) {
        const facts = await base.pullRequest(pr, deadline);
        reads += 1;
        return { ...facts, headRefOid: reads === 1 ? "before" : "after" };
      },
    } satisfies GitHubReader;
    await expect(
      readSnapshot({
        reader,
        context: context(6),
        pendingHistory: "include",
        allowDraft: false,
      })
    ).rejects.toMatchObject({
      failure: {
        kind: "missing-key",
        retryable: true,
        detail: expect.stringContaining("headRefOid"),
      },
    });
  });

  it("rejects contradictory lifecycle facts from any reader", async () => {
    const reader = fakeReader({
      facts: { state: "OPEN", mergedAt: "2026-07-26T00:00:00Z" },
    });
    await expect(
      readSnapshot({
        reader,
        context: context(6),
        pendingHistory: "include",
        allowDraft: false,
      })
    ).rejects.toThrow("contradictory PR lifecycle");
    expect(reader.calls).toEqual(["pullRequest"]);
  });
});

describe("positive readiness evidence", () => {
  it.each([
    ["unknown mergeability", { mergeable: "UNKNOWN" as const }, "mergeability-unproven"],
    ["review still required", { reviewDecision: "REVIEW_REQUIRED" as const }, "review-required"],
  ])("blocks %s", async (_label, facts, reason) => {
    const snapshot = await readSnapshot({
      reader: fakeReader({ facts }),
      context: context(7),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "blocker",
      blocker: { kind: "merge-gate", reason },
    });
  });

  it.each([
    ["missing head OID", { headRefOid: null }, [], "exact-head-unproven"],
    ["unobserved exact head", {}, [{ oid: "different", state: "SUCCESS" as const }], "exact-head-unproven"],
    ["unproven head rollup", {}, [{ oid: "head", state: "PENDING" as const }], "head-rollup-unproven"],
    ["unknown merge status", { mergeStateStatus: "UNKNOWN" as const }, [{ oid: "head", state: "SUCCESS" as const }], "merge-state-unproven"],
  ])("blocks %s", async (_label, facts, commitRollups, reason) => {
    const snapshot = await readSnapshot({
      reader: fakeReader({ facts, commitRollups }),
      context: context(8),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(snapshot).toMatchObject({
      kind: "open",
      ci: {
        kind: "ci-github-rejected",
        github: { kind: "refused", reason },
      },
    });
    expect(classifyPr(snapshot).kind).toBe("blocker");
  });

  it("allows no review decision only when GitHub otherwise proves readiness", async () => {
    const snapshot = await readSnapshot({
      reader: fakeReader({ facts: { reviewDecision: null } }),
      context: context(9),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(classifyPr(snapshot).kind).toBe("ready");
  });
});

it("scans stacks tier-major so an upstack conflict outranks frontier CI", async () => {
  const frontier = await readSnapshot({
    reader: fakeReader({
      fastPath: { kind: "checks", checks: [failedCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    }),
    context: context(10),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const upstack = await readSnapshot({
    reader: fakeReader({ facts: { mergeable: "CONFLICTING" } }),
    context: context(11),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const decision = selectTierMajorStackDecision([frontier, upstack]);
  expect(decision).toMatchObject({
    kind: "blocker",
    blocker: { kind: "merge-conflicts", pr: { number: 11 } },
  });
});

it("attributes a stack wait to the PR whose checks are pending, not the bottom", async () => {
  const readyBottom = await readSnapshot({
    reader: fakeReader(),
    context: context(20),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const pendingUpstack = await readSnapshot({
    reader: fakeReader({
      fastPath: { kind: "checks", checks: [pendingCheck("upstack-build")] },
    }),
    context: context(21),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const decision = selectTierMajorStackDecision([readyBottom, pendingUpstack]);
  expect(decision).toMatchObject({
    kind: "waiting",
    frontier: { number: 21 },
    pending: [{ name: "upstack-build" }],
  });
});

it("waits on a draft while checks are pending, then reports the draft gate", async () => {
  const pending = await readSnapshot({
    reader: fakeReader({
      facts: { isDraft: true },
      fastPath: { kind: "checks", checks: [pendingCheck()] },
    }),
    context: context(12),
    pendingHistory: "omit",
    allowDraft: false,
  });
  expect(classifyPr(pending).kind).toBe("waiting");

  const settled = await readSnapshot({
    reader: fakeReader({ facts: { isDraft: true } }),
    context: context(12),
    pendingHistory: "omit",
    allowDraft: false,
  });
  expect(classifyPr(settled)).toMatchObject({
    kind: "blocker",
    blocker: { kind: "merge-gate", reason: "draft-pr" },
  });
});

it("makes the explicit draft override reachable without weakening other gates", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { isDraft: true, mergeStateStatus: "DRAFT" },
    }),
    context: context(13),
    pendingHistory: "include",
    allowDraft: true,
  });
  expect(classifyPr(snapshot, true)).toMatchObject({
    kind: "ready",
    pr: {
      proof: {
        ci: {
          github: {
            kind: "allowed",
            basis: "draft-override",
            mergeStateStatus: "DRAFT",
          },
        },
        gate: { draft: "draft-allowed" },
      },
    },
  });
});

it("revalidates every stack row and confirms final identities before READY", async () => {
  const first = context(14);
  const second = context(15);
  const base = fakeReader({
    commitRollups: [
      { oid: "head", state: "SUCCESS" },
      { oid: "head-a", state: "SUCCESS" },
      { oid: "head-b", state: "SUCCESS" },
    ],
  });
  let firstReads = 0;
  const reader = {
    ...base,
    async pullRequest(pr: PrContext, deadline: WatchDeadline | undefined) {
      const facts = await base.pullRequest(pr, deadline);
      if (pr.number !== first.number) return facts;
      firstReads += 1;
      return {
        ...facts,
        headRefOid: firstReads <= 4 ? "head-a" : "head-b",
      };
    },
  } satisfies GitHubReader;
  const emitted: ProgressVerdict[] = [];
  const running = runSimple({
    dependencies: {
      reader,
      clock: {
        now: () => 0,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep() {
          throw new Error("stop after revalidation retry");
        },
      },
      emit(verdict) {
        emitted.push(verdict);
      },
    },
    contexts: [first, second],
    mode: "stack",
    statusOnly: false,
    options,
  });
  await expect(running).rejects.toThrow("stop after revalidation retry");
  expect(emitted.some((event) => event.kind === "RETRY")).toBe(true);
});

describe("queued-stack cadence", () => {
  async function openSnapshot(pr: PrContext) {
    return readSnapshot({
      reader: fakeReader(),
      context: pr,
      pendingHistory: "omit",
      allowDraft: false,
    });
  }

  it("drops a sweep head only after its snapshot succeeds", async () => {
    const queue = [
      context(20),
      context(21),
      context(22),
    ] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    const first = await openSnapshot(queue[0]);
    state = applyQueueSnapshot(state, first, 0, options).state;
    expect(state.work).toMatchObject({
      kind: "whole-stack-sweep",
      remaining: [{ number: 21 }, { number: 22 }],
    });
    const second = await openSnapshot(queue[1]);
    state = applyQueueSnapshot(state, second, 60, options).state;
    expect(state.work).toMatchObject({
      kind: "whole-stack-sweep",
      remaining: [{ number: 22 }],
    });
  });

  it("resumes the sweep at the PR whose read failed", async () => {
    const middle = context(21);
    const base = fakeReader();
    let failNext = true;
    const timeline: string[] = [];
    const reader = {
      ...base,
      async pullRequest(pr: PrContext, deadline: WatchDeadline | undefined) {
        if (pr.number === middle.number && failNext) {
          failNext = false;
          timeline.push(`fail:${pr.number}`);
          throw new WatcherQueryError({
            kind: "command-exit",
            retryable: true,
            detail: "rate limited",
            code: 1,
          });
        }
        timeline.push(`read:${pr.number}`);
        return base.pullRequest(pr, deadline);
      },
    } satisfies GitHubReader;
    let now = 0;
    let sleeps = 0;
    const running = runQueued({
      dependencies: {
        reader,
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep(seconds) {
            timeline.push("sleep");
            now += seconds;
            sleeps += 1;
            if (sleeps === 2) throw new Error("stop after resume proof");
          },
        },
        emit(verdict) {
          timeline.push(`emit:${verdict.kind}`);
        },
      },
      contexts: [context(20), middle, context(22)],
      options,
    });
    await expect(running).rejects.toThrow("stop after resume proof");
    expect(timeline).toEqual([
      "emit:QUEUE",
      "read:20",
      "read:20",
      "fail:21",
      "emit:RETRY",
      "sleep",
      "read:21",
      "read:21",
      "read:22",
      "read:22",
      "emit:STATUS",
      "emit:WAITING",
      "sleep",
    ]);
  });

  it("emits a completed sweep only after its final successful snapshot", async () => {
    const queue = [context(30), context(31)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    const first = applyQueueSnapshot(
      state,
      await openSnapshot(queue[0]),
      0,
      options
    );
    expect(first.completedSweepRows).toBeNull();
    state = first.state;
    const second = applyQueueSnapshot(
      state,
      await openSnapshot(queue[1]),
      5,
      options
    );
    expect(
      second.completedSweepRows?.map((row) => Number(row.context.number))
    ).toEqual([30, 31]);
    expect(second.state.nextSweepAt).toBe(305);
  });

  it("ADVANCE continues directly to the new frontier without sleeping", async () => {
    const one = context(40);
    const two = context(41);
    const base = fakeReader();
    const reads = new Map<number, number>();
    const timeline: string[] = [];
    const reader = {
      ...base,
      async pullRequest(pr: PrContext, deadline: WatchDeadline | undefined) {
        timeline.push(`read:${pr.number}`);
        const facts = await base.pullRequest(pr, deadline);
        const count = (reads.get(pr.number) ?? 0) + 1;
        reads.set(pr.number, count);
        return pr.number === one.number && count > 2
          ? {
              ...facts,
              state: "MERGED" as const,
              mergedAt: "2026-07-26T00:00:00Z",
            }
          : facts;
      },
    } satisfies GitHubReader;
    let now = 0;
    let sleeps = 0;
    const emitted: ProgressVerdict[] = [];
    const running = runQueued({
      dependencies: {
        reader,
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep(seconds) {
            timeline.push("sleep");
            now += seconds;
            sleeps += 1;
            if (sleeps === 2) throw new Error("stop after advance proof");
          },
        },
        emit(verdict) {
          emitted.push(verdict);
          timeline.push(`emit:${verdict.kind}`);
        },
      },
      contexts: [one, two],
      options,
    });
    await expect(running).rejects.toThrow("stop after advance proof");
    expect(emitted.some((event) => event.kind === "ADVANCE")).toBe(true);
    const firstSleep = timeline.indexOf("sleep");
    expect(timeline.slice(firstSleep, firstSleep + 6)).toEqual([
      "sleep",
      "read:40",
      "emit:ADVANCE",
      "read:41",
      "read:41",
      "emit:WAITING",
    ]);
  });

  it("deduplicates identical waits and schedules the next due sweep", async () => {
    const queue = [context(50)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    state = applyQueueSnapshot(
      state,
      await openSnapshot(queue[0]),
      0,
      options
    ).state;
    const first = evaluateQueue(state, 0, options);
    expect(first.kind).toBe("waiting");
    if (first.kind !== "waiting") throw new Error("expected waiting");
    expect(first.emit).toBe(true);
    const second = evaluateQueue(first.state, 10, options);
    expect(second.kind).toBe("waiting");
    if (second.kind !== "waiting") throw new Error("expected waiting");
    expect(second.emit).toBe(false);
    expect(planQueue(second.state, 300).work?.kind).toBe("whole-stack-sweep");
  });
});

it("uses the specified retry floor and cap", () => {
  expect(queryBackoffSeconds(1, 1)).toBe(60);
  expect(queryBackoffSeconds(1, 2)).toBe(120);
  expect(queryBackoffSeconds(60, 4)).toBe(300);
});

it("caps a polling sleep at the watch deadline and does not query again", async () => {
  const reader = fakeReader({
    fastPath: { kind: "checks", checks: [pendingCheck()] },
  });
  let now = 0;
  const sleeps: number[] = [];
  const verdict = await runSimple({
    dependencies: {
      reader,
      clock: {
        now: () => now,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep(seconds) {
          sleeps.push(seconds);
          now += seconds;
        },
      },
      emit() {},
    },
    contexts: [context(70)],
    mode: "single",
    statusOnly: false,
    options: { ...options, interval: 60, timeout: 15 },
  });
  expect(verdict).toMatchObject({
    kind: "TIMEOUT",
    exitCode: 5,
    reason: { kind: "pending-checks" },
  });
  expect(sleeps).toEqual([15]);
  expect(reader.calls.filter((call) => call === "pullRequest")).toHaveLength(2);
});

it("does not return READY when status collection itself crosses the deadline", async () => {
  const base = fakeReader();
  let now = 0;
  const reader = {
    ...base,
    async pullRequest(pr: PrContext, deadline: WatchDeadline | undefined) {
      now += 10;
      return base.pullRequest(pr, deadline);
    },
  } satisfies GitHubReader;
  const verdict = await runSimple({
    dependencies: {
      reader,
      clock: {
        now: () => now,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep() {
          throw new Error("deadline should stop before sleep");
        },
      },
      emit() {},
    },
    contexts: [context(71)],
    mode: "single",
    statusOnly: false,
    options: { ...options, timeout: 15 },
  });
  expect(verdict).toMatchObject({
    kind: "TIMEOUT",
    exitCode: 5,
    reason: { kind: "watch-deadline" },
  });
});

it("caps queued-stack waiting at the same deadline", async () => {
  const reader = fakeReader();
  let now = 0;
  const sleeps: number[] = [];
  const verdict = await runQueued({
    dependencies: {
      reader,
      clock: {
        now: () => now,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep(seconds) {
          sleeps.push(seconds);
          now += seconds;
        },
      },
      emit() {},
    },
    contexts: [context(71)],
    options: { ...options, interval: 60, timeout: 15 },
  });
  expect(verdict).toMatchObject({
    kind: "TIMEOUT",
    exitCode: 5,
    reason: { kind: "queued-stack", frontier: { number: 71 } },
  });
  expect(sleeps).toEqual([15]);
  expect(reader.calls.filter((call) => call === "pullRequest")).toHaveLength(2);
});

it("enforces the queued deadline between successful sweep rows", async () => {
  const base = fakeReader();
  let now = 0;
  const reads: number[] = [];
  const reader = {
    ...base,
    async pullRequest(pr: PrContext, deadline: WatchDeadline | undefined) {
      reads.push(Number(pr.number));
      now += 10;
      return base.pullRequest(pr, deadline);
    },
  } satisfies GitHubReader;
  const verdict = await runQueued({
    dependencies: {
      reader,
      clock: {
        now: () => now,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep() {
          throw new Error("deadline should stop before sleep");
        },
      },
      emit() {},
    },
    contexts: [context(72), context(73)],
    options: { ...options, timeout: 15 },
  });
  expect(verdict).toMatchObject({
    kind: "TIMEOUT",
    exitCode: 5,
    reason: {
      kind: "queued-stack",
      frontier: { number: 72 },
      unmergedCount: 2,
    },
  });
  expect(reads).toEqual([72, 72]);
});
