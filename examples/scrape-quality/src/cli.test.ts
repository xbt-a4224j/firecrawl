import { describe, test, expect } from "vitest";
import { formatReport } from "./cli";
import type { QualityReport } from "./scoring/grade";

const grade: QualityReport = {
  url: "https://shop.de",
  score: 74,
  rating: "C",
  summary: "74/100 (C) — INLINE_GLUE ×1, HIGH_BOILERPLATE ×1",
  dimensions: { structureFidelity: 100, inlineGlue: 75, boilerplateNoise: 29 },
  findings: [
    { code: "INLINE_GLUE", severity: "high", evidence: "FunktionalFunktional", offset: 0 },
    { code: "HIGH_BOILERPLATE", severity: "medium", evidence: "71% boilerplate" },
  ],
  artifacts: { markdown: "x", html: "y" },
  meta: { config: "cloud", statusCode: 200 },
};

describe("formatReport", () => {
  test("renders the headline score, rating and url", () => {
    const out = formatReport(grade);
    expect(out).toContain("https://shop.de");
    expect(out).toContain("74");
    expect(out).toContain("(C)");
  });

  test("lists each finding with severity, code and evidence", () => {
    const out = formatReport(grade);
    expect(out).toContain("INLINE_GLUE");
    expect(out).toContain("FunktionalFunktional");
    expect(out).toContain("HIGH_BOILERPLATE");
    expect(out).toContain("high");
  });

  test("shows the dimensions", () => {
    const out = formatReport(grade);
    expect(out).toContain("structureFidelity");
    expect(out).toContain("75");
  });

  test("renders a clean grade without a findings section", () => {
    const clean: QualityReport = { ...grade, score: 100, rating: "A", summary: "100/100 (A) — clean", findings: [] };
    const out = formatReport(clean);
    expect(out).toContain("(A)");
    expect(out.toLowerCase()).toContain("clean");
  });
});
