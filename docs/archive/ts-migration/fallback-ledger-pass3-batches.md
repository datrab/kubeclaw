# Fallback Ledger Pass 3 Batch Plan

Purpose: define the review/patch batches for Pass 3 before changing remaining unresolved fallback-ledger policy rows.

Pass 3 question for every row:

1. Is this behavior real modern runtime/safety/ops policy?
2. Is it too loose but still valid once typed?
3. Is it legacy compatibility, optional skipping, or fallback authority that should not survive the TypeScript slice?
4. Does it genuinely require a product/operator choice that cannot be resolved from the migration policy?

## Scope

- Source ledger: `fallback-ledger.md` after Pass 2 commit `7cf42a492 docs: tighten fallback ledger pass2 batch 5`.
- Selection: remaining rows whose current Decision starts with `needs user decision`, remaining `rename as canonical behavior/default` rows, plus conditional/ambiguous decision rows.
- Initial rows in scope: **93** (`needs user decision`: 85; leftover `rename as canonical*`: 5; conditional/ambiguous: 3).
- Phase 5 resolved the Buster-owned rows in this plan. Phase 6 resolved the Common/Nova rows owned by the Phase 6 batch plan. Remaining unresolved rows are deferred to named Phase 7+ owners in the Phase 6 resolution note below.
- Batch count: **4**.
- Review format for Discord: use the batch IDs below and discuss decisions as short numbered blocks, not markdown tables.

## Decision labels for later patches

- `DELETE_LEGACY` — delete unnecessary fallback/compat behavior; do not migrate it.
- `STRICTIFY_TS_SLICE` — keep the valid intent but remove loose fallback behavior when the owning TypeScript slice is migrated.
- `KEEP_TYPED_POLICY` — keep only when the behavior is intentional modern runtime/safety/ops policy, then type/name it explicitly.
- `USER_POLICY` — only for an explicit product/operator policy question that migration policy cannot decide.


## Phase 6 resolution note

Phase 6 resolved the Common/Nova rows owned by its batch plan and recorded detailed per-batch evidence in `docs/ts-migration/phase-6-changelogs/P6-B01.md` through `P6-B09.md`, with final audit evidence in `docs/ts-migration/phase-6-completion-audit.md`.

Resolved in Phase 6:

1. Common/Nova contract and observability rows: `P3-041`, `P3-042`, `P3-044`, `P3-045`.
2. Nova public runtime/contract rows: `P3-051`, `P3-052`, `P3-076`.
3. Nova Git/blueprint rows: `P3-053`, `P3-054`, `P3-073`, `P3-074`, `P3-075`.
4. Nova worker/module/scheduling rows: `P3-047`, `P3-060`, `P3-061`, `P3-062`, `P3-063`, `P3-064`, `P3-065`, `P3-066`.
5. Nova gate/review rows owned by the migrated gate slice: `P3-057`, `P3-058`, `P3-059`, `P3-067`, `P3-068`, `P3-069`.
6. Nova polling/completion/session rows: `P3-070`, `P3-083`, `P3-084`, `P3-085`.
7. Nova validation/lint/observability/summary rows: `P3-072`, `P3-077`, `P3-078`, `P3-079`, `P3-080`, `P3-081`, `P3-089`.
8. Nova agent-observability sidecar rows: `P3-071`, `P3-082`.

Remaining unresolved pass3 rows after Phase 6 were outside the Phase 6 owning files and were deferred to named Phase 7 owners:

1. `P3-055` and `P3-056` — resolved in Phase 7 P7-B06 by requiring configured Forge blueprint artifacts and deleting disabled memory/Qdrant recall text.
2. `P3-086`, `P3-087`, and `P3-088` — resolved in Phase 7 P7-B05 by requiring lifecycle refs, failing closed on malformed lifecycle signals, and requiring initialized lifecycle storage paths.
3. `P3-090` — resolved in Phase 7 P7-B06 by failing preflight when required `FORGE.md` blueprint artifacts are missing or unreadable.
4. `P3-091`, `P3-092`, and `P3-093` — resolved in Phase 7 P7-B07 by replacing lint export regex extraction with token-backed parsing, deleting title-regex summary scope grouping, and replacing prompt filename census with structured `agent.spawned` telemetry counts.

## Batch overview

| Batch | IDs | Count | Area mix |
|---|---:|---:|---|
| `P3-B01` | `P3-001..P3-015` | 15 | Buster core/services/tools: 15 |
| `P3-B02` | `P3-016..P3-046` | 31 | Buster core/services/tools: 4; Buster suites: 21; Common shared helpers/contracts: 6 |
| `P3-B03` | `P3-047..P3-069` | 23 | Nova core/registry/config: 9; Nova runners/gates/workers: 14 |
| `P3-B04` | `P3-070..P3-093` | 24 | Nova lifecycle/status-store: 3; Nova services/contracts: 18; Nova tools: 3 |


## Phase 4 resolution note

Phase 4 resolved two rows that were originally listed in this Pass 3 plan because their owning common helper files moved in Phase 4:

1. `P3-043` / `skills/common/pipeline/redaction.ts` — resolved as `KEEP_TYPED_POLICY`; fixed token/secret redaction remains the accepted baseline egress policy and semantic DLP stays out of scope.
2. `P3-046` / `skills/common/pipeline/telemetry.ts` — resolved as `STRICTIFY_TS_SLICE`; telemetry stream/sequence key builders now require typed project/run identity instead of substituting `unknown`.

The remaining Pass 3 rows are outside Phase 4 ownership and remain deferred to their owning future migration/policy batches.

## Batch manifests

### P3-B01 — P3-001..P3-015 (15 decisions)

Area mix: Buster core/services/tools: 15.

- `P3-001` — ledger line 51 — Buster core/services/tools — `skills/buster/buster-pipeline.ts` — public re-export surface — current: DELETE_LEGACY; resolved in Phase 5 P5-B01 by deleting the broad root helper barrel and keeping only the narrow runtime entrypoint/API
- `P3-002` — ledger line 62 — Buster core/services/tools — `skills/buster/pipeline/runners/suite-runner.ts` — unknown suite behavior — current: DELETE_LEGACY; resolved in Phase 5 P5-B03 by making unknown requested suite names typed validation failures
- `P3-003` — ledger line 63 — Buster core/services/tools — `skills/buster/pipeline/runners/suite-runner.ts` — default suite timeout — current: STRICTIFY_TS_SLICE; resolved in Phase 5 P5-B03 by keeping the bounded default only when omitted and rejecting invalid provided timeouts
- `P3-004` — ledger line 65 — Buster core/services/tools — `skills/buster/pipeline/runners/suite-runner.ts` — nonblocking artifact writes — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B03 by preserving suite artifact writes as nonblocking observability side effects
- `P3-005` — ledger line 66 — Buster core/services/tools — `skills/buster/pipeline/services/base-images.ts` — bare image normalization — current: DELETE_LEGACY; resolved in Phase 5 P5-B04 by requiring fully-qualified base-image references
- `P3-006` — ledger line 70 — Buster core/services/tools — `skills/buster/pipeline/services/base-images.ts` — podman inspect/pull failures — current: STRICTIFY_TS_SLICE; resolved in Phase 5 P5-B04 by returning typed degraded image-level failures while keeping cache warmup nonblocking
- `P3-007` — ledger line 73 — Buster core/services/tools — `skills/buster/pipeline/services/capabilities.ts` — `appendDurableOperatorAlert` — current: KEEP_TYPED_POLICY; resolved in Phase 5 by preserving denied-capability durable alert attempts plus sanitized stderr fallback
- `P3-008` — ledger line 79 — Buster core/services/tools — `skills/buster/pipeline/services/discord.ts` — `sendDiscord` webhook delivery — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B05 by preserving non-authoritative Discord webhook delivery with degraded/restored evidence
- `P3-009` — ledger line 81 — Buster core/services/tools — `skills/buster/pipeline/services/git-workflows.ts` — `gitSync` target fallback — current: DELETE_LEGACY; resolved in Phase 5 P5-B02 by requiring explicit deterministic commit hash sync targets
- `P3-010` — ledger line 83 — Buster core/services/tools — `skills/buster/pipeline/services/git-workflows.ts` — `gitPushWithRetry` defaults/rebase handling — current: STRICTIFY_TS_SLICE; resolved in Phase 5 P5-B02 by failing closed after final rebase failure while keeping bounded retries
- `P3-011` — ledger line 86 — Buster core/services/tools — `skills/buster/pipeline/services/orphan-recovery.ts` — persisted active-session evidence fence — current: KEEP_TYPED_POLICY; retained in Phase 5 as diagnostic-only startup evidence, with any future lifecycle recovery authority deferred outside Phase 5
- `P3-012` — ledger line 97 — Buster core/services/tools — `skills/buster/pipeline/services/rate-limit.ts` — liveness failure handling — current: STRICTIFY_TS_SLICE; resolved in Phase 5 P5-B04 by using typed liveness states so gateway/probe degradation preserves monitoring and only confirmed closed sessions move to kill
- `P3-013` — ledger line 100 — Buster core/services/tools — `skills/buster/pipeline/services/runtime-diagnostics.ts` — `projectHint` fallback — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B05 as typed process-level diagnostic project hint policy when task context is unavailable
- `P3-014` — ledger line 123 — Buster core/services/tools — `skills/buster/pipeline/services/task-lifecycle/git-sync.ts` — fast-forward sync mode — current: DELETE_LEGACY; resolved in Phase 5 P5-B02 by removing implicit fast-forward sync and requiring deterministic commit hash identity
- `P3-015` — ledger line 124 — Buster core/services/tools — `skills/buster/pipeline/services/task-lifecycle/session.ts` — default model — current: DELETE_LEGACY; remove hardcoded model fallback and require an explicit typed session model or external operator-default normalization before spawn

### P3-B02 — P3-016..P3-046 (31 decisions)

Area mix: Buster core/services/tools: 4; Buster suites: 21; Common shared helpers/contracts: 6.

- `P3-016` — ledger line 152 — Buster suites — `skills/buster/pipeline/suites/a11y.ts` — informational mode — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B07 by preserving evidence-only accessibility findings when no blocking threshold is configured
- `P3-017` — ledger line 155 — Buster suites — `skills/buster/pipeline/suites/api.ts` — spec absence skips — current: DELETE_LEGACY; resolved in Phase 5 P5-B06 by failing requested API suites with missing spec/tests as contract failures
- `P3-018` — ledger line 157 — Buster suites — `skills/buster/pipeline/suites/api.ts` — informational mode — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B06 by preserving evidence-only API findings when no blocking threshold is configured
- `P3-019` — ledger line 164 — Buster suites — `skills/buster/pipeline/suites/build.ts` — unresolved secret placeholder — current: DELETE_LEGACY; resolved in Phase 5 P5-B06 by failing build/env validation on missing required secrets
- `P3-020` — ledger line 169 — Buster suites — `skills/buster/pipeline/suites/bundle.ts` — missing build output skip — current: DELETE_LEGACY; resolved in Phase 5 P5-B07 by making requested bundle output absence a contract failure
- `P3-021` — ledger line 170 — Buster suites — `skills/buster/pipeline/suites/bundle.ts` — informational mode — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B07 by preserving evidence-only bundle findings when no blocking threshold is configured
- `P3-022` — ledger line 172 — Buster suites — `skills/buster/pipeline/suites/e2e.ts` — missing tests skip — current: DELETE_LEGACY; resolved in Phase 5 P5-B07 by making requested missing E2E tests a contract failure
- `P3-023` — ledger line 174 — Buster suites — `skills/buster/pipeline/suites/e2e.ts` — informational mode — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B07 by preserving evidence-only E2E failures when no blocking threshold is configured
- `P3-024` — ledger line 178 — Buster suites — `skills/buster/pipeline/suites/health.ts` — Playwright smoke unavailable — current: DELETE_LEGACY; resolved in Phase 5 P5-B06 by failing requested smoke navigation when browser dependency/setup is unavailable
- `P3-025` — ledger line 181 — Buster suites — `skills/buster/pipeline/suites/k8s.ts` — missing config skip — current: DELETE_LEGACY; resolved in Phase 5 P5-B06 by making requested K8s deployment config absence a contract failure
- `P3-026` — ledger line 184 — Buster suites — `skills/buster/pipeline/suites/k8s.ts` — secret copy best-effort — current: DELETE_LEGACY; resolved in Phase 5 P5-B06 by failing required secret propagation failures
- `P3-027` — ledger line 191 — Buster suites — `skills/buster/pipeline/suites/manifest.ts` — missing deployment skip — current: DELETE_LEGACY; resolved in Phase 5 P5-B06 by making requested missing deployment YAML a contract failure
- `P3-028` — ledger line 192 — Buster suites — `skills/buster/pipeline/suites/manifest.ts` — optional secret warning — current: DELETE_LEGACY; resolved in Phase 5 P5-B06 by failing required missing/unparseable secret YAML
- `P3-029` — ledger line 194 — Buster suites — `skills/buster/pipeline/suites/manifest.ts` — threshold/informational mode — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B06 by preserving evidence-only manifest findings when no blocking policy is configured
- `P3-030` — ledger line 198 — Buster suites — `skills/buster/pipeline/suites/perf.ts` — informational mode and missing score skip — current: KEEP_TYPED_POLICY plus DELETE_LEGACY; resolved in Phase 5 P5-B07 by preserving no-threshold evidence-only PASS while failing enforced missing Lighthouse categories
- `P3-031` — ledger line 204 — Buster suites — `skills/buster/pipeline/suites/security.ts` — informational mode — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B07 by preserving evidence-only security findings when no blocking threshold is configured
- `P3-032` — ledger line 206 — Buster suites — `skills/buster/pipeline/suites/unit.ts` — missing/no-op tests skip — current: DELETE_LEGACY; resolved in Phase 5 P5-B07 by making requested missing/no-op tests contract failures
- `P3-033` — ledger line 210 — Buster suites — `skills/buster/pipeline/suites/unit.ts` — informational mode — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B07 by preserving evidence-only unit findings when no blocking threshold is configured
- `P3-034` — ledger line 219 — Buster suites — `skills/buster/pipeline/suites/visual-reg.ts` — HTML baseline auto-generation — current: DELETE_LEGACY; resolved in Phase 5 P5-B08 by requiring explicit reviewed baseline artifacts and removing auto-generation from `visual-reg.ts`
- `P3-035` — ledger line 220 — Buster suites — `skills/buster/pipeline/suites/visual-reg.ts` — missing baseline skip — current: DELETE_LEGACY; resolved in Phase 5 P5-B08 by failing closed when explicit baseline evidence is missing
- `P3-036` — ledger line 224 — Buster suites — `skills/buster/pipeline/suites/visual-reg.ts` — informational mode — current: KEEP_TYPED_POLICY; resolved in Phase 5 P5-B08 by preserving evidence-only PASS when thresholds are not configured
- `P3-037` — ledger line 230 — Buster core/services/tools — `skills/buster/pipeline/tools/redis.ts` — sender/consumer identity defaults — current: DELETE_LEGACY; resolved in Phase 5 P5-B08 by requiring explicit `AGENT_NAME` and `REDIS_CONSUMER_NAME`/`AGENT_CONSUMER_NAME`
- `P3-038` — ledger line 241 — Buster core/services/tools — `skills/buster/pipeline/tools/screenshot.ts` — page JS error warnings — current: DELETE_LEGACY; resolved in Phase 5 P5-B08 by turning page JavaScript errors into typed capture failure evidence
- `P3-039` — ledger line 245 — Buster core/services/tools — `skills/buster/pipeline/tools/verify-task.ts` — no-change success — current: KEEP_TYPED_POLICY with STRICTIFY_TS_SLICE cleanup proof; resolved in Phase 5 P5-B08 by preserving true no-change success while requiring cleanup proof for nontrivial cleanup success
- `P3-040` — ledger line 247 — Buster core/services/tools — `skills/buster/pipeline/tools/verify-task.ts` — cleanup failure nonterminal — current: DELETE_LEGACY; resolved in Phase 5 P5-B08 by making forbidden-file cleanup failures terminal typed helper failures
- `P3-041` — ledger line 254 — Common shared helpers/contracts — `skills/common/pipeline/agent-observability/src/mapping.ts` — temporary plugin.event mappings — current: needs user decision
- `P3-042` — ledger line 258 — Common shared helpers/contracts — `skills/common/pipeline/agent-observability/src/masking.ts` — minimal masking profile — current: needs user decision
- `P3-043` — ledger line 303 — Common shared helpers/contracts — `skills/common/pipeline/redaction.ts` — secret regex scope — current: KEEP_TYPED_POLICY; fixed secret/token redaction remains accepted baseline egress policy and semantic DLP is out of scope
- `P3-044` — ledger line 317 — Common shared helpers/contracts — `skills/common/pipeline/services/rate-limit-contract.ts` — recovery action fallback — current: needs user decision
- `P3-045` — ledger line 320 — Common shared helpers/contracts — `skills/common/pipeline/services/redis-message-contract.ts` — completion canonical-envelope opt-in — current: needs user decision
- `P3-046` — ledger line 324 — Common shared helpers/contracts — `skills/common/pipeline/telemetry.ts` — missing telemetry identity key segments — current: STRICTIFY_TS_SLICE; require typed project/run identity for Redis telemetry keys instead of emitting canonical telemetry under `unknown` segments

### P3-B03 — P3-047..P3-069 (23 decisions)

Area mix: Nova core/registry/config: 9; Nova runners/gates/workers: 14.

- `P3-047` — ledger line 330 — Nova runners/gates/workers — `skills/nova/pipeline/agents/module-worker-control-results.ts` — Buster failure-class inference — current: needs user decision
- `P3-048` — ledger line 372 — Nova core/registry/config — `skills/nova/pipeline/core/config.ts` — unknown top-level fields — current: DELETE_LEGACY; typed runtime config rejects unknown top-level fields
- `P3-049` — ledger line 392 — Nova core/registry/config — `skills/nova/pipeline/core/registry/config-normalization.ts` — custom module discovery reserved — current: STRICTIFY_TS_SLICE; reject unsupported custom discovery without normalizing paths
- `P3-050` — ledger line 393 — Nova core/registry/config — `skills/nova/pipeline/core/registry/validation.ts` — invalid config schema raw-config return — current: DELETE_LEGACY; invalid schemas do not pass raw config onward
- `P3-051` — ledger line 397 — Nova core/registry/config — `skills/nova/pipeline/core/runtime.ts` — fallback run context — current: delete legacy runtime globals/fallback identity
- `P3-052` — ledger line 400 — Nova core/registry/config — `skills/nova/pipeline/index.ts` — public barrel surface — current: DELETE_LEGACY; narrow public API and require direct owning-module imports for telemetry/notification/internal helpers
- `P3-053` — ledger line 409 — Nova core/registry/config — `skills/nova/pipeline/integrations/git-worktree.ts` — Git inspection fail-closed or empty fallbacks — current: needs user decision for upstream failure policy
- `P3-054` — ledger line 412 — Nova core/registry/config — `skills/nova/pipeline/integrations/git-worktree.ts` — dormant destructive recovery branch — current: delete if no caller needs it; otherwise require explicit user-approved operation
- `P3-055` — ledger line 421 — Nova core/registry/config — `skills/nova/pipeline/prompts/forge.ts` — substep FORGE.md aggregation — current: DELETE_LEGACY; resolved in Phase 7 P7-B06 by requiring configured substep `FORGE.md` artifacts
- `P3-056` — ledger line 424 — Nova core/registry/config — `skills/nova/pipeline/prompts/forge.ts` — disabled memory recall block — current: DELETE_LEGACY; resolved in Phase 7 P7-B06 by deleting disabled Qdrant/memory recall code
- `P3-057` — ledger line 435 — Nova runners/gates/workers — `skills/nova/pipeline/runners/approval-gate-state.ts` — noncritical audit artifact writes — current: needs user decision
- `P3-058` — ledger line 438 — Nova runners/gates/workers — `skills/nova/pipeline/runners/approval-gate-runner.ts` — timeout continue policy — current: needs user decision
- `P3-059` — ledger line 468 — Nova runners/gates/workers — `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts` — soft-fail fix commit — current: needs user decision
- `P3-060` — ledger line 480 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts` — queued notification suite fallback — current: rename as canonical behavior
- `P3-061` — ledger line 485 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts` — polling Git failure fail-closed — current: rename as canonical behavior
- `P3-062` — ledger line 517 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-forge.ts` — Forge-only Git soft fail — current: needs user decision
- `P3-063` — ledger line 546 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` — stale status age reset without session — current: needs user decision
- `P3-064` — ledger line 553 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts` — unreadable completion state — current: needs user decision
- `P3-065` — ledger line 563 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` — control-file preparation noncritical — current: needs user decision
- `P3-066` — ledger line 574 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts` — unknown next type defaults to module — current: needs user decision
- `P3-067` — ledger line 606 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-task.ts` — lint report unavailable fallback — current: needs user decision
- `P3-068` — ledger line 607 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-task.ts` — artifact writes/copies — current: needs user decision
- `P3-069` — ledger line 609 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-task.ts` — Git commit soft-fail — current: needs user decision

### P3-B04 — P3-070..P3-093 (24 decisions)

Area mix: Nova lifecycle/status-store: 3; Nova services/contracts: 18; Nova tools: 3.

- `P3-070` — ledger line 628 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-forge-completion.ts` — missing repo root — current: needs user decision
- `P3-071` — ledger line 649 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-runtime.ts` — loop defaults and failure handling — current: rename as canonical behavior
- `P3-072` — ledger line 663 — Nova services/contracts — `skills/nova/pipeline/services/arch-validator.ts` — artifact write failures nonterminal — current: needs user decision
- `P3-073` — ledger line 672 — Nova services/contracts — `skills/nova/pipeline/services/blueprint.ts` — architecture fetch fallback — current: needs user decision
- `P3-074` — ledger line 676 — Nova services/contracts — `skills/nova/pipeline/services/blueprint.ts` — pipeline-file-only conflict recovery — current: needs user decision
- `P3-075` — ledger line 678 — Nova services/contracts — `skills/nova/pipeline/services/blueprint.ts` — gate/control commit failures noncritical — current: needs user decision
- `P3-076` — ledger line 714 — Nova services/contracts — `skills/nova/pipeline/services/contracts/index.ts` — contract namespace barrel — current: needs user decision: keep broad barrel or require direct imports
- `P3-077` — ledger line 749 — Nova services/contracts — `skills/nova/pipeline/services/failures/presentation.ts` — Gateway aborted response handling — current: needs user decision
- `P3-078` — ledger line 753 — Nova services/contracts — `skills/nova/pipeline/services/failures/retry-policy.ts` — resume command default — current: needs user decision
- `P3-079` — ledger line 768 — Nova services/contracts — `skills/nova/pipeline/services/lint.ts` — missing lint-report tool — current: needs user decision
- `P3-080` — ledger line 770 — Nova services/contracts — `skills/nova/pipeline/services/lint.ts` — unparseable report handling — current: needs user decision
- `P3-081` — ledger line 786 — Nova services/contracts — `skills/nova/pipeline/services/observability.ts` — budget check failure not exceeded — current: needs user decision
- `P3-082` — ledger line 788 — Nova services/contracts — `skills/nova/pipeline/services/openclaw-plugin-runtime.ts` — default command/plugin/timeout — current: rename as canonical behavior
- `P3-083` — ledger line 803 — Nova services/contracts — `skills/nova/pipeline/services/polling-session-end.ts` — Git polling fallbacks — current: needs user decision
- `P3-084` — ledger line 806 — Nova services/contracts — `skills/nova/pipeline/services/polling-session-end.ts` — session closed no changes success envelope — current: needs user decision
- `P3-085` — ledger line 807 — Nova services/contracts — `skills/nova/pipeline/services/polling.ts` — — — current: needs user decision: keep non-repo polling or require repo root
- `P3-086` — ledger line 876 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts` — — — current: DELETE_LEGACY; resolved in Phase 7 P7-B05 by requiring typed lifecycle primary refs
- `P3-087` — ledger line 879 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-lifecycle/projections.ts` — — — current: DELETE_LEGACY; resolved in Phase 7 P7-B05 by failing closed on malformed canonical lifecycle signals
- `P3-088` — ledger line 888 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-lifecycle/storage.ts` — — — current: DELETE_LEGACY; resolved in Phase 7 P7-B05 by requiring initialized run log paths
- `P3-089` — ledger line 912 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — review Discord post failure as success — current: needs user decision
- `P3-090` — ledger line 944 — Nova services/contracts — `skills/nova/pipeline/services/validation.ts` — missing `FORGE.md` preflight skip — current: DELETE_LEGACY; resolved in Phase 7 P7-B06 by failing preflight with typed validation failures
- `P3-091` — ledger line 961 — Nova tools — `skills/nova/pipeline/tools/lint-report/parsers.ts` — regex export extraction — current: STRICTIFY_TS_SLICE; resolved in Phase 7 P7-B07 with token-backed export parsing
- `P3-092` — ledger line 976 — Nova tools — `skills/nova/pipeline/tools/project-summary-formatters.ts` — scope grouping regexes — current: DELETE_LEGACY; resolved in Phase 7 P7-B07 by using structured module scope/category metadata
- `P3-093` — ledger line 985 — Nova tools — `skills/nova/pipeline/tools/project-summary.ts` — prompt filename census — current: DELETE_LEGACY; resolved in Phase 7 P7-B07 by using structured `agent.spawned` telemetry
