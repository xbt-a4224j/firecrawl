import { describe, test, expect } from "vitest";
import { tableCodePreservation } from "./tableCodePreservation";

describe("tableCodePreservation", () => {
  test("scores 100 when a table becomes a real markdown pipe-table", () => {
    const html = "<table><tr><th>a</th></tr><tr><td>1</td></tr></table>";
    const md = "| a |\n|---|\n| 1 |";

    const result = tableCodePreservation(html, md);

    expect(result.tables).toEqual({ html: 1, preserved: 1 });
    expect(result.score).toBe(100);
    expect(result.findings).toEqual([]);
  });

  test("flags a table flattened into prose", () => {
    const html = "<table><tr><td>1</td></tr></table>";
    const md = "1"; // no separator row → flattened

    const result = tableCodePreservation(html, md);

    expect(result.tables).toEqual({ html: 1, preserved: 0 });
    expect(result.score).toBe(0);
    expect(result.findings.map((f) => f.code)).toContain("TABLE_FLATTENED");
  });

  test("scores 100 when a code block becomes a fenced block", () => {
    const html = "<pre><code>const x = 1;</code></pre>";
    const md = "```\nconst x = 1;\n```";

    const result = tableCodePreservation(html, md);

    expect(result.code).toEqual({ html: 1, preserved: 1 });
    expect(result.score).toBe(100);
    expect(result.findings).toEqual([]);
  });

  test("flags a code block that lost its fence", () => {
    const html = "<pre><code>const x = 1;</code></pre>";
    const md = "const x = 1;"; // no fence

    const result = tableCodePreservation(html, md);

    expect(result.code).toEqual({ html: 1, preserved: 0 });
    expect(result.score).toBe(0);
    expect(result.findings.map((f) => f.code)).toContain("CODE_UNFENCED");
  });

  test("flags a lost language hint (low severity) without tanking the score", () => {
    const html = '<pre><code class="language-ts">const x = 1;</code></pre>';
    const md = "```\nconst x = 1;\n```"; // fenced but no language

    const result = tableCodePreservation(html, md);

    expect(result.score).toBe(100); // still fenced → preserved
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain("CODE_LANG_LOST");
    expect(result.findings.find((f) => f.code === "CODE_LANG_LOST")?.severity).toBe("low");
  });

  test("keeps the language hint when markdown fences with a language", () => {
    const html = '<pre><code class="language-ts">const x = 1;</code></pre>';
    const md = "```ts\nconst x = 1;\n```";

    const result = tableCodePreservation(html, md);

    expect(result.findings.map((f) => f.code)).not.toContain("CODE_LANG_LOST");
  });

  test("scores 100 with no findings when there are no tables or code", () => {
    const result = tableCodePreservation("<p>hi</p>", "hi");
    expect(result.score).toBe(100);
    expect(result.findings).toEqual([]);
  });

  test("is deterministic", () => {
    const html = "<table><tr><td>1</td></tr></table><pre><code>x</code></pre>";
    const md = "1\n\nx";
    expect(tableCodePreservation(html, md)).toEqual(tableCodePreservation(html, md));
  });
});
