import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

export interface HealthFact {
  rule: string;
  label: string;
  detail: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  points: number;
}

export interface HealthResult {
  health: 'GREEN' | 'AMBER' | 'RED' | 'GREY';
  facts: HealthFact[];
  score: number;
}

/**
 * Blueprint §13.1: health is rule-based and explainable before any predictive
 * scoring. Every point of the score traces to a fact the user can read and, if
 * the underlying data is wrong, correct.
 *
 * Deliberately NOT a model call. A red project must be defensible in a room.
 */
export async function computeProjectHealth(projectId: string): Promise<HealthResult> {
  const now = new Date();

  const [project, overdueMilestones, openBlockers, unresolvedConflicts, openQuestions, highRisks, staleness] =
    await Promise.all([
      prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { stage: true, targetLaunchDate: true, updatedAt: true, baselines: { where: { state: 'APPROVED' }, select: { id: true }, take: 1 } },
      }),
      prisma.milestone.findMany({
        where: { projectId, actualDate: null, targetDate: { lt: now } },
        select: { name: true, targetDate: true },
      }),
      prisma.risk.findMany({
        where: { projectId, kind: 'BLOCKER', state: { in: ['OPEN', 'ESCALATED'] } },
        select: { title: true, createdAt: true, severity: true },
      }),
      prisma.conflict.count({ where: { projectId, state: 'OPEN' } }),
      prisma.requirement.count({
        where: { projectId, openQuestion: { not: null }, questionAnsweredAt: null, reviewState: { not: 'REJECTED' } },
      }),
      prisma.risk.count({
        where: { projectId, kind: 'RISK', state: { in: ['OPEN', 'ESCALATED'] }, severity: { in: ['HIGH', 'CRITICAL'] } },
      }),
      prisma.workItem.count({
        where: { projectId, status: 'BLOCKED' },
      }),
    ]);

  const facts: HealthFact[] = [];
  let score = 0;

  for (const m of overdueMilestones) {
    const days = Math.floor((now.getTime() - (m.targetDate?.getTime() ?? now.getTime())) / 86_400_000);
    facts.push({
      rule: 'milestone.overdue',
      label: 'Milestone overdue',
      detail: `"${m.name}" passed its target date ${days} day${days === 1 ? '' : 's'} ago and is not complete.`,
      severity: days > 7 ? 'CRITICAL' : 'WARN',
      points: days > 7 ? 40 : 20,
    });
    score += days > 7 ? 40 : 20;
  }

  for (const b of openBlockers) {
    const age = Math.floor((now.getTime() - b.createdAt.getTime()) / 86_400_000);
    const points = age > 3 ? 25 : 12;
    facts.push({
      rule: 'blocker.open',
      label: 'Unresolved blocker',
      detail: `"${b.title}" has been open for ${age} day${age === 1 ? '' : 's'} (${b.severity.toLowerCase()}).`,
      severity: age > 3 ? 'CRITICAL' : 'WARN',
      points,
    });
    score += points;
  }

  if (unresolvedConflicts > 0) {
    const points = unresolvedConflicts * 15;
    facts.push({
      rule: 'conflict.open',
      label: 'Contradictory sources',
      detail: `${unresolvedConflicts} source conflict${unresolvedConflicts === 1 ? '' : 's'} still awaiting a decision.`,
      severity: 'CRITICAL',
      points,
    });
    score += points;
  }

  if (openQuestions > 0) {
    const points = Math.min(30, openQuestions * 5);
    facts.push({
      rule: 'question.open',
      label: 'Unanswered questions',
      detail: `${openQuestions} requirement${openQuestions === 1 ? '' : 's'} still carry an open question.`,
      severity: openQuestions > 4 ? 'WARN' : 'INFO',
      points,
    });
    score += points;
  }

  if (highRisks > 0) {
    facts.push({
      rule: 'risk.high',
      label: 'High risks open',
      detail: `${highRisks} high or critical risk${highRisks === 1 ? '' : 's'} with no resolution recorded.`,
      severity: 'WARN',
      points: highRisks * 10,
    });
    score += highRisks * 10;
  }

  if (staleness > 0) {
    facts.push({
      rule: 'workitem.blocked',
      label: 'Blocked work',
      detail: `${staleness} work item${staleness === 1 ? '' : 's'} cannot progress.`,
      severity: 'WARN',
      points: staleness * 8,
    });
    score += staleness * 8;
  }

  // A project past its own launch date is the single loudest signal there is,
  // and milestone rules miss it entirely on a project that never had its
  // milestones planned out. Without this, a project months past its promised
  // launch reads as "no risk signals" — exactly the blind spot this product
  // exists to remove.
  const launchOverdueDays = project.targetLaunchDate
    ? Math.floor((now.getTime() - project.targetLaunchDate.getTime()) / 86_400_000)
    : null;

  if (launchOverdueDays !== null && launchOverdueDays > 0 && project.stage !== 'CLOSURE_AND_LEARNING') {
    const points = launchOverdueDays > 14 ? 60 : 35;
    facts.push({
      rule: 'launch.overdue',
      label: 'Past its target launch date',
      detail: `The agreed launch date passed ${launchOverdueDays} day${launchOverdueDays === 1 ? '' : 's'} ago and the project is still in ${project.stage.toLowerCase().replace(/_/g, ' ')}.`,
      severity: 'CRITICAL',
      points,
    });
    score += points;
  } else if (launchOverdueDays !== null && launchOverdueDays > -14 && launchOverdueDays <= 0) {
    const away = Math.abs(launchOverdueDays);
    facts.push({
      rule: 'launch.imminent',
      label: 'Launch is close',
      detail: `${away} day${away === 1 ? '' : 's'} until the agreed launch date.`,
      severity: 'INFO',
      points: 0,
    });
  }

  // §7.3: execution against an unapproved baseline is a control failure, not a
  // scheduling problem — it outranks everything above.
  const pastPlanning = ['EXECUTION', 'QA_AND_ACCEPTANCE', 'LAUNCH_AND_HYPERCARE'].includes(project.stage);
  if (pastPlanning && project.baselines.length === 0) {
    facts.push({
      rule: 'baseline.missing',
      label: 'No approved baseline',
      detail: 'The project is in execution without an approved scope baseline. Nothing can be verified against a promise.',
      severity: 'CRITICAL',
      points: 50,
    });
    score += 50;
  }

  // §13.1 GREY: stale or absent data means we decline to judge rather than
  // claim green. A silent project is not a healthy project.
  const daysSinceUpdate = Math.floor((now.getTime() - project.updatedAt.getTime()) / 86_400_000);
  const hasSignal = facts.some((f) => f.points > 0) || overdueMilestones.length > 0;
  if (!hasSignal && daysSinceUpdate > 14) {
    return {
      health: 'GREY',
      score: 0,
      facts: [
        {
          rule: 'data.stale',
          label: 'Insufficient current data',
          detail: `Nothing has changed on this project for ${daysSinceUpdate} days. Health cannot be assessed reliably.`,
          severity: 'INFO',
          points: 0,
        },
      ],
    };
  }

  const health = score >= 50 ? 'RED' : score >= 20 ? 'AMBER' : 'GREEN';

  if (facts.length === 0) {
    facts.push({
      rule: 'clear',
      label: 'No risk signals',
      detail: 'No overdue milestones, open blockers, source conflicts or unanswered questions.',
      severity: 'INFO',
      points: 0,
    });
  }

  return { health, facts, score };
}

/** Recomputes and persists. Called after any change that could move health. */
export async function refreshProjectHealth(projectId: string): Promise<HealthResult> {
  const result = await computeProjectHealth(projectId);
  await prisma.project.update({
    where: { id: projectId },
    data: {
      health: result.health,
      healthFacts: result.facts as unknown as Prisma.InputJsonValue,
      healthComputedAt: new Date(),
    },
  });
  return result;
}
