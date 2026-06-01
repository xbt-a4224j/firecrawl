import { describe, test, expect } from "vitest";
import {
  normalizeJudgment,
  pageToFeedItem,
  runMonitorCheck,
  createFeedMonitor,
  type MonitorClient,
  type MonitorPage,
  type MonitorCheck,
} from "./monitor";

const noSleep = async () => {};

/** A scripted fake of the /monitor API — no network, fully deterministic. */
function fakeClient(opts: {
  checks: MonitorCheck[]; // returned in order by successive latestCheck() calls
  pages?: MonitorPage[];
  onCreate?: (input: unknown) => void;
}): MonitorClient & { runs: number } {
  let i = 0;
  const c = {
    runs: 0,
    async createMonitor(input) {
      opts.onCreate?.(input);
      return { id: "mon-123" };
    },
    async runCheck() {
      c.runs++;
    },
    async latestCheck() {
      return opts.checks[Math.min(i++, opts.checks.length - 1)] ?? null;
    },
    async checkPages() {
      return opts.pages ?? [];
    },
  } as MonitorClient & { runs: number };
  return c;
}

describe("normalizeJudgment", () => {
  test("reads { summary, significant } straight through", () => {
    expect(normalizeJudgment({ summary: "Price rose", significant: true })).toEqual({
      summary: "Price rose",
      significant: true,
    });
  });
  test("falls back to overallImportance / isSignificant", () => {
    expect(normalizeJudgment({ overallImportance: "big", isSignificant: true })).toEqual({
      summary: "big",
      significant: true,
    });
  });
  test("never crashes on null", () => {
    expect(normalizeJudgment(null)).toEqual({ summary: null, significant: false });
  });
});

describe("pageToFeedItem", () => {
  test("a meaningful change → significant:true + summary + diff", () => {
    const item = pageToFeedItem({
      url: "https://shop.de/pricing",
      status: "changed",
      judgment: { summary: "Price rose $20 → $29", significant: true },
      diff: { text: "- $20\n+ $29" },
      previousScrapeId: "scrape-abc",
    });
    expect(item).toMatchObject({ url: "https://shop.de/pricing", status: "changed", significant: true });
    expect(item.summary).toBe("Price rose $20 → $29");
    expect(item.diff).toContain("$29");
    expect(item.previousScrapeId).toBe("scrape-abc");
  });

  test("a trivial change stays 'changed' but significant:false", () => {
    const item = pageToFeedItem({
      url: "https://news.x",
      status: "changed",
      judgment: { summary: "vote counts ticked up", significant: false },
    });
    expect(item.status).toBe("changed");
    expect(item.significant).toBe(false);
  });

  test("'same' carries no summary", () => {
    const item = pageToFeedItem({ url: "https://x.com", status: "same" });
    expect(item.summary).toBeNull();
    expect(item.significant).toBe(false);
  });

  test("'new' and 'removed' pass through", () => {
    expect(pageToFeedItem({ url: "a", status: "new" }).status).toBe("new");
    expect(pageToFeedItem({ url: "a", status: "removed" }).status).toBe("removed");
  });

  test("'error' surfaces the page error", () => {
    const item = pageToFeedItem({ url: "a", status: "error", error: "fetch failed" });
    expect(item.status).toBe("error");
    expect(item.error).toBe("fetch failed");
  });
});

describe("runMonitorCheck", () => {
  test("triggers a check, polls until completed, maps pages", async () => {
    const client = fakeClient({
      checks: [
        { id: "chk-1", status: "running" },
        { id: "chk-1", status: "completed" },
      ],
      pages: [
        { url: "https://a", status: "changed", judgment: { summary: "headline changed", significant: true } },
        { url: "https://b", status: "same" },
      ],
    });
    const items = await runMonitorCheck("mon-123", { client, sleep: noSleep });
    expect(client.runs).toBe(1);
    expect(items.map((i) => i.status)).toEqual(["changed", "same"]);
    expect(items[0]!.significant).toBe(true);
  });

  test("accepts a 'partial' check as terminal", async () => {
    const client = fakeClient({ checks: [{ id: "chk-9", status: "partial" }], pages: [] });
    await expect(runMonitorCheck("mon-123", { client, sleep: noSleep })).resolves.toEqual([]);
  });

  test("throws if the check fails", async () => {
    const client = fakeClient({ checks: [{ id: "chk-x", status: "failed" }] });
    await expect(runMonitorCheck("mon-123", { client, sleep: noSleep })).rejects.toThrow(/failed/);
  });

  test("throws if the check never completes within maxPolls", async () => {
    const client = fakeClient({ checks: [{ id: "chk-x", status: "running" }] });
    await expect(
      runMonitorCheck("mon-123", { client, sleep: noSleep, maxPolls: 3 }),
    ).rejects.toThrow(/did not complete/);
  });
});

describe("createFeedMonitor", () => {
  test("creates the monitor with judge enabled + scrape targets and returns the id", async () => {
    let captured: any;
    const client = fakeClient({ checks: [], onCreate: (input) => (captured = input) });
    const id = await createFeedMonitor(client, { name: "feed", urls: ["https://a", "https://b"] });
    expect(id).toBe("mon-123");
    expect(captured.urls).toEqual(["https://a", "https://b"]);
  });
});
