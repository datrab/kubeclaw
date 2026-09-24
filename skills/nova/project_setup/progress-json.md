# progress.json — Complete Field Reference

## Top-Level

```json
{
  "project": "my-project",
  "version": 1,
  "description": "Optional human-readable description",
  "notes": ["Optional array of notes"],
  "defaults": {
    "models": {
      "forge": "anthropic/claude-sonnet-4-6",
      "buster": "anthropic/claude-sonnet-4-6",
      "echo": "anthropic/claude-opus-4-6"
    }
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
| `defaults` | no | — | Project defaults, including `defaults.models` and `defaults.thinking` |
| `defaults.models` | no | platform `fallback_model` | Default LLM per agent role. Overridable per module/gate |
| `execution_order` | **yes** | — | Array of module IDs and `gate:<id>` keys in exact execution order |
| `modules` | **yes** | — | Module definitions (see below) |
| `gates` | required when `execution_order` uses `gate:<id>` | `{}` | Gate definitions (see below) |
| `arch_validation` | no | `{ enabled: true }` | Architecture validator config |
| `pipeline_review` | no | `{ enabled: false }` | Post-pipeline review agent config |
| `case_study` | no | `{ enabled: false }` | Post-pipeline case study agent config |
| `telemetry` | no | — | Redis telemetry enable/config |
| `payload` | no | — | Payload dispatch config (rate limiting) |
| `phases` | no | — | Logical grouping (informational only, pipeline ignores it) |

ACP monitor timing is platform-owned and belongs in `swarm.config.json`, not `progress.json`.

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
  "test_suites": [],
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
| `forge_model` | no | from `defaults.models.forge` or platform `fallback_model` | LLM model for Forge agent |
| `thinking_level` | no | — | Thinking level for Forge. String: `"none"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`, `"adaptive"` |
| `substeps` | no | `null` | Array of sub-IDs. Pipeline concatenates their FORGE.md sections |
| `forge_subagent` | no | derived | ACP subagent ID override |
| `session` | no | — | Per-task runtime selection: `{ "runtime": "acp" }` or `{ "runtime": "subagent" }` |
| `test_suites` | no | `[]` | Unmigrated Buster suites only. Use `.swarm/pipeline.json` for migrated suites. |
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
  "on_fail": "stop",
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
  "max_fix_cycles": 0
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `type` | **yes** | — | `"review"` |
| `title` | **yes** | — | Human-readable title |
| `review_name` | **yes** | — | Review identifier (used in filenames) |
| `on_fail` | no | `"stop"` | What to do on FAIL: `"stop"` |
| `instructions_file` | **yes** | — | Path to review instructions (relative to `.swarm/`) |
| `output_file` | **yes** | — | Path for review JSON output (relative to `.swarm/`) |
| `review_output_dir` | no | — | Directory for review artifacts (relative to `.swarm/`) |
| `reviewers` | no | set on gate or `defaults.reviewers`; otherwise none | Array of reviewer configs |
| `forge_model` | no | `defaults.models.forge` or platform `fallback_model` | Reserved for gate-specific Forge policies |
| `forge_thinking_level` | no | — | Reserved for gate-specific Forge policies |
| `timeout_minutes` | no | `30` | Max time per review session |
| `max_fix_cycles` | no | `0` | Reserved; review gates stop on FAIL |
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
  "test_suites": [],
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
| `model` | no | from `defaults.models.buster` or platform `fallback_model` | Model for Buster agent |
| `forge_model` | no | from `defaults.models.forge` or platform `fallback_model` | Model for fix-cycle Forge agent |
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
| `model` | no | from `arch_validation.model`, `defaults.models.arch_validator`, or platform `fallback_model` | LLM for agent judgment |
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
| `model` | no | from `defaults.models.echo` or platform `fallback_model` | Review model |
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
| `model` | no | from `defaults.models.echo` or platform `fallback_model` | Agent model |
| `thinking_level` | no | — | Thinking level |
| `agent_id` | no | derived from model | Agent ID for dispatch |
| `output_file` | no | `logs/pipeline/case-study.md` | Output path (relative to `.swarm/`) |
| `timeout_minutes` | no | `30` | Max agent runtime |

---

## Telemetry

Redis stream telemetry for external consumers (e.g. ClawDeck dashboard).

```json
"telemetry": {
  "enabled": true
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `enabled` | no | `false` | Enable Redis event publishing |

When enabled, all pipeline events (module status, agent lifecycle, gate verdicts, cost updates) are published to the canonical run-scoped stream `pipeline:telemetry:<project>:<run_id>`. See `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` for the canonical event inventory and `docs/telemetry-event-schema.md` for event-by-event payload fields and examples.

---

## Serve Config

### `type: "server"` (Backend)

| Field | Default | Description |
|---|---|---|
| `project_dir` | repo root | Relative to repo root (e.g. `Projects/<project>/src`) |
| `start_cmd` | `npm start` | Server start command |
| `image` | `docker.io/library/node:20-slim` | Fully qualified BuildKit base image |
| `port` | `3000` | Server listen port |
| `dockerfile` | — | Path to Dockerfile (relative to repo root) |
| `build_context` | dirname of dockerfile | Docker build context (relative to repo root) |
| `build_timeout` | `300` | Build timeout (seconds) |
HTTP assertions and retry settings belong to `kubeclaw.http@1` nodes in
`.swarm/pipeline.json`. They do not belong in `serve`.

Kubernetes YAML inputs belong to the root `lint` declaration in
`.swarm/pipeline.json`. Project setup migrates old manifest selections into
that declaration. Nova lint checks those files before deployment.

### `type: "static"` (Frontend)

| Field | Default | Description |
|---|---|---|
| `project_dir` | repo root | Relative to repo root |
| `build_cmd` | `npm run build` | Must install deps + build |
| `image` | `docker.io/library/node:20-slim` | Fully qualified BuildKit base image |

`image` must be a fully qualified registry/namespace reference. Shorthand names such as `node:20-slim` are rejected before Buster accepts a task.

### Suite-Specific Config

| Suite | Config Key | Key Fields |
|---|---|---|
| `api` | `api` | `spec_file`, `thresholds: { max_failures }` |
| `e2e` | retired | Declare `kubeclaw.playwright@1` with the project Playwright configuration in `.swarm/pipeline.json` |
| `visual-reg` | retired | Declare `kubeclaw.visual@1` with reviewed manifest and profile files in `.swarm/pipeline.json` |
| `a11y` | `a11y` | `tags`, `path`, `thresholds: { critical, serious }` |
| `perf` | `perf` | `thresholds: { performance, accessibility }` |
| `security` | retired | Declare the five `kubeclaw.security-*@1` and Trivy provider nodes in `.swarm/pipeline.json` |

Without `thresholds` → informational (always PASS). With `thresholds` → enforced (can FAIL).

Security configuration is not accepted through `test_suites` or `test_config`.
Declare the header, dependency, image, static Kubernetes, and runtime Kubernetes
providers explicitly. See
`docs/site/reference/buster-suites.md#11-security-suite`.

Bundle limits are not a current legacy suite configuration. Project setup
migrates an existing `bundle` selection only when `bundle.www_dir` names the
build output. It writes a direct-command archive producer and a
`kubeclaw.size-budget@1` node to `.swarm/pipeline.json`.

Unit tests are not a legacy `test_suites` value. Declare them as normal test
nodes in `.swarm/pipeline.json`. See
`docs/site/reference/buster-suites.md#1-unit-suite` for complete JUnit,
exit-code, multi-instance, advisory, and coverage examples.

Visual-reg baseline files are not configured by path. Buster derives them from module identity at `.swarm/modules/<module-dir>/baselines/`; place Prism `preview.html`, generated `paths.json`, and baseline PNGs there.

### test_config.k8s

The retired `test_config.k8s` object is not valid for new projects. Use
`kubeclaw.kubernetes-fixture@1` in `.swarm/pipeline.json`.

The fixture node requires a checked manifest and an immutable local-registry
image. It does not rewrite the manifest. The image in the manifest must match
the declared image and digest.

Use `retention.mode: "delete"` for normal runs. Use `retention.mode: "retain"`
only when an operator needs short-lived inspection time. The controller deletes
the retained namespace when its bounded retention period expires.

Secret references must appear in both operator allowlists. The provider and the
namespace controller reject other Secret names.

See `docs/site/reference/buster-suites.md#3-kubernetes-fixture-suite`
for the complete configuration and typed input contract. Preview exposure is a
separate suite concern. Do not put preview settings in the fixture node.

## Payload Config

Controls how task payloads are dispatched to Forge agents.

```json
"payload": {
  "rate_limit": {
    "max_pauses": 3,
    "initial_cooldown_s": 60,
    "max_cooldown_s": 300
  }
}
```

### payload.rate_limit

| Field | Default | Description |
|---|---|---|
| `max_pauses` | `5` | Max rate-limit pauses before marking the task as failed |
| `initial_cooldown_s` | `30` | Initial cooldown duration (seconds) on first rate-limit hit |
| `max_cooldown_s` | `600` | Max cooldown duration (seconds) after backoff |

---

## Complete Example

```json
{
  "project": "my-app",
  "version": 1,
  "description": "Full-stack K8s management app",
  "defaults": {
    "models": {
      "forge": "anthropic/claude-sonnet-4-6",
      "buster": "anthropic/claude-sonnet-4-6",
      "echo": "anthropic/claude-opus-4-6"
    }
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
      "test_suites": ["api"],
      "test_config": {
        "serve": {
          "type": "server",
          "project_dir": "Projects/my-app/src",
          "start_cmd": "python -m uvicorn main:app --host 0.0.0.0 --port 8000",
          "image": "my-app-backend:m02",
          "port": 8000,
          "dockerfile": "Projects/my-app/src/backend/Dockerfile",
          "build_context": "Projects/my-app/src/backend/"
        },
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
  "test_suites": [],
      "test_config": {
        "serve": {
          "type": "static",
          "project_dir": "Projects/my-app/src",
          "build_cmd": "cd frontend && npm install && npm run build",
          "image": "docker.io/library/node:20-slim"
        }
      }
    }
  },
  "gates": {
    "midpoint-review": {
      "type": "review",
      "title": "Midpoint Review",
      "review_name": "MIDPOINT-REVIEW",
      "on_fail": "stop",
      "instructions_file": "echo-review/MIDPOINT-REVIEW-INSTRUCTIONS.md",
      "output_file": "logs/echo-review/MIDPOINT-REVIEW.json",
      "review_output_dir": "logs/echo-review",
      "reviewers": [
        { "label": "echo-opus", "model": "anthropic/claude-opus-4-6", "dispatch": "acp", "agent_id": "claude" }
      ],
      "forge_model": "anthropic/claude-sonnet-4-6",
      "forge_thinking_level": "adaptive",
      "timeout_minutes": 45,
      "max_fix_cycles": 0
    },
    "final-review": {
      "type": "review",
      "title": "Final Review",
      "review_name": "FINAL-REVIEW",
      "on_fail": "stop",
      "instructions_file": "echo-review/FINAL-REVIEW-INSTRUCTIONS.md",
      "output_file": "logs/echo-review/FINAL-REVIEW.json",
      "review_output_dir": "logs/echo-review",
      "reviewers": [
        { "label": "echo-opus", "model": "anthropic/claude-opus-4-6", "dispatch": "acp", "agent_id": "claude" }
      ],
      "forge_model": "anthropic/claude-sonnet-4-6",
      "forge_thinking_level": "adaptive",
      "timeout_minutes": 60,
      "max_fix_cycles": 0
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
      "test_suites": [],
      "test_config": {
        "serve": {
          "type": "static",
          "project_dir": "Projects/my-app/src",
          "build_cmd": "echo no-build",
          "image": "docker.io/library/node:20-slim"
        }
      }
    }
  }
}
```
