import { detectSilentFailure } from "../silentFailure";

const codes = (markdown: string) =>
  detectSilentFailure(markdown).map(f => f.code);

// ~1.2k chars of clean prose, used as the body of fixtures and the false-positive guard.
const PROSE =
  "Web scraping extracts structured data from web pages by parsing their HTML into fields. ".repeat(
    15,
  );

describe("detectSilentFailure", () => {
  describe("positives — each signature fires", () => {
    it("BOT_WALL — challenge copy in the lead", () => {
      expect(
        codes("Human Verification — we just need a quick check. " + PROSE),
      ).toContain("BOT_WALL");
    });

    it("BOT_WALL — anti-bot asset domain (perfdrive)", () => {
      expect(
        codes("![Captcha](https://captcha.perfdrive.com/x.png) please wait"),
      ).toContain("BOT_WALL");
    });

    it("SOFT_ERROR — error page returned instead of content", () => {
      expect(
        codes("Something went wrong. Wait a moment and try again. " + PROSE),
      ).toContain("SOFT_ERROR");
    });

    it("GATE — login/subscribe gate where content should be", () => {
      expect(
        codes("Sign up to get access to over 50 million papers. " + PROSE),
      ).toContain("GATE");
    });

    it("PLACEHOLDER — repeated Loading… skeletons", () => {
      expect(codes("Loading… Loading… Loading… Loading… " + PROSE)).toContain(
        "PLACEHOLDER",
      );
    });
  });

  describe("negatives — real / near-miss content is not flagged (precision)", () => {
    it("a real article with a cookie line + an embedded reCAPTCHA mention is clean", () => {
      const md =
        PROSE +
        " This site uses cookies for analytics. Some forms are protected by reCAPTCHA to deter abuse.";
      expect(detectSilentFailure(md)).toEqual([]);
    });

    it("prose that mentions loading (lazy loading, image loading) is NOT a PLACEHOLDER", () => {
      const md =
        "Lazy loading defers image loading. Loading order matters for loading. " +
        PROSE;
      expect(codes(md)).not.toContain("PLACEHOLDER");
    });

    it("a short BUT REAL page is not flagged — there is deliberately no length heuristic", () => {
      // example.com is ~134 readable chars, the same as a junk JS shell. Length can't separate them,
      // so we don't reject on length at all; a real short page must pass clean.
      expect(
        detectSilentFailure(
          "Example Domain. This domain is for use in illustrative examples in documents. " +
            "You may use this domain in literature without prior coordination or asking for permission.",
        ),
      ).toEqual([]);
    });

    it("empty input produces no finding (the engine's length>0 gate owns that case)", () => {
      expect(detectSilentFailure("")).toEqual([]);
    });
  });
});
