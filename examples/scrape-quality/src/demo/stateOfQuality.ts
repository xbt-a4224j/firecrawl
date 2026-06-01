/**
 * FG-013 — renders the "State of Scrape Quality" narrative from a corpus of grades.
 */
import type { QualityReport } from "../scoring/grade";
import { leaderboard } from "../leaderboard";

export function renderStateOfQuality(grades: QualityReport[]): string {
  const lb = leaderboard(grades);
  const out: string[] = [];

  out.push("# State of Scrape Quality");
  out.push("");
  out.push(`_Graded ${lb.count} pages · average ${lb.avgScore}/100._`);
  out.push("");
  out.push(
    "Firecrawl's success gate is a liveness check — `isLongEnough` just means the markdown is non-empty —",
  );
  out.push(
    "so every degradation below ships as a `200 success`. This makes that quality measurable.",
  );
  out.push("");

  out.push("## Worst pages");
  out.push("");
  out.push("| score | rating | category | url | top finding |");
  out.push("|---|---|---|---|---|");
  for (const g of lb.worst) {
    const top = g.findings[0]?.code ?? "—";
    out.push(`| ${g.score} | ${g.rating} | ${g.meta.category ?? "—"} | ${g.url} | ${top} |`);
  }
  out.push("");

  out.push("## Failure modes");
  out.push("");
  if (lb.failureModes.length === 0) {
    out.push("_none_");
  } else {
    for (const m of lb.failureModes) out.push(`- ${m.code} ×${m.count}`);
  }
  out.push("");

  out.push("## By category");
  out.push("");
  for (const c of lb.byCategory) {
    out.push(`- **${c.category}** — avg ${c.avgScore}, worst ${c.worstScore} (${c.count} pages)`);
  }
  out.push("");

  return out.join("\n");
}
