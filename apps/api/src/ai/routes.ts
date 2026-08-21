import { Router } from 'express';
import { startAnalysisBody } from '@deliveryos/shared';
import { db, countRows, toBool, toDecimalString, toJson } from '../db/index.js';
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

    const rows = await db('AiRun as r')
      .select('r.*', 'User.id as by_id', 'User.name as by_name', 'User.avatarColor as by_avatarColor')
      .join('User', 'User.id', 'r.triggeredById')
      .where('r.projectId', project.id)
      .orderBy('r.createdAt', 'desc')
      .limit(50);

    const runs = (rows as Record<string, unknown>[]).map(({ by_id, by_name, by_avatarColor, ...run }) => ({
      ...run,
      costUsd: toDecimalString(run.costUsd),
      warnings: toJson(run.warnings, [] as string[]),
      inputSourceIds: toJson(run.inputSourceIds, [] as string[]),
      triggeredBy: { id: by_id, name: by_name, avatarColor: by_avatarColor },
    }));

    // §13.2 "AI output approval, edit and rejection rate by job type" starts here.
    const totals = (await db('AiRun')
      .where({ projectId: project.id })
      .sum({ costUsd: 'costUsd', inputTokens: 'inputTokens', outputTokens: 'outputTokens' })
      .first()) as { costUsd: string | null; inputTokens: string | null; outputTokens: string | null };

    res.json({
      runs,
      // SUM over DECIMAL returns a string; the previous response shape kept
      // costUsd as a string too, so the client needs no change.
      spend: {
        costUsd: toDecimalString(totals?.costUsd),
        inputTokens: totals?.inputTokens === null ? null : Number(totals.inputTokens),
        outputTokens: totals?.outputTokens === null ? null : Number(totals.outputTokens),
      },
      aiAvailable,
    });
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
    if (!toBool(project.externalAiEnabled)) {
      throw gateFailed('External AI processing is switched off for this project.');
    }
    if (body.jobType !== 'REQUIREMENT_EXTRACTION') {
      throw badRequest(`${body.jobType} is not implemented yet. Release 1 covers requirement extraction.`);
    }

    // One run at a time per project: two concurrent extractions over the same
    // sources produce duplicate drafts and double the bill.
    const running = await db('AiRun')
      .select('id', 'createdAt')
      .where({ projectId: project.id })
      .whereIn('state', ['QUEUED', 'RUNNING'])
      .first();
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
