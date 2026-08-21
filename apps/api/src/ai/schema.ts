import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodSchema } from 'zod';
import { extractionResult, classifyAgainstBaselineResult } from '@deliveryos/shared';

/**
 * Bumped whenever the shape of a model-produced record changes. Stored on every
 * AiRun (§8.4 "use schema versioning so requirement, plan and risk outputs
 * remain compatible with application code") so an old run stays interpretable
 * after the schema moves on.
 */
export const SCHEMA_VERSION = 'extraction.v1';

/**
 * One canonical JSON Schema, fed to both providers.
 *
 * Deriving it from the same Zod schema the database write path validates
 * against is the point: a provider swap cannot quietly change what a
 * requirement looks like, because neither provider is the source of truth for
 * the shape.
 */
export function toJsonSchema(schema: ZodSchema<unknown>, name: string): Record<string, unknown> {
  const generated = zodToJsonSchema(schema, {
    name,
    target: 'jsonSchema7',
    $refStrategy: 'none',
    errorMessages: false,
  }) as Record<string, unknown>;

  const definitions = generated.definitions as Record<string, unknown> | undefined;
  const body = (definitions?.[name] ?? generated) as Record<string, unknown>;

  return makeStrict(body);
}

/**
 * OpenAI structured outputs in strict mode requires every property to appear in
 * `required` and every object to set `additionalProperties: false`. Anthropic
 * accepts the same schema, so normalising once keeps the two adapters honest.
 *
 * Optional fields are the one thing this cannot express — which is why the
 * extraction schemas use `.nullable()` rather than `.optional()` throughout.
 */
function makeStrict(node: unknown): Record<string, unknown> {
  if (node === null || typeof node !== 'object') return node as Record<string, unknown>;

  const obj = { ...(node as Record<string, unknown>) };

  // Constraints the models ignore but that bloat the schema; drop them and let
  // the Zod pass on our side enforce lengths.
  delete obj.minLength;
  delete obj.maxLength;
  delete obj.minItems;
  delete obj.maxItems;
  delete obj.$schema;
  delete obj.additionalItems;

  if (obj.type === 'object' && obj.properties) {
    const properties = obj.properties as Record<string, unknown>;
    obj.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, makeStrict(value)]),
    );
    obj.required = Object.keys(properties);
    obj.additionalProperties = false;
  }

  if (obj.type === 'array' && obj.items) {
    obj.items = makeStrict(obj.items);
  }

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(obj[key])) {
      obj[key] = (obj[key] as unknown[]).map(makeStrict);
    }
  }

  return obj;
}

export const EXTRACTION_JSON_SCHEMA = toJsonSchema(extractionResult, 'extraction_result');
export const CLASSIFICATION_JSON_SCHEMA = toJsonSchema(classifyAgainstBaselineResult, 'scope_classification');
