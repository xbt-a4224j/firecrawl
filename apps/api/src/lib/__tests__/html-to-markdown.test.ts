import { parseMarkdown } from "../html-to-markdown";

describe("parseMarkdown", () => {
  it("should correctly convert simple HTML to Markdown", async () => {
    const html = "<p>Hello, world!</p>";
    const expectedMarkdown = "Hello, world!";
    await expect(parseMarkdown(html)).resolves.toBe(expectedMarkdown);
  });

  it("should convert complex HTML with nested elements to Markdown", async () => {
    const html =
      "<div><p>Hello <strong>bold</strong> world!</p><ul><li>List item</li></ul></div>";
    const expectedMarkdown = "Hello **bold** world!\n\n- List item";
    await expect(parseMarkdown(html)).resolves.toBe(expectedMarkdown);
  });

  it("should return empty string when input is empty", async () => {
    const html = "";
    const expectedMarkdown = "";
    await expect(parseMarkdown(html)).resolves.toBe(expectedMarkdown);
  });

  it("should handle null input gracefully", async () => {
    const html = null;
    const expectedMarkdown = "";
    await expect(parseMarkdown(html)).resolves.toBe(expectedMarkdown);
  });

  it("should handle various types of invalid HTML gracefully", async () => {
    const invalidHtmls = [
      { html: "<html><p>Unclosed tag", expected: "Unclosed tag" },
      {
        html: "<div><span>Missing closing div",
        expected: "Missing closing div",
      },
      {
        html: "<p><strong>Wrong nesting</em></strong></p>",
        expected: "**Wrong nesting**",
      },
      {
        html: '<a href="http://example.com">Link without closing tag',
        expected: "[Link without closing tag](http://example.com)",
      },
    ];

    for (const { html, expected } of invalidHtmls) {
      await expect(parseMarkdown(html)).resolves.toBe(expected);
    }
  });

  // Regression: issue 3583 — adjacent block-ish interactive elements (CMP cookie
  // widgets use <button>/<label>) were glued into one token (e.g.
  // "FunktionalFunktional"), corrupting the markdown for downstream LLMs.
  describe("adjacent interactive elements (issue 3583)", () => {
    it("separates adjacent <button> elements instead of gluing them", async () => {
      const html = "<button>Funktional</button><button>Funktional</button>";
      await expect(parseMarkdown(html)).resolves.toBe(
        "Funktional\n\nFunktional",
      );
    });

    it("separates a <label> from a following sibling (CMP toggle shape)", async () => {
      const html = "<label>Funktional</label><span>Always active</span>";
      await expect(parseMarkdown(html)).resolves.toBe(
        "Funktional\n\nAlways active",
      );
    });

    // Guard: genuine inline formatting must NOT be promoted to separate blocks. "<b>Fire</b><b>crawl</b>"
    // is the word "Firecrawl" — inserting a block break would be a worse bug than the one we fix.
    // Asserted backend-agnostically (the Go parser emits "**Fire** **crawl**", Turndown "**Fire****crawl**";
    // both keep it on one line) so this guards every converter, not just one.
    it("does NOT promote genuine inline formatting to separate blocks", async () => {
      const out = await parseMarkdown("<b>Fire</b><b>crawl</b>");
      expect(out).not.toMatch(/\n\s*\n/); // no block break inserted between inline runs
      expect(out.replace(/[*\s]/g, "")).toBe("Firecrawl"); // text preserved, only inline emphasis added
    });
  });
});
