import { scrapeRaw, scrapeTimeout } from "./lib";
import { idmux, Identity, describeIf, HAS_PLAYWRIGHT } from "../lib";

/**
 * E2E for the `__experimental_catch_silent_failures` flag, framed as a labeled eval dataset:
 *
 *   TRUE_POSITIVES  — known silent 200s (/scrape returns success:true on a bot wall / paywall /
 *                     login or consent gate / error or placeholder page). Measures RECALL: how many
 *                     the flag catches. Recall is NOT 100% — this is the multi-engine waterfall, so a
 *                     URL only fails when EVERY engine yields junk our signatures match, and signature
 *                     -less junk (e.g. a bare thin shell) is an honest miss. So we assert a floor.
 *
 *   FALSE_POSITIVES — known-GOOD pages, several deliberate near-misses (an article *about* Cloudflare,
 *                     a page that *embeds* a reCAPTCHA widget, real articles behind a cookie banner).
 *                     Measures PRECISION. This is the HARD gate: a content-quality check that breaks a
 *                     real page is broken, full stop. The flag must catch ZERO of these.
 *
 * Live + best-effort: real sites drift, so the recall floor is conservative; the precision gate is exact.
 */

type Row = { url: string; note: string };

// success:true on junk → the flag should reject (recall).
const TRUE_POSITIVES: Row[] = [
  { url: "https://www.tiktok.com/@nasa", note: "JS shell" },
  { url: "https://excalidraw.com", note: "JS shell" },
  { url: "https://vscode.dev", note: "JS shell" },
  {
    url: "https://opencorporates.com/companies/gb/00000006",
    note: "bot wall (Cloudflare)",
  },
  {
    url: "https://www.sedarplus.ca/csa-party/party/document.html?partyType=issuer",
    note: "bot wall (PerimeterX)",
  },
  {
    url: "https://www.bizapedia.com/companies/apple-inc.html",
    note: "bot wall (reCAPTCHA)",
  },
  {
    url: "https://www.tandfonline.com/doi/full/10.1080/00207543.2019.1660828",
    note: "paywall",
  },
  {
    url: "https://academic.oup.com/bioinformatics/article/35/1/1/5047759",
    note: "paywall",
  },
  { url: "https://www.academia.edu/12345678/Test_Paper", note: "signup gate" },
  { url: "https://www.elmundo.es", note: "consent/subscribe gate" },
  { url: "https://www.grubhub.com/search", note: "cookie gate" },
  { url: "https://www.facebook.com/zuck", note: "error shell" },
  { url: "https://www.lemonde.fr/economie/", note: "error shell" },
  { url: "https://www.quora.com/What-is-web-scraping", note: "soft error" },
  { url: "https://www.quora.com/profile/Adam-DAngelo", note: "soft error" },
  { url: "https://www.target.com/s?searchTerm=laptop", note: "placeholder" },
];

// real, good content → the flag must NOT reject (precision). Many are deliberate near-misses.
const FALSE_POSITIVES: Row[] = [
  {
    url: "https://example.com",
    note: "tiny real page (same length as a junk shell)",
  },
  { url: "https://jestjs.io", note: "docs" },
  { url: "https://en.wikipedia.org/wiki/Web_scraping", note: "long article" },
  {
    url: "https://en.wikipedia.org/wiki/Cloudflare",
    note: "article ABOUT Cloudflare (BOT_WALL near-miss)",
  },
  {
    url: "https://en.wikipedia.org/wiki/CAPTCHA",
    note: "article ABOUT CAPTCHAs (BOT_WALL near-miss)",
  },
  { url: "https://en.wikipedia.org/wiki/HTTP", note: "long article" },
  { url: "https://docs.firecrawl.dev/introduction", note: "docs" },
  {
    url: "https://www.gnu.org/licenses/gpl-3.0.en.html",
    note: "long static text",
  },
  { url: "https://developer.mozilla.org/en-US/docs/Web/HTTP", note: "docs" },
  { url: "https://www.rfc-editor.org/rfc/rfc2616", note: "plain-text RFC" },
  { url: "https://www.rfc-editor.org/rfc/rfc7231", note: "plain-text RFC" },
  { url: "https://httpbin.org/html", note: "static HTML article" },
  { url: "https://www.python.org", note: "homepage with real content" },
  { url: "https://docs.python.org/3/tutorial/index.html", note: "docs" },
  {
    url: "https://www.iana.org/help/example-domains",
    note: "short institutional page",
  },
  { url: "https://news.ycombinator.com", note: "link-dense but real content" },
  {
    url: "https://www.w3.org/TR/html52/",
    note: "spec that says 'loading' in prose (PLACEHOLDER near-miss)",
  },
  {
    url: "https://www.statista.com/statistics/272014/global-social-networks-ranked-by-number-of-users/",
    note: "real chart + consent banner (CONSENT near-miss)",
  },
  {
    url: "https://link.springer.com/article/10.1007/s11192-020-03690-4",
    note: "real abstract + cookie banner (GATE near-miss)",
  },
  {
    url: "https://www.lusha.com/company-search/apple/0e3f1a/",
    note: "real page embedding a reCAPTCHA widget (BOT_WALL near-miss)",
  },
];

async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

describeIf(HAS_PLAYWRIGHT)("silent-failure flag (e2e)", () => {
  let identity: Identity;
  beforeAll(async () => {
    identity = await idmux({ name: "silent-failure-e2e", concurrency: 12 });
  });

  const scrapeOnce = async (url: string, flag: boolean) => {
    const res = await scrapeRaw(
      {
        url,
        formats: ["markdown"],
        timeout: scrapeTimeout,
        __experimental_catch_silent_failures: flag,
      } as Parameters<typeof scrapeRaw>[0],
      identity,
    );
    return res.body?.success === true;
  };

  const measure = (rows: Row[]) =>
    pool(rows, 8, async r => {
      const offOk = await scrapeOnce(r.url, false);
      const onOk = await scrapeOnce(r.url, true);
      return { ...r, offOk, onOk };
    });

  it(
    "recall on TRUE_POSITIVES + zero regressions on FALSE_POSITIVES",
    async () => {
      const tp = await measure(TRUE_POSITIVES);
      const fp = await measure(FALSE_POSITIVES);

      const acceptedOff = tp.filter(r => r.offOk).length; // the bug: junk accepted with flag off
      const caught = tp.filter(r => r.offOk && !r.onOk).length; // recall
      const regressions = fp.filter(r => r.offOk && !r.onOk); // precision violations — must be empty

      const show = (rows: typeof tp, kind: "junk" | "good") =>
        // eslint-disable-next-line no-console
        console.table(
          rows.map(r => ({
            site: r.url.replace(/^https?:\/\//, "").slice(0, 46),
            note: r.note,
            off: r.offOk ? "success" : "fail",
            on: r.onOk ? "success" : "fail",
            verdict:
              kind === "junk"
                ? r.offOk && !r.onOk
                  ? "caught ✓"
                  : "missed"
                : r.offOk && !r.onOk
                  ? "REGRESSION ✗"
                  : "kept ✓",
          })),
        );
      show(tp, "junk");
      show(fp, "good");
      // eslint-disable-next-line no-console
      console.log(
        `RECALL: caught ${caught}/${acceptedOff} silent 200s (of ${tp.length}) · PRECISION: broke ${regressions.length}/${fp.length} good pages`,
      );

      // The bug exists: silent 200s are accepted with the flag off.
      expect(acceptedOff).toBeGreaterThanOrEqual(13);
      // Recall floor — signatures only (no length heuristic), so a conservative chunk, drift-proof.
      expect(caught).toBeGreaterThanOrEqual(4);
      // THE PRECISION GATE: the flag breaks ZERO known-good pages. Exact.
      expect(regressions.map(r => r.url)).toEqual([]);
    },
    scrapeTimeout * 20,
  );
});
