# Firecrawl — what I built & fixed

> This is a **portfolio branch** on my fork. It collects what I made while going deep on Firecrawl's
> codebase and v2 API — **two example apps**, **two root-caused bug fixes**, and the systems
> understanding behind them. Each artifact lives on its own focused branch; this page links and runs
> them. Nothing was opened as a PR against upstream — it all lives on my fork.

**Fork:** `github.com/xbt-a4224j/firecrawl`

---

## Quick access

| Artifact | What it is | Branch | One-liner |
|---|---|---|---|
| **change-feed** | "RSS for anything" — live change monitor on `changeTracking` | [`example-change-feed`](https://github.com/xbt-a4224j/firecrawl/tree/example-change-feed/examples/change-feed) | `pnpm dev` |
| **scrape-quality** | LLM-readiness score for a scrape (`grade(doc)`) | [`scrape-quality`](https://github.com/xbt-a4224j/firecrawl/tree/scrape-quality/examples/scrape-quality) | `pnpm grade <url>` |
| **Zod v4 fix** (issue 3300) | v4 schema silently dropped → empty extraction | [`fix/3300-zod-scrape-schema`](https://github.com/xbt-a4224j/firecrawl/tree/fix/3300-zod-scrape-schema) | `npx jest scrape-json-schema` |
| **glue fix** (issue 3583) | adjacent `<button>`/`<label>` glued in HTML→md | [`fix/3583-inline-glue`](https://github.com/xbt-a4224j/firecrawl/tree/fix/3583-inline-glue) | `npx jest html-to-markdown -t "issue 3583"` |
| **🎮 API playground** | interactive, no-key explainer for every v2 endpoint + a Schema Lab + a sync-vs-async walkthrough | this branch (`playground.html`) | **[▶ open it live](https://raw.githack.com/xbt-a4224j/firecrawl/portfolio/playground.html)** |

---

## The playground

A self-contained, **no-API-key** playground I built to internalize the v2 surface — and make it teachable.
**[▶ Open it live](https://raw.githack.com/xbt-a4224j/firecrawl/portfolio/playground.html)** (renders straight
from this branch; or clone and open `playground.html`).

- **Every endpoint** — scrape / map / search / crawl / batch / extract / agent / monitor — with editable
  request bodies and realistic responses, plus an annotated table of every key parameter.
- **A Schema Lab** — edit a JSON Schema, press *Extract*, and see the structured output it produces; it also
  walks the **Zod v4 → JSON Schema #3300 trap** that the fix above resolves.
- **A sync-vs-async explainer** — step through `/scrape` returning a `Document` inline vs `/extract` minting a
  `uuidv7`, saving `status:"processing"` to Redis, and handing back an `id` you poll — grounded in the real
  `extractController`.

---

## 1. change-feed — "RSS for anything"

A live change-monitor on Firecrawl's hosted `changeTracking`. Every ping diffs each page against
Firecrawl's **server-side baseline store** and tells you what *meaningfully* changed — **🔴** real
change, **🟡** churn (vote counts, timestamps), **⚪** stable — not a raw diff.

![change-feed live monitor: a price page goes red, Hacker News stays amber-muted, Wikipedia stays green](assets/change-feed-live-monitor.gif)

*Three real public pages, live: price page → 🔴 (`$74,092 → $74,081`), Hacker News → 🟡 (vote churn,
muted), Wikipedia → ⚪. Each lane shows the server baseline timestamp it diffed against + the credits the
ping cost.*

```bash
git clone -b example-change-feed https://github.com/xbt-a4224j/firecrawl
cd firecrawl/examples/change-feed && pnpm install
export FIRECRAWL_API_KEY=fc-...      # cloud key — changeTracking is hosted
pnpm dev                             # swimlane dashboard → http://localhost:5173
# or CLI:  pnpm watch <url> <url> --diff
pnpm test                            # 20 tests, no network (injected scrape fn)
```

**Senior signals:** signal-vs-noise is an *externalized, tunable prompt*; the core `watchUrls()` is pure
+ dependency-injected (20 offline tests); results carry the real server baseline timestamp so they're
verifiable, not spoofable; the key stays server-side behind `/api/check`; bounded-concurrency pool with
per-URL isolation.

---

## 2. scrape-quality — an LLM-readiness score for a scrape

A pure `grade(doc)` that scores how usable a scrape result is for an LLM and drops onto an existing
`scrape()` call — think `scrape(...).quality`.

```bash
git clone -b scrape-quality https://github.com/xbt-a4224j/firecrawl
cd firecrawl/examples/scrape-quality && pnpm install
pnpm dev                             # playground: tweak config, watch the grade move
pnpm grade <url>                     # terminal quality report
pnpm test
```

```ts
const doc = await firecrawl.scrape(url, { formats: ["markdown", "html"] });
const quality = grade(doc);
quality.rating;     // "C"
quality.findings;   // [{ code: "INLINE_GLUE", severity: "high", evidence: "FunktionalFunktional" }, ...]
```

**Senior signals:** turns scrape quality into a *measurable, gated* signal (today's success gate just
means "markdown isn't empty"); correctness dominates (a high-severity finding caps the grade); honest
framing that the heuristics need golden-set calibration — which is the evals work itself. Catches both
fixes below on real input.

---

## 3. Fix — Zod v4 schema silently dropped → empty extraction (issue 3300)

`scrape()` with a **Zod v4** schema in `formats[].json` returned an **empty** JSON Schema, so the API
had nothing to extract and `result.json` came back undefined. (Zod v3 worked — isolating it to v4.)

**Root cause:** the SDK's `tryZodV4Conversion` reflected `toJSONSchema` off the prototype chain, but in
Zod v4 that's a **module-level export** (`z.toJSONSchema`), not a class method — so the lookup missed
and silently fell through to the v3-only `zod-to-json-schema`, which can't read v4's `_zod` internals
and emitted a contentless stub. **Fix:** call zod@3.25's `zod/v4` `toJSONSchema` directly (+ raise the
zod floor to `^3.25.0`). The two open community PRs both miss this.

```bash
git clone -b fix/3300-zod-scrape-schema https://github.com/xbt-a4224j/firecrawl
cd firecrawl/apps/js-sdk/firecrawl && pnpm install
npx jest scrape-json-schema          # v3 control + v4 repro + passthrough → green
```

---

## 4. Fix — adjacent `<button>`/`<label>` glued in HTML→markdown (issue 3583)

CMP cookie widgets render options as adjacent `<button>`/`<label>` elements; treated as inline, siblings
glued into one token (`"FunktionalFunktional"`), corrupting the markdown for downstream LLMs.

**The bug spans backends** — Firecrawl has three HTML→markdown converters and I checked all of them:

| Converter | Language | Glued? |
|---|---|---|
| Embedded library (koffi/dylib) | **Go** | yes |
| HTTP microservice | **Go** | yes |
| Turndown fallback | **TS/JS** | yes |

**Fix:** a block-level rule for `button`/`label` in **both** the Go converter and Turndown, so siblings
separate while genuine inline (`<b>`, `<span>`) stays on one line. Then **verified end-to-end** through
the Rust stages around the converter (`transformHtml` preserves the boundary; `postProcessMarkdown`
provably can't un-glue — which is why the fix has to live in the converter). The regression test's inline
guard is **backend-agnostic**, so it guards every converter.

```bash
git clone -b fix/3583-inline-glue https://github.com/xbt-a4224j/firecrawl
cd firecrawl/apps/api && pnpm install
npx jest html-to-markdown -t "issue 3583"     # green on Go AND Turndown
```

---

## The scrape pipeline, accurately

Mapping this out was half the work (and corrects the common belief that a markdown converter is Rust):

- **Fetch / engines** — how a URL is fetched (fetch, Playwright, fire-engine/CDP, …); Rust's
  `engpicker` chooses. *(These are the "fetchers" — a different layer from converters.)*
- **Clean** — `transformHtml` (**Rust**): rawHTML → cleaned HTML.
- **Convert** — HTML → markdown by embedded **Go** lib, **Go** HTTP microservice, or **Turndown** (TS).
  *No Rust converter exists* — this is where #3583 lived.
- **Post-process** — `postProcessMarkdown` (**Rust**): normalize markdown.
- **Extract** — `performLLMExtract` downstream — where #3300's empty schema bit.

So **Rust** does cleaning, post-processing, extraction, PDF/sitemap, and engine-selection; the markdown
**conversion** is Go (×2) or Turndown. Both fixes sit precisely where the bug is in this chain.

---

## How I worked

- **Test-first.** Both fixes are a red regression test then the fix; both builds are unit-tested with
  dependency injection so they run offline.
- **Verified across backends / the full pipeline**, not just the first path that passed.
- **Focused branches** — one clean change each.
- **Clean room** — everything on my fork; upstream never pushed to, no PRs opened.
