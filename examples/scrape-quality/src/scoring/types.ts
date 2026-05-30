/** Shared scoring types. */

export type Severity = "low" | "medium" | "high";

/** A specific quality problem found in scrape output, surfaced in the UI / leaderboard. */
export interface Finding {
  /** Stable machine code, e.g. "TABLE_FLATTENED", "INLINE_GLUE". */
  code: string;
  severity: Severity;
  /** Human-readable evidence (the offending token, the missing structure, etc.). */
  evidence: string;
  /** Optional character offset into the markdown (for inline highlighting in diff theater). */
  offset?: number;
}
