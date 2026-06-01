import { describe, test, expect } from "vitest";
import { inlineGlue } from "./inlineGlue";

// HTML with adjacent inline siblings → the gate that enables flagging.
const ADJACENT = "<button>x</button><button>y</button>";

describe("inlineGlue (#3583)", () => {
  test("flags an exact-repeat glue from adjacent <button> siblings", () => {
    const result = inlineGlue(
      "FunktionalFunktional",
      "<button>Funktional</button><button>Funktional</button>",
    );
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({
      token: "FunktionalFunktional",
      kind: "repeat",
      offset: 0,
    });
    expect(result.score).toBe(75);
  });

  test("flags a camel-seam glue from a <label> + <span> pair", () => {
    const result = inlineGlue(
      "FunktionalAlways active",
      "<label>Funktional</label><span>Always active</span>",
    );
    expect(result.hits.map((h) => h.kind)).toContain("camel-seam");
    expect(result.hits[0]?.token).toBe("FunktionalAlways");
    expect(result.score).toBeLessThan(100);
  });

  test("flags exact-repeat from adjacent <span> siblings", () => {
    const result = inlineGlue(
      "FunktionalFunktional",
      "<span>Funktional</span><span>Funktional</span>",
    );
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.kind).toBe("repeat");
  });

  // THE regression guard: <b>Fire</b><b>crawl</b> is the word "Firecrawl" — must stay glued, unflagged.
  test("does NOT flag a genuine inline merge (Firecrawl stays one word)", () => {
    const result = inlineGlue("**Fire****crawl**", "<b>Fire</b><b>crawl</b>");
    expect(result.hits).toEqual([]);
    expect(result.score).toBe(100);
  });

  test("does NOT flag a real repeated-syllable word when there are no adjacent inline siblings", () => {
    const result = inlineGlue("I love couscous", "<p>I love couscous</p>");
    expect(result.hits).toEqual([]);
    expect(result.score).toBe(100);
  });

  test("reports the character offset of the glued token for highlighting", () => {
    const result = inlineGlue("Hello FunktionalFunktional", ADJACENT);
    expect(result.hits[0]?.offset).toBe(6);
  });

  test("scores 100 with no glue", () => {
    const result = inlineGlue("A clean sentence with normal words.", ADJACENT);
    expect(result.hits).toEqual([]);
    expect(result.score).toBe(100);
  });

  test("is deterministic", () => {
    const md = "FunktionalFunktional";
    const html = "<button>Funktional</button><button>Funktional</button>";
    expect(inlineGlue(md, html)).toEqual(inlineGlue(md, html));
  });
});
