/** Render a feed of change-items as a readable terminal report. */
import type { FeedItem } from "./watch";

const ICON: Record<FeedItem["status"], string> = {
  changed: "🔴", new: "🆕", same: "⚪", removed: "❌", error: "⚠️",
};
const LABEL: Record<FeedItem["status"], string> = {
  changed: "CHANGED", new: "NEW", same: "no change", removed: "REMOVED", error: "ERROR",
};

function summaryText(summary: unknown): string | null {
  if (summary == null) return null;
  if (typeof summary === "string") return summary;
  if (typeof summary === "object" && summary !== null && "summary" in summary) {
    const s = (summary as { summary?: unknown }).summary;
    if (typeof s === "string") return s;
  }
  return JSON.stringify(summary);
}

export function formatFeed(items: FeedItem[], opts: { showDiff?: boolean } = {}): string {
  const lines: string[] = [];
  for (const item of items) {
    lines.push(`${ICON[item.status]}  ${LABEL[item.status]}  ${item.url}`);
    if (item.status === "error") {
      lines.push(`    ${item.error}`);
    } else {
      const text = summaryText(item.summary);
      if (text) lines.push(`    ${text}`);
      if (opts.showDiff && item.diff) {
        lines.push(...item.diff.split("\n").slice(0, 8).map((l) => `    ${l}`));
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
