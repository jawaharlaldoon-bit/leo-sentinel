import type {
  EvidenceItem,
  RouteSummary,
  ScenarioDefinition,
  ScenarioRequest,
  ScenarioResult,
} from './types';

type AssetType = 'observer' | 'satellite' | 'ground-station';

interface AssetNode {
  id: string;
  name: string;
  type: AssetType;
}

interface Link {
  from: string;
  to: string;
  latencyMs: number;
}

interface ScenarioTopology {
  nodes: AssetNode[];
  links: Link[];
}

interface ScenarioTemplate extends ScenarioDefinition {
  topology: ScenarioTopology;
}

const OBSERVER_ID = 'observer';

const templates: Record<string, ScenarioTemplate> = {
  'north-atlantic-gateway-outage': {
    id: 'north-atlantic-gateway-outage',
    name: 'North Atlantic gateway outage',
    description: 'Tests continuity when the closest North Atlantic gateway is unavailable.',
    defaultDisabledSatelliteNoradIds: [],
    defaultDisabledGroundStationIds: ['gs-ballinspittle-ie'],
    topology: {
      nodes: [
        { id: OBSERVER_ID, name: 'North Atlantic observer', type: 'observer' },
        { id: 'sat-57001', name: 'STARLINK-57001', type: 'satellite' },
        { id: 'sat-57002', name: 'STARLINK-57002', type: 'satellite' },
        { id: 'sat-57003', name: 'STARLINK-57003', type: 'satellite' },
        { id: 'gs-ballinspittle-ie', name: 'Ballinspittle, Ireland', type: 'ground-station' },
        { id: 'gs-goonhilly-uk', name: 'Goonhilly, United Kingdom', type: 'ground-station' },
      ],
      links: [
        { from: OBSERVER_ID, to: 'sat-57001', latencyMs: 4.6 },
        { from: OBSERVER_ID, to: 'sat-57002', latencyMs: 5.2 },
        { from: 'sat-57001', to: 'gs-ballinspittle-ie', latencyMs: 5.8 },
        { from: 'sat-57001', to: 'sat-57002', latencyMs: 3.1 },
        { from: 'sat-57002', to: 'sat-57003', latencyMs: 3.4 },
        { from: 'sat-57003', to: 'gs-goonhilly-uk', latencyMs: 6.3 },
      ],
    },
  },
  'polar-shell-degradation': {
    id: 'polar-shell-degradation',
    name: 'Polar-shell degradation',
    description: 'Simulates a polar satellite loss and evaluates an ISL-assisted alternate path.',
    defaultDisabledSatelliteNoradIds: ['sat-58001'],
    defaultDisabledGroundStationIds: [],
    topology: {
      nodes: [
        { id: OBSERVER_ID, name: 'Arctic observer', type: 'observer' },
        { id: 'sat-58001', name: 'STARLINK-58001', type: 'satellite' },
        { id: 'sat-58002', name: 'STARLINK-58002', type: 'satellite' },
        { id: 'sat-58003', name: 'STARLINK-58003', type: 'satellite' },
        { id: 'gs-kuparuk-ak', name: 'Kuparuk, Alaska', type: 'ground-station' },
        { id: 'gs-fairbanks-ak', name: 'Fairbanks, Alaska', type: 'ground-station' },
      ],
      links: [
        { from: OBSERVER_ID, to: 'sat-58001', latencyMs: 5.1 },
        { from: OBSERVER_ID, to: 'sat-58002', latencyMs: 5.8 },
        { from: 'sat-58001', to: 'gs-kuparuk-ak', latencyMs: 5.5 },
        { from: 'sat-58002', to: 'sat-58003', latencyMs: 4.2 },
        { from: 'sat-58003', to: 'gs-fairbanks-ak', latencyMs: 6.8 },
      ],
    },
  },
  'fleet-anomaly-watch': {
    id: 'fleet-anomaly-watch',
    name: 'Fleet anomaly watch',
    description: 'Evaluates route resilience while an anomalous fleet asset is isolated.',
    defaultDisabledSatelliteNoradIds: ['sat-59001'],
    defaultDisabledGroundStationIds: [],
    topology: {
      nodes: [
        { id: OBSERVER_ID, name: 'Fleet observer', type: 'observer' },
        { id: 'sat-59001', name: 'STARLINK-59001', type: 'satellite' },
        { id: 'sat-59002', name: 'STARLINK-59002', type: 'satellite' },
        { id: 'sat-59003', name: 'STARLINK-59003', type: 'satellite' },
        { id: 'gs-redmond-wa', name: 'Redmond, Washington', type: 'ground-station' },
        { id: 'gs-prosser-wa', name: 'Prosser, Washington', type: 'ground-station' },
      ],
      links: [
        { from: OBSERVER_ID, to: 'sat-59001', latencyMs: 4.1 },
        { from: OBSERVER_ID, to: 'sat-59002', latencyMs: 4.8 },
        { from: 'sat-59001', to: 'gs-redmond-wa', latencyMs: 4.9 },
        { from: 'sat-59002', to: 'sat-59003', latencyMs: 2.9 },
        { from: 'sat-59003', to: 'gs-prosser-wa', latencyMs: 5.4 },
      ],
    },
  },
};

export const SCENARIOS: ScenarioDefinition[] = Object.values(templates).map(
  ({ topology: _topology, ...definition }) => definition,
);

export class ScenarioValidationError extends Error {}

export function validateScenarioRequest(value: unknown): ScenarioRequest {
  if (!value || typeof value !== 'object') {
    throw new ScenarioValidationError('Request body must be a JSON object.');
  }

  const request = value as Partial<ScenarioRequest>;
  if (typeof request.scenarioId !== 'string' || !templates[request.scenarioId]) {
    throw new ScenarioValidationError('Unknown scenarioId.');
  }
  if (
    !request.observer ||
    typeof request.observer.lat !== 'number' ||
    typeof request.observer.lon !== 'number' ||
    !Number.isFinite(request.observer.lat) ||
    !Number.isFinite(request.observer.lon) ||
    request.observer.lat < -90 ||
    request.observer.lat > 90 ||
    request.observer.lon < -180 ||
    request.observer.lon > 180
  ) {
    throw new ScenarioValidationError('observer must contain valid latitude and longitude.');
  }
  if (typeof request.timestamp !== 'string' || Number.isNaN(Date.parse(request.timestamp))) {
    throw new ScenarioValidationError('timestamp must be a valid ISO date string.');
  }
  if (request.objective !== 'latency' && request.objective !== 'resilience') {
    throw new ScenarioValidationError('objective must be latency or resilience.');
  }

  const satellites = validateStringArray(
    request.disabledSatelliteNoradIds,
    'disabledSatelliteNoradIds',
  );
  const groundStations = validateStringArray(
    request.disabledGroundStationIds,
    'disabledGroundStationIds',
  );

  return {
    scenarioId: request.scenarioId,
    observer: request.observer,
    timestamp: new Date(request.timestamp).toISOString(),
    disabledSatelliteNoradIds: satellites,
    disabledGroundStationIds: groundStations,
    objective: request.objective,
  };
}

function validateStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 50 || value.some((item) => typeof item !== 'string')) {
    throw new ScenarioValidationError(`${field} must be an array of at most 50 strings.`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort();
}

export function runScenario(input: ScenarioRequest | unknown): ScenarioResult {
  const request = validateScenarioRequest(input);
  const template = templates[request.scenarioId];
  const baselineRoute = findRoute(template.topology, new Set());

  const affectedAssets = [
    ...template.defaultDisabledSatelliteNoradIds,
    ...template.defaultDisabledGroundStationIds,
    ...request.disabledSatelliteNoradIds,
    ...request.disabledGroundStationIds,
  ].filter((asset, index, values) => values.indexOf(asset) === index).sort();

  const degradedRoute = findRoute(template.topology, new Set(affectedAssets));
  const latencyDeltaMs =
    baselineRoute && degradedRoute
      ? round(degradedRoute.latencyMs - baselineRoute.latencyMs)
      : null;
  const hopDelta =
    baselineRoute && degradedRoute ? degradedRoute.hopCount - baselineRoute.hopCount : null;
  const riskScore = calculateRiskScore(
    degradedRoute,
    latencyDeltaMs,
    hopDelta,
    affectedAssets.length,
    request.objective,
  );

  return {
    scenarioId: template.id,
    scenarioName: template.name,
    timestamp: request.timestamp,
    objective: request.objective,
    observer: request.observer,
    baselineRoute,
    degradedRoute,
    rerouteAvailable: degradedRoute !== null,
    latencyDeltaMs,
    hopDelta,
    affectedAssets,
    riskScore,
    evidence: buildEvidence(
      template,
      request,
      baselineRoute,
      degradedRoute,
      latencyDeltaMs,
      hopDelta,
      riskScore,
      affectedAssets,
    ),
  };
}

function findRoute(topology: ScenarioTopology, disabled: Set<string>): RouteSummary | null {
  const groundIds = new Set(
    topology.nodes
      .filter((node) => node.type === 'ground-station' && !disabled.has(node.id))
      .map((node) => node.id),
  );
  const distances = new Map<string, number>([[OBSERVER_ID, 0]]);
  const previous = new Map<string, string>();
  const unvisited = new Set(topology.nodes.filter((node) => !disabled.has(node.id)).map((node) => node.id));

  while (unvisited.size > 0) {
    let current: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const id of unvisited) {
      const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance || (distance === currentDistance && id < (current ?? ''))) {
        current = id;
        currentDistance = distance;
      }
    }

    if (!current || !Number.isFinite(currentDistance)) break;
    if (groundIds.has(current)) return toRouteSummary(topology, current, previous, currentDistance);
    unvisited.delete(current);

    for (const link of topology.links) {
      const neighbor = link.from === current ? link.to : link.to === current ? link.from : null;
      if (!neighbor || !unvisited.has(neighbor) || disabled.has(neighbor)) continue;
      const candidate = currentDistance + link.latencyMs;
      if (candidate < (distances.get(neighbor) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current);
      }
    }
  }

  return null;
}

function toRouteSummary(
  topology: ScenarioTopology,
  groundId: string,
  previous: Map<string, string>,
  latencyMs: number,
): RouteSummary {
  const reversed = [groundId];
  while (reversed[reversed.length - 1] !== OBSERVER_ID) {
    const parent = previous.get(reversed[reversed.length - 1]);
    if (!parent) break;
    reversed.push(parent);
  }
  const pathAssetIds = reversed.reverse();
  const satelliteNoradIds = pathAssetIds.filter(
    (id) => topology.nodes.find((node) => node.id === id)?.type === 'satellite',
  );
  const groundStationName = topology.nodes.find((node) => node.id === groundId)?.name ?? groundId;

  return {
    satelliteNoradIds,
    groundStationId: groundId,
    groundStationName,
    latencyMs: round(latencyMs),
    hopCount: pathAssetIds.length - 1,
    pathAssetIds,
  };
}

function calculateRiskScore(
  degradedRoute: RouteSummary | null,
  latencyDeltaMs: number | null,
  hopDelta: number | null,
  affectedCount: number,
  objective: ScenarioRequest['objective'],
): number {
  if (!degradedRoute) return 100;
  const objectiveWeight = objective === 'resilience' ? 1.15 : 1;
  const raw =
    18 +
    affectedCount * 9 +
    Math.max(0, latencyDeltaMs ?? 0) * 2.2 +
    Math.max(0, hopDelta ?? 0) * 7;
  return Math.min(99, Math.round(raw * objectiveWeight));
}

function buildEvidence(
  template: ScenarioTemplate,
  request: ScenarioRequest,
  baseline: RouteSummary | null,
  degraded: RouteSummary | null,
  latencyDeltaMs: number | null,
  hopDelta: number | null,
  riskScore: number,
  affectedAssets: string[],
): EvidenceItem[] {
  return [
    {
      id: 'scenario-observer',
      label: 'Observer coordinates',
      value: `${request.observer.lat.toFixed(3)}, ${request.observer.lon.toFixed(3)}`,
      kind: 'measured',
      source: 'Existing observer state',
    },
    {
      id: 'scenario-disabled-assets',
      label: 'Disabled assets',
      value: affectedAssets.length,
      unit: 'assets',
      kind: 'simulated',
      source: template.name,
    },
    {
      id: 'scenario-reroute',
      label: 'Reroute available',
      value: degraded !== null,
      kind: 'calculated',
      source: 'Deterministic ISL scenario pathfinder',
    },
    {
      id: 'scenario-baseline-latency',
      label: 'Baseline latency',
      value: baseline?.latencyMs ?? 'unavailable',
      unit: baseline ? 'ms' : undefined,
      kind: 'calculated',
      source: 'Deterministic ISL scenario pathfinder',
    },
    {
      id: 'scenario-latency-delta',
      label: 'Latency delta',
      value: latencyDeltaMs ?? 'route unavailable',
      unit: latencyDeltaMs === null ? undefined : 'ms',
      kind: 'calculated',
      source: 'Baseline/degraded route comparison',
    },
    {
      id: 'scenario-hop-delta',
      label: 'Hop delta',
      value: hopDelta ?? 'route unavailable',
      unit: hopDelta === null ? undefined : 'hops',
      kind: 'calculated',
      source: 'Baseline/degraded route comparison',
    },
    {
      id: 'scenario-risk-score',
      label: 'Mission risk score',
      value: riskScore,
      unit: '/100',
      kind: 'calculated',
      source: 'LEO Sentinel deterministic risk rubric',
    },
  ];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
