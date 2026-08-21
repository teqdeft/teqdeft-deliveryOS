import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { get } from '../../lib/api.js';
import { Avatar, Badge, EmptyState, Skeleton } from '../../components/ui.js';
import { formatDateTime, relativeTime } from '../../lib/format.js';
import type { AuditEventView, Paginated } from '../../lib/types.js';

/** Screen PJ-21 — project activity and audit. Read-only by construction. */
export function Activity() {
  const { projectId } = useParams();
  const path = projectId ? `/audit?projectId=${projectId}&pageSize=100` : '/audit?pageSize=100';

  const { data, isLoading } = useQuery({
    queryKey: ['audit', projectId ?? 'all'],
    queryFn: () => get<Paginated<AuditEventView>>(path),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-ink-900">Activity</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Every approval, override and AI run, attributable and timestamped. Nothing here can be edited or deleted.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No activity yet" body="Actions appear here as soon as anyone changes something." />
      ) : (
        <ol className="card divide-y divide-ink-100">
          {data.items.map((event) => (
            <li key={event.id} className="flex items-start gap-3 px-4 py-3">
              {event.actor ? (
                <Avatar name={event.actor.name} color={event.actor.avatarColor} size={26} />
              ) : (
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink-200 text-[10px] font-bold text-ink-600">
                  SYS
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-800">{event.summary}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={toneFor(event.action)}>{event.action}</Badge>
                  {!projectId && event.project && (
                    <span className="font-mono text-[11px] text-ink-400">{event.project.code}</span>
                  )}
                  <span className="text-[11px] text-ink-400" title={formatDateTime(event.createdAt)}>
                    {relativeTime(event.createdAt)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function toneFor(action: string): 'green' | 'red' | 'amber' | 'violet' | 'neutral' {
  if (action.includes('approved')) return 'green';
  if (action.includes('rejected') || action.includes('failed')) return 'red';
  if (action.startsWith('ai.')) return 'violet';
  if (action.includes('conflict')) return 'amber';
  return 'neutral';
}
