# IBM Bob Development Record

IBM Bob must be the primary development tool for the August challenge. This
file is an evidence log, not a marketing claim: add an entry immediately after
each real Bob session and link the matching commit. Do not claim uncaptured or
unperformed Bob work.

## Required setup

1. Open this exact repository in IBM Bob; do not generate another app.
2. Run `/init` and retain Bob's generated project instructions.
3. Confirm the working branch contains the restored upstream Git history and
   Git LFS assets.
4. Use Plan mode first, then Agent mode with one bounded subsystem prompt.
5. Run the validation command shown in each prompt before accepting changes.
6. Capture a screenshot showing Bob, this repository name, the prompt, result,
   and validation output. Store it under `docs/bob-evidence/`.

## Bobcoin-efficient prompts

### Session 1 — scenario audit

> In this existing Next.js repository, review only `src/lib/scenarios`, its API
> route, and tests. Preserve all existing Starlink visualization behavior.
> Check deterministic routing, disabled-asset handling, evidence traceability,
> and 64 KB validation. Make only necessary fixes. Run the focused scenario
> tests and TypeScript check.

### Session 2 — watsonx audit

> Review only `src/lib/ai` and `src/app/api/ai`. Verify IBM IAM token caching,
> 20-second timeout, one retry, Granite model IDs, schema validation, evidence
> grounding, quota-safe cache/fallback behavior, and server-only credentials.
> Do not add paid services. Run the focused AI tests and TypeScript check.

### Session 3 — UI integration

> Review the additive Mission Ops HUD and Granite Fleet chart. Preserve the
> existing HUD, Space/Sky/Fleet views, Three.js renderer, Zustand patterns, and
> mobile behavior. Improve only functional integration or accessibility. Run
> all tests and the production build.

### Session 4 — deployment and final validation

> Audit the existing Docker packaging and Vercel Hobby deployment. Confirm
> port 7860 remains valid for Docker, `DEMO_MODE=true` is active publicly,
> server-only secret handling is preserved, and cache-only behavior works
> without IBM credentials. Record that new Hugging Face compute Spaces became
> paid in July 2026. Do not introduce Code Engine, paid plans, hardware,
> storage, databases, or APIs. Run the full release checklist.

## Evidence log

| Date/time | Bob mode | Prompt/session | Files/commit | Validation | Screenshot |
|---|---|---|---|---|---|
| 2026-08-17 00:20–00:31 CDT | Agent (`/init`) | Initialized this exact repository and generated project-aware guidance without replacing the application. | `AGENTS.md`, `.bob/rules-agent/AGENTS.md`, `.bob/rules-ask/AGENTS.md`, `.bob/rules-plan/AGENTS.md` | Bob completed all 8 initialization tasks; 0.597 Bobcoins used. | [`01-bob-init-complete.png`](docs/bob-evidence/01-bob-init-complete.png) |
| 2026-08-17 00:32–00:43 CDT | Plan | Bounded, read-only audit of scenarios, AI APIs, Mission Ops, Granite Fleet integration, security, fallback behavior, and zero-cost constraints. | `leo-sentinel-audit-plan.md` (current evidence commit) | Inspected the scoped implementation and proposed only three code corrections plus documentation/tests; cumulative usage 2.52 Bobcoins. | [`02-bob-audit-plan.png`](docs/bob-evidence/02-bob-audit-plan.png) |
| 2026-08-17 00:44–00:52 CDT | Agent | Implemented the verified audit fixes in place: server-only credentials, quota-safe brief retry, honest forecast fallback labeling, and regression coverage. | AI routes/library/tests, `.env.example`, `vitest.config.mts`, package metadata (current evidence commit) | Bob: TypeScript clean, focused tests 22/22, production build clean. Independent check: 44 files/362 tests pass, TypeScript clean, focused tests 22/22, production build clean, Docker image builds. Cumulative usage 7.25 Bobcoins. | [`03-bob-audit-result.png`](docs/bob-evidence/03-bob-audit-result.png) |

## Submission evidence checklist

- [x] `/init` output retained in the repository or screenshot evidence.
- [x] Bob produced a repository-wide audit covering each hackathon subsystem and authored the verified AI safety fixes in the current evidence commit.
- [x] Screenshots show Bob operating on this exact repository.
- [x] Prompts and outcomes are recorded honestly in the table above.
- [ ] Both team members completed the required IBM SkillsBuild activity.
