/** Run accounting — what a check covered and (optionally) what it cost. */
import type { FeedItem } from "./monitor";

export interface RunStats {
  watched: number;
  new: number;
  changed: number;
  significant: number;
  scrapes: number; // 1 per URL
  llmCalls: number; // the change-summary LLM fires only on a changed page
}

export function summarizeRun(items: FeedItem[]): RunStats {
  const changed = items.filter((i) => i.status === "changed");
  return {
    watched: items.length,
    new: items.filter((i) => i.status === "new").length,
    changed: changed.length,
    significant: items.filter((i) => i.significant).length,
    scrapes: items.length,
    llmCalls: changed.length,
  };
}

/** A one-line run summary, optionally with credit usage (respect the dev's quota). */
export function formatRunLine(stats: RunStats, credits?: { used: number; remaining: number }): string {
  const parts = [
    `${stats.changed} changed (${stats.significant} significant)`,
    `${stats.watched} watched`,
    `${stats.scrapes} scrapes`,
    `${stats.llmCalls} change-summaries`,
  ];
  if (credits) parts.push(`${credits.used} credits used · ${credits.remaining} remaining`);
  return `— ${parts.join(" · ")} —`;
}
