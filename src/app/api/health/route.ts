import { NextResponse } from 'next/server';
import { GRANITE_BRIEF_MODEL_ID, GRANITE_TTM_MODEL_ID } from '@/lib/ai/types';
import { isLiveWatsonxEnabled } from '@/lib/ai/watsonx';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    application: 'LEO Sentinel',
    demoMode: process.env.DEMO_MODE === 'true',
    watsonx: {
      liveEnabled: isLiveWatsonxEnabled(),
      fallbackReady: true,
      models: [GRANITE_TTM_MODEL_ID, GRANITE_BRIEF_MODEL_ID],
    },
    costGuardrails: {
      paidInfrastructureRequired: false,
      forecastLiveRefresh: 'development-or-admin-only',
    },
  });
}
