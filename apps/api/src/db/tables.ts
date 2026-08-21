/**
 * Row shapes for every table, and the Knex table registry that makes
 * `db('Requirement')` typed.
 *
 * This file replaces what Prisma generated. Registering the tables below means
 * a misspelled column or a wrong-typed insert is a compile error rather than a
 * runtime one — the property that mattered most about Prisma and the thing a
 * bare query builder otherwise gives up.
 *
 * Naming stays PascalCase to match the previous schema exactly, so every API
 * response, every audit `entityType` and every stored reference keeps working.
 */
import type {
  AiJobType, AiProvider, AiRunState, ConfidentialityLevel, EngagementType,
  HealthState, ProjectStage, RequirementClass, RequirementPriority,
  RequirementReviewState, Role, SourceAuthority, SourceKind,
  SourceProcessingState, WorkItemStatus, WorkItemType,
} from '@deliveryos/shared';

/** MySQL has no boolean; the driver hands back 0/1 from TINYINT(1). */
export type DbBool = 0 | 1;
/** DECIMAL arrives as a string from mysql2, which is correct — it preserves precision. */
export type DbDecimal = string;

export interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  jobTitle: string | null;
  avatarColor: string | null;
  isActive: DbBool;
  weeklyHours: DbDecimal;
  timezone: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientRow {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  communicationNotes: string | null;
  confidentiality: ConfidentialityLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  summary: string | null;
  clientId: string;
  engagementType: EngagementType;
  stage: ProjectStage;
  health: HealthState;
  healthFacts: unknown;
  healthComputedAt: Date | null;
  confidentiality: ConfidentialityLevel;
  projectManagerId: string;
  technicalLeadId: string | null;
  startDate: Date | null;
  targetLaunchDate: Date | null;
  contractValue: DbDecimal | null;
  currency: string;
  externalAiEnabled: DbBool;
  intakeChecklist: unknown;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMemberRow {
  id: string;
  projectId: string;
  userId: string;
  projectRole: Role;
  addedAt: Date;
}

export interface SourceRow {
  id: string;
  projectId: string;
  title: string;
  kind: SourceKind;
  authority: SourceAuthority;
  confidentiality: ConfidentialityLevel;
  statedAt: Date;
  notes: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  storageKey: string | null;
  checksum: string | null;
  processingState: SourceProcessingState;
  processingError: string | null;
  extractedChars: number;
  version: number;
  supersedesId: string | null;
  uploadedById: string;
  uploadedAt: Date;
  updatedAt: Date;
}

export interface SourceFragmentRow {
  id: string;
  sourceId: string;
  ordinal: number;
  locator: string;
  text: string;
  charStart: number;
  charEnd: number;
  createdAt: Date;
}

export type RequirementOrigin = 'AI_EXTRACTION' | 'MANUAL' | 'SPLIT' | 'MERGE' | 'CHANGE_REQUEST';

export interface RequirementRow {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  statement: string;
  requirementClass: RequirementClass;
  priority: RequirementPriority;
  reviewState: RequirementReviewState;
  origin: RequirementOrigin;
  confidence: DbDecimal | null;
  acceptanceCriteria: unknown;
  isExclusion: DbBool;
  isAssumption: DbBool;
  openQuestion: string | null;
  questionAnsweredAt: Date | null;
  questionAnswer: string | null;
  supersededById: string | null;
  aiRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequirementCitationRow {
  id: string;
  requirementId: string;
  sourceFragmentId: string;
  quote: string;
}

export interface RequirementRevisionRow {
  id: string;
  requirementId: string;
  revision: number;
  action: string;
  changes: unknown;
  snapshot: unknown;
  reason: string | null;
  actorId: string;
  createdAt: Date;
}

export type ConflictState = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface ConflictRow {
  id: string;
  projectId: string;
  summary: string;
  statementA: string;
  statementB: string;
  severity: string;
  state: ConflictState;
  suggestedResolution: string | null;
  resolution: string | null;
  rationale: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  decisionId: string | null;
  aiRunId: string | null;
  createdAt: Date;
}

export interface ConflictCitationRow {
  id: string;
  conflictId: string;
  sourceFragmentId: string;
  side: string;
  quote: string;
}

export type BaselineState = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SUPERSEDED';

export interface ScopeBaselineRow {
  id: string;
  projectId: string;
  version: number;
  title: string;
  state: BaselineState;
  changeReason: string | null;
  effectiveDate: Date | null;
  proposedById: string | null;
  proposedAt: Date | null;
  approvedById: string | null;
  approvedAt: Date | null;
  supersededAt: Date | null;
  createdAt: Date;
}

export interface BaselineRequirementRow {
  id: string;
  baselineId: string;
  requirementId: string;
  title: string;
  statement: string;
  requirementClass: RequirementClass;
  priority: RequirementPriority;
  acceptanceCriteria: unknown;
  isExclusion: DbBool;
  citationSnapshot: unknown;
}

export interface DeliverableRow {
  id: string;
  projectId: string;
  reference: string;
  name: string;
  description: string | null;
  acceptanceCriteria: unknown;
  ownerId: string | null;
  milestoneId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliverableRequirementRow {
  deliverableId: string;
  requirementId: string;
}

export interface MilestoneRow {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  targetDate: Date | null;
  actualDate: Date | null;
  ordinal: number;
  ownerId: string | null;
  confidence: DbDecimal | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkItemRow {
  id: string;
  projectId: string;
  reference: string;
  type: WorkItemType;
  status: WorkItemStatus;
  title: string;
  brief: string | null;
  requirementId: string | null;
  deliverableId: string | null;
  milestoneId: string | null;
  parentId: string | null;
  assigneeId: string | null;
  estimateHours: DbDecimal | null;
  actualHours: DbDecimal | null;
  dueDate: Date | null;
  priority: number;
  reviewRoute: unknown;
  definitionOfReady: unknown;
  acceptanceCriteria: unknown;
  startedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChecklistItemRow {
  id: string;
  workItemId: string;
  label: string;
  ownerRole: Role | null;
  required: DbBool;
  result: string | null;
  checkedById: string | null;
  checkedAt: Date | null;
  ordinal: number;
}

export interface EvidenceRow {
  id: string;
  workItemId: string;
  kind: string;
  label: string;
  url: string | null;
  storageKey: string | null;
  addedById: string;
  addedAt: Date;
}

export type ApprovalSubject =
  | 'SCOPE_BASELINE' | 'PROJECT_PLAN' | 'WORK_ITEM'
  | 'CHANGE_REQUEST' | 'RELEASE' | 'CLOSURE';
export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'RETURNED';

export interface ApprovalRow {
  id: string;
  projectId: string;
  subject: ApprovalSubject;
  decision: ApprovalDecision;
  comment: string | null;
  approverId: string;
  baselineId: string | null;
  workItemId: string | null;
  changeRequestId: string | null;
  baselineVersion: number | null;
  createdAt: Date;
}

export interface DecisionRow {
  id: string;
  projectId: string;
  question: string;
  options: unknown;
  chosen: string;
  rationale: string;
  decidedById: string;
  decidedAt: Date;
  affectedRecords: unknown;
}

export type RiskKind = 'RISK' | 'ISSUE' | 'BLOCKER' | 'DEPENDENCY';
export type RiskState = 'OPEN' | 'MITIGATING' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';

export interface RiskRow {
  id: string;
  projectId: string;
  kind: RiskKind;
  state: RiskState;
  title: string;
  detail: string | null;
  category: string | null;
  severity: string;
  probability: string | null;
  impact: string | null;
  ownerId: string | null;
  workItemId: string | null;
  action: string | null;
  dueDate: Date | null;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ChangeRequestState =
  | 'DRAFT' | 'ASSESSING' | 'AWAITING_CLIENT' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export interface ChangeRequestRow {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  request: string;
  state: ChangeRequestState;
  classification: string | null;
  effortHours: DbDecimal | null;
  costAmount: DbDecimal | null;
  scheduleImpactDays: number | null;
  affectedRecords: unknown;
  resultingBaselineId: string | null;
  clientApprovalEvidence: string | null;
  raisedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiRunRow {
  id: string;
  projectId: string;
  jobType: AiJobType;
  state: AiRunState;
  provider: AiProvider;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputSourceIds: unknown;
  inputChars: number;
  instructions: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: DbDecimal | null;
  latencyMs: number | null;
  producedCount: number;
  warnings: unknown;
  error: string | null;
  triggeredById: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface AuditEventRow {
  id: string;
  projectId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  detail: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * Registering the tables with Knex is what buys back compile-time safety:
 * `db('Project').where({ stag: 'X' })` stops being valid TypeScript.
 */
declare module 'knex/types/tables.js' {
  interface Tables {
    User: UserRow;
    Client: ClientRow;
    Project: ProjectRow;
    ProjectMember: ProjectMemberRow;
    Source: SourceRow;
    SourceFragment: SourceFragmentRow;
    Requirement: RequirementRow;
    RequirementCitation: RequirementCitationRow;
    RequirementRevision: RequirementRevisionRow;
    Conflict: ConflictRow;
    ConflictCitation: ConflictCitationRow;
    ScopeBaseline: ScopeBaselineRow;
    BaselineRequirement: BaselineRequirementRow;
    Deliverable: DeliverableRow;
    DeliverableRequirement: DeliverableRequirementRow;
    Milestone: MilestoneRow;
    WorkItem: WorkItemRow;
    ChecklistItem: ChecklistItemRow;
    Evidence: EvidenceRow;
    Approval: ApprovalRow;
    Decision: DecisionRow;
    Risk: RiskRow;
    ChangeRequest: ChangeRequestRow;
    AiRun: AiRunRow;
    AuditEvent: AuditEventRow;
  }
}
