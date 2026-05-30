/**
 * FG-013 (leaderboard) — turn a corpus of grades into the "State of Scrape Quality" view:
 * worst pages first, per-category stats, and failure modes ranked by frequency. Pure function.
 */
import type { QualityReport } from "./scoring/grade";

export interface CategoryStat {
  category: string;
  count: number;
  avgScore: number;
  worstScore: number;
}

export interface FailureMode {
  code: string;
  count: number;
}

export interface Leaderboard {
  worst: QualityReport[];
  byCategory: CategoryStat[];
  failureModes: FailureMode[];
  count: number;
  avgScore: number;
}

function mean(nums: number[]): number {
  return nums.length === 0 ? 0 : Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function leaderboard(grades: QualityReport[]): Leaderboard {
  const worst = [...grades].sort((a, b) => a.score - b.score);

  const groups = new Map<string, QualityReport[]>();
  for (const grade of grades) {
    const category = grade.meta.category ?? "uncategorized";
    (groups.get(category) ?? groups.set(category, []).get(category)!).push(grade);
  }
  const byCategory: CategoryStat[] = [...groups.entries()]
    .map(([category, gs]) => ({
      category,
      count: gs.length,
      avgScore: mean(gs.map((g) => g.score)),
      worstScore: Math.min(...gs.map((g) => g.score)),
    }))
    .sort((a, b) => a.avgScore - b.avgScore || a.category.localeCompare(b.category));

  const codeCounts = new Map<string, number>();
  for (const grade of grades) {
    for (const f of grade.findings) {
      codeCounts.set(f.code, (codeCounts.get(f.code) ?? 0) + 1);
    }
  }
  const failureModes: FailureMode[] = [...codeCounts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    worst,
    byCategory,
    failureModes,
    count: grades.length,
    avgScore: mean(grades.map((g) => g.score)),
  };
}
