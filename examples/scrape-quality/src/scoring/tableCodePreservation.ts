/**
 * FG-003 — Table & code-block preservation metric.
 *
 * Tables and code blocks are the highest-stakes structures for LLM-ready data — they're where
 * scrapers most often flatten meaning into mush. Higher-resolution than FG-002's counts: checks
 * that each HTML table became a real markdown pipe-table (header separator present) and each code
 * block kept its fence (and language hint).
 */
import type { Finding } from "./types";

export interface TableCodeResult {
  score: number; // 0..100
  tables: { html: number; preserved: number };
  code: { html: number; preserved: number };
  findings: Finding[];
}

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

export function tableCodePreservation(html: string, md: string): TableCodeResult {
  const htmlTables = countMatches(html, /<table[\s>]/gi);
  // a preserved markdown table is identified by its header-separator row, e.g. |---|:--:|
  const mdTables = countMatches(md, /^\s*\|?[ :|-]*-[ :|-]*\|[ :|-]*$/gm);
  const preservedTables = Math.min(mdTables, htmlTables);

  const htmlCode = countMatches(html, /<pre[\s>]/gi);
  const mdFences = Math.floor(countMatches(md, /```/g) / 2);
  const preservedCode = Math.min(mdFences, htmlCode);

  const htmlLangHints = countMatches(
    html,
    /<code[^>]*class\s*=\s*["'][^"']*\b(?:language|lang)-\w+/gi,
  );
  const mdLangFences = countMatches(md, /```[ \t]*[A-Za-z][\w+-]*/g);

  const findings: Finding[] = [];

  const flattened = htmlTables - preservedTables;
  if (flattened > 0) {
    findings.push({
      code: "TABLE_FLATTENED",
      severity: "medium",
      evidence: `${flattened} of ${htmlTables} table(s) flattened to prose`,
    });
  }

  const unfenced = htmlCode - preservedCode;
  if (unfenced > 0) {
    findings.push({
      code: "CODE_UNFENCED",
      severity: "medium",
      evidence: `${unfenced} of ${htmlCode} code block(s) lost their fence`,
    });
  }

  if (htmlLangHints > mdLangFences) {
    findings.push({
      code: "CODE_LANG_LOST",
      severity: "low",
      evidence: `${htmlLangHints - mdLangFences} code block(s) lost their language hint`,
    });
  }

  const present = htmlTables + htmlCode;
  const preserved = preservedTables + preservedCode;
  const score = present === 0 ? 100 : Math.round((preserved / present) * 100);

  return {
    score,
    tables: { html: htmlTables, preserved: preservedTables },
    code: { html: htmlCode, preserved: preservedCode },
    findings,
  };
}
