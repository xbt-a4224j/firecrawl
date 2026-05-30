/**
 * CLI — grade a URL's scrape quality from the terminal:
 *   pnpm grade https://example.com [--target=local|cloud]
 */
import { pathToFileURL } from "node:url";
import { scrapeUrl, grade as gradeDoc } from "./index";
import type { QualityReport } from "./scoring/grade";
import type { ScrapeTarget } from "./harness/scrape";

export function formatReport(grade: QualityReport): string {
  const lines: string[] = [];
  lines.push(grade.url);
  lines.push(`  ${grade.score}/100  (${grade.rating})`);
  lines.push(`  ${grade.summary}`);
  lines.push("");

  const dims = Object.entries(grade.dimensions)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  lines.push(`  dimensions: ${dims}`);

  if (grade.findings.length > 0) {
    lines.push("");
    lines.push("  findings:");
    for (const f of grade.findings) {
      lines.push(`    [${f.severity}] ${f.code}  ${f.evidence}`);
    }
  } else {
    lines.push("");
    lines.push("  findings: clean ✓");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url || url.startsWith("--")) {
    console.error("usage: pnpm grade <url> [--target=local|cloud]");
    process.exit(1);
  }
  const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "cloud") as ScrapeTarget;
  const doc = await scrapeUrl(url, { target });
  const report = gradeDoc({ ...doc, url });
  console.log("\n" + formatReport(report) + "\n");
  process.exit(report.rating === "F" ? 1 : 0);
}

// run only when invoked directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
