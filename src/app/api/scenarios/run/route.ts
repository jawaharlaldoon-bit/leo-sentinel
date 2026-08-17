import { NextRequest, NextResponse } from 'next/server';
import {
  runScenario,
  ScenarioValidationError,
} from '@/lib/scenarios/engine';
import type { ScenarioFailure } from '@/lib/scenarios/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return failure('PAYLOAD_TOO_LARGE', 'Request body exceeds 64 KB.', 413);
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return failure('PAYLOAD_TOO_LARGE', 'Request body exceeds 64 KB.', 413);
    }
    const body: unknown = JSON.parse(raw);
    return NextResponse.json(runScenario(body));
  } catch (error) {
    if (error instanceof ScenarioValidationError) {
      return failure('INVALID_SCENARIO_REQUEST', error.message, 400);
    }
    if (error instanceof SyntaxError) {
      return failure('INVALID_JSON', 'Request body must contain valid JSON.', 400);
    }
    return failure('SCENARIO_FAILED', 'The scenario could not be evaluated.', 500);
  }
}

function failure(code: string, message: string, status: number) {
  const body: ScenarioFailure = { error: { code, message } };
  return NextResponse.json(body, { status });
}
