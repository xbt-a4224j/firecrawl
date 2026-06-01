/** Render a feed of change-items as a readable terminal report. */
import type { FeedItem } from "./watch";
import { errorHint } from "./errors";

/** ISO timestamp → compact, human "2026-05-30 14:32:07 UTC" (drops millis/T/Z noise). */
export function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]} UTC` : iso;
}

export function formatFeed(items: FeedItem[], opts: { showDiff?: boolean } = {}): string {
  const lines: string[] = [];
  for (const item of items) {
    const head =
      item.status === "error" ? `⚠️  ERROR  ${item.url}`
      : item.status === "new" ? `🆕  NEW  ${item.url}`
      : item.status === "same" ? `⚪  no change  ${item.url}`
      : item.status === "removed" ? `❌  REMOVED  ${item.url}`
      : item.significant ? `🔴  CHANGED  ${item.url}`
      : `🟡  minor change  ${item.url}`;
    lines.push(head);

    if (item.status === "error") {
      lines.push(`    ${item.error}`);
      const hint = errorHint(item.error ?? "");
      if (hint) lines.push(`    → ${hint}`);
    } else if (item.summary) {
      lines.push(`    ${item.summary}`);
    }
    // Verification line: the server's real baseline timestamp this diff was computed against.
    const baseline = fmtTime(item.previousScrapeAt);
    if (baseline && item.status !== "new") {
      lines.push(`    ↳ diffed against baseline from ${baseline}`);
    } else if (item.previousScrapeId && item.status !== "new") {
      lines.push(`    ↳ diffed against baseline scrape ${item.previousScrapeId}`);
    }
    if (opts.showDiff && item.diff) {
      lines.push(...item.diff.split("\n").slice(0, 8).map((l) => `    ${l}`));
    }
    lines.push("");
  }
  return lines.join("\n");
}
