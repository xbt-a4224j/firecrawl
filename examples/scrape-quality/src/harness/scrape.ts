/**
 * scrapeUrl — a thin convenience that calls Firecrawl's REST scrape endpoint via fetch and returns
 * the Document. It exists only so the CLI / demo can fetch a page to grade; in your own app you'd
 * already have a scrape result (`firecrawl.scrape(...)`) and just call `grade(doc)` on it.
 */
export type ScrapeTarget = "local" | "cloud";

/** A Firecrawl scrape Document (the subset `grade` reads). */
export interface ScrapeDocument {
  markdown?: string;
  html?: string;
  screenshot?: string;
  json?: unknown;
  metadata?: { statusCode?: number; sourceURL?: string };
}

export interface ScrapeUrlOptions {
  target?: ScrapeTarget;
  apiKey?: string;
  apiUrl?: string;
  /** Extra scrape config (e.g. { onlyMainContent: false }). */
  config?: Record<string, unknown>;
  /** Injectable fetch (for tests). Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Resolve the Firecrawl API base URL for a target (dogfood stack vs public cloud). */
export function apiUrlForTarget(target: ScrapeTarget): string {
  return target === "local" ? "http://localhost:3002" : "https://api.firecrawl.dev";
}

export async function scrapeUrl(url: string, options: ScrapeUrlOptions = {}): Promise<ScrapeDocument> {
  const apiUrl = options.apiUrl ?? apiUrlForTarget(options.target ?? "cloud");
  const apiKey =
    options.apiKey ?? (typeof process !== "undefined" ? process.env.FIRECRAWL_API_KEY : undefined) ?? "";
  const doFetch = options.fetchImpl ?? fetch;

  const res = await doFetch(`${apiUrl}/v2/scrape`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ["markdown", "html", "screenshot"], ...options.config }),
  });
  const json = (await res.json()) as { data?: ScrapeDocument } & ScrapeDocument;
  return json.data ?? json;
}
