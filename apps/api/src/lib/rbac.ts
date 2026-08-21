import type { Knex } from 'knex';
import type { Role } from '@deliveryos/shared';
import { db, firstOrThrow, indexBy } from '../db/index.js';
import type { AuthUser } from './auth.js';
import { forbidden, notFound } from './errors.js';

/** §4: roles with company-wide visibility instead of per-project membership. */
const PORTFOLIO_ROLES: readonly Role[] = ['FOUNDER', 'DELIVERY_HEAD', 'CTO'];

export const hasPortfolioAccess = (user: AuthUser) => PORTFOLIO_ROLES.includes(user.role);

/**
 * The single source of project visibility. Every list, search, export and AI
 * retrieval path must spread this into its `where` clause — §15.3 requires
 * authorization on reads, not just writes, and a filter applied in one place
 * cannot be forgotten in another.
 */
export function projectScope(user: AuthUser) {
  return (query: Knex.QueryBuilder): Knex.QueryBuilder => {
    if (hasPortfolioAccess(user)) return query;
    return query.where((q) =>
      q
        .where('Project.projectManagerId', user.id)
        .orWhere('Project.technicalLeadId', user.id)
        .orWhereIn('Project.id', (sub) =>
          sub.select('projectId').from('ProjectMember').where('userId', user.id),
        ),
    );
  };
}

/**
 * The same restriction for tables that hang off a project, as a subquery of
 * visible project ids. Used where the outer query is not on Project itself.
 */
export function visibleProjectIds(user: AuthUser) {
  return (sub: Knex.QueryBuilder): Knex.QueryBuilder => {
    const q = sub.select('id').from('Project');
    if (hasPortfolioAccess(user)) return q;
    return q.where((w) =>
      w
        .where('projectManagerId', user.id)
        .orWhere('technicalLeadId', user.id)
        .orWhereIn('id', (m) => m.select('projectId').from('ProjectMember').where('userId', user.id)),
    );
  };
}

/**
 * Loads a project the caller is allowed to see, or throws.
 *
 * Returns notFound rather than forbidden on purpose: a 403 would confirm the
 * project exists, which leaks the client roster to anyone who can guess an id.
 */
export async function requireProjectAccess(user: AuthUser, projectId: string) {
  const project = await firstOrThrow(
    projectScope(user)(db('Project').where('Project.id', projectId)).first(),
    'Project',
  );

  const [client, people] = await Promise.all([
    db('Client').select('id', 'name', 'confidentiality').where({ id: project.clientId }).first(),
    db('User')
      .select('id', 'name', 'email', 'avatarColor')
      .whereIn('id', [project.projectManagerId, project.technicalLeadId].filter(Boolean) as string[]),
  ]);
  const byId = indexBy(people, 'id');

  return {
    ...project,
    client: client ?? null,
    projectManager: byId.get(project.projectManagerId) ?? null,
    technicalLead: project.technicalLeadId ? (byId.get(project.technicalLeadId) ?? null) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Capabilities — the §8.3 approval matrix, in code                    */
/* ------------------------------------------------------------------ */

export type Capability =
  | 'project.create'
  | 'project.update'
  | 'project.archive'
  | 'client.manage'
  | 'source.upload'
  | 'source.setAuthority'
  | 'ai.run'
  | 'requirement.edit'
  | 'requirement.decide'
  | 'requirement.bulkApprove'
  | 'conflict.resolve'
  | 'baseline.propose'
  | 'baseline.approve'
  | 'changeRequest.approve'
  | 'plan.approve'
  | 'capacity.resolveConflict'
  | 'workItem.accept'
  | 'release.approve'
  | 'user.manage'
  | 'audit.read'
  | 'commercial.read';

/**
 * Blueprint §8.3. Read this as: who is the "required owner" column for each
 * consequential action. FOUNDER carries every capability by §4 ("exceptional
 * approvals"), which is why it is absent from most rows below.
 */
const CAPABILITIES: Record<Capability, readonly Role[]> = {
  'project.create': ['FOUNDER', 'DELIVERY_HEAD', 'PROJECT_MANAGER', 'SALES'],
  'project.update': ['FOUNDER', 'DELIVERY_HEAD', 'PROJECT_MANAGER'],
  'project.archive': ['FOUNDER', 'DELIVERY_HEAD'],
  // A PM who can create a project must be able to create the client it hangs
  // off, or the wizard on screen PJ-01 dead-ends for the exact role it names
  // as a primary user.
  'client.manage': ['FOUNDER', 'DELIVERY_HEAD', 'SALES', 'PROJECT_MANAGER'],

  'source.upload': ['FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER', 'SALES', 'TEAM_MEMBER', 'QA_ENGINEER'],
  // §8.3: AI may *recommend* an authority level; only PM/Admin may set it.
  'source.setAuthority': ['FOUNDER', 'DELIVERY_HEAD', 'PROJECT_MANAGER'],

  'ai.run': ['FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER'],

  'requirement.edit': ['FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER'],
  'requirement.decide': ['FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER'],
  'requirement.bulkApprove': ['FOUNDER', 'DELIVERY_HEAD', 'PROJECT_MANAGER'],
  'conflict.resolve': ['FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER'],

  'baseline.propose': ['FOUNDER', 'DELIVERY_HEAD', 'PROJECT_MANAGER'],
  // §8.3 requires "PM + authorised lead"; enforced as a two-party check in
  // the baseline service, not by role membership alone.
  'baseline.approve': ['FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER'],

  'changeRequest.approve': ['FOUNDER', 'DELIVERY_HEAD'],
  'plan.approve': ['FOUNDER', 'DELIVERY_HEAD', 'CTO', 'PROJECT_MANAGER'],
  'capacity.resolveConflict': ['FOUNDER', 'DELIVERY_HEAD'],
  'workItem.accept': ['FOUNDER', 'DELIVERY_HEAD', 'PROJECT_MANAGER', 'QA_ENGINEER', 'CTO'],
  'release.approve': ['FOUNDER', 'CTO', 'DELIVERY_HEAD'],

  'user.manage': ['FOUNDER'],
  'audit.read': ['FOUNDER', 'DELIVERY_HEAD', 'CTO'],
  'commercial.read': ['FOUNDER', 'DELIVERY_HEAD', 'FINANCE_VIEWER', 'PROJECT_MANAGER'],
};

export const can = (user: AuthUser, capability: Capability): boolean =>
  CAPABILITIES[capability].includes(user.role);

export function requireCapability(user: AuthUser, capability: Capability): void {
  if (!can(user, capability)) {
    throw forbidden(`Your role (${user.role}) cannot perform this action: ${capability}`);
  }
}

/** Every capability the caller holds — the web app hides controls it cannot use. */
export function capabilitiesFor(user: AuthUser): Capability[] {
  return (Object.keys(CAPABILITIES) as Capability[]).filter((c) => can(user, c));
}

/**
 * §16 field-level restriction: contract value and margin are a separate
 * permission domain from project membership.
 */
export function redactCommercial<T extends { contractValue?: unknown; currency?: unknown }>(
  user: AuthUser,
  project: T,
): T {
  if (can(user, 'commercial.read')) return project;
  return { ...project, contractValue: null };
}
