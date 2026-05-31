import { describe, test, expect } from "vitest";
import { errorHint } from "./errors";

describe("errorHint", () => {
  test("out-of-credits / payment", () => {
    expect(errorHint("Request failed 402 Payment Required")!.toLowerCase()).toContain("credit");
  });
  test("bad / missing api key", () => {
    expect(errorHint("401 Unauthorized: invalid api key")!.toLowerCase()).toMatch(/key/);
  });
  test("site blocked the scrape", () => {
    expect(errorHint("403 Forbidden")!.toLowerCase()).toMatch(/block|stealth/);
  });
  test("unknown error → no hint", () => {
    expect(errorHint("kaboom")).toBeNull();
  });
});
