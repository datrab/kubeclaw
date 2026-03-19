# progress.json — Field Reference

## Top-Level

```json
{
  "project": "<project>",
  "version": "1.0.0",
  "models": { "forge": "codex-5.4", "buster": "claude-sonnet-4-6", "echo": "claude-opus-4-6" },
  "execution_order": ["01", "02", ..., "gate:midpoint-review", "14", ..., "gate:final-buster", "gate:final-review"],
  "phases": [...],
  "modules": {...},
  "gates": {...}
}
```

| Field | Required | Description |
|---|---|---|
| `project` | yes | Project name — used for memory scoping, git paths, Redis streams |
| `models` | yes | Default LLM per agent. Overridable per module via `forge_model` |
| `execution_order` | yes | Array of module IDs and `gate:` keys in exact execution order |
| `phases` | no | Logical grouping (informational, pipeline ignores it) |

## Module Definition

| Field | Required | Default | Description |
|---|---|---|---|
| `title` | yes | — | Human-readable name |
| `dir` | yes | — | Directory name in repo (e.g. `02-kubernetes-connection`) |
| `substeps` | no | `null` | Array of sub-IDs. Pipeline concatenates their FORGE.md files |
| `depends_on` | yes | `[]` | Modules that must PASS first |
| `timeout_minutes` | no | `45` | Max time for one Forge+Buster cycle |
| `max_fails` | no | `3` | Max failures before BLOCKED |
| `forge_subagent` | no | from `models.forge` | ACP subagent ID |
| `forge_model` | no | from `models.forge` | LLM model for Forge |
| `test_suites` | no | `["build","health"]` | Which Buster suites run |
| `test_config` | no | `{serve:{type:"static"}}` | Suite-specific config (see below) |

### Backend Module Example (Python/FastAPI)

```json
"02": {
  "title": "Kubernetes Connection Layer",
  "dir": "02-kubernetes-connection",
  "substeps": null,
  "depends_on": ["01"],
  "timeout_minutes": 30,
  "max_fails": 3,
  "forge_subagent": "forge-codex",
  "forge_model": "codex-5.4",
  "test_suites": ["build", "health", "api", "security", "unit"],
  "test_config": {
    "serve": {
      "type": "server",
      "project_dir": "Projects/<project>/src",
      "start_cmd": "cd backend && pip install -r requirements.txt -q && KUBECOMMAND_API_KEY=test-key-123 IN_CLUSTER=false uvicorn main:app --host 0.0.0.0 --port 8000",
      "image": "python:3.12-slim",
      "port": 8000,
      "health_path": "/api/v1/health"
    },
    "api": { "spec_file": ".swarm/modules/02-kubernetes-connection/test-spec.json" },
    "unit": { "test_cmd": "cd backend && pip install -r requirements.txt -r dev-requirements.txt -q && python -m pytest tests/ -v --tb=short" }
  }
}
```

### Frontend Module Example (React/Vite, with visual-reg + e2e)

```json
"15": {
  "title": "Dashboard + Core Pages",
  "dir": "15-dashboard-core-pages",
  "substeps": ["15a", "15b", "15c", "15d"],
  "depends_on": ["14"],
  "timeout_minutes": 60,
  "max_fails": 3,
  "forge_subagent": "forge-sonnet",
  "forge_model": "claude-sonnet-4-6",
  "test_suites": ["build", "health", "a11y", "perf", "bundle", "visual-reg", "e2e", "unit"],
  "test_config": {
    "serve": {
      "type": "static",
      "project_dir": "Projects/<project>/src",
      "build_cmd": "cd frontend && npm install && npm run build",
      "image": "node:20-slim"
    },
    "visual-reg": { "baseline_dir": ".swarm/modules/15-dashboard-core-pages/baselines" },
    "e2e": { "tests_dir": ".swarm/modules/15-dashboard-core-pages/tests" },
    "unit": { "test_cmd": "cd frontend && npm install && npx vitest run --reporter=verbose" }
  }
}
```

## serve Config

### `type: "server"` (Backend)

| Field | Default | Description |
|---|---|---|
| `project_dir` | repo root | **Must set.** Relative to repo root (e.g. `Projects/<project>/src`) |
| `start_cmd` | `npm start` | Must install deps, set env vars, start server |
| `image` | `node:20-slim` | Podman image. Python → `python:3.12-slim` |
| `port` | `3000` | Server listen port. Python/uvicorn → `8000` |
| `health_path` | `/` | Must respond without auth |

### `type: "static"` (Frontend)

| Field | Default | Description |
|---|---|---|
| `project_dir` | repo root | **Must set.** |
| `build_cmd` | `npm run build` | Must install deps + build. `sandbox-build` auto-copies `dist/`, `build/`, or `out/` to `/sandbox/www/` |
| `image` | `node:20-slim` | Podman image |
| `port` | `9999` | nginx serves on this port (rarely changed) |

### Suite-Specific Config

| Suite | Config key | Fields |
|---|---|---|
| `api` | `api` | `spec_file` (path to test-spec.json), `thresholds: { max_failures: N }` |
| `e2e` | `e2e` | `tests_dir` (path to Playwright tests), `timeout_ms`, `thresholds: { max_failures: N }` |
| `visual-reg` | `visual-reg` | `baseline_dir` (path to baselines/), `thresholds: { max_diff_percent: N }` |
| `a11y` | `a11y` | `tags`, `path`, `exclude`, `thresholds: { critical: N, serious: N }` |
| `perf` | `perf` | `thresholds: { performance: N, accessibility: N }` |
| `bundle` | `bundle` | `thresholds: { max_size_kb: N, max_file_count: N }` |
| `security` | `security` | `paths` (array), `check_cors`, `thresholds: { max_missing_headers: N }` |
| `unit` | `unit` | `test_cmd`, `timeout_ms`, `thresholds: { max_failures: N }` |

All relative paths (`spec_file`, `tests_dir`, `baseline_dir`) resolve from `project_dir`.

Without `thresholds` → informational (always PASS). With `thresholds` → enforced (can FAIL). Gates should always have `thresholds`.

**SKIP behavior:** Suites that require external artifacts will SKIP (not FAIL) when the artifact is missing:
- `api` without `spec_file` → SKIP
- `e2e` without `tests_dir` → SKIP (Buster subagent writes tests on first run, e2e.js picks them up on subsequent runs)
- `visual-reg` without baseline (no `.png` and no `.html` in `baseline_dir`) → SKIP
- `unit` without `test_cmd` and no `package.json` test script → SKIP

## Gate Definitions

### Review Gate (Echo)

```json
"midpoint-review": {
  "type": "review",
  "title": "Echo Midpoint Review",
  "review_name": "MIDPOINT-REVIEW",
  "on_nogo": "fix_and_continue",
  "instructions_file": "echo-review/MIDPOINT-REVIEW-INSTRUCTIONS.md",
  "output_file": "echo-review/MIDPOINT-REVIEW.json",
  "review_output_dir": "echo-review",
  "reviewers": null,
  "timeout_minutes": 30,
  "max_fix_cycles": null,
  "lint_tier": null
}
```

- `on_nogo: "fix_and_continue"` → Forge fixes, pipeline continues (non-blocking)
- `on_nogo: "fix_and_rereview"` → Forge fixes, Echo re-reviews (strict)
- Gate paths (`instructions_file`, `output_file`) relative to `.swarm/`
- No `test_suites`/`test_config` needed

### Buster Gate (System Test, enforced)

For a **backend-only** or **fullstack** project, the gate tests the backend deterministically. Frontend testing is handled by the Buster subagent via Docker image + Playwright (see FINAL-BUSTER.md).

```json
"final-buster": {
  "type": "buster",
  "title": "Final System Test",
  "on_fail": "fix_and_retest",
  "instructions_file": "buster-test/FINAL-BUSTER.md",
  "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
  "model": "claude-sonnet-4-6",
  "forge_model": "codex-5.4",
  "timeout_minutes": 60,
  "max_fix_cycles": 3,
  "test_suites": ["build", "health", "api", "security", "unit"],
  "test_config": {
    "serve": {
      "type": "server",
      "project_dir": "Projects/<project>/src",
      "start_cmd": "cd backend && pip install -r requirements.txt -q && API_KEY=test-key-123 uvicorn main:app --host 0.0.0.0 --port 8000",
      "image": "python:3.12-slim",
      "port": 8000,
      "health_path": "/api/v1/health"
    },
    "api":      { "spec_file": ".swarm/buster-test/final-test-spec.json", "thresholds": { "max_failures": 0 } },
    "security": { "paths": ["/api/v1/health", "/api/v1/pods"], "thresholds": { "max_missing_headers": 0 } },
    "unit":     { "test_cmd": "cd backend && pip install -r requirements.txt -r dev-requirements.txt -q && python -m pytest tests/ -v --tb=short", "thresholds": { "max_failures": 0 } }
  }
}
```

Every suite has `thresholds` → enforced. Any failure counts. Fix cycle: Forge fixes → Buster retests → up to `max_fix_cycles`.

**Note:** Frontend-specific suites (`a11y`, `perf`, `bundle`, `visual-reg`, `e2e`) should NOT be in the gate when `serve.type: "server"` — they need a static build + nginx, not a Python backend. The Buster subagent handles frontend validation via Docker image + Playwright in FINAL-BUSTER.md.
