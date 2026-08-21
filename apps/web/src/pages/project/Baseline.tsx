import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { get, post } from '../../lib/api.js';
import { useSession } from '../../lib/session.js';
import { Avatar, Badge, Button, EmptyState, ErrorNote, Field, Modal, Skeleton } from '../../components/ui.js';
import { formatDate, formatDateTime, titleCase } from '../../lib/format.js';
import type { BaselineView } from '../../lib/types.js';

/** Screen PJ-08 — the scope baseline. */
export function Baseline() {
  const { projectId = '' } = useParams();
  const { can } = useSession();
  const queryClient = useQueryClient();

  const [proposeOpen, setProposeOpen] = useState(false);
  const [approving, setApproving] = useState<BaselineView | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['baselines', projectId],
    queryFn: () => get<{ baselines: BaselineView[] }>(`/projects/${projectId}/baselines`),
  });
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => get<{ project: { code: string }; counts: { approvedRequirements: number; openConflicts: number } }>(`/projects/${projectId}`),
  });

  const baselines = data?.baselines ?? [];
  const pending = baselines.find((b) => b.state === 'PENDING_APPROVAL' || b.state === 'DRAFT');
  const active = baselines.find((b) => b.state === 'APPROVED');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['baselines', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink-900">Scope baseline</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            The agreed scope, frozen at approval. Version N is never edited — a change produces N+1 and both stay
            readable forever.
          </p>
        </div>
        {can('baseline.propose') && !pending && (
          <Button variant="primary" onClick={() => setProposeOpen(true)}>
            Propose {active ? `v${active.version + 1}` : 'v1'}
          </Button>
        )}
      </div>

      {project && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Approved requirements" value={project.counts.approvedRequirements} />
          <Stat label="Open conflicts" value={project.counts.openConflicts} tone={project.counts.openConflicts > 0 ? 'bad' : 'ok'} />
          <Stat label="Active baseline" value={active ? `v${active.version}` : 'None'} tone={active ? 'ok' : 'warn'} />
        </div>
      )}

      {project && project.counts.openConflicts > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {project.counts.openConflicts} unresolved conflict{project.counts.openConflicts === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            A baseline cannot be proposed while the sources still contradict each other. A baseline built over a known
            contradiction is not a baseline.
          </p>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : baselines.length === 0 ? (
        <EmptyState
          title="No baseline yet"
          body="Approve requirements in the studio, then propose version 1. Until that happens there is no agreed scope to measure change against."
        />
      ) : (
        <div className="space-y-3">
          {baselines.map((baseline) => (
            <article
              key={baseline.id}
              className={'card p-4 ' + (baseline.state === 'APPROVED' ? 'border-emerald-200' : baseline.state === 'PENDING_APPROVAL' ? 'border-amber-200' : '')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink-900">v{baseline.version}</span>
                    <Badge
                      tone={
                        baseline.state === 'APPROVED' ? 'green'
                          : baseline.state === 'PENDING_APPROVAL' ? 'amber'
                          : baseline.state === 'SUPERSEDED' ? 'neutral' : 'brand'
                      }
                    >
                      {titleCase(baseline.state)}
                    </Badge>
                    <span className="text-sm font-medium text-ink-700">{baseline.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {baseline._count.requirements} requirements
                    {baseline.approvedAt ? ` · approved ${formatDate(baseline.approvedAt)}` : baseline.proposedAt ? ` · proposed ${formatDate(baseline.proposedAt)}` : ''}
                  </p>
                  {baseline.changeReason && (
                    <p className="mt-1 text-sm text-ink-600">{baseline.changeReason}</p>
                  )}
                  {baseline.approvals && baseline.approvals.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {baseline.approvals.map((approval) => (
                        <span key={approval.id} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                          <Avatar name={approval.approver.name} color={approval.approver.avatarColor} size={16} />
                          {approval.approver.name} · {formatDateTime(approval.createdAt)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setInspecting(baseline.id)}>View scope</Button>
                  {baseline.state === 'PENDING_APPROVAL' && can('baseline.approve') && (
                    <Button size="sm" variant="primary" onClick={() => setApproving(baseline)}>Approve</Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ProposeModal open={proposeOpen} onClose={() => setProposeOpen(false)} projectId={projectId} nextVersion={(active?.version ?? 0) + 1} onDone={invalidate} />
      <ApproveModal baseline={approving} onClose={() => setApproving(null)} projectId={projectId} projectCode={project?.project.code ?? ''} onDone={invalidate} />
      <ScopeModal projectId={projectId} baselineId={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={'mt-0.5 text-lg font-bold ' + (tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-emerald-600' : 'text-ink-900')}>
        {value}
      </p>
    </div>
  );
}

function ProposeModal({
  open, onClose, projectId, nextVersion, onDone,
}: { open: boolean; onClose: () => void; projectId: string; nextVersion: number; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');

  const propose = useMutation({
    mutationFn: () => post(`/projects/${projectId}/baselines`, { title, ...(reason ? { changeReason: reason } : {}) }),
    onSuccess: () => { onDone(); onClose(); setTitle(''); setReason(''); },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Propose scope baseline v${nextVersion}`}
      description="This snapshots every approved requirement as it reads right now. Later edits to those requirements cannot change what this version says."
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); propose.mutate(); }}>
        <Field label="Title" required>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Agreed scope v${nextVersion}`}
            minLength={3}
            required
          />
        </Field>
        <Field label="What changed" hint="Leave blank for the first version.">
          <textarea className="input min-h-[72px]" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {propose.error ? <ErrorNote error={propose.error} /> : null}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={propose.isPending}>Propose</Button>
        </div>
      </form>
    </Modal>
  );
}

function ApproveModal({
  baseline, onClose, projectId, projectCode, onDone,
}: { baseline: BaselineView | null; onClose: () => void; projectId: string; projectCode: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState('');
  const [comment, setComment] = useState('');

  const approve = useMutation({
    mutationFn: () =>
      post(`/projects/${projectId}/baselines/${baseline?.id}/approve`, {
        confirmProjectCode: confirm,
        ...(comment ? { comment } : {}),
      }),
    onSuccess: () => { onDone(); onClose(); setConfirm(''); setComment(''); },
  });

  return (
    <Modal
      open={Boolean(baseline)}
      onClose={onClose}
      title={`Approve baseline v${baseline?.version}`}
      description="This is irreversible. From this point, anything the client asks for that is not in these requirements is a change request."
    >
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="text-sm text-amber-900">
          You are approving <strong>{baseline?._count.requirements} requirements</strong> as the agreed scope. The
          previous version, if any, becomes superseded but stays readable.
        </p>
      </div>

      <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); approve.mutate(); }}>
        <Field label={`Type ${projectCode} to confirm`} required>
          <input
            className="input font-mono uppercase"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.toUpperCase())}
            placeholder={projectCode}
            required
          />
        </Field>
        <Field label="Comment">
          <textarea className="input min-h-[64px]" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        {approve.error ? <ErrorNote error={approve.error} /> : null}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={confirm !== projectCode.toUpperCase()}
            loading={approve.isPending}
          >
            Approve baseline
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ScopeModal({ projectId, baselineId, onClose }: { projectId: string; baselineId: string | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['baseline', baselineId],
    queryFn: () => get<{
      baseline: BaselineView & {
        requirements: {
          id: string; title: string; statement: string; priority: string; isExclusion: boolean;
          requirement: { reference: string };
          citationSnapshot: { locator: string; sourceTitle: string; quote: string }[];
        }[];
      };
      diff: { fromVersion: number | null; toVersion: number; summary: { added: number; removed: number; modified: number; unchanged: number } };
    }>(`/projects/${projectId}/baselines/${baselineId}`),
    enabled: Boolean(baselineId),
  });

  return (
    <Modal
      open={Boolean(baselineId)}
      onClose={onClose}
      title={data ? `Scope baseline v${data.baseline.version}` : 'Baseline'}
      description={data?.baseline.title}
      width="xl"
    >
      {!data ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          {data.diff.fromVersion !== null && (
            <div className="mb-4 flex flex-wrap gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs">
              <span className="text-ink-500">Against v{data.diff.fromVersion}:</span>
              <span className="font-medium text-emerald-700">{data.diff.summary.added} added</span>
              <span className="font-medium text-amber-700">{data.diff.summary.modified} modified</span>
              <span className="font-medium text-red-700">{data.diff.summary.removed} removed</span>
              <span className="text-ink-500">{data.diff.summary.unchanged} unchanged</span>
            </div>
          )}
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {data.baseline.requirements.map((item) => (
              <div key={item.id} className="rounded-lg border border-ink-200 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-ink-400">{item.requirement.reference}</span>
                  <Badge tone={item.priority === 'MUST' ? 'brand' : 'neutral'}>{item.priority}</Badge>
                  {item.isExclusion && <Badge tone="red">Exclusion</Badge>}
                </div>
                <p className="mt-1 text-sm font-semibold text-ink-900">{item.title}</p>
                <p className="mt-0.5 text-sm text-ink-600">{item.statement}</p>
                {item.citationSnapshot.length > 0 && (
                  <p className="mt-1.5 font-mono text-[11px] text-ink-400">
                    {item.citationSnapshot.map((c) => `${c.sourceTitle} ${c.locator}`).join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end border-t border-ink-100 pt-4">
            <Button onClick={onClose}>Close</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
