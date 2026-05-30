# scrape-quality

**Score the LLM-readiness of a Firecrawl scrape result.** One pure function that drops onto your
existing `scrape()` call — think of it as a `quality` field on the scrape response.

Firecrawl's success gate is a liveness check — `isLongEnough` literally means "the markdown isn't
empty" — so fidelity regressions (glued inline elements, dropped tables, empty structured extraction)
ship as `200 success`. This makes output quality a **measurable, gated signal**, and catches issues
#3583 and #3300 on real input.

## Use it (the whole API)

```ts
import Firecrawl from "@mendable/firecrawl-js";
import { grade } from "scrape-quality";

const doc = await firecrawl.scrape(url, { formats: ["markdown", "html", "screenshot"] });
const quality = grade(doc);   // ← drops straight onto your existing scrape

quality.score;     // 74
quality.rating;    // "C"
quality.summary;   // "74/100 (C) — INLINE_GLUE ×1, HIGH_BOILERPLATE ×1"
quality.findings;  // [{ code: "INLINE_GLUE", severity: "high", evidence: "FunktionalFunktional", offset: 0 }, ...]
quality.dimensions // { structureFidelity: 100, inlineGlue: 75, boilerplateNoise: 29, ... }
```

That's the spine: **`grade(doc)` is pure** — it scores a document you already have, so it composes with
your normal Firecrawl usage. No new client, no new scraping path. (Imagine `scrape(..).quality`.)

Optional extras:

```ts
import { judge, leaderboard } from "scrape-quality";
await judge(quality);          // anchored LLM rating (graceful no-op without a key)
leaderboard(reports);          // rank a corpus: worst pages, failure modes, category stats
```

- **Correctness dominates** — a high-severity finding caps the grade at C, so defects can't hide behind
  good dimensions.
- The only non-pure helper is `scrapeUrl(url)` — a thin fetch convenience for the CLI/demo. In your app
  you already have the doc.

## Scoring (the scrape grades itself)

Compare the `markdown` against the `html` from the same scrape — lost structure = lost fidelity:

| Dimension | What it measures |
|---|---|
| Structure Fidelity | headings/tables/code/lists that survived HTML → markdown |
| Tables & Code | tables flattened to prose, code blocks that lost their fence |
| Inline Glue (#3583) | adjacent inline elements glued into one token (`FunktionalFunktional`) |
| Boilerplate Noise | nav/cookie/footer cruft diluting the content |
| Token Efficiency | real-tokenizer content density vs bloat |
| Extraction Integrity (#3300) | schema extraction populated, valid, deterministic |

## Playground (the demo)

```bash
pnpm dev
```

Tweak the scrape config (target, `onlyMainContent`), watch the **live Node/Python/cURL snippet** update,
hit Grade → the quality panel (report card + diff theater with glued tokens highlighted). Change a knob,
watch the grade move. This is how a `quality` panel slots into the existing scrape playground.

## CLI / corpus

```bash
pnpm grade https://example.com --target=local      # terminal quality report
pnpm build:demo                                    # grade offline fixtures -> STATE-OF-QUALITY.md
pnpm corpus urls.txt --target=cloud                # live: scrape + grade a list of URLs
```

## Develop

```bash
pnpm install
pnpm test        # pure scoring + React components (jsdom) + e2e
pnpm e2e
pnpm typecheck
pnpm build
```

Built test-first, e2e after every commit. See the git log.

## Layout

```
src/
  index.ts        public API: grade / scrapeUrl / judge / leaderboard + types
  scoring/        pure quality metrics + the grade(doc) aggregator (fully unit-tested)
  harness/        scrapeUrl (thin fetch convenience)
  judge.ts        anchored LLM overlay (injectable, graceful)
  leaderboard.ts  corpus ranking / failure modes
  cli.ts          terminal report
  ui/             scrape playground + QualityPanel (report card, diff theater)
  demo/           offline fixtures + generated data + STATE-OF-QUALITY.md
```
