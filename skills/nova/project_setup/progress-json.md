# progress.json — Complete Field Reference

## Top-Level

```json
{
  "project": "my-project",
  "version": 1,
  "description": "Optional human-readable description",
  "notes": ["Optional array of notes"],
  "models": {
    "forge": "anthropic/claude-sonnet-4-6",
    "buster": "anthropic/claude-sonnet-4-6",
    "echo": "anthropic/claude-opus-4-6"
  },
  "execution_order": ["01-scaffold", "02-api", "gate:midpoint-review", "03-frontend", "gate:final-buster"],
  "modules": { ... },
  "gates": { ... },
  "arch_validation": { ... },
  "pipeline_review": { ... },
  "case_study": { ... },
  "telemetry": { ... }
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `project` | **yes** | — | Project name — used for memory scoping, git paths, Redis streams |
| `version` | no | `1` | Schema version |
| `description` | no | — | Human-readable project description |
| `notes` | no | — | Array of informational notes (ignored by pipeline) |
| `models` | **yes** | — | Default LLM per agent role. Overridable per module/gate |
| `execution_order` | **yes** | — | Array of module IDs and `gate:<id>` keys in exact execution order |
| `modules` | **yes** | — | Module definitions (see below) |
| `gates` | **yes** | — | Gate definitions (see below) |
| `arch_validation` | no | `{ enabled: true }` | Architecture validator config |
| `pipeline_review` | no | `{ enabled: false }` | Post-pipeline review agent config |
| `case_study` | no | `{ enabled: false }` | Post-pipeline case study agent config |
| `telemetry` | no | — | Redis telemetry stream config |
| `acp_monitor` | no | — | ACP session monitoring config (transcript extension limits) |
| `payload` | no | — | Payload dispatch config (rate limiting, ACP overrides) |
| `phases` | no | — | Logical grouping (informational only, pipeline ignores it) |

---

## Module Definition

```json
"01-scaffold": {
  "title": "Project Scaffold",
  "dir": "01-scaffold",
  "depends_on": [],
  "stages": ["forge", "buster"],
  "timeout_minutes": 120,
  "max_fails": 3,
  "forge_model": "anthropic/claude-sonnet-4-6",
  "thinking_level": "adaptive",
  "test_suites": ["build", "health", "unit"],
  "test_config": { ... }
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `title` | **yes** | — | Human-readable name |
| `dir` | **yes** | — | Directory name under `.swarm/modules/` |
| `depends_on` | **yes** | `[]` | Module IDs that must PASS first |
| `stages` | no | `["forge", "buster"]` | Pipeline stages. Use `["forge"]` for forge-only (no per-module testing) |
| `timeout_minutes` | no | `300` | Max time for one Forge+Buster cycle |
| `max_fails` | no | `3` | Max failures before BLOCKED |
| `forge_model` | no | from `models.forge` | LLM model for Forge agent |
| `thinking_level` | no | — | Thinking level for Forge. String: `"none"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`, `"adaptive"` |
| `substeps` | no | `null` | Array of sub-IDs. Pipeline concatenates their FORGE.md sections |
| `forge_subagent` | no | derived | ACP subagent ID override |
| `session` | no | — | Per-task runtime selection: `{ "runtime": "acp" }` or `{ "runtime": "subagent" }` |
| `test_suites` | no | `["build","health"]` | Which Buster suites run |
| `test_config` | no | `{}` | Suite-specific config (see Serve & Suite Config below) |

### Forge-Only Modules

Set `"stages": ["forge"]` to skip per-module Buster testing. The module passes when Forge completes and pushes changes. Use this when:
- Changes are validated by a gate-level Buster later
- The module is documentation-only or config-only
- You want faster iteration with testing deferred to gates

---

## Gate Definitions

### Review Gate (Echo)

```json
"midpoint-review": {
  "type": "review",
  "title": "Midpoint Review",
  "review_name": "MIDPOINT-REVIEW",
  "on_nogo": "fix_and_rereview",
  "instructions_file": "echo-review/MIDPOINT-REVIEW-INSTRUCTIONS.md",
  "output_file": "logs/echo-review/MIDPOINT-REVIEW.json",
  "review_output_dir": "logs/echo-review",
  "reviewers": [
    {
      "label": "echo-opus",
      "model": "anthropic/claude-opus-4-6",
      "dispatch": "acp",
      "agent_id": "claude"
    }
  ],
  "forge_model": "anthropic/claude-sonnet-4-6",
  "forge_thinking_level": "adaptive",
  "timeout_minutes": 45,
  "max_fix_cycles": 3
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `type` | **yes** | — | `"review"` |
| `title` | **yes** | — | Human-readable title |
| `review_name` | **yes** | — | Review identifier (used in filenames) |
| `on_nogo` | no | `"fix_and_rereview"` | What to do on NO-GO: `"fix_and_rereview"` or `"stop"` |
| `instructions_file` | **yes** | — | Path to review instructions (relative to `.swarm/`) |
| `output_file` | **yes** | — | Path for review JSON output (relative to `.swarm/`) |
| `review_output_dir` | no | — | Directory for review artifacts (relative to `.swarm/`) |
| `reviewers` | no | auto from `models.echo` | Array of reviewer configs |
| `forge_model` | no | gateway default | Model for fix-cycle Forge agent. **Set this to avoid fallback to gateway default** |
| `forge_thinking_level` | no | — | Thinking level for fix-cycle Forge |
| `timeout_minutes` | no | `30` | Max time per review session |
| `max_fix_cycles` | no | `3` | Max fix-and-rereview cycles before escalation |
| `lint_tier` | no | `"full"` | Lint tier: `"full"` or `"pre-check"` |

**Reviewer dispatch:**
- Anthropic/Claude → `dispatch: "acp"`, `agent_id: "claude"`
- OpenAI/Codex/GPT → `dispatch: "subagent"`, `agent_id: "codex"`

### Buster Gate (System Test)

```json
"final-buster": {
  "type": "buster",
  "title": "Final System Test",
  "on_fail": "fix_and_retest",
  "instructions_file": "buster-test/FINAL-BUSTER.md",
  "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
  "model": "anthropic/claude-sonnet-4-6",
  "forge_model": "anthropic/claude-sonnet-4-6",
  "timeout_minutes": 90,
  "max_fix_cycles": 3,
  "test_suites": ["build", "health", "unit"],
  "test_config": { ... }
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `type` | **yes** | — | `"buster"` |
| `title` | **yes** | — | Human-readable title |
| `on_fail` | no | `"fix_and_retest"` | What to do on FAIL |
| `instructions_file` | **yes** | — | Path to Buster instructions (relative to `.swarm/`) |
| `output_file` | **yes** | — | Path for result JSON (relative to `.swarm/`) |
| `model` | no | from `models.buster` | Model for Buster agent |
| `forge_model` | no | from `models.forge` | Model for fix-cycle Forge agent |
| `timeout_minutes` | no | `60` | Max time per test run |
| `max_fix_cycles` | no | `3` | Max fix-and-retest cycles |
| `test_suites` | **yes** | — | Suites to run |
| `test_config` | **yes** | — | Suite configs with serve + per-suite settings |

### Approval Gate

```json
"operator-approval": {
  "type": "approval",
  "title": "Operator Approval",
  "on_timeout": "block",
  "timeout_minutes": 60
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `type` | **yes** | — | `"approval"` |
| `title` | **yes** | — | Human-readable title |
| `on_timeout` | no | `"block"` | `"block"` stops pipeline, `"continue"` proceeds |
| `timeout_minutes` | no | `60` | How long to wait for operator response |

---

## Architecture Validation

```json
"arch_validation": {
  "enabled": true,
  "model": "anthropic/claude-sonnet-4-6",
  "thinking_level": "adaptive"
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `enabled` | no | `true` | Enable/disable. Set `false` to skip entirely |
| `model` | no | from `models.arch_validator` or gateway default | LLM for agent judgment |
| `thinking_level` | no | — | Thinking level for validator agent |

**Behavior:** Only runs on fresh starts (skipped on resume when modules already have PASS). progress.json overrides swarm.config.json.

---

## Pipeline Review

Post-pipeline audit agent — reads logs and recommends improvements.

```json
"pipeline_review": {
  "enabled": true,
  "model": "anthropic/claude-opus-4-6",
  "thinking_level": "high",
  "agent_id": "claude",
  "instructions_file": "pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md",
  "output_file": "logs/pipeline-review/PIPELINE-REVIEW.md",
  "json_output_file": "logs/pipeline-review/PIPELINE-REVIEW.json"
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `enabled` | no | `false` | Enable post-pipeline review |
| `model` | no | from `models.echo` | Review model |
| `thinking_level` | no | — | Thinking level |
| `agent_id` | no | derived from model | Agent ID for dispatch |
| `instructions_file` | no | `pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md` | Custom instructions (relative to `.swarm/`) |
| `output_file` | no | `logs/pipeline-review/PIPELINE-REVIEW.md` | Markdown output (relative to `.swarm/`) |
| `json_output_file` | no | `logs/pipeline-review/PIPELINE-REVIEW.json` | JSON output (relative to `.swarm/`) |

**Dispatch:** Anthropic → ACP, OpenAI → subagent (automatic).

---

## Case Study Agent

Optional post-pipeline agent that generates a publishable case-study.md.

```json
"case_study": {
  "enabled": true,
  "model": "anthropic/claude-sonnet-4-6",
  "thinking_level": "adaptive",
  "agent_id": "claude",
  "output_file": "logs/pipeline/case-study.md",
  "timeout_minutes": 30
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `enabled` | no | `false` | Enable case study generation |
| `model` | no | from `models.echo` | Agent model |
| `thinking_level` | no | — | Thinking level |
| `agent_id` | no | derived from model | Agent ID for dispatch |
| `output_file` | no | `logs/pipeline/case-study.md` | Output path (relative to `.swarm/`) |
| `timeout_minutes` | no | `30` | Max agent runtime |

---

## Telemetry

Redis stream telemetry for external consumers (e.g. ClawDeck dashboard).

```json
"telemetry": {
  "enabled": true,
  "stream_key": "pipeline:telemetry:my-project"
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `enabled` | no | `false` | Enable Redis event publishing |
| `stream_key` | no | `pipeline:telemetry:<project>:<run_id>` | Override stream key |

When enabled, all pipeline events (module status, agent lifecycle, gate verdicts, cost updates) are published to Redis. See `docs/telemetry-event-schema.md` for the full event catalog.

---

## Serve Config

### `type: "server"` (Backend)

| Field | Default | Description |
|---|---|---|
| `project_dir` | repo root | Relative to repo root (e.g. `Projects/<project>/src`) |
| `start_cmd` | `npm start` | Server start command |
| `image` | `node:20-slim` | Podman image tag |
| `port` | `3000` | Server listen port |
| `health_path` | `/` | Health check endpoint |
| `health_retries` | `3` | Health check retry count |
| `health_timeout` | `10000` | Timeout per health check (ms) |
| `health_base_delay` | `2000` | Initial delay before first check (ms) |
| `dockerfile` | — | Path to Dockerfile (relative to repo root) |
| `build_context` | dirname of dockerfile | Docker build context (relative to repo root) |
| `build_timeout` | `300` | Build timeout (seconds) |
| `deployment_yaml` | — | K8s deployment YAML path (relative to repo root) — injects env vars into build |
| `secret_yaml` | — | K8s secret YAML path (relative to repo root) — injects secrets into build |
| `smoke_paths` | — | Array of URL paths to request after health passes (e.g. `["/", "/api/v1/health"]`) |
| `smoke_settle_ms` | `0` | Wait time (ms) after smoke navigation before marking healthy |

### `type: "static"` (Frontend)

| Field | Default | Description |
|---|---|---|
| `project_dir` | repo root | Relative to repo root |
| `build_cmd` | `npm run build` | Must install deps + build |
| `image` | `node:20-slim` | Podman image |

### Suite-Specific Config

| Suite | Config Key | Key Fields |
|---|---|---|
| `api` | `api` | `spec_file`, `thresholds: { max_failures }` |
| `unit` | `unit` | `test_cmd`, `thresholds: { max_failures }` |
| `e2e` | `e2e` | `tests_dir`, `timeout_ms`, `thresholds: { max_failures }` |
| `visual-reg` | `visual-reg` | `baseline_dir`, `thresholds: { max_diff_percent }`, `discord` |
| `a11y` | `a11y` | `tags`, `path`, `thresholds: { critical, serious }` |
| `perf` | `perf` | `thresholds: { performance, accessibility }` |
| `bundle` | `bundle` | `thresholds: { max_size_kb, max_file_count }` |
| `security` | `security` | `paths`, `check_cors`, `thresholds: { max_missing_headers }` |

Without `thresholds` → informational (always PASS). With `thresholds` → enforced (can FAIL).

### test_config.manifest

Optional deployment validation config. Verifies K8s manifests are present and well-formed before testing.

```json
"manifest": {
  "deployment_yaml": "Projects/my-app/src/k8s/deployment.yaml",
  "secret_yaml": "Projects/my-app/src/k8s/secret.yaml",
  "required_env": ["DATABASE_URL", "API_KEY"],
  "private_registries": ["registry.example.com"],
  "thresholds": { "max_missing_env": 0 }
}
```

| Field | Default | Description |
|---|---|---|
| `deployment_yaml` | — | Path to K8s deployment YAML (relative to repo root) |
| `secret_yaml` | — | Path to K8s secret YAML (relative to repo root) |
| `required_env` | `[]` | Env var names that must be present in the deployment |
| `private_registries` | `[]` | Registry hostnames that require pull secrets |
| `thresholds` | `null` | `null` = informational. Set `max_missing_env: 0` to enforce |

---

## ACP Monitor

Controls ACP session transcript extension behavior.

```json
"acp_monitor": {
  "max_transcript_extensions": 5,
  "transcript_grace_ms": 30000
}
```

| Field | Default | Description |
|---|---|---|
| `max_transcript_extensions` | `10` | Max times a session transcript can be extended before force-stopping |
| `transcript_grace_ms` | `60000` | Grace period (ms) after last transcript activity before timeout is enforced |

---

## Payload Config

Controls how task payloads are dispatched to Forge agents.

```json
"payload": {
  "rate_limit": {
    "max_pauses": 3,
    "initial_cooldown_s": 60,
    "max_cooldown_s": 300
  },
  "acp_monitor": {
    "max_transcript_extensions": 5,
    "transcript_grace_ms": 30000
  }
}
```

### payload.rate_limit

| Field | Default | Description |
|---|---|---|
| `max_pauses` | `5` | Max rate-limit pauses before marking the task as failed |
| `initial_cooldown_s` | `30` | Initial cooldown duration (seconds) on first rate-limit hit |
| `max_cooldown_s` | `600` | Max cooldown duration (seconds) after backoff |

### payload.acp_monitor

Same fields as top-level `acp_monitor`. Overrides top-level values for this payload.

---

## Complete Example

```json
{
  "project": "my-app",
  "version": 1,
  "description": "Full-stack K8s management app",
  "models": {
    "forge": "anthropic/claude-sonnet-4-6",
    "buster": "anthropic/claude-sonnet-4-6",
    "echo": "anthropic/claude-opus-4-6"
  },
  "arch_validation": {
    "enabled": false
  },
  "pipeline_review": {
    "enabled": true,
    "model": "anthropic/claude-opus-4-6",
    "thinking_level": "high"
  },
  "case_study": {
    "enabled": true,
    "model": "anthropic/claude-sonnet-4-6",
    "thinking_level": "adaptive"
  },
  "execution_order": [
    "01-scaffold",
    "02-api",
    "gate:midpoint-review",
    "03-frontend",
    "gate:final-review",
    "gate:final-buster"
  ],
  "modules": {
    "01-scaffold": {
      "title": "Project Scaffold",
      "dir": "01-scaffold",
      "depends_on": [],
      "stages": ["forge"],
      "timeout_minutes": 120,
      "max_fails": 3,
      "forge_model": "anthropic/claude-sonnet-4-6",
      "thinking_level": "adaptive",
      "test_suites": []
    },
    "02-api": {
      "title": "REST API",
      "dir": "02-api",
      "depends_on": ["01-scaffold"],
      "stages": ["forge", "buster"],
      "timeout_minutes": 300,
      "max_fails": 3,
      "thinking_level": "adaptive",
      "test_suites": ["build", "health", "unit", "api"],
      "test_config": {
        "serve": {
          "type": "server",
          "project_dir": "Projects/my-app/src",
          "start_cmd": "python -m uvicorn main:app --host 0.0.0.0 --port 8000",
          "image": "my-app-backend:m02",
          "port": 8000,
          "health_path": "/api/v1/health",
          "dockerfile": "Projects/my-app/src/backend/Dockerfile",
          "build_context": "Projects/my-app/src/backend/"
        },
        "unit": { "test_cmd": "python -m pytest backend/tests/ -v" },
        "api": { "spec_file": ".swarm/modules/02-api/test-spec.json" }
      }
    },
    "03-frontend": {
      "title": "Frontend Dashboard",
      "dir": "03-frontend",
      "depends_on": ["02-api"],
      "stages": ["forge", "buster"],
      "timeout_minutes": 300,
      "max_fails": 3,
      "thinking_level": "adaptive",
      "test_suites": ["build", "health", "unit"],
      "test_config": {
        "serve": {
          "type": "static",
          "project_dir": "Projects/my-app/src",
          "build_cmd": "cd frontend && npm install && npm run build",
          "image": "node:20-slim"
        },
        "unit": { "test_cmd": "cd frontend && npm install && npx vitest run" }
      }
    }
  },
  "gates": {
    "midpoint-review": {
      "type": "review",
      "title": "Midpoint Review",
      "review_name": "MIDPOINT-REVIEW",
      "on_nogo": "fix_and_rereview",
      "instructions_file": "echo-review/MIDPOINT-REVIEW-INSTRUCTIONS.md",
      "output_file": "logs/echo-review/MIDPOINT-REVIEW.json",
      "review_output_dir": "logs/echo-review",
      "reviewers": [
        { "label": "echo-opus", "model": "anthropic/claude-opus-4-6", "dispatch": "acp", "agent_id": "claude" }
      ],
      "forge_model": "anthropic/claude-sonnet-4-6",
      "forge_thinking_level": "adaptive",
      "timeout_minutes": 45,
      "max_fix_cycles": 3
    },
    "final-review": {
      "type": "review",
      "title": "Final Review",
      "review_name": "FINAL-REVIEW",
      "on_nogo": "fix_and_rereview",
      "instructions_file": "echo-review/FINAL-REVIEW-INSTRUCTIONS.md",
      "output_file": "logs/echo-review/FINAL-REVIEW.json",
      "review_output_dir": "logs/echo-review",
      "reviewers": [
        { "label": "echo-opus", "model": "anthropic/claude-opus-4-6", "dispatch": "acp", "agent_id": "claude" }
      ],
      "forge_model": "anthropic/claude-sonnet-4-6",
      "forge_thinking_level": "adaptive",
      "timeout_minutes": 60,
      "max_fix_cycles": 3
    },
    "final-buster": {
      "type": "buster",
      "title": "Final System Test",
      "on_fail": "fix_and_retest",
      "instructions_file": "buster-test/FINAL-BUSTER.md",
      "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
      "model": "anthropic/claude-sonnet-4-6",
      "forge_model": "anthropic/claude-sonnet-4-6",
      "timeout_minutes": 90,
      "max_fix_cycles": 3,
      "test_suites": ["build", "health", "unit"],
      "test_config": {
        "serve": {
          "type": "static",
          "project_dir": "Projects/my-app/src",
          "build_cmd": "echo no-build",
          "image": "docker.io/library/node:20-slim"
        },
        "unit": {
          "test_cmd": "node --test pipeline/tests/*.test.js",
          "thresholds": { "max_failures": 0 }
        }
      }
    }
  }
}
```
