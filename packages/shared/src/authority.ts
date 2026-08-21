import { AUTHORITY_RANK, type SourceAuthority } from './enums.js';

export interface AuthorityCandidate {
  sourceId: string;
  authority: SourceAuthority;
  /** Date the statement was *made*, not the date the file was uploaded. */
  statedAt: Date;
}

export type AuthorityOutcome =
  | { decided: true; winner: AuthorityCandidate; reason: string }
  | { decided: false; tied: AuthorityCandidate[]; reason: string };

/**
 * Blueprint §5 defines precedence by document type only. That leaves two cases
 * undecided, and both happen constantly in delivery:
 *
 *   1. Two sources of the *same* type disagree (two client emails).
 *   2. A later source corrects an earlier one of equal standing.
 *
 * So: rank by type first, then break ties by recency. A higher-authority
 * document still beats a newer lower-authority one — a Tuesday email does not
 * override a signed contract. Only a genuine tie (same type, same instant)
 * stays undecided, and an undecided outcome must reach a human rather than be
 * silently resolved (§8 "AI must surface conflicts instead of choosing").
 */
export function resolveAuthority(candidates: AuthorityCandidate[]): AuthorityOutcome {
  if (candidates.length === 0) {
    return { decided: false, tied: [], reason: 'No candidate sources supplied.' };
  }
  if (candidates.length === 1) {
    const only = candidates[0]!;
    return { decided: true, winner: only, reason: 'Only one source supports this statement.' };
  }

  const sorted = [...candidates].sort((a, b) => {
    const byRank = AUTHORITY_RANK[a.authority] - AUTHORITY_RANK[b.authority];
    if (byRank !== 0) return byRank;
    return b.statedAt.getTime() - a.statedAt.getTime();
  });

  const best = sorted[0]!;
  const runnerUp = sorted[1]!;

  const sameRank = AUTHORITY_RANK[best.authority] === AUTHORITY_RANK[runnerUp.authority];
  const sameInstant = best.statedAt.getTime() === runnerUp.statedAt.getTime();

  if (sameRank && sameInstant) {
    const tied = sorted.filter(
      (c) =>
        AUTHORITY_RANK[c.authority] === AUTHORITY_RANK[best.authority] &&
        c.statedAt.getTime() === best.statedAt.getTime(),
    );
    return {
      decided: false,
      tied,
      reason: `${tied.length} sources of equal authority carry the same date. A human must choose.`,
    };
  }

  const reason = sameRank
    ? `Equal authority; the later statement of ${best.statedAt.toISOString().slice(0, 10)} supersedes ${runnerUp.statedAt.toISOString().slice(0, 10)}.`
    : `Higher authority: ${best.authority} outranks ${runnerUp.authority}.`;

  return { decided: true, winner: best, reason };
}

/** True when two sources disagree and the loser is close enough in standing to be worth surfacing. */
export function isContestedAuthority(candidates: AuthorityCandidate[]): boolean {
  if (candidates.length < 2) return false;
  const ranks = candidates.map((c) => AUTHORITY_RANK[c.authority]);
  return Math.max(...ranks) - Math.min(...ranks) <= 1;
}
