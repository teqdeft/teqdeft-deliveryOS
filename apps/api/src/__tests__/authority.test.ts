import { describe, expect, it } from 'vitest';
import { resolveAuthority, isContestedAuthority } from '@deliveryos/shared';

const at = (iso: string) => new Date(iso);

describe('resolveAuthority', () => {
  it('prefers the higher-authority document regardless of date', () => {
    const outcome = resolveAuthority([
      { sourceId: 'email', authority: 'CLIENT_EMAIL', statedAt: at('2026-06-01') },
      { sourceId: 'contract', authority: 'SIGNED_CONTRACT', statedAt: at('2026-01-01') },
    ]);

    expect(outcome.decided).toBe(true);
    if (outcome.decided) {
      expect(outcome.winner.sourceId).toBe('contract');
      expect(outcome.reason).toContain('Higher authority');
    }
  });

  // The gap in blueprint §5: type-only precedence cannot decide this.
  it('breaks a same-authority tie on recency', () => {
    const outcome = resolveAuthority([
      { sourceId: 'older', authority: 'CLIENT_EMAIL', statedAt: at('2026-03-01') },
      { sourceId: 'newer', authority: 'CLIENT_EMAIL', statedAt: at('2026-05-01') },
    ]);

    expect(outcome.decided).toBe(true);
    if (outcome.decided) {
      expect(outcome.winner.sourceId).toBe('newer');
      expect(outcome.reason).toContain('supersedes');
    }
  });

  it('does not let a newer low-authority source override a signed contract', () => {
    const outcome = resolveAuthority([
      { sourceId: 'note', authority: 'INTERNAL_NOTE', statedAt: at('2026-08-01') },
      { sourceId: 'contract', authority: 'SIGNED_CONTRACT', statedAt: at('2026-01-01') },
    ]);

    expect(outcome.decided && outcome.winner.sourceId).toBe('contract');
  });

  // §8: "AI must surface conflicts instead of choosing silently."
  it('refuses to decide a genuine tie', () => {
    const sameInstant = at('2026-04-01T10:00:00Z');
    const outcome = resolveAuthority([
      { sourceId: 'a', authority: 'CLIENT_EMAIL', statedAt: sameInstant },
      { sourceId: 'b', authority: 'CLIENT_EMAIL', statedAt: sameInstant },
    ]);

    expect(outcome.decided).toBe(false);
    if (!outcome.decided) {
      expect(outcome.tied).toHaveLength(2);
      expect(outcome.reason).toContain('human');
    }
  });

  it('handles a single candidate and an empty set', () => {
    const single = resolveAuthority([{ sourceId: 'only', authority: 'BRIEF' as never, statedAt: at('2026-01-01') }]);
    expect(single.decided).toBe(true);
    expect(resolveAuthority([]).decided).toBe(false);
  });
});

describe('isContestedAuthority', () => {
  it('flags adjacent-rank disagreements as worth surfacing', () => {
    expect(
      isContestedAuthority([
        { sourceId: 'a', authority: 'CALL_TRANSCRIPT', statedAt: at('2026-01-01') },
        { sourceId: 'b', authority: 'CLIENT_EMAIL', statedAt: at('2026-01-02') },
      ]),
    ).toBe(true);
  });

  it('does not flag a contract against an internal note', () => {
    expect(
      isContestedAuthority([
        { sourceId: 'a', authority: 'SIGNED_CONTRACT', statedAt: at('2026-01-01') },
        { sourceId: 'b', authority: 'INTERNAL_NOTE', statedAt: at('2026-01-02') },
      ]),
    ).toBe(false);
  });
});
