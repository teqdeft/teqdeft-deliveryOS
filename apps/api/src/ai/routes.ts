import { Router } from 'express';
import { startAnalysisBody } from '@deliveryos/shared';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { parseBody, route } from '../lib/http.js';
import { requireCapability, requireProjectAccess } from '../lib/rbac.js';
import { badRequest, gateFailed } from '../lib/errors.js';
import { aiAvailable } from '../env.js';
import { extractRequirements } from './jobs/extract-requirements.js';
import { resolvePolicy } from './model-policy.js';

export const aiRouter = Router();

aiRouter.get(
  '/:projectId/ai/runs',
  route(async (req, res) => {
    const user = requireUser(req);
    const project = await requireProjectAccess(user, req.params.projectId);

    const runs = await prisma.aiRun.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { triggeredBy: { select: { id: true, name: true, avatarColor: true } } },
    });

    // §13.2 "AI output approval, edit and rejection rate by job type" starts here.
    const spend = await prisma.aiRun.aggregate({
      where: { projectId: project.id },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    });

    res.json({ runs, spend: spend._sum, aiAvailable });
  }),
);

aiRouter.post(
  '/:projectId/ai/analyse',
  route(async (req, res) => {
    const user = requireUser(req);
    requireCapability(user, 'ai.run');
    const project = await requireProjectAccess(user, req.params.projectId);
    const body = parseBody(startAnalysisBody, req.body);

    if (!aiAvailable) {
      throw gateFailed(
        'No AI provider is configured on this server. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, then try again.',
      );
    }
    if (!project.externalAiEnabled) {
      throw gateFailed('External AI processing is switched off for this project.');
    }
    if (body.jobType !== 'REQUIREMENT_EXTRACTION') {
      throw badRequest(`${body.jobType} is not implemented yet. Release 1 covers requirement extraction.`);
    }

    // One run at a time per project: two concurrent extractions over the same
    // sources produce duplicate drafts and double the bill.
    const running = await prisma.aiRun.findFirst({
      where: { projectId: project.id, state: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true, createdAt: true },
    });
    if (running) {
      throw gateFailed('An analysis is already running on this project. Wait for it to finish.', { runId: running.id });
    }

    const outcome = await extractRequirements({
      projectId: project.id,
      sourceIds: body.sourceIds ?? [],
      userId: user.id,
      provider: body.provider ?? null,
      instructions: body.instructions,
    });

    res.status(201).json(outcome);
  }),
);

aiRouter.get(
  '/:projectId/ai/policy',
  route(async (req, res) => {
    const user = requireUser(req);
    await requireProjectAccess(user, req.params.projectId);

    // Shown on the AI analysis screen (PJ-05) so a PM can see which model will
    // run and what it will cost before pressing the button.
    const policy = aiAvailable ? resolvePolicy('REQUIREMENT_EXTRACTION') : null;
    res.json({ aiAvailable, policy });
  }),
);
