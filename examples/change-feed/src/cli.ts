/**
 * change-feed CLI — RSS for anything.
 *   pnpm watch https://a.com https://b.com [--diff]
 *   pnpm watch --file=watchlist.txt [--diff]
 *
 * Needs a CLOUD key (changeTracking is a hosted feature — the previous-scrape baseline lives in
 * Firecrawl's storage). First run sets baselines (everything shows NEW); run again to see changes.
 */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import Firecrawl from "@mendable/firecrawl-js";
import { watchUrls, type ChangeDoc } from "./watch";
import { formatFeed } from "./format";

function parseArgs(argv: string[]) {
  const showDiff = argv.includes("--diff");
  const fileArg = argv.find((a) => a.startsWith("--file="))?.split("=")[1];
  const urls = fileArg
    ? readFileSync(fileArg, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    : argv.filter((a) => !a.startsWith("--"));
  return { urls, showDiff };
}

async function main(): Promise<void> {
  const { urls, showDiff } = parseArgs(process.argv.slice(2));
  if (urls.length === 0) {
    console.error("usage: pnpm watch <url> [<url>...] [--diff]   |   pnpm watch --file=watchlist.txt [--diff]");
    process.exit(1);
  }
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error("Set FIRECRAWL_API_KEY (a cloud fc-... key). changeTracking is a hosted feature.");
    process.exit(1);
  }

  const fc = new Firecrawl({ apiKey });
  const scrape = async (url: string, options: Record<string, unknown>) =>
    (await fc.scrape(url, options)) as unknown as ChangeDoc;

  console.log(`\n📡 change-feed — checking ${urls.length} page(s)\n`);
  const items = await watchUrls(urls, { scrape });
  console.log(formatFeed(items, { showDiff }));

  const changed = items.filter((i) => i.status === "changed").length;
  const fresh = items.filter((i) => i.status === "new").length;
  console.log(`— ${changed} changed · ${fresh} new (baseline set) · ${items.length} watched —\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
