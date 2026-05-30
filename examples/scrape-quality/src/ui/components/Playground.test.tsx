// @vitest-environment jsdom
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Playground } from "./Playground";

// a fake scrape document with glued inline elements (#3583 shape)
const fakeDoc = {
  markdown: "FunktionalFunktional\n\nWelcome to the shop.",
  html: "<button>Funktional</button><button>Funktional</button><p>Welcome to the shop.</p>",
  metadata: { statusCode: 200 },
};

describe("Playground", () => {
  test("generates a Node snippet reflecting the typed URL", async () => {
    render(<Playground />);
    await userEvent.type(screen.getByRole("textbox"), "https://shop.de");
    const snippet = screen.getByTestId("snippet");
    expect(snippet).toHaveTextContent("https://shop.de");
    expect(snippet).toHaveTextContent("onlyMainContent: true");
  });

  test("switching to the cURL tab shows the REST call", async () => {
    render(<Playground />);
    await userEvent.type(screen.getByRole("textbox"), "https://shop.de");
    await userEvent.click(screen.getByRole("button", { name: /curl/i }));
    expect(screen.getByTestId("snippet")).toHaveTextContent("/v2/scrape");
  });

  test("toggling onlyMainContent updates the snippet", async () => {
    render(<Playground />);
    await userEvent.type(screen.getByRole("textbox"), "https://shop.de");
    await userEvent.click(screen.getByRole("checkbox", { name: /onlyMainContent/i }));
    expect(screen.getByTestId("snippet")).toHaveTextContent("onlyMainContent: false");
  });

  test("scraping with the config then grading the doc renders the report", async () => {
    const scrapeFn = vi.fn(async () => fakeDoc);
    render(<Playground scrapeFn={scrapeFn} />);
    await userEvent.type(screen.getByRole("textbox"), "https://shop.de");
    await userEvent.click(screen.getByRole("button", { name: /^grade$/i }));

    expect(scrapeFn).toHaveBeenCalledWith(
      "https://shop.de",
      expect.objectContaining({ config: expect.objectContaining({ onlyMainContent: true }) }),
    );
    // the doc gets graded → the inline-glue receipt shows in the report
    expect(await screen.findByText("INLINE_GLUE")).toBeInTheDocument();
  });
});
