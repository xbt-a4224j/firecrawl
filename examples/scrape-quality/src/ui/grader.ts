/** Injection point for the UI: a function that scrapes a URL. The UI then calls grade(doc). */
import type { ScrapeDocument, ScrapeTarget } from "../harness/scrape";

export type ScrapeFn = (
  url: string,
  opts: { target: ScrapeTarget; config?: Record<string, unknown> },
) => Promise<ScrapeDocument>;

/** Default: lazily import scrapeUrl only when actually scraping (keeps tests hermetic). */
export const lazyScrapeUrl: ScrapeFn = async (url, opts) => {
  const { scrapeUrl } = await import("../index");
  return scrapeUrl(url, opts);
};
