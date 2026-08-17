# Project Coding Rules (Non-Obvious Only)

## Never Re-implement — Extend These
- `haversineKm()` / `angularDeltaDeg()` → `src/lib/utils/coordinates.ts`
- TLE year parsing → `src/lib/satellites/tle-parse.ts`
- Shell index/color/altitude → `SHELLS`, `shellIndexForInclination`, `isOperationalAltitude` in `src/lib/config.ts`
- ENU az/el → `src/lib/utils/observer-frame.ts` only (`dish-frame.ts` is a thin wrapper; do not create a third)

## Satellite Index Invalidation
- TLE refresh or altitude-filter toggle rebuilds the catalog → **all stored satellite indices become invalid**.
- Any code holding indices across frames must watch `satellitesVersion` and call `resetRouteState()`.

## Render-loop Performance
- Dome direction = `normalize(satPos − observer.pos)` — **do not** round-trip through `computeAzElFrom` → `azElToDirection3D` per satellite (6 trig + 2 allocs each).
- Instanced mesh color updates: track dirty ranges, upload via `addUpdateRange`; call `clearUpdateRanges()` before a full rewrite.

## Ground Stations Consumer Pattern
- Consumers caching derived station data must watch the `groundStationsVersion` counter for invalidation.
- Tests inject stations via `applyStations(stations)` — never hit the HF API in tests.
- `planned` stations and `pop`-type entries are **excluded from routing** in `isl-pathfinder.ts`.

## WebSocket
- Always use type guards from `src/lib/websocket/protocol.ts` before dereferencing message fields — never cast raw.

## Coordinate System
- Earth radius = 1 unit; altitude mapped as `1 + altKm / 6371`.
- Axis: X = cos(lat)cos(lon), Y = sin(lat), Z = −cos(lat)sin(lon).

## Demo / PoP Ownership
- `detectedPop` in satellite-store is owned by app-store demo actions (`setDemoMode`/`setDemoLocation`). The rDNS fetcher must never overwrite it when a demo location is active.

## ISL Log Test Isolation
- Use `ISL_LOG_PATH` env var to redirect the log file in tests (avoid polluting `isl-route.log`).

## Shells — Adding a New Shell
- One row in `SHELLS` + one band in `SHELL_ALT_BANDS` in `config.ts`. That's it — everything else derives from it.

## `reactStrictMode: false`
- Intentional in `next.config.ts`; do not enable (breaks R3F render loop assumptions).

## No Linter/Formatter
- Follow surrounding code style; `tsc --noEmit` is the only static check in CI.
