import type {
  Check,
  ChecksFastPath,
  CommitRollup,
  GitHubReader,
  OpenPullRequest,
  PrContext,
  PullRequestFacts,
  Repository,
  ReviewThread,
  RollupPage,
  WatchDeadline,
} from "./types.ts";
import { parsePrNumber } from "./types.ts";

export interface FakeReaderOptions {
  readonly facts?: Partial<Omit<PullRequestFacts, "context">>;
  readonly fastPath?: ChecksFastPath;
  readonly rollupPages?: readonly RollupPage[];
  readonly threads?: readonly ReviewThread[];
  readonly commitRollups?: readonly CommitRollup[];
  readonly openPullRequests?: readonly OpenPullRequest[];
  readonly origin?: Repository | null;
  readonly current?: PrContext;
}

export function passingCheck(name = "ci"): Check {
  return {
    kind: "passed",
    name,
    reportedState: "SUCCESS",
    description: "",
    link: "",
    workflow: "",
  };
}

export function pendingCheck(name = "ci"): Check {
  return {
    kind: "pending",
    name,
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
}

export function failedCheck(name = "ci"): Check {
  return {
    kind: "failed",
    name,
    reportedState: "FAILURE",
    description: "",
    link: "",
    workflow: "",
  };
}

export function fakeReader(
  options: FakeReaderOptions = {}
): GitHubReader & {
  readonly calls: readonly string[];
  readonly deadlines: readonly (WatchDeadline | undefined)[];
} {
  const calls: string[] = [];
  const deadlines: (WatchDeadline | undefined)[] = [];
  const context = options.current ?? {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const defaults: PullRequestFacts = {
    context,
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
  let page = 0;
  return {
    calls,
    deadlines,
    async originRepo(deadline: WatchDeadline | undefined) {
      calls.push("originRepo");
      deadlines.push(deadline);
      return options.origin === undefined
        ? { owner: "owner", repo: "repo" }
        : options.origin;
    },
    async currentPr(pr, deadline) {
      calls.push("currentPr");
      deadlines.push(deadline);
      return { ...context, number: pr ?? context.number };
    },
    async pullRequest(requested, deadline) {
      calls.push("pullRequest");
      deadlines.push(deadline);
      return { ...defaults, ...options.facts, context: requested };
    },
    async openPullRequests(_repository, deadline) {
      calls.push("openPullRequests");
      deadlines.push(deadline);
      return options.openPullRequests ?? [];
    },
    async checksFastPath(_requested, deadline) {
      calls.push("checksFastPath");
      deadlines.push(deadline);
      return options.fastPath ?? { kind: "checks", checks: [passingCheck()] };
    },
    async checkRollupPage(_requested, after, deadline) {
      calls.push(`checkRollupPage:${after ?? "null"}`);
      deadlines.push(deadline);
      return options.rollupPages?.[page++] ?? { checks: [], endCursor: null };
    },
    async reviewThreads(_requested, deadline) {
      calls.push("reviewThreads");
      deadlines.push(deadline);
      return options.threads ?? [];
    },
    async commitRollups(_requested, deadline) {
      calls.push("commitRollups");
      deadlines.push(deadline);
      return options.commitRollups ?? [{ oid: "head", state: "SUCCESS" }];
    },
  };
}
