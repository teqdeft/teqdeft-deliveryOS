import type { AiJobType, AiProvider } from '@deliveryos/shared';
import { env } from '../env.js';

export interface ModelPolicy {
  provider: AiProvider;
  model: string;
  maxOutputTokens: number;
  /** Reasoning depth. Anthropic maps this to output_config.effort; OpenAI to reasoning.effort. */
  effort: 'low' | 'medium' | 'high';
  /** Per-run input ceiling — the first line of defence on §19 "AI costs grow without value". */
  maxInputChars: number;
}

/**
 * Blueprint §8.4: "Maintain a model policy by job type rather than hard-coding
 * one model throughout the product."
 *
 * Extraction is the job where a mistake is most expensive — a missed promise
 * becomes unbilled scope months later — so it gets the most capable model and
 * the highest effort. Status drafts and daily agendas are cheap, high-volume
 * and human-reviewed, so they run smaller.
 */
const ANTHROPIC_POLICY: Record<AiJobType, ModelPolicy> = {
  REQUIREMENT_EXTRACTION: { provider: 'ANTHROPIC', model: 'claude-opus-5', maxOutputTokens: 64_000, effort: 'high', maxInputChars: 400_000 },
  CONFLICT_DETECTION:     { provider: 'ANTHROPIC', model: 'claude-opus-5', maxOutputTokens: 32_000, effort: 'high', maxInputChars: 400_000 },
  SCOPE_COMPARISON:       { provider: 'ANTHROPIC', model: 'claude-opus-5', maxOutputTokens: 16_000, effort: 'high', maxInputChars: 200_000 },
  PLAN_GENERATION:        { provider: 'ANTHROPIC', model: 'claude-opus-5', maxOutputTokens: 32_000, effort: 'high', maxInputChars: 200_000 },
  RISK_MONITOR:           { provider: 'ANTHROPIC', model: 'claude-sonnet-5', maxOutputTokens: 16_000, effort: 'medium', maxInputChars: 120_000 },
  QA_SUGGESTION:          { provider: 'ANTHROPIC', model: 'claude-sonnet-5', maxOutputTokens: 16_000, effort: 'medium', maxInputChars: 120_000 },
  PROJECT_MEMORY:         { provider: 'ANTHROPIC', model: 'claude-sonnet-5', maxOutputTokens: 16_000, effort: 'medium', maxInputChars: 200_000 },
  DAILY_AGENDA:           { provider: 'ANTHROPIC', model: 'claude-sonnet-5', maxOutputTokens: 8_000,  effort: 'low',    maxInputChars: 80_000 },
  STATUS_DRAFT:           { provider: 'ANTHROPIC', model: 'claude-sonnet-5', maxOutputTokens: 8_000,  effort: 'low',    maxInputChars: 80_000 },
};

const OPENAI_POLICY: Record<AiJobType, ModelPolicy> = Object.fromEntries(
  (Object.keys(ANTHROPIC_POLICY) as AiJobType[]).map((job) => {
    const base = ANTHROPIC_POLICY[job];
    return [
      job,
      {
        ...base,
        provider: 'OPENAI' as const,
        model: base.effort === 'low' ? 'gpt-5-mini' : 'gpt-5',
      },
    ];
  }),
) as Record<AiJobType, ModelPolicy>;

export function hasKeyFor(provider: AiProvider): boolean {
  return provider === 'ANTHROPIC' ? Boolean(env.ANTHROPIC_API_KEY) : Boolean(env.OPENAI_API_KEY);
}

/**
 * Resolves the policy for a job, honouring an explicit per-run override and
 * falling back to whichever provider actually has a key. A run must never fail
 * because the *configured* provider is unconfigured while the other is ready.
 */
export function resolvePolicy(jobType: AiJobType, requested?: AiProvider | null): ModelPolicy {
  const preferred = requested ?? env.AI_DEFAULT_PROVIDER;
  const chosen: AiProvider = hasKeyFor(preferred)
    ? preferred
    : preferred === 'ANTHROPIC'
      ? 'OPENAI'
      : 'ANTHROPIC';

  if (!hasKeyFor(chosen)) {
    throw new Error('No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  const policy = chosen === 'ANTHROPIC' ? ANTHROPIC_POLICY[jobType] : OPENAI_POLICY[jobType];
  return { ...policy, maxInputChars: Math.min(policy.maxInputChars, env.AI_MAX_INPUT_CHARS) };
}

/**
 * Published $/1M rates, used for the cost column on the AI usage dashboard.
 * A stale rate here makes the dashboard wrong, never the extraction — cost is
 * recorded for oversight, not charged to anyone.
 */
const RATES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const rate = RATES[model];
  if (!rate) return null;
  return Number(((inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output).toFixed(4));
}
