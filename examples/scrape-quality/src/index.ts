/**
 * Scrape quality — score the LLM-readiness of a Firecrawl scrape result.
 *
 * The spine is one pure function that drops onto your existing scrape:
 *
 *   import Firecrawl from "@mendable/firecrawl-js";
 *   import { grade } from "scrape-quality";
 *
 *   const doc = await firecrawl.scrape(url, { formats: ["markdown", "html", "screenshot"] });
 *   const quality = grade(doc);   // { score, rating, summary, dimensions, findings }
 *
 * (Imagine this as `scrape(...).quality` — a first-class quality field on the scrape response.)
 *
 * `scrapeUrl` is a thin fetch convenience for the CLI/demo; in your app you already have the doc.
 */
export { grade } from "./scoring/grade";
export type { QualityReport, GradeInput, GradeOptions, Rating } from "./scoring/grade";
export type { Finding, Severity } from "./scoring/types";

// the scoring config — every tunable weight/threshold in one place, overridable per call
export { DEFAULT_CONFIG, resolveConfig } from "./scoring/config";
export type { QualityConfig, PartialQualityConfig } from "./scoring/config";

// the individual metrics, exported so they can be composed / swapped á la carte
export { structureFidelity } from "./scoring/structureFidelity";
export { tableCodePreservation } from "./scoring/tableCodePreservation";
export { boilerplateNoise } from "./scoring/boilerplateNoise";
export { tokenEfficiency } from "./scoring/tokenEfficiency";
export { inlineGlue } from "./scoring/inlineGlue";
export { extractionIntegrity } from "./scoring/extractionIntegrity";

export { scrapeUrl, apiUrlForTarget } from "./harness/scrape";
export type { ScrapeDocument, ScrapeUrlOptions, ScrapeTarget } from "./harness/scrape";

export { judge, buildJudgePrompt } from "./judge";
export type { JudgeVerdict, JudgeOptions, JudgePrompt } from "./judge";

export { leaderboard } from "./leaderboard";
export type { Leaderboard, CategoryStat, FailureMode } from "./leaderboard";
