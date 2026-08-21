/**
 * The Teqdeft mark, redrawn as inline SVG so it stays crisp at any size and
 * inherits the current colour where needed.
 */
export function Logo({ size = 26, showWordmark = true, tone = 'light' }: { size?: number; showWordmark?: boolean; tone?: 'light' | 'dark' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M13.8 4h9.4l-6.4 9.9L23.2 28h-9.4L7 13.9z" fill="#00A8FF" />
        <path d="M13.8 4h9.4l-6.4 9.9L7 13.9z" fill="#33B7FF" />
      </svg>
      {showWordmark && (
        <span className={tone === 'dark' ? 'text-[15px] font-bold tracking-tight text-ink-900' : 'text-[15px] font-bold tracking-tight text-white'}>
          teqdeft
        </span>
      )}
    </span>
  );
}
