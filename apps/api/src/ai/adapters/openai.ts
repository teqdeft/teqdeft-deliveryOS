import OpenAI from 'openai';
import { env } from '../../env.js';
import type { GatewayRequest, GatewayResponse, ProviderAdapter } from '../types.js';

let client: OpenAI | null = null;
const getClient = () => (client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY }));

export const openaiAdapter: ProviderAdapter = {
  provider: 'OPENAI',

  async run(request: GatewayRequest): Promise<GatewayResponse> {
    const started = Date.now();

    // Responses API, per blueprint §8.4. The same canonical JSON Schema the
    // Anthropic adapter uses goes in here with strict mode on.
    const response = await getClient().responses.create({
      model: request.model,
      max_output_tokens: request.maxOutputTokens,
      instructions: request.system,
      input: request.input,
      reasoning: { effort: request.effort },
      text: {
        format: {
          type: 'json_schema',
          name: request.schemaName,
          schema: request.jsonSchema,
          strict: true,
        },
      },
    });

    // A refusal arrives as a content part inside an output message, not as an
    // exception — the request itself succeeded.
    const refusal = response.output
      .flatMap((item) =>
        'content' in item && Array.isArray(item.content) ? (item.content as { type: string; refusal?: string }[]) : [],
      )
      .find((part) => part.type === 'refusal');

    if (refusal) {
      return {
        text: '',
        provider: 'OPENAI',
        model: response.model,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        latencyMs: Date.now() - started,
        refusal: refusal.refusal ?? 'The model declined this request.',
      };
    }

    if (response.status === 'incomplete') {
      throw new Error(
        `The model stopped early (${response.incomplete_details?.reason ?? 'unknown reason'}). Analyse fewer sources in one run.`,
      );
    }

    return {
      text: response.output_text,
      provider: 'OPENAI',
      model: response.model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
      refusal: null,
    };
  },
};
