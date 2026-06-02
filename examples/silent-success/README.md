# A 200 is not a success — detect it, then fix it

Two short Deno/TypeScript notebooks. A scrape can return `success: true` on HTTP 200 while the body is
junk (a bot wall, a paywall, an error page, or an unhydrated shell). Part 1 detects that case; Part 2
measures what it costs a downstream agent and shows a stronger scrape recovering the page.

| | notebook | what it shows | runs against |
|---|---|---|---|
| **Part 1** | [`01-detecting-silent-200s.ipynb`](./01-detecting-silent-200s.ipynb) | a content-signature detector for "silent 200s", evaluated on two labeled corpora (precision/recall) | self-hosted stack |
| **Part 2** | [`02-context-is-the-bottleneck.ipynb`](./02-context-is-the-bottleneck.ipynb) | a research agent's wrong answers attributed to scrape vs model failure — naive HTTP `0/5` → Firecrawl `5/5` | Firecrawl cloud |

Part 1 flags a `200` whose body is junk via content signatures. Part 2 measures the downstream effect
(absent context → wrong agent answers) and attributes each error to the scrape or the model.

## Run both in one Jupyter view

Launch Jupyter Lab **from this folder** so both notebooks sit side by side:

```bash
deno jupyter --install            # once
jupyter lab                       # then open 01-… and 02-…
```

**Part 1** needs the self-hosted stack and the experimental flag:

```bash
bash up.sh                        # brings up the stack (idempotent; docker compose)
# the notebook sets __experimental_catch_silent_failures itself
```

**Part 2** needs a Firecrawl cloud key:

```bash
export FIRECRAWL_API_KEY=fc-...
deno run -A run.ts                # the attribution table + the agent's real answers (also baked in the notebook)
```

## Files

- `01-detecting-silent-200s.ipynb` — Part 1 walkthrough (detector + eval)
- `02-context-is-the-bottleneck.ipynb` — Part 2 walkthrough (scrape-vs-model attribution)
- `silentFailure.ts` — the detector (snapshot of [`apps/api/src/scraper/scrapeURL/lib/silentFailure.ts`](../../apps/api/src/scraper/scrapeURL/lib/silentFailure.ts))
- `lib.ts`, `run.ts` — Part 2's helpers and runnable script (cloud)
- `up.sh` — stand up the self-hosted stack for Part 1
- `*.svg` — diagrams used by Part 1
