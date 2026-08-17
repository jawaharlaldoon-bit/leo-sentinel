import { describe, expect, it } from 'vitest';
import { clearAiCacheForTests, getCached, setCached, stableHash } from './cache';
import {
  applyGraniteForecast,
  backtestForecast,
  buildDeterministicForecast,
  createBundledDemoObservations,
  validateForecastObservations,
} from './forecast';

describe('fleet forecast', () => {
  it('requires a minimum of 512 observations', () => {
    expect(() => validateForecastObservations(createBundledDemoObservations(511))).toThrow(
      'at least 512',
    );
    expect(validateForecastObservations(createBundledDemoObservations(512))).toHaveLength(512);
  });

  it('rejects unsorted dates and invalid metric values', () => {
    const unsorted = createBundledDemoObservations(512);
    unsorted[20].date = unsorted[19].date;
    expect(() => validateForecastObservations(unsorted)).toThrow('unsorted date');

    const invalid = createBundledDemoObservations(512);
    invalid[20].operational = -1;
    expect(() => validateForecastObservations(invalid)).toThrow('operational');
  });

  it('builds a 96-day deterministic forecast and naïve comparison', () => {
    const forecast = buildDeterministicForecast(createBundledDemoObservations());
    const future = forecast.series.filter((point) => point.kind === 'forecast');

    expect(future).toHaveLength(96);
    expect(forecast.observationsUsed).toBeGreaterThanOrEqual(512);
    expect(forecast.evaluation.operational.mae).toBeGreaterThanOrEqual(0);
    expect(forecast.evaluation.operational.naiveMae).toBeGreaterThanOrEqual(0);
    expect(backtestForecast(createBundledDemoObservations()).islCapable.mape).toBeGreaterThanOrEqual(0);
  });

  it('applies a complete Granite response to the cached baseline', () => {
    const base = buildDeterministicForecast(createBundledDemoObservations());
    const values = Array.from({ length: 96 }, (_, index) => 7000 + index);
    const live = applyGraniteForecast(base, {
      data: {
        operational: values,
        islCapable: values,
        raising: values,
        deorbiting: values,
        anomalous: values,
      },
    });

    expect(live.mode).toBe('live');
    expect(live.series.at(-1)?.operational).toBe(7095);
  });

  it('accepts the watsonx results-array response shape', () => {
    const base = buildDeterministicForecast(createBundledDemoObservations());
    const values = Array.from({ length: 96 }, (_, index) => 7100 + index);
    const live = applyGraniteForecast(base, {
      results: [{ operational: values, islCapable: values, raising: values, deorbiting: values, anomalous: values }],
    });
    expect(live.series.at(-1)?.operational).toBe(7195);
  });

  it('caches by stable dataset version', () => {
    clearAiCacheForTests();
    const observations = createBundledDemoObservations();
    const key = `forecast:${stableHash(observations)}`;
    const forecast = buildDeterministicForecast(observations);
    setCached(key, forecast);
    expect(getCached(key)).toEqual(forecast);
  });

  it('bundled demo observations produce fallback mode, not cache', () => {
    // Bundled synthetic data is always a deterministic fallback — never label
    // it "cache" (which implies a prior live IBM result was cached).
    const forecast = buildDeterministicForecast(createBundledDemoObservations(), 'fallback');
    expect(forecast.mode).toBe('fallback');
  });
});
