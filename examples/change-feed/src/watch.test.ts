import { describe, test, expect, vi } from "vitest";
import { watchUrls, DEFAULT_PROMPT } from "./watch";
import type { ChangeDoc } from "./watch";

const changed: ChangeDoc = {
  changeTracking: {
    changeStatus: "changed",
    previousScrapeAt: "2026-05-30T10:00:00Z",
    json: { summary: "Price rose $20 → $29", impactful: true },
    diff: { text: "- $20\n+ $29" },
  },
};
const fresh: ChangeDoc = { changeTracking: { changeStatus: "new", previousScrapeAt: null } };
const unchanged: ChangeDoc = { changeTracking: { changeStatus: "same", previousScrapeAt: "2026-05-30T10:00:00Z" } };

describe("watchUrls", () => {
  test("maps a changed page into a feed item with summary + diff", async () => {
    const scrape = vi.fn(async () => changed);
    const [item] = await watchUrls(["https://shop.de/pricing"], { scrape });
    expect(item).toMatchObject({
      url: "https://shop.de/pricing",
      status: "changed",
      previousScrapeAt: "2026-05-30T10:00:00Z",
    });
    expect(item!.summary).toEqual({ summary: "Price rose $20 → $29", impactful: true });
    expect(item!.diff).toContain("$29");
  });

  test("first-ever scrape is 'new' (no previous baseline)", async () => {
    const [item] = await watchUrls(["https://x.com"], { scrape: async () => fresh });
    expect(item!.status).toBe("new");
    expect(item!.previousScrapeAt).toBeNull();
  });

  test("unchanged page is 'same'", async () => {
    const [item] = await watchUrls(["https://x.com"], { scrape: async () => unchanged });
    expect(item!.status).toBe("same");
  });

  test("requests the changeTracking format (with the prompt)", async () => {
    let opts: any;
    const scrape = vi.fn(async (_u: string, o: Record<string, unknown>) => {
      opts = o;
      return fresh;
    });
    await watchUrls(["https://x.com"], { scrape });
    const ct = (opts.formats as any[]).find((f) => typeof f === "object" && f.type === "changeTracking");
    expect(ct).toBeDefined();
    expect(ct.prompt).toBe(DEFAULT_PROMPT);
    expect(opts.formats).toContain("markdown"); // changeTracking compares markdown
  });

  test("isolates a failing URL without sinking the batch", async () => {
    let n = 0;
    const scrape = async () => {
      if (n++ === 1) throw new Error("scrape failed");
      return changed;
    };
    const items = await watchUrls(["a", "b", "c"], { scrape, concurrency: 1 });
    expect(items).toHaveLength(3);
    expect(items[1]!.status).toBe("error");
    expect(items[0]!.status).toBe("changed");
  });

  test("preserves input order", async () => {
    const scrape = async () => fresh;
    const items = await watchUrls(["a", "b", "c"], { scrape });
    expect(items.map((i) => i.url)).toEqual(["a", "b", "c"]);
  });
});
