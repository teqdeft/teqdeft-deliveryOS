import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../../lib/api.js';
import { useSession } from '../../lib/session.js';
import { Avatar, Badge, Button, EmptyState, ErrorNote, SectionHeading, Skeleton } from '../../components/ui.js';
import { formatDateTime, relativeTime, titleCase } from '../../lib/format.js';
import type { AiRunView, SourceSummary } from '../../lib/types.js';

/** Screen PJ-05 — configure and inspect an AI analysis run. */
export function Analysis() {
  const { projectId = '' } = useParams();
  const { can } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [instructions, setInstructions] = useState('');
  const [outcome, setOutcome] = useState<{ requirementsCreated: number; conflictsCreated: number; gaps: { topic: string; why: string }[]; warnings: string[] } | null>(null);

  const { data: sources } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => get<{ sources: SourceSummary[] }>(`/projects/${projectId}/sources`),
  });
  const { data: runs } = useQuery({
    queryKey: ['airuns', projectId],
    queryFn: () => get<{ runs: AiRunView[]; spend: { costUsd: string | null }; aiAvailable: boolean }>(`/projects/${projectId}/ai/runs`),
  });
  const { data: policy } = useQuery({
    queryKey: ['aipolicy', projectId],
    queryFn: () => get<{ aiAvailable: boolean; policy: { provider: string; model: string; effort: string; maxInputChars: number } | null }>(
      `/projects/${projectId}/ai/policy`,
    ),
  });

  const analysable = sources?.sources.filter((s) => s.processingState === 'READY') ?? [];

  const analyse = useMutation({
    mutationFn: () =>
      post<typeof outcome & object>(`/projects/${projectId}/ai/analyse`, {
        sourceIds: [...chosen],
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      }),
    onSuccess: (result) => {
      setOutcome(result as never);
      void queryClient.invalidateQueries({ queryKey: ['airuns', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const toggle = (id: string) => {
    const next = new Set(chosen);
    next.has(id) ? next.delete(id) : next.add(id);
    setChosen(next);
  };

  const selectedChars = analysable
    .filter((s) => chosen.size === 0 || chosen.has(s.id))
    .reduce((sum, s) => sum + s.extractedChars, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-ink-900">AI analysis</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          The model drafts requirements and reports conflicts. It approves nothing — every record lands as a draft for review.
        </p>
      </div>

      {policy && !policy.aiAvailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">No AI provider configured</p>
          <p className="mt-1 text-sm text-amber-800">
            Set <code className="font-mono">ANTHROPIC_API_KEY</code> or <code className="font-mono">OPENAI_API_KEY</code> on
            the server to enable analysis. Everything else in Delivery OS keeps working without it — you can add
            requirements by hand and approve a baseline as normal.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.3fr,1fr]">
        <section>
          <SectionHeading title="Sources to analyse" count={chosen.size || analysable.length} />
          {analysable.length === 0 ? (
            <EmptyState title="Nothing to analyse" body="Add a source in the knowledge centre first." />
          ) : (
            <>
              <div className="card divide-y divide-ink-100">
                {analysable.map((source) => (
                  <label key={source.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-ink-50/60">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500"
                      checked={chosen.size === 0 || chosen.has(source.id)}
                      onChange={() => toggle(source.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{source.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {titleCase(source.kind)} · {source._count.fragments} fragments · {(source.extractedChars / 1000).toFixed(1)}k chars
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-400">
                Leaving everything unticked analyses all ready sources. Restricted sources are never sent.
              </p>
            </>
          )}

          <div className="mt-4">
            <label className="label">Additional instructions (optional)</label>
            <textarea
              className="input mt-1.5 min-h-[72px]"
              placeholder="e.g. Pay particular attention to anything said about the launch date or the product count."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          {analyse.error ? <ErrorNote error={analyse.error} className="mt-3" /> : null}

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="primary"
              disabled={!can('ai.run') || analysable.length === 0 || !policy?.aiAvailable}
              loading={analyse.isPending}
              onClick={() => { setOutcome(null); analyse.mutate(); }}
            >
              {analyse.isPending ? 'Analysing…' : 'Run analysis'}
            </Button>
            {!can('ai.run') && <span className="text-xs text-ink-400">Your role cannot trigger analysis.</span>}
            {policy?.policy && (
              <span className="text-xs text-ink-400">
                {policy.policy.provider} · {policy.policy.model} · {(selectedChars / 1000).toFixed(0)}k of{' '}
                {(policy.policy.maxInputChars / 1000).toFixed(0)}k chars
              </span>
            )}
          </div>

          {analyse.isPending && (
            <p className="mt-3 text-sm text-ink-500">
              Reading every fragment and cross-checking the sources against each other. This takes a minute or two on a
              full proposal.
            </p>
          )}

          {outcome && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">
                Drafted {outcome.requirementsCreated} requirements and found {outcome.conflictsCreated} conflicts.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => navigate(`/projects/${projectId}/requirements`)}>
                  Review requirements
                </Button>
                {outcome.conflictsCreated > 0 && (
                  <Button size="sm" onClick={() => navigate(`/projects/${projectId}/conflicts`)}>
                    Resolve conflicts
                  </Button>
                )}
              </div>

              {outcome.gaps.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                    What the documents never address
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {outcome.gaps.map((gap) => (
                      <li key={gap.topic} className="rounded-md bg-white/70 px-3 py-2 text-sm">
                        <span className="font-semibold text-ink-900">{gap.topic}</span>
                        <span className="mt-0.5 block text-ink-600">{gap.why}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {outcome.warnings.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-medium text-emerald-800">
                    {outcome.warnings.length} warning{outcome.warnings.length === 1 ? '' : 's'} during extraction
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-ink-600">
                    {outcome.warnings.map((warning, i) => <li key={i}>· {warning}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>

        <section>
          <SectionHeading title="Run history" count={runs?.runs.length} />
          {!runs ? (
            <Skeleton className="h-40" />
          ) : runs.runs.length === 0 ? (
            <EmptyState title="No runs yet" body="Every run records its model, prompt version, token count and cost." />
          ) : (
            <div className="card divide-y divide-ink-100">
              {runs.runs.map((run) => (
                <div key={run.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={run.state === 'FAILED' ? 'red' : run.state === 'AWAITING_REVIEW' ? 'amber' : 'green'}>
                      {titleCase(run.state)}
                    </Badge>
                    <span className="text-xs text-ink-500">{relativeTime(run.createdAt)}</span>
                    <Avatar name={run.triggeredBy.name} color={run.triggeredBy.avatarColor} size={20} />
                  </div>
                  <p className="mt-1.5 text-sm text-ink-800">
                    {run.producedCount} requirements from {titleCase(run.jobType)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-400">
                    {run.provider} {run.model} · {run.promptVersion} · {run.schemaVersion}
                  </p>
                  {run.costUsd && (
                    <p className="mt-0.5 font-mono text-[11px] text-ink-400">
                      {run.inputTokens?.toLocaleString()} in / {run.outputTokens?.toLocaleString()} out · ${run.costUsd}
                    </p>
                  )}
                  {run.error && <p className="mt-1.5 text-xs text-red-700">{run.error}</p>}
                </div>
              ))}
            </div>
          )}
          {runs?.spend.costUsd && (
            <p className="mt-2 text-xs text-ink-400">Total spend on this project: ${runs.spend.costUsd}</p>
          )}
        </section>
      </div>
    </div>
  );
}
