# buster/

Buster Pipeline — automated test harness for KubeClaw Swarm modules. Dequeues tasks from Redis, runs pre-configured test suites, spawns a subagent to fix failures, monitors progress, and signals completion back to the pipeline.

## Directory structure

```
buster/
  buster-pipeline.ts       Executable compatibility shim for node /app/skills/buster-pipeline.ts
  buster-pipeline.ts       Typed runtime entrypoint, startup/shutdown loop, narrow start/status API
  CONVENTIONS.md           Subagent operational conventions
  Dockerfile.sandbox       Sandbox container definition
  pipeline/
    runners/
      suite-runner.ts      Suite dispatch, telemetry emission, dependency tracking
    services/
      base-images.ts       Base-image validation and pre-pull orchestration
      discord.ts           Discord artifact write and webhook delivery helpers
      gateway-health.ts    Gateway readiness/health monitor
      git-workflows.ts     Typed Buster Git sync/push workflows using shared primitives
      logger.ts            Structured dual-write logger (stdout + JSONL)
      orphan-recovery.ts   Startup active-session recovery
      pipeline-helpers.ts  Task/status helpers, embed builders, sandbox cleanup wrapper; import helpers here, not from the root entrypoint
      rate-limit.ts        Rate-limit detection and pause/resume logic
      runtime.ts           Redis/discovery runtime helpers
      runtime-diagnostics.ts Sanitized process diagnostics
      sandbox-cleanup.ts   Sandbox cleanup policy/enforcement
      session-monitor.ts   ACP session polling and transcript classification
      task-lifecycle.ts    Per-task cleanup/git/suites/spawn/monitor/completion flow
      task-queue.ts        Redis stream dequeue/reclaim/ack loop
      task-validation.ts   Redis task identity validation
      telemetry.ts         Telemetry context factory and emitEvent()
      verdict-schema.ts    Verdict and finding shape factories
    suites/
      manifest.ts          Kubernetes manifest static analysis
      build.ts             Compile and serve (static or server mode)
      health.ts            HTTP health check with retry
      api.ts               JSON-spec HTTP/WebSocket API test runner
      unit.ts              Unit test runner (Jest, Vitest, Mocha, pytest)
      e2e.ts               Playwright E2E test runner (persistent spec files)
      a11y.ts              Accessibility audit via axe-core/Playwright
      perf.ts              Lighthouse performance audit
      bundle.ts            Build output size and file-count check
      security.ts          HTTP response header security audit
      visual-reg.ts        Visual regression (screenshot diff)
    tools/
      redis.ts             Swarm agent Redis communication CLI (send/read; direct complete removed)
      screenshot.ts        Screenshot capture and baseline generation utility
      verify-task.ts       Scope enforcement helper retained for explicit operator use
      visual-audit.ts      Discord media capture utility
```

## How it works

```
Redis task stream
      │
      ▼
 dequeue task (payload)
      │
      ▼
 pre-cleanup (sandbox teardown from previous run)
      │
      ▼
 git-sync (deterministic checkout to typed task commit)
      │
      ▼
 run suites (sequentially, with telemetry per suite)
      │
      ▼
 decision: criticalFailed?
  ├── YES → NO_SPAWN: emit plugin.event decision, return FAIL
  └── NO  → SPAWN
              │
              ▼
         spawn subagent (ACP session via shared common lifecycle helper)
              │
              ▼
         monitor session (poll loop: transcript, rate-limit, terminal state)
              │
              ▼
         kill session
              │
              ▼
         determine outcome (PASS / FAIL / TIMEOUT / RATE_LIMITED)
      │
      ▼
 final-cleanup (sandbox teardown)
      │
      ▼
 read required output_file artifact
      │
      ▼
 emit plugin.event task_completed → buster-pipeline completion signal → closeTelemetry
```

## Suite execution order

Suites run in the order specified in the task payload (`suites` field). The recommended default order is:

```
manifest → build → health → a11y → perf → bundle → security → visual-reg → api → e2e → unit
```

Dependencies (a suite is skipped if its dependency has a critical failure):

| Suite | Depends on |
|---|---|
| manifest | — |
| build | manifest |
| health | build |
| a11y | health |
| perf | health |
| bundle | build |
| security | build |
| visual-reg | health |
| api | health |
| e2e | health |
| unit | — |

A suite failure is **critical** only when the suite explicitly sets `critical: true` in its verdict. Only `build` and `manifest` set `critical: true` by default — their failure blocks subagent spawn. All other suites are informational or enforced but non-critical.

## Configuration

Suite configuration is read from `payload.test_config`. Each key maps to a suite:

```json
{
  "serve": {
    "type": "static",
    "build_cmd": "npm run build",
    "image": "node:20-slim",
    "port": 9999,
    "health_path": "/"
  },
  "manifest": {
    "deployment_yaml": ".swarm/modules/01-scaffold/k8s/deployment.yaml",
    "secret_yaml": ".swarm/modules/01-scaffold/k8s/secret.yaml",
    "required_env": ["DATABASE_URL", "JWT_SECRET"],
    "private_registries": ["ghcr.io"],
    "thresholds": { "max_issues": 0 }
  },
  "api": {
    "spec_file": ".swarm/02-api/test-spec.json",
    "thresholds": { "max_failures": 0 }
  },
  "unit": { "test_cmd": "pytest -x" },
  "e2e": { "tests_dir": ".swarm/modules/03-frontend/tests" },
  "perf": { "thresholds": { "performance": 80, "accessibility": 90 } },
  "a11y": { "tags": ["wcag2a", "wcag2aa"], "thresholds": { "critical": 0, "serious": 0 } },
  "bundle": { "thresholds": { "max_size_kb": 5120, "max_file_count": 200 } },
  "security": { "thresholds": { "critical": 0 } }
}
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `redis-master.kubeclaw.svc.cluster.local` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_USERNAME` | — | Optional Redis ACL username |
| `REDIS_PASSWORD` | — | Redis auth password; required unless TLS or documented network isolation is configured |
| `REDIS_TLS` / `REDIS_TLS_ENABLED` | — | Set to `true`/`1` to enable TLS client options |
| `REDIS_NETWORK_ISOLATION` | — | Set to `isolated`/`documented` only when Kubernetes/network policy is the approved Redis perimeter instead of auth/TLS |
| `DISCORD_WEBHOOK_URL` | — | Discord webhook for suite result and session embeds |
| `DISCORD_WEBHOOK` | — | Alternate Discord webhook (used by redis.ts) |
| `BUSTER_PROJECT` | — | Process-level diagnostic `project_hint` for Buster health artifacts only; task payload `project` is required and is not inferred from this env var |
| `OPENCLAW_GATEWAY_URL` | — | ACP Gateway URL for session spawn |
| `OPENCLAW_GATEWAY_TOKEN` | — | ACP Gateway auth token |
| `AGENT_NAME` | `unknown` | Subagent identity for Redis consumer group |
| `HOSTNAME` | pod hostname | Used to build unique consumer name |

## Task payload fields

| Field | Type | Description |
|---|---|---|
| `module_id` | string | Module being tested (e.g. `"06"`) |
| `task_type` | string | Required task type: `"module_test"` or `"gate_test"` |
| `attempt` | number | Required attempt number (1-based); Buster does not infer attempt `1` |
| `suites` | string[] | Ordered list of suite names to run |
| `serve_type` | string\|null | Build serve type (`"static"`, `"server"`, or null) |
| `commit_hash` | string\|null | Deterministic git checkout target (null = fast-forward) |
| `project` | string | Project name |
| `run_id` | string | Required pipeline run identifier; Buster does not generate run ids for task payloads |
| `dispatch_id` | string | Required Nova dispatch identifier; `session.label` is diagnostic and is not used as dispatch authority |
| `gate_id` | string\|null | Required gate identifier when `task_type` is `"gate_test"` |
| `log_dir` | string\|null | Override for Buster Pipeline log directory |
| `pipeline_log_path` | string\|null | Canonical operator-tail `pipeline.jsonl` mirror target |
| `pipeline_run_log_path` | string\|null | Canonical run-scoped `pipeline.jsonl` mirror target |
| `output_file` | string | Required Buster completion artifact path for `module_test` and `gate_test` |
| `timeout_seconds` | number | Required subagent session timeout; Buster does not infer a default |
| `prompt` | string | Buster subagent prompt text |
| `session.model` | string | Required model for session spawn; Buster no longer supplies a hardcoded model fallback |
| `session.runtime` | string | Required explicit runtime (`"acp"` or `"subagent"`); Buster does not infer runtime from model |
| `session.agentId` / `session.agent_id` | string | Required explicit agent/harness identity for session spawn |
| `session.cwd` | string | Required session working directory; Buster does not infer the repo root |
| `session.label` | string | Required session label; Buster does not use dispatch id as a label fallback |
| `test_config` | object | Suite configuration (see Configuration section) |
| `capabilities` | string[] | Explicit task capabilities. Defaults to `[]`; unknown values reject the task. |

## Capabilities

Buster is default-deny for destructive/tool-heavy boundaries. Grant only the capabilities a task needs:

- `static_web_server` — static build serving through nginx.
- `container_runtime` — podman build/run/push paths.
- `kubernetes_api` — kubectl namespace/apply/wait/status paths.
- `browser_automation` — Playwright/browser suites and visual capture.
- `lighthouse` — Lighthouse performance audits.
- `discord_media` — Discord image/video media upload.
- `image_prepull` — platform startup image cache warmup; set through `BUSTER_PLATFORM_CAPABILITIES`, not task payloads.

Missing capabilities fail closed loudly with an ERROR verdict and a durable `operator.alert` containing who, blocked action, and missing capability. Sandbox cleanup is intentionally asymmetric: cleanup uses maximum platform privilege to destroy run-scoped dangling resources and is not restricted by the task capability set.

## Suite reference

| Suite | Critical | Description | Key config fields |
|---|---|---|---|
| `manifest` | yes | Kubernetes manifest static analysis (YAML validation, env vars, secret refs, probes, resource limits) | `manifest.deployment_yaml`, `manifest.secret_yaml`, `manifest.required_env`, `manifest.thresholds` |
| `build` | yes | Compile and serve the project (static: nginx on :9999, server: podman container) | `serve.type`, `serve.build_cmd`, `serve.image`, `serve.port` |
| `health` | no | HTTP health check with retry (3×, exponential backoff) | `serve.health_path`, `serve.port` |
| `api` | no | JSON-spec HTTP/WebSocket API tests; informational unless thresholds set | `api.spec_file`, `api.thresholds.max_failures` |
| `unit` | no | Unit test runner (Jest, Vitest, Mocha, Node TAP, pytest); skips if no test script | `unit.test_cmd` |
| `e2e` | no | Playwright E2E runner over persisted `.spec.js` files; skips if no tests_dir | `e2e.tests_dir` |
| `a11y` | no | axe-core/Playwright WCAG scan; informational unless thresholds set | `a11y.tags`, `a11y.exclude`, `a11y.thresholds` |
| `perf` | no | Lighthouse audit; informational unless thresholds set | `perf.thresholds.performance`, `perf.thresholds.accessibility` |
| `bundle` | no | Build output size/count check; informational unless thresholds set | `bundle.thresholds.max_size_kb`, `bundle.thresholds.max_file_count` |
| `security` | no | HTTP response header audit (HSTS, CSP, X-Frame-Options, cookie flags); informational unless thresholds set | `security.thresholds.critical` |
| `visual-reg` | no | Screenshot diff against baseline; emits `plugin.event` (`plugin_event: visual_reg`) rich event | `visual_reg.pages`, `visual_reg.threshold` |

## Subagent completion

The subagent must write the requested `output_file` and then stop:

1. For `module_test` and `gate_test`, write `output_file` JSON with `status: PASS|FAIL` and `summary`. Do not edit `status.json` or any orchestrator state file.
2. Buster Pipeline reads `output_file`, runs `verify-task.ts` to scope-check + push `.swarm`, handles cleanup, and only then emits the canonical `source=buster-pipeline` completion signal. Nova applies lifecycle transitions through its guarded status-store path.

Legacy `status_json_path` task payloads and the old direct `redis.ts --action complete` path are removed and fail closed.

## Process diagnostics

Buster process-health failures that happen outside a Nova task, such as gateway readiness/health shutdown, are diagnostic-only and are written to `.swarm/logs/buster/process-health.jsonl`. They may include `project_hint` from `BUSTER_PROJECT`, but they do not create canonical `project`, `run_id`, `seq`, module, gate, attempt, dispatch, or completion authority. Run-scoped task telemetry must come from the validated Redis task payload.
