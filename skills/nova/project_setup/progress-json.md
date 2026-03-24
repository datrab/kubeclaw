# progress.json — Field Reference

## Top-Level

```json
{
  "project": "<project>",
  "version": "1.0.0",
  "models": { "forge": "claude-sonnet-4-6", "buster": "claude-sonnet-4-6", "echo": "claude-opus-4-6" },
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
| `timeout_minutes` | no | `300` | Max time for one Forge+Buster cycle |
| `max_fails` | no | `3` | Max failures before BLOCKED |
| `forge_subagent` | no | from `models.forge` | ACP subagent ID |
| `forge_model` | no | from `models.forge` | LLM model for Forge |
| `test_suites` | no | `["build","health"]` | Which Buster suites run |
| `test_config` | no | `{serve:{type:"static"}}` | Suite-specific config (see below) |

### Backend Module Example (Python/FastAPI with Dockerfile)

```json
"02": {
  "title": "Kubernetes Connection Layer",
  "dir": "02-kubernetes-connection",
  "substeps": null,
  "depends_on": ["01"],
  "timeout_minutes": 300,
  "max_fails": 3,
  "forge_subagent": "forge-sonnet",
  "forge_model": "claude-sonnet-4-6",
  "test_suites": ["build", "health", "api", "security", "unit"],
  "test_config": {
    "serve": {
      "type": "server",
      "project_dir": "Projects/<project>/src",
      "start_cmd": "KUBECOMMAND_API_KEY=test_api_key_for_buster_minimum_32_chars IN_CLUSTER=false python -m uvicorn main:app --host 0.0.0.0 --port 8000",
      "image": "kubecommand-backend:m02",
      "port": 8000,
      "health_path": "/api/v1/health",
      "health_retries": 10,
      "health_timeout": 15000,
      "health_base_delay": 5000,
      "dockerfile": "Projects/<project>/src/backend/Dockerfile",
      "build_context": "Projects/<project>/src/backend/",
      "build_timeout": 1800
    },
    "api": { "spec_file": ".swarm/modules/02-kubernetes-connection/test-spec.json" },
    "unit": { "test_cmd": "KUBECOMMAND_API_KEY=test_api_key_for_buster_minimum_32_chars IN_CLUSTER=false python -m pytest backend/tests/ -v --tb=short" }
  }
}
```

**Key pattern — Dockerfile build:** When `dockerfile` is set, Buster runs `podman build --pull=never -t <image> -f <dockerfile> <build_context>` before `podman run`. Dependencies are baked into the image, so `start_cmd` does NOT include `pip install` — just the server start command with env vars.

**Critical: `dockerfile` and `build_context` paths are relative to the repo root, NOT to `project_dir`.** Use the full path from repo root (e.g. `Projects/<project>/src/backend/Dockerfile`). Short paths like `backend/Dockerfile` will resolve against the repo root and fail.

### Frontend Module Example (React/Vite)

```json
"15": {
  "title": "Dashboard + Core Pages",
  "dir": "15-dashboard-core-pages",
  "substeps": ["15a", "15b", "15c", "15d"],
  "depends_on": ["14"],
  "timeout_minutes": 300,
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
    "visual-reg": { "baseline_dir": ".swarm/modules/15-dashboard-core-pages/baselines", "discord": "summary" },
    "e2e": { "tests_dir": ".swarm/modules/15-dashboard-core-pages/tests" },
    "unit": { "test_cmd": "cd frontend && npm install && npx vitest run --reporter=verbose" }
  }
}
```

**Key difference from backend:** No `dockerfile`/`build_context` — frontend uses `sandbox-build` with `build_cmd`. Dependencies install via `npm install` in `build_cmd` because there is no Dockerfile. `image: "node:20-slim"` is the raw base image pulled from the registry mirror.

## serve Config

### `type: "server"` (Backend)

| Field | Default | Description |
|---|---|---|
| `project_dir` | repo root | **Must set.** Relative to repo root (e.g. `Projects/<project>/src`) |
| `start_cmd` | `npm start` | Server start command. Do NOT include `pip install` when using `dockerfile` — deps are baked in |
| `image` | `node:20-slim` | Image tag for `podman run`. With `dockerfile`: use a project-specific tag (e.g. `kubecommand-backend:m01`). Without: use raw base image |
| `port` | `3000` | Server listen port. Python/uvicorn → `8000` |
| `health_path` | `/` | Must respond without auth |
| `health_retries` | `3` | Number of health check retries. Set to `10` for backends with slow startup |
| `health_timeout` | `10000` | Timeout per health check attempt in ms |
| `health_base_delay` | `2000` | Initial delay before first health check in ms. Set to `5000` for slow-starting backends |
| `dockerfile` | — | Path to Dockerfile, relative to repo root (e.g. `Projects/<project>/src/backend/Dockerfile`). NOT relative to `project_dir`. When set, `podman build --pull=never` runs before `podman run` |
| `build_context` | dirname of `dockerfile` | Docker build context path, relative to repo root (e.g. `Projects/<project>/src/backend/`). NOT relative to `project_dir` |
| `build_timeout` | `300` | Dockerfile build timeout in seconds |

**Dockerfile convention:** Dockerfiles must use fully-qualified image names (e.g. `FROM docker.io/library/python:3.12-slim`). Unqualified names cause Podman cache misses and network pulls.

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
| `visual-reg` | `visual-reg` | `baseline_dir` (path to baselines/), `thresholds: { max_diff_percent: N }`, `discord: "summary"\|"all"` |
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
- `visual-reg` without baseline (no `.png`, `.html`, or `paths.json` in `baseline_dir`) → SKIP

**visual-reg multi-path mode:** When `baseline_dir` contains a `paths.json` (or an HTML preview with `data-routes` manifest), the suite runs in multi-path mode — screenshotting and comparing every page listed. `paths.json` + baseline PNGs are auto-generated from Prism preview HTML files. See [module-files.md](references/module-files.md) and [prism-conventions.md](references/prism-conventions.md) for details.
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
  "forge_model": "claude-sonnet-4-6",
  "timeout_minutes": 60,
  "max_fix_cycles": 3,
  "test_suites": ["build", "health", "api", "security", "unit"],
  "test_config": {
    "serve": {
      "type": "server",
      "project_dir": "Projects/<project>/src",
      "start_cmd": "KUBECOMMAND_API_KEY=test-key-123 IN_CLUSTER=false python -m uvicorn main:app --host 0.0.0.0 --port 8000",
      "image": "<project>-backend:gate-final",
      "port": 8000,
      "health_path": "/api/v1/health",
      "health_retries": 10,
      "health_timeout": 15000,
      "health_base_delay": 5000,
      "dockerfile": "Projects/<project>/src/backend/Dockerfile",
      "build_context": "Projects/<project>/src/backend/",
      "build_timeout": 1800
    },
    "api":      { "spec_file": ".swarm/buster-test/final-test-spec.json", "thresholds": { "max_failures": 0 } },
    "security": { "paths": ["/api/v1/health", "/api/v1/pods"], "thresholds": { "max_missing_headers": 0 } },
    "unit":     { "test_cmd": "KUBECOMMAND_API_KEY=test-key-123 IN_CLUSTER=false python -m pytest backend/tests/ -v --tb=short", "thresholds": { "max_failures": 0 } }
  }
}
```

Every suite has `thresholds` → enforced. Any failure counts. Fix cycle: Forge fixes → Buster retests → up to `max_fix_cycles`.

**Note:** Frontend-specific suites (`a11y`, `perf`, `bundle`, `visual-reg`, `e2e`) should NOT be in the gate when `serve.type: "server"` — they need a static build + nginx, not a Python backend. The Buster subagent handles frontend validation via Docker image + Playwright in FINAL-BUSTER.md.
