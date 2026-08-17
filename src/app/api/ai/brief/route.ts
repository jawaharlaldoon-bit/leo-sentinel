import { NextRequest, NextResponse } from 'next/server';
import { ApiInputError, aiFailure, clientAddress, readLimitedJson } from '@/lib/ai/api-utils';
import {
  BriefValidationError,
  buildBriefPrompt,
  buildDeterministicBrief,
  scenarioCacheKey,
  validateMissionBrief,
  validateScenarioForBrief,
} from '@/lib/ai/brief';
import { getCached, setCached } from '@/lib/ai/cache';
import { checkRateLimit } from '@/lib/ai/rate-limit';
import type { MissionBriefResponse } from '@/lib/ai/types';
import { generateGraniteBrief, isLiveWatsonxEnabled, WatsonxError } from '@/lib/ai/watsonx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(`brief:${clientAddress(request)}`, 8);
  if (!limit.allowed) {
    return aiFailure('RATE_LIMITED', `Try again in ${limit.retryAfterSeconds} seconds.`, 429);
  }

  try {
    const body = (await readLimitedJson(request)) as { scenario?: unknown };
    const scenario = validateScenarioForBrief(body.scenario);
    const cacheKey = scenarioCacheKey(scenario);
    const cached = getCached<MissionBriefResponse>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, mode: 'cache' });

    if (isLiveWatsonxEnabled()) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const generated = await generateGraniteBrief(buildBriefPrompt(scenario));
          const brief = validateMissionBrief(generated, scenario.evidence);
          const response: MissionBriefResponse = {
            brief,
            mode: 'live',
            cacheKey,
            evidence: scenario.evidence,
          };
          setCached(cacheKey, response);
          return NextResponse.json(response);
        } catch (error) {
          // Only retry on MALFORMED (bad JSON from the model) or UPSTREAM (transient 5xx).
          // Non-transient codes — AUTHENTICATION, QUOTA, CONFIGURATION, TIMEOUT — are
          // permanent for this request; fall through immediately to the deterministic brief.
          if (error instanceof WatsonxError && error.code !== 'MALFORMED' && error.code !== 'UPSTREAM') {
            break;
          }
        }
      }
    }

    const response: MissionBriefResponse = {
      brief: buildDeterministicBrief(scenario),
      mode: 'fallback',
      cacheKey,
      evidence: scenario.evidence,
    };
    setCached(cacheKey, response);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ApiInputError) return aiFailure(error.code, error.message, error.status);
    if (error instanceof BriefValidationError) return aiFailure('INVALID_BRIEF_REQUEST', error.message, 400);
    return aiFailure('BRIEF_FAILED', 'The mission brief could not be prepared.', 500);
  }
}
