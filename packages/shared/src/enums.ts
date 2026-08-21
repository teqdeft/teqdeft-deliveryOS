/**
 * Domain vocabulary from the product blueprint. These strings are the wire
 * format, the Prisma enum values and the UI keys — one spelling everywhere.
 */

/** Blueprint §4. Client reviewer exists in the model but is gated off until the client module ships. */
export const ROLES = [
  'FOUNDER',
  'DELIVERY_HEAD',
  'CTO',
  'PROJECT_MANAGER',
  'TEAM_MEMBER',
  'QA_ENGINEER',
  'SALES',
  'FINANCE_VIEWER',
  'CLIENT_REVIEWER',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  FOUNDER: 'Founder / Super Admin',
  DELIVERY_HEAD: 'Delivery Head',
  CTO: 'CTO / Technical Lead',
  PROJECT_MANAGER: 'Project Manager',
  TEAM_MEMBER: 'Team Member',
  QA_ENGINEER: 'QA Engineer',
  SALES: 'Sales / Handover',
  FINANCE_VIEWER: 'Finance Viewer',
  CLIENT_REVIEWER: 'Client Reviewer',
};

/** Roles with company-wide visibility rather than per-project membership. */
export const PORTFOLIO_ROLES: readonly Role[] = ['FOUNDER', 'DELIVERY_HEAD', 'CTO'];

/** Blueprint §5, the ten lifecycle stages. */
export const PROJECT_STAGES = [
  'DELIVERY_INTAKE',
  'AI_ANALYSIS',
  'HUMAN_CLARIFICATION',
  'SCOPE_BASELINE',
  'DELIVERY_PLANNING',
  'RESOURCE_COMMITMENT',
  'EXECUTION',
  'QA_AND_ACCEPTANCE',
  'LAUNCH_AND_HYPERCARE',
  'CLOSURE_AND_LEARNING',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  DELIVERY_INTAKE: 'Delivery intake',
  AI_ANALYSIS: 'AI analysis',
  HUMAN_CLARIFICATION: 'Human clarification',
  SCOPE_BASELINE: 'Scope baseline',
  DELIVERY_PLANNING: 'Delivery planning',
  RESOURCE_COMMITMENT: 'Resource commitment',
  EXECUTION: 'Execution',
  QA_AND_ACCEPTANCE: 'QA and acceptance',
  LAUNCH_AND_HYPERCARE: 'Launch and hypercare',
  CLOSURE_AND_LEARNING: 'Closure and learning',
};

/** Appendix B project templates. */
export const ENGAGEMENT_TYPES = [
  'MARKETING_WEBSITE',
  'ECOMMERCE',
  'CUSTOM_PORTAL',
  'WORDPRESS_SUPPORT',
  'SEO_CRO_RETAINER',
  'DESIGN_ONLY',
] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  MARKETING_WEBSITE: 'Marketing website',
  ECOMMERCE: 'E-commerce',
  CUSTOM_PORTAL: 'Custom portal / SaaS',
  WORDPRESS_SUPPORT: 'WordPress support',
  SEO_CRO_RETAINER: 'SEO / CRO retainer',
  DESIGN_ONLY: 'Design-only engagement',
};

/** Blueprint §13.1. */
export const HEALTH_STATES = ['GREEN', 'AMBER', 'RED', 'GREY'] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

/**
 * Blueprint §5 authority precedence, lowest number wins.
 *
 * The blueprint ranks by document *type* only, which leaves same-type
 * conflicts and a later email correcting an earlier transcript undecided.
 * `resolveAuthority()` in ./authority.ts adds the missing recency tie-break.
 */
export const SOURCE_AUTHORITIES = [
  'SIGNED_CONTRACT',
  'APPROVED_CHANGE_REQUEST',
  'WRITTEN_CLIENT_APPROVAL',
  'DECISION_RECORD',
  'CALL_TRANSCRIPT',
  'CLIENT_EMAIL',
  'INTERNAL_NOTE',
] as const;
export type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];

export const AUTHORITY_RANK: Record<SourceAuthority, number> = {
  SIGNED_CONTRACT: 1,
  APPROVED_CHANGE_REQUEST: 2,
  WRITTEN_CLIENT_APPROVAL: 3,
  DECISION_RECORD: 4,
  CALL_TRANSCRIPT: 5,
  CLIENT_EMAIL: 6,
  INTERNAL_NOTE: 7,
};

export const AUTHORITY_LABELS: Record<SourceAuthority, string> = {
  SIGNED_CONTRACT: 'Signed proposal or contract',
  APPROVED_CHANGE_REQUEST: 'Approved change request',
  WRITTEN_CLIENT_APPROVAL: 'Explicit written client approval',
  DECISION_RECORD: 'Approved decision record',
  CALL_TRANSCRIPT: 'Call transcript',
  CLIENT_EMAIL: 'Client email',
  INTERNAL_NOTE: 'Internal note',
};

export const SOURCE_KINDS = [
  'PROPOSAL',
  'CONTRACT',
  'EMAIL',
  'TRANSCRIPT',
  'BRIEF',
  'DESIGN',
  'SPREADSHEET',
  'NOTE',
  'OTHER',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Blueprint §7.1 — raw files are immutable, so processing is a state machine. */
export const SOURCE_PROCESSING_STATES = [
  'PENDING',
  'EXTRACTING',
  'READY',
  'FAILED',
  'UNSUPPORTED',
] as const;
export type SourceProcessingState = (typeof SOURCE_PROCESSING_STATES)[number];

/** Blueprint §16.1 — classification gates whether a source may reach an external model. */
export const CONFIDENTIALITY_LEVELS = ['STANDARD', 'CONFIDENTIAL', 'RESTRICTED'] as const;
export type ConfidentialityLevel = (typeof CONFIDENTIALITY_LEVELS)[number];

/** Blueprint §6.2, the nine requirement classes. */
export const REQUIREMENT_CLASSES = [
  'BUSINESS_OBJECTIVE',
  'USER_ROLE_PERMISSION',
  'FUNCTIONAL_BEHAVIOUR',
  'PAGE_SCREEN_CONTENT',
  'INTEGRATION_DATA',
  'TECHNICAL_CONSTRAINT',
  'NON_FUNCTIONAL',
  'MIGRATION_LAUNCH_SUPPORT',
  'ASSUMPTION_EXCLUSION_QUESTION',
] as const;
export type RequirementClass = (typeof REQUIREMENT_CLASSES)[number];

export const REQUIREMENT_CLASS_LABELS: Record<RequirementClass, string> = {
  BUSINESS_OBJECTIVE: 'Business objective and outcome',
  USER_ROLE_PERMISSION: 'User role and permission',
  FUNCTIONAL_BEHAVIOUR: 'Functional behaviour',
  PAGE_SCREEN_CONTENT: 'Page, screen or content',
  INTEGRATION_DATA: 'Integration and data exchange',
  TECHNICAL_CONSTRAINT: 'Technical constraint or architecture',
  NON_FUNCTIONAL: 'Performance, security, privacy, accessibility',
  MIGRATION_LAUNCH_SUPPORT: 'Migration, launch, hosting, support',
  ASSUMPTION_EXCLUSION_QUESTION: 'Assumption, exclusion, dependency, question',
};

export const REQUIREMENT_PRIORITIES = ['MUST', 'SHOULD', 'COULD', 'WONT'] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];

/**
 * Blueprint §7.2. A requirement is a draft until a human decides. Nothing an
 * AI run produces may skip DRAFT.
 */
export const REQUIREMENT_REVIEW_STATES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
] as const;
export type RequirementReviewState = (typeof REQUIREMENT_REVIEW_STATES)[number];

/** Blueprint §7.3 — how a new inbound statement relates to the approved baseline. */
export const SCOPE_CLASSIFICATIONS = [
  'INCLUDED',
  'CLARIFICATION',
  'MINOR_ADJUSTMENT',
  'POTENTIAL_CHANGE',
  'DEFINITE_ADDITIONAL_SCOPE',
] as const;
export type ScopeClassification = (typeof SCOPE_CLASSIFICATIONS)[number];

export const SCOPE_CLASSIFICATION_LABELS: Record<ScopeClassification, string> = {
  INCLUDED: 'Included in baseline',
  CLARIFICATION: 'Clarification',
  MINOR_ADJUSTMENT: 'Minor adjustment',
  POTENTIAL_CHANGE: 'Potential change',
  DEFINITE_ADDITIONAL_SCOPE: 'Definite additional scope',
};

export const BASELINE_STATES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUPERSEDED'] as const;
export type BaselineState = (typeof BASELINE_STATES)[number];

/**
 * Blueprint §11.1. The five review states differ only by *who* reviews, so the
 * UI groups them into one "In Review" lane keyed by `reviewRoute` — the data
 * stays faithful to the blueprint, the board stays readable.
 */
export const WORK_ITEM_STATUSES = [
  'DRAFT',
  'NOT_READY',
  'READY_TO_START',
  'IN_PROGRESS',
  'BLOCKED',
  'DEVELOPER_REVIEW',
  'TECHNICAL_REVIEW',
  'QA_REVIEW',
  'PM_REVIEW',
  'CLIENT_REVIEW',
  'ACCEPTED',
  'DEPLOYED',
  'CLOSED',
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const REVIEW_STATUSES: readonly WorkItemStatus[] = [
  'DEVELOPER_REVIEW',
  'TECHNICAL_REVIEW',
  'QA_REVIEW',
  'PM_REVIEW',
  'CLIENT_REVIEW',
];

export const WORK_ITEM_TYPES = ['TASK', 'SUBTASK', 'BUG', 'ACTION'] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

export const RISK_KINDS = ['RISK', 'ISSUE', 'BLOCKER', 'DEPENDENCY'] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

/** Blueprint §10.6 blocker taxonomy — drives owner routing and the SLA timer. */
export const BLOCKER_CATEGORIES = [
  'ACCESS',
  'DECISION',
  'DEPENDENCY',
  'CLIENT_INPUT',
  'TECHNICAL',
  'CAPACITY',
] as const;
export type BlockerCategory = (typeof BLOCKER_CATEGORIES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Blueprint §8.1 — one entry per specialised assistant, used as the model-policy key. */
export const AI_JOB_TYPES = [
  'REQUIREMENT_EXTRACTION',
  'CONFLICT_DETECTION',
  'SCOPE_COMPARISON',
  'PLAN_GENERATION',
  'DAILY_AGENDA',
  'RISK_MONITOR',
  'QA_SUGGESTION',
  'STATUS_DRAFT',
  'PROJECT_MEMORY',
] as const;
export type AiJobType = (typeof AI_JOB_TYPES)[number];

export const AI_RUN_STATES = [
  'QUEUED',
  'RUNNING',
  'AWAITING_REVIEW',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type AiRunState = (typeof AI_RUN_STATES)[number];

export const AI_PROVIDERS = ['ANTHROPIC', 'OPENAI'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
