import { describe, expect, it } from 'vitest';
import { runScenario, validateScenarioRequest } from './engine';

const baseRequest = {
  scenarioId: 'north-atlantic-gateway-outage',
  observer: { lat: 52, lon: -25 },
  timestamp: '2026-08-16T12:00:00.000Z',
  disabledSatelliteNoradIds: [],
  disabledGroundStationIds: [],
  objective: 'resilience' as const,
};

describe('scenario engine', () => {
  it('reroutes after the predefined gateway removal', () => {
    const result = runScenario(baseRequest);

    expect(result.baselineRoute?.groundStationId).toBe('gs-ballinspittle-ie');
    expect(result.degradedRoute?.groundStationId).toBe('gs-goonhilly-uk');
    expect(result.rerouteAvailable).toBe(true);
    expect(result.latencyDeltaMs).toBeGreaterThan(0);
    expect(result.hopDelta).toBeGreaterThan(0);
  });

  it('reports no route when both gateways are removed', () => {
    const result = runScenario({
      ...baseRequest,
      disabledGroundStationIds: ['gs-goonhilly-uk'],
    });

    expect(result.degradedRoute).toBeNull();
    expect(result.rerouteAvailable).toBe(false);
    expect(result.riskScore).toBe(100);
  });

  it('handles satellite removal and multiple disabled assets', () => {
    const result = runScenario({
      ...baseRequest,
      disabledSatelliteNoradIds: ['sat-57002'],
      disabledGroundStationIds: ['gs-goonhilly-uk'],
    });

    expect(result.affectedAssets).toEqual([
      'gs-ballinspittle-ie',
      'gs-goonhilly-uk',
      'sat-57002',
    ]);
    expect(result.degradedRoute).toBeNull();
  });

  it('is deterministic for the same timestamp and inputs', () => {
    expect(runScenario(baseRequest)).toEqual(runScenario(baseRequest));
  });

  it('raises the risk score when redundancy is lost', () => {
    const available = runScenario(baseRequest);
    const unavailable = runScenario({
      ...baseRequest,
      disabledGroundStationIds: ['gs-goonhilly-uk'],
    });

    expect(available.riskScore).toBeLessThan(unavailable.riskScore);
  });

  it('validates coordinates, timestamps, and disabled asset arrays', () => {
    expect(() => validateScenarioRequest({ ...baseRequest, observer: { lat: 91, lon: 0 } })).toThrow();
    expect(() => validateScenarioRequest({ ...baseRequest, timestamp: 'not-a-date' })).toThrow();
    expect(() =>
      validateScenarioRequest({ ...baseRequest, disabledSatelliteNoradIds: 'sat-1' }),
    ).toThrow();
  });
});
