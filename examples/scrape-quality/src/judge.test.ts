import { describe, test, expect } from "vitest";
import { judge, buildJudgePrompt } from "./judge";
import type { QualityReport } from "./scoring/grade";

const sampleGrade: QualityReport = {
  url: "https://shop.de",
  score: 48,
  rating: "D",
  summary: "48/100 (D) — INLINE_GLUE ×1",
  dimensions: { structureFidelity: 90, tablesCode: 40, inlineGlue: 75, boilerplateNoise: 30, tokenEfficiency: 55 },
  findings: [{ code: "INLINE_GLUE", severity: "high", evidence: "FunktionalFunktional", offset: 0 }],
  artifacts: { markdown: "# Title\n\nSome content.", html: "<h1>Title</h1>" },
  meta: {},
};

describe("judge", () => {
  test("parses the model JSON into a verdict", async () => {
    const complete = async () =>
      JSON.stringify({ score: 50, rationale: "structure mostly intact", agrees_with_metrics: true });
    const verdict = await judge(sampleGrade, { complete });
    expect(verdict).not.toBeNull();
    expect(verdict!.score).toBe(50);
    expect(verdict!.rationale).toBe("structure mostly intact");
  });

  test("computes agreement from the score gap, not the model's say-so", async () => {
    const complete = async () =>
      JSON.stringify({ score: 80, rationale: "r", agrees_with_metrics: true, disagreement_note: "metrics too harsh" });
    const verdict = await judge(sampleGrade, { complete }); // grade 48 vs 80 -> gap 32 > 15
    expect(verdict!.agreesWithMetrics).toBe(false);
    expect(verdict!.disagreementNote).toContain("harsh");
  });

  test("agrees when the gap is within 15", async () => {
    const complete = async () => JSON.stringify({ score: 55, rationale: "r" });
    const verdict = await judge(sampleGrade, { complete });
    expect(verdict!.agreesWithMetrics).toBe(true);
  });

  test("tolerates a fenced ```json block in the response", async () => {
    const complete = async () => "```json\n{\"score\":60,\"rationale\":\"ok\"}\n```";
    const verdict = await judge(sampleGrade, { complete });
    expect(verdict!.score).toBe(60);
  });

  test("returns null (graceful no-op) when there is no API key and no injected completer", async () => {
    const verdict = await judge(sampleGrade, { apiKey: "" });
    expect(verdict).toBeNull();
  });
});

describe("buildJudgePrompt", () => {
  test("includes the dimension scores and findings", () => {
    const prompt = buildJudgePrompt(sampleGrade, 1000);
    expect(prompt.user).toContain("structureFidelity");
    expect(prompt.user).toContain("INLINE_GLUE");
    expect(prompt.system).toMatch(/LLM-readiness/i);
  });

  test("truncates long markdown to the token budget", () => {
    const longMd = "word ".repeat(5000);
    const grade = { ...sampleGrade, artifacts: { markdown: longMd, html: "" } };
    const prompt = buildJudgePrompt(grade, 100);
    expect(prompt.user).toContain("[truncated]");
    expect(prompt.user.length).toBeLessThan(longMd.length);
  });
});
