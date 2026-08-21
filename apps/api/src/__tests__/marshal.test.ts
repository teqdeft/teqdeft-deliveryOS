import { describe, expect, it } from 'vitest';
import { toBool, fromBool, toDecimalString, toJson, fromJson, likeContains, toNumber } from '../db/marshal.js';

/**
 * MySQL reports several types differently from PostgreSQL. Each difference
 * here is one that would otherwise change an API response or silently break a
 * comparison, so each gets a test rather than a comment.
 */
describe('toDecimalString', () => {
  // MySQL renders DECIMAL(14,2) as "850000.00"; the PostgreSQL API returned
  // "850000" for the same stored value.
  it('renders a whole amount the way the API always has', () => {
    expect(toDecimalString('850000.00')).toBe('850000');
    expect(toDecimalString('1450000.00')).toBe('1450000');
    expect(toDecimalString('40.00')).toBe('40');
  });

  it('keeps significant decimals', () => {
    expect(toDecimalString('0.95')).toBe('0.95');
    expect(toDecimalString('0.0175')).toBe('0.0175');
    expect(toDecimalString('99999999999999.99')).toBe('99999999999999.99');
  });

  it('drops only trailing zeros', () => {
    expect(toDecimalString('0.90')).toBe('0.9');
    expect(toDecimalString('12.10')).toBe('12.1');
    expect(toDecimalString('-12.50')).toBe('-12.5');
  });

  it('handles zero and negative zero without producing an empty string', () => {
    expect(toDecimalString('0.00')).toBe('0');
    expect(toDecimalString('-0.00')).toBe('0');
  });

  it('passes an integer string through untouched', () => {
    expect(toDecimalString('123')).toBe('123');
  });

  it('preserves precision a float would lose', () => {
    // 0.1 + 0.2 territory: never round-trip a money column through a double.
    expect(toDecimalString('9007199254740993.01')).toBe('9007199254740993.01');
  });

  it('maps absent values to null', () => {
    expect(toDecimalString(null)).toBeNull();
    expect(toDecimalString(undefined)).toBeNull();
  });
});

describe('toBool', () => {
  // TINYINT(1) arrives as 0/1, and `if (row.isActive)` is truthy for both.
  it('reads MySQL TINYINT as a real boolean', () => {
    expect(toBool(1)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBool(true)).toBe(true);
    expect(toBool(null)).toBe(false);
    expect(toBool(undefined)).toBe(false);
  });

  it('round-trips through fromBool', () => {
    expect(toBool(fromBool(true))).toBe(true);
    expect(toBool(fromBool(false))).toBe(false);
    expect(fromBool(null)).toBe(0);
  });
});

describe('toJson', () => {
  it('accepts a parsed object, a JSON string, and absent values', () => {
    expect(toJson({ a: 1 }, {})).toEqual({ a: 1 });
    expect(toJson('{"a":1}', {})).toEqual({ a: 1 });
    expect(toJson('[1,2]', [])).toEqual([1, 2]);
    expect(toJson(null, [])).toEqual([]);
    expect(toJson(undefined, { fallback: true })).toEqual({ fallback: true });
  });

  it('falls back rather than throwing on malformed text', () => {
    expect(toJson('{not json', [] as unknown[])).toEqual([]);
  });

  it('survives a fromJson round trip, including multibyte text', () => {
    const value = [{ locator: 'p. 4, ¶2', note: 'em—dash and “quotes”' }];
    expect(toJson(fromJson(value), [])).toEqual(value);
  });
});

describe('likeContains', () => {
  // MySQL's LIKE treats % and _ as wildcards; a client searching for "100%"
  // must not match everything.
  it('escapes wildcards so they match literally', () => {
    expect(likeContains('100%')).toBe('%100\\%%');
    expect(likeContains('a_b')).toBe('%a\\_b%');
    expect(likeContains('back\\slash')).toBe('%back\\\\slash%');
  });

  it('leaves ordinary terms alone', () => {
    expect(likeContains('Northwind')).toBe('%Northwind%');
  });
});

describe('toNumber', () => {
  it('converts decimal strings for arithmetic, and refuses nonsense', () => {
    expect(toNumber('0.95')).toBe(0.95);
    expect(toNumber(42)).toBe(42);
    expect(toNumber(null)).toBeNull();
    expect(toNumber('not a number')).toBeNull();
  });
});
