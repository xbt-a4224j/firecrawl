/**
 * change-feed core — on Firecrawl's /v2/monitor, the productized change endpoint.
 *
 * /monitor schedules checks, stores the diff artifacts, and runs the "did this meaningfully change?"
 * judge SERVER-SIDE. So this example is a thin client: create a monitor once, trigger an on-demand
 * check (/run), read the per-URL results. No client-side poll pool, no baseline bookkeeping, no
 * per-URL scrape loop — the server owns all of it. (It's built on the synchronous `changeTracking`
 * scrape format; /monitor is that primitive productized with scheduling + a server judge.)
 *
 * The HTTP client is injected (MonitorClient) so the mapping/poll logic is unit-tested offline; the
 * real one (`httpMonitorClient`) is a small fetch wrapper. Field access is defensive (`a ?? b`)
 * because the endpoint is new and not yet in the JS SDK — once it is, the transport here disappears.
 *
 * Maps to apps/api/src/controllers/v2/monitor.ts:
 *   POST   /v2/monitor                       create        → { monitor: { id } }
 *   POST   /v2/monitor/:id/run               on-demand check (1 credit)
 *   GET    /v2/monitor/:id/checks?limit=1    latest check  → { checks: [{ id, status }] }
 *   GET    /v2/monitor/:id/checks/:checkId   per-URL pages → { data: { pages: [...] } }
 */

export interface FeedItem {
  url: string;
  status: "new" | "changed" | "same" | "removed" | "error";
  significant: boolean; // a meaningful content change (not vote/timestamp/reorder churn)?
  summary: string | null; // one-line, plain-English "what changed"
  previousScrapeAt: string | null; // baseline timestamp (null on the /monitor path)
  previousScrapeId?: string | null; // server baseline anchor (id) — the /monitor verifiable anchor
  diff: string | null;
  error?: string;
}

/** The server-side judge goal — the signal-vs-noise policy (sent as the monitor's `goal`). */
export const DEFAULT_GOAL =
  "Decide whether a webpage changed in a way a human watcher would care about. " +
  "Treat as NOT significant when the only differences are churn — vote/point/comment counts, view " +
  'or like counters, timestamps or relative times ("1 hour ago"), reordering, rotating ads, or ' +
  "session/tracking tokens. Treat as significant when the substantive meaning changed. In " +
  "particular, ANY change to a price, currency amount, plan/tier cost, or stock/crypto quote is " +
  "ALWAYS significant, no matter how small — report the old and new value. Likewise an " +
  "added/removed/reworded headline, product, or list item, a policy/terms wording change, or an " +
  "availability/stock/status change.";

// --- the slice of the /v2/monitor response surface we depend on ---
export type PageStatus = "same" | "new" | "changed" | "removed" | "error";
export interface MonitorPage {
  url: string;
  status: PageStatus;
  judgment?: unknown; // server-side judge verdict; normalized defensively
  diff?: { text?: string; json?: unknown } | null;
  previousScrapeId?: string | null;
  error?: string | null;
}
export type CheckStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "partial"
  | "skipped_overlap";
export interface MonitorCheck {
  id: string;
  status: CheckStatus;
}

export interface CreateInput {
  name: string;
  urls: string[];
  goal?: string;
  judgeEnabled?: boolean;
  /** A nominal cron is required by the API even though we trigger on demand. Defaults to daily. */
  cron?: string;
}

/** The injectable seam: everything we need from /monitor, and nothing more. */
export interface MonitorClient {
  createMonitor(input: CreateInput): Promise<{ id: string }>;
  runCheck(monitorId: string): Promise<void>;
  latestCheck(monitorId: string): Promise<MonitorCheck | null>;
  checkPages(monitorId: string, checkId: string): Promise<MonitorPage[]>;
}

/** Pull a clean { summary, significant } out of whatever shape the server judge returned. */
export function normalizeJudgment(judgment: unknown): {
  summary: string | null;
  significant: boolean;
} {
  const j = judgment as Record<string, unknown> | undefined;
  const summary =
    typeof j?.summary === "string"
      ? (j.summary as string)
      : typeof j?.overallImportance === "string"
        ? (j.overallImportance as string)
        : j
          ? JSON.stringify(j)
          : null;
  const significant =
    typeof j?.significant === "boolean"
      ? (j.significant as boolean)
      : typeof j?.isSignificant === "boolean"
        ? (j.isSignificant as boolean)
        : !!j;
  return { summary, significant };
}

/** A /monitor check page → a feed item. */
export function pageToFeedItem(p: MonitorPage): FeedItem {
  const status = p.status;
  const { summary, significant } = normalizeJudgment(p.judgment);
  return {
    url: p.url,
    status,
    significant: status === "changed" ? significant : false,
    summary: status === "changed" ? summary : null,
    previousScrapeAt: null, // /monitor anchors the baseline by id, not a per-page timestamp
    previousScrapeId: p.previousScrapeId ?? null,
    diff: p.diff?.text ?? null,
    ...(status === "error" && p.error ? { error: p.error } : {}),
  };
}

export interface RunOptions {
  client: MonitorClient;
  pollIntervalMs?: number;
  maxPolls?: number;
  sleep?: (ms: number) => Promise<void>; // injected for tests
}

/** Trigger one on-demand check and resolve the per-URL feed once it completes. */
export async function runMonitorCheck(
  monitorId: string,
  opts: RunOptions,
): Promise<FeedItem[]> {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const maxPolls = opts.maxPolls ?? 60;
  await opts.client.runCheck(monitorId);
  for (let i = 0; i < maxPolls; i++) {
    const check = await opts.client.latestCheck(monitorId);
    if (check && (check.status === "completed" || check.status === "partial")) {
      const pages = await opts.client.checkPages(monitorId, check.id);
      return pages.map(pageToFeedItem);
    }
    if (check && check.status === "failed") {
      throw new Error(`monitor check ${check.id} failed`);
    }
    await sleep(opts.pollIntervalMs ?? 2000);
  }
  throw new Error("monitor check did not complete in time");
}

/** Create the monitor that backs the feed. Call once; reuse the id across refreshes. */
export async function createFeedMonitor(
  client: MonitorClient,
  input: CreateInput,
): Promise<string> {
  const { id } = await client.createMonitor(input);
  return id;
}

/** Real client: a small fetch wrapper over the cloud API. */
export function httpMonitorClient(
  apiKey: string,
  baseUrl = "https://api.firecrawl.dev",
): MonitorClient {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const json = async (r: Response): Promise<any> => {
    if (!r.ok) throw new Error(`monitor API ${r.status}: ${await r.text()}`);
    return r.json();
  };
  return {
    async createMonitor(input) {
      const body = {
        name: input.name,
        schedule: { cron: input.cron ?? "0 0 * * *", timezone: "UTC" },
        notification: { email: { enabled: false } }, // required object; no email needed
        targets: [{ type: "scrape", urls: input.urls }],
        goal: input.goal ?? DEFAULT_GOAL,
        judgeEnabled: input.judgeEnabled ?? true,
      };
      const d = await json(
        await fetch(`${baseUrl}/v2/monitor`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      );
      const id = d.monitor?.id ?? d.data?.id ?? d.id;
      if (!id) throw new Error("create monitor: no id in response");
      return { id };
    },
    async runCheck(monitorId) {
      await json(
        await fetch(`${baseUrl}/v2/monitor/${monitorId}/run`, {
          method: "POST",
          headers,
        }),
      );
    },
    async latestCheck(monitorId) {
      const d = await json(
        await fetch(`${baseUrl}/v2/monitor/${monitorId}/checks?limit=1`, {
          headers,
        }),
      );
      const c = (d.checks ?? d.data ?? [])[0];
      return c ? { id: c.id, status: c.status } : null;
    },
    async checkPages(monitorId, checkId) {
      // Monitors cap at 50 targets, so one page of 100 always covers a check — no pagination needed.
      const d = await json(
        await fetch(
          `${baseUrl}/v2/monitor/${monitorId}/checks/${checkId}?limit=100`,
          { headers },
        ),
      );
      const pages = d.data?.pages ?? d.pages ?? [];
      return pages.map((p: any) => ({
        url: p.url,
        status: p.status,
        judgment: p.judgment,
        diff: p.diff,
        previousScrapeId: p.previousScrapeId,
        error: p.error,
      }));
    },
  };
}
