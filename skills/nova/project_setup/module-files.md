# Module Files — Writing Guide

## FORGE.md

### Structure

```markdown
# Module XX — Title

## Goal
What to build (1-2 sentences).

## Acceptance Criteria
- Concrete, testable criteria
- Endpoint specs with method, path, request, response
- Error codes and edge cases

## Architecture Constraints
Technical requirements: patterns, helpers, data models.

## Files to Produce
File list with descriptions.

## Unit Tests (<framework>)
Test files with concrete test cases. ← REQUIRED
```

**Note:** `Out of Scope` is optional. Only include it on standalone modules (no substeps) where scope boundaries are non-obvious — e.g. Module 01 "scaffold only, no implementations". For substep FORGEs, omit it — the Goal section already defines scope, and OOS across concatenated substeps adds noise.

### Unit Test Section — REQUIRED

Without this section Forge writes no tests → requested `unit.ts` fails typed Buster validation because real tests are required.

**Python (pytest):**
```markdown
## Unit Tests (pytest)

Write unit tests in `backend/tests/` using pytest + pytest-asyncio + httpx.

**Dev dependencies** in `backend/dev-requirements.txt`: pytest, pytest-asyncio, httpx

| File | What it tests |
|------|---------------|
| `tests/test_helpers.py` | `parse_cpu("500m")`→500, `parse_memory("1Gi")`→1024. |
| `tests/test_endpoints.py` | GET /api/health → 200. GET /api/pods without auth → 401. |
```

**TypeScript (Vitest):**
```markdown
## Unit Tests (Vitest)

**Dev dependencies**: vitest, @testing-library/react, @testing-library/jest-dom, jsdom

| File | What it tests |
|------|---------------|
| `src/__tests__/Component.test.tsx` | Renders with mock data. Click fires handler. Empty state. |
| `src/__tests__/store.test.ts` | addItem() adds. removeItem(id) removes. Initial state empty. |
```

### What Makes Good Unit Tests in FORGE.md

1. **Pure functions first** — Parsers, validators, status resolvers. Concrete input→output pairs.
2. **Input validation** — Pydantic constraints (replicas ≥ 0 → 422), business logic (confirm=true missing → 400).
3. **Degradation** — Endpoints without K8s: `require_k8s` dependency → 503.
4. **Auth enforcement** — Every endpoint without auth → 401.
5. **Component rendering** — Frontend: renders with mock data, shows elements, interactions fire handlers.

### What Does NOT Belong in FORGE.md

- No real K8s tests (needs cluster → BUSTER.md)
- No kubectl cross-verification (cluster → BUSTER.md)
- No live WebSocket tests with data flow (cluster → BUSTER.md)
- No Playwright E2E tests (BUSTER.md — subagent writes them)

---

## BUSTER.md

### Structure

```markdown
# Module XX — BUSTER Test Instructions

## Test Scope
What is tested (1 sentence).

## Test Requirements
Concrete tests grouped by substep/feature.

## Setup / Fixtures
How the test environment is prepared.

## Conventions
File names, cleanup rules, dev dependencies.
```

### FORGE.md vs BUSTER.md

| Aspect | FORGE.md (Unit Tests) | BUSTER.md (Subagent Tests) |
|---|---|---|
| Runs in | Leased Kubernetes namespace | Gateway pod |
| Executed by | `unit.ts` suite | LLM subagent (Claude) |
| K8s access | No | Yes (ServiceAccount) |
| Test type | Deterministic, reproducible | Intelligent, exploratory |
| Examples | parse_cpu("500m")→500 | Pod count matches kubectl |
| | GET /pods → 503 (degradation) | GET /pods → 200 with real data |
| | replicas: -1 → 422 | Scale to 3, verify via kubectl |

---

## test-spec.json

### When Needed

Only when `api` is in `test_suites`; `spec_file` is required and missing API specs fail typed Buster validation.

### Format

```json
{
  "base_url": "http://localhost:<port>",
  "defaults": {
    "headers": { "Content-Type": "application/json" },
    "timeout_ms": 5000
  },
  "tests": [...]
}
```

### HTTP Test

```json
{
  "name": "GET /api/v1/health returns 200",
  "method": "GET",
  "path": "/api/v1/health",
  "expect": { "status": 200 }
}
```

With auth and body validation:
```json
{
  "name": "GET /api/v1/pods returns array",
  "method": "GET",
  "path": "/api/v1/pods",
  "headers": { "Authorization": "Bearer test-key-123" },
  "expect": { "status": 200, "body_type": "array" }
}
```

Error case:
```json
{
  "name": "POST invalid body returns 422",
  "method": "POST",
  "path": "/api/v1/deployments/default/nginx/scale",
  "headers": { "Authorization": "Bearer test-key-123" },
  "body": { "replicas": -1 },
  "expect": { "status": 422 }
}
```

### WebSocket Test

```json
{
  "name": "WS without token rejected",
  "protocol": "ws",
  "path": "/ws/logs/default/test",
  "expect": { "ws_connected": false }
}
```

With auth:
```json
{
  "name": "WS with token connects",
  "protocol": "ws",
  "path": "/ws/logs/default/test?token=test-key-123",
  "expect": { "ws_connected": true, "ws_min_messages": 1 }
}
```

### Leased-Namespace Testing Strategy

The application runs in a controller-issued test namespace. Tests should exercise the real service while keeping cluster assumptions explicit:

| Category | Example | Expected |
|---|---|---|
| Degradation | GET /api/v1/pods when its dependency is intentionally unavailable | 503 |
| Auth enforcement | GET /api/v1/pods without auth | 401 |
| Input validation | PATCH scale replicas=-1 | 422 |
| Business logic | DELETE pod without ?confirm=true | 400 |
| SQLite endpoints | GET /api/v1/repos | 200 |
| WS auth | WS /ws/logs without token | ws_connected: false |
| Regression | Endpoint from previous module | 503 or 200 (not broken) |

### API Key

Declare test credentials as namespace-scoped Secret references. Never embed test keys in commands, source, or generated manifests.

### Regression Tests

Every module should have at least 1 test hitting an endpoint from the previous module. Catches breakage from main.py changes (router registration, WS routes).

---


## Baselines for visual-reg

Only needed when `visual-reg` is in `test_suites`. Typical for frontend modules with real pages (not scaffolds).

Visual-reg baseline path authority is module identity: Buster derives the baseline directory as `.swarm/modules/<module-dir>/baselines/`. Do not configure a baseline path in `progress.json`.

### Multi-Path Baselines (required)

For modules with multiple pages. The **approved Prism Baseline Bundle is the design source of truth**. Archviewer can show architecture documents as HTML. Buster visual-reg requires explicit generated baseline artifacts checked into `.swarm/modules/<module-dir>/baselines/` before the suite runs.

**Setup:**

1. Read the approved Prism Baseline Bundle and its assigned views.
2. The preview must follow the [Prism conventions](prism-conventions.md):
   - `<script type="application/json" data-routes>` manifest listing every page
   - `?baselines=true` query param bypasses auth/login
3. Place it at `.swarm/modules/<module-dir>/baselines/preview.html`.
4. Generate reviewed baseline artifacts explicitly:

```bash
node /app/skills/pipeline/tools/screenshot.ts --generate-baselines \
  .swarm/modules/15-dashboard-core-pages/baselines/preview.html \
  .swarm/modules/15-dashboard-core-pages/baselines/
```

5. Review and commit the generated `paths.json` plus per-route `*-baseline.png` files before requesting `visual-reg`.

**Required baseline layout:**

```
.swarm/modules/15-dashboard-core-pages/baselines/
├── preview.html              ← Prism-generated source of truth
├── paths.json                ← Explicit reviewed route metadata
├── setup-baseline.png        ← Explicit reviewed baseline from preview
├── dashboard-baseline.png
├── pods-baseline.png
├── deployments-baseline.png
└── ...
```

**Regeneration:** when `preview.html` changes, rerun `screenshot.ts --generate-baselines`, review the new artifacts, and commit them. `visual-reg` does **not** auto-regenerate baselines and fails closed if explicit metadata is missing.

### Baseline requirements

The `visual-reg` suite now requires explicit multi-path metadata:

| Found in module baseline directory | Behavior |
|---|---|
| `paths.json` plus matching `{name}-baseline.png` files | Compare each declared route against its reviewed baseline |
| Missing/invalid `paths.json` | Typed contract failure |
| Missing per-route baseline PNG | Typed contract failure |

Single-path compatibility and implicit HTML-to-baseline generation are removed.

### Config in progress.json

Configure thresholds/Discord/pixelmatch behavior only:

```json
"visual-reg": {
  "thresholds": { "max_diff_percent": 1.0 },
  "discord": "summary"
}
```

| Field | Default | Description |
|---|---|---|
| `thresholds` | `null` | `null` = informational (always PASS). Set for enforced mode |
| `discord` | auto | `"summary"` (1 embed, >3 paths) or `"all"` (per-page messages, ≤3 paths) |
| `pixelmatch.threshold` | `0.1` | Per-pixel color-distance threshold |

### Auth in the Running App

For multi-path, the running app must be accessible without manual login. Two mechanisms:

| Context | How |
|---|---|
| **Preview HTML** (baseline generation) | `?baselines=true` query param skips setup page |
| **Running app** (visual-reg suite) | Explicit credentials copied into the leased namespace and declared in the test contract |

Test authentication must be declared through test credential Secrets and consumed by the leased-namespace deployment. Applications must not contain environment-specific auto-auth bypasses.
