import { describe, test, expect } from "vitest";
import { summarizeRun, formatRunLine } from "./stats";
import type { FeedItem } from "./monitor";

const b = { previousScrapeAt: null, diff: null as string | null };
const items: FeedItem[] = [
  { ...b, url: "a", status: "changed", significant: true, summary: "price up" },
  { ...b, url: "b", status: "changed", significant: false, summary: "votes" },
  { ...b, url: "c", status: "same", significant: false, summary: null },
  { ...b, url: "d", status: "new", significant: false, summary: null },
  { ...b, url: "e", status: "error", significant: false, summary: null, error: "x" },
];

describe("summarizeRun", () => {
  test("counts watched / changed / significant / scrapes / llmCalls", () => {
    const s = summarizeRun(items);
    expect(s).toMatchObject({ watched: 5, new: 1, changed: 2, significant: 1, scrapes: 5, llmCalls: 2 });
  });
});

describe("formatRunLine", () => {
  test("summarizes the run", () => {
    const line = formatRunLine(summarizeRun(items));
    expect(line).toContain("5 watched");
    expect(line).toContain("1 significant");
  });
  test("adds credit usage when provided", () => {
    const line = formatRunLine(summarizeRun(items), { used: 5, remaining: 1995 });
    expect(line).toContain("5 credits");
    expect(line).toContain("1995");
  });
});
