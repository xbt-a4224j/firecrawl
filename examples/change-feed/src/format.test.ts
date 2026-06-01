import { describe, test, expect } from "vitest";
import { formatFeed, fmtTime } from "./format";
import type { FeedItem } from "./monitor";

const base = { previousScrapeAt: null, diff: null as string | null };
const items: FeedItem[] = [
  { ...base, url: "https://shop.de/pricing", status: "changed", significant: true, summary: "Price rose $20 → $29", diff: "- $20\n+ $29" },
  { ...base, url: "https://news.x", status: "changed", significant: false, summary: "vote counts ticked up" },
  { ...base, url: "https://docs.x", status: "same", significant: false, summary: null },
  { ...base, url: "https://new.x", status: "new", significant: false, summary: null },
  { ...base, url: "https://bad.x", status: "error", significant: false, summary: null, error: "boom" },
];

describe("formatFeed", () => {
  test("flags a meaningful change in red with its summary", () => {
    const out = formatFeed(items);
    expect(out).toMatch(/🔴.*shop\.de\/pricing/);
    expect(out).toContain("Price rose $20 → $29");
  });
  test("demotes trivial changes to 'minor change'", () => {
    expect(formatFeed(items)).toMatch(/minor change.*news\.x/);
  });
  test("renders no-change / new / error states", () => {
    const out = formatFeed(items).toLowerCase();
    expect(out).toContain("no change");
    expect(out).toContain("new");
    expect(out).toContain("boom");
  });
  test("includes the diff only when asked", () => {
    expect(formatFeed(items, { showDiff: true })).toContain("$29");
    expect(formatFeed(items, { showDiff: false })).not.toContain("- $20");
  });
  test("surfaces the server baseline timestamp as a verification line (but not on NEW)", () => {
    const withTs: FeedItem[] = [
      { ...base, url: "https://shop.de/pricing", status: "changed", significant: true, summary: "Price rose", previousScrapeAt: "2026-05-30T14:32:07.512Z" },
      { ...base, url: "https://new.x", status: "new", significant: false, summary: null, previousScrapeAt: "2026-05-30T14:00:00.000Z" },
    ];
    const out = formatFeed(withTs);
    expect(out).toContain("diffed against baseline from 2026-05-30 14:32:07 UTC");
    // a brand-new page has no real baseline to verify against, so we don't claim one
    expect(out).not.toContain("baseline from 2026-05-30 14:00:00");
  });
});

describe("fmtTime", () => {
  test("compacts an ISO timestamp and passes through null/garbage", () => {
    expect(fmtTime("2026-05-30T14:32:07.512Z")).toBe("2026-05-30 14:32:07 UTC");
    expect(fmtTime(null)).toBe(null);
    expect(fmtTime("not-a-date")).toBe("not-a-date");
  });
});
