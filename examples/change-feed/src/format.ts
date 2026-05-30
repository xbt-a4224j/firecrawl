/** Render a feed of change-items as a readable terminal report. */
import type { FeedItem } from "./watch";

export function formatFeed(items: FeedItem[], opts: { showDiff?: boolean } = {}): string {
  const lines: string[] = [];
  for (const item of items) {
    const head =
      item.status === "error"
        ? `⚠️  ERROR  ${item.url}`
        : item.status === "new"
          ? `🆕  NEW  ${item.url}`
          : item.status === "same"
            ? `⚪  no change  ${item.url}`
            : item.status === "removed"
              ? `❌  REMOVED  ${item.url}`
              : item.significant // changed
                ? `🔴  CHANGED  ${item.url}`
                : `🟡  minor change  ${item.url}`;
    lines.push(head);

    if (item.status === "error") {
      lines.push(`    ${item.error}`);
    } else if (item.summary) {
      lines.push(`    ${item.summary}`);
    }
    if (opts.showDiff && item.diff) {
      lines.push(...item.diff.split("\n").slice(0, 8).map((l) => `    ${l}`));
    }
    lines.push("");
  }
  return lines.join("\n");
}
