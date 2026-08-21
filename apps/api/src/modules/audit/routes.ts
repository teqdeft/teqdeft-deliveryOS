import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireUser } from '../../lib/auth.js';
import { paginate, route } from '../../lib/http.js';
import { hasPortfolioAccess, projectScope, requireProjectAccess } from '../../lib/rbac.js';

export const auditRouter = Router();

/**
 * Screen PJ-21 / AD-06. The audit trail is read-only by construction — there is
 * no route here that writes, updates or deletes an event.
 */
auditRouter.get(
  '/',
  route(async (req, res) => {
    const user = requireUser(req);
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;

    // Project-scoped reads are allowed to any member (§7 "project activity");
    // the cross-project firehose needs the audit.read capability.
    if (projectId) {
      await requireProjectAccess(user, projectId);
    } else if (!hasPortfolioAccess(user)) {
      const scoped = await prisma.project.findMany({ where: projectScope(user), select: { id: true } });
      req.query.projectIds = scoped.map((p) => p.id).join(',');
    }

    const where: Prisma.AuditEventWhereInput = {
      ...(projectId ? { projectId } : {}),
      ...(!projectId && !hasPortfolioAccess(user)
        ? { projectId: { in: String(req.query.projectIds ?? '').split(',').filter(Boolean) } }
        : {}),
      ...(typeof req.query.action === 'string' ? { action: { startsWith: req.query.action } } : {}),
      ...(typeof req.query.entityId === 'string' ? { entityId: req.query.entityId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          actor: { select: { id: true, name: true, avatarColor: true } },
          project: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.auditEvent.count({ where }),
    ]);

    res.json(paginate(items, total, page, pageSize));
  }),
);
