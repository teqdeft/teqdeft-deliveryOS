import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { approveBaselineBody, proposeBaselineBody, type BaselineDiff, type BaselineDiffEntry } from '@deliveryos/shared';
import { prisma } from '../../db.js';
import { requireUser } from '../../lib/auth.js';
import { parseBody, route } from '../../lib/http.js';
import { requireCapability, requireProjectAccess } from '../../lib/rbac.js';
import { recordAudit } from '../../lib/audit.js';
import { gateFailed, notFound } from '../../lib/errors.js';
import { refreshProjectHealth } from '../projects/health.js';

export const baselinesRouter = Router();

baselinesRouter.get(
  '/:projectId/baselines',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const baselines = await prisma.scopeBaseline.findMany({
      where: { projectId: project.id },
      orderBy: { version: 'desc' },
      include: {
        _count: { select: { requirements: true } },
        approvals: {
          include: { approver: { select: { id: true, name: true, avatarColor: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    res.json({ baselines });
  }),
);

baselinesRouter.get(
  '/:projectId/baselines/:baselineId',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const baseline = await prisma.scopeBaseline.findFirst({
      where: { id: req.params.baselineId, projectId: project.id },
      include: {
        requirements: { orderBy: { requirement: { reference: 'asc' } }, include: { requirement: { select: { reference: true } } } },
        approvals: { include: { approver: { select: { id: true, name: true, avatarColor: true } } } },
      },
    });
    if (!baseline) throw notFound('Baseline');

    const previous = await prisma.scopeBaseline.findFirst({
      where: { projectId: project.id, version: baseline.version - 1 },
      include: { requirements: true },
    });

    res.json({ baseline, diff: buildDiff(previous?.requirements ?? null, baseline.requirements, previous?.version ?? null, baseline.version) });
  }),
);

/**
 * Propose version N+1 from the currently approved requirements.
 *
 * Snapshotting happens here rather than at approval time so the approver sees
 * exactly the text they are signing, and a last-second edit between proposal
 * and approval cannot slip into the baseline unnoticed.
 */
baselinesRouter.post(
  '/:projectId/baselines',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'baseline.propose');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(proposeBaselineBody, req.body);

    const pending = await prisma.scopeBaseline.findFirst({
      where: { projectId: project.id, state: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
      select: { id: true, version: true },
    });
    if (pending) {
      throw gateFailed(`Version ${pending.version} is already awaiting approval. Approve or withdraw it first.`, {
        baselineId: pending.id,
      });
    }

    const approved = await prisma.requirement.findMany({
      where: { projectId: project.id, reviewState: 'APPROVED' },
      include: { citations: { include: { fragment: { select: { locator: true, source: { select: { title: true, authority: true } } } } } } },
      orderBy: { reference: 'asc' },
    });

    if (approved.length === 0) {
      throw gateFailed('No requirements are approved yet. Review them in the Requirements Studio first.');
    }

    const openConflicts = await prisma.conflict.count({ where: { projectId: project.id, state: 'OPEN' } });
    if (openConflicts > 0) {
      // §5 stage 3: critical questions must be answered before the scope gate.
      throw gateFailed(
        `${openConflicts} source conflict${openConflicts === 1 ? '' : 's'} still unresolved. A baseline built over a known contradiction is not a baseline.`,
      );
    }

    const baseline = await prisma.$transaction(async (tx) => {
      const last = await tx.scopeBaseline.findFirst({
        where: { projectId: project.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;

      const created = await tx.scopeBaseline.create({
        data: {
          projectId: project.id,
          version,
          title: body.title,
          state: 'PENDING_APPROVAL',
          changeReason: body.changeReason ?? null,
          effectiveDate: body.effectiveDate ?? null,
          proposedById: user.id,
          proposedAt: new Date(),
          requirements: {
            create: approved.map((r) => ({
              requirementId: r.id,
              title: r.title,
              statement: r.statement,
              requirementClass: r.requirementClass,
              priority: r.priority,
              acceptanceCriteria: r.acceptanceCriteria as Prisma.InputJsonValue,
              isExclusion: r.isExclusion,
              citationSnapshot: r.citations.map((c) => ({
                fragmentId: c.sourceFragmentId,
                locator: c.fragment.locator,
                sourceTitle: c.fragment.source.title,
                authority: c.fragment.source.authority,
                quote: c.quote,
              })) as Prisma.InputJsonValue,
            })),
          },
        },
        include: { _count: { select: { requirements: true } } },
      });

      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'baseline.proposed',
          entityType: 'ScopeBaseline',
          entityId: created.id,
          summary: `${user.name} proposed scope baseline v${version} with ${approved.length} requirements`,
          detail: { version, requirementCount: approved.length, changeReason: body.changeReason },
          request: req,
        },
        tx,
      );

      return created;
    });

    res.status(201).json({ baseline });
  }),
);

/**
 * Approve the baseline. This is the irreversible act the whole intake flow
 * builds toward — §7.3: "The baseline is immutable; changes create a new
 * version with approver, reason and effective date."
 */
baselinesRouter.post(
  '/:projectId/baselines/:baselineId/approve',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'baseline.approve');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(approveBaselineBody, req.body);

    const baseline = await prisma.scopeBaseline.findFirst({
      where: { id: req.params.baselineId, projectId: project.id },
      include: { _count: { select: { requirements: true } } },
    });
    if (!baseline) throw notFound('Baseline');
    if (baseline.state === 'APPROVED') throw gateFailed('This baseline is already approved. Propose a new version instead.');
    if (baseline.state === 'SUPERSEDED') throw gateFailed('This baseline has been superseded.');

    // Typing the project code is deliberate friction on an irreversible act.
    if (body.confirmProjectCode.trim().toUpperCase() !== project.code.toUpperCase()) {
      throw gateFailed(`Type the project code (${project.code}) to confirm this approval.`);
    }

    // §8.3 requires "PM + authorised lead" — two different people. A single
    // person holding both roles must still get a second signature.
    if (baseline.proposedById === user.id && project.technicalLeadId && project.technicalLeadId !== user.id) {
      throw gateFailed(
        'You proposed this baseline. Approving your own proposal is not a second opinion — ask the technical lead or delivery head to approve it.',
      );
    }

    const approved = await prisma.$transaction(async (tx) => {
      const previous = await tx.scopeBaseline.findFirst({
        where: { projectId: project.id, state: 'APPROVED' },
        select: { id: true, version: true },
      });

      if (previous) {
        await tx.scopeBaseline.update({
          where: { id: previous.id },
          data: { state: 'SUPERSEDED', supersededAt: new Date() },
        });
      }

      const next = await tx.scopeBaseline.update({
        where: { id: baseline.id },
        data: {
          state: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
          effectiveDate: baseline.effectiveDate ?? new Date(),
        },
        include: { _count: { select: { requirements: true } } },
      });

      await tx.approval.create({
        data: {
          projectId: project.id,
          subject: 'SCOPE_BASELINE',
          decision: 'APPROVED',
          comment: body.comment ?? null,
          approverId: user.id,
          baselineId: baseline.id,
          baselineVersion: baseline.version,
        },
      });

      await tx.project.update({
        where: { id: project.id },
        data: { stage: 'DELIVERY_PLANNING' },
      });

      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'baseline.approved',
          entityType: 'ScopeBaseline',
          entityId: baseline.id,
          summary: `${user.name} approved scope baseline v${baseline.version} — ${baseline._count.requirements} requirements are now the agreed scope`,
          detail: {
            version: baseline.version,
            requirementCount: baseline._count.requirements,
            supersededVersion: previous?.version ?? null,
            comment: body.comment,
          },
          request: req,
        },
        tx,
      );

      return next;
    });

    await refreshProjectHealth(project.id);
    res.json({ baseline: approved });
  }),
);

/** Diff between two versions — the "scope comparison" §7.3 asks for. */
function buildDiff(
  previous: { requirementId: string; title: string; statement: string; priority: string }[] | null,
  current: { requirementId: string; title: string; statement: string; priority: string }[],
  fromVersion: number | null,
  toVersion: number,
): BaselineDiff {
  const entries: BaselineDiffEntry[] = [];
  const previousById = new Map((previous ?? []).map((r) => [r.requirementId, r]));
  const currentIds = new Set(current.map((r) => r.requirementId));

  for (const item of current) {
    const before = previousById.get(item.requirementId);
    if (!before) {
      entries.push({ requirementId: item.requirementId, title: item.title, change: 'ADDED' });
      continue;
    }
    const fields: string[] = [];
    if (before.title !== item.title) fields.push('title');
    if (before.statement !== item.statement) fields.push('statement');
    if (before.priority !== item.priority) fields.push('priority');

    entries.push(
      fields.length > 0
        ? { requirementId: item.requirementId, title: item.title, change: 'MODIFIED', fields }
        : { requirementId: item.requirementId, title: item.title, change: 'UNCHANGED' },
    );
  }

  for (const item of previous ?? []) {
    if (!currentIds.has(item.requirementId)) {
      entries.push({ requirementId: item.requirementId, title: item.title, change: 'REMOVED' });
    }
  }

  return {
    fromVersion,
    toVersion,
    entries,
    summary: {
      added: entries.filter((e) => e.change === 'ADDED').length,
      removed: entries.filter((e) => e.change === 'REMOVED').length,
      modified: entries.filter((e) => e.change === 'MODIFIED').length,
      unchanged: entries.filter((e) => e.change === 'UNCHANGED').length,
    },
  };
}
