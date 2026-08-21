/**
 * MySQL returns several types differently from PostgreSQL, and every one of
 * these differences is a silent bug rather than a loud one. Centralising the
 * conversions here means a route never has to remember which is which.
 */

/** TINYINT(1) comes back as 0/1, and `if (row.isActive)` is true for both. */
export const toBool = (value: unknown): boolean => value === 1 || value === true;

export const fromBool = (value: boolean | undefined | null): 0 | 1 => (value ? 1 : 0);

/**
 * DECIMAL arrives as a string so precision is not lost. Callers that need
 * arithmetic ask for a number explicitly; callers that echo the value to the
 * API keep the string, exactly as the Prisma Decimal did.
 */
export const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Normalises a DECIMAL to the string the API returned under PostgreSQL.
 *
 * MySQL reports a DECIMAL(14,2) as "850000.00"; Prisma's Decimal rendered the
 * same stored value as "850000". Both are the same number, but the response
 * body is not the same bytes, and preserving API behaviour means preserving
 * the bytes — a client comparing strings, or snapshotting a response, would
 * otherwise break on a change that looks cosmetic.
 *
 * Trailing zeros after the point are dropped, and the point with them when
 * nothing follows. The value is never parsed as a float, so precision beyond
 * what a double can hold survives.
 */
export function toDecimalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value);
  if (!raw.includes('.')) return raw;
  const trimmed = raw.replace(/0+$/, '').replace(/\.$/, '');
  // "-0.00" trims to "-0", which is a strange thing to hand a client and not
  // what the PostgreSQL API ever returned.
  if (trimmed === '' || trimmed === '-' || trimmed === '-0') return '0';
  return trimmed;
}

/**
 * mysql2 parses JSON columns already, but a column written as a string by an
 * older driver, or a legacy row, comes back as text. Accept both.
 */
export function toJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/**
 * MySQL's JSON column does not accept a bare JS object through the driver's
 * placeholder escaping, so values are serialised on the way in.
 */
export const fromJson = (value: unknown): string => JSON.stringify(value ?? null);

/** MySQL rejects `Invalid Date`; a bad date must fail loudly at the boundary. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * DATETIME(3) has millisecond precision; anything finer is truncated by the
 * server rather than rounded, so truncate here too and keep the value the
 * application holds identical to the value the database stores.
 */
export function fromDate(value: Date | string | null | undefined): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Math.floor(d.getTime()));
}

/** Strips undefined so an unset field is left alone rather than written as NULL. */
export function defined<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Escapes the wildcards MySQL's LIKE treats as special, so searching for
 * "100%" or "a_b" matches those literal strings.
 *
 * Case sensitivity differs from PostgreSQL and is worth being explicit about:
 * the schema uses utf8mb4_unicode_ci, an accent- and case-insensitive
 * collation, so LIKE is already case-insensitive. That matches what the API
 * did before with Prisma's `mode: 'insensitive'`.
 */
export const likeContains = (term: string): string =>
  `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
