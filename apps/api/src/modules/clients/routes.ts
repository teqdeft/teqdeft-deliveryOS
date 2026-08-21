import { Router } from 'express';
import { createClientBody } from '@deliveryos/shared';
import { prisma } from '../../db.js';
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
    const clients = await prisma.client.findMany({
      where: hasPortfolioAccess(user)
        ? {}
        : {
            projects: {
              some: {
                OR: [
                  { projectManagerId: user.id },
                  { technicalLeadId: user.id },
                  { members: { some: { userId: user.id } } },
                ],
              },
            },
          },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        contactName: true,
        contactEmail: true,
        confidentiality: true,
        _count: { select: { projects: true } },
      },
    });

    res.json({ clients });
  }),
);

clientsRouter.post(
  '/',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'client.manage');
    const body = parseBody(createClientBody, req.body);

    const existing = await prisma.client.findUnique({ where: { name: body.name }, select: { id: true } });
    if (existing) throw conflict('A client with that name already exists');

    const client = await prisma.client.create({
      data: {
        name: body.name,
        contactName: body.contactName || null,
        contactEmail: body.contactEmail || null,
        confidentiality: body.confidentiality,
        communicationNotes: body.communicationNotes || null,
      },
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
