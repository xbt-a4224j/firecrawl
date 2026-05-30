/**
 * Live corpus runner — grades a list of real URLs against an actual Firecrawl and writes
 * corpus-results.json. This is the production counterpart of src/demo/build.ts (which uses offline
 * fixtures). Bring your own URLs:
 *
 *   FIRECRAWL_API_KEY=fc-... pnpm tsx scripts/run-corpus.ts urls.txt --target=cloud --out=results.json
 *
 * urls.txt: one entry per line, optional "url<TAB>category".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { scrapeUrl, grade, leaderboard, type ScrapeTarget, type QualityReport } from "../src/index";

interface CorpusEntry {
  url: string;
  category?: string;
}

/** Run an async fn over items with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function arg(flag: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.slice(flag.length + 3) : fallback;
}

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/run-corpus.ts <urls.txt> [--target=cloud|local] [--out=results.json]");
  process.exit(1);
}

const entries: CorpusEntry[] = readFileSync(file, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((line) => {
    const [url, category] = line.split(/\t+/);
    return category ? { url: url!, category } : { url: url! };
  });

const target = arg("target", "cloud") as ScrapeTarget;
const out = arg("out", "corpus-results.json");

const results: QualityReport[] = await mapPool(entries, 4, async (entry) => {
  const doc = await scrapeUrl(entry.url, { target });
  return grade({ ...doc, url: entry.url, meta: entry.category ? { category: entry.category } : {} });
});
writeFileSync(out, JSON.stringify(results, null, 2) + "\n");

const lb = leaderboard(results);
console.log(`graded ${lb.count} urls — avg ${lb.avgScore}/100`);
console.log("worst:", lb.worst.slice(0, 3).map((r) => `${r.score} ${r.url}`).join("  |  "));
console.log(`wrote -> ${out}`);
