/**
 * change-feed CLI — RSS for anything.
 *   pnpm watch https://a.com https://b.com [--diff] [--only-significant]
 *   pnpm watch --file=watchlist.txt [--diff]
 *
 * Needs a CLOUD key (changeTracking is hosted). First run sets baselines (all NEW); run again to
 * see what changed. It reports what each run cost so it never quietly burns your quota.
 */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import Firecrawl from "@mendable/firecrawl-js";
import { watchUrls, type ChangeDoc } from "./watch";
import { formatFeed } from "./format";
import { summarizeRun, formatRunLine } from "./stats";

function parseArgs(argv: string[]) {
  const showDiff = argv.includes("--diff");
  const onlySignificant = argv.includes("--only-significant");
  const fileArg = argv.find((a) => a.startsWith("--file="))?.split("=")[1];
  const urls = fileArg
    ? readFileSync(fileArg, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    : argv.filter((a) => !a.startsWith("--"));
  return { urls, showDiff, onlySignificant };
}

async function remainingCredits(fc: Firecrawl): Promise<number | null> {
  try {
    const u = (await fc.getCreditUsage()) as unknown as Record<string, unknown>;
    const v = u.remainingCredits ?? u.remaining_credits ?? u.credits;
    return typeof v === "number" ? v : null;
  } catch {
    return null; // usage endpoint not available — just skip the credit line
  }
}

async function main(): Promise<void> {
  const { urls, showDiff, onlySignificant } = parseArgs(process.argv.slice(2));
  if (urls.length === 0) {
    console.error("usage: pnpm watch <url> [<url>...] [--diff] [--only-significant]   |   --file=watchlist.txt");
    process.exit(1);
  }
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error("✖ No FIRECRAWL_API_KEY set.");
    console.error("  changeTracking is a hosted feature — set a cloud (fc-) key from firecrawl.dev:");
    console.error("    export FIRECRAWL_API_KEY=fc-...");
    process.exit(1);
  }

  const fc = new Firecrawl({ apiKey });
  const scrape = async (url: string, options: Record<string, unknown>) =>
    (await fc.scrape(url, options)) as unknown as ChangeDoc;

  const checkedAt = new Date().toISOString().replace(/\.\d+Z$/, " UTC").replace("T", " ");
  console.log(`\n📡 change-feed — checking ${urls.length} page(s) · ${checkedAt}\n`);
  const before = await remainingCredits(fc);
  const items = await watchUrls(urls, { scrape });
  const after = await remainingCredits(fc);

  const shown = onlySignificant
    ? items.filter((i) => i.significant || i.status === "error" || i.status === "new")
    : items;
  console.log(formatFeed(shown, { showDiff }));

  const credits = before != null && after != null ? { used: before - after, remaining: after } : undefined;
  console.log(formatRunLine(summarizeRun(items), credits) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
