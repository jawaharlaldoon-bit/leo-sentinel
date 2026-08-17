import { NextRequest, NextResponse } from 'next/server';
import { ApiInputError, aiFailure, clientAddress, readLimitedJson } from '@/lib/ai/api-utils';
import { getCached, setCached, stableHash } from '@/lib/ai/cache';
import { loadFleetForecastInput } from '@/lib/ai/fleet-data';
import { applyGraniteForecast, buildDeterministicForecast } from '@/lib/ai/forecast';
import { checkRateLimit } from '@/lib/ai/rate-limit';
import type { FleetForecast } from '@/lib/ai/types';
import { generateGraniteForecast, isLiveWatsonxEnabled } from '@/lib/ai/watsonx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`forecast:${clientAddress(request)}`, 6);
  if (!limit.allowed) {
    return aiFailure('RATE_LIMITED', `Try again in ${limit.retryAfterSeconds} seconds.`, 429);
  }

  try {
    const body = (await readLimitedJson(request)) as { refresh?: boolean };
    if (body.refresh !== undefined && typeof body.refresh !== 'boolean') {
      throw new ApiInputError('INVALID_FORECAST_REQUEST', 'refresh must be a boolean.', 400);
    }
    const { observations, source } = await loadFleetForecastInput();
    const datasetVersion = stableHash(observations);
    const key = `forecast:${datasetVersion}`;
    const cached = getCached<FleetForecast>(key);
    if (cached && !body.refresh) return NextResponse.json({ ...cached, mode: 'cache', source });

    const fallback = buildDeterministicForecast(observations, 'fallback');
    const refreshAuthorized =
      process.env.NODE_ENV === 'development' ||
      (Boolean(process.env.WATSONX_FORECAST_REFRESH_TOKEN) &&
        request.headers.get('x-forecast-refresh-token') === process.env.WATSONX_FORECAST_REFRESH_TOKEN);

    if (body.refresh && refreshAuthorized && isLiveWatsonxEnabled() && source === 'hugging-face-dataset') {
      try {
        const graniteResponse = await generateGraniteForecast(observations);
        const live = applyGraniteForecast(fallback, graniteResponse);
        setCached(key, live, 7 * 24 * 60 * 60 * 1000);
        return NextResponse.json({ ...live, source });
      } catch {
        // Never let an IBM authentication, timeout, or quota failure break Fleet.
      }
    }

    setCached(key, fallback, 7 * 24 * 60 * 60 * 1000);
    return NextResponse.json({ ...fallback, source });
  } catch (error) {
    if (error instanceof ApiInputError) return aiFailure(error.code, error.message, error.status);
    return aiFailure('FORECAST_FAILED', 'The forecast could not be prepared.', 500);
  }
}
