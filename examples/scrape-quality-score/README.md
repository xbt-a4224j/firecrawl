# scrape-quality-score

A live corpus + report for the **scrape-quality signal** — a cheap, deterministic read on
whether a `200 OK` actually returned usable content, or a **silent 200**: a success response
that's really an empty shell, an unhydrated JS skeleton, mojibake, an anti-bot interstitial, or
pure boilerplate.

The signal itself lives in the API: [`apps/api/src/lib/quality.ts`](../../apps/api/src/lib/quality.ts)
(pure heuristics) wired in as a transformer
([`transformers/quality.ts`](../../apps/api/src/scraper/scrapeURL/transformers/quality.ts)). When
`__experimental_quality` is set, every scrape gets a `quality` field:

```json
{
  "statusCode": 200,
  "markdown": "Loading…",
  "quality": {
    "score": 30,
    "rating": "F",
    "findings": [
      {
        "code": "JS_SHELL",
        "severity": "high",
        "issues": [1345, 1297, 2375],
        "evidence": "markdown 21 chars vs raw HTML 412KB (0.01% text) across 9 <script> tags — shipped JS, not content",
        "hint": "page didn't hydrate — render with a browser engine before converting",
        "suggestedFix": { "engine": "chrome-cdp" }
      }
    ]
  }
}
```

## What's here

| file | what |
| --- | --- |
| `corpus.json` | ~36 real URLs, bucketed by what they demonstrate (engine delta, silent 200, hard block, charset, boilerplate, control). Each row cites the customer issue it maps to. |
| `src/run-corpus.ts` | scrapes the corpus through a local Firecrawl API with `__experimental_quality` on, reads the server-side `quality` field, writes `out/results.{json,csv}`. |
| `src/build-report.ts` | joins `corpus.json` + `out/results.json` into a self-contained `motivation.html` (the problem, the heuristics→issues map, the live grid). |
| `motivation.html` | the generated report — opens straight from disk. |
| `notebook.ipynb` | a Deno/TypeScript notebook that imports the **real** `quality()` and runs it live on the five failure shapes, the false-positive guards, and the engine delta. |
| `out/` | a committed snapshot of the last run, so the report renders without a local stack. |

## Run it

Requires a local Firecrawl API on `:3002` (`cd apps/api && pnpm harness` or your usual local
stack). For the engine-delta columns you also need a Playwright service and
`PLAYWRIGHT_MICROSERVICE_URL` set on the API.

```bash
npm install

npm run corpus            # one scrape per URL (local default engine)
npm run corpus:engines    # force fetch AND playwright per URL → the engine delta
npm run report            # regenerate motivation.html from the latest results
```

The notebook needs no API at all — it imports the pure `quality()` function directly. With
[Deno](https://deno.com) installed, register the kernel once (`deno jupyter --install`) and launch
**from this directory** so the relative import resolves:

```bash
deno jupyter --install
jupyter lab notebook.ipynb   # or: jupyter notebook
```

## What the live run shows

Run against the default `fetch` engine, **most of the modern web grades A** — sites server-render
precisely so they're crawlable. That's the signal *not* crying wolf. The value concentrates on the
client-rendered tail:

- **Grade flips** — `fetch:F → playwright:A`. A URL that silently returns a near-empty 200 to a
  plain fetch, and renders fine once you force a browser engine. e.g. `excalidraw.com` (21c → 651c).
- **Content recovery** — even when the grade doesn't flip, the browser recovers materially more
  text (`quotes.toscrape.com/js` 143c → 1574c). This is the always-present view of the same delta.

That `quality(fetch)` vs `quality(playwright)` comparison is exactly the input an engine router or
the offline engpicker calibration would route on — quality, not just a similarity score.

## The five heuristics → customer issues

| finding | severity | catches | issues |
| --- | --- | --- | --- |
| `EMPTY` | high | 200 but markdown effectively empty | #385 #684 #666 #1297 |
| `JS_SHELL` | high | fetched a JS shell that never hydrated | #1345 #1297 #2375 |
| `GARBLED` | high | wrong charset → mojibake | #1142 #1277 #547 |
| `SOFT_BOT_WALL` | high | anti-bot interstitial returned with a 200 | #2350 #495 #2413 |
| `HIGH_BOILERPLATE` | medium | nav/cookie/footer chrome dominates | #284 #288 #1564 #540 |

## Honest limitations

- Thresholds are a defensible **first pass**, hand-set against documented failures — **not**
  golden-set calibrated. Calibrating them on a labelled corpus is the evals work itself.
- It reports a **symptom**, not a cause. `JS_SHELL` means "this looks unrendered," not "the proxy
  failed." The suggested fix is advisory; no retry is wired in.
- **Hard blocks are out of scope by design.** A 5xx anti-bot response fails loudly; quality() is for
  the 200s that *look* fine. The corpus includes a `hard_block` bucket as the contrast.
- The corpus is **live and best-effort** — sites drift, so a URL can move buckets between runs. The
  deterministic pass/fail gate is [`quality.test.ts`](../../apps/api/src/lib/quality.test.ts).
