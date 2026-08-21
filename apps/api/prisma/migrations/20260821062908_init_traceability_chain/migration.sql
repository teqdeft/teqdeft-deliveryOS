-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'QA_ENGINEER', 'SALES', 'FINANCE_VIEWER', 'CLIENT_REVIEWER');

-- CreateEnum
CREATE TYPE "EngagementType" AS ENUM ('MARKETING_WEBSITE', 'ECOMMERCE', 'CUSTOM_PORTAL', 'WORDPRESS_SUPPORT', 'SEO_CRO_RETAINER', 'DESIGN_ONLY');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('DELIVERY_INTAKE', 'AI_ANALYSIS', 'HUMAN_CLARIFICATION', 'SCOPE_BASELINE', 'DELIVERY_PLANNING', 'RESOURCE_COMMITMENT', 'EXECUTION', 'QA_AND_ACCEPTANCE', 'LAUNCH_AND_HYPERCARE', 'CLOSURE_AND_LEARNING');

-- CreateEnum
CREATE TYPE "HealthState" AS ENUM ('GREEN', 'AMBER', 'RED', 'GREY');

-- CreateEnum
CREATE TYPE "Confidentiality" AS ENUM ('STANDARD', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('PROPOSAL', 'CONTRACT', 'EMAIL', 'TRANSCRIPT', 'BRIEF', 'DESIGN', 'SPREADSHEET', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceAuthority" AS ENUM ('SIGNED_CONTRACT', 'APPROVED_CHANGE_REQUEST', 'WRITTEN_CLIENT_APPROVAL', 'DECISION_RECORD', 'CALL_TRANSCRIPT', 'CLIENT_EMAIL', 'INTERNAL_NOTE');

-- CreateEnum
CREATE TYPE "SourceProcessingState" AS ENUM ('PENDING', 'EXTRACTING', 'READY', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "RequirementClass" AS ENUM ('BUSINESS_OBJECTIVE', 'USER_ROLE_PERMISSION', 'FUNCTIONAL_BEHAVIOUR', 'PAGE_SCREEN_CONTENT', 'INTEGRATION_DATA', 'TECHNICAL_CONSTRAINT', 'NON_FUNCTIONAL', 'MIGRATION_LAUNCH_SUPPORT', 'ASSUMPTION_EXCLUSION_QUESTION');

-- CreateEnum
CREATE TYPE "RequirementPriority" AS ENUM ('MUST', 'SHOULD', 'COULD', 'WONT');

-- CreateEnum
CREATE TYPE "RequirementReviewState" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RequirementOrigin" AS ENUM ('AI_EXTRACTION', 'MANUAL', 'SPLIT', 'MERGE', 'CHANGE_REQUEST');

-- CreateEnum
CREATE TYPE "ConflictState" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "BaselineState" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "WorkItemType" AS ENUM ('TASK', 'SUBTASK', 'BUG', 'ACTION');

-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('DRAFT', 'NOT_READY', 'READY_TO_START', 'IN_PROGRESS', 'BLOCKED', 'DEVELOPER_REVIEW', 'TECHNICAL_REVIEW', 'QA_REVIEW', 'PM_REVIEW', 'CLIENT_REVIEW', 'ACCEPTED', 'DEPLOYED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalSubject" AS ENUM ('SCOPE_BASELINE', 'PROJECT_PLAN', 'WORK_ITEM', 'CHANGE_REQUEST', 'RELEASE', 'CLOSURE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "RiskKind" AS ENUM ('RISK', 'ISSUE', 'BLOCKER', 'DEPENDENCY');

-- CreateEnum
CREATE TYPE "RiskState" AS ENUM ('OPEN', 'MITIGATING', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChangeRequestState" AS ENUM ('DRAFT', 'ASSESSING', 'AWAITING_CLIENT', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AiJobType" AS ENUM ('REQUIREMENT_EXTRACTION', 'CONFLICT_DETECTION', 'SCOPE_COMPARISON', 'PLAN_GENERATION', 'DAILY_AGENDA', 'RISK_MONITOR', 'QA_SUGGESTION', 'STATUS_DRAFT', 'PROJECT_MEMORY');

-- CreateEnum
CREATE TYPE "AiRunState" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "jobTitle" TEXT,
    "avatarColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "weeklyHours" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "communicationNotes" TEXT,
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "clientId" TEXT NOT NULL,
    "engagementType" "EngagementType" NOT NULL,
    "stage" "ProjectStage" NOT NULL DEFAULT 'DELIVERY_INTAKE',
    "health" "HealthState" NOT NULL DEFAULT 'GREY',
    "healthFacts" JSONB NOT NULL DEFAULT '[]',
    "healthComputedAt" TIMESTAMP(3),
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'STANDARD',
    "projectManagerId" TEXT NOT NULL,
    "technicalLeadId" TEXT,
    "startDate" TIMESTAMP(3),
    "targetLaunchDate" TIMESTAMP(3),
    "contractValue" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "externalAiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "intakeChecklist" JSONB NOT NULL DEFAULT '{}',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectRole" "Role" NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "authority" "SourceAuthority" NOT NULL,
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'STANDARD',
    "statedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "storageKey" TEXT,
    "checksum" TEXT,
    "processingState" "SourceProcessingState" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "extractedChars" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFragment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "locator" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "charStart" INTEGER NOT NULL,
    "charEnd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "requirementClass" "RequirementClass" NOT NULL,
    "priority" "RequirementPriority" NOT NULL DEFAULT 'MUST',
    "reviewState" "RequirementReviewState" NOT NULL DEFAULT 'DRAFT',
    "origin" "RequirementOrigin" NOT NULL DEFAULT 'AI_EXTRACTION',
    "confidence" DECIMAL(3,2),
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "isExclusion" BOOLEAN NOT NULL DEFAULT false,
    "isAssumption" BOOLEAN NOT NULL DEFAULT false,
    "openQuestion" TEXT,
    "questionAnsweredAt" TIMESTAMP(3),
    "questionAnswer" TEXT,
    "supersededById" TEXT,
    "aiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementCitation" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "sourceFragmentId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,

    CONSTRAINT "RequirementCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementRevision" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "statementA" TEXT NOT NULL,
    "statementB" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "state" "ConflictState" NOT NULL DEFAULT 'OPEN',
    "suggestedResolution" TEXT,
    "resolution" TEXT,
    "rationale" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "decisionId" TEXT,
    "aiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictCitation" (
    "id" TEXT NOT NULL,
    "conflictId" TEXT NOT NULL,
    "sourceFragmentId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quote" TEXT NOT NULL,

    CONSTRAINT "ConflictCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeBaseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" "BaselineState" NOT NULL DEFAULT 'DRAFT',
    "changeReason" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "proposedById" TEXT,
    "proposedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScopeBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselineRequirement" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "requirementClass" "RequirementClass" NOT NULL,
    "priority" "RequirementPriority" NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "isExclusion" BOOLEAN NOT NULL DEFAULT false,
    "citationSnapshot" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "BaselineRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "ownerId" TEXT,
    "milestoneId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableRequirement" (
    "deliverableId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,

    CONSTRAINT "DeliverableRequirement_pkey" PRIMARY KEY ("deliverableId","requirementId")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "confidence" DECIMAL(3,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "WorkItemType" NOT NULL DEFAULT 'TASK',
    "status" "WorkItemStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "brief" TEXT,
    "requirementId" TEXT,
    "deliverableId" TEXT,
    "milestoneId" TEXT,
    "parentId" TEXT,
    "assigneeId" TEXT,
    "estimateHours" DECIMAL(6,2),
    "actualHours" DECIMAL(6,2),
    "dueDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 3,
    "reviewRoute" JSONB NOT NULL DEFAULT '[]',
    "definitionOfReady" JSONB NOT NULL DEFAULT '[]',
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ownerRole" "Role",
    "required" BOOLEAN NOT NULL DEFAULT true,
    "result" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "ordinal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT,
    "storageKey" TEXT,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subject" "ApprovalSubject" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "approverId" TEXT NOT NULL,
    "baselineId" TEXT,
    "workItemId" TEXT,
    "changeRequestId" TEXT,
    "baselineVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "chosen" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "affectedRecords" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "RiskKind" NOT NULL,
    "state" "RiskState" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "category" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "probability" TEXT,
    "impact" TEXT,
    "ownerId" TEXT,
    "workItemId" TEXT,
    "action" TEXT,
    "dueDate" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "state" "ChangeRequestState" NOT NULL DEFAULT 'DRAFT',
    "classification" TEXT,
    "effortHours" DECIMAL(8,2),
    "costAmount" DECIMAL(14,2),
    "scheduleImpactDays" INTEGER,
    "affectedRecords" JSONB NOT NULL DEFAULT '[]',
    "resultingBaselineId" TEXT,
    "clientApprovalEvidence" TEXT,
    "raisedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobType" "AiJobType" NOT NULL,
    "state" "AiRunState" NOT NULL DEFAULT 'QUEUED',
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "inputSourceIds" JSONB NOT NULL DEFAULT '[]',
    "inputChars" INTEGER NOT NULL DEFAULT 0,
    "instructions" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(10,4),
    "latencyMs" INTEGER,
    "producedCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "triggeredById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_stage_health_idx" ON "Project"("stage", "health");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_projectManagerId_idx" ON "Project"("projectManagerId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Source_projectId_processingState_idx" ON "Source"("projectId", "processingState");

-- CreateIndex
CREATE INDEX "Source_projectId_authority_statedAt_idx" ON "Source"("projectId", "authority", "statedAt");

-- CreateIndex
CREATE INDEX "SourceFragment_sourceId_idx" ON "SourceFragment"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFragment_sourceId_ordinal_key" ON "SourceFragment"("sourceId", "ordinal");

-- CreateIndex
CREATE INDEX "Requirement_projectId_reviewState_idx" ON "Requirement"("projectId", "reviewState");

-- CreateIndex
CREATE INDEX "Requirement_projectId_requirementClass_idx" ON "Requirement"("projectId", "requirementClass");

-- CreateIndex
CREATE INDEX "Requirement_aiRunId_idx" ON "Requirement"("aiRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_projectId_reference_key" ON "Requirement"("projectId", "reference");

-- CreateIndex
CREATE INDEX "RequirementCitation_sourceFragmentId_idx" ON "RequirementCitation"("sourceFragmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementCitation_requirementId_sourceFragmentId_key" ON "RequirementCitation"("requirementId", "sourceFragmentId");

-- CreateIndex
CREATE INDEX "RequirementRevision_requirementId_idx" ON "RequirementRevision"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementRevision_requirementId_revision_key" ON "RequirementRevision"("requirementId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Conflict_decisionId_key" ON "Conflict"("decisionId");

-- CreateIndex
CREATE INDEX "Conflict_projectId_state_idx" ON "Conflict"("projectId", "state");

-- CreateIndex
CREATE INDEX "ConflictCitation_conflictId_idx" ON "ConflictCitation"("conflictId");

-- CreateIndex
CREATE INDEX "ConflictCitation_sourceFragmentId_idx" ON "ConflictCitation"("sourceFragmentId");

-- CreateIndex
CREATE INDEX "ScopeBaseline_projectId_state_idx" ON "ScopeBaseline"("projectId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ScopeBaseline_projectId_version_key" ON "ScopeBaseline"("projectId", "version");

-- CreateIndex
CREATE INDEX "BaselineRequirement_requirementId_idx" ON "BaselineRequirement"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineRequirement_baselineId_requirementId_key" ON "BaselineRequirement"("baselineId", "requirementId");

-- CreateIndex
CREATE INDEX "Deliverable_projectId_idx" ON "Deliverable"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_projectId_reference_key" ON "Deliverable"("projectId", "reference");

-- CreateIndex
CREATE INDEX "DeliverableRequirement_requirementId_idx" ON "DeliverableRequirement"("requirementId");

-- CreateIndex
CREATE INDEX "Milestone_projectId_targetDate_idx" ON "Milestone"("projectId", "targetDate");

-- CreateIndex
CREATE INDEX "WorkItem_projectId_status_idx" ON "WorkItem"("projectId", "status");

-- CreateIndex
CREATE INDEX "WorkItem_assigneeId_status_idx" ON "WorkItem"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "WorkItem_milestoneId_idx" ON "WorkItem"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_projectId_reference_key" ON "WorkItem"("projectId", "reference");

-- CreateIndex
CREATE INDEX "ChecklistItem_workItemId_idx" ON "ChecklistItem"("workItemId");

-- CreateIndex
CREATE INDEX "Evidence_workItemId_idx" ON "Evidence"("workItemId");

-- CreateIndex
CREATE INDEX "Approval_projectId_subject_idx" ON "Approval"("projectId", "subject");

-- CreateIndex
CREATE INDEX "Approval_approverId_idx" ON "Approval"("approverId");

-- CreateIndex
CREATE INDEX "Decision_projectId_idx" ON "Decision"("projectId");

-- CreateIndex
CREATE INDEX "Risk_projectId_kind_state_idx" ON "Risk"("projectId", "kind", "state");

-- CreateIndex
CREATE INDEX "Risk_ownerId_state_idx" ON "Risk"("ownerId", "state");

-- CreateIndex
CREATE INDEX "ChangeRequest_projectId_state_idx" ON "ChangeRequest"("projectId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_projectId_reference_key" ON "ChangeRequest"("projectId", "reference");

-- CreateIndex
CREATE INDEX "AiRun_projectId_jobType_createdAt_idx" ON "AiRun"("projectId", "jobType", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_state_idx" ON "AiRun"("state");

-- CreateIndex
CREATE INDEX "AuditEvent_projectId_createdAt_idx" ON "AuditEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_technicalLeadId_fkey" FOREIGN KEY ("technicalLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFragment" ADD CONSTRAINT "SourceFragment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementCitation" ADD CONSTRAINT "RequirementCitation_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementCitation" ADD CONSTRAINT "RequirementCitation_sourceFragmentId_fkey" FOREIGN KEY ("sourceFragmentId") REFERENCES "SourceFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementRevision" ADD CONSTRAINT "RequirementRevision_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementRevision" ADD CONSTRAINT "RequirementRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictCitation" ADD CONSTRAINT "ConflictCitation_conflictId_fkey" FOREIGN KEY ("conflictId") REFERENCES "Conflict"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictCitation" ADD CONSTRAINT "ConflictCitation_sourceFragmentId_fkey" FOREIGN KEY ("sourceFragmentId") REFERENCES "SourceFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeBaseline" ADD CONSTRAINT "ScopeBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineRequirement" ADD CONSTRAINT "BaselineRequirement_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ScopeBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineRequirement" ADD CONSTRAINT "BaselineRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableRequirement" ADD CONSTRAINT "DeliverableRequirement_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableRequirement" ADD CONSTRAINT "DeliverableRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ScopeBaseline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_resultingBaselineId_fkey" FOREIGN KEY ("resultingBaselineId") REFERENCES "ScopeBaseline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
