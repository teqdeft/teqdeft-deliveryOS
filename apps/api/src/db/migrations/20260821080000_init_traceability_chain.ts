import type { Knex } from 'knex';
import { values } from '../enums.js';

/**
 * The full schema, translated from the PostgreSQL/Prisma original.
 *
 * Deliberate MySQL choices, each one a place where a naive translation breaks:
 *
 * - **CHAR(36) for ids.** Fixed width, so InnoDB does not pad-compare, and the
 *   value stays readable in a console. Application-generated, as before.
 * - **DATETIME(3), not TIMESTAMP.** MySQL's TIMESTAMP tops out in 2038 and
 *   silently rewrites values across session time zones. DATETIME(3) preserves
 *   the millisecond precision the old `timestamp(3)` columns had.
 * - **utf8mb4 set explicitly on every table**, never inherited. A table with no
 *   charset takes the database's default, and shared hosts still create
 *   databases as latin1 — which silently mangles every `¶` and em-dash in a
 *   source fragment rather than failing. `utf8mb4_unicode_ci` is used rather
 *   than MySQL 8's `utf8mb4_0900_ai_ci` because the latter does not exist on
 *   MariaDB or MySQL 5.7, and shared hosting runs one of those far more often
 *   than it runs MySQL 8. Both are accent- and case-insensitive, so `LIKE`
 *   behaves the same either way.
 * - **VARCHAR(191) on indexed strings.** Long enough for every real value and
 *   safely under InnoDB's index key limit on any row format or MySQL build.
 * - **TEXT / MEDIUMTEXT for prose.** Source fragments and statements exceed
 *   VARCHAR comfortably and are never indexed by value.
 * - **Explicit `.index()` on every foreign key.** PostgreSQL required this too,
 *   but MySQL creates an index for an FK automatically and it is easy to end
 *   up with duplicates; naming them keeps the set intentional.
 */
/** Every table is created with this; none inherits the database default. */
const CHARSET = 'utf8mb4';
const COLLATION = 'utf8mb4_unicode_ci';

export async function up(knex: Knex): Promise<void> {
  const id = (t: Knex.CreateTableBuilder, column = 'id') => t.string(column, 36);
  const charset = (t: Knex.CreateTableBuilder) => {
    t.charset(CHARSET);
    t.collate(COLLATION);
  };
  // Millisecond precision, matching the previous schema. `now(3)` rather than
  // `now()` or the default drops the fractional part on insert.
  const created = (t: Knex.CreateTableBuilder, column = 'createdAt') =>
    t.datetime(column, { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
  const updated = (t: Knex.CreateTableBuilder, column = 'updatedAt') =>
    t
      .datetime(column, { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));

  /* ---------------- identity and access ---------------- */

  await knex.schema.createTable('User', (t) => {
    charset(t);
    id(t).primary();
    t.string('email', 191).notNullable().unique();
    t.string('name', 191).notNullable();
    t.string('passwordHash', 255).notNullable();
    t.enu('role', values('Role')).notNullable();
    t.string('jobTitle', 191).nullable();
    t.string('avatarColor', 32).nullable();
    t.boolean('isActive').notNullable().defaultTo(true);
    t.decimal('weeklyHours', 5, 2).notNullable().defaultTo(40);
    t.string('timezone', 64).notNullable().defaultTo('Asia/Kolkata');
    t.datetime('lastLoginAt', { precision: 3 }).nullable();
    created(t);
    updated(t);
    t.index(['role', 'isActive'], 'User_role_isActive_idx');
  });

  await knex.schema.createTable('Client', (t) => {
    charset(t);
    id(t).primary();
    t.string('name', 191).notNullable().unique();
    t.string('contactName', 191).nullable();
    t.string('contactEmail', 191).nullable();
    t.text('communicationNotes').nullable();
    t.enu('confidentiality', values('Confidentiality')).notNullable().defaultTo('STANDARD');
    created(t);
    updated(t);
  });

  /* ---------------- projects ---------------- */

  await knex.schema.createTable('Project', (t) => {
    charset(t);
    id(t).primary();
    t.string('code', 24).notNullable().unique();
    t.string('name', 191).notNullable();
    t.text('summary').nullable();
    id(t, 'clientId').notNullable();
    t.enu('engagementType', values('EngagementType')).notNullable();
    t.enu('stage', values('ProjectStage')).notNullable().defaultTo('DELIVERY_INTAKE');
    t.enu('health', values('HealthState')).notNullable().defaultTo('GREY');
    t.json('healthFacts').notNullable();
    t.datetime('healthComputedAt', { precision: 3 }).nullable();
    t.enu('confidentiality', values('Confidentiality')).notNullable().defaultTo('STANDARD');
    id(t, 'projectManagerId').notNullable();
    id(t, 'technicalLeadId').nullable();
    t.datetime('startDate', { precision: 3 }).nullable();
    t.datetime('targetLaunchDate', { precision: 3 }).nullable();
    t.decimal('contractValue', 14, 2).nullable();
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.boolean('externalAiEnabled').notNullable().defaultTo(true);
    t.json('intakeChecklist').notNullable();
    t.datetime('archivedAt', { precision: 3 }).nullable();
    created(t);
    updated(t);

    // Restrict, so deleting a client with live projects fails loudly instead
    // of orphaning delivery history.
    t.foreign('clientId').references('Client.id').onDelete('RESTRICT').onUpdate('CASCADE');
    t.foreign('projectManagerId').references('User.id').onDelete('RESTRICT').onUpdate('CASCADE');
    t.foreign('technicalLeadId').references('User.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.index(['stage', 'health'], 'Project_stage_health_idx');
    t.index(['clientId'], 'Project_clientId_idx');
    t.index(['projectManagerId'], 'Project_projectManagerId_idx');
  });

  await knex.schema.createTable('ProjectMember', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    id(t, 'userId').notNullable();
    t.enu('projectRole', values('Role')).notNullable();
    t.datetime('addedAt', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('userId').references('User.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.unique(['projectId', 'userId'], { indexName: 'ProjectMember_projectId_userId_key' });
    t.index(['userId'], 'ProjectMember_userId_idx');
  });

  /* ---------------- knowledge centre ---------------- */

  await knex.schema.createTable('Source', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.string('title', 255).notNullable();
    t.enu('kind', values('SourceKind')).notNullable();
    t.enu('authority', values('SourceAuthority')).notNullable();
    t.enu('confidentiality', values('Confidentiality')).notNullable().defaultTo('STANDARD');
    t.datetime('statedAt', { precision: 3 }).notNullable();
    t.text('notes').nullable();
    t.string('originalFilename', 255).nullable();
    t.string('mimeType', 191).nullable();
    t.integer('byteSize').nullable();
    t.string('storageKey', 255).nullable();
    t.string('checksum', 64).nullable();
    t.enu('processingState', values('SourceProcessingState')).notNullable().defaultTo('PENDING');
    t.text('processingError').nullable();
    t.integer('extractedChars').notNullable().defaultTo(0);
    t.integer('version').notNullable().defaultTo(1);
    id(t, 'supersedesId').nullable();
    id(t, 'uploadedById').notNullable();
    t.datetime('uploadedAt', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    updated(t);

    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('uploadedById').references('User.id').onDelete('RESTRICT').onUpdate('CASCADE');
    t.foreign('supersedesId').references('Source.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.index(['projectId', 'processingState'], 'Source_projectId_processingState_idx');
    t.index(['projectId', 'authority', 'statedAt'], 'Source_projectId_authority_statedAt_idx');
  });

  await knex.schema.createTable('SourceFragment', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'sourceId').notNullable();
    t.integer('ordinal').notNullable();
    t.string('locator', 191).notNullable();
    // Fragments cap at 1800 characters in the extractor, but a multi-byte
    // character costs up to four bytes and TEXT's limit is in bytes.
    t.text('text', 'mediumtext').notNullable();
    t.integer('charStart').notNullable();
    t.integer('charEnd').notNullable();
    created(t);
    t.foreign('sourceId').references('Source.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.unique(['sourceId', 'ordinal'], { indexName: 'SourceFragment_sourceId_ordinal_key' });
    t.index(['sourceId'], 'SourceFragment_sourceId_idx');
  });

  /* ---------------- requirements and scope ---------------- */

  await knex.schema.createTable('AiRun', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.enu('jobType', values('AiJobType')).notNullable();
    t.enu('state', values('AiRunState')).notNullable().defaultTo('QUEUED');
    t.enu('provider', values('AiProvider')).notNullable();
    t.string('model', 191).notNullable();
    t.string('promptVersion', 64).notNullable();
    t.string('schemaVersion', 64).notNullable();
    t.json('inputSourceIds').notNullable();
    t.integer('inputChars').notNullable().defaultTo(0);
    t.text('instructions').nullable();
    t.integer('inputTokens').nullable();
    t.integer('outputTokens').nullable();
    t.decimal('costUsd', 10, 4).nullable();
    t.integer('latencyMs').nullable();
    t.integer('producedCount').notNullable().defaultTo(0);
    t.json('warnings').notNullable();
    t.text('error').nullable();
    id(t, 'triggeredById').notNullable();
    t.datetime('startedAt', { precision: 3 }).nullable();
    t.datetime('finishedAt', { precision: 3 }).nullable();
    created(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('triggeredById').references('User.id').onDelete('RESTRICT').onUpdate('CASCADE');
    t.index(['projectId', 'jobType', 'createdAt'], 'AiRun_projectId_jobType_createdAt_idx');
    t.index(['state'], 'AiRun_state_idx');
  });

  await knex.schema.createTable('Requirement', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.string('reference', 24).notNullable();
    t.string('title', 255).notNullable();
    t.text('statement').notNullable();
    t.enu('requirementClass', values('RequirementClass')).notNullable();
    t.enu('priority', values('RequirementPriority')).notNullable().defaultTo('MUST');
    t.enu('reviewState', values('RequirementReviewState')).notNullable().defaultTo('DRAFT');
    t.enu('origin', values('RequirementOrigin')).notNullable().defaultTo('AI_EXTRACTION');
    t.decimal('confidence', 3, 2).nullable();
    t.json('acceptanceCriteria').notNullable();
    t.boolean('isExclusion').notNullable().defaultTo(false);
    t.boolean('isAssumption').notNullable().defaultTo(false);
    t.text('openQuestion').nullable();
    t.datetime('questionAnsweredAt', { precision: 3 }).nullable();
    t.text('questionAnswer').nullable();
    id(t, 'supersededById').nullable();
    id(t, 'aiRunId').nullable();
    created(t);
    updated(t);

    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('supersededById').references('Requirement.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('aiRunId').references('AiRun.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.unique(['projectId', 'reference'], { indexName: 'Requirement_projectId_reference_key' });
    t.index(['projectId', 'reviewState'], 'Requirement_projectId_reviewState_idx');
    t.index(['projectId', 'requirementClass'], 'Requirement_projectId_class_idx');
    t.index(['aiRunId'], 'Requirement_aiRunId_idx');
  });

  await knex.schema.createTable('RequirementCitation', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'requirementId').notNullable();
    id(t, 'sourceFragmentId').notNullable();
    t.text('quote').notNullable();
    t.foreign('requirementId').references('Requirement.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('sourceFragmentId').references('SourceFragment.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.unique(['requirementId', 'sourceFragmentId'], { indexName: 'RequirementCitation_req_fragment_key' });
    t.index(['sourceFragmentId'], 'RequirementCitation_sourceFragmentId_idx');
  });

  await knex.schema.createTable('RequirementRevision', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'requirementId').notNullable();
    t.integer('revision').notNullable();
    t.string('action', 64).notNullable();
    t.json('changes').notNullable();
    t.json('snapshot').notNullable();
    t.text('reason').nullable();
    id(t, 'actorId').notNullable();
    created(t);
    t.foreign('requirementId').references('Requirement.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('actorId').references('User.id').onDelete('RESTRICT').onUpdate('CASCADE');
    t.unique(['requirementId', 'revision'], { indexName: 'RequirementRevision_requirementId_revision_key' });
    t.index(['requirementId'], 'RequirementRevision_requirementId_idx');
  });

  await knex.schema.createTable('Decision', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.text('question').notNullable();
    t.json('options').notNullable();
    t.text('chosen').notNullable();
    t.text('rationale').notNullable();
    id(t, 'decidedById').notNullable();
    t.datetime('decidedAt', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.json('affectedRecords').notNullable();
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('decidedById').references('User.id').onDelete('RESTRICT').onUpdate('CASCADE');
    t.index(['projectId'], 'Decision_projectId_idx');
  });

  await knex.schema.createTable('Conflict', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.text('summary').notNullable();
    t.text('statementA').notNullable();
    t.text('statementB').notNullable();
    t.string('severity', 16).notNullable().defaultTo('MEDIUM');
    t.enu('state', values('ConflictState')).notNullable().defaultTo('OPEN');
    t.text('suggestedResolution').nullable();
    t.string('resolution', 32).nullable();
    t.text('rationale').nullable();
    id(t, 'resolvedById').nullable();
    t.datetime('resolvedAt', { precision: 3 }).nullable();
    id(t, 'decisionId').nullable();
    id(t, 'aiRunId').nullable();
    created(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('decisionId').references('Decision.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('aiRunId').references('AiRun.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.unique(['decisionId'], { indexName: 'Conflict_decisionId_key' });
    t.index(['projectId', 'state'], 'Conflict_projectId_state_idx');
  });

  await knex.schema.createTable('ConflictCitation', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'conflictId').notNullable();
    id(t, 'sourceFragmentId').notNullable();
    t.string('side', 1).notNullable();
    t.text('quote').notNullable();
    t.foreign('conflictId').references('Conflict.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('sourceFragmentId').references('SourceFragment.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.index(['conflictId'], 'ConflictCitation_conflictId_idx');
    t.index(['sourceFragmentId'], 'ConflictCitation_sourceFragmentId_idx');
  });

  await knex.schema.createTable('ScopeBaseline', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.integer('version').notNullable();
    t.string('title', 255).notNullable();
    t.enu('state', values('BaselineState')).notNullable().defaultTo('DRAFT');
    t.text('changeReason').nullable();
    t.datetime('effectiveDate', { precision: 3 }).nullable();
    id(t, 'proposedById').nullable();
    t.datetime('proposedAt', { precision: 3 }).nullable();
    id(t, 'approvedById').nullable();
    t.datetime('approvedAt', { precision: 3 }).nullable();
    t.datetime('supersededAt', { precision: 3 }).nullable();
    created(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.unique(['projectId', 'version'], { indexName: 'ScopeBaseline_projectId_version_key' });
    t.index(['projectId', 'state'], 'ScopeBaseline_projectId_state_idx');
  });

  await knex.schema.createTable('Milestone', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.string('name', 191).notNullable();
    t.text('description').nullable();
    t.datetime('targetDate', { precision: 3 }).nullable();
    t.datetime('actualDate', { precision: 3 }).nullable();
    t.integer('ordinal').notNullable().defaultTo(0);
    id(t, 'ownerId').nullable();
    t.decimal('confidence', 3, 2).nullable();
    created(t);
    updated(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.index(['projectId', 'targetDate'], 'Milestone_projectId_targetDate_idx');
  });

  await knex.schema.createTable('Deliverable', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.string('reference', 24).notNullable();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.json('acceptanceCriteria').notNullable();
    id(t, 'ownerId').nullable();
    id(t, 'milestoneId').nullable();
    t.datetime('completedAt', { precision: 3 }).nullable();
    created(t);
    updated(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('milestoneId').references('Milestone.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.unique(['projectId', 'reference'], { indexName: 'Deliverable_projectId_reference_key' });
    t.index(['projectId'], 'Deliverable_projectId_idx');
  });

  await knex.schema.createTable('BaselineRequirement', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'baselineId').notNullable();
    id(t, 'requirementId').notNullable();
    t.string('title', 255).notNullable();
    t.text('statement').notNullable();
    t.enu('requirementClass', values('RequirementClass')).notNullable();
    t.enu('priority', values('RequirementPriority')).notNullable();
    t.json('acceptanceCriteria').notNullable();
    t.boolean('isExclusion').notNullable().defaultTo(false);
    t.json('citationSnapshot').notNullable();
    t.foreign('baselineId').references('ScopeBaseline.id').onDelete('CASCADE').onUpdate('CASCADE');
    // Restrict: an approved baseline must keep resolving, so a requirement it
    // references can never be deleted out from under it.
    t.foreign('requirementId').references('Requirement.id').onDelete('RESTRICT').onUpdate('CASCADE');
    t.unique(['baselineId', 'requirementId'], { indexName: 'BaselineRequirement_baseline_req_key' });
    t.index(['requirementId'], 'BaselineRequirement_requirementId_idx');
  });

  await knex.schema.createTable('DeliverableRequirement', (t) => {
    charset(t);
    id(t, 'deliverableId').notNullable();
    id(t, 'requirementId').notNullable();
    t.primary(['deliverableId', 'requirementId']);
    t.foreign('deliverableId').references('Deliverable.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('requirementId').references('Requirement.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.index(['requirementId'], 'DeliverableRequirement_requirementId_idx');
  });

  /* ---------------- delivery ---------------- */

  await knex.schema.createTable('WorkItem', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.string('reference', 24).notNullable();
    t.enu('type', values('WorkItemType')).notNullable().defaultTo('TASK');
    t.enu('status', values('WorkItemStatus')).notNullable().defaultTo('DRAFT');
    t.string('title', 255).notNullable();
    t.text('brief').nullable();
    id(t, 'requirementId').nullable();
    id(t, 'deliverableId').nullable();
    id(t, 'milestoneId').nullable();
    id(t, 'parentId').nullable();
    id(t, 'assigneeId').nullable();
    t.decimal('estimateHours', 6, 2).nullable();
    t.decimal('actualHours', 6, 2).nullable();
    t.datetime('dueDate', { precision: 3 }).nullable();
    t.integer('priority').notNullable().defaultTo(3);
    t.json('reviewRoute').notNullable();
    t.json('definitionOfReady').notNullable();
    t.json('acceptanceCriteria').notNullable();
    t.datetime('startedAt', { precision: 3 }).nullable();
    t.datetime('acceptedAt', { precision: 3 }).nullable();
    created(t);
    updated(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('requirementId').references('Requirement.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('deliverableId').references('Deliverable.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('milestoneId').references('Milestone.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('assigneeId').references('User.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('parentId').references('WorkItem.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.unique(['projectId', 'reference'], { indexName: 'WorkItem_projectId_reference_key' });
    t.index(['projectId', 'status'], 'WorkItem_projectId_status_idx');
    t.index(['assigneeId', 'status'], 'WorkItem_assigneeId_status_idx');
    t.index(['milestoneId'], 'WorkItem_milestoneId_idx');
  });

  await knex.schema.createTable('ChecklistItem', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'workItemId').notNullable();
    t.string('label', 255).notNullable();
    t.enu('ownerRole', values('Role')).nullable();
    t.boolean('required').notNullable().defaultTo(true);
    t.string('result', 64).nullable();
    id(t, 'checkedById').nullable();
    t.datetime('checkedAt', { precision: 3 }).nullable();
    t.integer('ordinal').notNullable().defaultTo(0);
    t.foreign('workItemId').references('WorkItem.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.index(['workItemId'], 'ChecklistItem_workItemId_idx');
  });

  await knex.schema.createTable('Evidence', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'workItemId').notNullable();
    t.string('kind', 64).notNullable();
    t.string('label', 255).notNullable();
    t.text('url').nullable();
    t.string('storageKey', 255).nullable();
    id(t, 'addedById').notNullable();
    t.datetime('addedAt', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.foreign('workItemId').references('WorkItem.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.index(['workItemId'], 'Evidence_workItemId_idx');
  });

  /* ---------------- governance ---------------- */

  await knex.schema.createTable('ChangeRequest', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.string('reference', 24).notNullable();
    t.string('title', 255).notNullable();
    t.text('request').notNullable();
    t.enu('state', values('ChangeRequestState')).notNullable().defaultTo('DRAFT');
    t.string('classification', 64).nullable();
    t.decimal('effortHours', 8, 2).nullable();
    t.decimal('costAmount', 14, 2).nullable();
    t.integer('scheduleImpactDays').nullable();
    t.json('affectedRecords').notNullable();
    id(t, 'resultingBaselineId').nullable();
    t.text('clientApprovalEvidence').nullable();
    id(t, 'raisedById').nullable();
    created(t);
    updated(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('resultingBaselineId').references('ScopeBaseline.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.unique(['projectId', 'reference'], { indexName: 'ChangeRequest_projectId_reference_key' });
    t.index(['projectId', 'state'], 'ChangeRequest_projectId_state_idx');
  });

  await knex.schema.createTable('Approval', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.enu('subject', values('ApprovalSubject')).notNullable();
    t.enu('decision', values('ApprovalDecision')).notNullable();
    t.text('comment').nullable();
    id(t, 'approverId').notNullable();
    id(t, 'baselineId').nullable();
    id(t, 'workItemId').nullable();
    id(t, 'changeRequestId').nullable();
    t.integer('baselineVersion').nullable();
    created(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('approverId').references('User.id').onDelete('RESTRICT').onUpdate('CASCADE');
    t.foreign('baselineId').references('ScopeBaseline.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('workItemId').references('WorkItem.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('changeRequestId').references('ChangeRequest.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.index(['projectId', 'subject'], 'Approval_projectId_subject_idx');
    t.index(['approverId'], 'Approval_approverId_idx');
  });

  await knex.schema.createTable('Risk', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').notNullable();
    t.enu('kind', values('RiskKind')).notNullable();
    t.enu('state', values('RiskState')).notNullable().defaultTo('OPEN');
    t.string('title', 255).notNullable();
    t.text('detail').nullable();
    t.string('category', 32).nullable();
    t.string('severity', 16).notNullable().defaultTo('MEDIUM');
    t.string('probability', 16).nullable();
    t.string('impact', 16).nullable();
    id(t, 'ownerId').nullable();
    id(t, 'workItemId').nullable();
    t.text('action').nullable();
    t.datetime('dueDate', { precision: 3 }).nullable();
    t.datetime('escalatedAt', { precision: 3 }).nullable();
    t.datetime('resolvedAt', { precision: 3 }).nullable();
    t.text('resolution').nullable();
    created(t);
    updated(t);
    t.foreign('projectId').references('Project.id').onDelete('CASCADE').onUpdate('CASCADE');
    t.foreign('ownerId').references('User.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('workItemId').references('WorkItem.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.index(['projectId', 'kind', 'state'], 'Risk_projectId_kind_state_idx');
    t.index(['ownerId', 'state'], 'Risk_ownerId_state_idx');
  });

  /* ---------------- audit ---------------- */

  await knex.schema.createTable('AuditEvent', (t) => {
    charset(t);
    id(t).primary();
    id(t, 'projectId').nullable();
    id(t, 'actorId').nullable();
    t.string('action', 64).notNullable();
    t.string('entityType', 64).notNullable();
    id(t, 'entityId').nullable();
    t.text('summary').notNullable();
    t.json('detail').notNullable();
    t.string('ipAddress', 64).nullable();
    t.string('userAgent', 400).nullable();
    created(t);
    // SET NULL rather than CASCADE: deleting a project must not erase the
    // record that it existed and who approved what inside it.
    t.foreign('projectId').references('Project.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.foreign('actorId').references('User.id').onDelete('SET NULL').onUpdate('CASCADE');
    t.index(['projectId', 'createdAt'], 'AuditEvent_projectId_createdAt_idx');
    t.index(['actorId', 'createdAt'], 'AuditEvent_actorId_createdAt_idx');
    t.index(['entityType', 'entityId'], 'AuditEvent_entityType_entityId_idx');
    t.index(['action'], 'AuditEvent_action_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Reverse dependency order; MySQL refuses to drop a table another still
  // references.
  for (const table of [
    'AuditEvent', 'Risk', 'Approval', 'ChangeRequest', 'Evidence', 'ChecklistItem',
    'WorkItem', 'DeliverableRequirement', 'BaselineRequirement', 'Deliverable',
    'Milestone', 'ScopeBaseline', 'ConflictCitation', 'Conflict', 'Decision',
    'RequirementRevision', 'RequirementCitation', 'Requirement', 'AiRun',
    'SourceFragment', 'Source', 'ProjectMember', 'Project', 'Client', 'User',
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
}
