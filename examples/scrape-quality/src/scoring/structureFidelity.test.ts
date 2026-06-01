import { describe, test, expect } from "vitest";
import { structureFidelity } from "./structureFidelity";

describe("structureFidelity", () => {
  test("scores 100 when every structural element survives HTML → markdown", () => {
    const html =
      "<h1>A</h1><h2>B</h2><table><tr><td>x</td></tr></table><pre><code>y</code></pre><ul><li>z</li></ul>";
    const md = "# A\n\n## B\n\n| x |\n|---|\n\n```\ny\n```\n\n- z";

    const result = structureFidelity(html, md);

    expect(result.score).toBe(100);
    expect(result.perKind.tables.survival).toBe(1);
    expect(result.perKind.code.survival).toBe(1);
  });

  test("a dropped table lowers the score and is weighted heavily", () => {
    const html = "<h1>A</h1><h2>B</h2><table><tr><td>x</td></tr></table>";
    const md = "# A\n\n## B"; // table vanished

    const result = structureFidelity(html, md);

    // present kinds: headings (survival 1, weight 2) + tables (survival 0, weight 3)
    // weighted = (2*1 + 3*0) / (2+3) = 0.4 -> 40
    expect(result.score).toBe(40);
    expect(result.perKind.tables).toEqual({ html: 1, md: 0, survival: 0 });
    expect(result.perKind.headings.survival).toBe(1);
  });

  test("does not penalize an all-prose page with no structural elements", () => {
    const result = structureFidelity("<p>hello world</p>", "hello world");
    expect(result.score).toBe(100);
  });

  test("caps survival at 1 when markdown has more of a kind than the HTML", () => {
    const result = structureFidelity("<h1>A</h1>", "# A\n\n## B\n\n### C");
    expect(result.perKind.headings.survival).toBe(1);
    expect(result.score).toBe(100);
  });

  test("is deterministic", () => {
    const html = "<h1>A</h1><table><tr><td>x</td></tr></table>";
    const md = "# A";
    expect(structureFidelity(html, md)).toEqual(structureFidelity(html, md));
  });
});
