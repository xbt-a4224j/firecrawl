/**
 * Regression for issue 3300 — v2 scrape() with a Zod v4 schema in formats[].json
 * produces an EMPTY JSON Schema, so the API has no fields to extract and result.json
 * comes back undefined/empty.
 *
 * Verified root cause on main (single layer — the converter):
 *   - scrape() converts schemas in-place via ensureValidScrapeOptions -> ensureValidFormats
 *     (validation.ts), which calls zodSchemaToJsonSchema(). So the call site is fine; Zod v3
 *     works (see the control test below).
 *   - zodSchemaToJsonSchema() is broken for Zod v4: tryZodV4Conversion looks for `toJSONSchema`
 *     on the prototype chain, but in v4 it's a MODULE-LEVEL export (z.toJSONSchema). The lookup
 *     returns null, so it falls through to `zod-to-json-schema` (a v3-only library) which can't
 *     read v4's `_zod` internals and emits a contentless stub: {"$schema":".../draft-07#"}.
 *
 * The two open PRs both miss it: #3345 re-adds a conversion call in scrape.ts (redundant —
 * validation already converts) and never touches the v4 converter; #3302 patches the converter
 * but resolves zod from process.cwd()'s main entry, which on the zod@3.25 bridge is v3 (v4 lives
 * at the `zod/v4` subpath), so it doesn't cover that case.
 *
 * zod@3.25.x ships the v4 implementation at the `zod/v4` subpath, so no extra dep is needed.
 */
import { describe, test, expect, jest } from "@jest/globals";
import { z as z3 } from "zod";
import { z as z4 } from "zod/v4";
import { scrape } from "../../../v2/methods/scrape";

describe("v2 scrape() converts formats[].json schema (issue 3300)", () => {
  function makeHttp(postImpl: (url: string, data: any) => any) {
    return { post: jest.fn(async (u: string, d: any) => postImpl(u, d)) } as any;
  }

  async function capturePostedSchema(schema: unknown): Promise<any> {
    let captured: any;
    const http = makeHttp((_u, data) => {
      captured = data;
      return { status: 200, data: { success: true, data: { json: { name: "Firecrawl" } } } };
    });
    await scrape(http, "https://example.com", {
      formats: [{ type: "json", schema } as any],
    });
    return captured?.formats?.[0]?.schema;
  }

  // CONTROL: Zod v3 already works — isolates the bug to v4.
  test("[control] Zod v3 schema is converted to a populated JSON Schema", async () => {
    const sent = await capturePostedSchema(z3.object({ name: z3.string() }));
    expect(sent.type).toBe("object");
    expect(sent.properties?.name).toBeDefined();
  });

  // REPRO: Zod v4 schema must convert to a populated JSON Schema. On main it comes out as
  // {"$schema":".../draft-07#"} — no type, no properties — so this FAILS (red).
  test("Zod v4 schema is converted to a populated JSON Schema", async () => {
    const sent = await capturePostedSchema(z4.object({ name: z4.string() }));
    expect(sent).toBeDefined();
    expect(sent._zod).toBeUndefined();            // not a raw Zod v4 object
    expect(sent.type).toBe("object");             // BUG: main emits a stub with no `type`
    expect(sent.properties?.name).toBeDefined();  // BUG: properties dropped entirely
  });

  test("plain JSON Schema is passed through unchanged", async () => {
    const jsonSchema = { type: "object", properties: { name: { type: "string" } } };
    const sent = await capturePostedSchema(jsonSchema);
    expect(sent).toEqual(jsonSchema);
  });
});
