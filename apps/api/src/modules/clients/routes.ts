import { Router } from 'express';
import { createClientBody } from '@deliveryos/shared';
import { db, insertReturning, likeContains, newId } from '../../db/index.js';
import { requireUser } from '../../lib/auth.js';
import { parseBody, route } from '../../lib/http.js';
import { hasPortfolioAccess, requireCapability } from '../../lib/rbac.js';
import { recordAudit } from '../../lib/audit.js';
import { conflict } from '../../lib/errors.js';

export const clientsRouter = Router();

clientsRouter.get(
  '/',
  route(async (req, res) => {
    const user = requireUser(req);

    // A client is only visible through a project the caller can see, so
    // someone outside a client's projects never learns that client exists.
    const query = db('Client')
      .select(
        'Client.id',
        'Client.name',
        'Client.contactName',
        'Client.contactEmail',
        'Client.confidentiality',
      )
      .count({ projectCount: 'Project.id' })
      .leftJoin('Project', 'Project.clientId', 'Client.id')
      .groupBy('Client.id')
      .orderBy('Client.name', 'asc');

    if (!hasPortfolioAccess(user)) {
      query.whereExists((sub) =>
        sub
          .select('id')
          .from('Project as p')
          .whereRaw('p.clientId = Client.id')
          .where((w) =>
            w
              .where('p.projectManagerId', user.id)
              .orWhere('p.technicalLeadId', user.id)
              .orWhereIn('p.id', (m) =>
                m.select('projectId').from('ProjectMember').where('userId', user.id),
              ),
          ),
      );
    }

    const rows = await query;

    // Preserved verbatim from the Prisma response so the web app's
    // `_count.projects` keeps resolving.
    const clients = rows.map(({ projectCount, ...client }) => ({
      ...client,
      _count: { projects: Number(projectCount ?? 0) },
    }));

    res.json({ clients });
  }),
);

clientsRouter.post(
  '/',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'client.manage');
    const body = parseBody(createClientBody, req.body);

    const existing = await db('Client').select('id').where({ name: body.name }).first();
    if (existing) throw conflict('A client with that name already exists');

    const client = await insertReturning(db, 'Client', {
      id: newId(),
      name: body.name,
      contactName: body.contactName || null,
      contactEmail: body.contactEmail || null,
      confidentiality: body.confidentiality,
      communicationNotes: body.communicationNotes || null,
    });

    await recordAudit({
      actorId: user.id,
      action: 'client.created',
      entityType: 'Client',
      entityId: client.id,
      summary: `${user.name} created client ${client.name}`,
      request: req,
    });

    res.status(201).json({ client });
  }),
);
