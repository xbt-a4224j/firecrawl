import { describe, test, expect } from "vitest";
import { gradeFixtures, CORPUS_FIXTURES } from "./fixtures";
import { leaderboard } from "../leaderboard";

describe("corpus fixtures", () => {
  const results = gradeFixtures();

  test("grades every fixture and tags it with a category", () => {
    expect(results).toHaveLength(CORPUS_FIXTURES.length);
    expect(results.every((r) => typeof r.meta.category === "string")).toBe(true);
  });

  test("the clean control scores high (A)", () => {
    const clean = results.find((r) => r.meta.category === "clean-control");
    expect(clean?.rating).toBe("A");
  });

  test("the cookie fixture reproduces the #3583 inline-glue receipt", () => {
    const cmp = results.find((r) => r.meta.category === "cmp-cookie");
    expect(cmp?.findings.map((f) => f.code)).toContain("INLINE_GLUE");
    expect(cmp!.score).toBeLessThan(clean(results).score);
  });

  test("the table fixture reproduces a TABLE_FLATTENED finding", () => {
    const tables = results.find((r) => r.meta.category === "tables");
    expect(tables?.findings.map((f) => f.code)).toContain("TABLE_FLATTENED");
  });

  test("the code fixture reproduces a CODE_UNFENCED finding", () => {
    const code = results.find((r) => r.meta.category === "code-docs");
    expect(code?.findings.map((f) => f.code)).toContain("CODE_UNFENCED");
  });

  test("feeds a meaningful leaderboard (worst is not the clean control)", () => {
    const lb = leaderboard(results);
    expect(lb.count).toBe(CORPUS_FIXTURES.length);
    expect(lb.worst[0]?.meta.category).not.toBe("clean-control");
    expect(lb.failureModes.some((m) => m.code === "INLINE_GLUE")).toBe(true);
  });
});

function clean(results: ReturnType<typeof gradeFixtures>) {
  return results.find((r) => r.meta.category === "clean-control")!;
}
