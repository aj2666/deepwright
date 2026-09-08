import { describe, expect, it } from "vitest";
import { MAX_QUERY_BYTES, rankEntries, searchTerms } from "./ranking.mjs";

describe("ranked metadata discovery", () => {
  it("prefers a canonical name over another entry's identical display name", () => {
    const entries = [
      { name: "security-review", description: "Review a large application and report evidence for each requirement and each relevant access boundary." },
      { name: "alpha", displayName: "security-review", description: "security review" },
    ];
    for (const query of ["security-review", "$deepwright:security-review", "SECURITY-REVIEW"]) {
      expect(rankEntries(entries, query, 1).map((entry) => entry.name)).toEqual(["security-review"]);
    }
  });

  it("ranks task-specific metadata and excludes instruction bodies", () => {
    const entries = [
      { name: "general-review", description: "Review code", body: "security ".repeat(10000) },
      { name: "access-review", description: "Review code for security issues", body: "private-body-only" },
    ];
    expect(rankEntries(entries, "review my code for security problems")[0].name).toBe("access-review");
    expect(rankEntries(entries, "private-body-only")).toEqual([]);
    expect(rankEntries(entries.map((entry) => ({ ...entry, body: "changed" })), "security").map((entry) => entry.name))
      .toEqual(["access-review"]);
  });

  it("keeps top results deterministic across directory order without changing source metadata", () => {
    const entries = ["zeta", "alpha", "beta", "delta"].map((name) => ({ name, description: "Inspect tests", path: "/" + name }));
    const before = JSON.stringify(entries);
    const first = rankEntries(entries, "tests", 2);
    expect(first.map((entry) => entry.name)).toEqual(["alpha", "beta"]);
    expect(rankEntries([...entries].reverse(), "tests", 2)).toEqual(first);
    expect(JSON.stringify(entries)).toBe(before);
    expect(first.every((entry) => Number.isFinite(entry.score) && entry.score > 0)).toBe(true);
  });

  it("handles literal identifiers, English plurals and Unicode without regex interpretation", () => {
    const entries = [
      { name: "access-review", description: "Inspect permission boundaries", displayName: "AccessReview" },
      { name: "cafe", description: "Inspect café access" },
    ];
    expect(rankEntries(entries, "permission boundary")[0].name).toBe("access-review");
    expect(rankEntries(entries, "AccessReview")[0].name).toBe("access-review");
    expect(rankEntries(entries, "ｃａｆé")[0].name).toBe("cafe");
    expect(rankEntries(entries, "(?=quasar).*")).toEqual([]);
    expect(searchTerms("Use the API with permission boundaries")).toEqual(["api", "permission", "boundary"]);
  });

  it.each(["", "  \t\n", "the and for my", "quasars nebulae"])("returns no result for %j", (query) => {
    expect(rankEntries([{ name: "review", description: "Inspect code" }], query)).toEqual([]);
  });

  it("reflects changed or removed metadata on the next call", () => {
    const entries = [{ name: "review", description: "Inspect security" }];
    expect(rankEntries(entries, "security").map((entry) => entry.name)).toEqual(["review"]);
    expect(rankEntries([{ ...entries[0], description: "Inspect spelling" }], "security")).toEqual([]);
    expect(rankEntries([], "security")).toEqual([]);
  });

  it("bounds search input and limits before ranking", () => {
    for (const limit of [0, -1, 1.1, 11, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => rankEntries([], "review", limit)).toThrow("integer from 1 to 10");
    }
    expect(() => rankEntries([], "x".repeat(MAX_QUERY_BYTES + 1))).toThrow("UTF-8 bytes");
    expect(() => rankEntries([], "é".repeat(MAX_QUERY_BYTES / 2 + 1))).toThrow("UTF-8 bytes");
    expect(rankEntries([], "x".repeat(MAX_QUERY_BYTES))).toEqual([]);
  });
});
