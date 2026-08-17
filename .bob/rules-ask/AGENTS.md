# Project Documentation Context (Non-Obvious Only)

## Canonical documentation source
- `CLAUDE.md` in the project root is the authoritative reference — more complete than README.md.

## Counterintuitive structure
- `server.ts` (root) is the real entry point, not a Next.js file — it wraps Next.js with a custom HTTP + WebSocket server.
- `src/app/api/mode` route does **not** handle the `/api/mode` endpoint — that is handled entirely in `server.ts`.
- `SatellitePropagator` and `ConnectionBeam` are **always mounted** regardless of view mode; Sky/Space views only hide visuals.

## Two separate runtime systems
- TLE data: loaded from HF dataset (`juliensimon/starlink-tle-latest`) with CelesTrak fallback — not from `data/` directory at runtime.
- Ground stations: loaded from HF dataset at runtime; `data/ground-stations.json` is only an offline backup written by `npm run update-gs`.

## Fleet vs main app
- `/fleet` is a separate Next.js page with its own SQLite DB (`data/fleet.db`), recharts charts, and ingestion script — largely independent of the real-time 3D scene.

## Altitude bands
- Per-shell altitude bands (`SHELL_ALT_BANDS`) are derived from **SGP4 instantaneous altitudes**, not FCC filings — they can differ by 100+ km and should be revalidated periodically.

## ISL heuristic
- ISL capability is a heuristic (launch year + inclination), not authoritative data.

## Demo locations
- 5 preset remote locations where ISL is mandatory (Iceland Gap default). These override dish position AND the PoP constraint.
