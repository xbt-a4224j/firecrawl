/**
 * FG-002 — Structure-fidelity metric.
 *
 * The core insight: Firecrawl grades itself. Count structural elements in the returned HTML and
 * check how many survived into the markdown. Lost headings/tables/code/lists = lost fidelity =
 * degraded LLM context. Only kinds actually present in the HTML count toward the score, so an
 * all-prose page is never falsely penalized.
 */

export type StructureKind = "headings" | "tables" | "code" | "lists";

export interface KindFidelity {
  html: number;
  md: number;
  survival: number; // 0..1
}

export interface StructureFidelityResult {
  score: number; // 0..100
  perKind: Record<StructureKind, KindFidelity>;
}

// Tables and block code are the highest-stakes structures for LLM context, so they weigh more.
import { DEFAULT_CONFIG } from "./config";

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

function htmlCounts(html: string): Record<StructureKind, number> {
  return {
    headings: countMatches(html, /<h[1-6][\s>]/gi),
    tables: countMatches(html, /<table[\s>]/gi),
    code: countMatches(html, /<pre[\s>]/gi),
    lists: countMatches(html, /<(?:ul|ol)[\s>]/gi),
  };
}

function markdownCounts(md: string): Record<StructureKind, number> {
  return {
    headings: countMatches(md, /^#{1,6}\s/gm),
    // a markdown table is identified by its header-separator row, e.g. |---|:--:|
    tables: countMatches(md, /^\s*\|?[ :|-]*-[ :|-]*\|[ :|-]*$/gm),
    code: Math.floor(countMatches(md, /```/g) / 2),
    lists: countMatches(md, /^\s*(?:[-*+]|\d+\.)\s/gm),
  };
}

export function structureFidelity(
  html: string,
  md: string,
  kindWeights: Record<StructureKind, number> = DEFAULT_CONFIG.structureKindWeights,
): StructureFidelityResult {
  const hc = htmlCounts(html);
  const mc = markdownCounts(md);

  const kinds = Object.keys(kindWeights) as StructureKind[];
  const perKind = {} as Record<StructureKind, KindFidelity>;

  let weightedSum = 0;
  let weightTotal = 0;
  for (const kind of kinds) {
    const present = hc[kind] > 0;
    const survival = present ? Math.min(mc[kind] / hc[kind], 1) : 1;
    perKind[kind] = { html: hc[kind], md: mc[kind], survival };
    if (present) {
      weightedSum += kindWeights[kind] * survival;
      weightTotal += kindWeights[kind];
    }
  }

  const score = weightTotal === 0 ? 100 : Math.round((weightedSum / weightTotal) * 100);
  return { score, perKind };
}
