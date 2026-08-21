import { Router } from 'express';
import {
  INTAKE_CHECKLIST_ITEMS,
  createProjectBody,
  projectListQuery,
  updateIntakeChecklistBody,
  updateProjectBody,
  addMemberBody,
} from '@deliveryos/shared';
import {
  db,
  transaction,
  countRows,
  defined,
  fromBool,
  fromJson,
  indexBy,
  insertReturning,
  likeContains,
  newId,
  paginateQuery,
  toBool,
  toDecimalString,
  toJson,
  type ProjectRow,
} from '../../db/index.js';
import { requireUser } from '../../lib/auth.js';
import { paginate, parseBody, parseQuery, route } from '../../lib/http.js';
import { projectScope, redactCommercial, requireCapability, requireProjectAccess, can } from '../../lib/rbac.js';
import { diffFields, recordAudit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { refreshProjectHealth } from './health.js';

export const projectsRouter = Router();

/**
 * Shapes a Project row the way the API has always returned it. Booleans come
 * back from MySQL as 0/1 and JSON columns may arrive as text, so normalising
 * here keeps every caller — and the web app — unchanged.
 */
function presentProject(row: ProjectRow) {
  return {
    ...row,
    externalAiEnabled: toBool(row.externalAiEnabled),
    // MySQL renders DECIMAL(14,2) as "850000.00" where the API has always
    // returned "850000". Same number, different bytes.
    contractValue: toDecimalString(row.contractValue),
    healthFacts: toJson(row.healthFacts, [] as unknown[]),
    intakeChecklist: toJson(row.intakeChecklist, {} as Record<string, unknown>),
  };
}

projectsRouter.get(
  '/',
  route(async (req, res) => {
    const user = requireUser(req);
    const q = parseQuery(projectListQuery, req.query);

    const base = projectScope(user)(db('Project').whereNull('Project.archivedAt'));

    if (q.stage) base.where('Project.stage', q.stage);
    if (q.health) base.where('Project.health', q.health);
    if (q.engagementType) base.where('Project.engagementType', q.engagementType);
    if (q.clientId) base.where('Project.clientId', q.clientId);
    if (q.projectManagerId) base.where('Project.projectManagerId', q.projectManagerId);
    if (q.search) {
      // The schema uses a case-insensitive collation, so LIKE matches the way
      // Prisma's `mode: 'insensitive'` did on PostgreSQL.
      const term = likeContains(q.search);
      base.where((w) =>
        w
          .where('Project.name', 'like', term)
          .orWhere('Project.code', 'like', term)
          .orWhereIn('Project.clientId', (sub) =>
            sub.select('id').from('Client').where('name', 'like', term),
          ),
      );
    }

    const listed = base
      .clone()
      .select('Project.*')
      .orderBy([
        // Ordering by the enum's declaration order puts GREEN first, exactly as
        // the PostgreSQL enum ordering did.
        { column: 'Project.health', order: 'asc' },
        { column: 'Project.targetLaunchDate', order: 'asc' },
        { column: 'Project.createdAt', order: 'desc' },
      ]);

    const { items: rows, total } = await paginateQuery<ProjectRow>(listed, q.page, q.pageSize);

    const projects = await attachProjectRelations(rows);
    res.json(paginate(projects.map((p) => redactCommercial(user, p)), total, q.page, q.pageSize));
  }),
);

/** One extra query per relation for the whole page, rather than one per row. */
async function attachProjectRelations(rows: ProjectRow[]) {
  if (rows.length === 0) return [];
  const projectIds = rows.map((r) => r.id);

  const [clients, people, requirementCounts, sourceCounts, workItemCounts] = await Promise.all([
    db('Client').select('id', 'name').whereIn('id', rows.map((r) => r.clientId)),
    db('User')
      .select('id', 'name', 'avatarColor')
      .whereIn('id', rows.map((r) => r.projectManagerId)),
    db('Requirement').select('projectId').count({ n: '*' }).whereIn('projectId', projectIds).groupBy('projectId'),
    db('Source').select('projectId').count({ n: '*' }).whereIn('projectId', projectIds).groupBy('projectId'),
    db('WorkItem').select('projectId').count({ n: '*' }).whereIn('projectId', projectIds).groupBy('projectId'),
  ]);

  const clientById = indexBy(clients, 'id');
  const personById = indexBy(people, 'id');
  const tally = (list: { projectId: string; n: number | string }[]) =>
    new Map(list.map((r) => [r.projectId, Number(r.n)]));
  const reqs = tally(requirementCounts as never);
  const srcs = tally(sourceCounts as never);
  const items = tally(workItemCounts as never);

  return rows.map((row) => ({
    ...presentProject(row),
    client: clientById.get(row.clientId) ?? null,
    projectManager: personById.get(row.projectManagerId) ?? null,
    _count: {
      requirements: reqs.get(row.id) ?? 0,
      sources: srcs.get(row.id) ?? 0,
      workItems: items.get(row.id) ?? 0,
    },
  }));
}

projectsRouter.post(
  '/',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'project.create');
    const body = parseBody(createProjectBody, req.body);

    const [client, pm, existing] = await Promise.all([
      db('Client').select('id', 'name').where({ id: body.clientId }).first(),
      db('User').select('id', 'isActive').where({ id: body.projectManagerId }).first(),
      db('Project').select('id').where({ code: body.code }).first(),
    ]);

    if (!client) throw notFound('Client');
    if (!pm || !toBool(pm.isActive)) throw badRequest('The nominated project manager is not an active user');
    if (existing) throw conflict(`Project code ${body.code} is already in use`);

    const project = await transaction(async (tx) => {
      const created = await insertReturning(tx, 'Project', {
        id: newId(),
        code: body.code,
        name: body.name,
        summary: body.summary || null,
        clientId: body.clientId,
        engagementType: body.engagementType,
        confidentiality: body.confidentiality,
        projectManagerId: body.projectManagerId,
        technicalLeadId: body.technicalLeadId || null,
        startDate: body.startDate ?? null,
        targetLaunchDate: body.targetLaunchDate ?? null,
        contractValue: body.contractValue?.toString() ?? null,
        currency: body.currency,
        externalAiEnabled: fromBool(body.externalAiEnabled),
        healthFacts: fromJson([]),
        // Every checklist item starts explicitly false rather than absent, so
        // "not yet done" and "nobody has looked" read the same in the UI.
        intakeChecklist: fromJson(
          Object.fromEntries(INTAKE_CHECKLIST_ITEMS.map((i) => [i.key, { done: false, note: null }])),
        ),
      });

      // The PM and tech lead are members by construction; forgetting to add
      // them would lock the owners out of their own project.
      const memberIds = [...new Set([body.projectManagerId, body.technicalLeadId].filter(Boolean) as string[])];
      if (memberIds.length > 0) {
        await tx('ProjectMember').insert(
          memberIds.map((userId) => ({
            id: newId(),
            projectId: created.id,
            userId,
            projectRole: userId === body.projectManagerId ? ('PROJECT_MANAGER' as const) : ('CTO' as const),
          })),
        );
      }

      await recordAudit(
        {
          projectId: created.id,
          actorId: user.id,
          action: 'project.created',
          entityType: 'Project',
          entityId: created.id,
          summary: `${user.name} created ${created.code} — ${created.name} for ${client.name}`,
          detail: { engagementType: body.engagementType, confidentiality: body.confidentiality },
          request: req,
        },
        tx,
      );

      return created;
    });

    res.status(201).json({ project: redactCommercial(user, presentProject(project)) });
  }),
);

projectsRouter.get(
  '/:projectId',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const [
      sources, requirements, approvedRequirements, openQuestions, openConflicts, workItems,
      activeBaseline, latestRun,
    ] = await Promise.all([
      countRows(db('Source').where({ projectId: project.id })),
      countRows(db('Requirement').where({ projectId: project.id }).whereNot('reviewState', 'SUPERSEDED')),
      countRows(db('Requirement').where({ projectId: project.id, reviewState: 'APPROVED' })),
      countRows(
        db('Requirement')
          .where({ projectId: project.id })
          .whereNotNull('openQuestion')
          .whereNull('questionAnsweredAt'),
      ),
      countRows(db('Conflict').where({ projectId: project.id, state: 'OPEN' })),
      countRows(db('WorkItem').where({ projectId: project.id })),
      db('ScopeBaseline')
        .select('id', 'version', 'title', 'approvedAt')
        .where({ projectId: project.id, state: 'APPROVED' })
        .orderBy('version', 'desc')
        .first(),
      db('AiRun')
        .select('id', 'jobType', 'state', 'createdAt', 'producedCount')
        .where({ projectId: project.id })
        .orderBy('createdAt', 'desc')
        .first(),
    ]);

    const baselineWithCount = activeBaseline
      ? {
          ...activeBaseline,
          _count: {
            requirements: await countRows(db('BaselineRequirement').where({ baselineId: activeBaseline.id })),
          },
        }
      : null;

    res.json({
      project: redactCommercial(user, presentProject(project as ProjectRow)),
      counts: { sources, requirements, approvedRequirements, openQuestions, openConflicts, workItems },
      activeBaseline: baselineWithCount,
      latestRun,
      checklist: INTAKE_CHECKLIST_ITEMS,
      canEdit: can(user, 'project.update'),
    });
  }),
);

projectsRouter.patch(
  '/:projectId',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'project.update');
    const existing = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(updateProjectBody, req.body);

    const changes = diffFields(existing as unknown as Record<string, unknown>, body as Record<string, unknown>);
    if (Object.keys(changes).length === 0) {
      res.json({ project: redactCommercial(user, presentProject(existing as ProjectRow)) });
      return;
    }

    const project = await transaction(async (tx) => {
      const patch = defined({
        ...body,
        contractValue: body.contractValue === undefined ? undefined : (body.contractValue?.toString() ?? null),
        externalAiEnabled: body.externalAiEnabled === undefined ? undefined : fromBool(body.externalAiEnabled),
      });
      await tx('Project').where({ id: existing.id }).update(patch as never);
      const updated = await tx('Project').where({ id: existing.id }).first();

      await recordAudit(
        {
          projectId: existing.id,
          actorId: user.id,
          action: 'project.updated',
          entityType: 'Project',
          entityId: existing.id,
          summary: `${user.name} updated ${Object.keys(changes).join(', ')}`,
          detail: changes,
          request: req,
        },
        tx,
      );
      return updated!;
    });

    res.json({ project: redactCommercial(user, presentProject(project)) });
  }),
);

/** §7.1 source completeness checklist — the delivery-intake exit gate. */
projectsRouter.patch(
  '/:projectId/checklist',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'project.update');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(updateIntakeChecklistBody, req.body);

    const checklist = { ...toJson(project.intakeChecklist, {} as Record<string, unknown>) };
    checklist[body.key] = {
      done: body.done,
      note: body.note ?? null,
      by: user.name,
      at: new Date().toISOString(),
    };

    await transaction(async (tx) => {
      await tx('Project').where({ id: project.id }).update({ intakeChecklist: fromJson(checklist) });
      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: body.done ? 'intake.item_confirmed' : 'intake.item_cleared',
          entityType: 'Project',
          entityId: project.id,
          summary: `${user.name} marked "${body.key}" ${body.done ? 'confirmed' : 'not confirmed'}`,
          detail: { key: body.key, note: body.note },
          request: req,
        },
        tx,
      );
    });

    res.json({ checklist });
  }),
);

projectsRouter.get(
  '/:projectId/health',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);
    // Recompute on read: §13.1 requires the facts shown to be current, and the
    // query is cheap enough that a cached value is not worth the staleness.
    const result = await refreshProjectHealth(project.id);
    res.json(result);
  }),
);

projectsRouter.get(
  '/:projectId/members',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const members = await db('ProjectMember')
      .select(
        'ProjectMember.id',
        'ProjectMember.projectId',
        'ProjectMember.userId',
        'ProjectMember.projectRole',
        'ProjectMember.addedAt',
        'User.id as user_id',
        'User.name as user_name',
        'User.email as user_email',
        'User.role as user_role',
        'User.avatarColor as user_avatarColor',
      )
      .join('User', 'User.id', 'ProjectMember.userId')
      .where('ProjectMember.projectId', project.id)
      .orderBy('ProjectMember.addedAt', 'asc');

    res.json({
      members: members.map((m: Record<string, unknown>) => ({
        id: m.id,
        projectId: m.projectId,
        userId: m.userId,
        projectRole: m.projectRole,
        addedAt: m.addedAt,
        user: {
          id: m.user_id, name: m.user_name, email: m.user_email,
          role: m.user_role, avatarColor: m.user_avatarColor,
        },
      })),
    });
  }),
);

projectsRouter.post(
  '/:projectId/members',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'project.update');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(addMemberBody, req.body);

    const target = await db('User')
      .select('id', 'name', 'email', 'role', 'avatarColor', 'isActive')
      .where({ id: body.userId })
      .first();
    if (!target || !toBool(target.isActive)) throw badRequest('That user is not active');

    const member = await transaction(async (tx) => {
      const existing = await tx('ProjectMember')
        .where({ projectId: project.id, userId: body.userId })
        .first();

      // MySQL has no upsert-with-returning; the read-then-write is inside the
      // transaction so a concurrent add cannot slip between them.
      if (existing) {
        await tx('ProjectMember').where({ id: existing.id }).update({ projectRole: body.projectRole });
      } else {
        await tx('ProjectMember').insert({
          id: newId(),
          projectId: project.id,
          userId: body.userId,
          projectRole: body.projectRole,
        });
      }

      const row = await tx('ProjectMember')
        .where({ projectId: project.id, userId: body.userId })
        .first();

      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'project.member_added',
          entityType: 'ProjectMember',
          entityId: row!.id,
          summary: `${user.name} added ${target.name} as ${body.projectRole}`,
          request: req,
        },
        tx,
      );

      return {
        ...row!,
        user: {
          id: target.id,
          name: target.name,
          email: target.email,
          role: target.role,
          avatarColor: target.avatarColor,
        },
      };
    });

    res.status(201).json({ member });
  }),
);
