import { getGrowthData } from '@/lib/fleet/hf-dataset';
import { createBundledDemoObservations } from './forecast';
import type { ForecastObservation } from './types';

interface GrowthRow {
  date?: string;
  operational_count?: number;
  total_count?: number;
  raising_count?: number;
  deorbiting_count?: number;
  isl_operational_count?: number;
}

export async function loadFleetForecastInput(): Promise<{
  observations: ForecastObservation[];
  source: 'hugging-face-dataset' | 'bundled-demo-cache';
}> {
  try {
    const rows = (await getGrowthData()) as GrowthRow[];
    const aggregated = aggregateGrowthRows(rows);
    if (aggregated.length >= 512) {
      return { observations: aggregated, source: 'hugging-face-dataset' };
    }
  } catch {
    // The bundled cache keeps the free demo usable when the dataset is not mounted.
  }
  return { observations: createBundledDemoObservations(), source: 'bundled-demo-cache' };
}

export function aggregateGrowthRows(rows: GrowthRow[]): ForecastObservation[] {
  const days = new Map<string, ForecastObservation>();
  for (const row of rows) {
    const date = normalizeDate(row.date);
    if (!date) continue;
    const current = days.get(date) ?? {
      date,
      operational: 0,
      islCapable: 0,
      raising: 0,
      deorbiting: 0,
      anomalous: 0,
    };
    const operational = number(row.operational_count);
    const raising = number(row.raising_count);
    const deorbiting = number(row.deorbiting_count);
    const total = number(row.total_count);
    current.operational += operational;
    current.islCapable += number(row.isl_operational_count);
    current.raising += raising;
    current.deorbiting += deorbiting;
    current.anomalous += Math.max(0, total - operational - raising - deorbiting);
    days.set(date, current);
  }
  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function number(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}
