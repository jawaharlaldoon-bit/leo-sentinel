import { describe, expect, it } from 'vitest';
import { runScenario } from '@/lib/scenarios/engine';
import {
  buildDeterministicBrief,
  validateMissionBrief,
  validateScenarioForBrief,
} from './brief';

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
