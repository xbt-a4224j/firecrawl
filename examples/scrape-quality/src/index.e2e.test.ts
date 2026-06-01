/**
 * End-to-end: the seamless pattern — scrape a page (mocked fetch), then grade the document.
 * Mirrors `grade(await firecrawl.scrape(url, ...))`.
 */
import { describe, test, expect } from "vitest";
import { scrapeUrl, grade } from "./index";

// a cookie-banner page with glued inline elements (the #3583 shape)
const fetchImpl = (async () => ({
  json: async () => ({
    success: true,
    data: {
      markdown: "FunktionalFunktional\n\nAccept All cookies. Manage Preferences.\n\nWelcome.",
      html:
        "<button>Funktional</button><button>Funktional</button>" +
        "<div>Accept All cookies. Manage Preferences.</div><p>Welcome.</p>",
      screenshot: "https://shot/1.png",
      metadata: { statusCode: 200, sourceURL: "https://shop.de" },
    },
  }),
})) as unknown as typeof fetch;

describe("scrape → grade (e2e)", () => {
  test("grades a scraped document and catches the inline-glue receipt", async () => {
    const doc = await scrapeUrl("https://shop.de", { fetchImpl });
    const report = grade(doc);

    expect(report.url).toBe("https://shop.de");
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
    expect(report.rating).not.toBe("A");
    expect(report.findings.map((f) => f.code)).toContain("INLINE_GLUE");
    expect(report.artifacts.screenshotUrl).toBe("https://shot/1.png");
    expect(report.meta.statusCode).toBe(200);
  });

  test("the report is serializable", async () => {
    const report = grade(await scrapeUrl("https://shop.de", { fetchImpl }));
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  test("grade works on a hand-built document (no scrape needed)", () => {
    const report = grade({ markdown: "# Hi\n\nclean content here", html: "<h1>Hi</h1><p>clean content here</p>" });
    expect(report.rating).toBe("A");
  });
});
