import { Router } from 'express';
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
import {
  db, transaction, countRows, defined, fromBool, fromJson, groupBy, indexBy,
  insertReturning, likeContains, newId, paginateQuery, toBool, toDecimalString, toJson, toNumber,
  type RequirementRow,
} from '../../db/index.js';
import { requireUser } from '../../lib/auth.js';
import { paginate, parseBody, parseQuery, route } from '../../lib/http.js';
import { requireCapability, requireProjectAccess } from '../../lib/rbac.js';
import { diffFields, recordAudit } from '../../lib/audit.js';
import { badRequest, gateFailed, notFound } from '../../lib/errors.js';
import { nextReferenceBlock } from '../../lib/reference.js';
import { refreshProjectHealth } from '../projects/health.js';
import { appendRevision, snapshotOf } from './revisions.js';

export const requirementsRouter = Router();

/** Booleans and JSON columns need normalising before they leave the API. */
function presentRequirement(row: RequirementRow, citations: unknown[] = []) {
  return {
    ...row,
    isExclusion: toBool(row.isExclusion),
    isAssumption: toBool(row.isAssumption),
    confidence: toDecimalString(row.confidence),
    acceptanceCriteria: toJson(row.acceptanceCriteria, [] as string[]),
    citations,
  };
}

/**
 * Loads every citation for a set of requirements in one pass, with its
 * fragment and that fragment's source.
 *
 * This is what Prisma's nested `include` produced. Written as three `WHERE IN`
 * queries rather than one per requirement so the studio's 200-row page stays a
 * constant number of round trips.
 */
async function loadCitations(requirementIds: string[]) {
  if (requirementIds.length === 0) return new Map<string, unknown[]>();

  const citations = await db('RequirementCitation').whereIn('requirementId', requirementIds);
  if (citations.length === 0) return new Map<string, unknown[]>();

  const fragments = await db('SourceFragment')
    .select('id', 'locator', 'text', 'sourceId')
    .whereIn('id', [...new Set(citations.map((c) => c.sourceFragmentId))]);
  const sources = await db('Source')
    .select('id', 'title', 'kind', 'authority', 'statedAt')
    .whereIn('id', [...new Set(fragments.map((f) => f.sourceId))]);

  const sourceById = indexBy(sources, 'id');
  const fragmentById = indexBy(fragments, 'id');

  const shaped = citations.map((c) => {
    const fragment = fragmentById.get(c.sourceFragmentId);
    return {
      id: c.id,
      requirementId: c.requirementId,
      sourceFragmentId: c.sourceFragmentId,
      quote: c.quote,
      fragment: fragment
        ? {
            id: fragment.id,
            locator: fragment.locator,
            text: fragment.text,
            source: sourceById.get(fragment.sourceId) ?? null,
          }
        : null,
    };
  });

  return groupBy(shaped, 'requirementId') as unknown as Map<string, unknown[]>;
}

/** One requirement, shaped exactly as the detail endpoint has always returned it. */
async function requirementWithCitations(id: string) {
  const row = await db('Requirement').where({ id }).first();
  if (!row) return null;
  const citations = await loadCitations([id]);
  return presentRequirement(row, citations.get(id) ?? []);
}


requirementsRouter.get(
  '/:projectId/requirements',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);
    const q = parseQuery(requirementListQuery, req.query);

    const base = db('Requirement').where({ projectId: project.id });

    // Superseded rows exist only so approved baselines keep resolving; they
    // are history, not work, and must not clutter the studio.
    if (q.reviewState) base.where('reviewState', q.reviewState);
    else base.whereNot('reviewState', 'SUPERSEDED');

    if (q.requirementClass) base.where('requirementClass', q.requirementClass);
    if (q.priority) base.where('priority', q.priority);
    if (q.isExclusion !== undefined) base.where('isExclusion', fromBool(q.isExclusion));
    if (q.hasOpenQuestion) base.whereNotNull('openQuestion').whereNull('questionAnsweredAt');
    if (q.minConfidence !== undefined) base.where('confidence', '>=', q.minConfidence);
    if (q.search) {
      const term = likeContains(q.search);
      base.where((w) =>
        w.where('title', 'like', term).orWhere('statement', 'like', term).orWhere('reference', 'like', term),
      );
    }

    const { items: rows, total } = await paginateQuery<RequirementRow>(
      base.clone().select('*').orderBy('reference', 'asc'),
      q.page,
      q.pageSize,
    );

    const [citations, tallyRows] = await Promise.all([
      loadCitations(rows.map((r) => r.id)),
      db('Requirement')
        .select('reviewState')
        .count({ n: '*' })
        .where({ projectId: project.id })
        .whereNot('reviewState', 'SUPERSEDED')
        .groupBy('reviewState'),
    ]);

    res.json({
      ...paginate(
        rows.map((row) => presentRequirement(row, citations.get(row.id) ?? [])),
        total,
        q.page,
        q.pageSize,
      ),
      tally: Object.fromEntries(
        (tallyRows as unknown as { reviewState: string; n: number | string }[]).map((t) => [
          t.reviewState,
          Number(t.n),
        ]),
      ),
      bulkApproveMinConfidence: BULK_APPROVE_MIN_CONFIDENCE,
    });
  }),
);

requirementsRouter.get(
  '/:projectId/requirements/:requirementId',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const row = await db('Requirement')
      .where({ id: req.params.requirementId, projectId: project.id })
      .first();
    if (!row) throw notFound('Requirement');

    const [citations, revisions, aiRun] = await Promise.all([
      loadCitations([row.id]),
      db('RequirementRevision as r')
        .select(
          'r.*',
          'User.id as actor_id',
          'User.name as actor_name',
          'User.avatarColor as actor_avatarColor',
        )
        .join('User', 'User.id', 'r.actorId')
        .where('r.requirementId', row.id)
        .orderBy('r.revision', 'desc'),
      row.aiRunId
        ? db('AiRun')
            .select('id', 'model', 'provider', 'promptVersion', 'createdAt')
            .where({ id: row.aiRunId })
            .first()
        : Promise.resolve(undefined),
    ]);

    res.json({
      requirement: {
        ...presentRequirement(row, citations.get(row.id) ?? []),
        revisions: (revisions as Record<string, unknown>[]).map((r) => ({
          id: r.id,
          revision: r.revision,
          action: r.action,
          changes: toJson(r.changes, {}),
          snapshot: toJson(r.snapshot, {}),
          reason: r.reason,
          createdAt: r.createdAt,
          actor: { id: r.actor_id, name: r.actor_name, avatarColor: r.actor_avatarColor },
        })),
        aiRun: aiRun ?? null,
      },
    });
  }),
);

requirementsRouter.patch(
  '/:projectId/requirements/:requirementId',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'requirement.edit');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(updateRequirementBody, req.body);

    const existing = await db('Requirement')
      .where({ id: req.params.requirementId, projectId: project.id })
      .first();
    if (!existing) throw notFound('Requirement');

    assertMutable(existing.reviewState);

    const { editReason, ...fields } = body;
    const changes = diffFields(
      presentRequirement(existing) as unknown as Record<string, unknown>,
      fields as Record<string, unknown>,
    );
    if (Object.keys(changes).length === 0) {
      res.json({ requirement: presentRequirement(existing, (await loadCitations([existing.id])).get(existing.id) ?? []) });
      return;
    }

    await transaction(async (tx) => {
      await tx('Requirement')
        .where({ id: existing.id })
        .update(
          defined({
            ...fields,
            isExclusion: fields.isExclusion === undefined ? undefined : fromBool(fields.isExclusion),
            isAssumption: fields.isAssumption === undefined ? undefined : fromBool(fields.isAssumption),
            acceptanceCriteria:
              fields.acceptanceCriteria === undefined ? undefined : fromJson(fields.acceptanceCriteria),
            // A human touching an AI draft moves it out of DRAFT: someone has
            // now looked at it, which is exactly what the tally should show.
            reviewState: existing.reviewState === 'DRAFT' ? 'IN_REVIEW' : undefined,
          }) as never,
        );

      await appendRevision(tx, {
        requirementId: existing.id,
        action: 'EDITED',
        actorId: user.id,
        snapshot: snapshotOf(presentRequirement(existing) as never),
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
    });

    res.json({ requirement: await requirementWithCitations(existing.id) });
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

    const existing = await db('Requirement')
      .where({ id: req.params.requirementId, projectId: project.id })
      .first();
    if (!existing) throw notFound('Requirement');
    assertMutable(existing.reviewState);

    const citationCount = await countRows(db('RequirementCitation').where({ requirementId: existing.id }));

    if (body.decision === 'APPROVE') {
      // "Evidence before inference" (§3.1) enforced at the gate, not just in
      // the extractor: an uncited requirement cannot become approved scope.
      if (citationCount === 0) {
        throw gateFailed('This requirement has no source citation. Add one, or reject it.');
      }
      if (existing.openQuestion && !existing.questionAnsweredAt) {
        throw gateFailed(
          'Answer the open question before approving. An approved requirement with an unanswered question is exactly the ambiguity this system exists to prevent.',
          { openQuestion: existing.openQuestion },
        );
      }
    }

    const nextState = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await transaction(async (tx) => {
      await tx('Requirement').where({ id: existing.id }).update({ reviewState: nextState });

      await appendRevision(tx, {
        requirementId: existing.id,
        action: nextState,
        actorId: user.id,
        snapshot: snapshotOf(presentRequirement(existing) as never),
        changes: { reviewState: { from: existing.reviewState, to: nextState } },
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
          detail: { comment: body.comment, confidence: toNumber(existing.confidence) },
          request: req,
        },
        tx,
      );
    });

    await refreshProjectHealth(project.id);
    res.json({ requirement: await requirementWithCitations(existing.id) });
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

    const candidates = await db('Requirement')
      .whereIn('id', body.requirementIds)
      .where({ projectId: project.id })
      .whereIn('reviewState', ['DRAFT', 'IN_REVIEW']);

    const citationCounts = await db('RequirementCitation')
      .select('requirementId')
      .count({ n: '*' })
      .whereIn('requirementId', candidates.map((c) => c.id))
      .groupBy('requirementId');
    const hasCitation = new Map(
      (citationCounts as unknown as { requirementId: string; n: number | string }[]).map((c) => [
        c.requirementId,
        Number(c.n),
      ]),
    );

    const eligible: RequirementRow[] = [];
    const skipped: { reference: string; reason: string }[] = [];

    for (const requirement of candidates) {
      const confidence = toNumber(requirement.confidence);
      if (confidence !== null && confidence < BULK_APPROVE_MIN_CONFIDENCE) {
        skipped.push({
          reference: requirement.reference,
          reason: `Confidence ${confidence.toFixed(2)} is below ${BULK_APPROVE_MIN_CONFIDENCE}`,
        });
      } else if (requirement.openQuestion && !requirement.questionAnsweredAt) {
        skipped.push({ reference: requirement.reference, reason: 'Has an unanswered open question' });
      } else if ((hasCitation.get(requirement.id) ?? 0) === 0) {
        skipped.push({ reference: requirement.reference, reason: 'Has no source citation' });
      } else if (requirement.priority === 'MUST' && toBool(requirement.isAssumption)) {
        skipped.push({ reference: requirement.reference, reason: 'A MUST-priority assumption needs explicit review' });
      } else {
        eligible.push(requirement);
      }
    }

    await transaction(async (tx) => {
      for (const requirement of eligible) {
        await tx('Requirement').where({ id: requirement.id }).update({ reviewState: 'APPROVED' });
        await appendRevision(tx, {
          requirementId: requirement.id,
          action: 'APPROVED',
          actorId: user.id,
          snapshot: snapshotOf(presentRequirement(requirement) as never),
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

    const existing = await db('Requirement')
      .where({ id: req.params.requirementId, projectId: project.id })
      .first();
    if (!existing) throw notFound('Requirement');
    if (!existing.openQuestion) throw badRequest('This requirement has no open question');

    await transaction(async (tx) => {
      await tx('Requirement')
        .where({ id: existing.id })
        .update({ questionAnswer: answer, questionAnsweredAt: new Date() });

      await appendRevision(tx, {
        requirementId: existing.id,
        action: 'QUESTION_ANSWERED',
        actorId: user.id,
        snapshot: snapshotOf(presentRequirement(existing) as never),
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
    });

    await refreshProjectHealth(project.id);
    res.json({ requirement: await requirementWithCitations(existing.id) });
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

    const parent = await db('Requirement')
      .where({ id: req.params.requirementId, projectId: project.id })
      .first();
    if (!parent) throw notFound('Requirement');
    assertMutable(parent.reviewState);

    const parentCitations = await db('RequirementCitation').where({ requirementId: parent.id });
    const parentFragmentIds = new Set(parentCitations.map((c) => c.sourceFragmentId));
    for (const part of body.parts) {
      if (part.citationFragmentIds.some((id) => !parentFragmentIds.has(id))) {
        throw badRequest('A split part may only cite fragments the original requirement cited');
      }
    }

    const createdIds = await transaction(async (tx) => {
      const references = await nextReferenceBlock(tx, project.id, 'requirement', body.parts.length);
      const ids: string[] = [];

      for (const [index, part] of body.parts.entries()) {
        const child = await insertReturning(tx, 'Requirement', {
          id: newId(),
          projectId: project.id,
          reference: references[index]!,
          title: part.title,
          statement: part.statement,
          requirementClass: parent.requirementClass,
          priority: parent.priority,
          reviewState: 'IN_REVIEW',
          origin: 'SPLIT',
          confidence: parent.confidence,
          acceptanceCriteria: fromJson(toJson(parent.acceptanceCriteria, [] as string[])),
          isExclusion: parent.isExclusion,
          isAssumption: parent.isAssumption,
          aiRunId: parent.aiRunId,
        });

        await tx('RequirementCitation').insert(
          part.citationFragmentIds.map((fragmentId) => ({
            id: newId(),
            requirementId: child.id,
            sourceFragmentId: fragmentId,
            quote: parentCitations.find((c) => c.sourceFragmentId === fragmentId)?.quote ?? '',
          })),
        );

        await appendRevision(tx, {
          requirementId: child.id,
          action: 'CREATED_BY_SPLIT',
          actorId: user.id,
          snapshot: snapshotOf(presentRequirement(child) as never),
          reason: `Split from ${parent.reference}`,
        });
        ids.push(child.id);
      }

      await tx('Requirement').where({ id: parent.id }).update({ reviewState: 'SUPERSEDED' });
      await appendRevision(tx, {
        requirementId: parent.id,
        action: 'SPLIT',
        actorId: user.id,
        snapshot: snapshotOf(presentRequirement(parent) as never),
        changes: { splitInto: references },
        reason: body.reason ?? null,
      });
      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'requirement.split',
          entityType: 'Requirement',
          entityId: parent.id,
          summary: `${user.name} split ${parent.reference} into ${references.join(', ')}`,
          detail: { reason: body.reason },
          request: req,
        },
        tx,
      );

      return ids;
    });

    const requirements = await Promise.all(createdIds.map((id) => requirementWithCitations(id)));
    res.status(201).json({ requirements });
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

    const parts = await db('Requirement')
      .whereIn('id', body.requirementIds)
      .where({ projectId: project.id });
    if (parts.length !== body.requirementIds.length) throw notFound('One or more requirements');
    parts.forEach((p) => assertMutable(p.reviewState));

    const partCitations = await db('RequirementCitation').whereIn(
      'requirementId',
      parts.map((p) => p.id),
    );

    const mergedId = await transaction(async (tx) => {
      const [reference] = await nextReferenceBlock(tx, project.id, 'requirement', 1);

      // §7.2: "Duplicate or semantically similar requirements are grouped
      // without losing their individual sources."
      const citations = new Map<string, string>();
      for (const citation of partCitations) {
        if (!citations.has(citation.sourceFragmentId)) {
          citations.set(citation.sourceFragmentId, citation.quote);
        }
      }

      const criteria = [
        ...new Set(parts.flatMap((p) => toJson(p.acceptanceCriteria, [] as string[]))),
      ];

      const created = await insertReturning(tx, 'Requirement', {
        id: newId(),
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
        confidence: minConfidence(parts.map((p) => toNumber(p.confidence)))?.toString() ?? null,
        acceptanceCriteria: fromJson(criteria),
        isExclusion: fromBool(parts.some((p) => toBool(p.isExclusion))),
        isAssumption: fromBool(parts.some((p) => toBool(p.isAssumption))),
      });

      await tx('RequirementCitation').insert(
        [...citations.entries()].map(([sourceFragmentId, quote]) => ({
          id: newId(),
          requirementId: created.id,
          sourceFragmentId,
          quote,
        })),
      );

      await appendRevision(tx, {
        requirementId: created.id,
        action: 'CREATED_BY_MERGE',
        actorId: user.id,
        snapshot: snapshotOf(presentRequirement(created) as never),
        reason: `Merged from ${parts.map((p) => p.reference).join(', ')}`,
      });

      for (const part of parts) {
        await tx('Requirement')
          .where({ id: part.id })
          .update({ reviewState: 'SUPERSEDED', supersededById: created.id });
        await appendRevision(tx, {
          requirementId: part.id,
          action: 'MERGED',
          actorId: user.id,
          snapshot: snapshotOf(presentRequirement(part) as never),
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

      return created.id;
    });

    res.status(201).json({ requirement: await requirementWithCitations(mergedId) });
  }),
);

/* ---------------- conflicts (§7.2, screen PJ-07) ---------------- */

requirementsRouter.get(
  '/:projectId/conflicts',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const conflicts = await db('Conflict')
      .where({ projectId: project.id })
      .orderBy([{ column: 'state', order: 'asc' }, { column: 'createdAt', order: 'desc' }]);

    if (conflicts.length === 0) {
      res.json({ conflicts: [] });
      return;
    }

    const citations = await db('ConflictCitation').whereIn('conflictId', conflicts.map((c) => c.id));
    const fragments = await db('SourceFragment')
      .select('id', 'locator', 'text', 'sourceId')
      .whereIn('id', [...new Set(citations.map((c) => c.sourceFragmentId))]);
    const sources = await db('Source')
      .select('id', 'title', 'authority', 'statedAt')
      .whereIn('id', [...new Set(fragments.map((f) => f.sourceId))]);

    const sourceById = indexBy(sources, 'id');
    const fragmentById = indexBy(fragments, 'id');
    const byConflict = groupBy(
      citations.map((c) => {
        const fragment = fragmentById.get(c.sourceFragmentId);
        return {
          id: c.id,
          conflictId: c.conflictId,
          side: c.side,
          quote: c.quote,
          fragment: fragment
            ? {
                id: fragment.id,
                locator: fragment.locator,
                text: fragment.text,
                source: sourceById.get(fragment.sourceId) ?? null,
              }
            : null,
        };
      }),
      'conflictId',
    );

    res.json({
      conflicts: conflicts.map((c) => ({ ...c, citations: byConflict.get(c.id) ?? [] })),
    });
  }),
);

requirementsRouter.post(
  '/:projectId/conflicts/:conflictId/resolve',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'conflict.resolve');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(resolveConflictBody, req.body);

    const conflict = await db('Conflict')
      .where({ id: req.params.conflictId, projectId: project.id })
      .first();
    if (!conflict) throw notFound('Conflict');
    if (conflict.state !== 'OPEN') throw gateFailed('This conflict has already been resolved');

    const resolved = await transaction(async (tx) => {
      // §6.1 — a resolved conflict becomes project memory, so the same
      // question is not re-litigated in three months.
      let decisionId: string | null = null;
      if (body.recordAsDecision) {
        const decision = await insertReturning(tx, 'Decision', {
          id: newId(),
          projectId: project.id,
          question: conflict.summary,
          options: fromJson([conflict.statementA, conflict.statementB]),
          chosen: chosenLabel(body.resolution, conflict.statementA, conflict.statementB),
          rationale: body.rationale,
          decidedById: user.id,
          affectedRecords: fromJson([{ type: 'Conflict', id: conflict.id }]),
        });
        decisionId = decision.id;
      }

      await tx('Conflict').where({ id: conflict.id }).update({
        state: 'RESOLVED',
        resolution: body.resolution,
        rationale: body.rationale,
        resolvedById: user.id,
        resolvedAt: new Date(),
        decisionId,
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

      return tx('Conflict').where({ id: conflict.id }).first();
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
