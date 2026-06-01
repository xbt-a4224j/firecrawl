import { describe, test, expect } from "vitest";
import { scrapeUrl, apiUrlForTarget } from "./scrape";

describe("scrapeUrl", () => {
  test("POSTs to /v2/scrape with bearer auth and returns the document", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        json: async () => ({
          success: true,
          data: { markdown: "# x", html: "<h1>x</h1>", metadata: { statusCode: 200 } },
        }),
      };
    }) as unknown as typeof fetch;

    const doc = await scrapeUrl("https://e.com", {
      apiKey: "fc-key",
      apiUrl: "https://api.firecrawl.dev",
      fetchImpl,
    });

    expect(calls[0]!.url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer fc-key");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({ url: "https://e.com" });
    expect(body.formats).toContain("markdown");
    expect(doc.markdown).toBe("# x");
    expect(doc.metadata?.statusCode).toBe(200);
  });

  test("merges caller config into the request", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return { json: async () => ({ data: { markdown: "x" } }) };
    }) as unknown as typeof fetch;

    await scrapeUrl("https://e.com", { config: { onlyMainContent: false }, fetchImpl });
    expect(body.onlyMainContent).toBe(false);
  });
});

describe("apiUrlForTarget", () => {
  test("maps 'local' to the dogfood stack and 'cloud' to the public API", () => {
    expect(apiUrlForTarget("local")).toBe("http://localhost:3002");
    expect(apiUrlForTarget("cloud")).toBe("https://api.firecrawl.dev");
  });
});
