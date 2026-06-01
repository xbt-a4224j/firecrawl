import { describe, test, expect } from "vitest";
import { renderStateOfQuality } from "./stateOfQuality";
import { gradeFixtures } from "./fixtures";

describe("renderStateOfQuality", () => {
  const md = renderStateOfQuality(gradeFixtures());

  test("has a title and the corpus headline", () => {
    expect(md).toContain("# State of");
    expect(md).toMatch(/Graded 7 pages/);
  });

  test("frames the isLongEnough gap", () => {
    expect(md).toContain("isLongEnough");
  });

  test("includes the worst pages and failure modes", () => {
    expect(md).toContain("Worst pages");
    expect(md).toContain("INLINE_GLUE");
    expect(md).toContain("shop.de"); // the cookie/glue fixture
  });

  test("handles an empty corpus without crashing", () => {
    const md0 = renderStateOfQuality([]);
    expect(md0).toContain("# State of");
    expect(md0).toMatch(/Graded 0 pages/);
  });
});
