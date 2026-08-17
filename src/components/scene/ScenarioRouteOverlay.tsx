'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useAppStore } from '@/stores/app-store';
import { geodeticToCartesian } from '@/lib/utils/coordinates';
import type { RouteSummary } from '@/lib/scenarios/types';

const STATION_COORDINATES: Record<string, { lat: number; lon: number }> = {
  'gs-ballinspittle-ie': { lat: 51.65, lon: -8.58 },
  'gs-goonhilly-uk': { lat: 50.05, lon: -5.18 },
  'gs-kuparuk-ak': { lat: 70.33, lon: -149.59 },
  'gs-fairbanks-ak': { lat: 64.84, lon: -147.72 },
  'gs-redmond-wa': { lat: 47.67, lon: -122.12 },
  'gs-prosser-wa': { lat: 46.21, lon: -119.77 },
};

export default function ScenarioRouteOverlay() {
  const result = useAppStore((state) => state.scenarioResult);
  const lines = useMemo(() => {
    if (!result) return [];
    return [
      createRouteLine(result.observer, result.baselineRoute, '#00d4ff', true),
      createRouteLine(result.observer, result.degradedRoute, '#ff4fd8', false),
    ].filter((line): line is THREE.Line => line !== null);
  }, [result]);

  useEffect(
    () => () => {
      for (const line of lines) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    },
    [lines],
  );

  if (!result) return null;
  return (
    <group renderOrder={20}>
      {lines.map((line, index) => <primitive key={`${result.scenarioId}-${index}`} object={line} />)}
    </group>
  );
}

function createRouteLine(
  observer: { lat: number; lon: number },
  route: RouteSummary | null,
  color: string,
  dashed: boolean,
): THREE.Line | null {
  if (!route) return null;
  const station = STATION_COORDINATES[route.groundStationId];
  if (!station) return null;

  const startRaw = geodeticToCartesian(toRadians(observer.lat), toRadians(observer.lon), 0, 1);
  const endRaw = geodeticToCartesian(toRadians(station.lat), toRadians(station.lon), 0, 1);
  const start = new THREE.Vector3(startRaw.x, startRaw.y, startRaw.z).normalize();
  const end = new THREE.Vector3(endRaw.x, endRaw.y, endRaw.z).normalize();
  const points = Array.from({ length: 65 }, (_, index) => {
    const progress = index / 64;
    const point = start.clone().lerp(end, progress).normalize();
    const hopLift = Math.min(0.38, 0.13 + route.hopCount * 0.045);
    return point.multiplyScalar(1.012 + Math.sin(Math.PI * progress) * hopLift);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.55, dashSize: 0.035, gapSize: 0.02, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
