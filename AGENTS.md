# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project

Real-time 3D Starlink satellite visualization (Next.js 16 / React 19 / React Three Fiber / Three.js). Custom Node.js server wraps Next.js (`server.ts`), run with `npx tsx watch server.ts`.

## Commands

| Purpose | Command |
|---|---|
| Dev (backend + Next.js) | `npm run dev` |
| Dev (Next.js only, no dish polling) | `npm run dev:next` |
| Build | `npm run build` |
| All tests | `npm run test` |
| Single test | `npx vitest run src/__tests__/coordinates.test.ts` |
| Type check (CI gate) | `npx tsc --noEmit` |
| Update ground stations data | `npm run update-gs` |
| Ingest fleet TLEs to SQLite | `npm run ingest` |

- No linter or formatter configured.
- CI order: `tsc --noEmit` → `npm test` → `npm run build`.
- If fleet DB tests fail with `NODE_MODULE_VERSION` mismatch: `npm rebuild better-sqlite3`.

## Code Style

- TypeScript strict mode; `@/` path alias maps to `src/`.
- `reactStrictMode: false` in `next.config.ts` — intentional, do not enable.
- Scene (`src/components/scene/`) is always dynamically imported with SSR disabled.
- No `eslint` or `prettier` — follow surrounding code style.

## Architecture: Critical Non-Obvious Rules

### Single-source utilities — never re-implement, always extend:
- Haversine + angular delta: `src/lib/utils/coordinates.ts` (`haversineKm`, `angularDeltaDeg`)
- TLE year/designator parsing: `src/lib/satellites/tle-parse.ts` (`parseLaunchYear`, `parseLaunchInfoFromLine1`)
- Shell classification (color, index, altitude band): `SHELLS`, `shellIndexForInclination`, `isOperationalAltitude` in `src/lib/config.ts`
- ENU az/el frame: `src/lib/utils/observer-frame.ts` — the **only** ENU implementation; `dish-frame.ts` is a thin wrapper with baked-in lat/lon

### Coordinate system:
- Unit sphere for Earth (radius = 1); satellite altitude mapped as `1 + altKm / 6371`
- X = cos(lat)cos(lon), Y = sin(lat), Z = −cos(lat)sin(lon)
- In render loops, compute dome direction as `normalize(satPos − observer.pos)` — **do not** round-trip through `computeAzElFrom` → `azElToDirection3D` (~6 trig calls + 2 allocations per satellite); use az/el only for a selected satellite

### Satellite indices are unstable:
- TLE refresh or altitude-filter toggle rebuilds the entire catalog → all satellite indices are invalidated.
- Any consumer holding indices across frames must hook `satellitesVersion` and clear on `resetRouteState()`.

### Ground stations — lazy recomputation pattern:
- `GROUND_STATIONS` starts empty; populated via `refreshGroundStations()` which returns `boolean` success.
- All derived data (3D positions, backhaul RTT, pathfinder arrays, held route) recomputed lazily via `groundStationsVersion` counter — new consumers caching derived station data must watch it.
- Tests populate stations synthetically via `applyStations(stations)`.
- Planned stations and PoP entries are **excluded from gateway routing** in `isl-pathfinder.ts`.
- `type` field: `'gateway' | 'pop'`; `status` field: `'operational' | 'planned'`.

### ISL pathfinder:
- `findBestRoute()` returns `null` if no GS is visible — never a through-the-Earth path.
- Routes held 30s with LoS validity check; invalidated on `groundStationsVersion` change and catalog rebuild.
- Behavioral tests in `src/__tests__/isl-pathfinder-route.test.ts` use `applyStations()` + satellite-store setters.

### WebSocket protocol:
- Typed messages (`status`, `history`, `handoff`, `event`) in `src/lib/websocket/types.ts`.
- Type guards in `src/lib/websocket/protocol.ts` validate data fields, not just `msg.type`. Client **must** use guards — malformed messages are dropped; never cast raw.

### Instanced mesh color updates:
- Track per-instance dirty state; upload only dirty ranges via `addUpdateRange`.
- One-off full rewrites must call `clearUpdateRanges()` first.

### Shells (5 orbital shells):
- 33° (gold), 43° (orange), 53° (blue), 70° (teal), 97.6° (pink-red).
- Single source: `SHELLS` table + `SHELL_ALT_BANDS`/`SHELL_TARGETS` in `config.ts`.
- To add a shell: one row in `SHELLS` + one band in `SHELL_ALT_BANDS`.

### TLE data sources:
- `/api/tle` + `/api/tle-gps` both use `createCachedTleHandler()` in `src/lib/satellites/tle-route-cache.ts` (6h cache, stale-on-error).
- Primary: HF dataset `juliensimon/starlink-tle-latest`; fallback: CelesTrak.
- CelesTrak "Starlink" group may include Starshield/military objects — fleet ingest filters to `STARLINK-\d+` only.

### Fleet DB:
- SQLite at `data/fleet.db` (gitignored); `better-sqlite3` native module.
- Tests use `:memory:` via `initDatabase(':memory:')` + `closeDatabase()` in `afterEach`.
- Status classification in `src/lib/fleet/classify.ts` requires 3+ TLE epochs (sliding window).
- `ISL_LOG_PATH` env var overrides isl-route.log path (used by tests).

### Demo mode:
- `DEMO_MODE` env: `true`/`false`/`auto` (default `auto` — auto-detects dish).
- Demo location overrides dish position, satellite selection, and PoP constraint.
- `detectedPop` in satellite-store is owned by app-store demo actions — the rDNS fetcher never overwrites an active demo location.

### CI Actions pin:
- GitHub Actions pinned to Node 24-compatible majors (`checkout@v6`, `setup-node@v6`, `create-pull-request@v8`) — GitHub dropped Node 20 action support in 2026.
