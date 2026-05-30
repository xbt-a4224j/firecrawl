/**
 * Quality scoring config — every tunable number in one typed, documented, overridable place.
 *
 * Be honest about what these are: hand-set heuristics, not calibrated constants. Centralizing them
 * makes the "winging" inspectable and tunable, and sets up the real next step — calibrating the
 * weights/thresholds against a labeled golden set (the actual eval work).
 *
 *   grade(doc, { config: { weights: { inlineGlue: 0.3 } } })   // override one knob; the rest default
 */

export interface QualityConfig {
  /** How much each dimension contributes to the overall score (only present dimensions count). */
  weights: Record<string, number>;
  /** Per-structure-kind weights inside the structure-fidelity metric. */
  structureKindWeights: { headings: number; tables: number; code: number; lists: number };
  /** Inline-glue detector thresholds. */
  inlineGlue: { repeatMinLen: number; camelSeamMinLen: number; penaltyPerHit: number };
  /** A boilerplate noise ratio above this flags HIGH_BOILERPLATE. */
  boilerplateHighRatio: number;
  /** Inclusive lower score bounds for each letter rating. */
  rating: { A: number; B: number; C: number; D: number };
  /** The max overall score a finding of each severity allows (correctness ceiling). */
  severityCeiling: { high: number; medium: number; low: number };
}

export const DEFAULT_CONFIG: QualityConfig = {
  weights: {
    structureFidelity: 0.25,
    tablesCode: 0.2,
    inlineGlue: 0.2,
    boilerplateNoise: 0.15,
    tokenEfficiency: 0.1,
    extractionIntegrity: 0.1,
  },
  structureKindWeights: { tables: 3, code: 3, headings: 2, lists: 1 },
  inlineGlue: { repeatMinLen: 8, camelSeamMinLen: 16, penaltyPerHit: 25 },
  boilerplateHighRatio: 0.3,
  rating: { A: 90, B: 75, C: 60, D: 40 },
  severityCeiling: { high: 74, medium: 89, low: 100 },
};

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type PartialQualityConfig = {
  [K in keyof QualityConfig]?: Partial<QualityConfig[K]>;
};

/** Merge a partial config over the defaults (one level deep — matches the config shape). */
export function resolveConfig(partial: PartialQualityConfig = {}): QualityConfig {
  const out = {} as QualityConfig;
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof QualityConfig)[]) {
    const def = DEFAULT_CONFIG[key];
    const ov = partial[key];
    out[key] = (isObj(def) && isObj(ov) ? { ...def, ...ov } : (ov ?? def)) as never;
  }
  return out;
}
