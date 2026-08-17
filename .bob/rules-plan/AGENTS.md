# Project Architecture Constraints (Non-Obvious Only)

## Server topology
- `server.ts` owns: dish gRPC polling, WebSocket broadcast, demo-mode detection, `/api/mode` endpoint.
- Next.js API routes own everything else; they cannot access the dish connection directly.
- Demo mode is tri-state: `true` / `false` / `auto` (auto = try dish, fall back to mock).

## State invalidation chains
- `groundStationsVersion` (satellite-store) must be bumped whenever ground stations change — **all** derived arrays (3D positions, backhaul RTT, pathfinder neighbor lists, held route) recompute lazily on the next read.
- `satellitesVersion` must be bumped on TLE refresh / altitude filter toggle — all satellite index references elsewhere become stale.
- `resetRouteState()` must be called by `SatellitePropagator` on catalog rebuilds to clear the ISL pathfinder's held route.

## ISL pathfinder constraints
- Routes only use ISL when no GS is directly visible (ISL is mandatory, not preferred).
- `findBestRoute()` returns `null` rather than an impossible route — callers must handle null.
- Route hold is 30s + LoS re-check; held route is invalidated on `groundStationsVersion` change.
- PoP constraint limits GS candidates to within 1,500 km of detected PoP city.

## Rendering architecture
- 3D scene must be dynamically imported with SSR disabled.
- Shared position buffer (Float32Array in satellite-store) is written by `SatellitePropagator` and read by both Space and Sky view renderers — no component should duplicate propagation.
- Instanced mesh renderers must use `addUpdateRange` / `clearUpdateRanges` pattern — avoid full buffer uploads every frame.

## Ground station routing exclusions
- `type: 'pop'` and `status: 'planned'` stations are rendered but **must not** be included as routing candidates in `isl-pathfinder.ts`.
- 5 km dedup in the update script never merges across `type` — a co-located PoP must not silently replace a routable gateway.

## Fleet DB
- `better-sqlite3` is a native Node module; version mismatches after Node upgrades require `npm rebuild better-sqlite3`.
- Fleet DB uses WAL mode; status classification requires a sliding window of 3+ TLE epochs before producing a result.
- Only `STARLINK-\d+` NORAD names are ingested — Starshield and debris objects are intentionally excluded.

## CI constraints
- CI gate order is fixed: `tsc --noEmit` → `npm test` → `npm run build`.
- GitHub Actions must use Node 24-compatible action majors (e.g., `checkout@v6`) — Node 20-era actions were removed in 2026.
- Ground station auto-update PR requires the repo setting "Allow GitHub Actions to create and approve pull requests".
