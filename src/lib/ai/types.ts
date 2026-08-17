import type { EvidenceItem, ScenarioResult } from '@/lib/scenarios/types';

export const GRANITE_TTM_MODEL_ID = 'ibm/granite-ttm-512-96-r2';
export const GRANITE_BRIEF_MODEL_ID = 'ibm/granite-4-h-small';

export type AiResultMode = 'live' | 'cache' | 'fallback';

export interface ForecastObservation {
  date: string;
  operational: number;
  islCapable: number;
  raising: number;
  deorbiting: number;
  anomalous: number;
}

export type ForecastMetricName = Exclude<keyof ForecastObservation, 'date'>;

export interface ForecastPoint extends ForecastObservation {
  kind: 'actual' | 'forecast';
}

export interface AccuracyMetric {
  mae: number;
  mape: number;
  naiveMae: number;
  improvementPct: number;
}

export interface FleetForecast {
  modelId: string;
  mode: AiResultMode;
  datasetVersion: string;
  observationsUsed: number;
  horizonDays: 96;
  generatedAt: string;
  series: ForecastPoint[];
  evaluation: Record<ForecastMetricName, AccuracyMetric>;
  limitations: string[];
}

export interface MissionBrief {
  riskLevel: 'nominal' | 'watch' | 'critical';
  executiveSummary: string;
  findings: Array<{
    claim: string;
    evidenceIds: string[];
  }>;
  actions: Array<{
    priority: 1 | 2 | 3;
    action: string;
    rationale: string;
  }>;
  confidence: number;
  limitations: string[];
  modelId: string;
  generatedAt: string;
}

export interface MissionBriefResponse {
  brief: MissionBrief;
  mode: AiResultMode;
  cacheKey: string;
  evidence: EvidenceItem[];
}

export interface BriefRequest {
  scenario: ScenarioResult;
}

export interface AiFailure {
  error: {
    code: string;
    message: string;
    fallbackAvailable: boolean;
  };
}
