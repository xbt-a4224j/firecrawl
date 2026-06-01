import { describe, test, expect } from "vitest";
import { extractionIntegrity, buildExtractFn } from "./extractionIntegrity";

function returns(values: unknown[]): () => Promise<unknown> {
  let i = 0;
  return async () => values[Math.min(i++, values.length - 1)];
}

describe("extractionIntegrity", () => {
  test("scores 100 when extraction is populated, valid and deterministic", async () => {
    const result = await extractionIntegrity(returns([{ name: "x" }, { name: "x" }, { name: "x" }]), {
      validate: () => true,
    });
    expect(result.populated).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.deterministic).toBe(true);
    expect(result.score).toBe(100);
    expect(result.findings).toEqual([]);
  });

  test("flags EXTRACTION_EMPTY when every run is empty (the #3300 case)", async () => {
    const result = await extractionIntegrity(returns([undefined, undefined, undefined]));
    expect(result.populated).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("EXTRACTION_EMPTY");
    expect(result.score).toBeLessThan(50);
  });

  test("treats an empty object {} as not populated", async () => {
    const result = await extractionIntegrity(returns([{}, {}, {}]));
    expect(result.populated).toBe(false);
  });

  test("flags non-determinism across runs", async () => {
    const result = await extractionIntegrity(
      returns([{ name: "a" }, { name: "b" }, { name: "a" }]),
      { validate: () => true },
    );
    expect(result.deterministic).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("EXTRACTION_NONDETERMINISTIC");
    expect(result.score).toBeLessThan(100);
  });

  test("flags schema-invalid results", async () => {
    const result = await extractionIntegrity(returns([{ name: "x" }, { name: "x" }, { name: "x" }]), {
      validate: () => false,
    });
    expect(result.schemaValid).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("EXTRACTION_SCHEMA_INVALID");
  });

  test("runs the extraction the requested number of times", async () => {
    let calls = 0;
    const extract = async () => {
      calls++;
      return { name: "x" };
    };
    await extractionIntegrity(extract, { runs: 4 });
    expect(calls).toBe(4);
  });

  test("a thrown run counts as not populated, not a crash", async () => {
    const extract = async () => {
      throw new Error("empty json result");
    };
    const result = await extractionIntegrity(extract, { runs: 2 });
    expect(result.populated).toBe(false);
  });
});

describe("buildExtractFn", () => {
  test("requests a json format carrying the schema and returns doc.json", async () => {
    let received: Record<string, unknown> | undefined;
    const client = {
      scrape: async (_url: string, options: Record<string, unknown>) => {
        received = options;
        return { json: { name: "x" } };
      },
    };
    const schema = { type: "object", properties: { name: { type: "string" } } };

    const fn = buildExtractFn(client, "https://example.com", schema);
    const json = await fn();

    expect(received?.formats).toEqual([{ type: "json", schema }]);
    expect(json).toEqual({ name: "x" });
  });
});
