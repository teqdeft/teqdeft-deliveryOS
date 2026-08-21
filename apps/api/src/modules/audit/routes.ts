import { Router } from 'express';
import { db, indexBy, paginateQuery, toJson, type AuditEventRow } from '../../db/index.js';
import { requireUser } from '../../lib/auth.js';
import { paginate, route } from '../../lib/http.js';
import { hasPortfolioAccess, requireProjectAccess, visibleProjectIds } from '../../lib/rbac.js';

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
    // the cross-project firehose is restricted to portfolio roles.
    if (projectId) await requireProjectAccess(user, projectId);

    const query = db('AuditEvent');

    if (projectId) {
      query.where('AuditEvent.projectId', projectId);
    } else if (!hasPortfolioAccess(user)) {
      // Restrict to projects this caller can see. Done as a subquery rather
      // than by fetching ids first, so the filter cannot be bypassed by a
      // large portfolio and stays one round trip.
      query.whereIn('AuditEvent.projectId', (sub) => visibleProjectIds(user)(sub));
    }

    if (typeof req.query.action === 'string') {
      query.where('AuditEvent.action', 'like', `${req.query.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    if (typeof req.query.entityId === 'string') {
      query.where('AuditEvent.entityId', req.query.entityId);
    }

    const { items: rows, total } = await paginateQuery<AuditEventRow>(
      query.clone().select('AuditEvent.*').orderBy('AuditEvent.createdAt', 'desc'),
      page,
      pageSize,
    );

    const [actors, projects] = await Promise.all([
      db('User')
        .select('id', 'name', 'avatarColor')
        .whereIn('id', [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])]),
      db('Project')
        .select('id', 'code', 'name')
        .whereIn('id', [...new Set(rows.map((r) => r.projectId).filter(Boolean) as string[])]),
    ]);
    const actorById = indexBy(actors, 'id');
    const projectById = indexBy(projects, 'id');

    const items = rows.map((row) => ({
      ...row,
      detail: toJson(row.detail, {} as Record<string, unknown>),
      actor: row.actorId ? (actorById.get(row.actorId) ?? null) : null,
      project: row.projectId ? (projectById.get(row.projectId) ?? null) : null,
    }));

    res.json(paginate(items, total, page, pageSize));
  }),
);
