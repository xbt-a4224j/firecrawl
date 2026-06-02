# silent-success

A Deno/TypeScript Jupyter walkthrough of detecting **silent 200s** — scrapes that return
`success: true` on junk (bot walls, paywalls, login/consent gates, error or placeholder pages) —
behind the experimental flag `__experimental_catch_silent_failures`.

It walks the whole exercise: the thesis (a 200 isn't a success), the detector (signatures, not
length), and the honest precision/recall result over two labeled corpora.

## Run

```bash
bash up.sh                 # stands up the full stack (idempotent; docker compose, Playwright in a
                           # Linux container — dodges the macOS headless-chromium crash)
deno jupyter --install     # once
jupyter lab walkthrough.ipynb   # launch FROM THIS DIRECTORY (relative paths)
```

`§0` of the notebook also runs `up.sh`, so the first step is optional. Readiness is verified by a
real scrape succeeding, not just an open port.

`silentFailure.ts` in this folder is a **snapshot** of the detector, copied alongside the notebook so
the walkthrough is self-contained and runs regardless of where the folder lives. The canonical source
is under `apps/api/` (linked below).

## Where the code is

- detector: [`apps/api/src/scraper/scrapeURL/lib/silentFailure.ts`](../../apps/api/src/scraper/scrapeURL/lib/silentFailure.ts) (snapshot: [`./silentFailure.ts`](./silentFailure.ts))
- wiring + flag: [`scrapeURL/index.ts`](../../apps/api/src/scraper/scrapeURL/index.ts) (rejects a silent 200 so the engine waterfall escalates)
- labeled eval corpora + assertions: [`__tests__/snips/v2/silentFailure_e2e.test.ts`](../../apps/api/src/__tests__/snips/v2/silentFailure_e2e.test.ts)
