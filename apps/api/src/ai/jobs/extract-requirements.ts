import type { Prisma } from '@prisma/client';
import { extractionResult, type ExtractedRequirement, type Citation } from '@deliveryos/shared';
import { prisma } from '../../db.js';
import { recordAudit } from '../../lib/audit.js';
import { nextReferenceBlock } from '../../lib/reference.js';
import { logger } from '../../lib/logger.js';
import { refreshProjectHealth } from '../../modules/projects/health.js';
import { callModel } from '../gateway.js';
import { EXTRACTION_JSON_SCHEMA, SCHEMA_VERSION } from '../schema.js';
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SYSTEM_PROMPT } from '../prompts.js';
import { resolvePolicy } from '../model-policy.js';

interface FragmentIndex {
  id: string;
  sourceId: string;
  text: string;
}

export interface ExtractionOutcome {
  runId: string;
  requirementsCreated: number;
  conflictsCreated: number;
  gaps: { topic: string; why: string }[];
  warnings: string[];
}

/**
 * The Requirements Analyst run (§8.2 pipeline, steps 4–9).
 *
 * Everything the model returns lands in DRAFT. §8.3 is explicit that AI may
 * draft a requirement and may not execute one, so there is deliberately no code
 * path here that can produce an APPROVED record.
 */
export async function extractRequirements(params: {
  projectId: string;
  sourceIds: string[];
  userId: string;
  provider?: 'ANTHROPIC' | 'OPENAI' | null;
  instructions?: string;
}): Promise<ExtractionOutcome> {
  const { projectId, userId } = params;

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, name: true, code: true, engagementType: true, externalAiEnabled: true },
  });

  // §16.1 — a project can be barred from external AI processing entirely, and
  // that switch has to be checked at the last moment before data leaves.
  if (!project.externalAiEnabled) {
    throw new Error('External AI processing is disabled for this project. Enable it in project settings first.');
  }

  const sources = await prisma.source.findMany({
    where: {
      projectId,
      processingState: 'READY',
      ...(params.sourceIds.length > 0 ? { id: { in: params.sourceIds } } : {}),
      // §16.1 — restricted material never leaves the building, whatever the
      // caller selected in the UI.
      confidentiality: { not: 'RESTRICTED' },
    },
    include: { fragments: { orderBy: { ordinal: 'asc' } } },
    orderBy: [{ authority: 'asc' }, { statedAt: 'desc' }],
  });

  if (sources.length === 0) {
    throw new Error('No analysable sources. Upload a proposal, transcript or email, and check none are marked Restricted.');
  }

  const fragmentIndex = new Map<string, FragmentIndex>();
  const corpus: string[] = [];

  for (const source of sources) {
    corpus.push(
      `\n### SOURCE: ${source.title}\n` +
        `Kind: ${source.kind} | Authority: ${source.authority} | Stated: ${source.statedAt.toISOString().slice(0, 10)}\n`,
    );
    for (const fragment of source.fragments) {
      fragmentIndex.set(fragment.id, { id: fragment.id, sourceId: source.id, text: fragment.text });
      corpus.push(
        `[fragment:${fragment.id}] (${source.authority}, ${source.statedAt.toISOString().slice(0, 10)}, ${fragment.locator}) ${fragment.text}`,
      );
    }
  }

  if (fragmentIndex.size === 0) {
    throw new Error('The selected sources contain no citable text. Check their processing state in the knowledge centre.');
  }

  const policy = resolvePolicy('REQUIREMENT_EXTRACTION', params.provider);

  const run = await prisma.aiRun.create({
    data: {
      projectId,
      jobType: 'REQUIREMENT_EXTRACTION',
      state: 'RUNNING',
      provider: policy.provider,
      model: policy.model,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      inputSourceIds: sources.map((s) => s.id) as Prisma.InputJsonValue,
      inputChars: corpus.join('\n').length,
      instructions: params.instructions ?? null,
      triggeredById: userId,
      startedAt: new Date(),
    },
  });

  const warnings: string[] = [];

  try {
    const input = [
      `Project: ${project.name} (${project.code})`,
      `Engagement type: ${project.engagementType}`,
      params.instructions ? `\nAdditional instructions from the project manager:\n${params.instructions}` : '',
      `\n## Source documents\n`,
      corpus.join('\n'),
      `\n## Task\n`,
      `Extract every requirement, exclusion, assumption and open question these documents support. Report conflicts between sources without resolving them, and list what the documents never address.`,
    ].join('\n');

    const result = await callModel({
      jobType: 'REQUIREMENT_EXTRACTION',
      provider: params.provider,
      system: EXTRACTION_SYSTEM_PROMPT,
      input,
      jsonSchema: EXTRACTION_JSON_SCHEMA,
      schemaName: 'extraction_result',
    });

    if (result.refusal) {
      throw new Error(`The model declined to analyse these documents: ${result.refusal}`);
    }

    // §8.2 step 6 — validate before anything is written.
    const parsed = extractionResult.safeParse(safeJsonParse(result.text));
    if (!parsed.success) {
      throw new Error(
        `The model returned a result that does not match the expected schema: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`,
      );
    }

    const { requirements, conflicts, gaps } = parsed.data;

    const verifiedRequirements = requirements
      .map((r) => verifyRequirement(r, fragmentIndex, warnings))
      .filter((r): r is ExtractedRequirement => r !== null);

    const outcome = await prisma.$transaction(
      async (tx) => {
        const references = await nextReferenceBlock(tx, projectId, 'requirement', verifiedRequirements.length);

        let created = 0;
        for (const [index, requirement] of verifiedRequirements.entries()) {
          await tx.requirement.create({
            data: {
              projectId,
              reference: references[index]!,
              title: requirement.title,
              statement: requirement.statement,
              requirementClass: requirement.requirementClass,
              priority: requirement.priority,
              // Never APPROVED. §8.3: AI drafts, humans decide.
              reviewState: 'DRAFT',
              origin: 'AI_EXTRACTION',
              confidence: requirement.confidence,
              acceptanceCriteria: requirement.acceptanceCriteria as Prisma.InputJsonValue,
              isExclusion: requirement.isExclusion,
              isAssumption: requirement.isAssumption,
              openQuestion: requirement.openQuestion,
              aiRunId: run.id,
              citations: {
                create: dedupeCitations(requirement.citations).map((c) => ({
                  sourceFragmentId: c.sourceFragmentId,
                  quote: c.quote.slice(0, 2000),
                })),
              },
            },
          });
          created += 1;
        }

        let conflictsCreated = 0;
        for (const conflict of conflicts) {
          const sideA = conflict.citationsA.filter((c) => fragmentIndex.has(c.sourceFragmentId));
          const sideB = conflict.citationsB.filter((c) => fragmentIndex.has(c.sourceFragmentId));
          // A conflict whose evidence we cannot resolve is not reviewable —
          // it would ask a human to arbitrate between two unverifiable claims.
          if (sideA.length === 0 || sideB.length === 0) {
            warnings.push(`Dropped a conflict ("${conflict.summary.slice(0, 60)}…") — its citations could not be verified.`);
            continue;
          }

          await tx.conflict.create({
            data: {
              projectId,
              summary: conflict.summary,
              statementA: conflict.statementA,
              statementB: conflict.statementB,
              severity: conflict.severity,
              suggestedResolution: conflict.suggestedResolution,
              state: 'OPEN',
              aiRunId: run.id,
              citations: {
                create: [
                  ...sideA.map((c) => ({ sourceFragmentId: c.sourceFragmentId, side: 'A', quote: c.quote.slice(0, 2000) })),
                  ...sideB.map((c) => ({ sourceFragmentId: c.sourceFragmentId, side: 'B', quote: c.quote.slice(0, 2000) })),
                ],
              },
            },
          });
          conflictsCreated += 1;
        }

        await tx.aiRun.update({
          where: { id: run.id },
          data: {
            state: 'AWAITING_REVIEW',
            finishedAt: new Date(),
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            latencyMs: result.latencyMs,
            producedCount: created,
            warnings: warnings as Prisma.InputJsonValue,
            model: result.model,
          },
        });

        await tx.project.update({
          where: { id: projectId },
          data: { stage: conflictsCreated > 0 ? 'HUMAN_CLARIFICATION' : 'AI_ANALYSIS' },
        });

        await recordAudit(
          {
            projectId,
            actorId: userId,
            action: 'ai.extraction_completed',
            entityType: 'AiRun',
            entityId: run.id,
            summary: `AI extraction drafted ${created} requirements and ${conflictsCreated} conflicts from ${sources.length} sources`,
            detail: {
              provider: result.provider,
              model: result.model,
              promptVersion: EXTRACTION_PROMPT_VERSION,
              schemaVersion: SCHEMA_VERSION,
              sourceIds: sources.map((s) => s.id),
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costUsd: result.costUsd,
              attempts: result.attempts,
              warnings,
            },
          },
          tx,
        );

        return { requirementsCreated: created, conflictsCreated };
      },
      // Extraction can produce hundreds of rows; the default 5s ceiling is not
      // enough and a partial write would leave uncitable requirements behind.
      { timeout: 120_000, maxWait: 10_000 },
    );

    await refreshProjectHealth(projectId);

    return {
      runId: run.id,
      requirementsCreated: outcome.requirementsCreated,
      conflictsCreated: outcome.conflictsCreated,
      gaps,
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId: run.id, projectId }, 'Requirement extraction failed');

    await prisma.aiRun.update({
      where: { id: run.id },
      data: { state: 'FAILED', finishedAt: new Date(), error: message.slice(0, 2000), warnings: warnings as Prisma.InputJsonValue },
    });
    await recordAudit({
      projectId,
      actorId: userId,
      action: 'ai.extraction_failed',
      entityType: 'AiRun',
      entityId: run.id,
      summary: `AI extraction failed: ${message.slice(0, 200)}`,
    });

    throw err;
  }
}

/**
 * Provenance enforcement. A requirement survives only if it cites at least one
 * fragment that actually exists in this run's corpus.
 *
 * This is the check that makes §7.2's "each item shows source citations" mean
 * something. Without it a fabricated fragment id would be stored as evidence
 * and would render in the studio as a real citation — the worst possible
 * failure for a product whose whole claim is traceability.
 */
function verifyRequirement(
  requirement: ExtractedRequirement,
  index: Map<string, FragmentIndex>,
  warnings: string[],
): ExtractedRequirement | null {
  const verified: Citation[] = [];

  for (const citation of requirement.citations) {
    const fragment = index.get(citation.sourceFragmentId);
    if (!fragment) {
      warnings.push(`"${requirement.title.slice(0, 50)}…" cited fragment ${citation.sourceFragmentId}, which is not in this run.`);
      continue;
    }

    // The fragment id is the authority; the quote is a display convenience. If
    // the model paraphrased, keep the citation and repair the quote rather than
    // showing the reviewer words the document does not contain.
    const quoteMatches = normalise(fragment.text).includes(normalise(citation.quote));
    verified.push({
      sourceFragmentId: citation.sourceFragmentId,
      quote: quoteMatches ? citation.quote : fragment.text.slice(0, 400),
    });
    if (!quoteMatches) {
      warnings.push(`Quote for "${requirement.title.slice(0, 50)}…" did not match its fragment and was replaced with the source text.`);
    }
  }

  if (verified.length === 0) {
    warnings.push(`Dropped "${requirement.title.slice(0, 60)}…" — none of its citations could be verified.`);
    return null;
  }

  return { ...requirement, citations: verified };
}

/** The unique constraint on (requirementId, sourceFragmentId) would reject a repeat. */
function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Map<string, Citation>();
  for (const c of citations) if (!seen.has(c.sourceFragmentId)) seen.set(c.sourceFragmentId, c);
  return [...seen.values()];
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Models occasionally wrap JSON in a fence despite a schema constraint. */
function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    : trimmed;
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new Error('The model did not return valid JSON.');
  }
}
