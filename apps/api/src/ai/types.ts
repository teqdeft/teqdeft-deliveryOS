import type { AiProvider } from '@deliveryos/shared';

export interface GatewayRequest {
  system: string;
  /** The user turn: instructions plus the fragment-indexed corpus. */
  input: string;
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  effort: 'low' | 'medium' | 'high';
  model: string;
}

export interface GatewayResponse {
  /** Raw JSON text. The gateway never parses; the job validates with Zod. */
  text: string;
  provider: AiProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  /** Set when the model declined the request rather than answering it. */
  refusal: string | null;
}

export interface ProviderAdapter {
  readonly provider: AiProvider;
  run(request: GatewayRequest): Promise<GatewayResponse>;
}
