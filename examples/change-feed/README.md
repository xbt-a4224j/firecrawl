# change-feed — RSS for anything 📡

Turn **any webpage into a change-feed** — even the ~90% of the web with no RSS. Point it at a pricing
page, a Terms of Service, a competitor's changelog, a docs page, a job board. When something changes,
an LLM tells you **what meaningfully changed and why it matters** — not a raw text diff.

Built on Firecrawl's **`changeTracking`** — a powerful hosted feature with (until now) zero examples.

## Why this is more than "scrape twice and diff"

Firecrawl stores the previous scrape of each page for you, server-side, and diffs against it
automatically. You hold **no state** — each check compares against the last one and becomes the new
baseline. (Index of last-scrape-per-`(team, url, tag)` lives in Postgres; the content in GCS.) It can
even LLM-summarize the delta for you. So this example is the **feed UX + scheduling** on top of a
primitive that's already doing the hard part.

```
your watchlist ──► firecrawl.scrape(url, { formats: ["markdown",
                      { type: "changeTracking", modes: ["git-diff","json"], prompt }] })
                              │  Firecrawl diffs vs the stored baseline, LLM-summarizes the change
                              ▼
   feed item: { status: new|changed|same|removed, summary: "Price rose $20 → $29", diff }
```

## Run it

```bash
pnpm install
export FIRECRAWL_API_KEY=fc-...          # a CLOUD key — changeTracking is hosted

pnpm watch https://openai.com/pricing https://news.ycombinator.com
#   first run → everything is NEW (baselines are set)
pnpm watch https://openai.com/pricing https://news.ycombinator.com --diff
#   run again later → CHANGED items, each with an LLM "what changed & why", and the diff

pnpm watch --file=watchlist.txt          # one URL per line
```

Schedule it (cron / GitHub Action) to get a recurring "what changed across my watchlist" digest.

## How it works (the code)

- `src/watch.ts` — `watchUrls(urls, { scrape })`: maps each URL's `changeTracking` result into a feed
  item (`new`/`changed`/`same`/`removed`), with the LLM summary + diff. Per-URL isolation; pure +
  unit-tested (the scrape fn is injected).
- `src/format.ts` — renders the feed for the terminal.
- `src/cli.ts` — wires the real Firecrawl cloud client and prints the feed.

```bash
pnpm test        # 10 tests, no network (injected client)
```

## Notes

- **Cloud only.** `changeTracking` needs Firecrawl's hosted baseline store; it won't run on a bare
  self-host. Point at `api.firecrawl.dev`.
- Use a `tag` (per-URL) if you want multiple independent watch-streams on the same page.
