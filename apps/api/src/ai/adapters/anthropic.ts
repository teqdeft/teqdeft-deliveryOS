import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../env.js';
import type { GatewayRequest, GatewayResponse, ProviderAdapter } from '../types.js';

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

export const anthropicAdapter: ProviderAdapter = {
  provider: 'ANTHROPIC',

  async run(request: GatewayRequest): Promise<GatewayResponse> {
    const started = Date.now();

    // Streaming is not cosmetic here: a full proposal plus transcripts against
    // a 64k output ceiling runs well past the SDK's non-streaming HTTP timeout.
    const stream = getClient().messages.stream({
      model: request.model,
      max_tokens: request.maxOutputTokens,
      system: [
        {
          type: 'text',
          text: request.system,
          // The system prompt and schema are identical across every run on
          // every project, so caching them makes re-analysis materially
          // cheaper (§19 AI cost control).
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        effort: request.effort,
        format: { type: 'json_schema', schema: request.jsonSchema },
      },
      messages: [{ role: 'user', content: request.input }],
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      return {
        text: '',
        provider: 'ANTHROPIC',
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        latencyMs: Date.now() - started,
        refusal: message.stop_details?.explanation ?? 'The model declined to process these documents.',
      };
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (message.stop_reason === 'max_tokens') {
      // Truncated JSON is unparseable, and silently returning half an
      // extraction would look like "the documents only said this much".
      throw new Error(
        `The model hit its ${request.maxOutputTokens}-token output limit before finishing. Analyse fewer sources in one run.`,
      );
    }

    return {
      text,
      provider: 'ANTHROPIC',
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      latencyMs: Date.now() - started,
      refusal: null,
    };
  },
};
