/**
 * change-feed core — turn URLs into feed items using Firecrawl's changeTracking.
 *
 * Firecrawl stores the previous scrape of each (team, url, tag) server-side, so each call diffs
 * against the last one and becomes the new baseline. We ask its json mode for a concise
 * { summary, significant } so the feed reads like English and filters trivial churn. The scrape fn
 * is injected so this is testable offline; in production it's `firecrawl.scrape`.
 */
export interface ChangeTrackingResult {
  changeStatus: "new" | "changed" | "same" | "removed";
  previousScrapeAt?: string | null;
  json?: unknown; // LLM "what changed" (we request { summary, significant })
  diff?: { text?: string };
}
export interface ChangeDoc {
  markdown?: string;
  changeTracking?: ChangeTrackingResult;
}

export type ScrapeFn = (url: string, options: Record<string, unknown>) => Promise<ChangeDoc>;

export interface FeedItem {
  url: string;
  status: "new" | "changed" | "same" | "removed" | "error";
  significant: boolean; // is this a meaningful content change (not vote/timestamp/reorder churn)?
  summary: string | null; // one-line, plain-English "what changed"
  previousScrapeAt: string | null;
  diff: string | null;
  error?: string;
}

export interface WatchOptions {
  scrape: ScrapeFn;
  prompt?: string;
  concurrency?: number;
}

export const DEFAULT_PROMPT =
  "You decide whether a webpage changed in a way a human watcher would care about. Compare the " +
  "previous and current version. Respond with a JSON object: " +
  '{ "summary": one plain-English sentence on what changed (or "no meaningful change"), ' +
  '"significant": a boolean }. ' +
  "Set significant=FALSE when the ONLY differences are churn — vote/point/comment counts, view or " +
  'like counters, timestamps or relative times ("1 hour ago"), reordering, rotating ads, or ' +
  "session/tracking tokens — even though those are technically text edits. " +
  "Set significant=TRUE when the substantive meaning changed. In particular, ANY change to a price, " +
  "dollar or currency amount, plan/tier cost, or stock/crypto quote is ALWAYS significant, no matter " +
  "how small — report the old and new value. Likewise an added/removed/reworded headline, title, " +
  "product, or list item, a policy/terms wording change, or an availability/stock/status change.";

/** Pull a clean { summary, significant } out of whatever shape the LLM returned. */
function normalize(json: unknown): { summary: string | null; significant: boolean } {
  const j = json as Record<string, unknown> | undefined;
  const summary =
    typeof j?.summary === "string"
      ? (j.summary as string)
      : typeof j?.overallImportance === "string"
        ? (j.overallImportance as string)
        : j
          ? JSON.stringify(j)
          : null;
  const significant = typeof j?.significant === "boolean" ? (j.significant as boolean) : !!j;
  return { summary, significant };
}

export async function watchUrls(urls: string[], options: WatchOptions): Promise<FeedItem[]> {
  const prompt = options.prompt ?? DEFAULT_PROMPT;
  const scrapeOptions: Record<string, unknown> = {
    formats: ["markdown", { type: "changeTracking", modes: ["git-diff", "json"], prompt }],
  };

  return mapPool(urls, options.concurrency ?? 4, async (url) => {
    try {
      const doc = await options.scrape(url, scrapeOptions);
      const ct = doc.changeTracking;
      const status = ct?.changeStatus ?? "new";
      const { summary, significant } = normalize(ct?.json);
      return {
        url,
        status,
        significant: status === "changed" ? significant : false,
        summary: status === "changed" ? summary : null,
        previousScrapeAt: ct?.previousScrapeAt ?? null,
        diff: ct?.diff?.text ?? null,
      };
    } catch (e) {
      return {
        url,
        status: "error" as const,
        significant: false,
        summary: null,
        previousScrapeAt: null,
        diff: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker()));
  return results;
}
