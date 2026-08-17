import { GRANITE_BRIEF_MODEL_ID, GRANITE_TTM_MODEL_ID } from './types';
import type { ForecastObservation } from './types';

const DEFAULT_URL = 'https://us-south.ml.cloud.ibm.com';
const IAM_URL = 'https://iam.cloud.ibm.com/identity/token';
const UPSTREAM_TIMEOUT_MS = 20_000;

interface IamToken {
  token: string;
  expiresAt: number;
}

let iamToken: IamToken | null = null;

export class WatsonxError extends Error {
  constructor(
    message: string,
    readonly code: 'CONFIGURATION' | 'AUTHENTICATION' | 'TIMEOUT' | 'QUOTA' | 'UPSTREAM' | 'MALFORMED',
  ) {
    super(message);
  }
}

export function isLiveWatsonxEnabled(): boolean {
  return (
    process.env.WATSONX_LIVE_ENABLED === 'true' &&
    Boolean(process.env.WATSONX_API_KEY) &&
    Boolean(process.env.WATSONX_PROJECT_ID)
  );
}

export async function generateGraniteBrief(
  prompt: string,
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  assertConfigured();
  const response = await watsonxRequest(
    '/ml/v1/text/chat?version=2025-10-25',
    {
      model_id: process.env.WATSONX_CHAT_MODEL ?? GRANITE_BRIEF_MODEL_ID,
      project_id: process.env.WATSONX_PROJECT_ID,
      messages: [
        { role: 'system', content: 'Return strictly valid JSON. Never add unsupported claims.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_completion_tokens: 1000,
      response_format: { type: 'json_object' },
    },
    fetchFn,
  );
  const content = extractChatContent(response);
  try {
    return JSON.parse(stripJsonFence(content));
  } catch {
    throw new WatsonxError('Granite returned malformed JSON.', 'MALFORMED');
  }
}

export async function generateGraniteForecast(
  observations: ForecastObservation[],
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  assertConfigured();
  const columns = ['operational', 'islCapable', 'raising', 'deorbiting', 'anomalous'] as const;
  return watsonxRequest(
    '/ml/v1/time_series/forecast?version=2025-02-10',
    {
      model_id: process.env.WATSONX_TTM_MODEL ?? GRANITE_TTM_MODEL_ID,
      project_id: process.env.WATSONX_PROJECT_ID,
      schema: {
        timestamp_column: 'date',
        target_columns: columns,
        freq: '1D',
      },
      data: {
        date: observations.map((point) => `${point.date}T00:00:00+0000`),
        ...Object.fromEntries(columns.map((column) => [column, observations.map((point) => point[column])])),
      },
      prediction_length: 96,
    },
    fetchFn,
  );
}

async function watsonxRequest(path: string, body: unknown, fetchFn: typeof fetch): Promise<unknown> {
  const token = await getIamToken(fetchFn);
  const response = await fetchWithRetry(
    `${(process.env.WATSONX_URL ?? DEFAULT_URL).replace(/\/$/, '')}${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
    fetchFn,
  );
  if (!response.ok) throw classifyResponse(response.status);
  return response.json();
}

async function getIamToken(fetchFn: typeof fetch): Promise<string> {
  if (iamToken && iamToken.expiresAt > Date.now() + 60_000) return iamToken.token;
  const apiKey = process.env.WATSONX_API_KEY;
  if (!apiKey) throw new WatsonxError('watsonx credentials are not configured.', 'CONFIGURATION');

  const response = await fetchWithRetry(
    IAM_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: apiKey,
      }).toString(),
    },
    fetchFn,
  );
  if (!response.ok) throw new WatsonxError('IBM IAM authentication failed.', 'AUTHENTICATION');
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new WatsonxError('IBM IAM returned no access token.', 'AUTHENTICATION');
  iamToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return iamToken.token;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetchFn(url, { ...init, signal: controller.signal });
      if (response.ok || response.status < 500 || attempt === 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        if ((error as Error)?.name === 'AbortError') {
          throw new WatsonxError('watsonx request timed out.', 'TIMEOUT');
        }
        throw new WatsonxError('watsonx request failed.', 'UPSTREAM');
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof WatsonxError
    ? lastError
    : new WatsonxError('watsonx request failed.', 'UPSTREAM');
}

function classifyResponse(status: number): WatsonxError {
  if (status === 401 || status === 403) return new WatsonxError('watsonx authorization failed.', 'AUTHENTICATION');
  if (status === 402 || status === 429) return new WatsonxError('watsonx free allowance is unavailable.', 'QUOTA');
  return new WatsonxError('watsonx returned an upstream error.', 'UPSTREAM');
}

function extractChatContent(value: unknown): string {
  const response = value as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    results?: Array<{ generated_text?: string }>;
  };
  const rawContent = response.choices?.[0]?.message?.content ?? response.results?.[0]?.generated_text;
  const content = Array.isArray(rawContent)
    ? rawContent.map((item) => item.text ?? '').join('')
    : rawContent;
  if (!content) throw new WatsonxError('Granite returned no response content.', 'MALFORMED');
  return content;
}

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function assertConfigured(): void {
  if (!isLiveWatsonxEnabled()) {
    throw new WatsonxError('Live watsonx inference is disabled.', 'CONFIGURATION');
  }
}

export function resetWatsonxStateForTests(): void {
  iamToken = null;
}
