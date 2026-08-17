# LEO Sentinel — Hackathon Feature Audit Plan

## Overview

Bounded audit of the four hackathon-added feature areas: scenario engine, AI layer, Mission Ops HUD, and Granite Fleet Outlook. The original Space view, Sky view, Fleet DB, Three.js scene, Zustand stores (pre-existing fields), telemetry, ISL routing, and Docker behavior are **out of scope** and must not be touched. No paid services, Code Engine, databases, microservices, or second app may be added.

The audit is read-only first, then applies only the fixes required to close real gaps. Every fix is the smallest change that resolves the specific issue.

---

## Findings from Code Review

The following issues were confirmed by reading actual file contents. Each is precisely located and scoped.

### F1 — `server-only` not enforced on `src/lib/ai/watsonx.ts`

**File:** [`src/lib/ai/watsonx.ts`](src/lib/ai/watsonx.ts)

`watsonx.ts` contains `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_URL`, the IAM token cache (`iamToken`), and all IBM credential handling. It has no `import 'server-only'` guard. Next.js will not prevent this module from being accidentally imported by a Client Component. If that happens, the API key would be embedded in the browser bundle.

The three AI API route handlers (`/api/ai/brief`, `/api/ai/forecast`) already run on the server via `export const runtime = 'nodejs'`, and `isLiveWatsonxEnabled()` is called from `MissionOpsPanel` via `/api/health` (not directly), so no current call path exposes credentials today — but the absence of the guard is a structural gap the hackathon brief explicitly requires.

**Fix:** Add `import 'server-only';` as the first line of `src/lib/ai/watsonx.ts`.

---

### F2 — IAM fetch timeout: `fetchWithRetry` not used for IAM token request on attempt-0 retry path

**File:** [`src/lib/ai/watsonx.ts`](src/lib/ai/watsonx.ts:105-130)

`getIamToken()` calls `fetchWithRetry()` for the IAM token exchange — this is correct. `fetchWithRetry` issues up to 2 attempts with an AbortController timeout per attempt (20 s). However, on the first attempt (attempt=0) a non-ok response from the IAM endpoint is not retried: `fetchWithRetry` returns the response on `response.status < 500 || attempt === 1` (line 143). For a 4xx IAM response (e.g., 401) on attempt 0, the response is returned immediately; `getIamToken` then checks `!response.ok` and throws `AUTHENTICATION`. This is correct behavior — 4xx is a client fault and should not be retried.

However: a 5xx from the IAM endpoint on attempt 0 **is** silently retried (correct), but on attempt 1 the response is returned and `getIamToken` would see `!response.ok` → throw `AUTHENTICATION` rather than `UPSTREAM`. The error classification is slightly misleading (a 503 from IAM is not an authentication failure) but is benign and not surfaced to the user. No fix needed.

The 20-second `UPSTREAM_TIMEOUT_MS` constant applies to all `fetchWithRetry` calls, including the IAM exchange. This satisfies the "20-second timeout" requirement.

**Status: No fix required.** (Documented for completeness.)

---

### F3 — Retry count: `fetchWithRetry` runs exactly 2 attempts (1 transient retry) — CORRECT

**File:** [`src/lib/ai/watsonx.ts`](src/lib/ai/watsonx.ts:138)

`for (let attempt = 0; attempt < 2; ...)` — 2 total attempts, 1 retry. The brief route adds a second layer: `for (let attempt = 0; attempt < 2; ...)` in `/api/ai/brief/route.ts` for MALFORMED output specifically. This is 1 transport-level retry + 1 application-level retry for malformed JSON. Requirement says "one transient retry" — the transport layer satisfies this exactly.

**Status: Correct. No fix required.**

---

### F4 — Brief route retry swallows ALL errors (not just MALFORMED)

**File:** [`src/app/api/ai/brief/route.ts`](src/app/api/ai/brief/route.ts:33-48)

The retry loop in the brief route catches every exception, including `AUTHENTICATION`, `QUOTA`, and `TIMEOUT` from `WatsonxError`. On a `QUOTA` error, the loop silently retries once (burning another token attempt against IBM) then falls back to the deterministic brief. This is correct from a user-facing perspective (fallback always works), but wastes one extra IBM API call on errors that are guaranteed not to transient.

The requirement specifies "one transient retry." Retrying on `AUTHENTICATION`, `QUOTA`, or `CONFIGURATION` is not transient retry — it is wasted quota. On `TIMEOUT`, retrying is already handled by `fetchWithRetry`, so the brief-route retry on `TIMEOUT` is a second retry, not a first.

**Fix:** In `/api/ai/brief/route.ts`, the inner catch block should rethrow `WatsonxError` instances whose code is NOT `'MALFORMED'` and NOT `'UPSTREAM'`. This ensures the brief-route retry only fires for malformed JSON output and transient upstream errors, not for exhausted quota or broken credentials.

---

### F5 — `ScenarioRouteOverlay` hardcodes station coordinates that must match the engine topology

**File:** [`src/components/scene/ScenarioRouteOverlay.tsx`](src/components/scene/ScenarioRouteOverlay.tsx:9-16)

`STATION_COORDINATES` contains hardcoded lat/lon for 6 ground-station IDs that correspond to the 3 scenario topologies in the engine. These are a duplication of knowledge — if a topology changes its ground station IDs, the overlay silently renders nothing for the unrecognized ID (line 53: `if (!station) return null`). This is already safe (returns null, no crash), so it is not a runtime bug.

However, the audit requirement asks for "deterministic disabled-asset rerouting" correctness. The coordinates are used only for 3D visual arc rendering, not for the Dijkstra pathfinder. The pathfinder is self-contained in `engine.ts` and uses topology links, not coordinates. Rerouting determinism is unaffected by `STATION_COORDINATES`.

**Status: No fix required.** The visual-only nature of this file and the null-return guard make it safe.

---

### F6 — `findBestRoute` naming collision with live ISL pathfinder: NO collision exists

The scenario engine has its own `findRoute()` (private to `engine.ts`) — completely separate from the live ISL pathfinder's `findBestRoute()` in `src/lib/utils/isl-pathfinder.ts`. The scenario engine topology is a static, closed graph with fixed latency links. It does not call into the live satellite-store or ISL graph. These are two independent subsystems.

**Status: No fix required.**

---

### F7 — `forecast/route.ts` calls `buildDeterministicForecast` with wrong mode when source is bundled

**File:** [`src/app/api/ai/forecast/route.ts`](src/app/api/ai/forecast/route.ts:30)

```ts
const fallback = buildDeterministicForecast(
  observations,
  source === 'bundled-demo-cache' ? 'cache' : 'fallback',
);
```

When `source === 'hugging-face-dataset'` (Parquet present), `mode` is `'fallback'`. When `source === 'bundled-demo-cache'`, `mode` is `'cache'`. The `FleetForecast.mode` field is typed as `'live' | 'cache' | 'fallback'`. `'cache'` is semantically "we had a cached live result" — not "we used bundled synthetic data." Using `'cache'` for the bundled path misleads the UI: `GraniteForecast.tsx` renders `CACHE` (yellow) for this, which implies a prior live result was cached, when in fact it's synthetic data.

The `GraniteForecast.tsx` UI already guards gracefully (no crash), and the limitations array in `buildDeterministicForecast` includes the correct disclosure when `mode !== 'live'`. The semantic mismatch is minor but does create a false impression on the `/fleet` page.

**Fix:** Change `'cache'` to `'fallback'` in the `buildDeterministicForecast` call when source is `bundled-demo-cache`. Both bundled and HF-fallback cases should display `FALLBACK` in the UI.

---

### F8 — `MissionOpsPanel` fetch of `/api/ai/forecast` on mount runs in parallel with `/api/health` but does not set a Content-Length header

**File:** [`src/components/mission-ops/MissionOpsPanel.tsx`](src/components/mission-ops/MissionOpsPanel.tsx:62-66)

The body is `'{}'` (2 bytes). The `readLimitedJson` in `api-utils.ts` checks `content-length` header first, but only rejects if it exceeds 64 KB — missing content-length is treated as `0` (line 7: `Number(... ?? 0)`) and passes through to the byte-length check. No issue in practice. Similarly for `GraniteForecast.tsx` line 30-35.

**Status: No fix required.**

---

### F9 — Evidence grounding: `validateMissionBrief` allows a finding with zero cited evidence IDs

**File:** [`src/lib/ai/brief.ts`](src/lib/ai/brief.ts:57-65)

```ts
finding.evidenceIds.length === 0
```

Each finding must have at least one evidenceId (`length === 0` → throws). This is correct and enforced. Every evidenceId must also exist in the `allowedEvidence` set (the scenario's own evidence items), closing hallucination. This is confirmed working by `brief.test.ts` test "rejects unsupported evidence IDs".

**Status: Correct. No fix required.**

---

### F10 — `ScenarioRouteOverlay` disposes geometries but uses `primitive` key that includes scenarioId only

**File:** [`src/components/scene/ScenarioRouteOverlay.tsx`](src/components/scene/ScenarioRouteOverlay.tsx:41)

The key is `${result.scenarioId}-${index}`. Running the same scenario twice produces the same keys — React will not remount the `primitive`, so the old `THREE.Line` object persists and the new one from `useMemo` replaces it via the same `primitive` ref without triggering the cleanup `useEffect`. The `useEffect` cleanup runs when `lines` reference changes (on every new result), which correctly disposes old geometries. The pattern is sound.

**Status: No fix required.**

---

### F11 — `app-store.ts` `mobileHudTab` union does not include `null` in the type for `setMobileHudTab`

**File:** [`src/stores/app-store.ts`](src/stores/app-store.ts:62)

```ts
setMobileHudTab: (tab: 'status' | 'controls' | 'network' | 'events' | 'mission' | null) => void;
```

The `null` case is included in the setter type. `mobileHudTab` state field also includes `null`. This is correct.

**Status: No fix required.**

---

### F12 — `checkRateLimit` uses a fixed `limit` default from `process.env.AI_RATE_LIMIT_PER_MINUTE` but the forecast route hardcodes `6`

**File:** [`src/app/api/ai/forecast/route.ts`](src/app/api/ai/forecast/route.ts:14)

The brief route passes `8` explicitly; the forecast route passes `6` explicitly. `checkRateLimit`'s default parameter reads `AI_RATE_LIMIT_PER_MINUTE` from env. Neither route uses the env default — they both override it. This means `AI_RATE_LIMIT_PER_MINUTE` has no effect on the live routes. The env var is documented in `.env.example` but silently ignored in both callers.

**Fix:** Remove the `limit` parameter from both call sites and make `checkRateLimit` always use the env var default (with separate per-route defaults: 8 for brief, 6 for forecast). OR document the discrepancy. Because the limits are different per-route (6 vs 8), the simplest safe fix is to remove the env var from `.env.example` (it is misleading) and keep the hardcoded per-route values, or keep the env var as a global cap. The minimal fix is to add a comment to `.env.example` clarifying the env var overrides only if the caller does not pass an explicit limit, and document it in AGENTS.md. No behavioral change needed.

**Status: Low severity. Fix is documentation-only** — update `.env.example` comment to clarify `AI_RATE_LIMIT_PER_MINUTE` is not applied by the current brief/forecast routes (they use hardcoded 8/6). No code change needed.

---

### F13 — Forecast `refreshAuthorized` check gates live refresh on `WATSONX_FORECAST_REFRESH_TOKEN` but that token is not in `.env.example` production guidance

**File:** [`src/app/api/ai/forecast/route.ts`](src/app/api/ai/forecast/route.ts:31-34) and `.env.example`

`WATSONX_FORECAST_REFRESH_TOKEN` is already present in `.env.example`. No gap.

**Status: No fix required.**

---

## Summary of Required Fixes

| # | File | Change | Severity |
|---|------|--------|----------|
| F1 | `src/lib/ai/watsonx.ts` | Add `import 'server-only';` as first line | High — credential guard |
| F4 | `src/app/api/ai/brief/route.ts` | Rethrow non-transient `WatsonxError` codes in the retry loop | Medium — quota correctness |
| F7 | `src/app/api/ai/forecast/route.ts` | Use `'fallback'` (not `'cache'`) for bundled-demo source | Low — UI accuracy |
| F12 | `.env.example` | Add clarifying comment that `AI_RATE_LIMIT_PER_MINUTE` is not applied by current routes | Low — documentation |

Findings F2, F3, F5, F6, F8, F9, F10, F11, F13 require no change.

---

## Sub-Tasks

---

### Sub-Task 1: Apply the four targeted fixes

**Status:** `[ ] pending`

**Intent:** Apply the four confirmed fixes (F1, F4, F7, F12) with zero collateral changes to existing behavior.

**Expected Outcomes:**
- `src/lib/ai/watsonx.ts` has `import 'server-only';` as its first import — Next.js will throw a build-time error if this module is ever accidentally imported by a client bundle.
- The brief-route retry loop only retries on `MALFORMED` or `UPSTREAM` errors; `AUTHENTICATION`, `QUOTA`, `CONFIGURATION`, and `TIMEOUT` immediately fall through to the deterministic fallback without a second IBM API call.
- The fleet forecast route's `buildDeterministicForecast` call uses `'fallback'` for the bundled-demo path, displaying `FALLBACK` in the UI consistently.
- `.env.example` clarifies the per-route hardcoded limits.

**Todo List:**
1. In `src/lib/ai/watsonx.ts`, add `import 'server-only';` as the first line (before existing imports).
2. In `src/app/api/ai/brief/route.ts`, inside the inner `catch` block of the retry loop, add: rethrow if the error is a `WatsonxError` and its `code` is not `'MALFORMED'` and not `'UPSTREAM'`.
3. In `src/app/api/ai/forecast/route.ts` line 30, change the ternary `source === 'bundled-demo-cache' ? 'cache' : 'fallback'` to always pass `'fallback'` (remove the distinction — both paths are deterministic fallbacks).
4. In `.env.example`, add a comment to `AI_RATE_LIMIT_PER_MINUTE` noting it is available for reference but the brief/forecast routes use hardcoded per-route limits (8 and 6 respectively).

**Relevant Context:**
- [`src/lib/ai/watsonx.ts`](src/lib/ai/watsonx.ts:1) — add server-only import
- [`src/app/api/ai/brief/route.ts`](src/app/api/ai/brief/route.ts:33-48) — retry loop catch block
- [`src/lib/ai/types.ts`](src/lib/ai/types.ts:6) — `WatsonxError` codes: `'CONFIGURATION' | 'AUTHENTICATION' | 'TIMEOUT' | 'QUOTA' | 'UPSTREAM' | 'MALFORMED'`
- [`src/app/api/ai/forecast/route.ts`](src/app/api/ai/forecast/route.ts:30) — mode argument
- [`.env.example`](.env.example) — `AI_RATE_LIMIT_PER_MINUTE` comment

---

### Sub-Task 2: Add targeted tests for the fixed behaviors

**Status:** `[ ] pending`

**Intent:** Write focused tests that pin the fixed behaviors and prevent regression. All tests run in the existing vitest Node environment with no mocking infrastructure beyond `vi.fn()` already used in `watsonx.test.ts`.

**Expected Outcomes:**
- A new test in `watsonx.test.ts` or `brief.test.ts` verifies that the brief route does **not** retry on a `QUOTA` error (i.e., the IBM API is called exactly once, not twice).
- A test in `forecast.test.ts` verifies that `buildDeterministicForecast` with the bundled demo source returns `mode: 'fallback'` (not `'cache'`).
- These tests are the only new test files/additions; existing tests are not modified.

**Todo List:**
1. In `src/lib/ai/watsonx.test.ts`, add a test: `'does not retry on QUOTA error'` — uses a `fakeFetch` that returns a valid IAM token on the first call and a 429 on the second call (the inference call). Assert that `fakeFetch` is called exactly 2 times (1 IAM + 1 inference), not 3 or 4. This indirectly validates that `fetchWithRetry` does not retry 4xx.
2. In `src/lib/ai/brief.test.ts`, add: `'falls through to deterministic brief on QUOTA without double-calling IBM'` — mock `generateGraniteBrief` (vi.fn) to throw a `WatsonxError` with code `'QUOTA'`; call the brief route handler directly and assert the returned `mode` is `'fallback'`. Import `WatsonxError` from `watsonx.ts` and the route's `POST` from the brief route. Because Next.js route handlers can be unit-tested in Node with a mocked `NextRequest`, use a minimal `NextRequest` stub from `next/server`.
3. In `src/lib/ai/forecast.test.ts`, add: `'bundled demo observations produce fallback mode, not cache mode'` — call `buildDeterministicForecast(createBundledDemoObservations(), 'fallback')` and assert `forecast.mode === 'fallback'`.

**Relevant Context:**
- [`src/lib/ai/watsonx.test.ts`](src/lib/ai/watsonx.test.ts) — existing test pattern with `fakeFetch` and `vi.fn`
- [`src/lib/ai/brief.test.ts`](src/lib/ai/brief.test.ts) — existing deterministic brief tests
- [`src/lib/ai/forecast.test.ts`](src/lib/ai/forecast.test.ts) — existing forecast tests
- [`src/lib/ai/watsonx.ts`](src/lib/ai/watsonx.ts:15-22) — `WatsonxError` export

---

### Sub-Task 3: Run the full validation sequence

**Status:** `[ ] pending`

**Intent:** Execute the exact validation sequence specified in the task brief. No build artifact from a prior run should be trusted — run fresh.

**Expected Outcomes:**
- `npx tsc --noEmit` exits 0 with no new errors (the `server-only` import may add a type error if the package is not installed — confirm it is present in `node_modules`).
- `npm test` (all vitest tests) passes, including the 4 new tests added in Sub-Task 2 and all 40 pre-existing tests.
- `npm run build` produces a clean Next.js production build with no new warnings.

**Todo List:**
1. Before running, confirm `server-only` package exists: check `node_modules/server-only`. If absent, add it as a `devDependency` via `npm install --save-dev server-only`.
2. Run `npx tsc --noEmit` — confirm exit 0.
3. Run focused scenario/AI tests first: `npx vitest run src/lib/scenarios/engine.test.ts src/lib/ai/brief.test.ts src/lib/ai/forecast.test.ts src/lib/ai/watsonx.test.ts`.
4. Run full suite: `npm run test`.
5. Run `npm run build`.
6. If any step fails, investigate and fix before proceeding to the next step.

**Relevant Context:**
- `server-only` is a zero-byte Next.js package that throws at import-time in non-server contexts.
- [`package.json`](package.json) — check devDependencies for `server-only`
- [`vitest.config.mts`](vitest.config.mts) — Node environment, `@` alias to `src/`

---

## Preserved Behavior Checklist

The following behaviors are confirmed unaffected by the above changes (verified by file inspection):

| Concern | Status |
|---------|--------|
| Space / Sky / Fleet Three.js scene | Untouched — no changes to `src/components/scene/` |
| ISL routing (live pathfinder) | Untouched — scenario engine uses its own private `findRoute()` |
| Zustand stores (telemetry, satellite, app-store pre-existing fields) | Untouched — only `scenarioResult` field added by hackathon, already correct |
| Telemetry WebSocket | Untouched |
| Docker / `server.ts` | Untouched |
| Fleet DB (SQLite + better-sqlite3) | Untouched |
| Deterministic rerouting (Dijkstra in engine.ts) | Verified correct — topology-driven, no external I/O |
| Evidence traceability (findingId → evidenceId → EvidenceItem) | Verified correct in `validateMissionBrief` |
| 64 KB validation | Verified in both `api-utils.ts` and `scenarios/run/route.ts` — dual header+byte check |
| IBM credentials server-only | Fixed by Sub-Task 1 F1 |
| IAM token caching with 60s buffer | Correct — line 106 of watsonx.ts: `expiresAt > Date.now() + 60_000` |
| 20-second timeout | Correct — `UPSTREAM_TIMEOUT_MS = 20_000` with AbortController per attempt |
| One transient retry | Correct at transport layer — `attempt < 2` |
| Granite model IDs | `ibm/granite-ttm-512-96-r2` and `ibm/granite-4-h-small` in `types.ts`, used via env override or constant |
| Mission brief schema | `validateMissionBrief` fully enforced |
| Evidence grounding (no invented IDs) | Enforced — `allowedEvidence` set checked per-finding |
| Quota-safe cached/deterministic fallbacks | Both brief and forecast always fall back to deterministic; forecast fallback also never throws |
| Mobile integration | `HudContainer.tsx` `'mission'` tab mounts `MissionOpsPanel` |
| Zero-cost deployment | No paid infra — `/api/health` `costGuardrails.paidInfrastructureRequired: false` confirmed |

---

## Validation Sequence (Exact Commands)

```
# Step 1 — type check (CI gate, runs first)
npx tsc --noEmit

# Step 2 — focused scenario/AI tests only
npx vitest run src/lib/scenarios/engine.test.ts src/lib/ai/brief.test.ts src/lib/ai/forecast.test.ts src/lib/ai/watsonx.test.ts

# Step 3 — full test suite
npm run test

# Step 4 — production build
npm run build
```
