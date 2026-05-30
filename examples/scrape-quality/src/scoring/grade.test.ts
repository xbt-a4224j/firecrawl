import { describe, test, expect } from "vitest";
import { grade } from "./grade";
import type { ExtractionIntegrityResult } from "./extractionIntegrity";

const cleanInput = {
  url: "https://example.com",
  html:
    "<h1>Title</h1><p>Some real content here about widgets and gadgets.</p>" +
    "<table><tr><th>a</th></tr><tr><td>1</td></tr></table>",
  markdown: "# Title\n\nSome real content here about widgets and gadgets.\n\n| a |\n|---|\n| 1 |",
};

const badInput = {
  url: "https://shop.de",
  html:
    "<button>Funktional</button><button>Funktional</button>" +
    "<div>Accept All cookies. Manage Preferences.</div><p>Welcome.</p>",
  markdown: "FunktionalFunktional\n\nAccept All cookies. Manage Preferences.\n\nWelcome.",
};

describe("grade (aggregator)", () => {
  test("a clean page scores high with no high-severity findings", () => {
    const result = grade(cleanInput);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.findings.some((f) => f.severity === "high")).toBe(false);
  });

  test("a cookie-wall + glued page scores low and carries the receipts", () => {
    const result = grade(badInput);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain("INLINE_GLUE");
    expect(codes).toContain("HIGH_BOILERPLATE");
    expect(result.score).toBeLessThan(cleanInput ? 90 : 100);
    expect(result.score).toBeLessThan(90);
  });

  test("exposes all five markdown dimensions", () => {
    const result = grade(cleanInput);
    expect(Object.keys(result.dimensions).sort()).toEqual(
      ["boilerplateNoise", "inlineGlue", "structureFidelity", "tablesCode", "tokenEfficiency"].sort(),
    );
  });

  test("folds in extraction integrity when provided", () => {
    const extraction: ExtractionIntegrityResult = {
      score: 25,
      populated: false,
      schemaValid: false,
      deterministic: true,
      findings: [{ code: "EXTRACTION_EMPTY", severity: "high", evidence: "empty on 3/3 runs" }],
    };
    const result = grade({ ...cleanInput, extraction });
    expect(result.dimensions.extractionIntegrity).toBe(25);
    expect(result.findings.map((f) => f.code)).toContain("EXTRACTION_EMPTY");
    expect(result.score).toBeLessThan(grade(cleanInput).score);
  });

  test("computes a score even when extraction is absent (graceful degrade)", () => {
    const result = grade(cleanInput);
    expect(result.dimensions.extractionIntegrity).toBeUndefined();
    expect(result.score).toBeGreaterThan(0);
  });

  test("orders findings by severity (high before medium before low)", () => {
    const result = grade(badInput);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const ranks = result.findings.map((f) => rank[f.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test("emits a serializable QualityReport (round-trips through JSON)", () => {
    const result = grade({ ...cleanInput, meta: { config: "local", latencyMs: 120, statusCode: 200 } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test("carries url, artifacts and meta through", () => {
    const result = grade({ ...cleanInput, screenshot: "https://shot/1.png", meta: { config: "cloud" } });
    expect(result.url).toBe("https://example.com");
    expect(result.artifacts.screenshotUrl).toBe("https://shot/1.png");
    expect(result.meta.config).toBe("cloud");
  });

  test("grades a Firecrawl scrape document directly (seamless)", () => {
    // exactly what `await firecrawl.scrape(url, { formats: ["markdown","html","screenshot"] })` returns
    const doc = {
      markdown: "# Hi\n\nLots of clean content about widgets and gadgets here.",
      html: "<h1>Hi</h1><p>Lots of clean content about widgets and gadgets here.</p>",
      screenshot: "https://shot.png",
      metadata: { statusCode: 200, sourceURL: "https://e.com" },
    };
    const r = grade(doc);
    expect(r.url).toBe("https://e.com");
    expect(r.artifacts.screenshotUrl).toBe("https://shot.png");
    expect(r.meta.statusCode).toBe(200);
    expect(r.score).toBeGreaterThan(0);
  });

  test("a high-severity finding caps the grade at C — correctness dominates", () => {
    // structurally perfect page that nonetheless glues a token: shouldn't read as an A/B
    const input = {
      url: "https://x.de",
      html:
        "<button>Funktional</button><button>Funktional</button>" +
        "<h1>Hi</h1><p>Lots of clean content here about widgets and gadgets and gizmos.</p>",
      markdown:
        "FunktionalFunktional\n\n# Hi\n\nLots of clean content here about widgets and gadgets and gizmos.",
    };
    const r = grade(input);
    expect(r.findings.some((f) => f.severity === "high")).toBe(true);
    expect(r.score).toBeLessThanOrEqual(74); // max C
    expect(["C", "D", "F"]).toContain(r.rating);
  });

  test("rating thresholds are configurable", () => {
    // badInput has a high-severity finding → score capped at 74 (a C by default)
    expect(grade(badInput).rating).toBe("C");
    // lower the B cutoff to 70 and that same 74 reads as a B
    expect(grade(badInput, { config: { rating: { B: 70 } } }).rating).toBe("B");
  });

  test("dimension weights are configurable", () => {
    // a page dinged only by boilerplate noise (no high finding, no ceiling)
    const input = {
      html: "<p>Real content about the product here.</p><nav>Home Menu</nav>",
      markdown: "Real content about the product here.\n\nHome\n\nMenu",
    };
    const withNoise = grade(input).score;
    const ignoringNoise = grade(input, { config: { weights: { boilerplateNoise: 0 } } }).score;
    expect(ignoringNoise).toBeGreaterThan(withNoise);
  });

  test("inline-glue thresholds are configurable", () => {
    const doc = {
      markdown: "SaveSave\n\nmore text here",
      html: "<button>Save</button><button>Save</button><p>more text here</p>",
    };
    // default repeatMinLen (8) catches the 8-char "SaveSave"
    expect(grade(doc).findings.some((f) => f.code === "INLINE_GLUE")).toBe(true);
    // raise the threshold and it's ignored
    const tuned = grade(doc, { config: { inlineGlue: { repeatMinLen: 12 } } });
    expect(tuned.findings.some((f) => f.code === "INLINE_GLUE")).toBe(false);
  });

  test("exposes a letter rating and a human-readable summary (DX)", () => {
    const clean = grade(cleanInput);
    expect(clean.rating).toBe("A"); // 90+
    expect(clean.summary).toBe("100/100 (A) — clean");

    const bad = grade(badInput);
    expect(bad.rating).not.toBe("A");
    expect(bad.summary).toMatch(/^\d+\/100 \([A-F]\) — /);
    expect(bad.summary).toContain("INLINE_GLUE ×1");
  });
});
