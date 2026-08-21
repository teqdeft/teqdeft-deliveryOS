import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';
import { healthPalette, type HealthState } from '@deliveryos/shared';

/* ------------------------------ Button ------------------------------ */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:bg-brand-700',
        variant === 'secondary' && 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 hover:text-ink-900',
        variant === 'ghost' && 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
        variant === 'danger' && 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------ Badge ------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'violet';
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4',
        tone === 'neutral' && 'bg-ink-100 text-ink-600',
        tone === 'brand' && 'bg-brand-50 text-brand-700',
        tone === 'green' && 'bg-emerald-50 text-emerald-700',
        tone === 'amber' && 'bg-amber-50 text-amber-700',
        tone === 'red' && 'bg-red-50 text-red-700',
        tone === 'violet' && 'bg-violet-50 text-violet-700',
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------- Health pill ---------------------------- */

export function HealthPill({ health, size = 'md' }: { health: HealthState; size?: 'sm' | 'md' }) {
  const palette = healthPalette[health];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      )}
      style={{ color: palette.fg, backgroundColor: palette.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.dot }} aria-hidden />
      {health.charAt(0) + health.slice(1).toLowerCase()}
    </span>
  );
}

/* ----------------------------- Avatar ------------------------------- */

export function Avatar({ name, color, size = 28 }: { name: string; color?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: color ?? '#4A5768', fontSize: size * 0.4 }}
      title={name}
    >
      {initials}
    </span>
  );
}

/* ------------------------- Empty & loading -------------------------- */

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      <p className="mt-1 max-w-md text-sm text-ink-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className={clsx('rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800', className)} role="alert">
      {message}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}) {
  // Escape closes, and the page behind must not scroll while a dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:p-8">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative z-10 my-auto w-full animate-fade-in rounded-xl bg-white shadow-panel',
          width === 'md' && 'max-w-lg',
          width === 'lg' && 'max-w-2xl',
          width === 'xl' && 'max-w-4xl',
        )}
      >
        <header className="flex items-start gap-4 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          {/* A long dialog must be dismissible without scrolling to the bottom. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------- Field & Section ------------------------ */

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-brand-600">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </label>
  );
}

export function SectionHeading({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        {title}
        {count !== undefined && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-500">{count}</span>}
      </h2>
      {action}
    </div>
  );
}
