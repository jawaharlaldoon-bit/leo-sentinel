import { stableHash } from './cache';
import type {
  AccuracyMetric,
  FleetForecast,
  ForecastMetricName,
  ForecastObservation,
  ForecastPoint,
} from './types';
import { GRANITE_TTM_MODEL_ID } from './types';

const METRICS: ForecastMetricName[] = [
  'operational',
  'islCapable',
  'raising',
  'deorbiting',
  'anomalous',
];
export const MIN_FORECAST_OBSERVATIONS = 512;
export const FORECAST_HORIZON_DAYS = 96 as const;

export class ForecastValidationError extends Error {}

export function validateForecastObservations(
  observations: ForecastObservation[],
): ForecastObservation[] {
  if (!Array.isArray(observations) || observations.length < MIN_FORECAST_OBSERVATIONS) {
    throw new ForecastValidationError(
      `Granite TTM requires at least ${MIN_FORECAST_OBSERVATIONS} daily observations.`,
    );
  }

  let previous = '';
  return observations.map((observation, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.date) || observation.date <= previous) {
      throw new ForecastValidationError(`Observation ${index} has an invalid or unsorted date.`);
    }
    previous = observation.date;
    for (const metric of METRICS) {
      if (!Number.isFinite(observation[metric]) || observation[metric] < 0) {
        throw new ForecastValidationError(`Observation ${index} has an invalid ${metric} value.`);
      }
    }
    return { ...observation };
  });
}

export function createBundledDemoObservations(count = 640): ForecastObservation[] {
  const start = Date.UTC(2024, 9, 1);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    operational: Math.round(6300 + index * 5.15 + Math.sin(index / 17) * 22),
    islCapable: Math.round(4100 + index * 5.55 + Math.sin(index / 19) * 18),
    raising: Math.max(20, Math.round(145 + Math.sin(index / 11) * 52)),
    deorbiting: Math.max(3, Math.round(31 + Math.sin(index / 23) * 9)),
    anomalous: Math.max(2, Math.round(18 + Math.sin(index / 29) * 5)),
  }));
}

export function buildDeterministicForecast(
  rawObservations: ForecastObservation[],
  mode: FleetForecast['mode'] = 'fallback',
): FleetForecast {
  const observations = validateForecastObservations(rawObservations);
  const datasetVersion = stableHash(observations);
  const evaluation = backtestForecast(observations);
  const visibleActual = observations.slice(-180).map<ForecastPoint>((point) => ({
    ...point,
    kind: 'actual',
  }));
  const series = [
    ...visibleActual,
    ...project(observations, FORECAST_HORIZON_DAYS).map<ForecastPoint>((point) => ({
      ...point,
      kind: 'forecast',
    })),
  ];

  return {
    modelId: GRANITE_TTM_MODEL_ID,
    mode,
    datasetVersion,
    observationsUsed: observations.length,
    horizonDays: FORECAST_HORIZON_DAYS,
    generatedAt: `${observations[observations.length - 1].date}T00:00:00.000Z`,
    series,
    evaluation,
    limitations: [
      mode === 'live'
        ? 'Forecasts are decision support and not orbital propagation predictions.'
        : 'Bundled deterministic forecast is shown because live watsonx inference is disabled or unavailable.',
      'Anomalous counts are derived from the fleet status categories available in the source dataset.',
    ],
  };
}

export function applyGraniteForecast(
  base: FleetForecast,
  response: unknown,
): FleetForecast {
  const raw = response as {
    results?: Array<Record<string, unknown> & { data?: Record<string, unknown>; predictions?: Record<string, unknown> }>;
    data?: Record<string, unknown>;
    predictions?: Record<string, unknown>;
  };
  const payload = raw.results?.[0]?.data ?? raw.results?.[0]?.predictions ?? raw.results?.[0] ?? raw.data ?? raw.predictions;
  if (!payload) throw new ForecastValidationError('Granite TTM response contains no forecast data.');

  const values = Object.fromEntries(
    METRICS.map((metric) => [metric, extractNumberArray(payload[metric])]),
  ) as Record<ForecastMetricName, number[]>;
  if (METRICS.some((metric) => values[metric].length < FORECAST_HORIZON_DAYS)) {
    throw new ForecastValidationError('Granite TTM response has an incomplete forecast horizon.');
  }

  const actual = base.series.filter((point) => point.kind === 'actual');
  const lastDate = Date.parse(`${actual[actual.length - 1].date}T00:00:00Z`);
  const forecast = Array.from({ length: FORECAST_HORIZON_DAYS }, (_, index) => ({
    date: new Date(lastDate + (index + 1) * 86_400_000).toISOString().slice(0, 10),
    operational: Math.max(0, Math.round(values.operational[index])),
    islCapable: Math.max(0, Math.round(values.islCapable[index])),
    raising: Math.max(0, Math.round(values.raising[index])),
    deorbiting: Math.max(0, Math.round(values.deorbiting[index])),
    anomalous: Math.max(0, Math.round(values.anomalous[index])),
    kind: 'forecast' as const,
  }));
  return {
    ...base,
    mode: 'live',
    series: [...actual, ...forecast],
    generatedAt: new Date().toISOString(),
    limitations: ['Forecasts are decision support and not orbital propagation predictions.'],
  };
}

export function backtestForecast(
  observations: ForecastObservation[],
): Record<ForecastMetricName, AccuracyMetric> {
  const validated = validateForecastObservations(observations);
  const holdoutSize = FORECAST_HORIZON_DAYS;
  const training = validated.slice(0, -holdoutSize);
  const actual = validated.slice(-holdoutSize);
  const predicted = project(training, holdoutSize);
  const lastTraining = training[training.length - 1];

  return Object.fromEntries(
    METRICS.map((metric) => {
      const errors = actual.map((point, index) => Math.abs(point[metric] - predicted[index][metric]));
      const naiveErrors = actual.map((point) => Math.abs(point[metric] - lastTraining[metric]));
      const mae = average(errors);
      const naiveMae = average(naiveErrors);
      const mape = average(
        actual.map((point, index) =>
          point[metric] === 0 ? 0 : Math.abs((point[metric] - predicted[index][metric]) / point[metric]) * 100,
        ),
      );
      return [
        metric,
        {
          mae: round(mae),
          mape: round(mape),
          naiveMae: round(naiveMae),
          improvementPct: naiveMae === 0 ? 0 : round(((naiveMae - mae) / naiveMae) * 100),
        },
      ];
    }),
  ) as Record<ForecastMetricName, AccuracyMetric>;
}

function project(observations: ForecastObservation[], horizon: number): ForecastObservation[] {
  const trendWindow = observations.slice(-Math.min(90, observations.length));
  const first = trendWindow[0];
  const last = trendWindow[trendWindow.length - 1];
  const denominator = Math.max(1, trendWindow.length - 1);
  const lastDate = Date.parse(`${last.date}T00:00:00Z`);

  return Array.from({ length: horizon }, (_, index) => {
    const step = index + 1;
    const result = {
      date: new Date(lastDate + step * 86_400_000).toISOString().slice(0, 10),
    } as ForecastObservation;
    for (const metric of METRICS) {
      const dailyTrend = (last[metric] - first[metric]) / denominator;
      result[metric] = Math.max(0, Math.round(last[metric] + dailyTrend * step));
    }
    return result;
  });
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function extractNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((item): item is number => typeof item === 'number');
  if (value && typeof value === 'object') {
    const candidate = value as { prediction?: unknown; values?: unknown; mean?: unknown };
    return extractNumberArray(candidate.prediction ?? candidate.values ?? candidate.mean);
  }
  return [];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
