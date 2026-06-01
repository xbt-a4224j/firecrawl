/**
 * FG-008 — Score aggregator.
 *
 * Composes the per-dimension metrics into a single LLM-Readiness score and a serializable
 * QualityReport the UI / corpus runner render. Weights live in one documented object. Extraction
 * integrity is optional (it needs extra scrapes), and the overall score renormalizes over whichever
 * dimensions are present.
 */
import type { Finding, Severity } from "./types";
import { structureFidelity } from "./structureFidelity";
import { tableCodePreservation } from "./tableCodePreservation";
import { boilerplateNoise } from "./boilerplateNoise";
import { tokenEfficiency } from "./tokenEfficiency";
import { inlineGlue } from "./inlineGlue";
import type { ExtractionIntegrityResult } from "./extractionIntegrity";
import { resolveConfig, type PartialQualityConfig, type QualityConfig } from "./config";

/**
 * grade() takes a Firecrawl scrape document directly — so it drops straight onto your existing
 * `scrape()` call: `grade(await firecrawl.scrape(url, { formats: ["markdown", "html"] }))`.
 * The Firecrawl Document fields (markdown/html/screenshot/metadata) are read as-is; the rest are
 * optional grading extras.
 */
export interface GradeInput {
  markdown?: string;
  html?: string;
  screenshot?: string;
  metadata?: { statusCode?: number; sourceURL?: string };
  /** Optional grading extras (not part of a Firecrawl Document). */
  url?: string;
  meta?: { config?: string; latencyMs?: number; statusCode?: number; category?: string };
  /** Fold a precomputed extraction-integrity result into the grade. */
  extraction?: ExtractionIntegrityResult;
}

export type Rating = "A" | "B" | "C" | "D" | "F";

export interface QualityReport {
  url: string;
  score: number;
  /** Letter grade derived from the score — instantly readable. */
  rating: Rating;
  /** One-line human summary, e.g. "61/100 (D) — INLINE_GLUE ×1, HIGH_BOILERPLATE ×1". */
  summary: string;
  dimensions: Record<string, number>;
  findings: Finding[];
  artifacts: { markdown: string; html: string; screenshotUrl?: string };
  meta: { config?: string; latencyMs?: number; statusCode?: number; category?: string };
}

function ratingFor(score: number, t: QualityConfig["rating"]): Rating {
  if (score >= t.A) return "A";
  if (score >= t.B) return "B";
  if (score >= t.C) return "C";
  if (score >= t.D) return "D";
  return "F";
}

function summarize(score: number, rating: Rating, findings: Finding[]): string {
  if (findings.length === 0) return `${score}/100 (${rating}) — clean`;
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  const parts = [...counts.entries()].map(([code, n]) => `${code} ×${n}`);
  return `${score}/100 (${rating}) — ${parts.join(", ")}`;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export interface GradeOptions {
  /** Override any scoring knob; everything not set falls back to DEFAULT_CONFIG. */
  config?: PartialQualityConfig;
}

export function grade(input: GradeInput, options: GradeOptions = {}): QualityReport {
  const cfg = resolveConfig(options.config);
  const markdown = input.markdown ?? "";
  const html = input.html ?? "";
  const url = input.url ?? input.metadata?.sourceURL ?? "";
  const screenshotUrl = input.screenshot;
  const meta = { ...(input.meta ?? {}) };
  if (meta.statusCode === undefined && input.metadata?.statusCode !== undefined) {
    meta.statusCode = input.metadata.statusCode;
  }

  const structure = structureFidelity(html, markdown, cfg.structureKindWeights);
  const tablesCode = tableCodePreservation(html, markdown);
  const boilerplate = boilerplateNoise(markdown);
  const tokens = tokenEfficiency(markdown);
  const glue = inlineGlue(markdown, html, cfg.inlineGlue);

  const dimensions: Record<string, number> = {
    structureFidelity: structure.score,
    tablesCode: tablesCode.score,
    inlineGlue: glue.score,
    boilerplateNoise: boilerplate.score,
    tokenEfficiency: tokens.score,
  };
  if (input.extraction) dimensions.extractionIntegrity = input.extraction.score;

  // weighted overall, renormalized over present dimensions
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(cfg.weights)) {
    if (key in dimensions) {
      weightedSum += weight * dimensions[key]!;
      weightTotal += weight;
    }
  }
  const weighted = weightTotal === 0 ? 0 : Math.round(weightedSum / weightTotal);

  const findings: Finding[] = [
    ...tablesCode.findings,
    ...glue.hits.map((h): Finding => ({
      code: "INLINE_GLUE",
      severity: "high",
      evidence: h.token,
      offset: h.offset,
    })),
    ...(boilerplate.noiseRatio > cfg.boilerplateHighRatio
      ? [
          {
            code: "HIGH_BOILERPLATE",
            severity: "medium" as Severity,
            evidence: `${Math.round(boilerplate.noiseRatio * 100)}% boilerplate`,
          },
        ]
      : []),
    ...(input.extraction?.findings ?? []),
  ];
  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  // apply the correctness ceiling: the most severe finding caps the score
  const ceiling = findings.reduce((min, f) => Math.min(min, cfg.severityCeiling[f.severity]), 100);
  const score = Math.min(weighted, ceiling);

  const artifacts: QualityReport["artifacts"] = { markdown, html };
  if (screenshotUrl !== undefined) artifacts.screenshotUrl = screenshotUrl;

  const rating = ratingFor(score, cfg.rating);
  return {
    url,
    score,
    rating,
    summary: summarize(score, rating, findings),
    dimensions,
    findings,
    artifacts,
    meta,
  };
}
