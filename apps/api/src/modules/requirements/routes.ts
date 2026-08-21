import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  BULK_APPROVE_MIN_CONFIDENCE,
  bulkApproveBody,
  decideRequirementBody,
  mergeRequirementsBody,
  requirementListQuery,
  resolveConflictBody,
  splitRequirementBody,
  updateRequirementBody,
} from '@deliveryos/shared';
import { prisma } from '../../db.js';
import { requireUser } from '../../lib/auth.js';
import { paginate, parseBody, parseQuery, route } from '../../lib/http.js';
import { requireCapability, requireProjectAccess } from '../../lib/rbac.js';
import { diffFields, recordAudit } from '../../lib/audit.js';
import { badRequest, gateFailed, notFound } from '../../lib/errors.js';
import { nextReferenceBlock } from '../../lib/reference.js';
import { refreshProjectHealth } from '../projects/health.js';
import { appendRevision, snapshotOf } from './revisions.js';

export const requirementsRouter = Router();

const citationInclude = {
  citations: {
    include: {
      fragment: {
        select: {
          id: true,
          locator: true,
          text: true,
          source: { select: { id: true, title: true, kind: true, authority: true, statedAt: true } },
        },
      },
    },
  },
} satisfies Prisma.RequirementInclude;

requirementsRouter.get(
  '/:projectId/requirements',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);
    const q = parseQuery(requirementListQuery, req.query);

    const where: Prisma.RequirementWhereInput = {
      projectId: project.id,
      // Superseded rows exist only so approved baselines keep resolving; they
      // are history, not work, and must not clutter the studio.
      reviewState: q.reviewState ?? { not: 'SUPERSEDED' },
      ...(q.requirementClass ? { requirementClass: q.requirementClass } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.isExclusion !== undefined ? { isExclusion: q.isExclusion } : {}),
      ...(q.hasOpenQuestion ? { openQuestion: { not: null }, questionAnsweredAt: null } : {}),
      ...(q.minConfidence !== undefined ? { confidence: { gte: q.minConfidence } } : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' } },
              { statement: { contains: q.search, mode: 'insensitive' } },
              { reference: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, tally] = await Promise.all([
      prisma.requirement.findMany({
        where,
        orderBy: [{ reference: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: citationInclude,
      }),
      prisma.requirement.count({ where }),
      prisma.requirement.groupBy({
        by: ['reviewState'],
        where: { projectId: project.id, reviewState: { not: 'SUPERSEDED' } },
        _count: true,
      }),
    ]);

    res.json({
      ...paginate(items, total, q.page, q.pageSize),
      tally: Object.fromEntries(tally.map((t) => [t.reviewState, t._count])),
      bulkApproveMinConfidence: BULK_APPROVE_MIN_CONFIDENCE,
    });
  }),
);

requirementsRouter.get(
  '/:projectId/requirements/:requirementId',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const requirement = await prisma.requirement.findFirst({
      where: { id: req.params.requirementId, projectId: project.id },
      include: {
        ...citationInclude,
        revisions: {
          orderBy: { revision: 'desc' },
          include: { actor: { select: { id: true, name: true, avatarColor: true } } },
        },
        aiRun: { select: { id: true, model: true, provider: true, promptVersion: true, createdAt: true } },
      },
    });
    if (!requirement) throw notFound('Requirement');

    res.json({ requirement });
  }),
);

requirementsRouter.patch(
  '/:projectId/requirements/:requirementId',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'requirement.edit');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(updateRequirementBody, req.body);

    const existing = await prisma.requirement.findFirst({
      where: { id: req.params.requirementId, projectId: project.id },
    });
    if (!existing) throw notFound('Requirement');

    assertMutable(existing.reviewState);

    const { editReason, ...fields } = body;
    const changes = diffFields(existing as unknown as Record<string, unknown>, fields as Record<string, unknown>);
    if (Object.keys(changes).length === 0) {
      res.json({ requirement: existing });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.requirement.update({
        where: { id: existing.id },
        data: {
          ...fields,
          ...(fields.acceptanceCriteria ? { acceptanceCriteria: fields.acceptanceCriteria as Prisma.InputJsonValue } : {}),
          // A human touching an AI draft moves it out of DRAFT: someone has now
          // looked at it, which is exactly what the review tally should show.
          reviewState: existing.reviewState === 'DRAFT' ? 'IN_REVIEW' : existing.reviewState,
        },
        include: citationInclude,
      });

      await appendRevision(tx, {
        requirementId: existing.id,
        action: 'EDITED',
        actorId: user.id,
        snapshot: snapshotOf(existing),
        changes,
        reason: editReason ?? null,
      });

      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'requirement.edited',
          entityType: 'Requirement',
          entityId: existing.id,
          summary: `${user.name} edited ${existing.reference}: ${Object.keys(changes).join(', ')}`,
          detail: { changes, reason: editReason },
          request: req,
        },
        tx,
      );

      return next;
    });

    res.json({ requirement: updated });
  }),
);

/** §8.3: approving a requirement is a human act with a named owner. */
requirementsRouter.post(
  '/:projectId/requirements/:requirementId/decide',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'requirement.decide');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(decideRequirementBody, req.body);

    const existing = await prisma.requirement.findFirst({
      where: { id: req.params.requirementId, projectId: project.id },
      include: { citations: { select: { id: true } } },
    });
    if (!existing) throw notFound('Requirement');
    assertMutable(existing.reviewState);

    if (body.decision === 'APPROVE') {
      // "Evidence before inference" (§3.1) enforced at the gate, not just in
      // the extractor: an uncited requirement cannot become approved scope.
      if (existing.citations.length === 0) {
        throw gateFailed('This requirement has no source citation. Add one, or reject it.');
      }
      if (existing.openQuestion && !existing.questionAnsweredAt) {
        throw gateFailed(
          'Answer the open question before approving. An approved requirement with an unanswered question is exactly the ambiguity this system exists to prevent.',
          { openQuestion: existing.openQuestion },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.requirement.update({
        where: { id: existing.id },
        data: { reviewState: body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' },
        include: citationInclude,
      });

      await appendRevision(tx, {
        requirementId: existing.id,
        action: body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        actorId: user.id,
        snapshot: snapshotOf(existing),
        changes: { reviewState: { from: existing.reviewState, to: next.reviewState } },
        reason: body.comment ?? null,
      });

      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: body.decision === 'APPROVE' ? 'requirement.approved' : 'requirement.rejected',
          entityType: 'Requirement',
          entityId: existing.id,
          summary: `${user.name} ${body.decision === 'APPROVE' ? 'approved' : 'rejected'} ${existing.reference} — ${existing.title}`,
          detail: { comment: body.comment, confidence: existing.confidence ? Number(existing.confidence) : null },
          request: req,
        },
        tx,
      );

      return next;
    });

    await refreshProjectHealth(project.id);
    res.json({ requirement: updated });
  }),
);

/**
 * §7.2: "Bulk approve is allowed only for high-confidence, non-conflicting
 * items; critical requirements require explicit review."
 *
 * The filter runs here rather than in the client, so a caller cannot approve a
 * low-confidence batch by posting ids directly at the API.
 */
requirementsRouter.post(
  '/:projectId/requirements/bulk-approve',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'requirement.bulkApprove');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(bulkApproveBody, req.body);

    const candidates = await prisma.requirement.findMany({
      where: {
        id: { in: body.requirementIds },
        projectId: project.id,
        reviewState: { in: ['DRAFT', 'IN_REVIEW'] },
      },
      include: { citations: { select: { id: true } } },
    });

    const eligible: typeof candidates = [];
    const skipped: { reference: string; reason: string }[] = [];

    for (const requirement of candidates) {
      const confidence = requirement.confidence ? Number(requirement.confidence) : null;
      if (confidence !== null && confidence < BULK_APPROVE_MIN_CONFIDENCE) {
        skipped.push({ reference: requirement.reference, reason: `Confidence ${confidence.toFixed(2)} is below ${BULK_APPROVE_MIN_CONFIDENCE}` });
      } else if (requirement.openQuestion && !requirement.questionAnsweredAt) {
        skipped.push({ reference: requirement.reference, reason: 'Has an unanswered open question' });
      } else if (requirement.citations.length === 0) {
        skipped.push({ reference: requirement.reference, reason: 'Has no source citation' });
      } else if (requirement.priority === 'MUST' && requirement.isAssumption) {
        skipped.push({ reference: requirement.reference, reason: 'A MUST-priority assumption needs explicit review' });
      } else {
        eligible.push(requirement);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const requirement of eligible) {
        await tx.requirement.update({ where: { id: requirement.id }, data: { reviewState: 'APPROVED' } });
        await appendRevision(tx, {
          requirementId: requirement.id,
          action: 'APPROVED',
          actorId: user.id,
          snapshot: snapshotOf(requirement),
          changes: { reviewState: { from: requirement.reviewState, to: 'APPROVED' } },
          reason: body.comment ?? 'Bulk approved',
        });
      }
      if (eligible.length > 0) {
        await recordAudit(
          {
            projectId: project.id,
            actorId: user.id,
            action: 'requirement.bulk_approved',
            entityType: 'Requirement',
            summary: `${user.name} bulk approved ${eligible.length} requirements${skipped.length ? `, ${skipped.length} skipped` : ''}`,
            detail: { approved: eligible.map((r) => r.reference), skipped },
            request: req,
          },
          tx,
        );
      }
    });

    await refreshProjectHealth(project.id);
    res.json({ approved: eligible.length, skipped });
  }),
);

requirementsRouter.post(
  '/:projectId/requirements/:requirementId/answer',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'requirement.edit');
    const project = await requireProjectAccess(user, req.params.projectId);
    const answer = String((req.body as { answer?: unknown })?.answer ?? '').trim();
    if (answer.length < 2) throw badRequest('Write the answer to the open question');

    const existing = await prisma.requirement.findFirst({
      where: { id: req.params.requirementId, projectId: project.id },
    });
    if (!existing) throw notFound('Requirement');
    if (!existing.openQuestion) throw badRequest('This requirement has no open question');

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.requirement.update({
        where: { id: existing.id },
        data: { questionAnswer: answer, questionAnsweredAt: new Date() },
        include: citationInclude,
      });
      await appendRevision(tx, {
        requirementId: existing.id,
        action: 'QUESTION_ANSWERED',
        actorId: user.id,
        snapshot: snapshotOf(existing),
        changes: { questionAnswer: { from: null, to: answer } },
      });
      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'requirement.question_answered',
          entityType: 'Requirement',
          entityId: existing.id,
          summary: `${user.name} answered the open question on ${existing.reference}`,
          detail: { question: existing.openQuestion, answer },
          request: req,
        },
        tx,
      );
      return next;
    });

    await refreshProjectHealth(project.id);
    res.json({ requirement: updated });
  }),
);

/**
 * Split one requirement into several. The parent becomes SUPERSEDED rather than
 * being deleted, because an approved baseline may already reference it.
 */
requirementsRouter.post(
  '/:projectId/requirements/:requirementId/split',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'requirement.edit');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(splitRequirementBody, req.body);

    const parent = await prisma.requirement.findFirst({
      where: { id: req.params.requirementId, projectId: project.id },
      include: { citations: true },
    });
    if (!parent) throw notFound('Requirement');
    assertMutable(parent.reviewState);

    const parentFragmentIds = new Set(parent.citations.map((c) => c.sourceFragmentId));
    for (const part of body.parts) {
      const stray = part.citationFragmentIds.filter((id) => !parentFragmentIds.has(id));
      if (stray.length > 0) {
        throw badRequest('A split part may only cite fragments the original requirement cited');
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const references = await nextReferenceBlock(tx, project.id, 'requirement', body.parts.length);
      const children = [];

      for (const [index, part] of body.parts.entries()) {
        const child = await tx.requirement.create({
          data: {
            projectId: project.id,
            reference: references[index]!,
            title: part.title,
            statement: part.statement,
            requirementClass: parent.requirementClass,
            priority: parent.priority,
            reviewState: 'IN_REVIEW',
            origin: 'SPLIT',
            confidence: parent.confidence,
            acceptanceCriteria: parent.acceptanceCriteria as Prisma.InputJsonValue,
            isExclusion: parent.isExclusion,
            isAssumption: parent.isAssumption,
            aiRunId: parent.aiRunId,
            citations: {
              create: part.citationFragmentIds.map((fragmentId) => ({
                sourceFragmentId: fragmentId,
                quote: parent.citations.find((c) => c.sourceFragmentId === fragmentId)?.quote ?? '',
              })),
            },
          },
          include: citationInclude,
        });
        await appendRevision(tx, {
          requirementId: child.id,
          action: 'CREATED_BY_SPLIT',
          actorId: user.id,
          snapshot: snapshotOf(child),
          reason: `Split from ${parent.reference}`,
        });
        children.push(child);
      }

      await tx.requirement.update({
        where: { id: parent.id },
        data: { reviewState: 'SUPERSEDED' },
      });
      await appendRevision(tx, {
        requirementId: parent.id,
        action: 'SPLIT',
        actorId: user.id,
        snapshot: snapshotOf(parent),
        changes: { splitInto: children.map((c) => c.reference) },
        reason: body.reason ?? null,
      });
      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'requirement.split',
          entityType: 'Requirement',
          entityId: parent.id,
          summary: `${user.name} split ${parent.reference} into ${children.map((c) => c.reference).join(', ')}`,
          detail: { reason: body.reason },
          request: req,
        },
        tx,
      );

      return children;
    });

    res.status(201).json({ requirements: created });
  }),
);

/** Merge duplicates into one, keeping the union of every source citation. */
requirementsRouter.post(
  '/:projectId/requirements/merge',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'requirement.edit');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(mergeRequirementsBody, req.body);

    const parts = await prisma.requirement.findMany({
      where: { id: { in: body.requirementIds }, projectId: project.id },
      include: { citations: true },
    });
    if (parts.length !== body.requirementIds.length) throw notFound('One or more requirements');
    parts.forEach((p) => assertMutable(p.reviewState));

    const merged = await prisma.$transaction(async (tx) => {
      const [reference] = await nextReferenceBlock(tx, project.id, 'requirement', 1);

      // §7.2: "Duplicate or semantically similar requirements are grouped
      // without losing their individual sources."
      const citations = new Map<string, string>();
      for (const part of parts) {
        for (const citation of part.citations) {
          if (!citations.has(citation.sourceFragmentId)) citations.set(citation.sourceFragmentId, citation.quote);
        }
      }

      const criteria = [
        ...new Set(parts.flatMap((p) => (p.acceptanceCriteria as string[]) ?? [])),
      ];

      const created = await tx.requirement.create({
        data: {
          projectId: project.id,
          reference: reference!,
          title: body.title,
          statement: body.statement,
          requirementClass: parts[0]!.requirementClass,
          // The strictest priority among the merged parts wins — merging must
          // never quietly downgrade a MUST into a SHOULD.
          priority: strictestPriority(parts.map((p) => p.priority)),
          reviewState: 'IN_REVIEW',
          origin: 'MERGE',
          confidence: minConfidence(parts.map((p) => (p.confidence ? Number(p.confidence) : null))),
          acceptanceCriteria: criteria as Prisma.InputJsonValue,
          isExclusion: parts.some((p) => p.isExclusion),
          isAssumption: parts.some((p) => p.isAssumption),
          citations: {
            create: [...citations.entries()].map(([sourceFragmentId, quote]) => ({ sourceFragmentId, quote })),
          },
        },
        include: citationInclude,
      });

      await appendRevision(tx, {
        requirementId: created.id,
        action: 'CREATED_BY_MERGE',
        actorId: user.id,
        snapshot: snapshotOf(created),
        reason: `Merged from ${parts.map((p) => p.reference).join(', ')}`,
      });

      for (const part of parts) {
        await tx.requirement.update({
          where: { id: part.id },
          data: { reviewState: 'SUPERSEDED', supersededById: created.id },
        });
        await appendRevision(tx, {
          requirementId: part.id,
          action: 'MERGED',
          actorId: user.id,
          snapshot: snapshotOf(part),
          changes: { mergedInto: created.reference },
          reason: body.reason ?? null,
        });
      }

      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'requirement.merged',
          entityType: 'Requirement',
          entityId: created.id,
          summary: `${user.name} merged ${parts.map((p) => p.reference).join(', ')} into ${created.reference}`,
          detail: { reason: body.reason },
          request: req,
        },
        tx,
      );

      return created;
    });

    res.status(201).json({ requirement: merged });
  }),
);

/* ---------------- conflicts (§7.2, screen PJ-07) ---------------- */

requirementsRouter.get(
  '/:projectId/conflicts',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const conflicts = await prisma.conflict.findMany({
      where: { projectId: project.id },
      orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
      include: {
        citations: {
          include: {
            fragment: {
              select: {
                id: true,
                locator: true,
                text: true,
                source: { select: { id: true, title: true, authority: true, statedAt: true } },
              },
            },
          },
        },
      },
    });

    res.json({ conflicts });
  }),
);

requirementsRouter.post(
  '/:projectId/conflicts/:conflictId/resolve',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'conflict.resolve');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(resolveConflictBody, req.body);

    const conflict = await prisma.conflict.findFirst({
      where: { id: req.params.conflictId, projectId: project.id },
    });
    if (!conflict) throw notFound('Conflict');
    if (conflict.state !== 'OPEN') throw gateFailed('This conflict has already been resolved');

    const resolved = await prisma.$transaction(async (tx) => {
      // §6.1 — a resolved conflict becomes project memory, so the same
      // question is not re-litigated in three months.
      let decisionId: string | null = null;
      if (body.recordAsDecision) {
        const decision = await tx.decision.create({
          data: {
            projectId: project.id,
            question: conflict.summary,
            options: [conflict.statementA, conflict.statementB] as Prisma.InputJsonValue,
            chosen: chosenLabel(body.resolution, conflict.statementA, conflict.statementB),
            rationale: body.rationale,
            decidedById: user.id,
            affectedRecords: [{ type: 'Conflict', id: conflict.id }] as Prisma.InputJsonValue,
          },
        });
        decisionId = decision.id;
      }

      const next = await tx.conflict.update({
        where: { id: conflict.id },
        data: {
          state: 'RESOLVED',
          resolution: body.resolution,
          rationale: body.rationale,
          resolvedById: user.id,
          resolvedAt: new Date(),
          decisionId,
        },
      });

      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'conflict.resolved',
          entityType: 'Conflict',
          entityId: conflict.id,
          summary: `${user.name} resolved a source conflict in favour of ${body.resolution}`,
          detail: { summary: conflict.summary, resolution: body.resolution, rationale: body.rationale },
          request: req,
        },
        tx,
      );

      return next;
    });

    await refreshProjectHealth(project.id);
    res.json({ conflict: resolved });
  }),
);

function assertMutable(state: string): void {
  if (state === 'SUPERSEDED') {
    throw gateFailed('This requirement has been superseded by a split or merge and can no longer be changed.');
  }
}

function chosenLabel(resolution: string, a: string, b: string): string {
  switch (resolution) {
    case 'SIDE_A': return a;
    case 'SIDE_B': return b;
    case 'BOTH': return 'Both statements stand';
    default: return 'Neither statement stands';
  }
}

const PRIORITY_ORDER = ['MUST', 'SHOULD', 'COULD', 'WONT'] as const;
function strictestPriority(priorities: string[]): 'MUST' | 'SHOULD' | 'COULD' | 'WONT' {
  for (const p of PRIORITY_ORDER) if (priorities.includes(p)) return p;
  return 'MUST';
}

/** The merged record is only as trustworthy as its least certain part. */
function minConfidence(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length > 0 ? Math.min(...present) : null;
}
