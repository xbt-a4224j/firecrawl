import type { Meta } from "..";
import type { Document } from "../../../controllers/v2/types";
import { quality } from "../../../lib/quality";

/**
 * Thin transformer: attaches document.quality only when the per-request __experimental_quality
 * flag is set. The whole feature is gated here — when the flag is off this is a no-op and the
 * scrape is byte-for-byte unchanged. The scoring logic lives in lib/quality.ts (pure, testable,
 * and reusable by engine selection later).
 */
export function deriveQuality(meta: Meta, document: Document): Document {
  if (!meta.options.__experimental_quality) return document; // no-op when off
  const report = quality(document);
  document.quality = report;
  // Instrument what matters: info only when something's wrong; debug otherwise (no log spam).
  if (report.findings.length > 0) {
    meta.logger.info("scrape.quality.finding", {
      rating: report.rating,
      score: report.score,
      findings: report.findings.map(f => f.code),
      sourceURL: document.metadata?.sourceURL,
    });
  } else {
    meta.logger.debug("scrape.quality.ok", { rating: report.rating });
  }
  return document;
}
