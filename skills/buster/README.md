# buster/

Buster Orchestrator — automated test harness for KubeClaw Swarm modules. Dequeues tasks from Redis, runs pre-configured test suites, spawns a subagent to fix failures, monitors progress, and signals completion back to the pipeline.

## Directory structure

```
buster/
  buster-orchestrator.js   Main task processor and session monitor
  suite-runner.js          Suite dispatch, telemetry emission, dependency tracking
  redis.js                 Swarm agent Redis communication CLI (send/read/complete)
  verify-task.js           Scope enforcement, git push, and completion signal
  verdict-schema.js        Verdict and finding shape factories (createSuiteVerdict, createFinding)
  screenshot.js            Screenshot capture utility for visual audits
  visual-audit.js          Visual diff helper (baseline comparison)
  CONVENTIONS.md           Subagent operational conventions
  Dockerfile.sandbox       Sandbox container definition
  agents/
    acp-monitor.js         ACP session state polling and transcript classification
    lifecycle.js           Session spawn/kill/steer helpers
  services/
    git.js                 Git sync utilities (gitSync, getRepoRoot)
    logger.js              Structured dual-write logger (stdout + JSONL)
    rate-limit.js          Rate-limit detection and pause/resume logic
    telemetry.js           Telemetry context factory and emitEvent()
  suites/
    manifest.js            Kubernetes manifest static analysis
    build.js               Compile and serve (static or server mode)
    health.js              HTTP health check with retry
    api.js                 JSON-spec HTTP/WebSocket API test runner
    unit.js                Unit test runner (Jest, Vitest, Mocha, pytest)
    e2e.js                 Playwright E2E test runner (persistent spec files)
    a11y.js                Accessibility audit via axe-core/Playwright
    perf.js                Lighthouse performance audit
    bundle.js              Build output size and file-count check
    security.js            HTTP response header security audit
    visual-reg.js          Visual regression (screenshot diff)
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
 git-sync (fast-forward or deterministic checkout)
      │
      ▼
 run suites (sequentially, with telemetry per suite)
      │
      ▼
 decision: criticalFailed?
  ├── YES → NO_SPAWN: emit buster.decision, return FAIL
  └── NO  → SPAWN
              │
              ▼
         spawn subagent (ACP session via lifecycle.js)
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
 emit buster.task_completed → closeTelemetry
      │
      ▼
 subagent calls redis.js --action complete
 (verify-task scope check → git push → pipeline completion signal)
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

Suite configuration is read from `payload.test_config` (or `payload.config`). Each key maps to a suite:

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
| `REDIS_PASSWORD` | — | Redis auth password |
| `DISCORD_WEBHOOK_URL` | — | Discord webhook for suite result and session embeds |
| `DISCORD_WEBHOOK` | — | Alternate Discord webhook (used by redis.js) |
| `BUSTER_PROJECT` | — | Project name fallback when not in payload |
| `GATEWAY_URL` | — | ACP Gateway URL for session spawn |
| `GATEWAY_TOKEN` | — | ACP Gateway auth token |
| `AGENT_NAME` | `unknown` | Subagent identity for Redis consumer group |
| `HOSTNAME` | pod hostname | Used to build unique consumer name |

## Task payload fields

| Field | Type | Description |
|---|---|---|
| `module_id` | string | Module being tested (e.g. `"06"`) |
| `task_type` | string | Task type; default `"module_test"` |
| `attempt` | number | Attempt number (1-based) |
| `suites` | string[] | Ordered list of suite names to run |
| `serve_type` | string\|null | Build serve type (`"static"`, `"server"`, or null) |
| `commit_hash` | string\|null | Deterministic git checkout target (null = fast-forward) |
| `project` | string | Project name |
| `run_id` | string | Pipeline run identifier |
| `log_dir` | string\|null | Override for orchestrator log directory |
| `telemetry_stream` | string\|null | Override Redis stream key for telemetry |
| `timeout_seconds` | number | Subagent session timeout; default `1800` |
| `prompt` | string | Buster subagent prompt text |
| `session.model` | string | Model for subagent spawn; default `"anthropic/claude-sonnet-4-6"` |
| `test_config` | object | Suite configuration (see Configuration section) |

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
| `visual-reg` | no | Screenshot diff against baseline; emits `buster.visual_reg` rich event | `visual_reg.pages`, `visual_reg.threshold` |

## Subagent completion

The subagent must call `redis.js --action complete` as its final command. This:

1. Calls `verify-task.js` — scope check, reverts out-of-scope changes, runs `git push`
2. Sends a structured completion message to the pipeline's completion stream
3. The pipeline reads the stream and continues (or marks the module PASS/FAIL)

After this call, the orchestrator kills the subagent session.
