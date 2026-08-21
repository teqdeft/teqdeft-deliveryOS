import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { AUTHORITY_LABELS, SOURCE_AUTHORITIES, SOURCE_KINDS } from '@deliveryos/shared';
import { get, post } from '../../lib/api.js';
import { useSession } from '../../lib/session.js';
import { Avatar, Badge, Button, EmptyState, ErrorNote, Field, Modal, SectionHeading, Skeleton } from '../../components/ui.js';
import { authorityLabel, formatDate, titleCase } from '../../lib/format.js';
import type { SourceSummary } from '../../lib/types.js';

/** Screen PJ-03 — the knowledge centre. */
export function Knowledge() {
  const { projectId = '' } = useParams();
  const { can } = useSession();
  const [addOpen, setAddOpen] = useState(false);
  const [inspecting, setInspecting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => get<{ sources: SourceSummary[] }>(`/projects/${projectId}/sources`),
  });

  const sources = data?.sources ?? [];
  const ready = sources.filter((s) => s.processingState === 'READY');
  const problems = sources.filter((s) => s.processingState !== 'READY');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink-900">Knowledge centre</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Every document behind this project, with the authority each one carries.
          </p>
        </div>
        {can('source.upload') && <Button variant="primary" onClick={() => setAddOpen(true)}>Add source</Button>}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : sources.length === 0 ? (
        <EmptyState
          title="No sources yet"
          body="Upload the signed proposal first — it is the highest-authority document, and everything else is measured against it."
          action={can('source.upload') ? <Button variant="primary" onClick={() => setAddOpen(true)}>Add the first source</Button> : undefined}
        />
      ) : (
        <>
          {problems.length > 0 && (
            <section>
              <SectionHeading title="Needs attention" count={problems.length} />
              <div className="space-y-2">
                {problems.map((source) => (
                  <div key={source.id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-900">{source.title}</p>
                    <p className="mt-0.5 text-sm text-amber-800">{source.processingError}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeading title="Analysable sources" count={ready.length} />
            <div className="card divide-y divide-ink-100">
              {ready.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setInspecting(source.id)}
                  className="flex w-full items-start gap-4 px-4 py-3 text-left transition hover:bg-brand-50/40"
                >
                  <AuthorityRank authority={source.authority} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{source.title}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {authorityLabel(source.authority)} · stated {formatDate(source.statedAt)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge>{titleCase(source.kind)}</Badge>
                      <Badge tone="brand">{source._count.fragments} citable fragments</Badge>
                      {source.confidentiality !== 'STANDARD' && (
                        <Badge tone="red">{titleCase(source.confidentiality)}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    <Avatar name={source.uploadedBy.name} color={source.uploadedBy.avatarColor} size={22} />
                    <span className="text-xs text-ink-500">{source.uploadedBy.name}</span>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Sources are ordered by authority. When two disagree, the higher one wins — and where they carry equal
              authority, the later statement supersedes the earlier.
            </p>
          </section>
        </>
      )}

      <AddSourceModal open={addOpen} onClose={() => setAddOpen(false)} projectId={projectId} />
      <SourceDetail projectId={projectId} sourceId={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}

/** Rank badge, so precedence is visible at a glance rather than remembered. */
function AuthorityRank({ authority }: { authority: string }) {
  const rank = SOURCE_AUTHORITIES.indexOf(authority as never) + 1;
  const strong = rank <= 3;
  return (
    <span
      className={
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold ' +
        (strong ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500')
      }
      title={`Authority rank ${rank} of ${SOURCE_AUTHORITIES.length}`}
    >
      {rank}
    </span>
  );
}

function AddSourceModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [form, setForm] = useState({
    title: '', kind: 'TRANSCRIPT', authority: 'CALL_TRANSCRIPT',
    statedAt: new Date().toISOString().slice(0, 10), inlineText: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'upload' && file) {
        const body = new FormData();
        Object.entries(form).forEach(([k, v]) => { if (k !== 'inlineText') body.append(k, v); });
        body.append('file', file);
        const token = localStorage.getItem('deliveryos.token');
        const response = await fetch(`/api/projects/${projectId}/sources`, {
          method: 'POST',
          body,
          credentials: 'include',
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? 'Upload failed');
        return payload as { fragmentCount: number; note?: string };
      }
      return post<{ fragmentCount: number; note?: string }>(`/projects/${projectId}/sources`, form);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      if (result.note) { setNote(result.note); return; }
      onClose();
      setForm({ ...form, title: '', inlineText: '' });
      setFile(null);
    },
    onError: setError,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a source"
      description="Set the authority honestly — it decides which statement wins when documents disagree."
      width="lg"
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); setNote(null); submit.mutate(); }}>
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {(['paste', 'upload'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ' +
                (mode === m ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700')
              }
            >
              {m === 'paste' ? 'Paste text' : 'Upload file'}
            </button>
          ))}
        </div>

        <Field label="Title" required>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" required>
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {SOURCE_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
            </select>
          </Field>
          <Field label="Authority" required>
            <select className="input" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })}>
              {SOURCE_AUTHORITIES.map((a) => <option key={a} value={a}>{AUTHORITY_LABELS[a]}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Date stated" hint="When the client said it — not when you uploaded the file. Precedence ties break on this." required>
          <input type="date" className="input" value={form.statedAt} onChange={(e) => setForm({ ...form, statedAt: e.target.value })} required />
        </Field>

        {mode === 'paste' ? (
          <Field label="Text" hint="Transcripts split on timestamps; email threads split per message and paragraph." required>
            <textarea
              className="input min-h-[180px] font-mono text-xs"
              value={form.inlineText}
              onChange={(e) => setForm({ ...form, inlineText: e.target.value })}
              placeholder={'00:00:12 Priya: We need the booking form live before the trade show…'}
              required
            />
          </Field>
        ) : (
          <Field label="File" hint="PDF, DOCX, TXT, CSV and Markdown are read for text. Other formats are stored but not analysable.">
            <input
              type="file"
              className="input"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.docx,.txt,.md,.csv,.vtt,.srt,.json"
              required
            />
          </Field>
        )}

        {note && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {note}
          </div>
        )}
        {error !== null && <ErrorNote error={error} />}

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>{note ? 'Close' : 'Cancel'}</Button>
          <Button type="submit" variant="primary" loading={submit.isPending}>Add source</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Screen PJ-04 — source detail with its fragments, the units citations point at. */
function SourceDetail({ projectId, sourceId, onClose }: { projectId: string; sourceId: string | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['source', sourceId],
    queryFn: () => get<{ source: SourceSummary & { fragments: { id: string; ordinal: number; locator: string; text: string }[] } }>(
      `/projects/${projectId}/sources/${sourceId}`,
    ),
    enabled: Boolean(sourceId),
  });

  return (
    <Modal
      open={Boolean(sourceId)}
      onClose={onClose}
      title={data?.source.title ?? 'Source'}
      description={data ? `${authorityLabel(data.source.authority)} · stated ${formatDate(data.source.statedAt)}` : undefined}
      width="xl"
    >
      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-500">
            {data.source.fragments.length} fragments. Each one is what a citation points at, so a reviewer can check a
            requirement against the exact words that produced it.
          </p>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {data.source.fragments.map((fragment) => (
              <div key={fragment.id} className="rounded-lg border border-ink-150 bg-ink-50/50 px-3 py-2.5">
                <p className="font-mono text-[11px] font-semibold text-brand-700">{fragment.locator}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{fragment.text}</p>
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
