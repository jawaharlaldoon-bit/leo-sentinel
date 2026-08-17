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

> Audit the existing Docker/Hugging Face Spaces deployment for port 7860,
> `DEMO_MODE=true`, free CPU compatibility, secret handling, and cache-only
> behavior without IBM credentials. Do not introduce Code Engine, paid
> hardware, storage, databases, or APIs. Run the full release checklist.

## Evidence log

| Date/time | Bob mode | Prompt/session | Files/commit | Validation | Screenshot |
|---|---|---|---|---|---|
| _Pending team session_ | — | — | — | — | — |

## Submission evidence checklist

- [ ] `/init` output retained in the repository or screenshot evidence.
- [ ] At least one meaningful Bob-authored/reviewed commit per major subsystem.
- [ ] Screenshots show Bob operating on this exact repository.
- [ ] Prompts and outcomes are recorded honestly in the table above.
- [ ] Both team members completed the required IBM SkillsBuild activity.
