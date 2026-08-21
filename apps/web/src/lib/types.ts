import type { HealthState, Role } from '@deliveryos/shared';

export type Capability =
  | 'project.create' | 'project.update' | 'project.archive' | 'client.manage'
  | 'source.upload' | 'source.setAuthority' | 'ai.run'
  | 'requirement.edit' | 'requirement.decide' | 'requirement.bulkApprove' | 'conflict.resolve'
  | 'baseline.propose' | 'baseline.approve' | 'changeRequest.approve' | 'plan.approve'
  | 'capacity.resolveConflict' | 'workItem.accept' | 'release.approve'
  | 'user.manage' | 'audit.read' | 'commercial.read';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PersonRef {
  id: string;
  name: string;
  avatarColor: string | null;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  summary: string | null;
  stage: string;
  health: HealthState;
  engagementType: string;
  targetLaunchDate: string | null;
  contractValue: string | null;
  currency: string;
  client: { id: string; name: string };
  projectManager: PersonRef;
  _count: { requirements: number; sources: number; workItems: number };
}

export interface HealthFact {
  rule: string;
  label: string;
  detail: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  points: number;
}

export interface SourceSummary {
  id: string;
  title: string;
  kind: string;
  authority: string;
  confidentiality: string;
  statedAt: string;
  processingState: string;
  processingError: string | null;
  originalFilename: string | null;
  extractedChars: number;
  uploadedBy: PersonRef;
  uploadedAt: string;
  _count: { fragments: number };
}

export interface CitationView {
  id: string;
  quote: string;
  fragment: {
    id: string;
    locator: string;
    text: string;
    source: { id: string; title: string; kind: string; authority: string; statedAt: string };
  };
}

export interface RequirementView {
  id: string;
  reference: string;
  title: string;
  statement: string;
  requirementClass: string;
  priority: string;
  reviewState: string;
  origin: string;
  confidence: string | null;
  acceptanceCriteria: string[];
  isExclusion: boolean;
  isAssumption: boolean;
  openQuestion: string | null;
  questionAnswer: string | null;
  questionAnsweredAt: string | null;
  citations: CitationView[];
}

export interface ConflictView {
  id: string;
  summary: string;
  statementA: string;
  statementB: string;
  severity: string;
  state: string;
  suggestedResolution: string | null;
  resolution: string | null;
  rationale: string | null;
  citations: (CitationView & { side: string })[];
}

export interface BaselineView {
  id: string;
  version: number;
  title: string;
  state: string;
  changeReason: string | null;
  effectiveDate: string | null;
  proposedAt: string | null;
  approvedAt: string | null;
  _count: { requirements: number };
  approvals?: { id: string; decision: string; comment: string | null; approver: PersonRef; createdAt: string }[];
}

export interface AiRunView {
  id: string;
  jobType: string;
  state: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  producedCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  latencyMs: number | null;
  warnings: string[];
  error: string | null;
  createdAt: string;
  triggeredBy: PersonRef;
}

export interface AuditEventView {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
  actor: PersonRef | null;
  project: { id: string; code: string; name: string } | null;
}

export type { HealthState, Role };
