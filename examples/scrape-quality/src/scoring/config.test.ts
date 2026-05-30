import { describe, test, expect } from "vitest";
import { resolveConfig, DEFAULT_CONFIG } from "./config";

describe("resolveConfig", () => {
  test("returns the defaults when given nothing", () => {
    expect(resolveConfig()).toEqual(DEFAULT_CONFIG);
  });

  test("merges a partial override while keeping the other defaults", () => {
    const c = resolveConfig({ rating: { B: 70 }, weights: { inlineGlue: 0.5 } });
    expect(c.rating.B).toBe(70); // overridden
    expect(c.rating.A).toBe(90); // kept
    expect(c.weights.inlineGlue).toBe(0.5); // overridden
    expect(c.weights.structureFidelity).toBe(0.25); // kept
  });

  test("does not mutate the defaults", () => {
    resolveConfig({ weights: { inlineGlue: 0.9 } });
    expect(DEFAULT_CONFIG.weights.inlineGlue).toBe(0.2);
  });
});
