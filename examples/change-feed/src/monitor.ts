/**
 * change-feed on /v2/monitor — the productized change endpoint.
 *
 * v1 of this example drove `changeTracking` by hand (see watch.ts): a client poll loop, a
 * concurrency pool, and per-URL baseline management. `/monitor` (shipped 2026-05) is the
 * *productized* version of exactly that — it schedules checks, stores the diff artifacts, and runs
 * the "did this meaningfully change?" judge SERVER-SIDE. So change-feed becomes a thin client:
 * create a monitor once, trigger an on-demand check (`/run`), read the per-URL results — and we
 * delete the hand-rolled loop, pool, and baseline bookkeeping.
 *
 * The HTTP client is injected (MonitorClient) so the mapping logic stays testable offline; the real
 * one (`httpMonitorClient`) is a small fetch wrapper over the cloud API. Response field access is
 * defensive (`a ?? b ?? c`) because the endpoint is new and still settling.
 *
 * Maps to apps/api/src/controllers/v2/monitor.ts:
 *   POST   /v2/monitor                       create        → { monitor: { id } }
 *   POST   /v2/monitor/:id/run               on-demand check (1 credit)
 *   GET    /v2/monitor/:id/checks?limit=1    latest check  → { checks: [{ id, status, summary }] }
 *   GET    /v2/monitor/:id/checks/:checkId   per-URL pages → { data: { pages: [...], next } }
 */
import type { FeedItem } from "./watch";
import { DEFAULT_PROMPT } from "./watch";

/** The server-side judge goal — same signal-vs-noise policy the v1 prompt encoded. */
export const DEFAULT_GOAL = DEFAULT_PROMPT;

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

/** A /monitor check page → the same FeedItem the changeTracking path produced. */
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
      const out: MonitorPage[] = [];
      let url: string | null =
        `${baseUrl}/v2/monitor/${monitorId}/checks/${checkId}?limit=100`;
      let guard = 0;
      while (url && guard++ < 50) {
        const d = await json(await fetch(url, { headers }));
        const pages = d.data?.pages ?? d.pages ?? [];
        for (const p of pages) {
          out.push({
            url: p.url,
            status: p.status,
            judgment: p.judgment,
            diff: p.diff,
            previousScrapeId: p.previousScrapeId,
            error: p.error,
          });
        }
        url = d.next ?? d.data?.next ?? null;
      }
      return out;
    },
  };
}
