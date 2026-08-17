'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FleetForecast, ForecastMetricName } from '@/lib/ai/types';
import { ChartPanel } from '../ChartPanel';

const METRICS: Array<{ key: ForecastMetricName; label: string; color: string }> = [
  { key: 'operational', label: 'Operational', color: '#22d3ee' },
  { key: 'islCapable', label: 'ISL-capable', color: '#a78bfa' },
  { key: 'raising', label: 'Orbit-raising', color: '#fbbf24' },
  { key: 'deorbiting', label: 'Deorbiting', color: '#fb7185' },
  { key: 'anomalous', label: 'Anomalous', color: '#f97316' },
];

export function GraniteForecast() {
  const [forecast, setForecast] = useState<FleetForecast | null>(null);
  const [metric, setMetric] = useState<ForecastMetricName>('operational');
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/ai/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Forecast unavailable');
        return response.json();
      })
      .then((data: FleetForecast) => setForecast(data))
      .catch(() => setError(true));
  }, []);

  const data = useMemo(
    () =>
      forecast?.series.map((point) => ({
        date: point.date,
        actual: point.kind === 'actual' ? point[metric] : null,
        forecast: point.kind === 'forecast' ? point[metric] : null,
      })) ?? [],
    [forecast, metric],
  );
  const selected = METRICS.find((item) => item.key === metric) ?? METRICS[0];
  const evaluation = forecast?.evaluation[metric];

  const controls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 8, color: forecast?.mode === 'live' ? '#4ade80' : '#fbbf24' }}>
        {forecast?.mode?.toUpperCase() ?? 'LOADING'}
      </span>
      <select
        value={metric}
        onChange={(event) => setMetric(event.target.value as ForecastMetricName)}
        style={{ background: '#101018', color: '#ddd', border: '1px solid rgba(255,255,255,.15)', borderRadius: 3, fontFamily: 'monospace', fontSize: 9, padding: '3px 5px' }}
      >
        {METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </select>
    </div>
  );

  return (
    <ChartPanel
      title="Granite Fleet Outlook"
      subtitle="96-day decision-support forecast across five fleet health signals"
      fullWidth
      controls={controls}
      footnote={forecast ? `${forecast.modelId} · ${forecast.observationsUsed} daily observations · dataset ${forecast.datasetVersion} · ${forecast.mode} result` : undefined}
    >
      {error ? (
        <div style={{ height: 220, display: 'grid', placeItems: 'center', fontFamily: 'monospace', fontSize: 10, color: '#f87171' }}>Forecast unavailable; existing Fleet analytics remain active.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,.15)', fontFamily: 'monospace', fontSize: 10 }} />
              <Line type="monotone" dataKey="actual" name={`${selected.label} actual`} stroke={selected.color} strokeWidth={1.7} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="forecast" name={`${selected.label} forecast`} stroke={selected.color} strokeWidth={1.7} strokeDasharray="5 4" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
          {evaluation && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontFamily: 'monospace', fontSize: 9 }}>
              <Score label="MAE" value={evaluation.mae} />
              <Score label="MAPE" value={`${evaluation.mape}%`} />
              <Score label="Naïve MAE" value={evaluation.naiveMae} />
              <Score label="vs naïve" value={`${evaluation.improvementPct}%`} />
            </div>
          )}
        </>
      )}
    </ChartPanel>
  );
}

function Score({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.035)', borderRadius: 3, padding: '4px 8px' }}>
      <span style={{ color: 'rgba(255,255,255,.35)' }}>{label} </span>
      <span style={{ color: 'rgba(255,255,255,.75)' }}>{value}</span>
    </div>
  );
}
