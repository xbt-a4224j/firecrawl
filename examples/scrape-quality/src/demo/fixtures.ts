/**
 * Offline corpus fixtures — representative hard pages across the JD's long-tail categories, with
 * captured (markdown, html) pairs so the leaderboard/demo render deterministically with no network.
 * `gradeFixtures()` runs the real grader over them. The live counterpart is scripts/run-corpus
 * (scrape + grade against an actual Firecrawl).
 */
import { grade, type QualityReport } from "../scoring/grade";

export interface CorpusFixture {
  url: string;
  category: string;
  note: string;
  markdown: string;
  html: string;
}

export const CORPUS_FIXTURES: CorpusFixture[] = [
  {
    url: "https://docs.example.com/about",
    category: "clean-control",
    note: "well-structured docs page — the good case",
    html:
      "<h1>About</h1><p>We build tools for developers who love clean data and fast APIs.</p>" +
      "<h2>Mission</h2><p>Make the web LLM-ready, one page at a time.</p>",
    markdown:
      "# About\n\nWe build tools for developers who love clean data and fast APIs.\n\n## Mission\n\nMake the web LLM-ready, one page at a time.",
  },
  {
    url: "https://shop.de/",
    category: "cmp-cookie",
    note: "German cookie-consent widget — the #3583 inline-glue trigger",
    html:
      "<button>Funktional</button><button>Funktional</button>" +
      "<div>We use cookies. Accept All. Reject All. Manage Preferences.</div>" +
      "<h1>Welcome</h1><p>Shop our catalog of fine goods today.</p>",
    markdown:
      "FunktionalFunktional\n\nWe use cookies. Accept All. Reject All. Manage Preferences.\n\n# Welcome\n\nShop our catalog of fine goods today.",
  },
  {
    url: "https://example.com/pricing",
    category: "tables",
    note: "pricing table flattened into prose",
    html:
      "<h1>Pricing</h1><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Pro</td><td>$20</td></tr></table>",
    markdown: "# Pricing\n\nPlan Price Pro $20",
  },
  {
    url: "https://docs.example.com/install",
    category: "code-docs",
    note: "code block lost its fence and language hint",
    html: '<h1>Install</h1><pre><code class="language-bash">npm i firecrawl</code></pre>',
    markdown: "# Install\n\nnpm i firecrawl",
  },
  {
    url: "https://app.example.com/",
    category: "spa",
    note: "thin SPA shell — little real content, lots of chrome",
    html: "<div>Loading…</div><nav>Home Menu Navigation</nav>",
    markdown: "Loading…\n\nHome\n\nMenu\n\nNavigation",
  },
  {
    url: "https://news.example.com/article",
    category: "nav-heavy",
    note: "footer/legal boilerplate drowning the content",
    html:
      "<p>One real sentence about the product.</p>" +
      "<footer>© 2026 Acme Inc. All rights reserved. Terms of Service. Privacy Policy.</footer>",
    markdown:
      "One real sentence about the product.\n\n© 2026 Acme Inc. All rights reserved. Terms of Service. Privacy Policy.",
  },
  {
    url: "https://jp.example.com/tokyo",
    category: "i18n-charset",
    note: "non-Latin (CJK) content — control for charset handling",
    html: "<h1>東京</h1><p>これは東京についての記事です。多くの有用な情報が含まれています。</p>",
    markdown: "# 東京\n\nこれは東京についての記事です。多くの有用な情報が含まれています。",
  },
];

/** Grade every offline fixture (no network) — deterministic demo data for the leaderboard. */
export function gradeFixtures(fixtures: CorpusFixture[] = CORPUS_FIXTURES): QualityReport[] {
  return fixtures.map((f) =>
    grade({
      url: f.url,
      markdown: f.markdown,
      html: f.html,
      meta: { config: "fixture", category: f.category },
    }),
  );
}
