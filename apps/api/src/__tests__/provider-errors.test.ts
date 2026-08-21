import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors.js';
import { isProviderError, toProviderError } from '../ai/errors.js';

/**
 * A failed analysis must tell the person who pressed the button what to do
 * next. These assertions are about the message, not just the status code —
 * "INTERNAL_ERROR" is a correct-looking 500 that helps nobody.
 */
describe('toProviderError', () => {
  const classify = (err: unknown) => toProviderError(err, 'OPENAI');

  it('names an egress block as an infrastructure problem, not a permissions one', () => {
    const result = classify(new Error('403 Host not in allowlist: api.openai.com.'));
    expect(result).toBeInstanceOf(AppError);
    expect(result.status).toBe(502);
    expect(result.code).toBe('AI_UNREACHABLE');
    expect(result.message).toContain('blocked by the network, not by your permissions');
  });

  it('points a rejected key at the environment variable to fix', () => {
    const result = classify(Object.assign(new Error('Incorrect API key provided'), { status: 401 }));
    expect(result.code).toBe('AI_UNAUTHORIZED');
    expect(result.message).toContain('OPENAI_API_KEY');
  });

  it('tells the user a rate limit is worth retrying and cost nothing', () => {
    const result = classify(Object.assign(new Error('Rate limit reached'), { status: 429 }));
    expect(result.status).toBe(429);
    expect(result.message).toMatch(/again/i);
    expect(result.message).toMatch(/nothing was saved/i);
  });

  it('separates an exhausted quota from a rate limit', () => {
    const result = classify(Object.assign(new Error('You exceeded your current quota'), { status: 400 }));
    expect(result.code).toBe('AI_QUOTA_EXHAUSTED');
  });

  it('marks a provider 5xx as temporary', () => {
    const result = classify(Object.assign(new Error('Bad gateway'), { status: 503 }));
    expect(result.code).toBe('AI_PROVIDER_ERROR');
    expect(result.message).toMatch(/temporary/i);
  });

  it('suggests a smaller run on a timeout', () => {
    const result = classify(new Error('Request timed out'));
    expect(result.status).toBe(504);
    expect(result.message).toMatch(/fewer sources/i);
  });

  it('owns a malformed request as our bug rather than blaming the user', () => {
    const result = classify(Object.assign(new Error('Invalid schema'), { status: 400 }));
    expect(result.code).toBe('AI_REQUEST_REJECTED');
    expect(result.message).toMatch(/bug on our side/i);
  });

  it('names the right provider and key for Anthropic', () => {
    const result = toProviderError(Object.assign(new Error('unauthorized'), { status: 401 }), 'ANTHROPIC');
    expect(result.message).toContain('Anthropic');
    expect(result.message).toContain('ANTHROPIC_API_KEY');
  });

  it('always returns an AppError, never leaks the raw message', () => {
    const result = classify(new Error('some totally unexpected internal failure'));
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).not.toContain('totally unexpected');
  });
});

describe('isProviderError', () => {
  it('recognises transport failures that never reached a status code', () => {
    for (const message of ['ENOTFOUND api.openai.com', 'fetch failed', 'socket hang up', 'CONNECT tunnel failed']) {
      expect(isProviderError(new Error(message))).toBe(true);
    }
  });

  it('does not claim our own programming errors', () => {
    expect(isProviderError(new TypeError('x is not a function'))).toBe(false);
  });
});
