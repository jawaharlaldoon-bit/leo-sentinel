export type ScenarioObjective = 'latency' | 'resilience';

export interface ScenarioRequest {
  scenarioId: string;
  observer: { lat: number; lon: number };
  timestamp: string;
  disabledSatelliteNoradIds: string[];
  disabledGroundStationIds: string[];
  objective: ScenarioObjective;
}

export interface RouteSummary {
  satelliteNoradIds: string[];
  groundStationId: string;
  groundStationName: string;
  latencyMs: number;
  hopCount: number;
  pathAssetIds: string[];
}

export type EvidenceKind = 'measured' | 'calculated' | 'simulated';

export interface EvidenceItem {
  id: string;
  label: string;
  value: string | number | boolean;
  unit?: string;
  kind: EvidenceKind;
  source: string;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  timestamp: string;
  objective: ScenarioObjective;
  observer: { lat: number; lon: number };
  baselineRoute: RouteSummary | null;
  degradedRoute: RouteSummary | null;
  rerouteAvailable: boolean;
  latencyDeltaMs: number | null;
  hopDelta: number | null;
  affectedAssets: string[];
  riskScore: number;
  evidence: EvidenceItem[];
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  defaultDisabledSatelliteNoradIds: string[];
  defaultDisabledGroundStationIds: string[];
}

export interface ScenarioFailure {
  error: {
    code: string;
    message: string;
  };
}
