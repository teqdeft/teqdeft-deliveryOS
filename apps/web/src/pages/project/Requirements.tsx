import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { REQUIREMENT_CLASSES, REQUIREMENT_PRIORITIES, REQUIREMENT_REVIEW_STATES } from '@deliveryos/shared';
import { get, post, patch } from '../../lib/api.js';
import { useSession } from '../../lib/session.js';
import { Badge, Button, EmptyState, ErrorNote, Field, Modal, Skeleton } from '../../components/ui.js';
import { authorityLabel, formatDate, requirementClassLabel, titleCase } from '../../lib/format.js';
import type { Paginated, RequirementView } from '../../lib/types.js';

type RequirementList = Paginated<RequirementView> & {
  tally: Record<string, number>;
  bulkApproveMinConfidence: number;
};

/** Screen PJ-06 — the Requirements Studio. */
export function Requirements() {
  const { projectId = '' } = useParams();
  const { can } = useSession();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ reviewState: '', requirementClass: '', search: '', questionsOnly: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ approved: number; skipped: { reference: string; reason: string }[] } | null>(null);

  const query = new URLSearchParams({ pageSize: '200' });
  if (filters.reviewState) query.set('reviewState', filters.reviewState);
  if (filters.requirementClass) query.set('requirementClass', filters.requirementClass);
  if (filters.search) query.set('search', filters.search);
  if (filters.questionsOnly) query.set('hasOpenQuestion', 'true');

  const { data, isLoading } = useQuery({
    queryKey: ['requirements', projectId, filters],
    queryFn: () => get<RequirementList>(`/projects/${projectId}/requirements?${query}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };

  const decide = useMutation({
    mutationFn: (vars: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      post(`/projects/${projectId}/requirements/${vars.id}/decide`, { decision: vars.decision }),
    onSuccess: invalidate,
  });

  const bulkApprove = useMutation({
    mutationFn: () =>
      post<{ approved: number; skipped: { reference: string; reason: string }[] }>(
        `/projects/${projectId}/requirements/bulk-approve`,
        { requirementIds: [...selected] },
      ),
    onSuccess: (result) => { setBulkResult(result); setSelected(new Set()); invalidate(); },
  });

  const items = data?.items ?? [];
  const tally = data?.tally ?? {};

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectable = useMemo(
    () => items.filter((r) => r.reviewState === 'DRAFT' || r.reviewState === 'IN_REVIEW'),
    [items],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink-900">Requirements studio</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Every requirement carries the exact words that produced it. Nothing here is approved until a person says so.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REQUIREMENT_REVIEW_STATES.filter((s) => s !== 'SUPERSEDED').map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => setFilters({ ...filters, reviewState: filters.reviewState === state ? '' : state })}
              className={
                'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ' +
                (filters.reviewState === state
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')
              }
            >
              {titleCase(state)}
              <span className="ml-1.5 tabular-nums text-ink-400">{tally[state] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search requirements…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select
          className="input max-w-[240px]"
          value={filters.requirementClass}
          onChange={(e) => setFilters({ ...filters, requirementClass: e.target.value })}
        >
          <option value="">All classes</option>
          {REQUIREMENT_CLASSES.map((c) => <option key={c} value={c}>{requirementClassLabel(c)}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500"
            checked={filters.questionsOnly}
            onChange={(e) => setFilters({ ...filters, questionsOnly: e.target.checked })}
          />
          Open questions only
        </label>
      </div>

      {selected.size > 0 && can('requirement.bulkApprove') && (
        <div className="sticky top-[104px] z-30 flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-brand-900">{selected.size} selected</span>
          <span className="text-xs text-brand-700">
            Only high-confidence, fully cited requirements with no open question will be approved — the rest are skipped
            and listed.
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" variant="primary" loading={bulkApprove.isPending} onClick={() => bulkApprove.mutate()}>
              Approve selected
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No requirements yet"
          body="Run the AI analysis on your sources, or add a requirement by hand. Either way, each one needs a citation before it can be approved."
        />
      ) : (
        <>
          {selectable.length > 0 && can('requirement.bulkApprove') && (
            <button
              type="button"
              className="text-xs font-medium text-brand-700 hover:underline"
              onClick={() =>
                setSelected(selected.size === selectable.length ? new Set() : new Set(selectable.map((r) => r.id)))
              }
            >
              {selected.size === selectable.length ? 'Clear selection' : `Select all ${selectable.length} unreviewed`}
            </button>
          )}

          <div className="space-y-2">
            {items.map((requirement) => (
              <RequirementCard
                key={requirement.id}
                requirement={requirement}
                selected={selected.has(requirement.id)}
                onToggle={() => toggle(requirement.id)}
                onOpen={() => setOpenId(requirement.id)}
                onDecide={(decision) => decide.mutate({ id: requirement.id, decision })}
                deciding={decide.isPending}
                canDecide={can('requirement.decide')}
                canSelect={can('requirement.bulkApprove')}
              />
            ))}
          </div>
        </>
      )}

      {decide.error ? <ErrorNote error={decide.error} /> : null}

      <RequirementDetail projectId={projectId} requirementId={openId} onClose={() => setOpenId(null)} onChanged={invalidate} />

      <Modal open={Boolean(bulkResult)} onClose={() => setBulkResult(null)} title="Bulk approval result">
        <p className="text-sm text-ink-700">
          <strong>{bulkResult?.approved ?? 0}</strong> requirement{bulkResult?.approved === 1 ? '' : 's'} approved.
        </p>
        {bulkResult && bulkResult.skipped.length > 0 && (
          <>
            <p className="mt-4 text-sm font-semibold text-ink-900">
              {bulkResult.skipped.length} skipped — these need explicit review:
            </p>
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {bulkResult.skipped.map((s) => (
                <li key={s.reference} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <span className="font-mono text-xs font-semibold">{s.reference}</span> — {s.reason}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-4 flex justify-end border-t border-ink-100 pt-4">
          <Button variant="primary" onClick={() => setBulkResult(null)}>Done</Button>
        </div>
      </Modal>
    </div>
  );
}

function RequirementCard({
  requirement, selected, onToggle, onOpen, onDecide, deciding, canDecide, canSelect,
}: {
  requirement: RequirementView;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDecide: (decision: 'APPROVE' | 'REJECT') => void;
  deciding: boolean;
  canDecide: boolean;
  canSelect: boolean;
}) {
  const confidence = requirement.confidence ? Number(requirement.confidence) : null;
  const unreviewed = requirement.reviewState === 'DRAFT' || requirement.reviewState === 'IN_REVIEW';
  const blockedByQuestion = Boolean(requirement.openQuestion) && !requirement.questionAnsweredAt;

  return (
    <article
      className={
        'card px-4 py-3.5 transition ' +
        (selected ? 'border-brand-400 ring-1 ring-brand-400' : 'hover:border-ink-300')
      }
    >
      <div className="flex items-start gap-3">
        {canSelect && unreviewed && (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-500 focus:ring-brand-500"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${requirement.reference}`}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-ink-400">{requirement.reference}</span>
            <StateBadge state={requirement.reviewState} />
            <Badge tone={requirement.priority === 'MUST' ? 'brand' : 'neutral'}>{requirement.priority}</Badge>
            {requirement.isExclusion && <Badge tone="red">Exclusion</Badge>}
            {requirement.isAssumption && <Badge tone="amber">Assumption</Badge>}
            {confidence !== null && <ConfidenceMeter value={confidence} />}
          </div>

          <button type="button" onClick={onOpen} className="mt-1.5 block text-left">
            <h3 className="text-sm font-semibold text-ink-900 hover:text-brand-700">{requirement.title}</h3>
          </button>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-600">{requirement.statement}</p>

          {blockedByQuestion && (
            <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Open question</p>
              <p className="mt-0.5 text-sm text-amber-900">{requirement.openQuestion}</p>
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {requirement.citations.slice(0, 3).map((citation) => (
              <span
                key={citation.id}
                className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600"
                title={citation.quote}
              >
                <QuoteIcon />
                <span className="font-mono">{citation.fragment.locator}</span>
                <span className="text-ink-400">·</span>
                <span className="max-w-[180px] truncate">{citation.fragment.source.title}</span>
              </span>
            ))}
            {requirement.citations.length > 3 && (
              <span className="text-[11px] text-ink-400">+{requirement.citations.length - 3} more</span>
            )}
            {requirement.citations.length === 0 && (
              <span className="text-[11px] font-medium text-red-600">No citation — cannot be approved</span>
            )}
          </div>
        </div>

        {canDecide && unreviewed && (
          <div className="flex shrink-0 flex-col gap-1.5">
            <Button
              size="sm"
              variant="primary"
              disabled={deciding || blockedByQuestion || requirement.citations.length === 0}
              onClick={() => onDecide('APPROVE')}
              title={blockedByQuestion ? 'Answer the open question first' : undefined}
            >
              Approve
            </Button>
            <Button size="sm" variant="danger" disabled={deciding} onClick={() => onDecide('REJECT')}>
              Reject
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function StateBadge({ state }: { state: string }) {
  const tone = state === 'APPROVED' ? 'green' : state === 'REJECTED' ? 'red' : state === 'IN_REVIEW' ? 'amber' : 'neutral';
  return <Badge tone={tone}>{titleCase(state)}</Badge>;
}

/** Confidence is only meaningful if it is legible at a glance. */
function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.8 ? 'bg-emerald-500' : value >= 0.6 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="inline-flex items-center gap-1.5" title={`Model confidence ${pct}%`}>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-ink-150">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-[10px] text-ink-500">{pct}%</span>
    </span>
  );
}

function QuoteIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden className="text-brand-500">
      <path d="M4.5 2H2v3.5h1.75L2.5 9h1.75L5.5 5.5V2zm5 0H7v3.5h1.75L7.5 9h1.75L10.5 5.5V2z" />
    </svg>
  );
}

/** Requirement detail with full provenance and the edit history behind it. */
function RequirementDetail({
  projectId, requirementId, onClose, onChanged,
}: { projectId: string; requirementId: string | null; onClose: () => void; onChanged: () => void }) {
  const { can } = useSession();
  const [answer, setAnswer] = useState('');
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['requirement', requirementId],
    queryFn: () => get<{
      requirement: RequirementView & {
        revisions: { id: string; revision: number; action: string; reason: string | null; createdAt: string; actor: { name: string } }[];
        aiRun: { id: string; model: string; provider: string; promptVersion: string } | null;
      };
    }>(`/projects/${projectId}/requirements/${requirementId}`),
    enabled: Boolean(requirementId),
  });

  const answerQuestion = useMutation({
    mutationFn: () => post(`/projects/${projectId}/requirements/${requirementId}/answer`, { answer }),
    onSuccess: () => {
      setAnswer('');
      void queryClient.invalidateQueries({ queryKey: ['requirement', requirementId] });
      onChanged();
    },
  });

  const requirement = data?.requirement;

  return (
    <Modal
      open={Boolean(requirementId)}
      onClose={onClose}
      title={requirement ? `${requirement.reference} — ${requirement.title}` : 'Requirement'}
      width="xl"
    >
      {!requirement ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={requirement.reviewState} />
            <Badge tone="brand">{requirementClassLabel(requirement.requirementClass)}</Badge>
            <Badge>{requirement.priority}</Badge>
            <Badge>{titleCase(requirement.origin)}</Badge>
          </div>

          <section>
            <h3 className="label">Statement</h3>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{requirement.statement}</p>
          </section>

          {requirement.acceptanceCriteria.length > 0 && (
            <section>
              <h3 className="label">Acceptance criteria</h3>
              <ul className="mt-1.5 space-y-1">
                {requirement.acceptanceCriteria.map((criterion, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-700">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    {criterion}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {requirement.openQuestion && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Open question</h3>
              <p className="mt-1 text-sm text-amber-900">{requirement.openQuestion}</p>
              {requirement.questionAnsweredAt ? (
                <div className="mt-2.5 rounded-md bg-white/70 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Answered</p>
                  <p className="mt-0.5 text-sm text-ink-800">{requirement.questionAnswer}</p>
                </div>
              ) : can('requirement.edit') ? (
                <div className="mt-2.5 flex gap-2">
                  <input
                    className="input"
                    placeholder="What did the client actually say?"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={answer.trim().length < 2}
                    loading={answerQuestion.isPending}
                    onClick={() => answerQuestion.mutate()}
                  >
                    Record
                  </Button>
                </div>
              ) : null}
              {answerQuestion.error ? <ErrorNote error={answerQuestion.error} className="mt-2" /> : null}
            </section>
          )}

          <section>
            <h3 className="label">Provenance</h3>
            <p className="mt-1 text-xs text-ink-400">
              Citations point at stored fragment ids, not copied text, so they survive a document being reprocessed.
            </p>
            <div className="mt-2 space-y-2">
              {requirement.citations.map((citation) => (
                <div key={citation.id} className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-mono font-semibold text-brand-700">{citation.fragment.locator}</span>
                    <span className="text-ink-400">·</span>
                    <span className="font-medium text-ink-700">{citation.fragment.source.title}</span>
                    <Badge>{authorityLabel(citation.fragment.source.authority)}</Badge>
                    <span className="text-ink-400">{formatDate(citation.fragment.source.statedAt)}</span>
                  </div>
                  <blockquote className="mt-1.5 border-l-2 border-brand-400 pl-3 text-sm italic leading-relaxed text-ink-700">
                    {citation.quote}
                  </blockquote>
                </div>
              ))}
            </div>
          </section>

          {requirement.revisions.length > 0 && (
            <section>
              <h3 className="label">History</h3>
              <ol className="mt-2 space-y-1.5">
                {requirement.revisions.map((revision) => (
                  <li key={revision.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className="font-mono text-ink-400">r{revision.revision}</span>
                    <Badge>{titleCase(revision.action)}</Badge>
                    <span className="text-ink-600">{revision.actor.name}</span>
                    <span className="text-ink-400">{formatDate(revision.createdAt)}</span>
                    {revision.reason && <span className="text-ink-500">— {revision.reason}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {requirement.aiRun && (
            <p className="border-t border-ink-100 pt-3 text-xs text-ink-400">
              Drafted by {requirement.aiRun.provider} {requirement.aiRun.model}, prompt {requirement.aiRun.promptVersion}.
            </p>
          )}

          <div className="flex justify-end border-t border-ink-100 pt-4">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
