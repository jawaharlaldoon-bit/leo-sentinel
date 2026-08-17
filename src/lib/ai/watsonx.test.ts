import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateGraniteBrief,
  resetWatsonxStateForTests,
  WatsonxError,
} from './watsonx';

const originalEnv = { ...process.env };

describe('watsonx failure handling', () => {
  beforeEach(() => {
    process.env.WATSONX_LIVE_ENABLED = 'true';
    process.env.WATSONX_API_KEY = 'test-key';
    process.env.WATSONX_PROJECT_ID = 'test-project';
    resetWatsonxStateForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetWatsonxStateForTests();
  });

  it('classifies IBM authentication failure', async () => {
    const fakeFetch = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    await expect(generateGraniteBrief('brief', fakeFetch)).rejects.toMatchObject({
      code: 'AUTHENTICATION',
    });
  });

  it('classifies free-quota exhaustion', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 429 })) as unknown as typeof fetch;
    await expect(generateGraniteBrief('brief', fakeFetch)).rejects.toMatchObject({
      code: 'QUOTA',
    });
  });

  it('classifies timeout without exposing credentials', async () => {
    const timeoutError = new Error('aborted');
    timeoutError.name = 'AbortError';
    const fakeFetch = vi.fn(async () => {
      throw timeoutError;
    }) as unknown as typeof fetch;
    await expect(generateGraniteBrief('brief', fakeFetch)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});
