import { z } from 'zod';
import {
  REQUIREMENT_CLASSES,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_REVIEW_STATES,
  SCOPE_CLASSIFICATIONS,
} from '../enums.js';

/**
 * A citation points at a stored fragment id, never at copied text
 * (blueprint §15.3: "store citations to source fragment IDs, not only copied
 * text, so provenance survives document reprocessing"). `quote` is carried
 * only so the reviewer sees the excerpt without a second round trip, and is
 * verified against the fragment before the record is accepted.
 */
export const citation = z.object({
  sourceFragmentId: z.string().min(1),
  quote: z.string().min(1).max(2000),
});
export type Citation = z.infer<typeof citation>;

/**
 * The schema the model is constrained to when extracting requirements.
 * Shared verbatim by the Anthropic and OpenAI adapters so a model swap cannot
 * change the shape of what lands in the database.
 */
export const extractedRequirement = z.object({
  title: z.string().min(3).max(200).describe('One-line statement of the need, in the client\'s own terms where possible'),
  statement: z.string().min(10).max(4000).describe('The full requirement, written so a developer could act on it'),
  requirementClass: z.enum(REQUIREMENT_CLASSES),
  priority: z.enum(REQUIREMENT_PRIORITIES),
  confidence: z.number().min(0).max(1).describe('0 = pure inference, 1 = stated verbatim in an authoritative source'),
  acceptanceCriteria: z
    .array(z.string().min(5).max(1000))
    .max(12)
    .describe('Objective, testable conditions. Empty when the source does not support any.'),
  citations: z.array(citation).min(1).describe('At least one fragment. A requirement with no source is not a requirement.'),
  isExclusion: z.boolean().describe('True when the source states this is explicitly NOT in scope'),
  isAssumption: z.boolean().describe('True when this is inferred rather than stated, and needs confirmation'),
  openQuestion: z
    .string()
    .max(1000)
    .nullable()
    .describe('The question a human must answer before this is safe to build, or null'),
});
export type ExtractedRequirement = z.infer<typeof extractedRequirement>;

export const detectedConflict = z.object({
  summary: z.string().min(10).max(1000).describe('What the two sources disagree about'),
  statementA: z.string().min(5).max(2000),
  statementB: z.string().min(5).max(2000),
  citationsA: z.array(citation).min(1),
  citationsB: z.array(citation).min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  /** The model proposes; §8.3 forbids it from deciding. */
  suggestedResolution: z.string().max(1000).nullable(),
});
export type DetectedConflict = z.infer<typeof detectedConflict>;

export const extractionResult = z.object({
  requirements: z.array(extractedRequirement).max(400),
  conflicts: z.array(detectedConflict).max(100),
  /** Things the sources plainly do not answer — §7.2 "omissions". */
  gaps: z
    .array(
      z.object({
        topic: z.string().min(3).max(200),
        why: z.string().min(10).max(1000),
      }),
    )
    .max(60),
});
export type ExtractionResult = z.infer<typeof extractionResult>;

/* ---------- review actions, blueprint §7.2 ---------- */

export const requirementListQuery = z.object({
  reviewState: z.enum(REQUIREMENT_REVIEW_STATES).optional(),
  requirementClass: z.enum(REQUIREMENT_CLASSES).optional(),
  priority: z.enum(REQUIREMENT_PRIORITIES).optional(),
  hasOpenQuestion: z.coerce.boolean().optional(),
  isExclusion: z.coerce.boolean().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type RequirementListQuery = z.infer<typeof requirementListQuery>;

export const updateRequirementBody = z.object({
  title: z.string().min(3).max(200).optional(),
  statement: z.string().min(10).max(4000).optional(),
  requirementClass: z.enum(REQUIREMENT_CLASSES).optional(),
  priority: z.enum(REQUIREMENT_PRIORITIES).optional(),
  acceptanceCriteria: z.array(z.string().min(1).max(1000)).max(20).optional(),
  isExclusion: z.boolean().optional(),
  isAssumption: z.boolean().optional(),
  openQuestion: z.string().max(1000).nullable().optional(),
  editReason: z.string().max(1000).optional(),
});
export type UpdateRequirementBody = z.infer<typeof updateRequirementBody>;

export const decideRequirementBody = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().max(2000).optional(),
});
export type DecideRequirementBody = z.infer<typeof decideRequirementBody>;

/**
 * §7.2: "Bulk approve is allowed only for high-confidence, non-conflicting
 * items". The threshold lives on the server; the client cannot raise its own.
 */
export const bulkApproveBody = z.object({
  requirementIds: z.array(z.string().uuid()).min(1).max(500),
  comment: z.string().max(2000).optional(),
});
export type BulkApproveBody = z.infer<typeof bulkApproveBody>;

export const BULK_APPROVE_MIN_CONFIDENCE = 0.8;

export const splitRequirementBody = z.object({
  parts: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        statement: z.string().min(10).max(4000),
        /** Fragment ids from the parent, so provenance survives the split. */
        citationFragmentIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(2)
    .max(10),
  reason: z.string().max(1000).optional(),
});
export type SplitRequirementBody = z.infer<typeof splitRequirementBody>;

export const mergeRequirementsBody = z.object({
  requirementIds: z.array(z.string().uuid()).min(2).max(20),
  title: z.string().min(3).max(200),
  statement: z.string().min(10).max(4000),
  reason: z.string().max(1000).optional(),
});
export type MergeRequirementsBody = z.infer<typeof mergeRequirementsBody>;

export const resolveConflictBody = z.object({
  /** Which side stands, or a written third answer. */
  resolution: z.enum(['SIDE_A', 'SIDE_B', 'BOTH', 'NEITHER']),
  rationale: z.string().min(5).max(2000),
  /** Promotes the outcome into the decision register (§6.1 project memory). */
  recordAsDecision: z.boolean().default(true),
});
export type ResolveConflictBody = z.infer<typeof resolveConflictBody>;

export const classifyAgainstBaselineResult = z.object({
  classification: z.enum(SCOPE_CLASSIFICATIONS),
  rationale: z.string().min(10).max(2000),
  relatedRequirementIds: z.array(z.string()).max(20),
  citations: z.array(citation),
  estimatedImpact: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
});
export type ClassifyAgainstBaselineResult = z.infer<typeof classifyAgainstBaselineResult>;
