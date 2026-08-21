import { describe, expect, it } from 'vitest';
import { EXTRACTION_JSON_SCHEMA } from '../ai/schema.js';

/**
 * Both providers receive this exact object. If it drifts out of strict shape,
 * OpenAI rejects the request and Anthropic silently accepts looser output —
 * so the asymmetry is worth a test.
 */
describe('extraction JSON schema', () => {
  it('marks every object strict, as OpenAI structured outputs requires', () => {
    const offenders: string[] = [];

    const walk = (node: unknown, path: string) => {
      if (node === null || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;

      if (obj.type === 'object' && obj.properties) {
        if (obj.additionalProperties !== false) offenders.push(`${path}: additionalProperties not false`);
        const properties = Object.keys(obj.properties as Record<string, unknown>);
        const required = (obj.required as string[]) ?? [];
        for (const key of properties) {
          if (!required.includes(key)) offenders.push(`${path}.${key}: not in required`);
        }
        for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
          walk(value, `${path}.${key}`);
        }
      }
      if (obj.items) walk(obj.items, `${path}[]`);
      for (const key of ['anyOf', 'oneOf', 'allOf']) {
        if (Array.isArray(obj[key])) (obj[key] as unknown[]).forEach((v, i) => walk(v, `${path}.${key}[${i}]`));
      }
    };

    walk(EXTRACTION_JSON_SCHEMA, 'root');
    expect(offenders).toEqual([]);
  });

  it('exposes requirements, conflicts and gaps at the top level', () => {
    const properties = (EXTRACTION_JSON_SCHEMA.properties ?? {}) as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(['conflicts', 'gaps', 'requirements']);
  });

  it('requires a citation on every extracted requirement', () => {
    const properties = EXTRACTION_JSON_SCHEMA.properties as Record<string, { items?: Record<string, unknown> }>;
    const requirement = properties.requirements?.items as Record<string, unknown>;
    expect((requirement.required as string[]) ?? []).toContain('citations');

    const citation = ((requirement.properties as Record<string, { items?: Record<string, unknown> }>).citations
      ?.items ?? {}) as Record<string, unknown>;
    expect((citation.required as string[]).sort()).toEqual(['quote', 'sourceFragmentId']);
  });
});
