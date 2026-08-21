import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { Badge, EmptyState, HealthPill, Skeleton } from '../components/ui.js';
import { daysUntil, engagementLabel, formatDate, stageLabel } from '../lib/format.js';
import type { Paginated, ProjectSummary } from '../lib/types.js';

/** Screen G-02 — the role dashboard. */
export function Home() {
  const { session } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'dashboard'],
    queryFn: () => get<Paginated<ProjectSummary>>('/projects?pageSize=100'),
  });

  const projects = data?.items ?? [];
  const needingAttention = projects.filter((p) => p.health === 'RED' || p.health === 'AMBER');
  const dueSoon = projects
    .filter((p) => {
      const days = daysUntil(p.targetLaunchDate);
      return days !== null && days <= 45;
    })
    .sort((a, b) => (a.targetLaunchDate ?? '').localeCompare(b.targetLaunchDate ?? ''));

  const firstName = session?.user.name.split(' ')[0] ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Good to see you, {firstName}</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          {isLoading
            ? 'Loading your portfolio…'
            : projects.length === 0
              ? 'No projects are assigned to you yet.'
              : `${projects.length} active project${projects.length === 1 ? '' : 's'}${needingAttention.length ? `, ${needingAttention.length} needing attention` : ', all green'}.`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active projects" value={projects.length} loading={isLoading} />
        <StatTile
          label="Needing attention"
          value={needingAttention.length}
          tone={needingAttention.length > 0 ? 'warn' : 'ok'}
          loading={isLoading}
        />
        <StatTile
          label="Launching within 45 days"
          value={dueSoon.length}
          loading={isLoading}
        />
        <StatTile
          label="Sources ingested"
          value={projects.reduce((sum, p) => sum + p._count.sources, 0)}
          loading={isLoading}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px] w-full" />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="Nothing assigned yet"
          body="Projects you manage or are a member of will appear here. Ask a project manager to add you to a project."
        />
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Your projects</h2>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatTile({
  label, value, tone = 'neutral', loading,
}: { label: string; value: number; tone?: 'neutral' | 'ok' | 'warn'; loading?: boolean }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p
          className={
            'mt-1 text-2xl font-bold tabular-nums ' +
            (tone === 'warn' && value > 0 ? 'text-amber-600' : tone === 'ok' && value === 0 ? 'text-emerald-600' : 'text-ink-900')
          }
        >
          {value}
        </p>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const days = daysUntil(project.targetLaunchDate);
  return (
    <Link
      to={`/projects/${project.id}`}
      className="card block px-4 py-3.5 transition hover:border-brand-300 hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-medium text-ink-400">{project.code}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-ink-900">{project.name}</p>
          <p className="mt-0.5 truncate text-xs text-ink-500">{project.client.name}</p>
        </div>
        <HealthPill health={project.health} size="sm" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{stageLabel(project.stage)}</Badge>
        <Badge>{engagementLabel(project.engagementType)}</Badge>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-xs">
        <div>
          <dt className="text-ink-400">Sources</dt>
          <dd className="font-semibold tabular-nums text-ink-800">{project._count.sources}</dd>
        </div>
        <div>
          <dt className="text-ink-400">Requirements</dt>
          <dd className="font-semibold tabular-nums text-ink-800">{project._count.requirements}</dd>
        </div>
        <div>
          <dt className="text-ink-400">Launch</dt>
          <dd
            className={
              'font-semibold ' +
              (days !== null && days < 0 ? 'text-red-600' : days !== null && days <= 21 ? 'text-amber-600' : 'text-ink-800')
            }
          >
            {project.targetLaunchDate ? formatDate(project.targetLaunchDate) : '—'}
          </dd>
        </div>
      </dl>
    </Link>
  );
}
