# Fallback Ledger Pass 2 Batch Plan

Purpose: define the review/patch batches for Pass 2 before changing any remaining `rename as canonical behavior` or `rename as canonical default` ledger decisions.

Pass 2 question for every row:

1. Is this a safety invariant or operational policy?
2. Is it independent of legacy data shape?
3. Would we intentionally design it this way today?

If yes, the later decision patch should mark it as accepted typed policy. If no, the later decision patch should mark it delete/strictify during the owning TypeScript slice. Product semantics stay `USER_POLICY` until explicitly decided.

## Scope

- Source ledger: `fallback-ledger.md`.
- Selection: rows whose current Decision starts with `rename as canonical behavior` or `rename as canonical default`.
- Total rows in scope: **460**.
- Batch count: **12**.
- Batch size target: 30-40 decisions.
- Review format for Discord: use the batch IDs below and discuss decisions as short numbered blocks, not markdown tables.

## Decision labels for later patches

- `KEEP_TYPED_POLICY` — keep because it is intentional modern runtime/safety policy, then type/name it explicitly.
- `STRICTIFY_TS_SLICE` — remove ambiguity/fallback behavior when the owning TypeScript slice is migrated.
- `DELETE_LEGACY` — delete legacy compatibility behavior; do not migrate it.
- `USER_POLICY` — requires an explicit product/operator policy call before changing code or final ledger status.

## Batch overview

| Batch | IDs | Count | Area mix |
|---|---:|---:|---|
| `P2-B01` | `P2-001..P2-039` | 39 | Buster core/services/tools: 39 |
| `P2-B02` | `P2-040..P2-078` | 39 | Buster suites: 30; Buster core/services/tools: 9 |
| `P2-B03` | `P2-079..P2-117` | 39 | Common shared helpers/contracts: 18; Buster core/services/tools: 14; Buster suites: 7 |
| `P2-B04` | `P2-118..P2-156` | 39 | Common shared helpers/contracts: 27; Nova other: 12 |
| `P2-B05` | `P2-157..P2-194` | 38 | Nova runners/gates/workers: 15; Nova other: 14; Nova core/registry/config: 9 |
| `P2-B06` | `P2-195..P2-232` | 38 | Nova runners/gates/workers: 38 |
| `P2-B07` | `P2-233..P2-270` | 38 | Nova runners/gates/workers: 32; Nova services/contracts: 6 |
| `P2-B08` | `P2-271..P2-308` | 38 | Nova services/contracts: 38 |
| `P2-B09` | `P2-309..P2-346` | 38 | Nova services/contracts: 38 |
| `P2-B10` | `P2-347..P2-384` | 38 | Nova services/contracts: 38 |
| `P2-B11` | `P2-385..P2-422` | 38 | Nova services/contracts: 25; Nova lifecycle/status-store: 13 |
| `P2-B12` | `P2-423..P2-460` | 38 | Nova tools: 28; Nova services/contracts: 10 |

## Batch manifests

### P2-B01 — P2-001..P2-039 (39 decisions)

Area mix: Buster core/services/tools: 39.

- `P2-001` — ledger line 64 — Buster core/services/tools — `skills/buster/pipeline/runners/suite-runner.ts` — suite throw/timeout conversion — current: rename as canonical behavior
- `P2-002` — ledger line 67 — Buster core/services/tools — `skills/buster/pipeline/services/base-images.ts` — progress scan fallback — current: rename as canonical behavior
- `P2-003` — ledger line 68 — Buster core/services/tools — `skills/buster/pipeline/services/base-images.ts` — invalid/local image skip — current: rename as canonical behavior
- `P2-004` — ledger line 69 — Buster core/services/tools — `skills/buster/pipeline/services/base-images.ts` — capability denied fallback — current: rename as canonical behavior
- `P2-005` — ledger line 76 — Buster core/services/tools — `skills/buster/pipeline/services/discord.ts` — `discordWebhookDeliveryMuted` — current: rename as canonical behavior
- `P2-006` — ledger line 77 — Buster core/services/tools — `skills/buster/pipeline/services/discord.ts` — missing webhook handling — current: rename as canonical behavior
- `P2-007` — ledger line 78 — Buster core/services/tools — `skills/buster/pipeline/services/discord.ts` — audit/webhook degradation maps — current: rename as canonical behavior
- `P2-008` — ledger line 80 — Buster core/services/tools — `skills/buster/pipeline/services/gateway-health.ts` — health check loops — current: rename as canonical behavior
- `P2-009` — ledger line 82 — Buster core/services/tools — `skills/buster/pipeline/services/git-workflows.ts` — `gitSync` failure return — current: rename as canonical behavior
- `P2-010` — ledger line 84 — Buster core/services/tools — `skills/buster/pipeline/services/logger.ts` — stdout-only fallback — current: rename as canonical behavior
- `P2-011` — ledger line 85 — Buster core/services/tools — `skills/buster/pipeline/services/logger.ts` — optional telemetry hook — current: rename as canonical behavior
- `P2-012` — ledger line 89 — Buster core/services/tools — `skills/buster/pipeline/services/pipeline-helpers.ts` — `ensureBusterOutputFile` — current: rename as canonical behavior
- `P2-013` — ledger line 90 — Buster core/services/tools — `skills/buster/pipeline/services/pipeline-helpers.ts` — `resolveBusterAgentResult` — current: rename as canonical behavior
- `P2-014` — ledger line 91 — Buster core/services/tools — `skills/buster/pipeline/services/pipeline-helpers.ts` — embed builders — current: rename as canonical behavior
- `P2-015` — ledger line 92 — Buster core/services/tools — `skills/buster/pipeline/services/pipeline-helpers.ts` — `doSandboxCleanup` — current: rename as canonical behavior
- `P2-016` — ledger line 95 — Buster core/services/tools — `skills/buster/pipeline/services/rate-limit.ts` — `ownsCanonicalSignal=false` — current: rename as canonical behavior
- `P2-017` — ledger line 99 — Buster core/services/tools — `skills/buster/pipeline/services/runtime-diagnostics.ts` — diagnostic detail normalization — current: rename as canonical behavior
- `P2-018` — ledger line 101 — Buster core/services/tools — `skills/buster/pipeline/services/runtime-diagnostics.ts` — artifact write fallback — current: rename as canonical behavior
- `P2-019` — ledger line 103 — Buster core/services/tools — `skills/buster/pipeline/services/sandbox-cleanup.ts` — malformed cleanup state fallback — current: rename as canonical behavior
- `P2-020` — ledger line 104 — Buster core/services/tools — `skills/buster/pipeline/services/sandbox-cleanup.ts` — best-effort labeled discovery — current: rename as canonical behavior
- `P2-021` — ledger line 105 — Buster core/services/tools — `skills/buster/pipeline/services/sandbox-cleanup.ts` — missing resource ignore patterns — current: rename as canonical behavior
- `P2-022` — ledger line 107 — Buster core/services/tools — `skills/buster/pipeline/services/sandbox-cleanup.ts` — inferred cleanup policy — current: rename as canonical behavior
- `P2-023` — ledger line 108 — Buster core/services/tools — `skills/buster/pipeline/services/sandbox-cleanup.ts` — namespace safety prefix — current: rename as canonical behavior
- `P2-024` — ledger line 111 — Buster core/services/tools — `skills/buster/pipeline/services/session-monitor.ts` — gateway degraded/restored gating — current: rename as canonical behavior
- `P2-025` — ledger line 112 — Buster core/services/tools — `skills/buster/pipeline/services/session-monitor.ts` — hard timeout termination result — current: rename as canonical behavior
- `P2-026` — ledger line 113 — Buster core/services/tools — `skills/buster/pipeline/services/session-monitor.ts` — rate-limit exhaustion — current: rename as canonical behavior
- `P2-027` — ledger line 116 — Buster core/services/tools — `skills/buster/pipeline/services/task-completion.ts` — dead-letter stream fallback — current: rename as canonical behavior
- `P2-028` — ledger line 117 — Buster core/services/tools — `skills/buster/pipeline/services/task-completion.ts` — fallback completion before dead-letter — current: rename as canonical behavior
- `P2-029` — ledger line 118 — Buster core/services/tools — `skills/buster/pipeline/services/task-completion.ts` — completion/dead-letter guarantee failure — current: rename as canonical behavior
- `P2-030` — ledger line 119 — Buster core/services/tools — `skills/buster/pipeline/services/task-lifecycle/cleanup.ts` — optional cleanup completion log — current: rename as canonical behavior
- `P2-031` — ledger line 121 — Buster core/services/tools — `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts` — completion failure capture — current: rename as canonical behavior
- `P2-032` — ledger line 122 — Buster core/services/tools — `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts` — pre-test verdict only without subagent — current: rename as canonical behavior
- `P2-033` — ledger line 125 — Buster core/services/tools — `skills/buster/pipeline/services/task-lifecycle/session.ts` — spawn/monitor error conversion — current: rename as canonical behavior
- `P2-034` — ledger line 127 — Buster core/services/tools — `skills/buster/pipeline/services/task-lifecycle/session.ts` — outcome source fallback — current: rename as canonical behavior
- `P2-035` — ledger line 131 — Buster core/services/tools — `skills/buster/pipeline/services/task-lifecycle.ts` — final cleanup/completion guarantee — current: rename as canonical behavior
- `P2-036` — ledger line 132 — Buster core/services/tools — `skills/buster/pipeline/services/task-queue.ts` — environment stream defaults — current: rename as canonical defaults
- `P2-037` — ledger line 133 — Buster core/services/tools — `skills/buster/pipeline/services/task-queue.ts` — Redis quit fallback — current: rename as canonical behavior
- `P2-038` — ledger line 135 — Buster core/services/tools — `skills/buster/pipeline/services/task-queue.ts` — malformed/unknown task dead-letter before ACK — current: rename as canonical behavior
- `P2-039` — ledger line 136 — Buster core/services/tools — `skills/buster/pipeline/services/task-queue.ts` — task error cleanup fallback — current: rename as canonical behavior

### P2-B02 — P2-040..P2-078 (39 decisions)

Area mix: Buster suites: 30; Buster core/services/tools: 9.

- `P2-040` — ledger line 141 — Buster core/services/tools — `skills/buster/pipeline/services/task-validation.ts` — task-type path boundary set — current: rename as canonical behavior
- `P2-041` — ledger line 143 — Buster core/services/tools — `skills/buster/pipeline/services/telemetry.ts` — disabled/missing telemetry identity — current: rename as canonical behavior
- `P2-042` — ledger line 144 — Buster core/services/tools — `skills/buster/pipeline/services/telemetry.ts` — invalid telemetry payload fallback — current: rename as canonical behavior
- `P2-043` — ledger line 145 — Buster core/services/tools — `skills/buster/pipeline/services/telemetry.ts` — Redis emission fallback — current: rename as canonical behavior
- `P2-044` — ledger line 146 — Buster core/services/tools — `skills/buster/pipeline/services/telemetry.ts` — artifact mirror fallback — current: rename as canonical behavior
- `P2-045` — ledger line 147 — Buster core/services/tools — `skills/buster/pipeline/services/telemetry.ts` — Redis close fallback — current: rename as canonical behavior
- `P2-046` — ledger line 148 — Buster core/services/tools — `skills/buster/pipeline/services/verdict-schema.ts` — suite verdict defaults — current: rename as canonical defaults
- `P2-047` — ledger line 149 — Buster core/services/tools — `skills/buster/pipeline/services/verdict-schema.ts` — runner summary fallbacks — current: rename as canonical behavior
- `P2-048` — ledger line 150 — Buster core/services/tools — `skills/buster/pipeline/services/verdict-schema.ts` — prompt truncation fallback — current: rename as canonical behavior
- `P2-049` — ledger line 151 — Buster suites — `skills/buster/pipeline/suites/a11y.ts` — config defaults — current: rename as canonical defaults
- `P2-050` — ledger line 153 — Buster suites — `skills/buster/pipeline/suites/a11y.ts` — dynamic dependency failures — current: rename as canonical behavior
- `P2-051` — ledger line 154 — Buster suites — `skills/buster/pipeline/suites/a11y.ts` — selector/browser cleanup fallbacks — current: rename as canonical behavior
- `P2-052` — ledger line 156 — Buster suites — `skills/buster/pipeline/suites/api.ts` — spec/default config fallbacks — current: rename as canonical defaults
- `P2-053` — ledger line 159 — Buster suites — `skills/buster/pipeline/suites/api.ts` — response/WebSocket fallbacks — current: rename as canonical behavior
- `P2-054` — ledger line 160 — Buster suites — `skills/buster/pipeline/suites/build.ts` — serve config defaults — current: rename as canonical defaults
- `P2-055` — ledger line 162 — Buster suites — `skills/buster/pipeline/suites/build.ts` — build error parsing fallbacks — current: rename as canonical behavior
- `P2-056` — ledger line 165 — Buster suites — `skills/buster/pipeline/suites/build.ts` — nginx reload/start fallback — current: rename as canonical behavior
- `P2-057` — ledger line 166 — Buster suites — `skills/buster/pipeline/suites/build.ts` — optional Dockerfile pre-build — current: rename as canonical behavior
- `P2-058` — ledger line 168 — Buster suites — `skills/buster/pipeline/suites/build.ts` — crash diagnostics fallback — current: rename as canonical behavior
- `P2-059` — ledger line 171 — Buster suites — `skills/buster/pipeline/suites/bundle.ts` — scan/probe fallbacks — current: rename as canonical behavior; consider unknown-size metadata
- `P2-060` — ledger line 175 — Buster suites — `skills/buster/pipeline/suites/e2e.ts` — Playwright output parser fallback — current: rename as canonical behavior
- `P2-061` — ledger line 176 — Buster suites — `skills/buster/pipeline/suites/health.ts` — health config defaults — current: rename as canonical defaults
- `P2-062` — ledger line 177 — Buster suites — `skills/buster/pipeline/suites/health.ts` — smoke path auto-detection — current: rename as canonical behavior
- `P2-063` — ledger line 179 — Buster suites — `skills/buster/pipeline/suites/health.ts` — smoke criticality split — current: rename as canonical behavior
- `P2-064` — ledger line 180 — Buster suites — `skills/buster/pipeline/suites/health.ts` — browser cleanup fallback — current: rename as canonical behavior
- `P2-065` — ledger line 182 — Buster suites — `skills/buster/pipeline/suites/k8s.ts` — k8s config defaults — current: rename as canonical defaults
- `P2-066` — ledger line 183 — Buster suites — `skills/buster/pipeline/suites/k8s.ts` — safe namespace prefixes — current: rename as canonical behavior
- `P2-067` — ledger line 186 — Buster suites — `skills/buster/pipeline/suites/k8s.ts` — manifest namespace/image rewrite — current: rename as canonical behavior
- `P2-068` — ledger line 187 — Buster suites — `skills/buster/pipeline/suites/k8s.ts` — temp cleanup fallback — current: rename as canonical behavior
- `P2-069` — ledger line 188 — Buster suites — `skills/buster/pipeline/suites/k8s.ts` — pod status fallback — current: rename as canonical behavior
- `P2-070` — ledger line 193 — Buster suites — `skills/buster/pipeline/suites/manifest.ts` — envFrom coverage fallback — current: rename as canonical behavior
- `P2-071` — ledger line 196 — Buster suites — `skills/buster/pipeline/suites/perf.ts` — config defaults — current: rename as canonical defaults
- `P2-072` — ledger line 197 — Buster suites — `skills/buster/pipeline/suites/perf.ts` — Lighthouse error conversion — current: rename as canonical behavior
- `P2-073` — ledger line 199 — Buster suites — `skills/buster/pipeline/suites/repo-paths.ts` — null path return — current: rename as canonical behavior
- `P2-074` — ledger line 200 — Buster suites — `skills/buster/pipeline/suites/repo-paths.ts` — repo prefix stripping — current: rename as canonical behavior
- `P2-075` — ledger line 201 — Buster suites — `skills/buster/pipeline/suites/security.ts` — config defaults — current: rename as canonical defaults
- `P2-076` — ledger line 203 — Buster suites — `skills/buster/pipeline/suites/security.ts` — fetch error conversion — current: rename as canonical behavior
- `P2-077` — ledger line 205 — Buster suites — `skills/buster/pipeline/suites/unit.ts` — test command/project defaults — current: rename as canonical defaults
- `P2-078` — ledger line 208 — Buster suites — `skills/buster/pipeline/suites/unit.ts` — output parser fallback — current: rename as canonical behavior

### P2-B03 — P2-079..P2-117 (39 decisions)

Area mix: Common shared helpers/contracts: 18; Buster core/services/tools: 14; Buster suites: 7.

- `P2-079` — ledger line 209 — Buster suites — `skills/buster/pipeline/suites/unit.ts` — failure extraction fallback — current: rename as canonical behavior
- `P2-080` — ledger line 211 — Buster suites — `skills/buster/pipeline/suites/visual-reg-discord.ts` — no webhook skip — current: rename as canonical behavior
- `P2-081` — ledger line 212 — Buster suites — `skills/buster/pipeline/suites/visual-reg-discord.ts` — delivery failure noncritical — current: rename as canonical behavior
- `P2-082` — ledger line 214 — Buster suites — `skills/buster/pipeline/suites/visual-reg-discord.ts` — attachment caps — current: rename as canonical behavior
- `P2-083` — ledger line 217 — Buster suites — `skills/buster/pipeline/suites/visual-reg.ts` — artifact dir fallback — current: rename as canonical behavior
- `P2-084` — ledger line 222 — Buster suites — `skills/buster/pipeline/suites/visual-reg.ts` — copy artifacts noncritical — current: rename as canonical behavior
- `P2-085` — ledger line 223 — Buster suites — `skills/buster/pipeline/suites/visual-reg.ts` — Discord delivery summary fallback — current: rename as canonical behavior
- `P2-086` — ledger line 231 — Buster core/services/tools — `skills/buster/pipeline/tools/redis.ts` — Redis readiness/group fallbacks — current: rename as canonical behavior
- `P2-087` — ledger line 232 — Buster core/services/tools — `skills/buster/pipeline/tools/redis.ts` — Discord notification optional — current: rename as canonical behavior
- `P2-088` — ledger line 234 — Buster core/services/tools — `skills/buster/pipeline/tools/screenshot.ts` — Playwright browser path fallback — current: rename as canonical behavior
- `P2-089` — ledger line 236 — Buster core/services/tools — `skills/buster/pipeline/tools/screenshot.ts` — local path to file URL fallback — current: rename as canonical behavior
- `P2-090` — ledger line 237 — Buster core/services/tools — `skills/buster/pipeline/tools/screenshot.ts` — missing Playwright conversion — current: rename as canonical behavior
- `P2-091` — ledger line 238 — Buster core/services/tools — `skills/buster/pipeline/tools/screenshot.ts` — nonblocking browser close — current: rename as canonical behavior
- `P2-092` — ledger line 239 — Buster core/services/tools — `skills/buster/pipeline/tools/screenshot.ts` — empty/broken batch handling — current: rename as canonical behavior
- `P2-093` — ledger line 240 — Buster core/services/tools — `skills/buster/pipeline/tools/screenshot.ts` — Prism setup route special-case — current: rename as canonical behavior
- `P2-094` — ledger line 242 — Buster core/services/tools — `skills/buster/pipeline/tools/screenshot.ts` — child filename guard — current: rename as canonical behavior
- `P2-095` — ledger line 243 — Buster core/services/tools — `skills/buster/pipeline/tools/verify-task.ts` — role is non-authoritative — current: rename as canonical behavior
- `P2-096` — ledger line 246 — Buster core/services/tools — `skills/buster/pipeline/tools/verify-task.ts` — selective revert fallback — current: rename as canonical behavior
- `P2-097` — ledger line 250 — Buster core/services/tools — `skills/buster/pipeline/tools/visual-audit.ts` — mode default and validation — current: rename as canonical behavior
- `P2-098` — ledger line 251 — Buster core/services/tools — `skills/buster/pipeline/tools/visual-audit.ts` — page load warning fallback — current: rename as canonical behavior
- `P2-099` — ledger line 253 — Buster core/services/tools — `skills/buster/pipeline/tools/visual-audit.ts` — temp directory cleanup — current: rename as canonical behavior
- `P2-100` — ledger line 255 — Common shared helpers/contracts — `skills/common/pipeline/agent-observability/src/mapping.ts` — LLM payload non-promotion — current: rename as canonical behavior
- `P2-101` — ledger line 256 — Common shared helpers/contracts — `skills/common/pipeline/agent-observability/src/routing.ts` — max bytes default and cap — current: rename as canonical behavior
- `P2-102` — ledger line 257 — Common shared helpers/contracts — `skills/common/pipeline/agent-observability/src/routing.ts` — oversize drop metadata — current: rename as canonical behavior
- `P2-103` — ledger line 260 — Common shared helpers/contracts — `skills/common/pipeline/agent-observability/src/validation.ts` — unsupported type handling — current: rename as canonical behavior
- `P2-104` — ledger line 261 — Common shared helpers/contracts — `skills/common/pipeline/agents/acp-monitor.ts` — transcript event rate coalescing — current: rename as canonical behavior
- `P2-105` — ledger line 263 — Common shared helpers/contracts — `skills/common/pipeline/agents/acp-monitor.ts` — transcript truncation/classification fallback — current: rename as canonical behavior
- `P2-106` — ledger line 264 — Common shared helpers/contracts — `skills/common/pipeline/agents/acp-monitor.ts` — truncated transcript reset — current: rename as canonical behavior
- `P2-107` — ledger line 265 — Common shared helpers/contracts — `skills/common/pipeline/agents/acp-monitor.ts` — Gateway unreachable with transcript progress — current: rename as canonical behavior
- `P2-108` — ledger line 267 — Common shared helpers/contracts — `skills/common/pipeline/agents/acp-monitor.ts` — adapter error event — current: rename as canonical behavior
- `P2-109` — ledger line 269 — Common shared helpers/contracts — `skills/common/pipeline/agents/lifecycle.ts` — active-session file diagnostic only — current: rename as canonical behavior
- `P2-110` — ledger line 270 — Common shared helpers/contracts — `skills/common/pipeline/agents/lifecycle.ts` — cleanup best-effort stderr fallback — current: rename as canonical behavior
- `P2-111` — ledger line 272 — Common shared helpers/contracts — `skills/common/pipeline/agents/lifecycle.ts` — spawn defaults and retries — current: rename as canonical defaults
- `P2-112` — ledger line 273 — Common shared helpers/contracts — `skills/common/pipeline/agents/lifecycle.ts` — stop fallback after kill — current: rename as canonical behavior
- `P2-113` — ledger line 274 — Common shared helpers/contracts — `skills/common/pipeline/agents/lifecycle.ts` — subagent list confirmation fallback — current: rename as canonical behavior
- `P2-114` — ledger line 277 — Common shared helpers/contracts — `skills/common/pipeline/agents/session-termination.ts` — grace defaults and cap — current: rename as canonical default
- `P2-115` — ledger line 278 — Common shared helpers/contracts — `skills/common/pipeline/agents/session-termination.ts` — no-session success — current: rename as canonical behavior
- `P2-116` — ledger line 279 — Common shared helpers/contracts — `skills/common/pipeline/agents/session-termination.ts` — grace-expired result — current: rename as canonical behavior
- `P2-117` — ledger line 280 — Common shared helpers/contracts — `skills/common/pipeline/agents/session-termination.ts` — optional cleanup callback — current: rename as canonical behavior

### P2-B04 — P2-118..P2-156 (39 decisions)

Area mix: Common shared helpers/contracts: 27; Nova other: 12.

- `P2-118` — ledger line 281 — Common shared helpers/contracts — `skills/common/pipeline/agents/tracked-agents.ts` — missing label no-op — current: rename as canonical behavior
- `P2-119` — ledger line 282 — Common shared helpers/contracts — `skills/common/pipeline/cli-args.ts` — strict parser with defaults — current: rename as canonical behavior
- `P2-120` — ledger line 285 — Common shared helpers/contracts — `skills/common/pipeline/git-primitives.ts` — head hash failure empty string — current: rename as canonical behavior
- `P2-121` — ledger line 286 — Common shared helpers/contracts — `skills/common/pipeline/integrations/discord-webhook.ts` — payload shorthand — current: DELETE_LEGACY deleted in P4-B02; callers pass canonical webhook body
- `P2-122` — ledger line 288 — Common shared helpers/contracts — `skills/common/pipeline/integrations/discord-webhook.ts` — error body preview — current: rename as canonical behavior
- `P2-123` — ledger line 292 — Common shared helpers/contracts — `skills/common/pipeline/integrations/gateway.ts` — network retry and health false fallback — current: rename as canonical behavior
- `P2-124` — ledger line 293 — Common shared helpers/contracts — `skills/common/pipeline/integrations/gateway.ts` — non-JSON Gateway result normalization — current: rename as canonical behavior
- `P2-125` — ledger line 294 — Common shared helpers/contracts — `skills/common/pipeline/lifecycle-state.ts` — missing status/history normalization — current: rename as canonical behavior
- `P2-126` — ledger line 295 — Common shared helpers/contracts — `skills/common/pipeline/lifecycle-state.ts` — hidden pending lifecycle mutation — current: rename as canonical behavior
- `P2-127` — ledger line 296 — Common shared helpers/contracts — `skills/common/pipeline/lifecycle-state.ts` — rate-limit phase preservation — current: rename as canonical behavior
- `P2-128` — ledger line 297 — Common shared helpers/contracts — `skills/common/pipeline/noncritical-reporting.ts` — arbitrary error detail fallback — current: rename as canonical behavior
- `P2-129` — ledger line 298 — Common shared helpers/contracts — `skills/common/pipeline/noncritical-reporting.ts` — incident de-dupe and output fallback — current: rename as canonical behavior
- `P2-130` — ledger line 299 — Common shared helpers/contracts — `skills/common/pipeline/redaction.ts` — sensitive content summarization — current: rename as canonical behavior
- `P2-131` — ledger line 300 — Common shared helpers/contracts — `skills/common/pipeline/redaction.ts` — malformed/circular/unserializable fallback — current: rename as canonical behavior
- `P2-132` — ledger line 301 — Common shared helpers/contracts — `skills/common/pipeline/redaction.ts` — Discord file stripping — current: rename as canonical behavior
- `P2-133` — ledger line 302 — Common shared helpers/contracts — `skills/common/pipeline/redaction.ts` — transcript head/tail truncation — current: rename as canonical behavior
- `P2-134` — ledger line 305 — Common shared helpers/contracts — `skills/common/pipeline/redis-transport.ts` — secure transport enforcement — current: rename as canonical behavior
- `P2-135` — ledger line 306 — Common shared helpers/contracts — `skills/common/pipeline/redis-transport.ts` — missing ioredis typed error — current: rename as canonical behavior
- `P2-136` — ledger line 307 — Common shared helpers/contracts — `skills/common/pipeline/security.ts` — subprocess env allow/deny fallback — current: rename as canonical behavior
- `P2-137` — ledger line 310 — Common shared helpers/contracts — `skills/common/pipeline/services/acp-gateway-contract.ts` — strict object key validation — current: rename as canonical behavior
- `P2-138` — ledger line 313 — Common shared helpers/contracts — `skills/common/pipeline/services/pipeline-event-contract.ts` — invalid wait configuration errors — current: rename as canonical behavior
- `P2-139` — ledger line 314 — Common shared helpers/contracts — `skills/common/pipeline/services/pipeline-event-contract.ts` — wait timeout/abort/budget shaping — current: rename as canonical behavior
- `P2-140` — ledger line 316 — Common shared helpers/contracts — `skills/common/pipeline/services/rate-limit-contract.ts` — rate-limit payload defaults — current: rename as canonical defaults
- `P2-141` — ledger line 321 — Common shared helpers/contracts — `skills/common/pipeline/services/task-transport-contract.ts` — object-or-array transport fields — current: rename as canonical behavior
- `P2-142` — ledger line 322 — Common shared helpers/contracts — `skills/common/pipeline/services/task-transport-contract.ts` — consumer-group idempotency — current: rename as canonical behavior
- `P2-143` — ledger line 323 — Common shared helpers/contracts — `skills/common/pipeline/services/telemetry/payload-schema.ts` — plugin telemetry projection — current: rename as canonical behavior
- `P2-144` — ledger line 325 — Common shared helpers/contracts — `skills/common/pipeline/timing.ts` — budget deadline aliases — current: rename as canonical behavior
- `P2-145` — ledger line 331 — Nova other — `skills/nova/pipeline/agents/module-workers.ts` — dependency/noop/default seams — current: rename as canonical behavior
- `P2-146` — ledger line 333 — Nova other — `skills/nova/pipeline/agents/orchestration-healthcheck.ts` — Redis-agent health check — current: rename as canonical behavior
- `P2-147` — ledger line 336 — Nova other — `skills/nova/pipeline/agents/orchestration-healthcheck.ts` — degraded/restored suppression — current: rename as canonical behavior
- `P2-148` — ledger line 339 — Nova other — `skills/nova/pipeline/agents/orchestration.ts` — Redis adapter cache bypass — current: rename as canonical behavior
- `P2-149` — ledger line 340 — Nova other — `skills/nova/pipeline/agents/orchestration.ts` — Git baseline/change best-effort — current: rename as canonical behavior
- `P2-150` — ledger line 342 — Nova other — `skills/nova/pipeline/agents/orchestration.ts` — lifecycle telemetry/Discord nonblocking — current: rename as canonical behavior
- `P2-151` — ledger line 343 — Nova other — `skills/nova/pipeline/agents/orchestration.ts` — missing tracked session kill — current: rename as canonical behavior
- `P2-152` — ledger line 344 — Nova other — `skills/nova/pipeline/agents/orchestration.ts` — unconfirmed termination preservation — current: rename as canonical behavior
- `P2-153` — ledger line 347 — Nova other — `skills/nova/pipeline/agents/orchestration.ts` — steer failure tolerance — current: rename as canonical behavior
- `P2-154` — ledger line 349 — Nova other — `skills/nova/pipeline/agents/reviewer-lifecycle.ts` — reviewer lifecycle notification fallback — current: rename as canonical behavior
- `P2-155` — ledger line 350 — Nova other — `skills/nova/pipeline/agents/reviewer-lifecycle.ts` — missing reviewer session kill — current: rename as canonical behavior
- `P2-156` — ledger line 356 — Nova other — `skills/nova/pipeline/agents/shutdown.ts` — process table/proc fallbacks — current: rename as canonical behavior

### P2-B05 — P2-157..P2-194 (38 decisions)

Area mix: Nova runners/gates/workers: 15; Nova other: 14; Nova core/registry/config: 9.

- `P2-157` — ledger line 357 — Nova other — `skills/nova/pipeline/agents/shutdown.ts` — ACP wrapper heuristics — current: rename as canonical behavior
- `P2-158` — ledger line 359 — Nova other — `skills/nova/pipeline/agents/shutdown.ts` — duplicate signal ignore — current: rename as canonical behavior
- `P2-159` — ledger line 360 — Nova other — `skills/nova/pipeline/agents/shutdown.ts` — interrupt status persistence guard — current: rename as canonical behavior
- `P2-160` — ledger line 361 — Nova other — `skills/nova/pipeline/agents/shutdown.ts` — telemetry close fallback — current: rename as canonical behavior
- `P2-161` — ledger line 371 — Nova core/registry/config — `skills/nova/pipeline/core/config.ts` — numeric field coercion — current: rename as canonical default
- `P2-162` — ledger line 380 — Nova core/registry/config — `skills/nova/pipeline/core/logger.ts` — no active context fallback — current: rename as canonical default
- `P2-163` — ledger line 381 — Nova core/registry/config — `skills/nova/pipeline/core/logger.ts` — log append best effort — current: rename as canonical default
- `P2-164` — ledger line 385 — Nova core/registry/config — `skills/nova/pipeline/core/policy.ts` — model fallback chain — current: rename as canonical default
- `P2-165` — ledger line 387 — Nova core/registry/config — `skills/nova/pipeline/core/policy.ts` — Redis thinking boundary — current: rename as canonical default
- `P2-166` — ledger line 388 — Nova core/registry/config — `skills/nova/pipeline/core/policy.ts` — policy audit best effort — current: rename as canonical default
- `P2-167` — ledger line 390 — Nova core/registry/config — `skills/nova/pipeline/core/registry/builtins.ts` — `readPluginConfig` / `readPluginProgress` errors — current: rename as canonical behavior
- `P2-168` — ledger line 391 — Nova core/registry/config — `skills/nova/pipeline/core/registry/config-normalization.ts` — missing/null/malformed `config.plugins` defaults — current: rename as canonical default
- `P2-169` — ledger line 398 — Nova core/registry/config — `skills/nova/pipeline/core/temp.ts` — cleanup best-effort — current: rename as canonical behavior
- `P2-170` — ledger line 406 — Nova other — `skills/nova/pipeline/integrations/discord.ts` — nonblocking delivery/audit/stat failures — current: rename as canonical behavior
- `P2-171` — ledger line 408 — Nova other — `skills/nova/pipeline/integrations/git-worktree.ts` — runtime-state dirty allowlist — current: rename as canonical behavior
- `P2-172` — ledger line 410 — Nova other — `skills/nova/pipeline/integrations/git-worktree.ts` — polling pull skip modes — current: rename as canonical behavior
- `P2-173` — ledger line 411 — Nova other — `skills/nova/pipeline/integrations/git-worktree.ts` — runtime conflict auto-resolution — current: rename as canonical behavior
- `P2-174` — ledger line 413 — Nova other — `skills/nova/pipeline/integrations/git-worktree.ts` — push retry defaults — current: rename as canonical default
- `P2-175` — ledger line 416 — Nova other — `skills/nova/pipeline/integrations/git-worktree.ts` — diff-stat fallback — current: rename as canonical behavior
- `P2-176` — ledger line 420 — Nova other — `skills/nova/pipeline/prompts/buster-module.ts` — missing BUSTER.md as prompt error result — current: rename as canonical behavior
- `P2-177` — ledger line 422 — Nova other — `skills/nova/pipeline/prompts/forge.ts` — missing FORGE.md as prompt error result — current: rename as canonical behavior
- `P2-178` — ledger line 423 — Nova other — `skills/nova/pipeline/prompts/forge.ts` — backend package context fallback — current: rename as canonical behavior
- `P2-179` — ledger line 425 — Nova other — `skills/nova/pipeline/prompts/gate-fix.ts` — no-change fix-history wording — current: rename as canonical behavior
- `P2-180` — ledger line 431 — Nova runners/gates/workers — `skills/nova/pipeline/runners/approval-gate-shared.ts` — `normalizeApprovalTimeoutPolicy` — current: rename as canonical behavior
- `P2-181` — ledger line 433 — Nova runners/gates/workers — `skills/nova/pipeline/runners/approval-gate-state.ts` — corrupted approval state sentinel — current: rename as canonical behavior
- `P2-182` — ledger line 434 — Nova runners/gates/workers — `skills/nova/pipeline/runners/approval-gate-state.ts` — invalid/corrupted fail-closed — current: rename as canonical behavior
- `P2-183` — ledger line 436 — Nova runners/gates/workers — `skills/nova/pipeline/runners/approval-gate-runner.ts` — resolved-state replay — current: rename as canonical behavior
- `P2-184` — ledger line 437 — Nova runners/gates/workers — `skills/nova/pipeline/runners/approval-gate-runner.ts` — pending-state resume — current: rename as canonical behavior
- `P2-185` — ledger line 440 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-completion.ts` — Redis verdict parse fallback — current: rename as canonical behavior
- `P2-186` — ledger line 442 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-completion.ts` — adapter fatal/timeout durable alert — current: rename as canonical behavior
- `P2-187` — ledger line 446 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-control.ts` — default remediation limits — current: rename as canonical behavior
- `P2-188` — ledger line 449 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-fix-cycle.ts` — stale gate artifact cleanup best effort — current: rename as canonical behavior
- `P2-189` — ledger line 450 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-runner.ts` — preexisting output completion skip — current: rename as canonical behavior
- `P2-190` — ledger line 451 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-runner.ts` — stale local evidence cleanup best effort — current: rename as canonical behavior
- `P2-191` — ledger line 452 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-runner.ts` — prompt artifact write fallback — current: rename as canonical behavior
- `P2-192` — ledger line 453 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-runner.ts` — config validation poll result — current: rename as canonical behavior
- `P2-193` — ledger line 454 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-runner.ts` — Redis completion archive fail closed — current: rename as canonical behavior
- `P2-194` — ledger line 458 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-task.ts` — dispatch id timestamp fallback — current: rename as canonical behavior

### P2-B06 — P2-195..P2-232 (38 decisions)

Area mix: Nova runners/gates/workers: 38.

- `P2-195` — ledger line 460 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-terminal.ts` — PASS evidence fallback writes — current: rename as canonical behavior
- `P2-196` — ledger line 461 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-terminal.ts` — soft-fail gate status commit — current: rename as canonical behavior
- `P2-197` — ledger line 464 — Nova runners/gates/workers — `skills/nova/pipeline/runners/buster-gate-terminal.ts` — fix-loop request_fix handoff — current: rename as canonical behavior
- `P2-198` — ledger line 466 — Nova runners/gates/workers — `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts` — transcript no-change fallback — current: rename as canonical behavior
- `P2-199` — ledger line 470 — Nova runners/gates/workers — `skills/nova/pipeline/runners/gate-runner.ts` — missing gate registry/gate/owner failure mapping — current: rename as canonical behavior
- `P2-200` — ledger line 473 — Nova runners/gates/workers — `skills/nova/pipeline/runners/gate-runner.ts` — adapter mode validation — current: rename as canonical behavior
- `P2-201` — ledger line 474 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/attempt.ts` — module defaults — current: rename as canonical defaults
- `P2-202` — ledger line 475 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/attempt.ts` — dependency failure short-circuit — current: rename as canonical behavior
- `P2-203` — ledger line 477 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts` — Buster dispatch id timestamp fallback — current: rename as canonical behavior
- `P2-204` — ledger line 478 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts` — prompt error result handling — current: rename as canonical behavior
- `P2-205` — ledger line 479 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts` — config validation only first crash retry — current: rename as canonical behavior
- `P2-206` — ledger line 482 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts` — status reload precedence — current: rename as canonical behavior
- `P2-207` — ledger line 486 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts` — completion conflict fail-closed — current: rename as canonical behavior
- `P2-208` — ledger line 487 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts` — poll crash retry classification — current: rename as canonical behavior
- `P2-209` — ledger line 490 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts` — pre-test verdict presence heuristic — current: rename as canonical behavior
- `P2-210` — ledger line 493 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts` — infra/config pre-test Nova escalation — current: rename as canonical behavior
- `P2-211` — ledger line 494 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts` — normal agent failure Forge handoff — current: rename as canonical behavior
- `P2-212` — ledger line 495 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/buster-phase.ts` — Buster crash retry default — current: rename as canonical default
- `P2-213` — ledger line 498 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/state-machine.ts` — module stage default — current: rename as canonical default
- `P2-214` — ledger line 499 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/state-machine.ts` — loaded terminal skip — current: rename as canonical behavior
- `P2-215` — ledger line 500 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner/state-machine.ts` — blueprint release failure Nova escalation — current: rename as canonical behavior
- `P2-216` — ledger line 506 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-buster-worker.ts` — thrown diagnostics passthrough — current: rename as canonical behavior
- `P2-217` — ledger line 514 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-forge.ts` — transcript progress heuristic — current: rename as canonical behavior
- `P2-218` — ledger line 520 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-prebuster.ts` — Buster-only promotion — current: rename as canonical behavior
- `P2-219` — ledger line 521 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-prebuster.ts` — validator block/retry mapping — current: rename as canonical behavior
- `P2-220` — ledger line 522 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-prebuster.ts` — missing validation milestones fail closed — current: rename as canonical behavior
- `P2-221` — ledger line 525 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-shared.ts` — validation reset default — current: rename as canonical behavior
- `P2-222` — ledger line 529 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-shared.ts` — default module stages in snapshots — current: rename as canonical default
- `P2-223` — ledger line 530 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-shared.ts` — optional artifact refs — current: rename as canonical behavior
- `P2-224` — ledger line 531 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-shared.ts` — timeout/deadline defaults — current: rename as canonical default
- `P2-225` — ledger line 532 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner-shared.ts` — Buster attempt default — current: rename as canonical default
- `P2-226` — ledger line 533 — Nova runners/gates/workers — `skills/nova/pipeline/runners/module-runner.ts` — retry-loop sleep delay — current: rename as canonical behavior
- `P2-227` — ledger line 535 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-lock.ts` — lock timing defaults — current: rename as canonical default
- `P2-228` — ledger line 536 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-lock.ts` — malformed lock sentinel — current: rename as canonical behavior
- `P2-229` — ledger line 537 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-lock.ts` — stale lock reclamation — current: rename as canonical behavior
- `P2-230` — ledger line 538 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-lock.ts` — heartbeat owner-lost fail stop — current: rename as canonical behavior
- `P2-231` — ledger line 543 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` — session identity unconfirmed block — current: rename as canonical behavior
- `P2-232` — ledger line 544 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` — stop confirmation defaults — current: rename as canonical default

### P2-B07 — P2-233..P2-270 (38 decisions)

Area mix: Nova runners/gates/workers: 32; Nova services/contracts: 6.

- `P2-233` — ledger line 545 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` — recovery blocked observability best effort — current: rename as canonical behavior
- `P2-234` — ledger line 547 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` — terminal-or-kill recovery split — current: rename as canonical behavior
- `P2-235` — ledger line 548 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` — weak gate lifecycle evidence block — current: rename as canonical behavior
- `P2-236` — ledger line 549 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` — stale gate active-file removal best effort — current: rename as canonical behavior
- `P2-237` — ledger line 550 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-scheduling/snapshots.ts` — missing log-dir artifact refs — current: rename as canonical behavior
- `P2-238` — ledger line 555 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` — generator config merge — current: rename as canonical behavior
- `P2-239` — ledger line 557 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` — validator execution failure conversion — current: rename as canonical behavior
- `P2-240` — ledger line 558 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` — generator failure conversion — current: rename as canonical behavior
- `P2-241` — ledger line 561 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` — gate read-model skip — current: rename as canonical behavior
- `P2-242` — ledger line 562 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` — mandatory review full-lint default — current: rename as canonical behavior
- `P2-243` — ledger line 568 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-shared.ts` — bounded terminal correlation backfill — current: rename as canonical behavior
- `P2-244` — ledger line 570 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-start.ts` — config-validation snapshot best effort — current: rename as canonical behavior
- `P2-245` — ledger line 571 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-start.ts` — architecture validation skip-on-resume — current: rename as canonical behavior
- `P2-246` — ledger line 572 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-start.ts` — architecture execution vs block split — current: rename as canonical behavior
- `P2-247` — ledger line 573 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-start.ts` — cost report best effort — current: rename as canonical behavior
- `P2-248` — ledger line 575 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-terminal.ts` — invalid result fail-closed — current: rename as canonical behavior
- `P2-249` — ledger line 577 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-terminal.ts` — cost report best effort — current: rename as canonical behavior
- `P2-250` — ledger line 578 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-terminal.ts` — completion idempotency — current: rename as canonical behavior
- `P2-251` — ledger line 579 — Nova runners/gates/workers — `skills/nova/pipeline/runners/pipeline-runner-terminal.ts` — NEEDS_NOVA injection subset — current: rename as canonical behavior
- `P2-252` — ledger line 585 — Nova runners/gates/workers — `skills/nova/pipeline/runners/remediable-gate-engine.ts` — invalid cycle exhaustion — current: rename as canonical behavior
- `P2-253` — ledger line 589 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-control.ts` — max fix-cycle fallback — current: rename as canonical default
- `P2-254` — ledger line 590 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-control.ts` — first reviewer fallback — current: rename as canonical behavior
- `P2-255` — ledger line 592 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-fix-cycle.ts` — no extractable issues terminal — current: rename as canonical behavior
- `P2-256` — ledger line 593 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-fix-cycle.ts` — operator directive first-cycle only — current: rename as canonical behavior
- `P2-257` — ledger line 595 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-fix-cycle.ts` — timeout fallback — current: rename as canonical default
- `P2-258` — ledger line 599 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-runner.ts` — `resolveReviewConfig` — current: rename as canonical defaulting behavior
- `P2-259` — ledger line 600 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-runner.ts` — `cleanupReviewFiles` — current: rename as canonical behavior
- `P2-260` — ledger line 601 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-runner.ts` — existing output precheck — current: rename as canonical behavior
- `P2-261` — ledger line 602 — Nova runners/gates/workers — `skills/nova/pipeline/runners/review-gate-runner.ts` — `noGoAction` default — current: rename as canonical default
- `P2-262` — ledger line 610 — Nova runners/gates/workers — `skills/nova/pipeline/runners/stage-envelope-primitives.ts` — `buildStageRefs` missing parts — current: rename as canonical behavior
- `P2-263` — ledger line 611 — Nova runners/gates/workers — `skills/nova/pipeline/runners/stage-envelope-primitives.ts` — `collectExistingArtifactRefs` — current: rename as canonical behavior
- `P2-264` — ledger line 613 — Nova runners/gates/workers — `skills/nova/pipeline/runners/waitable-gate-engine.ts` — wait-controller fail-fast — current: rename as canonical behavior
- `P2-265` — ledger line 617 — Nova services/contracts — `skills/nova/pipeline/services/acp-observability.ts` — monitor detail fallback/default polling — current: rename as canonical behavior
- `P2-266` — ledger line 620 — Nova services/contracts — `skills/nova/pipeline/services/adapter-registry.ts` — unknown adapter fail-closed — current: rename as canonical behavior
- `P2-267` — ledger line 624 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-evidence/comparator.ts` — comparator thresholds/defaults — current: rename as canonical defaults
- `P2-268` — ledger line 625 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-evidence/comparator.ts` — missing identity/span/coverage issues — current: rename as canonical behavior
- `P2-269` — ledger line 626 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-forge-completion.ts` — control/runtime path exclusion — current: rename as canonical behavior
- `P2-270` — ledger line 629 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-forge-completion.ts` — Git evidence failure — current: rename as canonical behavior

### P2-B08 — P2-271..P2-308 (38 decisions)

Area mix: Nova services/contracts: 38.

- `P2-271` — ledger line 634 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-ingester/config.ts` — Redis env/config aliases and defaults — current: rename as canonical defaults; keep env aliases as external adapter
- `P2-272` — ledger line 635 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-ingester/consumer.ts` — disabled ingester no-op — current: rename as canonical behavior
- `P2-273` — ledger line 636 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-ingester/consumer.ts` — BUSYGROUP handling — current: rename as canonical behavior
- `P2-274` — ledger line 638 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-ingester/consumer.ts` — malformed/unexpected control entries — current: rename as canonical behavior
- `P2-275` — ledger line 639 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-ingester/consumer.ts` — unmapped event skip — current: rename as canonical behavior
- `P2-276` — ledger line 640 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-ingester/consumer.ts` — telemetry validation/emission failure — current: rename as canonical behavior
- `P2-277` — ledger line 644 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts` — unpromoted mapping skip — current: rename as canonical behavior
- `P2-278` — ledger line 645 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-ingester/usage-aggregation.ts` — no config/no usage no-op — current: rename as canonical behavior
- `P2-279` — ledger line 648 — Nova services/contracts — `skills/nova/pipeline/services/agent-observability-runtime.ts` — disabled sidecar no-op — current: rename as canonical behavior
- `P2-280` — ledger line 650 — Nova services/contracts — `skills/nova/pipeline/services/approval-signal-event-adapter.ts` — approval timeout signal mapping — current: rename as canonical behavior
- `P2-281` — ledger line 652 — Nova services/contracts — `skills/nova/pipeline/services/approval-signal-event-adapter.ts` — state read/corruption/contract fatal events — current: rename as canonical behavior
- `P2-282` — ledger line 653 — Nova services/contracts — `skills/nova/pipeline/services/approval-signal-event-adapter.ts` — watcher startup failures as fatal events — current: rename as canonical behavior
- `P2-283` — ledger line 654 — Nova services/contracts — `skills/nova/pipeline/services/approval-signal-event-adapter.ts` — debounce/external abort/terminal stop — current: rename as canonical behavior
- `P2-284` — ledger line 657 — Nova services/contracts — `skills/nova/pipeline/services/arch-validator-checks.ts` — module stages default — current: rename as canonical default
- `P2-285` — ledger line 658 — Nova services/contracts — `skills/nova/pipeline/services/arch-validator-checks.ts` — optional test-spec validation — current: rename as canonical behavior
- `P2-286` — ledger line 660 — Nova services/contracts — `skills/nova/pipeline/services/arch-validator.ts` — skipped/disabled agent judgment — current: rename as canonical behavior
- `P2-287` — ledger line 662 — Nova services/contracts — `skills/nova/pipeline/services/arch-validator.ts` — agent parse/call failures become warnings — current: rename as canonical behavior
- `P2-288` — ledger line 668 — Nova services/contracts — `skills/nova/pipeline/services/artifact-bundle.ts` — diagnostic fallback evidence — current: rename as canonical behavior
- `P2-289` — ledger line 669 — Nova services/contracts — `skills/nova/pipeline/services/artifact-bundle.ts` — unknown surface role fallback — current: rename as canonical behavior
- `P2-290` — ledger line 670 — Nova services/contracts — `skills/nova/pipeline/services/artifact-bundle.ts` — suggested artifact path basename only — current: rename as canonical behavior
- `P2-291` — ledger line 673 — Nova services/contracts — `skills/nova/pipeline/services/blueprint.ts` — existing status skip — current: rename as canonical behavior
- `P2-292` — ledger line 674 — Nova services/contracts — `skills/nova/pipeline/services/blueprint.ts` — substep FORGE requirements — current: rename as canonical behavior
- `P2-293` — ledger line 675 — Nova services/contracts — `skills/nova/pipeline/services/blueprint.ts` — already committed/no changes success — current: rename as canonical behavior
- `P2-294` — ledger line 677 — Nova services/contracts — `skills/nova/pipeline/services/blueprint.ts` — gate dir missing/exists skips — current: rename as canonical behavior
- `P2-295` — ledger line 680 — Nova services/contracts — `skills/nova/pipeline/services/blueprint.ts` — sync summary write fallback — current: rename as canonical behavior
- `P2-296` — ledger line 683 — Nova services/contracts — `skills/nova/pipeline/services/buster-completion-controller.ts` — default expected statuses — current: rename as canonical default
- `P2-297` — ledger line 684 — Nova services/contracts — `skills/nova/pipeline/services/buster-completion-controller.ts` — invalid Redis completion fail-closed — current: rename as canonical behavior
- `P2-298` — ledger line 686 — Nova services/contracts — `skills/nova/pipeline/services/buster-completion-controller.ts` — abort result shape — current: rename as canonical behavior
- `P2-299` — ledger line 687 — Nova services/contracts — `skills/nova/pipeline/services/buster-completion-controller.ts` — output-file invalid contract handling — current: rename as canonical behavior
- `P2-300` — ledger line 689 — Nova services/contracts — `skills/nova/pipeline/services/case-study.ts` — output/instructions path defaults — current: rename as canonical default
- `P2-301` — ledger line 692 — Nova services/contracts — `skills/nova/pipeline/services/case-study.ts` — rate-limit recovery/exhaustion shaping — current: rename as canonical behavior
- `P2-302` — ledger line 693 — Nova services/contracts — `skills/nova/pipeline/services/case-study.ts` — Discord/transcript/output sanitization fallbacks — current: rename as canonical behavior
- `P2-303` — ledger line 694 — Nova services/contracts — `skills/nova/pipeline/services/case-study.ts` — catch-to-generator-failure — current: rename as canonical behavior
- `P2-304` — ledger line 696 — Nova services/contracts — `skills/nova/pipeline/services/compatibility-authority.ts` — recursive strip with circular guard — current: rename as canonical behavior
- `P2-305` — ledger line 699 — Nova services/contracts — `skills/nova/pipeline/services/completion-adjudicator.ts` — Redis authority requires active dispatch — current: rename as canonical behavior
- `P2-306` — ledger line 700 — Nova services/contracts — `skills/nova/pipeline/services/completion-adjudicator.ts` — conflict/drift fail-closed policy — current: rename as canonical behavior
- `P2-307` — ledger line 701 — Nova services/contracts — `skills/nova/pipeline/services/completion-event-adapters.ts` — Redis client defaults and abort cleanup — current: rename as canonical behavior
- `P2-308` — ledger line 703 — Nova services/contracts — `skills/nova/pipeline/services/completion-event-adapters.ts` — local watcher nearest-dir fallback — current: rename as canonical behavior

### P2-B09 — P2-309..P2-346 (38 decisions)

Area mix: Nova services/contracts: 38.

- `P2-309` — ledger line 704 — Nova services/contracts — `skills/nova/pipeline/services/completion-event-adapters.ts` — local evidence debounce/existing emit — current: rename as canonical behavior
- `P2-310` — ledger line 706 — Nova services/contracts — `skills/nova/pipeline/services/contract-diagnostics.ts` — redacted summary diagnostics — current: rename as canonical behavior
- `P2-311` — ledger line 707 — Nova services/contracts — `skills/nova/pipeline/services/contracts/control-result-mapping.ts` — unknown mapping default — current: rename as canonical behavior
- `P2-312` — ledger line 710 — Nova services/contracts — `skills/nova/pipeline/services/contracts/gate-control-result.ts` — compatibility authority ban — current: rename as canonical behavior
- `P2-313` — ledger line 712 — Nova services/contracts — `skills/nova/pipeline/services/contracts/generator-result.ts` — artifact filtering — current: rename as canonical behavior
- `P2-314` — ledger line 713 — Nova services/contracts — `skills/nova/pipeline/services/contracts/generator-result.ts` — strict typed generator boundary — current: rename as canonical behavior
- `P2-315` — ledger line 716 — Nova services/contracts — `skills/nova/pipeline/services/contracts/pipeline-step-result.ts` — compatibility authority rejection — current: rename as canonical behavior
- `P2-316` — ledger line 717 — Nova services/contracts — `skills/nova/pipeline/services/contracts/pipeline-step-result.ts` — control-result outcome inference — current: rename as canonical behavior
- `P2-317` — ledger line 723 — Nova services/contracts — `skills/nova/pipeline/services/contracts/validator-control-result.ts` — lint/failure summary fallbacks — current: rename as canonical behavior
- `P2-318` — ledger line 724 — Nova services/contracts — `skills/nova/pipeline/services/contracts/validator-control-result.ts` — strict typed boundary — current: rename as canonical behavior
- `P2-319` — ledger line 728 — Nova services/contracts — `skills/nova/pipeline/services/contracts/worker-control-result.ts` — strict typed boundary — current: rename as canonical behavior
- `P2-320` — ledger line 731 — Nova services/contracts — `skills/nova/pipeline/services/dependencies.ts` — legacy gate PASS rejected — current: rename as canonical behavior
- `P2-321` — ledger line 732 — Nova services/contracts — `skills/nova/pipeline/services/dependencies.ts` — pending/missing dependency shaping — current: rename as canonical behavior
- `P2-322` — ledger line 736 — Nova services/contracts — `skills/nova/pipeline/services/durable-operator-alert.ts` — best-effort write failure reporting — current: rename as canonical behavior
- `P2-323` — ledger line 740 — Nova services/contracts — `skills/nova/pipeline/services/failures/classification.ts` — git push fallback — current: rename as canonical behavior
- `P2-324` — ledger line 741 — Nova services/contracts — `skills/nova/pipeline/services/failures/classification.ts` — agent fail reason fallback — current: rename as canonical behavior
- `P2-325` — ledger line 742 — Nova services/contracts — `skills/nova/pipeline/services/failures/classification.ts` — pre-test verdict parse fallback — current: rename as canonical behavior
- `P2-326` — ledger line 743 — Nova services/contracts — `skills/nova/pipeline/services/failures/classification.ts` — pre-test config/infra/code precedence — current: rename as canonical behavior
- `P2-327` — ledger line 748 — Nova services/contracts — `skills/nova/pipeline/services/failures/presentation.ts` — injection log write failures — current: rename as canonical behavior
- `P2-328` — ledger line 750 — Nova services/contracts — `skills/nova/pipeline/services/failures/retry-policy.ts` — auto-retry threshold precedence — current: rename as canonical behavior
- `P2-329` — ledger line 756 — Nova services/contracts — `skills/nova/pipeline/services/forge-completion.ts` — invalid/missing artifact shaping — current: rename as canonical behavior
- `P2-330` — ledger line 758 — Nova services/contracts — `skills/nova/pipeline/services/gate-active-session.ts` — lifecycle authority override — current: rename as canonical behavior
- `P2-331` — ledger line 759 — Nova services/contracts — `skills/nova/pipeline/services/gate-active-session.ts` — parse-error diagnostic — current: rename as canonical behavior
- `P2-332` — ledger line 761 — Nova services/contracts — `skills/nova/pipeline/services/gate-fix-scaffold.ts` — redacted artifact write best-effort — current: rename as canonical behavior
- `P2-333` — ledger line 763 — Nova services/contracts — `skills/nova/pipeline/services/gate-fix-scaffold.ts` — failed health cleanup — current: rename as canonical behavior
- `P2-334` — ledger line 766 — Nova services/contracts — `skills/nova/pipeline/services/governance-context.ts` — artifact path normalization fallback — current: rename as canonical behavior
- `P2-335` — ledger line 767 — Nova services/contracts — `skills/nova/pipeline/services/governance-context.ts` — token stats best-effort — current: rename as canonical behavior
- `P2-336` — ledger line 769 — Nova services/contracts — `skills/nova/pipeline/services/lint.ts` — nonzero lint-report with output — current: rename as canonical behavior
- `P2-337` — ledger line 771 — Nova services/contracts — `skills/nova/pipeline/services/lint.ts` — temp/report write cleanup best-effort — current: rename as canonical behavior
- `P2-338` — ledger line 773 — Nova services/contracts — `skills/nova/pipeline/services/module-validators.ts` — stage producer fallback — current: rename as canonical behavior
- `P2-339` — ledger line 774 — Nova services/contracts — `skills/nova/pipeline/services/module-validators.ts` — missing module identity block — current: rename as canonical behavior
- `P2-340` — ledger line 775 — Nova services/contracts — `skills/nova/pipeline/services/module-validators.ts` — full-lint tool failure block — current: rename as canonical behavior
- `P2-341` — ledger line 776 — Nova services/contracts — `skills/nova/pipeline/services/module-validators.ts` — full-lint archive failure — current: rename as canonical behavior
- `P2-342` — ledger line 780 — Nova services/contracts — `skills/nova/pipeline/services/notification-dispatch.ts` — missing registry/listener handling — current: rename as canonical behavior
- `P2-343` — ledger line 781 — Nova services/contracts — `skills/nova/pipeline/services/notification-dispatch.ts` — listener failure isolation — current: rename as canonical behavior
- `P2-344` — ledger line 782 — Nova services/contracts — `skills/nova/pipeline/services/observability.ts` — no log-dir structured event skip — current: rename as canonical behavior
- `P2-345` — ledger line 783 — Nova services/contracts — `skills/nova/pipeline/services/observability.ts` — invalid telemetry payload nonthrow — current: rename as canonical behavior
- `P2-346` — ledger line 784 — Nova services/contracts — `skills/nova/pipeline/services/observability.ts` — degraded/restored duplicate suppression — current: rename as canonical behavior

### P2-B10 — P2-347..P2-384 (38 decisions)

Area mix: Nova services/contracts: 38.

- `P2-347` — ledger line 785 — Nova services/contracts — `skills/nova/pipeline/services/observability.ts` — usage/cost artifact best-effort — current: rename as canonical behavior
- `P2-348` — ledger line 787 — Nova services/contracts — `skills/nova/pipeline/services/openclaw-plugin-runtime.ts` — disabled plugin controller — current: rename as canonical behavior
- `P2-349` — ledger line 789 — Nova services/contracts — `skills/nova/pipeline/services/openclaw-plugin-runtime.ts` — disable-on-stop fallback — current: rename as canonical behavior
- `P2-350` — ledger line 791 — Nova services/contracts — `skills/nova/pipeline/services/polling-dual.ts` — completion adapter fatal fail-closed — current: rename as canonical behavior
- `P2-351` — ledger line 792 — Nova services/contracts — `skills/nova/pipeline/services/polling-dual.ts` — unresolved completion fail-closed — current: rename as canonical behavior
- `P2-352` — ledger line 796 — Nova services/contracts — `skills/nova/pipeline/services/polling-identity.ts` — log-key defaults — current: rename as canonical behavior
- `P2-353` — ledger line 797 — Nova services/contracts — `skills/nova/pipeline/services/polling-observability.ts` — transcript delta fire-and-forget — current: rename as canonical behavior
- `P2-354` — ledger line 800 — Nova services/contracts — `skills/nova/pipeline/services/polling-redis-completion.ts` — Redis adapter archive failure result — current: rename as canonical behavior
- `P2-355` — ledger line 801 — Nova services/contracts — `skills/nova/pipeline/services/polling-session-end.ts` — no session key fail-closed — current: rename as canonical behavior
- `P2-356` — ledger line 804 — Nova services/contracts — `skills/nova/pipeline/services/polling-session-end.ts` — subagent transcript mirror best-effort — current: rename as canonical behavior
- `P2-357` — ledger line 805 — Nova services/contracts — `skills/nova/pipeline/services/polling-session-end.ts` — timeout nudge best-effort — current: rename as canonical behavior
- `P2-358` — ledger line 808 — Nova services/contracts — `skills/nova/pipeline/services/polling.ts` — — — current: rename as canonical behavior
- `P2-359` — ledger line 809 — Nova services/contracts — `skills/nova/pipeline/services/polling.ts` — — — current: rename as canonical behavior
- `P2-360` — ledger line 810 — Nova services/contracts — `skills/nova/pipeline/services/polling.ts` — — — current: rename as canonical behavior
- `P2-361` — ledger line 813 — Nova services/contracts — `skills/nova/pipeline/services/polling.ts` — — — current: rename as canonical behavior
- `P2-362` — ledger line 817 — Nova services/contracts — `skills/nova/pipeline/services/prompt-ingress.ts` — — — current: rename as canonical behavior
- `P2-363` — ledger line 818 — Nova services/contracts — `skills/nova/pipeline/services/prompt-ingress.ts` — — — current: rename as canonical behavior
- `P2-364` — ledger line 819 — Nova services/contracts — `skills/nova/pipeline/services/prompt-ingress.ts` — — — current: rename as canonical behavior
- `P2-365` — ledger line 820 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts` — — — current: rename as canonical behavior
- `P2-366` — ledger line 821 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts` — — — current: rename as canonical behavior
- `P2-367` — ledger line 825 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit-builders.ts` — — — current: rename as canonical behavior
- `P2-368` — ledger line 831 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit-exit.ts` — — — current: rename as canonical behavior
- `P2-369` — ledger line 832 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit-exit.ts` — — — current: rename as canonical behavior
- `P2-370` — ledger line 833 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit-exit.ts` — — — current: rename as canonical behavior
- `P2-371` — ledger line 835 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit.ts` — default cooldown/max pauses/buffer — current: rename as canonical defaults
- `P2-372` — ledger line 836 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit.ts` — Discord/telemetry side-effect failures — current: rename as canonical behavior
- `P2-373` — ledger line 840 — Nova services/contracts — `skills/nova/pipeline/services/rate-limit.ts` — durable cooldown replay — current: rename as canonical behavior
- `P2-374` — ledger line 844 — Nova services/contracts — `skills/nova/pipeline/services/redis-completion.ts` — invalid completion projection — current: rename as canonical behavior
- `P2-375` — ledger line 845 — Nova services/contracts — `skills/nova/pipeline/services/redis-completion.ts` — noncanonical source handling — current: rename as canonical behavior
- `P2-376` — ledger line 846 — Nova services/contracts — `skills/nova/pipeline/services/redis-completion.ts` — same-outcome duplicates — current: rename as canonical behavior
- `P2-377` — ledger line 847 — Nova services/contracts — `skills/nova/pipeline/services/redis-completion.ts` — conflicting completions — current: rename as canonical behavior
- `P2-378` — ledger line 848 — Nova services/contracts — `skills/nova/pipeline/services/redis-completion.ts` — active-identity archive exclusion — current: rename as canonical behavior
- `P2-379` — ledger line 849 — Nova services/contracts — `skills/nova/pipeline/services/redis-log.ts` — non-object record skip — current: rename as canonical behavior
- `P2-380` — ledger line 850 — Nova services/contracts — `skills/nova/pipeline/services/redis-log.ts` — bounded payload fallback — current: rename as canonical behavior
- `P2-381` — ledger line 851 — Nova services/contracts — `skills/nova/pipeline/services/redis-log.ts` — best-effort sync writes — current: rename as canonical behavior
- `P2-382` — ledger line 854 — Nova services/contracts — `skills/nova/pipeline/services/remediation-handoff.ts` — remediation field defaults — current: rename as canonical behavior
- `P2-383` — ledger line 856 — Nova services/contracts — `skills/nova/pipeline/services/serialization.ts` — sanitize non-JSON values — current: rename as canonical behavior
- `P2-384` — ledger line 857 — Nova services/contracts — `skills/nova/pipeline/services/serialization.ts` — readonly snapshot function handling — current: rename as canonical behavior

### P2-B11 — P2-385..P2-422 (38 decisions)

Area mix: Nova services/contracts: 25; Nova lifecycle/status-store: 13.

- `P2-385` — ledger line 859 — Nova services/contracts — `skills/nova/pipeline/services/session-authority.ts` — attempt string normalization — current: rename as canonical behavior
- `P2-386` — ledger line 860 — Nova services/contracts — `skills/nova/pipeline/services/session-authority.ts` — diagnostic evidence denied authority — current: rename as canonical behavior
- `P2-387` — ledger line 862 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-compat/gate-projection.ts` — legacy gate-status diagnostic policy — current: rename as canonical behavior
- `P2-388` — ledger line 864 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-compat/gate-projection.ts` — invalid output shaping — current: rename as canonical behavior
- `P2-389` — ledger line 865 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-compat/gate-projection.ts` — gate scheduler drift metadata — current: rename as canonical behavior
- `P2-390` — ledger line 866 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-compat/module-projection.ts` — legacy module projection disabled by default — current: rename as canonical behavior
- `P2-391` — ledger line 867 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-compat/module-projection.ts` — canonical-control preservation — current: rename as canonical behavior
- `P2-392` — ledger line 869 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-compat/module-projection.ts` — status parse/drift handling — current: rename as canonical behavior
- `P2-393` — ledger line 872 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts` — — — current: rename as canonical behavior
- `P2-394` — ledger line 878 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-lifecycle/legality.ts` — — — current: rename as canonical behavior
- `P2-395` — ledger line 880 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-lifecycle/projections.ts` — — — current: rename as canonical behavior
- `P2-396` — ledger line 882 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-lifecycle/projections.ts` — — — current: rename as canonical behavior
- `P2-397` — ledger line 884 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts` — — — current: rename as canonical behavior
- `P2-398` — ledger line 894 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store.ts` — — — current: rename as canonical behavior
- `P2-399` — ledger line 895 — Nova lifecycle/status-store — `skills/nova/pipeline/services/status-store.ts` — — — current: rename as canonical behavior
- `P2-400` — ledger line 897 — Nova services/contracts — `skills/nova/pipeline/services/summary/project-summary.ts` — optional generator outputs — current: rename as canonical behavior
- `P2-401` — ledger line 898 — Nova services/contracts — `skills/nova/pipeline/services/summary/project-summary.ts` — noncritical generator failure — current: rename as canonical behavior
- `P2-402` — ledger line 899 — Nova services/contracts — `skills/nova/pipeline/services/summary-session-cleanup.ts` — one-shot cleanup guard — current: rename as canonical behavior
- `P2-403` — ledger line 901 — Nova services/contracts — `skills/nova/pipeline/services/summary-session-cleanup.ts` — cleanup errors captured — current: rename as canonical behavior
- `P2-404` — ledger line 902 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — unreadable module status skip — current: rename as canonical behavior
- `P2-405` — ledger line 904 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — best-effort cost/budget report — current: rename as canonical behavior
- `P2-406` — ledger line 905 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — summary write failure result — current: rename as canonical behavior
- `P2-407` — ledger line 906 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — pipeline review config merge — current: rename as canonical behavior
- `P2-408` — ledger line 908 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — pipeline review path defaults — current: rename as canonical defaults
- `P2-409` — ledger line 909 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — review Discord nonblocking notices — current: rename as canonical behavior
- `P2-410` — ledger line 910 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — review rate-limit recovery/exhaustion — current: rename as canonical behavior
- `P2-411` — ledger line 911 — Nova services/contracts — `skills/nova/pipeline/services/summary.ts` — review transcript copy optional — current: rename as canonical behavior
- `P2-412` — ledger line 914 — Nova services/contracts — `skills/nova/pipeline/services/system-io-warning.ts` — required-field drop — current: rename as canonical behavior
- `P2-413` — ledger line 915 — Nova services/contracts — `skills/nova/pipeline/services/system-io-warning.ts` — bare-metal stderr fallback — current: rename as canonical behavior
- `P2-414` — ledger line 918 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/builders.ts` — exit-code status mapping — current: rename as canonical behavior
- `P2-415` — ledger line 920 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/builders.ts` — nonblocking event emission — current: rename as canonical behavior
- `P2-416` — ledger line 921 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/builders.ts` — approval timeout policy default — current: rename as canonical behavior
- `P2-417` — ledger line 922 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/builders.ts` — observability state suppression — current: rename as canonical behavior
- `P2-418` — ledger line 923 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/dispatch.ts` — invalid telemetry payload fallback — current: rename as canonical behavior
- `P2-419` — ledger line 924 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/dispatch.ts` — sink dispatch failure fallback — current: rename as canonical behavior
- `P2-420` — ledger line 925 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/dispatch.ts` — disk append failure fallback — current: rename as canonical behavior
- `P2-421` — ledger line 926 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/dispatch.ts` — operator alert durable-first — current: rename as canonical behavior
- `P2-422` — ledger line 929 — Nova services/contracts — `skills/nova/pipeline/services/telemetry/sinks.ts` — close without guard — current: rename as canonical behavior

### P2-B12 — P2-423..P2-460 (38 decisions)

Area mix: Nova tools: 28; Nova services/contracts: 10.

- `P2-423` — ledger line 932 — Nova services/contracts — `skills/nova/pipeline/services/telemetry-sink-contract.ts` — `buildTelemetrySinkInput` — current: rename as canonical behavior
- `P2-424` — ledger line 933 — Nova services/contracts — `skills/nova/pipeline/services/telemetry-sink-contract.ts` — `readTelemetrySinkConfig` — current: rename as canonical behavior
- `P2-425` — ledger line 934 — Nova services/contracts — `skills/nova/pipeline/services/telemetry-sink-contract.ts` — `observeRedisTelemetrySink` — current: rename as canonical behavior
- `P2-426` — ledger line 935 — Nova services/contracts — `skills/nova/pipeline/services/telemetry-sink-contract.ts` — `observeDiscordTelemetrySink` — current: rename as canonical behavior
- `P2-427` — ledger line 936 — Nova services/contracts — `skills/nova/pipeline/services/telemetry-sink-dispatch.ts` — missing registry/listener handling — current: rename as canonical behavior
- `P2-428` — ledger line 937 — Nova services/contracts — `skills/nova/pipeline/services/telemetry-sink-dispatch.ts` — per-sink failure isolation — current: rename as canonical behavior
- `P2-429` — ledger line 940 — Nova services/contracts — `skills/nova/pipeline/services/telemetry-stream.ts` — Redis client init/runtime/close fallback — current: rename as canonical behavior
- `P2-430` — ledger line 943 — Nova services/contracts — `skills/nova/pipeline/services/truth-drift.ts` — gate completion adjudication guard — current: rename as canonical behavior
- `P2-431` — ledger line 945 — Nova services/contracts — `skills/nova/pipeline/services/validation.ts` — optional `serve.dockerfile` delivery skip — current: rename as canonical behavior
- `P2-432` — ledger line 946 — Nova services/contracts — `skills/nova/pipeline/services/validation.ts` — static path optional/COPY fallback — current: rename as canonical behavior
- `P2-433` — ledger line 949 — Nova tools — `skills/nova/pipeline/tools/lint-report/constants.ts` — default tier and timeout — current: rename as canonical defaults
- `P2-434` — ledger line 950 — Nova tools — `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts` — absent files as clean result — current: rename as canonical behavior
- `P2-435` — ledger line 951 — Nova tools — `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts` — parser failure downgrades — current: rename as canonical behavior
- `P2-436` — ledger line 952 — Nova tools — `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts` — changed-file narrowing — current: rename as canonical behavior
- `P2-437` — ledger line 954 — Nova tools — `skills/nova/pipeline/tools/lint-report/discovery.ts` — project type markers — current: rename as canonical behavior
- `P2-438` — ledger line 955 — Nova tools — `skills/nova/pipeline/tools/lint-report/discovery.ts` — `findFiles` read errors — current: rename as canonical behavior
- `P2-439` — ledger line 956 — Nova tools — `skills/nova/pipeline/tools/lint-report/discovery.ts` — `resolveScope` deleted changed files — current: rename as canonical behavior
- `P2-440` — ledger line 957 — Nova tools — `skills/nova/pipeline/tools/lint-report/execution.ts` — `safeExec` nonthrowing result — current: rename as canonical behavior
- `P2-441` — ledger line 958 — Nova tools — `skills/nova/pipeline/tools/lint-report/execution.ts` — timeout result — current: rename as canonical behavior
- `P2-442` — ledger line 960 — Nova tools — `skills/nova/pipeline/tools/lint-report/output.ts` — dual-write log append failure — current: rename as canonical behavior
- `P2-443` — ledger line 963 — Nova tools — `skills/nova/pipeline/tools/lint-report/report.ts` — tool exception mapping — current: rename as canonical behavior
- `P2-444` — ledger line 964 — Nova tools — `skills/nova/pipeline/tools/lint-report/report.ts` — parse/config failure findings — current: rename as canonical behavior
- `P2-445` — ledger line 965 — Nova tools — `skills/nova/pipeline/tools/lint-report/tool-registry.ts` — missing tsconfig handling — current: rename as canonical behavior
- `P2-446` — ledger line 966 — Nova tools — `skills/nova/pipeline/tools/lint-report/tool-registry.ts` — repo-policy read failure — current: rename as canonical behavior
- `P2-447` — ledger line 967 — Nova tools — `skills/nova/pipeline/tools/lint-report/tool-registry.ts` — ESLint config policy — current: rename as canonical behavior
- `P2-448` — ledger line 968 — Nova tools — `skills/nova/pipeline/tools/lint-report/tool-registry.ts` — Semgrep config policy — current: rename as canonical behavior
- `P2-449` — ledger line 969 — Nova tools — `skills/nova/pipeline/tools/lint-report/tool-registry.ts` — changed-file filtering per tool — current: rename as canonical behavior
- `P2-450` — ledger line 970 — Nova tools — `skills/nova/pipeline/tools/lint-report/tool-registry.ts` — mypy partial parse fallback — current: rename as canonical behavior
- `P2-451` — ledger line 973 — Nova tools — `skills/nova/pipeline/tools/lint-report.ts` — exit code mapping — current: rename as canonical behavior
- `P2-452` — ledger line 979 — Nova tools — `skills/nova/pipeline/tools/project-summary.ts` — Git tracked fallback — current: rename as canonical behavior
- `P2-453` — ledger line 980 — Nova tools — `skills/nova/pipeline/tools/project-summary.ts` — Git command failure fallback — current: rename as canonical behavior
- `P2-454` — ledger line 981 — Nova tools — `skills/nova/pipeline/tools/project-summary.ts` — JSON read fallback — current: rename as canonical behavior
- `P2-455` — ledger line 983 — Nova tools — `skills/nova/pipeline/tools/project-summary.ts` — gate status fallback — current: rename as canonical behavior
- `P2-456` — ledger line 987 — Nova tools — `skills/nova/pipeline/tools/project-summary.ts` — Discord missing/failure fallback — current: rename as canonical behavior
- `P2-457` — ledger line 988 — Nova tools — `skills/nova/pipeline/tools/redis.ts` — Redis adapter singleton/env defaults — current: rename as canonical behavior
- `P2-458` — ledger line 991 — Nova tools — `skills/nova/pipeline/tools/redis.ts` — Discord notification best effort — current: rename as canonical behavior
- `P2-459` — ledger line 992 — Nova tools — `skills/nova/pipeline/tools/redis.ts` — strong completion identity fail-closed — current: rename as canonical behavior
- `P2-460` — ledger line 993 — Nova tools — `skills/nova/pipeline/tools/redis.ts` — archive stream naming/default length — current: rename as canonical behavior

## Coverage check

- Expected Pass 2 IDs: `P2-001..P2-460`.
- No row should appear in more than one batch.
- Later patches should update ledger decisions by Pass 2 ID/batch and keep this manifest as the review index.
