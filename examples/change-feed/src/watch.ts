/**
 * change-feed core — turn URLs into feed items using Firecrawl's changeTracking.
 *
 * Firecrawl stores the previous scrape of each (team, url, tag) server-side, so each call diffs
 * against the last one and becomes the new baseline. We just map that into a feed item. The scrape
 * fn is injected so this is testable offline; in production it's `firecrawl.scrape`.
 */

export interface ChangeTrackingResult {
  changeStatus: "new" | "changed" | "same" | "removed";
  previousScrapeAt?: string | null;
  json?: unknown; // LLM "what changed & why" (changeTracking json mode)
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
  previousScrapeAt: string | null;
  summary: unknown | null;
  diff: string | null;
  error?: string;
}

export interface WatchOptions {
  scrape: ScrapeFn;
  prompt?: string;
  concurrency?: number;
}

export const DEFAULT_PROMPT =
  "Summarize what meaningfully changed between the previous and current version of this page, " +
  "and why it matters to someone watching it. Ignore cosmetic, navigation, ad, or boilerplate churn.";

export async function watchUrls(urls: string[], options: WatchOptions): Promise<FeedItem[]> {
  const prompt = options.prompt ?? DEFAULT_PROMPT;
  const scrapeOptions: Record<string, unknown> = {
    formats: ["markdown", { type: "changeTracking", modes: ["git-diff", "json"], prompt }],
  };

  return mapPool(urls, options.concurrency ?? 4, async (url) => {
    try {
      const doc = await options.scrape(url, scrapeOptions);
      const ct = doc.changeTracking;
      return {
        url,
        status: ct?.changeStatus ?? "new",
        previousScrapeAt: ct?.previousScrapeAt ?? null,
        summary: ct?.json ?? null,
        diff: ct?.diff?.text ?? null,
      };
    } catch (e) {
      return {
        url,
        status: "error" as const,
        previousScrapeAt: null,
        summary: null,
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
