/**
 * change-feed CLI — RSS for anything.
 *   pnpm watch https://a.com https://b.com [--diff] [--only-significant]
 *   pnpm watch --file=watchlist.txt [--diff]
 *   pnpm watch --monitor=<id> ...        reuse an existing monitor (see changes vs its baseline)
 *   pnpm watch --primitive ...           v1 path: drive changeTracking directly (sync, on-demand)
 *
 * Default path runs on Firecrawl's productized /v2/monitor endpoint: it creates a monitor, triggers
 * an on-demand check, and reads the per-URL results — the scheduling, diff storage, and the
 * "did this meaningfully change?" judge all happen SERVER-SIDE. First run on a new monitor sets
 * baselines (all NEW); reuse it with --monitor=<id> to see what changed. Needs a CLOUD (fc-) key.
 */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import Firecrawl from "@mendable/firecrawl-js";
import { watchUrls, type ChangeDoc, type FeedItem } from "./watch";
import {
  httpMonitorClient,
  createFeedMonitor,
  runMonitorCheck,
} from "./monitor";
import { formatFeed } from "./format";
import { summarizeRun, formatRunLine } from "./stats";

function parseArgs(argv: string[]) {
  const showDiff = argv.includes("--diff");
  const onlySignificant = argv.includes("--only-significant");
  const primitive = argv.includes("--primitive");
  const monitorId = argv.find((a) => a.startsWith("--monitor="))?.split("=")[1];
  const fileArg = argv.find((a) => a.startsWith("--file="))?.split("=")[1];
  const urls = fileArg
    ? readFileSync(fileArg, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    : argv.filter((a) => !a.startsWith("--"));
  return { urls, showDiff, onlySignificant, primitive, monitorId };
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
  const { urls, showDiff, onlySignificant, primitive, monitorId } = parseArgs(process.argv.slice(2));
  if (urls.length === 0 && !monitorId) {
    console.error("usage: pnpm watch <url> [<url>...] [--diff] [--only-significant] [--monitor=<id>] [--primitive]   |   --file=watchlist.txt");
    process.exit(1);
  }
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error("✖ No FIRECRAWL_API_KEY set.");
    console.error("  /monitor + changeTracking are hosted — set a cloud (fc-) key from firecrawl.dev:");
    console.error("    export FIRECRAWL_API_KEY=fc-...");
    process.exit(1);
  }

  const fc = new Firecrawl({ apiKey });
  const checkedAt = new Date().toISOString().replace(/\.\d+Z$/, " UTC").replace("T", " ");
  const engine = primitive ? "changeTracking (v1 primitive)" : "/v2/monitor";
  console.log(`\n📡 change-feed — checking ${urls.length} page(s) via ${engine} · ${checkedAt}\n`);

  const before = await remainingCredits(fc);
  let items: FeedItem[];

  if (primitive) {
    // v1: drive the changeTracking primitive directly — synchronous, on-demand, client-side loop.
    const scrape = async (url: string, options: Record<string, unknown>) =>
      (await fc.scrape(url, options)) as unknown as ChangeDoc;
    items = await watchUrls(urls, { scrape });
  } else {
    // default: thin client over the productized /monitor endpoint.
    const client = httpMonitorClient(apiKey);
    let id = monitorId;
    if (!id) {
      id = await createFeedMonitor(client, { name: `change-feed ${checkedAt}`, urls });
      console.log(`🆕 created monitor ${id} — first check sets baselines; reuse with --monitor=${id} to see what changed\n`);
    }
    items = await runMonitorCheck(id, { client });
  }

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
