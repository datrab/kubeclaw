# CONFIG externalization checkpoint — 2026-10-15

Scope: centralize operator settings, wire actual consumers and delivery, remove defaults, preserve behavior. No deployment/main merge. Historical C0–C6 authority/graph hardening is not resumed.

## Completed bounded source batches

40 setting identities added during interactive finalization (not total project inventory or percentage): ingestion9, acknowledgment1, launcher7, bootstrap3, engine5, browser8, agent-bridge6, termination-grace1. All bounded batches independently reviewed; concrete findings corrected and rechecked. These are source/consumer completions, not full delivery/runtime acceptance.

- Ingestion has its own authenticated caller; real listener, quarantine/TTL/media/request/source/reaper controls consume the selected central snapshot. Metadata-only acquisition cap bypass fixed after independent review.
- Acknowledgment budget reaches real artifact HTTP clients, Worker closed child assignment and Control accepted attempts. Launcher lifetime/limits plus termination grace persist in the accepted attempt; operation input v3 requires assignment, no fallback/replay of older missing-policy attempts.
- Normal Prism service image sources install emitted role packages, authenticated system generation and own expected caller receipt. Four-service closure remains complete. Main production control/worker bindings explicitly select the complete SPIFFE profile; standard remains an explicit complete profile. DB migration/bootstrap command paths fixed after independent review.
- DB bootstrap uses selected connect timeout, retry count and retry delay; real local Postgres-protocol rejection and TCP timeout tests pass. This is not PostgreSQL credential/role acceptance.
- Native engine cache limits and ingest/render caps cross startup, closed child ENV and host parser into actual engine. A/B/C verifies changed behavior and retained A snapshot.
- Studio browser receives only the closed non-secret browserPolicy from verified startup at /studio-config, with no-store; App waits for valid policy before mounting. Preview aggregate bytes/deadline and three polling loops consume it. Development endpoint reads the same central source. Original Studio-service fixture now authenticates genuine published captures in an isolated emitted-handler child, not a synthetic capture or fixed-path/UID1000 proof.
- Bridge has an explicit separate deployment/caller consuming existing prism-control; no seventh Swarm owner. Separate bridge closure cannot substitute for partial main-service closure. Source image installs actual role and receipt. Bridge deadline/body/poll settings consume its capture; selected probe fields in my-values are generated/checked against canonical policy. Image proof now launches installed entry and reads selected health port. Build-stage snapshot ARG and stale bridge ENV fixed after independent review.

## Verification evidence

Logs under tmp/config-finalization-20261015. Overlapping suites must not be summed as unique coverage.
- ack-boundaries16/16; integration-services18/18; control-startup13/13; image-resource4/4; package-delivery-final1/1.
- delivery-focused8/8; delivery-reviewfix-final5/5; release-binding-final7/7.
- bootstrap-network2/2; engine-core25/25; engine-boundaries16/16; engine-integration7/7.
- browser-original4/4; browser-ab2/2; browser-studio-original10/10; Vite production build exit0.
- bridge-original1/1; bridge-ab-recheck1/1; bridge-image3/3; bridge-attempt16/16; bridge-termination-ab1/1 (real SIGTERM-resistant child consumes retained A/B grace).
- Complete Prism TypeScript check exit0: tsc-final-explicit.log.result.json and bridge-tsc-complete.log. Diff check clean at checkpoint.
- Bounded native independent Codex reviews found metadata-cap P2 and image/delivery P1s; fixed, rechecked no remaining bounded actionable findings. Configured autoreview helper never ran its model: codex executable unavailable. Do not label helper clean.
- Docker absent. Genuine UID1000 local switch denied by host setgroups policy; no spoof or weakened trust. Playwright attempt failed to launch all4 cases because Chromium is absent; not UI verification. Hadolint error threshold passes with recorded warnings, not warning-free.

## Still open — no global completion claim

1. Buster/gateway/kubeclaw chart and image cutover: old kubeclaw helper rejects the already-new schema (required swarm key bindings). code-release-final has7 pass/1 fail. Standalone Prism source delivery passes but agent chart render is NOT accepted. Original prism-swarm-config/config-component-packaging deployment suites retain legacy obligations and need migration.
2. OpenClaw Prism tool plugin still uses config/ENV/fallback Control URL. Bridge itself is fixed; tool-plugin receiving identity and actual image delivery remain separate work.
3. Nova Core/runtime policies, actual registered plugins and project compiler settings: use supported active platform receiving contract; do not activate or bypass denied v10 graph contracts. Concrete remaining batches are in SEMANTIC-RESIDUALS.md.
4. Integrated config-only source/delivery validation, fresh whole-task independent review and final docs. Native Docker/PostgreSQL/full browser acceptance stays separately unverified; unavailable infrastructure does not block unblocked source work.

No C0–C6 completion; no percentage inferred from numeric scans, tests, or elapsed time.
