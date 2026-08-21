import { NavLink, Outlet, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Logo } from '../components/Logo.js';
import { Avatar, Button } from '../components/ui.js';
import { useSession } from '../lib/session.js';
import { roleLabel } from '../lib/format.js';

const PORTFOLIO_NAV = [
  { to: '/', label: 'Home', end: true, icon: HomeIcon },
  { to: '/projects', label: 'Projects', icon: GridIcon },
  { to: '/audit', label: 'Activity', icon: ClockIcon },
];

/** Blueprint §9 project workspace tabs (PJ-02 … PJ-21). */
const PROJECT_NAV = [
  { segment: '', label: 'Overview', end: true },
  { segment: 'knowledge', label: 'Knowledge' },
  { segment: 'analysis', label: 'AI analysis' },
  { segment: 'requirements', label: 'Requirements' },
  { segment: 'conflicts', label: 'Conflicts' },
  { segment: 'baseline', label: 'Scope baseline' },
  { segment: 'activity', label: 'Activity' },
];

export function AppShell() {
  const { session, signOut } = useSession();
  const { projectId } = useParams();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-900">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="hidden text-[13px] font-medium text-ink-400 sm:inline">Delivery OS</span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {PORTFOLIO_NAV.map(({ to, label, end, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition',
                    isActive ? 'bg-ink-800 text-white' : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-100',
                  )
                }
              >
                <Icon />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium leading-tight text-white">{session?.user.name}</p>
              <p className="text-[11px] leading-tight text-ink-400">{roleLabel(session?.user.role ?? '')}</p>
            </div>
            <Avatar name={session?.user.name ?? '?'} color={session?.user.avatarColor} size={30} />
            <Button variant="ghost" size="sm" onClick={() => void signOut()} className="!text-ink-400 hover:!bg-ink-800 hover:!text-white">
              Sign out
            </Button>
          </div>
        </div>

        {projectId && (
          <div className="border-t border-ink-800 bg-ink-900">
            <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 sm:px-6">
              {PROJECT_NAV.map(({ segment, label, end }) => (
                <NavLink
                  key={label}
                  to={`/projects/${projectId}${segment ? `/${segment}` : ''}`}
                  end={end}
                  className={({ isActive }) =>
                    clsx(
                      'whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition',
                      isActive
                        ? 'border-brand-500 text-white'
                        : 'border-transparent text-ink-400 hover:border-ink-700 hover:text-ink-100',
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="10" cy="10" r="7.25" /><path d="M10 5.75V10l2.75 1.75" strokeLinecap="round" />
    </svg>
  );
}
