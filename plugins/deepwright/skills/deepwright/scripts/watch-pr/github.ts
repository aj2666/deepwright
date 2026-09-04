import { spawn } from "node:child_process";
import type * as T from "./types.ts";
import { nonEmpty, parsePrNumber } from "./types.ts";
export const REVIEW_THREADS_QUERY =
  "\nquery ReviewThreads($owner: String!, $repo: String!, $pr: Int!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      reviewThreads(first: 100, after: $after) {\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n        nodes {\n          id\n          isResolved\n          comments(first: 1) {\n            nodes {\n              body\n              createdAt\n              path\n              line\n              author { login }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const PR_COMMIT_STATUS_QUERY =
  "\nquery PrCommitStatuses($owner: String!, $repo: String!, $pr: Int!) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 50) {\n        nodes {\n          commit {\n            oid\n            statusCheckRollup {\n              state\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const PR_CHECK_ROLLUP_QUERY =
  "\nquery PrCheckRollup($owner: String!, $repo: String!, $pr: Int!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 1) {\n        nodes {\n          commit {\n            statusCheckRollup {\n              contexts(first: 100, after: $after) {\n                pageInfo {\n                  hasNextPage\n                  endCursor\n                }\n                nodes {\n                  __typename\n                  ... on CheckRun {\n                    name\n                    status\n                    conclusion\n                    detailsUrl\n                  }\n                  ... on StatusContext {\n                    context\n                    state\n                    targetUrl\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
export const COMMAND_TIMEOUT_MS = 120_000;
export const COMMAND_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
export const COMMAND_OUTPUT_LIMIT_EXIT = 125;
export class WatcherQueryError extends Error {
  readonly failure: T.QueryFailure;
  constructor(failure: T.QueryFailure) {
    super(failure.detail);
    this.name = "WatcherQueryError";
    this.failure = failure;
  }
}
export class ChecksUnavailable extends WatcherQueryError {
  constructor(detail: string) {
    super({ kind: "checks-unavailable", retryable: true, detail });
    this.name = "ChecksUnavailable";
  }
}
const firstLine = (value: string): string =>
  value.trim().split(/\r?\n/, 1)[0]?.slice(0, 240) ?? "";
export function run(
  argv: readonly [string, ...string[]],
  timeoutMs = COMMAND_TIMEOUT_MS,
  maxOutputBytes = COMMAND_OUTPUT_LIMIT_BYTES,
  signal?: AbortSignal
): Promise<CommandResult> {
  if (signal?.aborted)
    return Promise.resolve({
      code: 124,
      stdout: "",
      stderr: `${argv[0]} aborted at the watch deadline`,
    });
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let termination:
      | "command-timeout"
      | "output-limit"
      | "watch-deadline"
      | null = null;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let stdout = "";
    let stderr = "";
    let capturedBytes = 0;
    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", abortAtDeadline);
      resolve(result);
    };
    const terminate = (cause: Exclude<typeof termination, null>): void => {
      if (settled || termination !== null) return;
      termination = cause;
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      child.kill("SIGKILL");
    };
    const abortAtDeadline = (): void => terminate("watch-deadline");
    signal?.addEventListener("abort", abortAtDeadline, { once: true });
    if (signal?.aborted) abortAtDeadline();
    if (timeoutMs > 0 && termination === null) {
      timeoutHandle = setTimeout(() => {
        terminate("command-timeout");
      }, timeoutMs);
      timeoutHandle.unref();
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (termination !== null) return;
      const bytes = Buffer.byteLength(chunk);
      if (capturedBytes + bytes > maxOutputBytes) {
        terminate("output-limit");
        return;
      }
      capturedBytes += bytes;
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      if (termination !== null) return;
      const bytes = Buffer.byteLength(chunk);
      if (capturedBytes + bytes > maxOutputBytes) {
        terminate("output-limit");
        return;
      }
      capturedBytes += bytes;
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) =>
      finish({
        code: error.code === "ENOENT" ? 127 : 126,
        stdout,
        stderr: `${argv[0]}: ${error.message}`,
      })
    );
    child.on("close", (code) =>
      finish({
        code: termination === "output-limit"
          ? COMMAND_OUTPUT_LIMIT_EXIT
          : termination === "watch-deadline"
            ? 124
            : termination === "command-timeout"
              ? 124
              : (code ?? -1),
        stdout,
        stderr: termination === "output-limit"
          ? `${argv[0]} output exceeded ${maxOutputBytes} byte limit`
          : termination === "watch-deadline"
            ? `${argv[0]} aborted at the watch deadline`
            : termination === "command-timeout"
              ? `${stderr}${stderr && !stderr.endsWith("\n") ? "\n" : ""}${argv[0]} timed out after ${timeoutMs}ms`
              : stderr,
      })
    );
  });
}
function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WatcherQueryError({
      kind: "json-parse",
      retryable: true,
      detail: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
function commandTimeoutMilliseconds(deadline?: T.WatchDeadline): number {
  const remaining = deadline?.remainingMilliseconds();
  return remaining === null || remaining === undefined
    ? COMMAND_TIMEOUT_MS
    : Math.min(COMMAND_TIMEOUT_MS, Math.max(0, Math.ceil(remaining)));
}
function runWithDeadline(
  argv: readonly [string, ...string[]],
  deadline?: T.WatchDeadline
): Promise<CommandResult> {
  const timeoutMs = commandTimeoutMilliseconds(deadline);
  if (deadline !== undefined && timeoutMs === 0)
    return Promise.resolve({
      code: 124,
      stdout: "",
      stderr: `${argv[0]} aborted at the watch deadline`,
    });
  return run(
    argv,
    timeoutMs,
    COMMAND_OUTPUT_LIMIT_BYTES,
    deadline?.signal
  );
}
async function runJson(
  argv: readonly [string, ...string[]],
  deadline?: T.WatchDeadline
): Promise<unknown> {
  const result = await runWithDeadline(argv, deadline);
  if (result.code !== 0)
    throw new WatcherQueryError({
      kind: "command-exit",
      retryable: ![4, COMMAND_OUTPUT_LIMIT_EXIT, 126, 127].includes(result.code),
      code: result.code,
      detail: commandFailureDetail(argv, result),
    });
  return parseJson(result.stdout, argv.join(" "));
}
export function commandFailureDetail(
  argv: readonly [string, ...string[]],
  result: CommandResult
): string {
  if (argv[0] === "gh" && result.code === 127)
    return "gh CLI is unavailable; Deepwright can inspect GitHub through a connected GitHub tool, but the optional standalone watch-pr helper requires an authenticated gh CLI";
  return firstLine(result.stderr) || `${argv.join(" ")} exited ${result.code}`;
}
function raw(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function missing(path: string, value?: unknown): never {
  throw new WatcherQueryError({
    kind: "missing-key",
    retryable: true,
    detail:
      value === undefined
        ? `missing ${path}`
        : `invalid ${path}: ${raw(value)}`,
    ...(value === undefined ? {} : { rawValue: raw(value) }),
  });
}
function apiPrNumber(value: unknown, path: string): T.PrNumber {
  try {
    return parsePrNumber(value, path);
  } catch {
    return missing(path, value);
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) missing(path, value);
  return value;
}
function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) missing(path, value);
  return value;
}
function at(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    const object = record(current, path.join("."));
    if (!(key in object)) missing(path.join("."));
    current = object[key];
  }
  return current;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string") missing(path, value);
  return value;
}
const optionalString = (value: unknown, path: string): string | null =>
  value === null ? null : string(value, path);
function enumValue<const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] {
  if (typeof value === "string")
    for (const candidate of values) if (candidate === value) return candidate;
  return missing(path, value);
}
const nullableEnum = <const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] | null => (value === null ? null : enumValue(value, values, path));
export function connectionEndCursor(value: unknown, path: string): string | null {
  const page = record(value, path);
  if (typeof page.hasNextPage !== "boolean")
    missing(`${path}.hasNextPage`, page.hasNextPage);
  const cursor = optionalString(page.endCursor, `${path}.endCursor`);
  if (page.hasNextPage && (cursor === null || cursor.length === 0))
    missing(`${path}.endCursor`, cursor);
  return page.hasNextPage ? cursor : null;
}
const MERGE_STATES = [
  "BEHIND",
  "BLOCKED",
  "CLEAN",
  "CONFLICTING",
  "DIRTY",
  "DRAFT",
  "HAS_HOOKS",
  "UNKNOWN",
  "UNSTABLE",
] as const satisfies readonly T.MergeStateStatus[];
const ROLLUP_STATES = [
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
] as const;
const REVIEW_DECISIONS = [
  "APPROVED",
  "CHANGES_REQUESTED",
  "REVIEW_REQUIRED",
] as const;
// `gh pr view` reports no review decision as "", not null. Only this field does
// it, so the normalization stays here rather than in nullableEnum, where it
// would stop a genuinely unexpected rollup state from failing closed.
const reviewDecision = (value: unknown): T.ReviewDecision =>
  nullableEnum(
    value === "" ? null : value,
    REVIEW_DECISIONS,
    "pull request.reviewDecision"
  );
function parseRemote(value: string): T.Repository | null {
  let normalized = value.trim();
  if (normalized.startsWith("git@github.com:"))
    normalized = `https://github.com/${normalized.slice(15)}`;
  if (normalized.startsWith("ssh://git@github.com/"))
    normalized = `https://github.com/${normalized.slice(21)}`;
  try {
    const url = new URL(normalized);
    const parts = url.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2
    )
      return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}
function parsePrUrl(value: string): T.PrContext {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const numberText = parts[3] ?? "";
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 4 ||
      parts[2] !== "pull" ||
      url.pathname !== `/${parts.join("/")}` ||
      !/^[1-9][0-9]*$/u.test(numberText)
    )
      throw new Error("not a canonical GitHub pull URL");
    return {
      owner: parts[0],
      repo: parts[1],
      number: parsePrNumber(Number(numberText), "PR URL number"),
    };
  } catch (error) {
    throw new WatcherQueryError({
      kind: "invalid-context-url",
      retryable: false,
      rawValue: value,
      detail: `could not infer owner/repo from PR URL: ${value} (${error instanceof Error ? error.message : String(error)})`,
    });
  }
}
function checkDetails(value: Record<string, unknown>, nameKey: string) {
  return {
    name: string(value[nameKey], nameKey),
    description: typeof value.description === "string" ? value.description : "",
    link:
      typeof value.link === "string"
        ? value.link
        : typeof value.detailsUrl === "string"
          ? value.detailsUrl
          : "",
    workflow: typeof value.workflow === "string" ? value.workflow : "",
  };
}
export function parseFastCheck(value: unknown): T.Check {
  const object = record(value, "check");
  const details = checkDetails(object, "name");
  const state = string(object.state, "check.state").toUpperCase();
  const bucket = string(object.bucket, "check.bucket");
  if (
    bucket === "fail" ||
    ["FAILURE", "ERROR", "ACTION_REQUIRED"].includes(state)
  )
    return { ...details, kind: "failed", reportedState: state };
  if (bucket === "pending") return pendingOrGate(details, state);
  if (bucket === "pass")
    return { ...details, kind: "passed", reportedState: state };
  if (bucket === "skipping")
    return { ...details, kind: "skipped", reportedState: state };
  return { ...details, kind: "failed", reportedState: state };
}
// The owner-approval gate is excluded from pending everywhere, so the rule has
// one home. Classifying it as pending on either read path makes the watcher
// wait on a human, which is the behaviour #172004 removed from the Python.
function pendingOrGate(
  details: {
    readonly name: string;
    readonly description: string;
    readonly link: string;
    readonly workflow: string;
  },
  reportedState: string
): T.Check {
  return details.name === "Code Review Gate"
    ? {
        ...details,
        kind: "code-review-gate",
        name: "Code Review Gate",
        reportedState,
      }
    : { ...details, kind: "pending", reportedState };
}
export function mapRollupNode(value: unknown): T.Check {
  const object = record(value, "rollup node");
  const typename = object.__typename;
  if (typename !== "CheckRun" && typename !== "StatusContext")
    missing("rollup node.__typename", typename);
  const details = checkDetails(
    object,
    typename === "CheckRun" ? "name" : "context"
  );
  const link =
    typeof object.targetUrl === "string" ? object.targetUrl : details.link;
  if (typename === "CheckRun") {
    const status =
      typeof object.status === "string" ? object.status.toUpperCase() : "";
    const conclusion =
      typeof object.conclusion === "string"
        ? object.conclusion.toUpperCase()
        : "";
    if (status !== "COMPLETED")
      return pendingOrGate({ ...details, link }, "PENDING");
    if (conclusion === "SUCCESS")
      return { ...details, link, kind: "passed", reportedState: "SUCCESS" };
    if (conclusion === "NEUTRAL" || conclusion === "SKIPPED")
      return { ...details, link, kind: "skipped", reportedState: conclusion };
    return {
      ...details,
      link,
      kind: "failed",
      reportedState: conclusion === "ACTION_REQUIRED" ? conclusion : "FAILURE",
    };
  }
  const state =
    typeof object.state === "string" ? object.state.toUpperCase() : "";
  if (state === "PENDING" || state === "EXPECTED")
    return pendingOrGate({ ...details, link }, "PENDING");
  return state === "SUCCESS"
    ? { ...details, link, kind: "passed", reportedState: state }
    : { ...details, link, kind: "failed", reportedState: state || "FAILURE" };
}
function parseComment(value: unknown): T.ReviewComment {
  const object = record(value, "review comment");
  const author =
    object.author === null
      ? null
      : record(object.author, "review comment.author");
  return {
    authorLogin:
      author === null
        ? null
        : optionalString(author.login, "review comment.author.login"),
    body: string(object.body, "review comment.body"),
    path: optionalString(object.path, "review comment.path"),
    line:
      object.line === null
        ? null
        : Number.isInteger(object.line)
          ? Number(object.line)
          : missing("review comment.line", object.line),
    createdAt: string(object.createdAt, "review comment.createdAt"),
  };
}
const AUTOMATED_REVIEW_AUTHORS = [
  "bugbot",
  "chatgpt",
  "codex",
  "openai",
  "reviewbot",
] as const;
const AUTOMATED_REVIEW_MARKERS = [
  "agentic security review",
  "automated code review",
  "automation_id",
  "code review",
  "description start",
  "run_id",
  "severity",
] as const;
function isAutomatedReview(comment: T.ReviewComment | null): boolean {
  if (comment === null) return false;
  const author = (comment.authorLogin ?? "").toLowerCase();
  const body = comment.body.toLowerCase();
  const knownAuthor = AUTOMATED_REVIEW_AUTHORS.some((token) =>
    author.includes(token)
  );
  if (!knownAuthor) return false;
  return (
    author.includes("bugbot") ||
    author.includes("reviewbot") ||
    AUTOMATED_REVIEW_MARKERS.some((token) => body.includes(token))
  );
}
function passKey(comment: T.ReviewComment | null): string | null {
  if (comment === null) return null;
  const match =
    /(?:RUN_ID|(?:[A-Z][A-Z0-9_]*_)?AUTOMATION_ID):\s*([a-zA-Z0-9_.:-]+)/i.exec(
      comment.body
    );
  return match?.[1] ?? null;
}
interface ReviewThreadPage {
  readonly nodes: readonly unknown[];
  readonly endCursor: string | null;
}
export const MAX_REVIEW_THREAD_PAGES = 100;
export const MAX_REVIEW_THREAD_BODY_BYTES = 8 * 1024 * 1024;
export function parseReviewThreadPage(value: unknown): ReviewThreadPage {
  const connection = record(
    at(value, ["data", "repository", "pullRequest", "reviewThreads"]),
    "reviewThreads"
  );
  return {
    nodes: list(connection.nodes, "reviewThreads.nodes"),
    endCursor: connectionEndCursor(
      connection.pageInfo,
      "reviewThreads.pageInfo"
    ),
  };
}
function parseReviewThreadNodes(
  nodes: readonly unknown[]
): readonly T.ReviewThread[] {
  const threads: {
    readonly id: string;
    readonly firstComment: T.ReviewComment | null;
    readonly resolved: boolean;
  }[] = [];
  for (const node of nodes) {
    const thread = record(node, "review thread");
    if (typeof thread.isResolved !== "boolean")
      missing("review thread.isResolved", thread.isResolved);
    const comments = list(
      at(thread, ["comments", "nodes"]),
      "review thread.comments.nodes"
    );
    threads.push({
      id: string(thread.id, "review thread.id"),
      firstComment: comments.length === 0 ? null : parseComment(comments[0]),
      resolved: thread.isResolved,
    });
  }
  const keys = new Set<string>();
  let keyless = false;
  for (const thread of threads) {
    if (!isAutomatedReview(thread.firstComment)) continue;
    const key = passKey(thread.firstComment);
    if (key === null) keyless = true;
    else keys.add(key);
  }
  const passes = keys.size > 0 ? keys.size : keyless ? 1 : 0;
  return threads
    .filter((thread) => !thread.resolved)
    .map(({ id, firstComment }) => ({
      id,
      firstComment,
      isAutomatedReview: isAutomatedReview(firstComment),
      automatedReviewPasses: passes,
    }));
}
export function parseReviewThreads(value: unknown): readonly T.ReviewThread[] {
  const page = parseReviewThreadPage(value);
  if (page.endCursor !== null)
    throw new WatcherQueryError({
      kind: "missing-key",
      retryable: true,
      detail:
        "reviewThreads response has another page; refusing to classify an incomplete thread set",
      rawValue: page.endCursor,
    });
  return parseReviewThreadNodes(page.nodes);
}
export async function collectReviewThreads(
  fetchPage: (after: string | null) => Promise<unknown>,
  maxBodyBytes = MAX_REVIEW_THREAD_BODY_BYTES
): Promise<readonly T.ReviewThread[]> {
  const nodes: unknown[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  let pages = 0;
  let bodyBytes = 0;
  do {
    if (pages >= MAX_REVIEW_THREAD_PAGES)
      throw new WatcherQueryError({
        kind: "missing-key",
        retryable: true,
        detail: `reviewThreads exceeded ${MAX_REVIEW_THREAD_PAGES} pages; refusing to classify an incomplete thread set`,
        ...(after === null ? {} : { rawValue: after }),
      });
    const page = parseReviewThreadPage(await fetchPage(after));
    pages += 1;
    for (const node of page.nodes) {
      const thread = record(node, "review thread");
      const comments = list(
        at(thread, ["comments", "nodes"]),
        "review thread.comments.nodes"
      );
      if (comments.length === 0) continue;
      const comment = record(comments[0], "review comment");
      bodyBytes += Buffer.byteLength(
        string(comment.body, "review comment.body")
      );
      if (bodyBytes > maxBodyBytes)
        throw new WatcherQueryError({
          kind: "response-too-large",
          retryable: false,
          detail: `review thread bodies exceeded the ${maxBodyBytes}-byte safety limit`,
          limitBytes: maxBodyBytes,
        });
    }
    nodes.push(...page.nodes);
    if (page.endCursor !== null && cursors.has(page.endCursor))
      throw new WatcherQueryError({
        kind: "missing-key",
        retryable: true,
        detail: `reviewThreads cursor did not advance: ${page.endCursor}`,
        rawValue: page.endCursor,
      });
    if (page.endCursor !== null) cursors.add(page.endCursor);
    after = page.endCursor;
  } while (after !== null);
  return parseReviewThreadNodes(nodes);
}
export function parsePullRequest(
  value: unknown,
  context: T.PrContext
): T.PullRequestFacts {
  const object = record(value, "pull request");
  if (typeof object.isDraft !== "boolean")
    missing("pull request.isDraft", object.isDraft);
  const state = enumValue(
    object.state,
    ["OPEN", "CLOSED", "MERGED"] as const,
    "pull request.state"
  );
  const mergedAt = optionalString(object.mergedAt, "pull request.mergedAt");
  if ((state === "MERGED") !== (mergedAt !== null))
    missing("pull request.state/mergedAt consistency", { state, mergedAt });
  return {
    context,
    mergeable: enumValue(
      object.mergeable,
      ["MERGEABLE", "CONFLICTING", "UNKNOWN"] as const,
      "pull request.mergeable"
    ),
    mergeStateStatus: enumValue(
      object.mergeStateStatus,
      MERGE_STATES,
      "pull request.mergeStateStatus"
    ),
    reviewDecision: reviewDecision(object.reviewDecision),
    headRefOid: optionalString(object.headRefOid, "pull request.headRefOid"),
    headRefName: string(object.headRefName, "pull request.headRefName"),
    baseRefName: string(object.baseRefName, "pull request.baseRefName"),
    state,
    mergedAt,
    isDraft: object.isDraft,
  };
}
function graphqlArgs(
  query: string,
  context: T.PrContext
): [string, ...string[]] {
  return [
    "gh",
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `owner=${context.owner}`,
    "-f",
    `repo=${context.repo}`,
    "-F",
    `pr=${context.number}`,
  ];
}

export const OPEN_PULL_REQUEST_LIMIT = 300;
export function parseOpenPullRequests(
  value: unknown
): readonly T.OpenPullRequest[] {
  const items = list(value, "open PRs");
  if (items.length >= OPEN_PULL_REQUEST_LIMIT)
    throw new WatcherQueryError({
      kind: "missing-key",
      retryable: true,
      detail: `open PR list reached the ${OPEN_PULL_REQUEST_LIMIT}-row gh limit; refusing incomplete stack discovery`,
      rawValue: String(items.length),
    });
  return items.map((item, index) => {
    const object = record(item, `open PRs[${index}]`);
    if (typeof object.isCrossRepository !== "boolean")
      missing(
        `open PRs[${index}].isCrossRepository`,
        object.isCrossRepository
      );
    return {
      number: apiPrNumber(object.number, `open PRs[${index}].number`),
      headRefName: string(
        object.headRefName,
        `open PRs[${index}].headRefName`
      ),
      baseRefName: string(
        object.baseRefName,
        `open PRs[${index}].baseRefName`
      ),
      isCrossRepository: object.isCrossRepository,
    };
  });
}

export function parseCurrentPr(
  value: unknown,
  requested: T.PrNumber | null
): T.PrContext {
  const object = record(value, "current PR");
  const parsed = parsePrUrl(string(object.url, "current PR.url"));
  const reported = apiPrNumber(object.number, "current PR.number");
  if (reported !== parsed.number)
    missing("current PR.number/url consistency", {
      number: reported,
      urlNumber: parsed.number,
    });
  if (requested !== null && reported !== requested)
    missing("current PR.number/request consistency", {
      requested,
      number: reported,
    });
  return parsed;
}

export class GhGitHubReader implements T.GitHubReader {
  async originRepo(
    deadline: T.WatchDeadline | undefined
  ): Promise<T.Repository | null> {
    const result = await runWithDeadline(
      ["git", "remote", "get-url", "origin"],
      deadline
    );
    if (deadline?.expired())
      throw new WatcherQueryError({
        kind: "command-exit",
        retryable: true,
        code: 124,
        detail: "git origin lookup exceeded the watch deadline",
      });
    return result.code === 0 ? parseRemote(result.stdout) : null;
  }
  async currentPr(
    pr: T.PrNumber | null,
    deadline: T.WatchDeadline | undefined
  ): Promise<T.PrContext> {
    const argv: [string, ...string[]] = ["gh", "pr", "view"];
    if (pr !== null) argv.push(String(pr));
    argv.push("--json", "number,url");
    return parseCurrentPr(await runJson(argv, deadline), pr);
  }
  async pullRequest(
    context: T.PrContext,
    deadline: T.WatchDeadline | undefined
  ): Promise<T.PullRequestFacts> {
    return parsePullRequest(
      await runJson([
        "gh",
        "pr",
        "view",
        String(context.number),
        "--repo",
        `${context.owner}/${context.repo}`,
        "--json",
        "mergeable,mergeStateStatus,reviewDecision,headRefOid,headRefName,baseRefName,state,mergedAt,isDraft",
      ], deadline),
      context
    );
  }
  async openPullRequests(
    repository: T.Repository,
    deadline: T.WatchDeadline | undefined
  ): Promise<readonly T.OpenPullRequest[]> {
    const value = await runJson([
      "gh",
      "pr",
      "list",
      "--repo",
      `${repository.owner}/${repository.repo}`,
      "--state",
      "open",
      "--limit",
      String(OPEN_PULL_REQUEST_LIMIT),
      "--json",
      "number,headRefName,baseRefName,isCrossRepository",
    ], deadline);
    return parseOpenPullRequests(value);
  }
  async checksFastPath(
    context: T.PrContext,
    deadline: T.WatchDeadline | undefined
  ): Promise<T.ChecksFastPath> {
    const result = await runWithDeadline(
      [
        "gh",
        "pr",
        "checks",
        String(context.number),
        "--repo",
        `${context.owner}/${context.repo}`,
        "--json",
        "name,state,description,link,workflow,bucket",
      ],
      deadline
    );
    if ([0, 1, 8].includes(result.code) && result.stdout.trim()) {
      try {
        const value = parseJson(result.stdout, "gh pr checks");
        if (Array.isArray(value))
          return { kind: "checks", checks: value.map(parseFastCheck) };
      } catch (error) {
        if (!(error instanceof WatcherQueryError)) throw error;
      }
    }
    return { kind: "unusable", exitCode: result.code, stderr: result.stderr };
  }
  async checkRollupPage(
    context: T.PrContext,
    after: string | null,
    deadline: T.WatchDeadline | undefined
  ): Promise<T.RollupPage> {
    const argv = graphqlArgs(PR_CHECK_ROLLUP_QUERY, context);
    if (after !== null) argv.push("-f", `after=${after}`);
    const value = await runJson(argv, deadline);
    const commits = list(
      at(value, ["data", "repository", "pullRequest", "commits", "nodes"]),
      "commits.nodes"
    );
    if (commits.length === 0) return { checks: [], endCursor: null };
    const commit = record(
      at(commits[commits.length - 1], ["commit"]),
      "commit"
    );
    if (commit.statusCheckRollup === null)
      return { checks: [], endCursor: null };
    const contexts = record(
      at(commit, ["statusCheckRollup", "contexts"]),
      "contexts"
    );
    const checks = list(contexts.nodes, "contexts.nodes").map(mapRollupNode);
    return {
      checks,
      endCursor: connectionEndCursor(contexts.pageInfo, "contexts.pageInfo"),
    };
  }
  async reviewThreads(
    context: T.PrContext,
    deadline: T.WatchDeadline | undefined
  ): Promise<readonly T.ReviewThread[]> {
    return collectReviewThreads(async (after) => {
      const argv = graphqlArgs(REVIEW_THREADS_QUERY, context);
      if (after !== null) argv.push("-f", `after=${after}`);
      return runJson(argv, deadline);
    });
  }
  async commitRollups(
    context: T.PrContext,
    deadline: T.WatchDeadline | undefined
  ): Promise<readonly T.CommitRollup[]> {
    const value = await runJson(
      graphqlArgs(PR_COMMIT_STATUS_QUERY, context),
      deadline
    );
    const commits = list(
      at(value, ["data", "repository", "pullRequest", "commits", "nodes"]),
      "commits.nodes"
    );
    return commits.map((item, index) => {
      const commit = record(at(item, ["commit"]), `commits[${index}].commit`);
      const rollup = commit.statusCheckRollup;
      return {
        oid: string(commit.oid, `commits[${index}].oid`),
        state:
          rollup === null
            ? null
            : nullableEnum(
                at(rollup, ["state"]),
                ROLLUP_STATES,
                `commits[${index}].statusCheckRollup.state`
              ),
      };
    });
  }
}

export const MAX_CHECK_ROLLUP_PAGES = 100;
export async function resolveChecks(
  reader: T.GitHubReader,
  context: T.PrContext,
  deadline?: T.WatchDeadline
): Promise<T.CheckRead> {
  const fast = await reader.checksFastPath(context, deadline);
  const direct = fast.kind === "checks" ? nonEmpty(fast.checks) : null;
  if (direct !== null) return { source: "gh-pr-checks", checks: direct };
  const checks: T.Check[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  let pages = 0;
  do {
    if (pages >= MAX_CHECK_ROLLUP_PAGES)
      throw new WatcherQueryError({
        kind: "missing-key",
        retryable: true,
        detail: `check rollup exceeded ${MAX_CHECK_ROLLUP_PAGES} pages; refusing to classify an incomplete check set`,
        ...(after === null ? {} : { rawValue: after }),
      });
    const page = await reader.checkRollupPage(context, after, deadline);
    pages += 1;
    checks.push(...page.checks);
    if (page.endCursor !== null && cursors.has(page.endCursor))
      throw new WatcherQueryError({
        kind: "missing-key",
        retryable: true,
        detail: `check rollup cursor did not advance: ${page.endCursor}`,
        rawValue: page.endCursor,
      });
    if (page.endCursor !== null) cursors.add(page.endCursor);
    after = page.endCursor;
  } while (after !== null);
  const fallback = nonEmpty(checks);
  if (fallback !== null) return { source: "graphql-rollup", checks: fallback };
  const suffix =
    fast.kind === "unusable"
      ? `fast path exit=${fast.exitCode}; GraphQL rollup was empty${firstLine(fast.stderr) ? `; ${firstLine(fast.stderr)}` : ""}`
      : "fast path and GraphQL rollup were empty";
  throw new ChecksUnavailable(`could not read PR checks: ${suffix}`);
}
export async function resolveContext(args: {
  readonly reader: T.GitHubReader;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
  readonly deadline?: T.WatchDeadline;
}): Promise<T.PrContext> {
  if ((args.owner === null) !== (args.repo === null))
    throw new WatcherQueryError({
      kind: "invalid-context",
      retryable: false,
      detail: "owner and repo must be provided together; refusing to combine an explicit coordinate with an inferred repository",
      rawValue: JSON.stringify({ owner: args.owner, repo: args.repo }),
    });
  if (args.pr !== null && args.owner !== null && args.repo !== null)
    return { owner: args.owner, repo: args.repo, number: args.pr };
  if (args.pr !== null) {
    const origin = await args.reader.originRepo(args.deadline);
    if (origin !== null)
      return {
        owner: origin.owner,
        repo: origin.repo,
        number: args.pr,
      };
  }
  const inferred = await args.reader.currentPr(args.pr, args.deadline);
  if (args.pr !== null && inferred.number !== args.pr)
    throw new WatcherQueryError({
      kind: "invalid-context",
      retryable: false,
      detail: `inferred PR #${inferred.number} does not match requested PR #${args.pr}`,
      rawValue: JSON.stringify({ requested: args.pr, inferred }),
    });
  if (
    args.owner !== null &&
    args.repo !== null &&
    (args.owner !== inferred.owner || args.repo !== inferred.repo)
  )
    throw new WatcherQueryError({
      kind: "invalid-context",
      retryable: false,
      detail: `explicit repository ${args.owner}/${args.repo} does not match inferred PR repository ${inferred.owner}/${inferred.repo}; pass --pr to select the explicit repository safely`,
      rawValue: JSON.stringify({
        explicit: { owner: args.owner, repo: args.repo },
        inferred,
      }),
    });
  return inferred;
}
export function orderStack(
  context: T.PrContext,
  open: readonly T.OpenPullRequest[]
): T.NonEmpty<T.PrContext> {
  const byNumber = new Map<T.PrNumber, T.OpenPullRequest>();
  const byHead = new Map<string, T.OpenPullRequest>();
  for (const pr of open) {
    if (byNumber.has(pr.number))
      throw new WatcherQueryError({
        kind: "missing-key",
        retryable: true,
        detail: `open PR list contains duplicate PR number ${pr.number}; refusing ambiguous stack discovery`,
        rawValue: String(pr.number),
      });
    byNumber.set(pr.number, pr);
    if (!pr.isCrossRepository) {
      if (byHead.has(pr.headRefName))
        throw new WatcherQueryError({
          kind: "missing-key",
          retryable: true,
          detail: `open PR list contains duplicate base-repository headRefName ${pr.headRefName}; refusing ambiguous stack discovery`,
          rawValue: pr.headRefName,
        });
      byHead.set(pr.headRefName, pr);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const proveAcyclic = (pr: T.OpenPullRequest): void => {
    if (visited.has(pr.headRefName)) return;
    if (visiting.has(pr.headRefName))
      throw new WatcherQueryError({
        kind: "missing-key",
        retryable: true,
        detail: `open PR base/head graph contains a cycle at ${pr.headRefName}; refusing stack discovery`,
        rawValue: pr.headRefName,
      });
    visiting.add(pr.headRefName);
    const parent = byHead.get(pr.baseRefName);
    if (parent !== undefined) proveAcyclic(parent);
    visiting.delete(pr.headRefName);
    visited.add(pr.headRefName);
  };
  // Fork heads are not members of the base repository's branch graph.  Walking
  // them here would also let a same-named fork head pre-populate `visited` and
  // mask a real cycle between base-repository branches.
  for (const pr of byHead.values()) proveAcyclic(pr);
  const children = new Map<string, T.OpenPullRequest[]>();
  for (const pr of open)
    children.set(pr.baseRefName, [...(children.get(pr.baseRefName) ?? []), pr]);
  for (const values of children.values())
    values.sort((a, b) => a.number - b.number);
  const start = byNumber.get(context.number);
  if (start === undefined) return [context];
  if (start.isCrossRepository) return [context];
  const down: T.OpenPullRequest[] = [];
  let current = start;
  while (byHead.has(current.baseRefName)) {
    const parent = byHead.get(current.baseRefName);
    if (parent === undefined) break;
    down.push(parent);
    current = parent;
  }
  const seen = new Set<T.PrNumber>([
    ...down.map((pr) => pr.number),
    start.number,
  ]);
  const up: T.OpenPullRequest[] = [];
  const visit = (parent: T.OpenPullRequest): void => {
    if (parent.isCrossRepository) return;
    for (const child of children.get(parent.headRefName) ?? []) {
      if (child.isCrossRepository) continue;
      if (seen.has(child.number)) continue;
      seen.add(child.number);
      up.push(child);
      visit(child);
    }
  };
  visit(start);
  return (
    nonEmpty(
      [...down.reverse(), start, ...up].map((pr) => ({
        ...context,
        number: pr.number,
      }))
    ) ?? [context]
  );
}
export async function discoverStack(
  reader: T.GitHubReader,
  context: T.PrContext,
  deadline?: T.WatchDeadline
): Promise<T.NonEmpty<T.PrContext>> {
  return orderStack(
    context,
    await reader.openPullRequests(context, deadline)
  );
}
