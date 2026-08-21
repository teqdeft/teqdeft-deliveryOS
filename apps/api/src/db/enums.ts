/**
 * The single source of allowed values for every enumerated column.
 *
 * These mirror `packages/shared/src/enums.ts` exactly. Under PostgreSQL these
 * were native enum types; MySQL's ENUM gives the same guarantee — an invalid
 * value is rejected by the database, not merely by application validation —
 * which is what keeps blueprint §"one spelling for an enum value" true even if
 * a future code path forgets to validate.
 */
export const ENUMS = {
  Role: ['FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'QA_ENGINEER', 'SALES', 'FINANCE_VIEWER', 'CLIENT_REVIEWER'],
  EngagementType: ['MARKETING_WEBSITE', 'ECOMMERCE', 'CUSTOM_PORTAL', 'WORDPRESS_SUPPORT', 'SEO_CRO_RETAINER', 'DESIGN_ONLY'],
  ProjectStage: ['DELIVERY_INTAKE', 'AI_ANALYSIS', 'HUMAN_CLARIFICATION', 'SCOPE_BASELINE', 'DELIVERY_PLANNING', 'RESOURCE_COMMITMENT', 'EXECUTION', 'QA_AND_ACCEPTANCE', 'LAUNCH_AND_HYPERCARE', 'CLOSURE_AND_LEARNING'],
  HealthState: ['GREEN', 'AMBER', 'RED', 'GREY'],
  Confidentiality: ['STANDARD', 'CONFIDENTIAL', 'RESTRICTED'],
  SourceKind: ['PROPOSAL', 'CONTRACT', 'EMAIL', 'TRANSCRIPT', 'BRIEF', 'DESIGN', 'SPREADSHEET', 'NOTE', 'OTHER'],
  SourceAuthority: ['SIGNED_CONTRACT', 'APPROVED_CHANGE_REQUEST', 'WRITTEN_CLIENT_APPROVAL', 'DECISION_RECORD', 'CALL_TRANSCRIPT', 'CLIENT_EMAIL', 'INTERNAL_NOTE'],
  SourceProcessingState: ['PENDING', 'EXTRACTING', 'READY', 'FAILED', 'UNSUPPORTED'],
  RequirementClass: ['BUSINESS_OBJECTIVE', 'USER_ROLE_PERMISSION', 'FUNCTIONAL_BEHAVIOUR', 'PAGE_SCREEN_CONTENT', 'INTEGRATION_DATA', 'TECHNICAL_CONSTRAINT', 'NON_FUNCTIONAL', 'MIGRATION_LAUNCH_SUPPORT', 'ASSUMPTION_EXCLUSION_QUESTION'],
  RequirementPriority: ['MUST', 'SHOULD', 'COULD', 'WONT'],
  RequirementReviewState: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED'],
  RequirementOrigin: ['AI_EXTRACTION', 'MANUAL', 'SPLIT', 'MERGE', 'CHANGE_REQUEST'],
  ConflictState: ['OPEN', 'RESOLVED', 'DISMISSED'],
  BaselineState: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUPERSEDED'],
  WorkItemType: ['TASK', 'SUBTASK', 'BUG', 'ACTION'],
  WorkItemStatus: ['DRAFT', 'NOT_READY', 'READY_TO_START', 'IN_PROGRESS', 'BLOCKED', 'DEVELOPER_REVIEW', 'TECHNICAL_REVIEW', 'QA_REVIEW', 'PM_REVIEW', 'CLIENT_REVIEW', 'ACCEPTED', 'DEPLOYED', 'CLOSED'],
  ApprovalSubject: ['SCOPE_BASELINE', 'PROJECT_PLAN', 'WORK_ITEM', 'CHANGE_REQUEST', 'RELEASE', 'CLOSURE'],
  ApprovalDecision: ['APPROVED', 'REJECTED', 'RETURNED'],
  RiskKind: ['RISK', 'ISSUE', 'BLOCKER', 'DEPENDENCY'],
  RiskState: ['OPEN', 'MITIGATING', 'ESCALATED', 'RESOLVED', 'CLOSED'],
  ChangeRequestState: ['DRAFT', 'ASSESSING', 'AWAITING_CLIENT', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  AiJobType: ['REQUIREMENT_EXTRACTION', 'CONFLICT_DETECTION', 'SCOPE_COMPARISON', 'PLAN_GENERATION', 'DAILY_AGENDA', 'RISK_MONITOR', 'QA_SUGGESTION', 'STATUS_DRAFT', 'PROJECT_MEMORY'],
  AiRunState: ['QUEUED', 'RUNNING', 'AWAITING_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED'],
  AiProvider: ['ANTHROPIC', 'OPENAI'],
} as const satisfies Record<string, readonly string[]>;

export type EnumName = keyof typeof ENUMS;

/** Knex's `.enu()` needs a mutable array; ENUMS is frozen for safety elsewhere. */
export const values = (name: EnumName): string[] => [...ENUMS[name]];
