import { describe, test, expect } from "vitest";
import { boilerplateNoise } from "./boilerplateNoise";

describe("boilerplateNoise", () => {
  test("scores 100 with no noisy spans on a content-heavy page", () => {
    const md = [
      "# The History of Tea",
      "",
      "Tea was first discovered in ancient China many centuries ago.",
      "Today it is one of the most consumed beverages in the entire world.",
    ].join("\n");

    const result = boilerplateNoise(md);

    expect(result.noiseRatio).toBe(0);
    expect(result.score).toBe(100);
    expect(result.noisySpans).toEqual([]);
  });

  test("scores low and flags cookie-consent cruft on a CMP wall", () => {
    const md = [
      "We use cookies to improve your experience on our website.",
      "Accept All",
      "Reject All",
      "Manage Preferences",
      "",
      "Welcome to our store.",
    ].join("\n");

    const result = boilerplateNoise(md);

    expect(result.score).toBeLessThan(50);
    expect(result.noisySpans.some((s) => s.reason === "cookie-consent")).toBe(true);
  });

  test("flags footer/legal boilerplate", () => {
    const md = ["Real article content here about widgets.", "© 2026 Acme Inc. All rights reserved."].join(
      "\n",
    );

    const result = boilerplateNoise(md);

    expect(result.noisySpans.some((s) => s.reason === "footer-legal")).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  test("treats empty markdown as no noise (no divide-by-zero)", () => {
    const result = boilerplateNoise("");
    expect(result.noiseRatio).toBe(0);
    expect(result.score).toBe(100);
  });

  test("is deterministic", () => {
    const md = "Accept All cookies\n\nActual content about the product.";
    expect(boilerplateNoise(md)).toEqual(boilerplateNoise(md));
  });
});
