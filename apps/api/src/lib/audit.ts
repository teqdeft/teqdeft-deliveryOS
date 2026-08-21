import type { Request } from 'express';
import type { Tx } from '../db.js';
import { prisma } from '../db.js';

export interface AuditInput {
  projectId?: string | null;
  actorId?: string | null;
  /** Dotted verb: "baseline.approved", "requirement.rejected", "source.uploaded". */
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  detail?: Record<string, unknown>;
  request?: Pick<Request, 'ip' | 'headers'>;
}

/** Keys whose values must never reach the audit log (§16 "no secrets in notes"). */
const REDACTED_KEYS = /password|secret|token|apikey|api_key|authorization|cookie|credential/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => scrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.test(k) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

/**
 * The only write path into AuditEvent. Blueprint §4.1 requires every approval,
 * status change, AI record and manual override to land here, and §15.3
 * requires it to share the caller's transaction so an audit row cannot survive
 * a rolled-back mutation — or vice versa.
 *
 * Pass `tx` whenever the audited change is itself in a transaction.
 */
export async function recordAudit(input: AuditInput, tx: Tx = prisma): Promise<void> {
  const ua = input.request?.headers?.['user-agent'];
  await tx.auditEvent.create({
    data: {
      projectId: input.projectId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary.slice(0, 1000),
      detail: (scrub(input.detail ?? {}) ?? {}) as object,
      ipAddress: input.request?.ip ?? null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 400) : null,
    },
  });
}

/** Field-level before/after for the audit detail, limited to keys that actually changed. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const prev = before[key];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changes[key] = { from: prev ?? null, to: next ?? null };
    }
  }
  return changes;
}
