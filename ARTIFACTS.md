# Firecrawl — what I built & fixed

I spent time going deep on Firecrawl's codebase and v2 API. This page is the result: **two example
apps built on the v2 API**, **two bugs I root-caused and fixed** (red→green, against the real test
suite), and the **systems understanding** behind them. Every branch is self-contained and runs on its
own. Nothing here was opened as a PR against upstream — it all lives on my fork.

**Fork:** `github.com/xbt-a4224j/firecrawl`

| Artifact | Type | Branch |
|---|---|---|
| **change-feed** — RSS for anything | build (v2 API) | [`example-change-feed`](https://github.com/xbt-a4224j/firecrawl/tree/example-change-feed/examples/change-feed) |
| **scrape-quality** — LLM-readiness score | build (v2 API) | [`scrape-quality`](https://github.com/xbt-a4224j/firecrawl/tree/scrape-quality/examples/scrape-quality) |
| **Zod v4 schema dropped** (issue 3300) | fix (SDK) | [`fix/3300-zod-scrape-schema`](https://github.com/xbt-a4224j/firecrawl/tree/fix/3300-zod-scrape-schema) |
| **`<button>`/`<label>` glued** (issue 3583) | fix (API) | [`fix/3583-inline-glue`](https://github.com/xbt-a4224j/firecrawl/tree/fix/3583-inline-glue) |

---

## 1. change-feed — "RSS for anything"

A live change-monitor built on Firecrawl's hosted `changeTracking`. Point it at any pages; every ping
diffs each one against Firecrawl's **server-side baseline store** and tells you what *meaningfully*
changed — **🔴 red** for a real change, **🟡 amber** for churn (vote counts, timestamps, reordering),
**⚪ green** for stable — instead of a raw text diff.

![change-feed live monitor catching a real price change while muting Hacker News churn](assets/change-feed-live-monitor.gif)

*Three real public pages, live: a price page → 🔴 (caught `$74,092 → $74,081`), Hacker News → 🟡
(vote-count churn, correctly muted), a Wikipedia article → ⚪. Each lane shows the server baseline
timestamp it diffed against and the credits the ping cost.*

**Run it**
```bash
cd examples/change-feed && pnpm install
export FIRECRAWL_API_KEY=fc-...        # cloud key — changeTracking is hosted
pnpm dev                               # the swimlane dashboard
pnpm watch <urls> --diff               # or the CLI
```

**What makes it senior, not a toy**
- **Signal vs. noise is the product.** The "is this change meaningful?" decision is an *externalized,
  tunable prompt*, not buried logic — I tuned it so a price move is always significant but vote/comment
  counts are muted, and demonstrated the difference live on real sites.
- **Pure, dependency-injected core.** `watchUrls()` takes the scrape function as a parameter, so the
  whole thing is unit-tested offline with an injected stub (20 tests, no network). The real
  `firecrawl.scrape` is wired in only at the edges (CLI / dev-server).
- **Verifiable, not spoofable.** Every result surfaces the server's real `previousScrapeAt` baseline
  timestamp + the raw diff, so a reader can independently confirm it on the live URL.
- **Cost-honest + key-safe.** Each run prints the credits it spent and what's left; the dashboard keeps
  the API key server-side behind a tiny `/api/check` route so it never reaches the browser.
- **Bounded concurrency** via a small worker-pool (`mapPool`), per-URL `try/catch` isolation so one
  failing site degrades to one error row instead of killing the run.

---

## 2. scrape-quality — an LLM-readiness score for a scrape

A pure `grade(doc)` that scores how usable a Firecrawl scrape result is for an LLM and drops straight
onto an existing `scrape()` call — think `scrape(...).quality`.

```ts
const doc = await firecrawl.scrape(url, { formats: ["markdown", "html"] });
const quality = grade(doc);
quality.rating;     // "C"
quality.findings;   // [{ code: "INLINE_GLUE", severity: "high", evidence: "FunktionalFunktional" }, ...]
quality.dimensions; // { structureFidelity: 100, boilerplateNoise: 29, tokenEfficiency: ... }
```

It compares the `markdown` against the `html` from the same scrape (lost structure = lost fidelity)
across delineated, **config-driven** metrics, and ships a playground UI, a corpus leaderboard, and an
anchored LLM judge.

**Run it**
```bash
cd examples/scrape-quality && pnpm install
pnpm dev                 # playground: tweak the scrape config, watch the grade move
pnpm grade <url>         # terminal quality report
```

**Why it matters**
- Today Firecrawl's success gate is a liveness check — `isLongEnough` literally means "the markdown
  isn't empty" — so fidelity regressions ship as `200 success`. This turns scrape quality into a
  **measurable, gated signal**, and it catches issues **3583 and 3300** on real input.
- **Correctness dominates:** a high-severity finding caps the grade, so defects can't hide behind good
  dimensions.
- **Honest framing:** the heuristics aren't calibrated yet — the real eval work is a golden-set. I say
  so in the README rather than overclaiming. (That calibration is exactly the kind of evals work the
  role owns.)

---

## 3. Fix — Zod v4 schema silently dropped → empty extraction (issue 3300)

**Symptom.** `scrape()` with a **Zod v4** schema in `formats[].json` returned an **empty** JSON Schema,
so the API had no fields to extract and `result.json` came back undefined. Zod v3 worked — which
isolated the bug to v4.

**Root cause.** The SDK's `tryZodV4Conversion` reflected `toJSONSchema` off the schema's prototype
chain. But in Zod **v4** that's a **module-level export** (`z.toJSONSchema`), not a method on the schema
class — so the lookup always missed and silently fell through to the v3-only `zod-to-json-schema`
library, which can't read v4's `_zod` internals and emitted a contentless stub
(`{"$schema": ".../draft-07#"}`).

**Fix.** Call zod@3.25's `zod/v4` `toJSONSchema` export directly, and raise the declared zod floor to
`^3.25.0` (the `zod/v4` subpath only exists there). ~10 lines.

**Depth signal.** The two open community PRs both miss this: one re-adds a redundant conversion call and
never touches the v4 converter; the other patches the converter but resolves `zod` from the package's
main entry, which on the 3.25 bridge is v3 (v4 lives at the subpath). My branch adds a **regression
test** (v3 control + v4 repro + plain-JSON-Schema passthrough), then the fix.

- **Verify:** `cd apps/js-sdk/firecrawl && npx jest scrape-json-schema` → green.

---

## 4. Fix — adjacent `<button>`/`<label>` glued in HTML→markdown (issue 3583)

**Symptom.** Cookie-consent (CMP) widgets render options as adjacent `<button>`/`<label>` elements.
They were treated as *inline*, so siblings glued into one token — `"FunktionalFunktional"` — corrupting
the markdown fed to downstream LLMs.

**The senior part: it spans backends.** Firecrawl has **three** HTML→markdown converters, and I checked
all of them rather than fixing the first:

| Converter | Language | Glued the buttons? |
|---|---|---|
| Embedded library (koffi/dylib) | **Go** | yes |
| HTTP microservice | **Go** | (same library) |
| Turndown fallback | **TS/JS** | yes |

**Fix.** A block-level rule for `button`/`label` in **both** the Go converter (a rule in the cgo
wrapper) and the Turndown fallback, so siblings separate with a blank line — while genuine inline
formatting (`<b>`, `<span>`) stays on one line (so "Firecrawl" never splits).

**Then verified end-to-end through the real pipeline**, including the Rust stages around the converter:
```
rawHTML → [Rust transformHtml]      → button/label boundary preserved
        → [Go converter + fix]      → "Funktional\n\nFunktional" ✓
        → [Rust postProcessMarkdown]→ unchanged (and provably can't un-glue — which is why the
                                       fix has to live in the converter, where I put it)
```

The regression test's inline guard is **backend-agnostic** (the Go parser emits `**Fire** **crawl**`,
Turndown `**Fire****crawl**`; both keep it inline), so it guards every converter, not just one.

- **Verify:** `cd apps/api && npx jest html-to-markdown -t "issue 3583"` → green on Go *and* Turndown.

---

## The scrape pipeline, accurately

Mapping this out was half the work — and it corrects a common misconception (that one of the markdown
converters is Rust):

- **Fetch / engines** — how a URL is fetched (plain fetch, Playwright, fire-engine/CDP, …). Rust's
  `engpicker` chooses among them. *(These are the "fetchers" — a different layer from converters.)*
- **Clean** — `transformHtml` (**Rust**, `@mendable/firecrawl-rs`): rawHTML → cleaned HTML.
- **Convert** — HTML → markdown, by one of: embedded **Go** lib, **Go** HTTP microservice, or
  **Turndown** (TS) fallback. *No Rust converter exists* — this is where #3583 lived.
- **Post-process** — `postProcessMarkdown` (**Rust**): normalize the markdown.
- **Extract** — `performLLMExtract` downstream (this is where #3300's empty schema bit).

So **Rust** does cleaning, post-processing, extraction, PDF/sitemap, and engine-selection; the markdown
**conversion** itself is Go (×2) or Turndown. Both of my fixes sit precisely where the bug is in this
chain — the converter (#3583) and the SDK's schema conversion before the extract call (#3300).

---

## How I worked

- **Test-first.** Both fixes are a red regression test followed by the fix; both builds are unit-tested
  with dependency injection so they run offline.
- **Verified across backends / the full pipeline**, not just the first path that passed.
- **Focused branches.** Two builds, two fixes, one branch each — each reads as a single clean change.
- **Clean room.** Everything is on my fork; upstream was never pushed to and no PRs were opened.
