import { describe, test, expect, vi } from "vitest";
import { watchUrls, DEFAULT_PROMPT } from "./watch";
import type { ChangeDoc } from "./watch";

const changed: ChangeDoc = {
  changeTracking: {
    changeStatus: "changed",
    previousScrapeAt: "2026-05-30T10:00:00Z",
    json: { summary: "Price rose $20 → $29", significant: true },
    diff: { text: "- $20\n+ $29" },
  },
};
const trivial: ChangeDoc = {
  changeTracking: {
    changeStatus: "changed",
    previousScrapeAt: "2026-05-30T10:00:00Z",
    json: { summary: "vote counts ticked up", significant: false },
  },
};
const fresh: ChangeDoc = { changeTracking: { changeStatus: "new", previousScrapeAt: null } };
const unchanged: ChangeDoc = { changeTracking: { changeStatus: "same", previousScrapeAt: "2026-05-30T10:00:00Z" } };

describe("watchUrls", () => {
  test("maps a meaningful change to { summary, significant:true } + diff", async () => {
    const [item] = await watchUrls(["https://shop.de/pricing"], { scrape: async () => changed });
    expect(item).toMatchObject({ url: "https://shop.de/pricing", status: "changed", significant: true });
    expect(item!.summary).toBe("Price rose $20 → $29");
    expect(item!.diff).toContain("$29");
  });

  test("a trivial change is still 'changed' but significant:false", async () => {
    const [item] = await watchUrls(["https://news.x"], { scrape: async () => trivial });
    expect(item!.status).toBe("changed");
    expect(item!.significant).toBe(false);
  });

  test("first-ever scrape is 'new'", async () => {
    const [item] = await watchUrls(["https://x.com"], { scrape: async () => fresh });
    expect(item!.status).toBe("new");
    expect(item!.previousScrapeAt).toBeNull();
  });

  test("unchanged page is 'same' (no summary)", async () => {
    const [item] = await watchUrls(["https://x.com"], { scrape: async () => unchanged });
    expect(item!.status).toBe("same");
    expect(item!.summary).toBeNull();
  });

  test("normalizes an unexpected LLM shape without crashing", async () => {
    const weird: ChangeDoc = { changeTracking: { changeStatus: "changed", json: { overallImportance: "big news" } } };
    const [item] = await watchUrls(["https://x.com"], { scrape: async () => weird });
    expect(item!.summary).toBe("big news");
  });

  test("requests the changeTracking format with the prompt + markdown", async () => {
    let opts: any;
    await watchUrls(["https://x.com"], { scrape: async (_u, o) => { opts = o; return fresh; } });
    const ct = (opts.formats as any[]).find((f) => typeof f === "object" && f.type === "changeTracking");
    expect(ct?.prompt).toBe(DEFAULT_PROMPT);
    expect(opts.formats).toContain("markdown");
  });

  test("isolates a failing URL", async () => {
    let n = 0;
    const scrape = async () => { if (n++ === 1) throw new Error("boom"); return changed; };
    const items = await watchUrls(["a", "b", "c"], { scrape, concurrency: 1 });
    expect(items.map((i) => i.status)).toEqual(["changed", "error", "changed"]);
  });
});
