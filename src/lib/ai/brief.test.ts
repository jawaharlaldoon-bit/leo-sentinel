import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { runScenario } from '@/lib/scenarios/engine';
import {
  buildDeterministicBrief,
  validateMissionBrief,
  validateScenarioForBrief,
} from './brief';
import { clearAiCacheForTests } from './cache';
import { clearRateLimitsForTests } from './rate-limit';

// Mock only the watsonx inference call — keeps all other brief logic real.
vi.mock('@/lib/ai/watsonx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/watsonx')>();
  return { ...actual };
});

const scenario = runScenario({
  scenarioId: 'north-atlantic-gateway-outage',
  observer: { lat: 52, lon: -25 },
  timestamp: '2026-08-16T12:00:00.000Z',
  disabledSatelliteNoradIds: [],
  disabledGroundStationIds: [],
  objective: 'resilience',
});

describe('mission brief grounding', () => {
  it('builds a schema-valid deterministic fallback', () => {
    const brief = buildDeterministicBrief(scenario);
    expect(validateMissionBrief(brief, scenario.evidence)).toEqual(brief);
    expect(brief.findings.every((finding) => finding.evidenceIds.length > 0)).toBe(true);
  });

  it('rejects unsupported evidence IDs', () => {
    const brief = buildDeterministicBrief(scenario);
    brief.findings[0].evidenceIds = ['invented-evidence'];
    expect(() => validateMissionBrief(brief, scenario.evidence)).toThrow('unsupported claim');
  });

  it('rejects malformed Granite output', () => {
    expect(() => validateMissionBrief({ riskLevel: 'watch' }, scenario.evidence)).toThrow();
  });

  it('rejects invalid scenario evidence before sending it to AI', () => {
    expect(() =>
      validateScenarioForBrief({
        ...scenario,
        evidence: [...scenario.evidence, scenario.evidence[0]],
      }),
    ).toThrow('duplicate evidence');
  });
});

describe('brief route retry behaviour', () => {
  beforeEach(() => {
    clearAiCacheForTests();
    clearRateLimitsForTests();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to deterministic brief on QUOTA without a second IBM call', async () => {
    // Import the watsonx module so we can spy on generateGraniteBrief.
    const watsonx = await import('@/lib/ai/watsonx');
    // Simulate watsonx enabled but IBM returns quota error.
    vi.spyOn(watsonx, 'isLiveWatsonxEnabled').mockReturnValue(true);
    const spy = vi
      .spyOn(watsonx, 'generateGraniteBrief')
      .mockRejectedValue(new watsonx.WatsonxError('quota exhausted', 'QUOTA'));

    // Import the route handler after spies are in place.
    const { POST } = await import('@/app/api/ai/brief/route');
    const body = JSON.stringify({ scenario });
    const request = new NextRequest('http://localhost/api/ai/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length) },
      body,
    });

    const response = await POST(request);
    const data = await response.json() as { mode: string };

    // Must fall back to deterministic — mode is 'fallback', not an error.
    expect(response.status).toBe(200);
    expect(data.mode).toBe('fallback');
    // QUOTA is non-transient: the route must call IBM exactly once, not twice.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
