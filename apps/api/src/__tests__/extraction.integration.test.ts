/**
 * The extraction pipeline against a real database, with the model stubbed.
 *
 * These tests exist because the product's central claim — every requirement
 * traces to the exact words that produced it — is only true if a fabricated
 * citation cannot reach the database. That guarantee lives in code, not in the
 * prompt, so it needs a test that actively tries to break it.
 *
 * Needs PostgreSQL. Skipped automatically when DATABASE_URL is unreachable.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExtractionResult } from '@deliveryos/shared';

process.env.DB_HOST = process.env.TEST_DB_HOST ?? '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT ?? '3306';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'deliveryos_test';
process.env.DB_USER = process.env.TEST_DB_USER ?? 'deliveryos';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? 'deliveryos';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation';
// Pin the provider rather than inheriting whatever a developer has in .env —
// otherwise these assertions pass or fail based on local configuration.
process.env.ANTHROPIC_API_KEY = 'test-key-so-the-policy-resolves';
process.env.OPENAI_API_KEY = '';
process.env.AI_DEFAULT_PROVIDER = 'ANTHROPIC';

/** Whatever the stub is set to is what the "model" returns for the next run. */
let stubbedResult: ExtractionResult = { requirements: [], conflicts: [], gaps: [] };

vi.mock('../ai/gateway.js', () => ({
  callModel: vi.fn(async () => ({
    text: JSON.stringify(stubbedResult),
    provider: 'ANTHROPIC' as const,
    model: 'claude-opus-5',
    inputTokens: 1000,
    outputTokens: 500,
    latencyMs: 1234,
    refusal: null,
    costUsd: 0.0175,
    attempts: 1,
  })),
}));

const { db, closeDb, fromJson, newId, toBool, toNumber } = await import('../db/index.js');
const { extractRequirements } = await import('../ai/jobs/extract-requirements.js');

let projectId = '';
let userId = '';
let realFragmentIds: string[] = [];

/**
 * Decided at module load, not in beforeAll: `describe.skipIf` is evaluated
 * during collection, so a flag set later cannot skip anything and the suite
 * fails confusingly on a machine with no MySQL instead of stepping aside.
 */
const available = await (async () => {
  try {
    await db.raw('SELECT 1');
    // A fresh checkout has not run migrations yet.
    await db.migrate.latest();
    return true;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  if (!available) return;

  // Clean slate. MySQL refuses a TRUNCATE on a table another references, and
  // DELETE order has to respect the same constraints, so drop the checks for
  // the reset rather than hand-maintaining a topological order.
  await db.raw('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'AuditEvent', 'RequirementCitation', 'RequirementRevision', 'ConflictCitation',
    'Conflict', 'Decision', 'BaselineRequirement', 'ScopeBaseline', 'Requirement',
    'AiRun', 'SourceFragment', 'Source', 'ProjectMember', 'Project', 'Client', 'User',
  ]) {
    await db(table).delete();
  }
  await db.raw('SET FOREIGN_KEY_CHECKS = 1');

  userId = newId();
  await db('User').insert({
    id: userId, email: 'test-pm@teqdeft.com', name: 'Test PM',
    role: 'PROJECT_MANAGER', passwordHash: 'x',
  });

  const clientId = newId();
  await db('Client').insert({ id: clientId, name: 'Test Client' });

  projectId = newId();
  await db('Project').insert({
    id: projectId,
    code: 'TST-01',
    name: 'Test project',
    clientId,
    engagementType: 'MARKETING_WEBSITE',
    projectManagerId: userId,
    healthFacts: fromJson([]),
    intakeChecklist: fromJson({}),
  });

  const sourceId = newId();
  await db('Source').insert({
    id: sourceId,
    projectId,
    title: 'Signed proposal',
    kind: 'PROPOSAL',
    authority: 'SIGNED_CONTRACT',
    statedAt: new Date('2026-01-01'),
    processingState: 'READY',
    uploadedById: userId,
    extractedChars: 500,
  });

  realFragmentIds = [newId(), newId()];
  await db('SourceFragment').insert([
    {
      id: realFragmentIds[0]!, sourceId, ordinal: 0, locator: '¶1',
      text: 'The website will comprise eight page templates, each delivered responsively.',
      charStart: 0, charEnd: 76,
    },
    {
      id: realFragmentIds[1]!, sourceId, ordinal: 1, locator: '¶2',
      text: 'Hosting and ongoing maintenance are explicitly excluded from this engagement.',
      charStart: 78, charEnd: 154,
    },
  ]);
});

afterAll(async () => {
  if (available) await closeDb();
});

const requirement = (overrides: Partial<ExtractionResult['requirements'][number]> = {}) => ({
  title: 'Eight page templates',
  statement: 'The website comprises eight page templates, each delivered at desktop, tablet and mobile.',
  requirementClass: 'PAGE_SCREEN_CONTENT' as const,
  priority: 'MUST' as const,
  confidence: 0.95,
  acceptanceCriteria: ['All eight templates render without horizontal scroll at 375px width'],
  citations: [{ sourceFragmentId: realFragmentIds[0]!, quote: 'The website will comprise eight page templates' }],
  isExclusion: false,
  isAssumption: false,
  openQuestion: null,
  ...overrides,
});

describe.skipIf(!available)('extractRequirements', () => {
  it('persists a well-formed requirement with its citation', async () => {
    stubbedResult = { requirements: [requirement()], conflicts: [], gaps: [] };

    const outcome = await extractRequirements({ projectId, sourceIds: [], userId });

    expect(outcome.requirementsCreated).toBe(1);

    const stored = await db('Requirement').where({ projectId, title: 'Eight page templates' }).first();
    expect(stored).toBeDefined();
    const citations = await db('RequirementCitation').where({ requirementId: stored!.id });
    expect(citations).toHaveLength(1);
    expect(citations[0]!.sourceFragmentId).toBe(realFragmentIds[0]);
    expect(stored!.reference).toMatch(/^REQ-\d{3}$/);
  });

  // The core guarantee. A model that invents a fragment id must not be able to
  // manufacture provenance.
  it('drops a requirement whose citation does not exist', async () => {
    stubbedResult = {
      requirements: [
        requirement({
          title: 'Fabricated requirement',
          citations: [{ sourceFragmentId: '00000000-0000-0000-0000-000000000000', quote: 'Never appeared anywhere' }],
        }),
      ],
      conflicts: [],
      gaps: [],
    };

    const outcome = await extractRequirements({ projectId, sourceIds: [], userId });

    expect(outcome.requirementsCreated).toBe(0);
    expect(outcome.warnings.join(' ')).toContain('none of its citations could be verified');
    expect(await db('Requirement').where({ projectId, title: 'Fabricated requirement' })).toHaveLength(0);
  });

  it('keeps verifiable citations and drops fabricated ones from the same requirement', async () => {
    stubbedResult = {
      requirements: [
        requirement({
          title: 'Partly cited requirement',
          citations: [
            { sourceFragmentId: realFragmentIds[1]!, quote: 'Hosting and ongoing maintenance are explicitly excluded' },
            { sourceFragmentId: '11111111-1111-1111-1111-111111111111', quote: 'Invented support' },
          ],
        }),
      ],
      conflicts: [],
      gaps: [],
    };

    await extractRequirements({ projectId, sourceIds: [], userId });

    const stored = await db('Requirement').where({ projectId, title: 'Partly cited requirement' }).first();
    const citations = await db('RequirementCitation').where({ requirementId: stored!.id });
    expect(citations).toHaveLength(1);
    expect(citations[0]!.sourceFragmentId).toBe(realFragmentIds[1]);
  });

  // A paraphrased quote would show the reviewer words the document does not
  // contain — worse than showing none.
  it('repairs a quote that does not match its fragment', async () => {
    stubbedResult = {
      requirements: [
        requirement({
          title: 'Paraphrased citation',
          citations: [{ sourceFragmentId: realFragmentIds[0]!, quote: 'The site has roughly eight pages or so' }],
        }),
      ],
      conflicts: [],
      gaps: [],
    };

    const outcome = await extractRequirements({ projectId, sourceIds: [], userId });

    const stored = await db('Requirement').where({ projectId, title: 'Paraphrased citation' }).first();
    const citations = await db('RequirementCitation').where({ requirementId: stored!.id });
    expect(citations[0]!.quote).toContain('The website will comprise eight page templates');
    expect(outcome.warnings.join(' ')).toContain('did not match its fragment');
  });

  // §8.3: AI may draft a requirement and may not execute one.
  it('never produces an approved requirement', async () => {
    stubbedResult = { requirements: [requirement({ title: 'Should still be a draft' })], conflicts: [], gaps: [] };

    await extractRequirements({ projectId, sourceIds: [], userId });

    const stored = await db('Requirement').where({ projectId, title: 'Should still be a draft' }).first();
    expect(stored!.reviewState).toBe('DRAFT');
    expect(stored!.origin).toBe('AI_EXTRACTION');
  });

  it('rejects output that does not match the schema, and writes nothing', async () => {
    const before = (await db('Requirement').where({ projectId })).length;
    // A requirement with no citations array at all.
    stubbedResult = { requirements: [{ title: 'Bad' } as never], conflicts: [], gaps: [] };

    await expect(extractRequirements({ projectId, sourceIds: [], userId })).rejects.toThrow(/schema/i);

    expect((await db('Requirement').where({ projectId })).length).toBe(before);
    const run = await db('AiRun').where({ projectId }).orderBy('createdAt', 'desc').first();
    expect(run!.state).toBe('FAILED');
  });

  it('drops a conflict whose evidence cannot be resolved', async () => {
    stubbedResult = {
      requirements: [],
      conflicts: [
        {
          summary: 'Unverifiable disagreement',
          statementA: 'The launch is in March.',
          statementB: 'The launch is in April.',
          citationsA: [{ sourceFragmentId: 'not-a-real-id', quote: 'March' }],
          citationsB: [{ sourceFragmentId: realFragmentIds[0]!, quote: 'The website will comprise' }],
          severity: 'HIGH',
          suggestedResolution: null,
        },
      ],
      gaps: [],
    };

    const outcome = await extractRequirements({ projectId, sourceIds: [], userId });

    expect(outcome.conflictsCreated).toBe(0);
    expect(outcome.warnings.join(' ')).toContain('citations could not be verified');
  });

  it('records a reproducible AiRun and an audit event', async () => {
    stubbedResult = { requirements: [requirement({ title: 'Audited requirement' })], conflicts: [], gaps: [] };

    const outcome = await extractRequirements({ projectId, sourceIds: [], userId });

    const run = await db('AiRun').where({ id: outcome.runId }).first();
    expect(run!.promptVersion).toBe('extraction.v1');
    expect(run!.schemaVersion).toBe('extraction.v1');
    expect(run!.provider).toBe('ANTHROPIC');
    expect(run!.state).toBe('AWAITING_REVIEW');
    expect(run!.inputTokens).toBe(1000);
    expect(toNumber(run!.costUsd)).toBeCloseTo(0.0175, 4);
    expect((run!.inputSourceIds as string[]).length).toBeGreaterThan(0);

    const audit = await db('AuditEvent')
      .where({ projectId, action: 'ai.extraction_completed' })
      .orderBy('createdAt', 'desc')
      .first();
    expect(audit!.actorId).toBe(userId);
    expect(audit!.entityId).toBe(outcome.runId);
  });

  // §16.1: a project can be barred from external AI processing entirely.
  it('refuses to run when the project has external AI disabled', async () => {
    await db('Project').where({ id: projectId }).update({ externalAiEnabled: 0 });

    await expect(extractRequirements({ projectId, sourceIds: [], userId })).rejects.toThrow(/disabled for this project/i);

    await db('Project').where({ id: projectId }).update({ externalAiEnabled: 1 });
  });

  it('refuses to send a source marked Restricted', async () => {
    await db('Source').where({ projectId }).update({ confidentiality: 'RESTRICTED' });

    await expect(extractRequirements({ projectId, sourceIds: [], userId })).rejects.toThrow(/No analysable sources/i);

    await db('Source').where({ projectId }).update({ confidentiality: 'STANDARD' });
  });
});
