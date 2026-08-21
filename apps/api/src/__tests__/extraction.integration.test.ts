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

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/deliveryos_test?schema=public';
process.env.DATABASE_URL = DATABASE_URL;
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

const { prisma } = await import('../db.js');
const { extractRequirements } = await import('../ai/jobs/extract-requirements.js');

let projectId = '';
let userId = '';
let realFragmentIds: string[] = [];
let available = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    available = false;
    return;
  }

  // Clean slate, respecting foreign keys.
  await prisma.auditEvent.deleteMany();
  await prisma.requirementCitation.deleteMany();
  await prisma.requirementRevision.deleteMany();
  await prisma.conflictCitation.deleteMany();
  await prisma.conflict.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.aiRun.deleteMany();
  await prisma.sourceFragment.deleteMany();
  await prisma.source.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { email: 'test-pm@teqdeft.com', name: 'Test PM', role: 'PROJECT_MANAGER', passwordHash: 'x' },
  });
  userId = user.id;

  const client = await prisma.client.create({ data: { name: 'Test Client' } });
  const project = await prisma.project.create({
    data: {
      code: 'TST-01',
      name: 'Test project',
      clientId: client.id,
      engagementType: 'MARKETING_WEBSITE',
      projectManagerId: user.id,
    },
  });
  projectId = project.id;

  const source = await prisma.source.create({
    data: {
      projectId,
      title: 'Signed proposal',
      kind: 'PROPOSAL',
      authority: 'SIGNED_CONTRACT',
      statedAt: new Date('2026-01-01'),
      processingState: 'READY',
      uploadedById: user.id,
      extractedChars: 500,
      fragments: {
        create: [
          { ordinal: 0, locator: '¶1', text: 'The website will comprise eight page templates, each delivered responsively.', charStart: 0, charEnd: 76 },
          { ordinal: 1, locator: '¶2', text: 'Hosting and ongoing maintenance are explicitly excluded from this engagement.', charStart: 78, charEnd: 154 },
        ],
      },
    },
    include: { fragments: { orderBy: { ordinal: 'asc' } } },
  });
  realFragmentIds = source.fragments.map((f) => f.id);
});

afterAll(async () => {
  if (available) await prisma.$disconnect();
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

    const stored = await prisma.requirement.findFirstOrThrow({
      where: { projectId, title: 'Eight page templates' },
      include: { citations: true },
    });
    expect(stored.citations).toHaveLength(1);
    expect(stored.citations[0]!.sourceFragmentId).toBe(realFragmentIds[0]);
    expect(stored.reference).toMatch(/^REQ-\d{3}$/);
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
    expect(await prisma.requirement.count({ where: { projectId, title: 'Fabricated requirement' } })).toBe(0);
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

    const stored = await prisma.requirement.findFirstOrThrow({
      where: { projectId, title: 'Partly cited requirement' },
      include: { citations: true },
    });
    expect(stored.citations).toHaveLength(1);
    expect(stored.citations[0]!.sourceFragmentId).toBe(realFragmentIds[1]);
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

    const stored = await prisma.requirement.findFirstOrThrow({
      where: { projectId, title: 'Paraphrased citation' },
      include: { citations: true },
    });
    expect(stored.citations[0]!.quote).toContain('The website will comprise eight page templates');
    expect(outcome.warnings.join(' ')).toContain('did not match its fragment');
  });

  // §8.3: AI may draft a requirement and may not execute one.
  it('never produces an approved requirement', async () => {
    stubbedResult = { requirements: [requirement({ title: 'Should still be a draft' })], conflicts: [], gaps: [] };

    await extractRequirements({ projectId, sourceIds: [], userId });

    const stored = await prisma.requirement.findFirstOrThrow({ where: { projectId, title: 'Should still be a draft' } });
    expect(stored.reviewState).toBe('DRAFT');
    expect(stored.origin).toBe('AI_EXTRACTION');
  });

  it('rejects output that does not match the schema, and writes nothing', async () => {
    const before = await prisma.requirement.count({ where: { projectId } });
    // A requirement with no citations array at all.
    stubbedResult = { requirements: [{ title: 'Bad' } as never], conflicts: [], gaps: [] };

    await expect(extractRequirements({ projectId, sourceIds: [], userId })).rejects.toThrow(/schema/i);

    expect(await prisma.requirement.count({ where: { projectId } })).toBe(before);
    const run = await prisma.aiRun.findFirstOrThrow({ where: { projectId }, orderBy: { createdAt: 'desc' } });
    expect(run.state).toBe('FAILED');
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

    const run = await prisma.aiRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(run.promptVersion).toBe('extraction.v1');
    expect(run.schemaVersion).toBe('extraction.v1');
    expect(run.provider).toBe('ANTHROPIC');
    expect(run.state).toBe('AWAITING_REVIEW');
    expect(run.inputTokens).toBe(1000);
    expect(Number(run.costUsd)).toBeCloseTo(0.0175, 4);
    expect((run.inputSourceIds as string[]).length).toBeGreaterThan(0);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { projectId, action: 'ai.extraction_completed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.actorId).toBe(userId);
    expect(audit.entityId).toBe(outcome.runId);
  });

  // §16.1: a project can be barred from external AI processing entirely.
  it('refuses to run when the project has external AI disabled', async () => {
    await prisma.project.update({ where: { id: projectId }, data: { externalAiEnabled: false } });

    await expect(extractRequirements({ projectId, sourceIds: [], userId })).rejects.toThrow(/disabled for this project/i);

    await prisma.project.update({ where: { id: projectId }, data: { externalAiEnabled: true } });
  });

  it('refuses to send a source marked Restricted', async () => {
    await prisma.source.updateMany({ where: { projectId }, data: { confidentiality: 'RESTRICTED' } });

    await expect(extractRequirements({ projectId, sourceIds: [], userId })).rejects.toThrow(/No analysable sources/i);

    await prisma.source.updateMany({ where: { projectId }, data: { confidentiality: 'STANDARD' } });
  });
});
