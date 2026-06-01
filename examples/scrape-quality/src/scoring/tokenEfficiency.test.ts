import { describe, test, expect } from "vitest";
import { tokenEfficiency } from "./tokenEfficiency";

describe("tokenEfficiency", () => {
  test("counts tokens with a real tokenizer (not chars/4)", () => {
    const result = tokenEfficiency("Hello world");
    expect(result.tokens).toBe(2); // BPE truth, not 11/4
  });

  test("scores 100 when all tokens are content (no boilerplate)", () => {
    const md = "The quick brown fox jumps over the lazy dog in the meadow.";
    const result = tokenEfficiency(md);
    expect(result.ratio).toBe(1);
    expect(result.score).toBe(100);
    expect(result.contentTokens).toBe(result.tokens);
  });

  test("penalizes boilerplate bloat (content tokens < total tokens)", () => {
    const md = [
      "Accept All cookies. Manage Preferences.",
      "",
      "The quick brown fox jumps over the lazy dog repeatedly today.",
    ].join("\n");

    const result = tokenEfficiency(md);

    expect(result.contentTokens).toBeLessThan(result.tokens);
    expect(result.score).toBeLessThan(100);
  });

  test("more text yields more tokens (monotonic)", () => {
    const few = tokenEfficiency("widget").tokens;
    const many = tokenEfficiency("widget gadget gizmo doohickey contraption apparatus").tokens;
    expect(many).toBeGreaterThan(few);
  });

  test("treats empty markdown as fully efficient (no divide-by-zero)", () => {
    const result = tokenEfficiency("");
    expect(result.tokens).toBe(0);
    expect(result.ratio).toBe(1);
    expect(result.score).toBe(100);
  });

  test("is deterministic", () => {
    const md = "Accept All\n\nReal content about the product line.";
    expect(tokenEfficiency(md)).toEqual(tokenEfficiency(md));
  });
});
