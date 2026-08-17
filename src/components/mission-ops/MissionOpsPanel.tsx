'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import type { FleetForecast, MissionBriefResponse } from '@/lib/ai/types';
import type { ScenarioRequest, ScenarioResult } from '@/lib/scenarios/types';

const SCENARIO_OPTIONS = [
  {
    id: 'north-atlantic-gateway-outage',
    label: 'North Atlantic gateway outage',
    defaultAsset: 'gs-ballinspittle-ie',
    optionalAsset: 'gs-goonhilly-uk',
    optionalLabel: 'Also isolate Goonhilly',
    assetType: 'ground' as const,
  },
  {
    id: 'polar-shell-degradation',
    label: 'Polar-shell degradation',
    defaultAsset: 'sat-58001',
    optionalAsset: 'sat-58002',
    optionalLabel: 'Also isolate SAT-58002',
    assetType: 'satellite' as const,
  },
  {
    id: 'fleet-anomaly-watch',
    label: 'Fleet anomaly watch',
    defaultAsset: 'sat-59001',
    optionalAsset: 'sat-59002',
    optionalLabel: 'Also isolate SAT-59002',
    assetType: 'satellite' as const,
  },
];

interface HealthResponse {
  watsonx: { liveEnabled: boolean; fallbackReady: boolean };
}

export default function MissionOpsPanel() {
  const demoLocation = useAppStore((state) => state.demoLocation);
  const setScenarioOverlay = useAppStore((state) => state.setScenarioResult);
  const [expanded, setExpanded] = useState(false);
  const [scenarioId, setScenarioId] = useState(SCENARIO_OPTIONS[0].id);
  const [isolateOptional, setIsolateOptional] = useState(false);
  const [running, setRunning] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [brief, setBrief] = useState<MissionBriefResponse | null>(null);
  const [forecast, setForecast] = useState<FleetForecast | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState('');

  const selected = useMemo(
    () => SCENARIO_OPTIONS.find((scenario) => scenario.id === scenarioId) ?? SCENARIO_OPTIONS[0],
    [scenarioId],
  );

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then((response) => response.json()),
      fetch('/api/ai/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).then((response) => response.json()),
    ])
      .then(([healthData, forecastData]) => {
        setHealth(healthData as HealthResponse);
        if ('series' in forecastData) setForecast(forecastData as FleetForecast);
      })
      .catch(() => setHealth(null));
  }, []);

  const run = async () => {
    setRunning(true);
    setError('');
    setBrief(null);
    const disabledSatelliteNoradIds =
      isolateOptional && selected.assetType === 'satellite' ? [selected.optionalAsset] : [];
    const disabledGroundStationIds =
      isolateOptional && selected.assetType === 'ground' ? [selected.optionalAsset] : [];
    const request: ScenarioRequest = {
      scenarioId,
      observer: demoLocation
        ? { lat: demoLocation.lat, lon: demoLocation.lon }
        : { lat: 52, lon: -25 },
      timestamp: new Date().toISOString(),
      disabledSatelliteNoradIds,
      disabledGroundStationIds,
      objective: 'resilience',
    };
    try {
      const response = await fetch('/api/scenarios/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'Scenario failed.');
      setResult(data as ScenarioResult);
      setScenarioOverlay(data as ScenarioResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scenario failed.');
    } finally {
      setRunning(false);
    }
  };

  const generateBrief = async () => {
    if (!result) return;
    setBriefing(true);
    setError('');
    try {
      const response = await fetch('/api/ai/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: result }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'Brief failed.');
      setBrief(data as MissionBriefResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Brief failed.');
    } finally {
      setBriefing(false);
    }
  };

  const latestForecast = forecast?.series.filter((point) => point.kind === 'forecast').at(-1);
  const riskColor = !result
    ? 'text-cyan-400'
    : result.riskScore >= 75
      ? 'text-red-400'
      : result.riskScore >= 40
        ? 'text-yellow-400'
        : 'text-green-400';

  return (
    <div className="hud-panel w-full md:w-[280px] overflow-hidden">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="w-full p-3 flex items-center justify-between text-left"
      >
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-cyan-400/70">Mission Ops</div>
          <div className={`text-[9px] mt-0.5 ${riskColor}`}>
            {result ? `RISK ${result.riskScore}/100` : 'READY · ZERO-COST MODE'}
          </div>
        </div>
        <span className="text-cyan-400/60 text-xs">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 max-h-[68vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-1 mb-2 text-[8px] uppercase tracking-wide">
            <Label kind="Measured" />
            <Label kind="Calculated" />
            <Label kind="AI" />
          </div>

          <label className="text-[9px] text-white/40 uppercase">Scenario</label>
          <select
            value={scenarioId}
            onChange={(event) => {
              setScenarioId(event.target.value);
              setIsolateOptional(false);
              setResult(null);
              setBrief(null);
            }}
            className="w-full mt-1 bg-black/60 border border-cyan-500/25 rounded text-[10px] text-white/80 px-2 py-2 outline-none"
          >
            {SCENARIO_OPTIONS.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
            ))}
          </select>

          <div className="mt-2 text-[9px] text-white/50">
            Simulated outage: <span className="text-orange-300/80">{selected.defaultAsset}</span>
          </div>
          <label className="flex items-center gap-2 mt-2 text-[9px] text-white/55 cursor-pointer">
            <input
              type="checkbox"
              checked={isolateOptional}
              onChange={(event) => setIsolateOptional(event.target.checked)}
              className="accent-cyan-400"
            />
            {selected.optionalLabel}
          </label>

          <button
            onClick={run}
            disabled={running}
            className="w-full mt-3 py-2 rounded border border-cyan-400/50 bg-cyan-400/10 text-[10px] text-cyan-300 hover:bg-cyan-400/20 disabled:opacity-40"
          >
            {running ? 'CALCULATING…' : 'RUN SCENARIO'}
          </button>

          {error && <div className="mt-2 text-[9px] text-red-400">{error}</div>}

          {result && (
            <>
              <hr className="hud-divider my-3" />
              <div className="grid grid-cols-2 gap-2">
                <RouteCard title="Baseline" route={result.baselineRoute} />
                <RouteCard title="Degraded" route={result.degradedRoute} />
              </div>
              <div className="grid grid-cols-3 gap-1 mt-2 text-center">
                <Metric label="Latency Δ" value={result.latencyDeltaMs === null ? 'N/A' : `${result.latencyDeltaMs} ms`} />
                <Metric label="Hop Δ" value={result.hopDelta === null ? 'N/A' : String(result.hopDelta)} />
                <Metric label="Risk" value={`${result.riskScore}/100`} />
              </div>

              <button
                onClick={generateBrief}
                disabled={briefing}
                className="w-full mt-3 py-2 rounded border border-violet-400/40 bg-violet-400/10 text-[10px] text-violet-300 hover:bg-violet-400/20 disabled:opacity-40"
              >
                {briefing ? 'GROUNDING BRIEF…' : 'GENERATE MISSION BRIEF'}
              </button>
              <button
                onClick={() => setShowEvidence((value) => !value)}
                className="w-full mt-1 text-[9px] text-cyan-400/60 hover:text-cyan-300"
              >
                {showEvidence ? 'Hide' : 'Show'} evidence ({result.evidence.length})
              </button>
            </>
          )}

          {showEvidence && result && (
            <div className="mt-2 space-y-1">
              {result.evidence.map((item) => (
                <div key={item.id} className="border-l border-cyan-400/30 pl-2 text-[8px]">
                  <span className="text-white/70">{item.label}: </span>
                  <span className="text-cyan-300/80">{String(item.value)} {item.unit}</span>
                  <div className="text-white/30">{item.kind} · {item.id}</div>
                </div>
              ))}
            </div>
          )}

          {brief && (
            <div className="mt-3 border border-violet-400/20 rounded p-2 bg-violet-400/5">
              <div className="flex justify-between text-[8px] uppercase">
                <span className="text-violet-300">Granite mission brief</span>
                <span className="text-white/35">{brief.mode}</span>
              </div>
              <p className="text-[9px] text-white/70 leading-relaxed mt-1">{brief.brief.executiveSummary}</p>
              <ol className="mt-2 space-y-1 text-[8px] text-white/55">
                {brief.brief.actions.map((action) => (
                  <li key={`${action.priority}-${action.action}`}>
                    <span className="text-violet-300">P{action.priority}</span> {action.action}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <hr className="hud-divider my-3" />
          <div className="text-[8px] text-white/35 space-y-1">
            <div className="flex justify-between"><span>watsonx</span><span className="text-green-400/70">{health?.watsonx.liveEnabled ? 'LIVE LITE' : 'CACHED FALLBACK'}</span></div>
            <div className="flex justify-between"><span>TTM 96-day outlook</span><span className="text-white/60">{latestForecast?.operational.toLocaleString() ?? 'loading'}</span></div>
            <div className="truncate">ibm/granite-4-h-small · ibm/granite-ttm-512-96-r2</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ kind }: { kind: string }) {
  return <span className="border border-white/10 rounded px-1 py-0.5 text-center text-white/40">{kind}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] rounded p-1">
      <div className="text-[7px] text-white/30 uppercase">{label}</div>
      <div className="text-[9px] text-white/75 mt-0.5">{value}</div>
    </div>
  );
}

function RouteCard({ title, route }: { title: string; route: ScenarioResult['baselineRoute'] }) {
  return (
    <div className="bg-white/[0.03] rounded p-2 min-h-16">
      <div className="text-[8px] text-white/35 uppercase">{title}</div>
      {route ? (
        <>
          <div className="text-[9px] text-white/70 truncate mt-1">{route.groundStationName}</div>
          <div className="text-[8px] text-cyan-400/70">{route.latencyMs} ms · {route.hopCount} hops</div>
        </>
      ) : (
        <div className="text-[9px] text-red-400 mt-2">NO ROUTE</div>
      )}
    </div>
  );
}
