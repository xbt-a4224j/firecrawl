import { quality, type QualityInput } from "./quality";

/**
 * Win-condition gate. Two halves:
 *   POSITIVES — minimal Documents shaped after real, documented silent-200s: quality() must flag
 *               each with the right finding + a failing grade (issue # cited).
 *   NEGATIVES — near-miss content that naive heuristics would false-positive on: real i18n text,
 *               a page *about* Cloudflare, an article with a normal footer, a short-but-real page.
 *               These guard the false positives — they're what makes the signal trustworthy.
 *
 * Deterministic + offline: this is the pass/fail gate. The ~40-URL live corpus is the demo.
 */

const codes = (r: ReturnType<typeof quality>) => r.findings.map(f => f.code);

// ── POSITIVES ───────────────────────────────────────────────────────────────────────────────────

// #385 — "pageStatusCode is 200, but no content is returned"
const EMPTY: QualityInput = {
  markdown: "",
  html: "<body></body>",
  rawHtml: "<body></body>",
};

// #1345 / #1297 — fetched a JS shell; page never hydrated (huge scripty HTML, ~no text)
const JS_SHELL: QualityInput = {
  markdown: "Loading…",
  html: '<div id="root"></div>',
  rawHtml:
    "<!doctype html><html><head>" +
    '<script src="/static/js/vendor.chunk.js"></script>'.repeat(12) +
    '</head><body><div id="root">Loading…</div>' +
    "x".repeat(40000) +
    "</body></html>",
};

// #1142 / #1277 / #547 — wrong charset → authentic mojibake (UTF-8 bytes decoded as Latin-1)
const GARBLED: QualityInput = {
  markdown: Buffer.from(
    "こんにちは、世界。製品の説明です。Größe café déjà",
    "utf8",
  )
    .toString("latin1")
    .repeat(4),
};

// #2350 / #495 — anti-bot interstitial returned with a 200
const SOFT_BOT_WALL: QualityInput = {
  markdown:
    "Checking your browser before accessing the site. Please enable JavaScript and cookies to continue.",
  html: "<title>Just a moment…</title><div>Verify you are human</div>",
};

// #284 / #288 — onlyMainContent leaked: nav/cookie/footer chrome dominates, ~one line of content
const HIGH_BOILERPLATE: QualityInput = {
  markdown: [
    "[Home](/) [Products](/p) [Pricing](/pr) [About](/a) [Contact](/c) [Login](/l) [Sign up](/s)",
    "We use cookies. Accept all · Privacy Policy · Cookie Policy · Manage preferences",
    "Subscribe to our newsletter. Follow us on social.",
    "© 2026 Acme Inc. All rights reserved. Terms · Sitemap · Careers",
    "Widget.",
  ].join("\n\n"),
  html: "<nav></nav><main><p>Widget.</p></main><footer></footer>",
};

// ── NEGATIVES (false-positive guards) ─────────────────────────────────────────────────────────────

// real French/German — isolated accents, NOT mojibake runs → must NOT be GARBLED
const LEGIT_I18N: QualityInput = {
  markdown:
    "La société française a développé une méthode très élégante " +
    "pour résumer des données. L'idée générale était de créer un système " +
    "fiable et performant. Café, thé, crème brûlée — et la Größe du résultat.",
};

// a real article ABOUT Cloudflare/CAPTCHA (weak terms, long, no interstitial copy) → NOT a bot wall
const CLOUDFLARE_ARTICLE: QualityInput = {
  markdown:
    "Cloudflare is a widely used CDN and security provider. Many sites put Cloudflare in front of " +
    "their origin to mitigate DDoS attacks, and some present a CAPTCHA challenge to suspected bots. " +
    "In this post we explain how a CAPTCHA actually works, why an access denied page sometimes appears, " +
    "and how to configure rules so that legitimate crawlers are not blocked by mistake.",
  html: "<article>...</article>",
};

// regression: a real 404 page whose body links blog.cloudflare.com/images/404.svg — the bare term
// "cloudflare" must NOT trip SOFT_BOT_WALL (found by the live corpus run, 2026-06)
const NOT_FOUND_404: QualityInput = {
  markdown:
    "Page not found\n\nSorry, we can't find the page you are looking for.\n\n" +
    "Error Code: 404\n\n![](https://blog.cloudflare.com/images/404.svg)",
};

// regression: a LONG article that quotes real interstitial copy ("DDoS protection", "Attention
// Required", "Ray ID", "checking your browser") must NOT be flagged — the live grid caught the
// Wikipedia "Cloudflare" article (162KB) tripping on "ddos protection". An interstitial is tiny;
// an article is not. (2026-06)
const LONG_ARTICLE_ABOUT_BOT_WALLS: QualityInput = {
  markdown: (
    "# Cloudflare\n\nCloudflare, Inc. is an American company that provides content delivery " +
    "network services, cloud cybersecurity, DDoS protection, and ICANN-accredited domain " +
    "registration services. When a visitor is challenged, the block page is titled " +
    '"Attention Required! | Cloudflare" and shows a Cloudflare Ray ID at the bottom. The classic ' +
    'interstitial reads "Checking your browser before accessing the site." Researchers studying ' +
    "anti-bot systems often quote this copy verbatim when explaining how DDoS protection and " +
    "browser-integrity checks decide whether to verify you are human. "
  ).repeat(4),
};

// a real long article with an ordinary footer → footer markers exist but content dominates → NOT boilerplate
const ARTICLE_WITH_FOOTER: QualityInput = {
  markdown:
    "# The history of the espresso machine\n\n" +
    "The espresso machine was invented in Italy in the early twentieth century. " +
    "Angelo Moriondo patented an early design, but it was Luigi Bezzera who refined it for cafes. " +
    "Over the following decades the lever machine, the pump machine, and finally the automatic machine " +
    "each changed how coffee was brewed at scale. Today specialty roasters dial in pressure, temperature, " +
    "and grind size to extract a balanced shot, and the craft continues to evolve across the world.\n\n" +
    "We use cookies. Privacy Policy. Terms. © 2026 Coffee Co. Subscribe to our newsletter.",
};

// short, but genuinely rendered content + analytics scripts → NOT a JS shell, NOT empty
const LEGIT_SHORT: QualityInput = {
  markdown:
    "# Acme\n\nAcme builds reliable widgets for modern teams. Start a free trial today and ship faster.",
  html: "<h1>Acme</h1><p>Acme builds reliable widgets...</p>",
  rawHtml:
    "<!doctype html><html><head>" +
    '<script src="https://www.googletagmanager.com/gtag/js"></script>'.repeat(
      5,
    ) +
    "</head><body><h1>Acme</h1><p>Acme builds reliable widgets for modern teams. " +
    "Start a free trial today and ship faster.</p>" +
    " ".repeat(6000) +
    "</body></html>",
};

// clean, structured docs page (e.g. jestjs.io) — must grade A with no findings
const CLEAN: QualityInput = {
  markdown:
    "# Getting Started\n\nJest is a delightful JavaScript Testing Framework with a focus on simplicity.\n\n" +
    "## Installation\n\n```bash\nnpm install --save-dev jest\n```\n\n" +
    "## Writing your first test\n\nLet's write a test for a function that adds two numbers. " +
    "Create a `sum.js` file, then add the test. The matcher `toBe` uses `Object.is` for exact equality.\n\n" +
    "- Zero config for most projects\n- Snapshots for large objects\n- Isolated, parallelized runs\n",
};

describe("quality() — positives: flags every documented silent-200", () => {
  test("#385 empty body -> EMPTY, grade F", () => {
    const r = quality(EMPTY);
    expect(codes(r)).toContain("EMPTY");
    expect(r.rating).toBe("F");
    expect(r.score).toBeLessThan(40);
  });

  test("#1345 JS shell -> JS_SHELL (high) suggesting a browser engine, grade F", () => {
    const r = quality(JS_SHELL);
    const f = r.findings.find(x => x.code === "JS_SHELL")!;
    expect(f.severity).toBe("high");
    expect(["chrome-cdp", "playwright"]).toContain(f.suggestedFix?.engine);
    expect(r.rating).toBe("F");
  });

  test("#1142 authentic mojibake -> GARBLED, grade F", () => {
    const r = quality(GARBLED);
    expect(codes(r)).toContain("GARBLED");
    expect(r.rating).toBe("F");
  });

  test("#2350 anti-bot interstitial -> SOFT_BOT_WALL suggesting a stealth proxy, grade F", () => {
    const r = quality(SOFT_BOT_WALL);
    const f = r.findings.find(x => x.code === "SOFT_BOT_WALL")!;
    expect(f.suggestedFix?.proxy).toBe("stealth");
    expect(f.suggestedFix?.engine).toBeUndefined(); // engine != proxy
    expect(r.rating).toBe("F");
  });

  test("#288 boilerplate-dominated -> HIGH_BOILERPLATE (medium), NOT a hard F", () => {
    const r = quality(HIGH_BOILERPLATE);
    expect(codes(r)).toContain("HIGH_BOILERPLATE");
    expect(r.findings.find(x => x.code === "HIGH_BOILERPLATE")!.severity).toBe(
      "medium",
    );
    expect(r.rating).not.toBe("F");
  });

  test("every finding cites the issue(s) it addresses + carries evidence and a hint", () => {
    for (const input of [
      EMPTY,
      JS_SHELL,
      GARBLED,
      SOFT_BOT_WALL,
      HIGH_BOILERPLATE,
    ]) {
      for (const f of quality(input).findings) {
        expect(f.issues.length).toBeGreaterThan(0);
        expect(f.evidence.length).toBeGreaterThan(0);
        expect(f.hint.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("quality() — negatives: no false positives on near-miss content", () => {
  test("real French/German (isolated accents) is NOT flagged GARBLED", () => {
    expect(codes(quality(LEGIT_I18N))).not.toContain("GARBLED");
  });

  test("an article ABOUT Cloudflare/CAPTCHA is NOT flagged SOFT_BOT_WALL", () => {
    expect(codes(quality(CLOUDFLARE_ARTICLE))).not.toContain("SOFT_BOT_WALL");
  });

  test("a 404 page that incidentally links a cloudflare image is NOT flagged SOFT_BOT_WALL", () => {
    expect(codes(quality(NOT_FOUND_404))).not.toContain("SOFT_BOT_WALL");
  });

  test("a long article that QUOTES interstitial copy is NOT flagged SOFT_BOT_WALL (length guard)", () => {
    expect(LONG_ARTICLE_ABOUT_BOT_WALLS.markdown!.length).toBeGreaterThan(1500);
    expect(codes(quality(LONG_ARTICLE_ABOUT_BOT_WALLS))).not.toContain(
      "SOFT_BOT_WALL",
    );
  });

  test("a real article with a normal footer is NOT flagged HIGH_BOILERPLATE", () => {
    expect(codes(quality(ARTICLE_WITH_FOOTER))).not.toContain(
      "HIGH_BOILERPLATE",
    );
  });

  test("a short-but-rendered page with analytics is NOT flagged JS_SHELL or EMPTY", () => {
    const c = codes(quality(LEGIT_SHORT));
    expect(c).not.toContain("JS_SHELL");
    expect(c).not.toContain("EMPTY");
  });

  test("clean docs page -> no findings, grade A", () => {
    const r = quality(CLEAN);
    expect(r.findings).toHaveLength(0);
    expect(r.rating).toBe("A");
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
});

describe("quality() — invariants", () => {
  test("one high-severity finding caps the grade at F (not averaged away)", () => {
    expect(quality(EMPTY).rating).toBe("F");
  });

  test("cheap enough to run inline — measured per-call latency on a ~1MB doc", () => {
    const big: QualityInput = {
      markdown: "Lorem ipsum dolor sit amet. ".repeat(40000),
      html: "<p>x</p>".repeat(40000),
      rawHtml: "<p>x</p>".repeat(40000),
    };
    quality(big); // warm up
    const N = 50;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) quality(big);
    const perCall = (performance.now() - t0) / N;
    // eslint-disable-next-line no-console
    console.log(
      `quality() on a ${(big.markdown!.length / 1024 / 1024).toFixed(1)}MB doc: ${perCall.toFixed(3)} ms/call`,
    );
    expect(perCall).toBeLessThan(50); // generous CI bound; the real number is logged above
  });
});
