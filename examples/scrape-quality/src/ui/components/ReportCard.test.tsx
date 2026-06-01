// @vitest-environment jsdom
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReportCard } from "./ReportCard";
import type { QualityReport } from "../../scoring/grade";

const grade: QualityReport = {
  url: "https://shop.de",
  score: 74,
  rating: "C",
  summary: "74/100 (C) — INLINE_GLUE ×1, HIGH_BOILERPLATE ×1",
  dimensions: { structureFidelity: 100, tablesCode: 100, inlineGlue: 75, boilerplateNoise: 29, tokenEfficiency: 55 },
  findings: [
    { code: "INLINE_GLUE", severity: "high", evidence: "FunktionalFunktional", offset: 0 },
    { code: "HIGH_BOILERPLATE", severity: "medium", evidence: "71% boilerplate" },
  ],
  artifacts: { markdown: "# x", html: "<h1>x</h1>" },
  meta: { config: "local", latencyMs: 120, statusCode: 200 },
};

describe("ReportCard", () => {
  test("shows the overall score, rating and url", () => {
    render(<ReportCard grade={grade} />);
    expect(screen.getByText("74")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("https://shop.de")).toBeInTheDocument();
  });

  test("renders each present dimension with a human label and its value", () => {
    render(<ReportCard grade={grade} />);
    expect(screen.getByText("Structure Fidelity")).toBeInTheDocument();
    expect(screen.getByText("Inline Glue")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
  });

  test("does not render a dimension that is absent", () => {
    render(<ReportCard grade={grade} />);
    expect(screen.queryByText("Extraction Integrity")).not.toBeInTheDocument();
  });

  test("lists findings with their code, severity and evidence", () => {
    render(<ReportCard grade={grade} />);
    expect(screen.getByText("FunktionalFunktional")).toBeInTheDocument();
    expect(screen.getByText("71% boilerplate")).toBeInTheDocument();
    expect(screen.getAllByText(/INLINE_GLUE/).length).toBeGreaterThan(0);
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  test("shows the scrape meta (status + latency)", () => {
    render(<ReportCard grade={grade} />);
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
  });

  test("renders a clean grade with no findings", () => {
    const clean: QualityReport = {
      ...grade,
      score: 100,
      rating: "A",
      summary: "100/100 (A) — clean",
      findings: [],
    };
    render(<ReportCard grade={clean} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText(/clean/i)).toBeInTheDocument();
  });
});
