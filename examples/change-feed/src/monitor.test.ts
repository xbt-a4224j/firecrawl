import { describe, test, expect } from "vitest";
import {
  normalizeJudgment,
  pageToFeedItem,
  runMonitorCheck,
  createFeedMonitor,
  httpMonitorClient,
  type MonitorClient,
} from "./monitor";

// --- pure mapping logic: plain input → output, no mocks ---
describe("mapping", () => {
  test("normalizeJudgment reads { summary, significant } and is null-safe", () => {
    expect(normalizeJudgment({ summary: "Price rose", significant: true })).toEqual({ summary: "Price rose", significant: true });
    expect(normalizeJudgment(null)).toEqual({ summary: null, significant: false });
  });

  test("pageToFeedItem: a changed page carries summary + significance; same/error don't", () => {
    expect(
      pageToFeedItem({ url: "a", status: "changed", judgment: { summary: "headline changed", significant: true }, diff: { text: "-x\n+y" } }),
    ).toMatchObject({ status: "changed", significant: true, summary: "headline changed", diff: "-x\n+y" });
    expect(pageToFeedItem({ url: "a", status: "same" })).toMatchObject({ significant: false, summary: null });
    expect(pageToFeedItem({ url: "a", status: "error", error: "boom" }).error).toBe("boom");
  });
});

// --- the trigger→poll→map flow, against a tiny inline fake of the API ---
test("runMonitorCheck triggers a check, polls until complete, maps the pages", async () => {
  let polls = 0;
  const client: MonitorClient = {
    createMonitor: async () => ({ id: "m" }),
    runCheck: async () => {},
    latestCheck: async () => (polls++ === 0 ? { id: "c", status: "running" } : { id: "c", status: "completed" }),
    checkPages: async () => [{ url: "https://a", status: "changed", judgment: { significant: true, summary: "x" } }],
  };
  const items = await runMonitorCheck("m", { client, sleep: async () => {} });
  expect(items).toEqual([expect.objectContaining({ url: "https://a", status: "changed", significant: true })]);
});

// --- real cloud round-trip: create → run → read → delete. Runs only with a cloud key set. ---
describe.skipIf(!process.env.FIRECRAWL_API_KEY)("integration (cloud)", () => {
  test("creates a monitor, runs a check, reads NEW baselines", async () => {
    const key = process.env.FIRECRAWL_API_KEY!;
    const client = httpMonitorClient(key);
    const id = await createFeedMonitor(client, { name: "change-feed test", urls: ["https://example.com"] });
    try {
      const items = await runMonitorCheck(id, { client });
      expect(items.length).toBe(1);
      expect(items[0]!.url).toContain("example.com");
      expect(items[0]!.status).toBe("new"); // first check on a fresh monitor sets the baseline
    } finally {
      await fetch(`https://api.firecrawl.dev/v2/monitor/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${key}` } });
    }
  }, 120_000);
});
