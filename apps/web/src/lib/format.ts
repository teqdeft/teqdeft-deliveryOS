import {
  AUTHORITY_LABELS, ENGAGEMENT_TYPE_LABELS, PROJECT_STAGE_LABELS,
  REQUIREMENT_CLASS_LABELS, ROLE_LABELS,
  type EngagementType, type ProjectStage, type RequirementClass, type Role, type SourceAuthority,
} from '@deliveryos/shared';

export const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? r;
export const stageLabel = (s: string) => PROJECT_STAGE_LABELS[s as ProjectStage] ?? s;
export const engagementLabel = (e: string) => ENGAGEMENT_TYPE_LABELS[e as EngagementType] ?? e;
export const authorityLabel = (a: string) => AUTHORITY_LABELS[a as SourceAuthority] ?? a;
export const requirementClassLabel = (c: string) => REQUIREMENT_CLASS_LABELS[c as RequirementClass] ?? c;

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function relativeTime(value: string | Date): string {
  const then = new Date(value).getTime();
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity],
  ];

  let value_ = diffSeconds;
  for (const [unit, step] of units) {
    if (Math.abs(value_) < step) {
      return new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' }).format(Math.round(value_), unit);
    }
    value_ /= step;
  }
  return formatDate(value);
}

export function formatMoney(amount: string | number | null, currency = 'INR'): string {
  if (amount === null) return 'Restricted';
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

/** Days until a date; negative means overdue. */
export function daysUntil(value: string | null): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export const titleCase = (value: string) =>
  value.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
