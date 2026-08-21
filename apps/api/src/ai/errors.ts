import { AppError } from '../lib/errors.js';

/**
 * Translates a provider SDK failure into something a project manager can act
 * on.
 *
 * Blueprint §16 requires graceful degradation when the AI provider is
 * unavailable. Degrading gracefully is not only about the button being
 * disabled — when a run does fail, the person who pressed the button needs to
 * know whether to retry, call an admin, or give up, and a raw SDK message
 * inside a 500 tells them none of that.
 */
export function toProviderError(err: unknown, provider: 'ANTHROPIC' | 'OPENAI'): AppError {
  const name = provider === 'ANTHROPIC' ? 'Anthropic' : 'OpenAI';
  const keyVar = provider === 'ANTHROPIC' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? err);

  // Reached before any HTTP status: DNS, TLS, a proxy refusing CONNECT, or an
  // egress allowlist. All of them mean "this server cannot talk to the
  // provider", which is an infrastructure fix, not a retry.
  if (
    /Host not in allowlist|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CONNECT tunnel|self.signed certificate|unable to verify/i.test(
      message,
    )
  ) {
    return new AppError(
      502,
      'AI_UNREACHABLE',
      `This server cannot reach ${name}. The host is blocked by the network, not by your permissions — an administrator needs to allow outbound access to the ${name} API.`,
    );
  }

  if (status === 401 || status === 403) {
    return new AppError(
      502,
      'AI_UNAUTHORIZED',
      `${name} rejected the API key. Check ${keyVar} on the server — analysis stays disabled until it is valid.`,
    );
  }

  if (status === 429) {
    return new AppError(
      429,
      'AI_RATE_LIMITED',
      `${name} is rate limiting this account. Wait a minute and run the analysis again; nothing was saved.`,
    );
  }

  if (status === 402 || /quota|billing|insufficient_quota/i.test(message)) {
    return new AppError(
      502,
      'AI_QUOTA_EXHAUSTED',
      `The ${name} account has no remaining quota. Nothing was charged and nothing was saved.`,
    );
  }

  if (typeof status === 'number' && status >= 500) {
    return new AppError(
      502,
      'AI_PROVIDER_ERROR',
      `${name} returned a server error. This is usually temporary — try the analysis again in a few minutes.`,
    );
  }

  if (/timed out|ETIMEDOUT|aborted/i.test(message)) {
    return new AppError(
      504,
      'AI_TIMEOUT',
      `The ${name} request timed out. Select fewer sources and run the analysis again.`,
    );
  }

  if (status === 400) {
    return new AppError(
      502,
      'AI_REQUEST_REJECTED',
      `${name} rejected the request as malformed. This is a bug on our side, not something you can fix — the run was recorded so it can be diagnosed.`,
    );
  }

  return new AppError(
    502,
    'AI_PROVIDER_ERROR',
    `${name} could not complete this analysis. Nothing was saved. If it keeps happening, check the AI run history for the recorded error.`,
  );
}

/** True when the failure came from the provider rather than from our own code. */
export function isProviderError(err: unknown): boolean {
  const message = String((err as Error)?.message ?? err);
  const status = (err as { status?: number })?.status;
  return (
    typeof status === 'number' ||
    /Host not in allowlist|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CONNECT tunnel|timed out|ETIMEDOUT|fetch failed|socket hang up/i.test(
      message,
    )
  );
}
