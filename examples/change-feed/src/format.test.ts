import { describe, test, expect } from "vitest";
import { formatFeed } from "./format";
import type { FeedItem } from "./watch";

const items: FeedItem[] = [
  { url: "https://shop.de/pricing", status: "changed", previousScrapeAt: "2026-05-30T10:00:00Z",
    summary: { summary: "Price rose $20 → $29" }, diff: "- $20\n+ $29" },
  { url: "https://docs.x.com", status: "same", previousScrapeAt: "2026-05-30T09:00:00Z", summary: null, diff: null },
  { url: "https://new.x.com", status: "new", previousScrapeAt: null, summary: null, diff: null },
  { url: "https://bad.x.com", status: "error", previousScrapeAt: null, summary: null, diff: null, error: "boom" },
];

describe("formatFeed", () => {
  test("renders changed items with their summary", () => {
    const out = formatFeed(items);
    expect(out).toContain("https://shop.de/pricing");
    expect(out).toContain("Price rose $20 → $29");
  });
  test("marks unchanged + new + error items distinctly", () => {
    const out = formatFeed(items).toLowerCase();
    expect(out).toMatch(/same|no change|unchanged/);
    expect(out).toContain("new");
    expect(out).toContain("boom");
  });
  test("includes a diff snippet when asked", () => {
    expect(formatFeed(items, { showDiff: true })).toContain("$29");
  });
  test("can hide the diff", () => {
    expect(formatFeed(items, { showDiff: false })).not.toContain("- $20");
  });
});
