import { Router } from 'express';
import {
  INTAKE_CHECKLIST_ITEMS,
  createProjectBody,
  projectListQuery,
  updateIntakeChecklistBody,
  updateProjectBody,
  addMemberBody,
} from '@deliveryos/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireUser } from '../../lib/auth.js';
import { paginate, parseBody, parseQuery, route } from '../../lib/http.js';
import { projectScope, redactCommercial, requireCapability, requireProjectAccess, can } from '../../lib/rbac.js';
import { diffFields, recordAudit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { refreshProjectHealth } from './health.js';

export const projectsRouter = Router();

projectsRouter.get(
  '/',
  route(async (req, res) => {
    const user = requireUser(req);
    const q = parseQuery(projectListQuery, req.query);

    const where: Prisma.ProjectWhereInput = {
      ...projectScope(user),
      archivedAt: null,
      ...(q.stage ? { stage: q.stage } : {}),
      ...(q.health ? { health: q.health } : {}),
      ...(q.engagementType ? { engagementType: q.engagementType } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.projectManagerId ? { projectManagerId: q.projectManagerId } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
              { client: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: [{ health: 'asc' }, { targetLaunchDate: 'asc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          client: { select: { id: true, name: true } },
          projectManager: { select: { id: true, name: true, avatarColor: true } },
          _count: { select: { requirements: true, sources: true, workItems: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.json(paginate(rows.map((p) => redactCommercial(user, p)), total, q.page, q.pageSize));
  }),
);

projectsRouter.post(
  '/',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'project.create');
    const body = parseBody(createProjectBody, req.body);

    const [client, pm, existing] = await Promise.all([
      prisma.client.findUnique({ where: { id: body.clientId }, select: { id: true, name: true } }),
      prisma.user.findUnique({ where: { id: body.projectManagerId }, select: { id: true, isActive: true } }),
      prisma.project.findUnique({ where: { code: body.code }, select: { id: true } }),
    ]);

    if (!client) throw notFound('Client');
    if (!pm?.isActive) throw badRequest('The nominated project manager is not an active user');
    if (existing) throw conflict(`Project code ${body.code} is already in use`);

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
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
          contractValue: body.contractValue ?? null,
          currency: body.currency,
          externalAiEnabled: body.externalAiEnabled,
          // Every checklist item starts explicitly false rather than absent, so
          // "not yet done" and "nobody has looked" read the same in the UI.
          intakeChecklist: Object.fromEntries(
            INTAKE_CHECKLIST_ITEMS.map((i) => [i.key, { done: false, note: null }]),
          ) as Prisma.InputJsonValue,
        },
      });

      // The PM and tech lead are members by construction; forgetting to add
      // them would lock the owners out of their own project.
      const memberIds = [body.projectManagerId, body.technicalLeadId].filter(Boolean) as string[];
      await tx.projectMember.createMany({
        data: [...new Set(memberIds)].map((userId) => ({
          projectId: created.id,
          userId,
          projectRole: userId === body.projectManagerId ? 'PROJECT_MANAGER' : 'CTO',
        })),
        skipDuplicates: true,
      });

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

    res.status(201).json({ project: redactCommercial(user, project) });
  }),
);

projectsRouter.get(
  '/:projectId',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const [counts, activeBaseline, latestRun] = await Promise.all([
      Promise.all([
        prisma.source.count({ where: { projectId: project.id } }),
        prisma.requirement.count({ where: { projectId: project.id, reviewState: { not: 'SUPERSEDED' } } }),
        prisma.requirement.count({ where: { projectId: project.id, reviewState: 'APPROVED' } }),
        prisma.requirement.count({
          where: { projectId: project.id, openQuestion: { not: null }, questionAnsweredAt: null },
        }),
        prisma.conflict.count({ where: { projectId: project.id, state: 'OPEN' } }),
        prisma.workItem.count({ where: { projectId: project.id } }),
      ]).then(([sources, requirements, approvedRequirements, openQuestions, openConflicts, workItems]) => ({
        sources,
        requirements,
        approvedRequirements,
        openQuestions,
        openConflicts,
        workItems,
      })),
      prisma.scopeBaseline.findFirst({
        where: { projectId: project.id, state: 'APPROVED' },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, title: true, approvedAt: true, _count: { select: { requirements: true } } },
      }),
      prisma.aiRun.findFirst({
        where: { projectId: project.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, jobType: true, state: true, createdAt: true, producedCount: true },
      }),
    ]);

    res.json({
      project: redactCommercial(user, project),
      counts,
      activeBaseline,
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
      res.json({ project: redactCommercial(user, existing) });
      return;
    }

    const project = await prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({ where: { id: existing.id }, data: body });
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
      return updated;
    });

    res.json({ project: redactCommercial(user, project) });
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

    const checklist = { ...((project.intakeChecklist as Record<string, unknown>) ?? {}) };
    checklist[body.key] = {
      done: body.done,
      note: body.note ?? null,
      by: user.name,
      at: new Date().toISOString(),
    };

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: { intakeChecklist: checklist as Prisma.InputJsonValue },
      });
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
    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: { select: { id: true, name: true, email: true, role: true, avatarColor: true } } },
      orderBy: { addedAt: 'asc' },
    });
    res.json({ members });
  }),
);

projectsRouter.post(
  '/:projectId/members',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'project.update');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(addMemberBody, req.body);

    const target = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true, isActive: true },
    });
    if (!target?.isActive) throw badRequest('That user is not active');

    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: body.userId } },
        create: { projectId: project.id, userId: body.userId, projectRole: body.projectRole },
        update: { projectRole: body.projectRole },
        include: { user: { select: { id: true, name: true, email: true, role: true, avatarColor: true } } },
      });
      await recordAudit(
        {
          projectId: project.id,
          actorId: user.id,
          action: 'project.member_added',
          entityType: 'ProjectMember',
          entityId: created.id,
          summary: `${user.name} added ${target.name} as ${body.projectRole}`,
          request: req,
        },
        tx,
      );
      return created;
    });

    res.status(201).json({ member });
  }),
);
