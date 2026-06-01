// @vitest-environment jsdom
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { DiffTheater } from "./DiffTheater";
import type { QualityReport } from "../../scoring/grade";

const grade: QualityReport = {
  url: "https://shop.de",
  score: 74,
  rating: "C",
  summary: "",
  dimensions: {},
  findings: [
    { code: "INLINE_GLUE", severity: "high", evidence: "FunktionalFunktional", offset: 0 },
    { code: "TABLE_FLATTENED", severity: "medium", evidence: "1 of 2 table(s) flattened to prose" },
  ],
  artifacts: {
    markdown: "FunktionalFunktional\n\nWelcome to the shop.",
    html: "<x/>",
    screenshotUrl: "https://shot/1.png",
  },
  meta: {},
};

describe("DiffTheater", () => {
  test("renders the page screenshot", () => {
    render(<DiffTheater grade={grade} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://shot/1.png");
  });

  test("highlights a glued token with a <mark>", () => {
    render(<DiffTheater grade={grade} />);
    const glued = screen.getByText("FunktionalFunktional");
    expect(glued.tagName).toBe("MARK");
  });

  test("renders the surrounding markdown text", () => {
    render(<DiffTheater grade={grade} />);
    expect(screen.getByText(/Welcome to the shop/)).toBeInTheDocument();
  });

  test("shows a banner for a dropped structure", () => {
    render(<DiffTheater grade={grade} />);
    expect(screen.getByText(/flattened to prose/)).toBeInTheDocument();
  });

  test("toggling to raw removes the highlight marks", async () => {
    render(<DiffTheater grade={grade} />);
    expect(screen.getByText("FunktionalFunktional").tagName).toBe("MARK");
    await userEvent.click(screen.getByRole("button", { name: /raw/i }));
    // in raw mode the token is plain text, not a <mark>
    expect(screen.queryByText("FunktionalFunktional")).toBeNull();
    expect(screen.getByText(/FunktionalFunktional/)).toBeInTheDocument(); // present, just not isolated in a mark
  });

  test("shows a placeholder when there is no screenshot", () => {
    const noShot = { ...grade, artifacts: { ...grade.artifacts, screenshotUrl: undefined } };
    render(<DiffTheater grade={noShot} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/no screenshot/i)).toBeInTheDocument();
  });
});
