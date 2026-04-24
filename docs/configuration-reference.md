# Configuration Reference

Consolidated reference for all pipeline and buster configuration. One place to find every knob.

---

## progress.json

The canonical project definition file. Loaded by the pipeline at startup.

See `project_setup/progress-json.md` for the complete field reference.

Key top-level fields:

| Field | Required | Description |
|---|---|---|
| `project` | yes | Project name — scopes memory, git paths, Redis streams |
| `models.forge` | no | Model for forge agents (default: `anthropic/claude-sonnet-4-6`) |
| `models.buster` | no | Model for buster agents |
| `models.echo` | no | Model for reviewer agents |
| `execution_order` | yes | Ordered list of module IDs and gate IDs |
| `modules` | yes | Module definitions |
| `gates` | no | Gate definitions (`review`, `buster`, `approval`) |
| `telemetry.enabled` | no | Enable Redis telemetry stream (default: true if `REDIS_HOST` is set) |

---

## Pipeline environment variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `redis-master.kubeclaw.svc.cluster.local` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis auth password |
| `DISCORD_WEBHOOK` | — | Discord webhook URL for pipeline notifications |
| `OPENCLAW_GATEWAY_TOKEN` | — | ACP Gateway auth token |
| `REPO_ROOT` | auto-detected | Repository root path |
| `SWARM_CONFIG` | auto-detected platform `swarm.config.json` | Path to swarm config JSON |

---

## Buster environment variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `redis-master.kubeclaw.svc.cluster.local` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis auth password |
| `DISCORD_WEBHOOK_URL` | — | Discord webhook for suite result embeds (Buster Pipeline) |
| `DISCORD_WEBHOOK` | — | Discord webhook for task/completion messages (redis.js) |
| `BUSTER_PROJECT` | — | Project name fallback when not in task payload |
| `GATEWAY_URL` | — | ACP Gateway URL for subagent spawn |
| `GATEWAY_TOKEN` | — | ACP Gateway auth token |
| `AGENT_NAME` | `unknown` | Subagent identity for Redis consumer group |
| `HOSTNAME` | pod hostname | Used to build unique consumer name |

---

## Buster task payload fields

Sent from the pipeline to the Buster Pipeline via Redis task stream.

| Field | Type | Default | Description |
|---|---|---|---|
| `module_id` | string | — | Module being tested (e.g. `"06"`) |
| `task_type` | string | `"module_test"` | Task type identifier |
| `attempt` | number | `1` | Attempt number (1-based) |
| `suites` | string[] | — | Ordered list of suite names to run |
| `serve_type` | string\|null | null | Build serve type: `"static"`, `"server"` |
| `commit_hash` | string\|null | null | Deterministic git checkout target; null = fast-forward |
| `project` | string | — | Project name |
| `run_id` | string | auto | Pipeline run identifier |
| `log_dir` | string\|null | auto | Override for Buster Pipeline log directory |
| `telemetry_stream` | string\|null | auto | Legacy compatibility field. The value does not rename the stream; Buster normalizes to the canonical run stream. |
| `timeout_seconds` | number | `1800` | Subagent session timeout |
| `prompt` | string | — | Buster subagent prompt text |
| `session.model` | string | `"anthropic/claude-sonnet-4-6"` | Model for subagent spawn |
| `test_config` | object | `{}` | Suite configuration (see below) |

---

## Buster suite configuration

All fields live under `test_config` in the task payload, keyed by suite name.

### serve

Used by `build` and `health` suites.

| Field | Type | Description |
|---|---|---|
| `type` | string | `"static"` (nginx on :9999) or `"server"` (podman container) |
| `build_cmd` | string | Build command (e.g. `"npm run build"`) |
| `image` | string | Container image for build/run |
| `port` | number | Port the app serves on (default: 9999 for static, 3000 for server) |
| `health_path` | string | Health check path (default: `"/"`) |
| `start_cmd` | string | Server start command (server mode only) |

### manifest

| Field | Type | Description |
|---|---|---|
| `deployment_yaml` | string | Path to Kubernetes deployment YAML (repo-relative) |
| `secret_yaml` | string | Path to Kubernetes secret YAML (optional) |
| `required_env` | string[] | Env var names that must appear in container spec |
| `private_registries` | string[] | Registry prefixes that require `imagePullSecrets` |
| `thresholds.max_issues` | number | Max total findings before FAIL (default: none enforced) |

### api

| Field | Type | Description |
|---|---|---|
| `spec_file` | string | Path to JSON test spec file |
| `thresholds.max_failures` | number | Max test failures before FAIL (omit for informational mode) |

### unit

| Field | Type | Description |
|---|---|---|
| `test_cmd` | string | Custom test command (default: `npm test`; skips package.json check when set) |

### e2e

| Field | Type | Description |
|---|---|---|
| `tests_dir` | string | Directory containing `*.spec.js` / `*.test.js` files (suite skips if absent) |

### a11y

| Field | Type | Description |
|---|---|---|
| `tags` | string[] | axe-core rule tags (e.g. `["wcag2a", "wcag2aa"]`) |
| `exclude` | string[] | CSS selectors to exclude from scan |
| `thresholds.critical` | number | Max critical violations (omit for informational mode) |
| `thresholds.serious` | number | Max serious violations |

### perf

| Field | Type | Description |
|---|---|---|
| `thresholds.performance` | number | Min Lighthouse performance score 0–100 (omit for informational) |
| `thresholds.accessibility` | number | Min Lighthouse accessibility score |
| `thresholds.best_practices` | number | Min Lighthouse best-practices score |
| `thresholds.seo` | number | Min Lighthouse SEO score |

### bundle

| Field | Type | Description |
|---|---|---|
| `thresholds.max_size_kb` | number | Max total build output size in KB (omit for informational) |
| `thresholds.max_file_count` | number | Max number of output files |

### security

| Field | Type | Description |
|---|---|---|
| `thresholds.critical` | number | Max critical header findings (omit for informational) |
| `thresholds.serious` | number | Max serious header findings |

### visual_reg

| Field | Type | Description |
|---|---|---|
| `pages` | string[] | URLs to capture and diff |
| `threshold` | number | Max pixel diff percentage before FAIL |

---

## Per-task model override

Module and gate definitions in `progress.json` support a `model` field to override the project-level default:

```json
{
  "modules": {
    "06": {
      "title": "WebSockets",
      "dir": "06-websockets",
      "model": "anthropic/claude-opus-4-6"
    }
  }
}
```

The effective model resolution order: task-level override → scope policy → project default → config default.

---

## Telemetry configuration

| Field in progress.json | Default | Description |
|---|---|---|
| `telemetry.enabled` | true if `REDIS_HOST` set | Enable/disable Redis telemetry |
| `telemetry.stream_key` | — | Legacy-compatible enable flag. If set, telemetry is on, but the value does not rename the stream. |

Canonical telemetry stream key for both Nova and Buster: `pipeline:telemetry:<project>:<run_id>`

See `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` for the canonical event inventory and `docs/telemetry-event-schema.md` for event-by-event payload fields and examples.
