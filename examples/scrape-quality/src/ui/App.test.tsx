// @vitest-environment jsdom
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { App } from "./App";

describe("App", () => {
  test("renders the scrape-quality playground", () => {
    render(<App />);
    expect(screen.getByText(/quality/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument(); // the url input
    expect(screen.getByTestId("snippet")).toBeInTheDocument(); // live code
  });

  test("scrape → grade flow surfaces a finding end-to-end", async () => {
    const scrapeFn = vi.fn(async () => ({
      markdown: "FunktionalFunktional\n\nWelcome.",
      html: "<button>Funktional</button><button>Funktional</button><p>Welcome.</p>",
      metadata: { statusCode: 200 },
    }));
    render(<App scrapeFn={scrapeFn} />);
    await userEvent.type(screen.getByRole("textbox"), "https://shop.de");
    await userEvent.click(screen.getByRole("button", { name: /^grade$/i }));
    expect(await screen.findByText("INLINE_GLUE")).toBeInTheDocument();
  });
});
