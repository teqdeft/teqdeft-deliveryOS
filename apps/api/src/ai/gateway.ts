import type { AiJobType, AiProvider } from '@deliveryos/shared';
import { anthropicAdapter } from './adapters/anthropic.js';
import { openaiAdapter } from './adapters/openai.js';
import { estimateCostUsd, resolvePolicy } from './model-policy.js';
import type { GatewayResponse, ProviderAdapter } from './types.js';
import { logger } from '../lib/logger.js';
import { isProviderError, toProviderError } from './errors.js';

const ADAPTERS: Record<AiProvider, ProviderAdapter> = {
  ANTHROPIC: anthropicAdapter,
  OPENAI: openaiAdapter,
};

export interface GatewayCall {
  jobType: AiJobType;
  provider?: AiProvider | null;
  system: string;
  input: string;
  jsonSchema: Record<string, unknown>;
  schemaName: string;
}

export interface GatewayResult extends GatewayResponse {
  costUsd: number | null;
  attempts: number;
}

/**
 * The single door to any model, for any job (§15.1 "OpenAI Responses API behind
 * an internal AI gateway ... prompts, schemas, citations, policies, telemetry
 * and provider isolation").
 *
 * Nothing above this layer knows which provider ran, and nothing below it
 * touches the database. That separation is what makes the provider swappable
 * and every run auditable.
 */
export async function callModel(call: GatewayCall): Promise<GatewayResult> {
  const policy = resolvePolicy(call.jobType, call.provider);

  if (call.input.length > policy.maxInputChars) {
    throw new Error(
      `This run would send ${Math.round(call.input.length / 1000)}k characters, over the ${Math.round(policy.maxInputChars / 1000)}k limit for ${call.jobType}. Select fewer sources.`,
    );
  }

  const adapter = ADAPTERS[policy.provider];
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await adapter.run({
        system: call.system,
        input: call.input,
        jsonSchema: call.jsonSchema,
        schemaName: call.schemaName,
        maxOutputTokens: policy.maxOutputTokens,
        effort: policy.effort,
        model: policy.model,
      });

      return {
        ...response,
        attempts: attempt,
        costUsd: estimateCostUsd(response.model, response.inputTokens ?? 0, response.outputTokens ?? 0),
      };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;

      const backoffMs = 1000 * 2 ** (attempt - 1);
      logger.warn({ err, attempt, jobType: call.jobType }, `AI call failed, retrying in ${backoffMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // Never let a raw SDK error escape the gateway. Everything above this layer
  // works with typed application errors carrying an actionable message.
  if (isProviderError(lastError)) throw toProviderError(lastError, policy.provider);
  throw lastError;
}

/**
 * Rate limits and transient server errors are worth another attempt. A 400 is
 * our bug — retrying it just spends money to fail three times.
 */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number') return status === 408 || status === 409 || status === 429 || status >= 500;
  const message = String((err as Error)?.message ?? '');
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i.test(message);
}
