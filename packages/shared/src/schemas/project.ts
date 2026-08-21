import { z } from 'zod';
import {
  CONFIDENTIALITY_LEVELS,
  ENGAGEMENT_TYPES,
  HEALTH_STATES,
  PROJECT_STAGES,
  ROLES,
  SOURCE_AUTHORITIES,
  SOURCE_KINDS,
} from '../enums.js';

export const createClientBody = z.object({
  name: z.string().min(2).max(160),
  contactName: z.string().max(160).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS).default('STANDARD'),
  communicationNotes: z.string().max(4000).optional(),
});
export type CreateClientBody = z.infer<typeof createClientBody>;

/**
 * Screen PJ-01, the create-project wizard. Everything the blueprint's §7.1
 * intake checklist demands is captured at creation so a project cannot enter
 * the lifecycle already missing its accountable owners.
 */
export const createProjectBody = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(2).max(200),
  code: z
    .string()
    .min(2)
    .max(24)
    .regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, digits and hyphens'),
  engagementType: z.enum(ENGAGEMENT_TYPES),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS).default('STANDARD'),
  projectManagerId: z.string().uuid(),
  technicalLeadId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  targetLaunchDate: z.coerce.date().optional(),
  contractValue: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('INR'),
  summary: z.string().max(4000).optional(),
  /** §16.1 — a project may opt out of external AI processing entirely. */
  externalAiEnabled: z.boolean().default(true),
});
export type CreateProjectBody = z.infer<typeof createProjectBody>;

export const updateProjectBody = createProjectBody.partial().omit({ clientId: true, code: true }).extend({
  stage: z.enum(PROJECT_STAGES).optional(),
});
export type UpdateProjectBody = z.infer<typeof updateProjectBody>;

export const projectListQuery = z.object({
  stage: z.enum(PROJECT_STAGES).optional(),
  health: z.enum(HEALTH_STATES).optional(),
  engagementType: z.enum(ENGAGEMENT_TYPES).optional(),
  clientId: z.string().uuid().optional(),
  projectManagerId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type ProjectListQuery = z.infer<typeof projectListQuery>;

export const addMemberBody = z.object({
  userId: z.string().uuid(),
  projectRole: z.enum(ROLES),
});
export type AddMemberBody = z.infer<typeof addMemberBody>;

/**
 * Source metadata, blueprint §7.1. `statedAt` is deliberately separate from
 * `uploadedAt`: precedence and the recency tie-break turn on when the client
 * *said* it, not when somebody got round to uploading the file.
 */
export const createSourceBody = z.object({
  title: z.string().min(2).max(240),
  kind: z.enum(SOURCE_KINDS),
  authority: z.enum(SOURCE_AUTHORITIES),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS).default('STANDARD'),
  statedAt: z.coerce.date(),
  notes: z.string().max(4000).optional(),
  /** Pasted text instead of a file upload — transcripts and emails usually arrive this way. */
  inlineText: z.string().max(2_000_000).optional(),
});
export type CreateSourceBody = z.infer<typeof createSourceBody>;

/** §7.1 source completeness checklist — the intake exit gate. */
export const INTAKE_CHECKLIST_ITEMS = [
  { key: 'PROPOSAL', label: 'Signed proposal or contract uploaded' },
  { key: 'DEADLINES', label: 'Agreed deadlines confirmed in writing' },
  { key: 'DESIGNS', label: 'Designs or design responsibility agreed' },
  { key: 'CONTENT_OWNERSHIP', label: 'Content ownership and delivery dates agreed' },
  { key: 'CREDENTIALS', label: 'Credentials location recorded in the password manager' },
  { key: 'CLIENT_DEPENDENCIES', label: 'Client dependencies listed with owners' },
] as const;
export type IntakeChecklistKey = (typeof INTAKE_CHECKLIST_ITEMS)[number]['key'];

export const updateIntakeChecklistBody = z.object({
  key: z.enum(INTAKE_CHECKLIST_ITEMS.map((i) => i.key) as [IntakeChecklistKey, ...IntakeChecklistKey[]]),
  done: z.boolean(),
  note: z.string().max(1000).optional(),
});
export type UpdateIntakeChecklistBody = z.infer<typeof updateIntakeChecklistBody>;
