import { describe, test, expect } from "vitest";
import { leaderboard } from "./leaderboard";
import type { QualityReport } from "./scoring/grade";
import type { Finding } from "./scoring/types";

function g(url: string, score: number, category?: string, findings: Finding[] = []): QualityReport {
  return {
    url,
    score,
    rating: "C",
    summary: "",
    dimensions: {},
    findings,
    artifacts: { markdown: "", html: "" },
    meta: category ? { category } : {},
  };
}

const glue: Finding = { code: "INLINE_GLUE", severity: "high", evidence: "x" };
const table: Finding = { code: "TABLE_FLATTENED", severity: "medium", evidence: "y" };

describe("leaderboard", () => {
  test("ranks worst-scoring pages first", () => {
    const lb = leaderboard([g("a", 80), g("b", 20), g("c", 50)]);
    expect(lb.worst.map((e) => e.score)).toEqual([20, 50, 80]);
  });

  test("groups stats by category", () => {
    const lb = leaderboard([g("a", 80, "docs"), g("b", 40, "cmp"), g("c", 20, "cmp")]);
    const cmp = lb.byCategory.find((c) => c.category === "cmp");
    expect(cmp).toMatchObject({ count: 2, avgScore: 30, worstScore: 20 });
    expect(lb.byCategory.find((c) => c.category === "docs")?.count).toBe(1);
  });

  test("ranks failure modes by frequency", () => {
    const lb = leaderboard([g("a", 50, undefined, [glue]), g("b", 50, undefined, [glue, table])]);
    expect(lb.failureModes).toEqual([
      { code: "INLINE_GLUE", count: 2 },
      { code: "TABLE_FLATTENED", count: 1 },
    ]);
  });

  test("reports overall count and average score", () => {
    const lb = leaderboard([g("a", 80), g("b", 40), g("c", 20)]);
    expect(lb.count).toBe(3);
    expect(lb.avgScore).toBe(47); // round(140/3)
  });

  test("handles an empty corpus", () => {
    const lb = leaderboard([]);
    expect(lb).toEqual({ worst: [], byCategory: [], failureModes: [], count: 0, avgScore: 0 });
  });

  test("is deterministic", () => {
    const grades = [g("a", 30, "cmp", [glue]), g("b", 70, "docs")];
    expect(leaderboard(grades)).toEqual(leaderboard(grades));
  });
});
