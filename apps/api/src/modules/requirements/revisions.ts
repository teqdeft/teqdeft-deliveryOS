import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db.js';

/**
 * §7.2: "Reviewers can edit wording, split, merge, reject or convert items
 * while preserving AI and human history."
 *
 * Every mutation appends a revision holding a full snapshot plus a field-level
 * diff, so the studio can show who changed what and the original AI draft
 * remains recoverable months later.
 */
export async function appendRevision(
  tx: Tx,
  params: {
    requirementId: string;
    action: string;
    actorId: string;
    snapshot: Record<string, unknown>;
    changes?: Record<string, unknown>;
    reason?: string | null;
  },
): Promise<void> {
  const last = await tx.requirementRevision.findFirst({
    where: { requirementId: params.requirementId },
    orderBy: { revision: 'desc' },
    select: { revision: true },
  });

  await tx.requirementRevision.create({
    data: {
      requirementId: params.requirementId,
      revision: (last?.revision ?? 0) + 1,
      action: params.action,
      actorId: params.actorId,
      snapshot: params.snapshot as Prisma.InputJsonValue,
      changes: (params.changes ?? {}) as Prisma.InputJsonValue,
      reason: params.reason ?? null,
    },
  });
}

/** The fields worth preserving in a snapshot — enough to reconstruct the record. */
export function snapshotOf(requirement: {
  title: string;
  statement: string;
  requirementClass: string;
  priority: string;
  reviewState: string;
  acceptanceCriteria: unknown;
  isExclusion: boolean;
  isAssumption: boolean;
  openQuestion: string | null;
  confidence: unknown;
}): Record<string, unknown> {
  return {
    title: requirement.title,
    statement: requirement.statement,
    requirementClass: requirement.requirementClass,
    priority: requirement.priority,
    reviewState: requirement.reviewState,
    acceptanceCriteria: requirement.acceptanceCriteria,
    isExclusion: requirement.isExclusion,
    isAssumption: requirement.isAssumption,
    openQuestion: requirement.openQuestion,
    confidence: requirement.confidence ? Number(requirement.confidence) : null,
  };
}
