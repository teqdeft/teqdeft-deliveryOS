import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { get, post } from '../../lib/api.js';
import { useSession } from '../../lib/session.js';
import { Badge, Button, EmptyState, ErrorNote, Skeleton } from '../../components/ui.js';
import { authorityLabel, formatDate, titleCase } from '../../lib/format.js';
import type { ConflictView } from '../../lib/types.js';

type Resolution = 'SIDE_A' | 'SIDE_B' | 'BOTH' | 'NEITHER';

/** Screen PJ-07 — conflicts and open questions. */
export function Conflicts() {
  const { projectId = '' } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['conflicts', projectId],
    queryFn: () => get<{ conflicts: ConflictView[] }>(`/projects/${projectId}/conflicts`),
  });

  const open = data?.conflicts.filter((c) => c.state === 'OPEN') ?? [];
  const closed = data?.conflicts.filter((c) => c.state !== 'OPEN') ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-ink-900">Conflicts</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Where the sources disagree. The system will not choose for you — a scope baseline cannot be proposed while any
          of these is open.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : open.length === 0 && closed.length === 0 ? (
        <EmptyState
          title="No conflicts found"
          body="Either the sources agree, or no analysis has run yet. Conflicts appear here when two documents make incompatible claims."
        />
      ) : (
        <>
          {open.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-900">
                Awaiting a decision <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">{open.length}</span>
              </h2>
              {open.map((conflict) => (
                <ConflictCard key={conflict.id} conflict={conflict} projectId={projectId} />
              ))}
            </section>
          )}

          {closed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-900">Resolved</h2>
              {closed.map((conflict) => (
                <ConflictCard key={conflict.id} conflict={conflict} projectId={projectId} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ConflictCard({ conflict, projectId }: { conflict: ConflictView; projectId: string }) {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Resolution | null>(null);
  const [rationale, setRationale] = useState('');

  const resolve = useMutation({
    mutationFn: () =>
      post(`/projects/${projectId}/conflicts/${conflict.id}/resolve`, {
        resolution: choice,
        rationale,
        recordAsDecision: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conflicts', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const sideA = conflict.citations.filter((c) => c.side === 'A');
  const sideB = conflict.citations.filter((c) => c.side === 'B');
  const isOpen = conflict.state === 'OPEN';

  return (
    <article className={'card p-4 ' + (isOpen ? 'border-red-200' : '')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={isOpen ? 'red' : 'green'}>{titleCase(conflict.state)}</Badge>
        <Badge tone={conflict.severity === 'CRITICAL' || conflict.severity === 'HIGH' ? 'amber' : 'neutral'}>
          {titleCase(conflict.severity)}
        </Badge>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-ink-900">{conflict.summary}</h3>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Side label="Statement A" statement={conflict.statementA} citations={sideA} />
        <Side label="Statement B" statement={conflict.statementB} citations={sideB} />
      </div>

      {conflict.suggestedResolution && isOpen && (
        <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">The model's reading</p>
          <p className="mt-0.5 text-sm text-ink-700">{conflict.suggestedResolution}</p>
          <p className="mt-1 text-[11px] text-ink-400">This is a suggestion, not a decision. You are the approver.</p>
        </div>
      )}

      {!isOpen && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            Resolved — {titleCase(conflict.resolution ?? '')}
          </p>
          <p className="mt-0.5 text-sm text-ink-800">{conflict.rationale}</p>
        </div>
      )}

      {isOpen && can('conflict.resolve') && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <p className="label">Which stands?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['SIDE_A', 'SIDE_B', 'BOTH', 'NEITHER'] as Resolution[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setChoice(option)}
                className={
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition ' +
                  (choice === option
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')
                }
              >
                {option === 'SIDE_A' ? 'Statement A' : option === 'SIDE_B' ? 'Statement B' : titleCase(option)}
              </button>
            ))}
          </div>

          {choice && (
            <div className="mt-3 space-y-2">
              <textarea
                className="input min-h-[64px]"
                placeholder="Why? This becomes a decision record, so the same question is not re-litigated in three months."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />
              {resolve.error ? <ErrorNote error={resolve.error} /> : null}
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => { setChoice(null); setRationale(''); }}>Cancel</Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={rationale.trim().length < 5}
                  loading={resolve.isPending}
                  onClick={() => resolve.mutate()}
                >
                  Record decision
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Side({
  label, statement, citations,
}: { label: string; statement: string; citations: (ConflictView['citations'][number])[] }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-800">{statement}</p>
      <div className="mt-2 space-y-1.5">
        {citations.map((citation) => (
          <div key={citation.id} className="border-l-2 border-brand-400 pl-2.5">
            <p className="text-[11px]">
              <span className="font-mono font-semibold text-brand-700">{citation.fragment.locator}</span>
              <span className="text-ink-400"> · </span>
              <span className="text-ink-600">{citation.fragment.source.title}</span>
            </p>
            <p className="text-[11px] text-ink-400">
              {authorityLabel(citation.fragment.source.authority)} · {formatDate(citation.fragment.source.statedAt)}
            </p>
            <p className="mt-0.5 text-xs italic text-ink-600">{citation.quote}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
