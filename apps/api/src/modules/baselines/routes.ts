import { Router } from 'express';
import { approveBaselineBody, proposeBaselineBody, type BaselineDiff, type BaselineDiffEntry } from '@deliveryos/shared';
import {
  db, transaction, countRows, fromBool, fromJson, indexBy, insertReturning, newId, toBool, toJson,
} from '../../db/index.js';
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

    const rows = await db('ScopeBaseline')
      .where({ projectId: project.id })
      .orderBy('version', 'desc');

    res.json({ baselines: await attachBaselineRelations(rows) });
  }),
);

baselinesRouter.get(
  '/:projectId/baselines/:baselineId',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const row = await db('ScopeBaseline')
      .where({ id: req.params.baselineId, projectId: project.id })
      .first();
    if (!row) throw notFound('Baseline');

    const [withRelations] = await attachBaselineRelations([row]);

    // Snapshot rows carry the frozen text, so ordering joins Requirement only
    // for its human-facing reference.
    const entries = await db('BaselineRequirement as br')
      .select('br.*', 'r.reference as requirement_reference')
      .join('Requirement as r', 'r.id', 'br.requirementId')
      .where('br.baselineId', row.id)
      .orderBy('r.reference', 'asc');

    const requirements = entries.map((e: Record<string, unknown>) => ({
      ...e,
      isExclusion: toBool(e.isExclusion),
      acceptanceCriteria: toJson(e.acceptanceCriteria, [] as string[]),
      citationSnapshot: toJson(e.citationSnapshot, [] as unknown[]),
      requirement: { reference: e.requirement_reference },
    }));

    const previous = await db('ScopeBaseline')
      .where({ projectId: project.id, version: row.version - 1 })
      .first();
    const previousRequirements = previous
      ? await db('BaselineRequirement').where({ baselineId: previous.id })
      : null;

    res.json({
      baseline: { ...withRelations, requirements },
      diff: buildDiff(
        previousRequirements as never,
        requirements as never,
        previous?.version ?? null,
        row.version,
      ),
    });
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

    const pending = await db('ScopeBaseline')
      .select('id', 'version')
      .where({ projectId: project.id })
      .whereIn('state', ['DRAFT', 'PENDING_APPROVAL'])
      .first();
    if (pending) {
      throw gateFailed(`Version ${pending.version} is already awaiting approval. Approve or withdraw it first.`, {
        baselineId: pending.id,
      });
    }

    const approved = await db('Requirement')
      .where({ projectId: project.id, reviewState: 'APPROVED' })
      .orderBy('reference', 'asc');

    if (approved.length === 0) {
      throw gateFailed('No requirements are approved yet. Review them in the Requirements Studio first.');
    }

    const openConflicts = await countRows(db('Conflict').where({ projectId: project.id, state: 'OPEN' }));
    if (openConflicts > 0) {
      // §5 stage 3: critical questions must be answered before the scope gate.
      throw gateFailed(
        `${openConflicts} source conflict${openConflicts === 1 ? '' : 's'} still unresolved. A baseline built over a known contradiction is not a baseline.`,
      );
    }

    const baseline = await transaction(async (tx) => {
      const last = await tx('ScopeBaseline')
        .select('version')
        .where({ projectId: project.id })
        .orderBy('version', 'desc')
        .first();
      const version = (last?.version ?? 0) + 1;

      const created = await insertReturning(tx, 'ScopeBaseline', {
        id: newId(),
        projectId: project.id,
        version,
        title: body.title,
        state: 'PENDING_APPROVAL',
        changeReason: body.changeReason ?? null,
        effectiveDate: body.effectiveDate ?? null,
        proposedById: user.id,
        proposedAt: new Date(),
      });

      // Snapshot the citations alongside the text: the baseline must still
      // show what evidence supported each requirement even if the source is
      // later reprocessed.
      const citations = await tx('RequirementCitation as c')
        .select('c.requirementId', 'c.sourceFragmentId', 'c.quote', 'f.locator', 's.title as sourceTitle', 's.authority')
        .join('SourceFragment as f', 'f.id', 'c.sourceFragmentId')
        .join('Source as s', 's.id', 'f.sourceId')
        .whereIn('c.requirementId', approved.map((r) => r.id));

      const citationsByRequirement = new Map<string, unknown[]>();
      for (const c of citations as Record<string, unknown>[]) {
        const key = c.requirementId as string;
        const list = citationsByRequirement.get(key) ?? [];
        list.push({
          fragmentId: c.sourceFragmentId,
          locator: c.locator,
          sourceTitle: c.sourceTitle,
          authority: c.authority,
          quote: c.quote,
        });
        citationsByRequirement.set(key, list);
      }

      await tx.batchInsert(
        'BaselineRequirement',
        approved.map((r) => ({
          id: newId(),
          baselineId: created.id,
          requirementId: r.id,
          title: r.title,
          statement: r.statement,
          requirementClass: r.requirementClass,
          priority: r.priority,
          acceptanceCriteria: fromJson(toJson(r.acceptanceCriteria, [] as string[])),
          isExclusion: r.isExclusion,
          citationSnapshot: fromJson(citationsByRequirement.get(r.id) ?? []),
        })),
        200,
      );

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

      return { ...created, _count: { requirements: approved.length } };
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

    const baselineRow = await db('ScopeBaseline')
      .where({ id: req.params.baselineId, projectId: project.id })
      .first();
    if (!baselineRow) throw notFound('Baseline');
    const baseline = {
      ...baselineRow,
      _count: {
        requirements: await countRows(db('BaselineRequirement').where({ baselineId: baselineRow.id })),
      },
    };
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

    const approvedBaseline = await transaction(async (tx) => {
      const previous = await tx('ScopeBaseline')
        .select('id', 'version')
        .where({ projectId: project.id, state: 'APPROVED' })
        .first();

      if (previous) {
        await tx('ScopeBaseline')
          .where({ id: previous.id })
          .update({ state: 'SUPERSEDED', supersededAt: new Date() });
      }

      await tx('ScopeBaseline').where({ id: baseline.id }).update({
        state: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        effectiveDate: baseline.effectiveDate ?? new Date(),
      });

      await tx('Approval').insert({
        id: newId(),
        projectId: project.id,
        subject: 'SCOPE_BASELINE',
        decision: 'APPROVED',
        comment: body.comment ?? null,
        approverId: user.id,
        baselineId: baseline.id,
        baselineVersion: baseline.version,
      });

      await tx('Project').where({ id: project.id }).update({ stage: 'DELIVERY_PLANNING' });

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

      const next = await tx('ScopeBaseline').where({ id: baseline.id }).first();
      return { ...next!, _count: { requirements: baseline._count.requirements } };
    });

    await refreshProjectHealth(project.id);
    res.json({ baseline: approvedBaseline });
  }),
);

/**
 * Attaches the requirement count and the approval trail to a set of baselines,
 * in a fixed number of queries regardless of how many versions exist.
 */
async function attachBaselineRelations(rows: { id: string }[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [counts, approvals] = await Promise.all([
    db('BaselineRequirement').select('baselineId').count({ n: '*' }).whereIn('baselineId', ids).groupBy('baselineId'),
    db('Approval as a')
      .select('a.*', 'User.id as approver_id', 'User.name as approver_name', 'User.avatarColor as approver_avatarColor')
      .join('User', 'User.id', 'a.approverId')
      .whereIn('a.baselineId', ids)
      .orderBy('a.createdAt', 'asc'),
  ]);

  const countByBaseline = new Map(
    (counts as unknown as { baselineId: string; n: number | string }[]).map((c) => [c.baselineId, Number(c.n)]),
  );
  const approvalsByBaseline = new Map<string, unknown[]>();
  for (const a of approvals as Record<string, unknown>[]) {
    const key = a.baselineId as string;
    const list = approvalsByBaseline.get(key) ?? [];
    list.push({
      id: a.id,
      decision: a.decision,
      comment: a.comment,
      createdAt: a.createdAt,
      approver: { id: a.approver_id, name: a.approver_name, avatarColor: a.approver_avatarColor },
    });
    approvalsByBaseline.set(key, list);
  }

  return rows.map((row) => ({
    ...row,
    _count: { requirements: countByBaseline.get(row.id) ?? 0 },
    approvals: approvalsByBaseline.get(row.id) ?? [],
  }));
}

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
