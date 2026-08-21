import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { INTAKE_CHECKLIST_ITEMS } from '@deliveryos/shared';
import { get, patch } from '../../lib/api.js';
import { useSession } from '../../lib/session.js';
import { Badge, Button, HealthPill, SectionHeading, Skeleton } from '../../components/ui.js';
import { daysUntil, engagementLabel, formatDate, formatMoney, stageLabel } from '../../lib/format.js';
import type { HealthFact, HealthState } from '../../lib/types.js';

interface ProjectDetail {
  project: {
    id: string; code: string; name: string; summary: string | null;
    stage: string; health: HealthState; engagementType: string;
    targetLaunchDate: string | null; startDate: string | null;
    contractValue: string | null; currency: string; externalAiEnabled: boolean;
    intakeChecklist: Record<string, { done: boolean; note: string | null; by?: string | null; at?: string | null }>;
    client: { id: string; name: string };
    projectManager: { id: string; name: string };
    technicalLead: { id: string; name: string } | null;
  };
  counts: {
    sources: number; requirements: number; approvedRequirements: number;
    openQuestions: number; openConflicts: number; workItems: number;
  };
  activeBaseline: { id: string; version: number; title: string; approvedAt: string; _count: { requirements: number } } | null;
  latestRun: { id: string; jobType: string; state: string; createdAt: string; producedCount: number } | null;
  canEdit: boolean;
}

/** Screen PJ-02 — the project overview. */
export function ProjectOverview() {
  const { projectId = '' } = useParams();
  const { can } = useSession();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => get<ProjectDetail>(`/projects/${projectId}`),
  });
  const { data: health } = useQuery({
    queryKey: ['project', projectId, 'health'],
    queryFn: () => get<{ health: HealthState; facts: HealthFact[]; score: number }>(`/projects/${projectId}/health`),
  });

  const toggleChecklist = useMutation({
    mutationFn: (vars: { key: string; done: boolean }) => patch(`/projects/${projectId}/checklist`, vars),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const { project, counts, activeBaseline } = data;
  const days = daysUntil(project.targetLaunchDate);
  const checklistDone = INTAKE_CHECKLIST_ITEMS.filter((i) => project.intakeChecklist?.[i.key]?.done).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-ink-400">{project.code}</span>
            <HealthPill health={health?.health ?? project.health} size="sm" />
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-ink-900">{project.name}</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {project.client.name} · {engagementLabel(project.engagementType)} · PM {project.projectManager.name}
            {project.technicalLead ? ` · Tech lead ${project.technicalLead.name}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-400">Target launch</p>
          <p className={'text-sm font-semibold ' + (days !== null && days < 0 ? 'text-red-600' : days !== null && days <= 21 ? 'text-amber-600' : 'text-ink-900')}>
            {formatDate(project.targetLaunchDate)}
          </p>
          {days !== null && (
            <p className="text-xs text-ink-500">{days < 0 ? `${Math.abs(days)} days overdue` : `${days} days away`}</p>
          )}
        </div>
      </header>

      {project.summary && <p className="max-w-3xl text-sm leading-relaxed text-ink-600">{project.summary}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Metric label="Sources" value={counts.sources} to={`/projects/${projectId}/knowledge`} />
        <Metric label="Requirements" value={counts.requirements} to={`/projects/${projectId}/requirements`} />
        <Metric label="Approved" value={counts.approvedRequirements} to={`/projects/${projectId}/requirements`} tone={counts.approvedRequirements > 0 ? 'ok' : 'neutral'} />
        <Metric label="Open questions" value={counts.openQuestions} to={`/projects/${projectId}/requirements`} tone={counts.openQuestions > 0 ? 'warn' : 'ok'} />
        <Metric label="Conflicts" value={counts.openConflicts} to={`/projects/${projectId}/conflicts`} tone={counts.openConflicts > 0 ? 'bad' : 'ok'} />
        <Metric label="Contract" value={formatMoney(project.contractValue, project.currency)} tone="neutral" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr,1fr]">
        <section>
          <SectionHeading title="Why this project is this colour" />
          <div className="card divide-y divide-ink-100">
            {health?.facts.map((fact, index) => (
              <div key={`${fact.rule}-${index}`} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full ' +
                    (fact.severity === 'CRITICAL' ? 'bg-red-500' : fact.severity === 'WARN' ? 'bg-amber-500' : 'bg-emerald-500')
                  }
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{fact.label}</p>
                  <p className="mt-0.5 text-sm text-ink-600">{fact.detail}</p>
                </div>
                {fact.points > 0 && (
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-400">+{fact.points}</span>
                )}
              </div>
            )) ?? <Skeleton className="m-4 h-16" />}
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Health is computed from rules, not a model. If a fact is wrong, correct the underlying record and it recomputes.
          </p>
        </section>

        <div className="space-y-5">
          <section>
            <SectionHeading title="Intake checklist" count={checklistDone} />
            <div className="card divide-y divide-ink-100">
              {INTAKE_CHECKLIST_ITEMS.map((item) => {
                const state = project.intakeChecklist?.[item.key];
                return (
                  <label key={item.key} className="flex cursor-pointer items-start gap-2.5 px-4 py-2.5 hover:bg-ink-50/60">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500"
                      checked={state?.done ?? false}
                      disabled={!data.canEdit || toggleChecklist.isPending}
                      onChange={(e) => toggleChecklist.mutate({ key: item.key, done: e.target.checked })}
                    />
                    <span className="min-w-0">
                      <span className={'block text-sm ' + (state?.done ? 'text-ink-500 line-through' : 'text-ink-800')}>
                        {item.label}
                      </span>
                      {state?.note && <span className="mt-0.5 block text-xs text-ink-400">{state.note}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHeading title="Scope baseline" />
            <div className="card px-4 py-3.5">
              {activeBaseline ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge tone="green">v{activeBaseline.version} approved</Badge>
                    <span className="text-xs text-ink-500">{formatDate(activeBaseline.approvedAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-700">
                    {activeBaseline._count.requirements} requirements are the agreed scope.
                  </p>
                </>
              ) : (
                <>
                  <Badge tone="amber">Not baselined</Badge>
                  <p className="mt-2 text-sm text-ink-600">
                    Nothing is locked yet. Until a baseline is approved, there is no agreed scope to compare new requests against.
                  </p>
                </>
              )}
              <Link to={`/projects/${projectId}/baseline`} className="mt-3 block">
                <Button size="sm" className="w-full">{activeBaseline ? 'View baseline' : 'Go to baseline'}</Button>
              </Link>
            </div>
          </section>

          <section>
            <SectionHeading title="Lifecycle stage" />
            <div className="card px-4 py-3.5">
              <Badge tone="brand">{stageLabel(project.stage)}</Badge>
              {!project.externalAiEnabled && (
                <p className="mt-2 text-xs text-amber-700">External AI processing is disabled for this project.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label, value, to, tone = 'neutral',
}: { label: string; value: number | string; to?: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad' }) {
  const body = (
    <div className="card px-3.5 py-3 transition hover:border-brand-300">
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p
        className={
          'mt-0.5 text-lg font-bold tabular-nums ' +
          (tone === 'bad' && value !== 0 ? 'text-red-600'
            : tone === 'warn' && value !== 0 ? 'text-amber-600'
            : tone === 'ok' ? 'text-emerald-600' : 'text-ink-900')
        }
      >
        {value}
      </p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
