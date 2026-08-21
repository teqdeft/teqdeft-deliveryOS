import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ENGAGEMENT_TYPES, ENGAGEMENT_TYPE_LABELS, HEALTH_STATES, PROJECT_STAGES } from '@deliveryos/shared';
import { get, post } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { Avatar, Badge, Button, EmptyState, ErrorNote, Field, HealthPill, Modal, Skeleton } from '../components/ui.js';
import { engagementLabel, formatDate, formatMoney, stageLabel } from '../lib/format.js';
import type { Paginated, ProjectSummary } from '../lib/types.js';

/** Screen PF-02 — the projects directory. */
export function Projects() {
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [health, setHealth] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  const query = new URLSearchParams({ pageSize: '100' });
  if (search) query.set('search', search);
  if (stage) query.set('stage', stage);
  if (health) query.set('health', health);

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', search, stage, health],
    queryFn: () => get<Paginated<ProjectSummary>>(`/projects?${query}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Projects</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {data ? `${data.total} project${data.total === 1 ? '' : 's'} you can access` : 'Loading…'}
          </p>
        </div>
        {can('project.create') && (
          <Button variant="primary" onClick={() => setWizardOpen(true)}>
            New project
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name, code or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[190px]" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {PROJECT_STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
        </select>
        <select className="input max-w-[150px]" value={health} onChange={(e) => setHealth(e.target.value)}>
          <option value="">All health</option>
          {HEALTH_STATES.map((h) => <option key={h} value={h}>{h.charAt(0) + h.slice(1).toLowerCase()}</option>)}
        </select>
      </div>

      {error ? <ErrorNote error={error} /> : null}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : data?.items.length === 0 ? (
        <EmptyState
          title="No projects match"
          body={search || stage || health ? 'Try clearing the filters above.' : 'Create a project to begin the intake flow.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 bg-ink-50/60 text-left">
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Project</th>
                <th className="px-4 py-2.5">Stage</th>
                <th className="px-4 py-2.5">Health</th>
                <th className="px-4 py-2.5">PM</th>
                <th className="px-4 py-2.5 text-right">Value</th>
                <th className="px-4 py-2.5">Launch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data?.items.map((project) => (
                <tr key={project.id} className="transition hover:bg-brand-50/40">
                  <td className="px-4 py-3">
                    <Link to={`/projects/${project.id}`} className="block">
                      <span className="font-mono text-[11px] text-ink-400">{project.code}</span>
                      <span className="block font-semibold text-ink-900 hover:text-brand-700">{project.name}</span>
                      <span className="block text-xs text-ink-500">
                        {project.client.name} · {engagementLabel(project.engagementType)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3"><Badge tone="brand">{stageLabel(project.stage)}</Badge></td>
                  <td className="px-4 py-3"><HealthPill health={project.health} size="sm" /></td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <Avatar name={project.projectManager.name} color={project.projectManager.avatarColor} size={22} />
                      <span className="text-xs text-ink-600">{project.projectManager.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-ink-700">
                    {formatMoney(project.contractValue, project.currency)}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">{formatDate(project.targetLaunchDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

/** Screen PJ-01 — the create-project wizard. */
function CreateProjectWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    clientId: '', newClientName: '', name: '', code: '',
    engagementType: 'MARKETING_WEBSITE', projectManagerId: '', technicalLeadId: '',
    targetLaunchDate: '', contractValue: '', summary: '',
  });
  const [error, setError] = useState<unknown>(null);

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => get<{ clients: { id: string; name: string }[] }>('/clients'),
    enabled: open,
  });
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => get<{ users: { id: string; name: string; role: string }[] }>('/auth/users'),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      let clientId = form.clientId;
      if (!clientId && form.newClientName.trim()) {
        const created = await post<{ client: { id: string } }>('/clients', { name: form.newClientName.trim() });
        clientId = created.client.id;
      }
      return post<{ project: ProjectSummary }>('/projects', {
        clientId,
        name: form.name,
        code: form.code.toUpperCase(),
        engagementType: form.engagementType,
        projectManagerId: form.projectManagerId,
        ...(form.technicalLeadId ? { technicalLeadId: form.technicalLeadId } : {}),
        ...(form.targetLaunchDate ? { targetLaunchDate: form.targetLaunchDate } : {}),
        ...(form.contractValue ? { contractValue: Number(form.contractValue) } : {}),
        ...(form.summary ? { summary: form.summary } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: setError,
  });

  const pms = users?.users.filter((u) => ['PROJECT_MANAGER', 'DELIVERY_HEAD', 'FOUNDER'].includes(u.role)) ?? [];
  const leads = users?.users.filter((u) => ['CTO', 'TEAM_MEMBER'].includes(u.role)) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="Capture the accountable owners now — a project that enters the lifecycle without them cannot pass its intake gate."
      width="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" required>
            <select
              className="input"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            >
              <option value="">— New client —</option>
              {clients?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {!form.clientId && (
            <Field label="New client name" required>
              <input
                className="input"
                value={form.newClientName}
                onChange={(e) => setForm({ ...form, newClientName: e.target.value })}
                required
              />
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr,140px]">
          <Field label="Project name" required>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
          </Field>
          <Field label="Code" hint="Appears in client emails" required>
            <input
              className="input font-mono uppercase"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              pattern="[A-Z0-9\-]{2,24}"
              placeholder="NWO-01"
              required
            />
          </Field>
        </div>

        <Field label="Engagement type" required>
          <select className="input" value={form.engagementType} onChange={(e) => setForm({ ...form, engagementType: e.target.value })}>
            {ENGAGEMENT_TYPES.map((t) => <option key={t} value={t}>{ENGAGEMENT_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project manager" required>
            <select className="input" value={form.projectManagerId} onChange={(e) => setForm({ ...form, projectManagerId: e.target.value })} required>
              <option value="">Select…</option>
              {pms.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Technical lead" hint="Needed as the second approver on the scope baseline">
            <select className="input" value={form.technicalLeadId} onChange={(e) => setForm({ ...form, technicalLeadId: e.target.value })}>
              <option value="">Not assigned yet</option>
              {leads.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target launch date">
            <input type="date" className="input" value={form.targetLaunchDate} onChange={(e) => setForm({ ...form, targetLaunchDate: e.target.value })} />
          </Field>
          <Field label="Contract value (INR)">
            <input type="number" min="0" className="input" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} />
          </Field>
        </div>

        <Field label="Summary">
          <textarea className="input min-h-[72px]" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </Field>

        {error !== null && <ErrorNote error={error} />}

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={create.isPending}>Create project</Button>
        </div>
      </form>
    </Modal>
  );
}
