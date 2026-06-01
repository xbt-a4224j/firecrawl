/**
 * FG-007 — Extraction-integrity probe (the #3300 receipt).
 *
 * Developers "use structured extraction to skip the LLM call entirely — it has to be reliable."
 * This probe runs a schema extraction N times and checks the result is populated, schema-valid, and
 * deterministic. A Zod v4 schema through scrape() exposes #3300 here: every run comes back empty.
 */
import type { Finding } from "./types";

export interface ExtractionIntegrityResult {
  score: number; // 0..100
  populated: boolean;
  schemaValid: boolean;
  deterministic: boolean;
  findings: Finding[];
}

export interface ExtractionIntegrityOptions {
  runs?: number;
  /** Validates one extraction result against the schema. Defaults to "populated ⇒ valid". */
  validate?: (json: unknown) => boolean;
}

function isNonEmptyObject(v: unknown): boolean {
  return (
    typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length > 0
  );
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export async function extractionIntegrity(
  extractOnce: () => Promise<unknown>,
  options: ExtractionIntegrityOptions = {},
): Promise<ExtractionIntegrityResult> {
  const runs = options.runs ?? 3;

  const results: unknown[] = [];
  for (let i = 0; i < runs; i++) {
    try {
      results.push(await extractOnce());
    } catch {
      results.push(undefined);
    }
  }

  const populated = results.every(isNonEmptyObject);
  const schemaValid = options.validate
    ? results.every((r) => options.validate!(r))
    : populated;
  const deterministic = new Set(results.map(stableStringify)).size === 1;

  const findings: Finding[] = [];
  if (!populated) {
    findings.push({
      code: "EXTRACTION_EMPTY",
      severity: "high",
      evidence: `extraction returned empty on ${results.filter((r) => !isNonEmptyObject(r)).length}/${runs} runs`,
    });
  }
  if (!deterministic) {
    findings.push({
      code: "EXTRACTION_NONDETERMINISTIC",
      severity: "medium",
      evidence: `extraction varied across ${runs} runs`,
    });
  }
  if (!schemaValid) {
    findings.push({
      code: "EXTRACTION_SCHEMA_INVALID",
      severity: "medium",
      evidence: "extraction did not validate against the schema",
    });
  }

  const score = Math.round(
    100 * (0.5 * Number(populated) + 0.25 * Number(schemaValid) + 0.25 * Number(deterministic)),
  );

  return { score, populated, schemaValid, deterministic, findings };
}

export interface ExtractClient {
  scrape(url: string, options: Record<string, unknown>): Promise<{ json?: unknown }>;
}

/** Wire an extraction run from a Firecrawl client, url and schema. */
export function buildExtractFn(
  client: ExtractClient,
  url: string,
  schema: unknown,
): () => Promise<unknown> {
  return async () => {
    const doc = await client.scrape(url, { formats: [{ type: "json", schema }] });
    return doc.json;
  };
}
