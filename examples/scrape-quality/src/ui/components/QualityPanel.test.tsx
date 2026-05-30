// @vitest-environment jsdom
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QualityPanel } from "./QualityPanel";
import type { QualityReport } from "../../scoring/grade";

const report: QualityReport = {
  url: "https://shop.de",
  score: 74,
  rating: "C",
  summary: "74/100 (C) — INLINE_GLUE ×1",
  dimensions: { inlineGlue: 75 },
  findings: [{ code: "INLINE_GLUE", severity: "high", evidence: "FunktionalFunktional", offset: 0 }],
  artifacts: { markdown: "FunktionalFunktional", html: "<x/>", screenshotUrl: "https://shot/1.png" },
  meta: { statusCode: 200 },
};

describe("QualityPanel", () => {
  test("renders the report card score and the diff-theater highlight", () => {
    render(<QualityPanel report={report} />);
    expect(screen.getByText("74")).toBeInTheDocument();
    const marks = screen.getAllByText("FunktionalFunktional");
    expect(marks.some((el) => el.tagName === "MARK")).toBe(true);
  });
});
