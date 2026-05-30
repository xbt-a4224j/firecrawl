import { describe, test, expect } from "vitest";
import { generateScrapeSnippets } from "./codegen";

describe("generateScrapeSnippets", () => {
  test("Node snippet reflects the url and config", () => {
    const { node } = generateScrapeSnippets("https://shop.de", {
      onlyMainContent: true,
      formats: ["markdown", "html"],
    });
    expect(node).toContain('"https://shop.de"');
    expect(node).toContain("scrape");
    expect(node).toContain("onlyMainContent: true");
    expect(node).toContain('"markdown"');
  });

  test("Python snippet uses snake_case options", () => {
    const { python } = generateScrapeSnippets("https://shop.de", { onlyMainContent: false });
    expect(python).toContain("scrape");
    expect(python).toContain("only_main_content=False");
  });

  test("cURL snippet posts JSON to /v2/scrape", () => {
    const { curl } = generateScrapeSnippets("https://shop.de", { onlyMainContent: true });
    expect(curl).toContain("/v2/scrape");
    const body = JSON.parse(curl.slice(curl.indexOf("{"), curl.lastIndexOf("}") + 1));
    expect(body).toMatchObject({ url: "https://shop.de", onlyMainContent: true });
  });

  test("local target points snippets at the dogfood stack", () => {
    const { curl } = generateScrapeSnippets("https://shop.de", { target: "local" });
    expect(curl).toContain("http://localhost:3002/v2/scrape");
  });

  test("cloud target points at the public API", () => {
    const { curl } = generateScrapeSnippets("https://shop.de", { target: "cloud" });
    expect(curl).toContain("https://api.firecrawl.dev/v2/scrape");
  });
});
