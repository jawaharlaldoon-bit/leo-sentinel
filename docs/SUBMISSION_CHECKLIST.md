# LEO Sentinel Submission Checklist

## Project and team

- [ ] Add the final public GitHub repository URL to `README.md`.
- [ ] Confirm the original author is authorized and correctly listed as a team member.
- [ ] Complete the required IBM SkillsBuild activity for every team member.
- [ ] Complete `IBM_BOB_USAGE.md` with real prompts, commits, and screenshots.
- [ ] Add names and explicit contributions to the README.

## Zero-cost deployment

- [ ] Create a public Hugging Face Docker Space on free CPU hardware.
- [ ] Confirm `app_port: 7860` and `DEMO_MODE=true`.
- [ ] Add `WATSONX_API_KEY` and `WATSONX_PROJECT_ID` only as Space secrets.
- [ ] Begin with `WATSONX_LIVE_ENABLED=false` and verify cache/fallback mode.
- [ ] Enable Runtime Lite only after confirming the IBM account remains on Lite.
- [ ] Never select persistent paid storage or upgraded hardware.
- [ ] Open the public URL in an incognito window and test Globe, Fleet, and APIs.

## Acceptance test

- [ ] Space and Sky views load and remain interactive.
- [ ] Fleet loads the cached Granite outlook without the Parquet dataset.
- [ ] North Atlantic scenario shows a successful Goonhilly reroute.
- [ ] Isolating Goonhilly produces a no-route critical result.
- [ ] Mission brief cites only evidence IDs shown in the drawer.
- [ ] `/api/health` reports fallback ready and exposes no secrets.
- [ ] Tests, TypeScript, production build, and Docker build pass.

## Three-minute video

- **0:00–0:20** — Operators need fast, explainable answers during LEO outages.
- **0:20–0:40** — Show the retained Space/Sky/Fleet engine and LEO Sentinel layer.
- **0:40–1:25** — Run the North Atlantic outage; compare routes and evidence.
- **1:25–1:55** — Open Fleet; show five signals, 96 days, MAE/MAPE, and naïve baseline.
- **1:55–2:25** — Generate the grounded brief and expand its cited evidence.
- **2:25–2:45** — Show IBM Bob evidence, prompts, and validation commits.
- **2:45–3:00** — Close on resilience impact and the zero-cost architecture.

Keep the published video at or below three minutes and verify it is publicly viewable.
