import { zodToJsonSchema as zodToJsonSchemaLib } from "zod-to-json-schema";
import { toJSONSchema as zodV4ToJsonSchema } from "zod/v4";

export function isZodSchema(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const schema = value as Record<string, unknown>;

  const hasV3Markers =
    "_def" in schema &&
    (typeof schema.safeParse === "function" ||
      typeof schema.parse === "function");

  const hasV4Markers = "_zod" in schema && typeof schema._zod === "object";

  return hasV3Markers || hasV4Markers;
}

function isZodV4Schema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  return "_zod" in schema && typeof (schema as Record<string, unknown>)._zod === "object";
}

function tryZodV4Conversion(schema: unknown): Record<string, unknown> | null {
  if (!isZodV4Schema(schema)) return null;

  try {
    // In Zod v4, `toJSONSchema` is a MODULE-LEVEL export (z.toJSONSchema), not a method on the
    // schema's class — so reflecting it off the prototype chain always missed and fell through to
    // the v3-only `zod-to-json-schema` lib, which can't read v4's `_zod` internals and emitted a
    // contentless stub. zod@3.25+ ships the v4 implementation at the `zod/v4` subpath; call it
    // directly. (issue 3300)
    return zodV4ToJsonSchema(schema as Parameters<typeof zodV4ToJsonSchema>[0]) as Record<string, unknown>;
  } catch {
    // V4 conversion not available — fall back to the v3 path below.
    return null;
  }
}

export function zodSchemaToJsonSchema(schema: unknown): Record<string, unknown> | unknown {
  if (!isZodSchema(schema)) {
    return schema;
  }

  const v4Result = tryZodV4Conversion(schema);
  if (v4Result) {
    return v4Result;
  }

  try {
    return zodToJsonSchemaLib(schema as Parameters<typeof zodToJsonSchemaLib>[0]) as Record<string, unknown>;
  } catch {
    return schema;
  }
}

export function looksLikeZodShape(obj: unknown): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const values = Object.values(obj);
  if (values.length === 0) return false;
  return values.some(
    (v) =>
      v &&
      typeof v === "object" &&
      (v as Record<string, unknown>)._def &&
      typeof (v as Record<string, unknown>).safeParse === "function"
  );
}
