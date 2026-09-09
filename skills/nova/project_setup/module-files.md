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

### Machine-readable delivery declaration

For `nova-project.v2` mandatory source preflight and graphs using
`kubeclaw.validate.preflight-contract`, each consumed blueprint
must include one explicit declaration in addition to explanatory prose:

```kubeclaw-deliverables
{"schemaVersion":"forge-deliverables.v1","moduleId":"web","substep":null,"deliverables":["docker/Dockerfile","api/openapi.yaml"]}
```

Author the actual full repository-relative output paths; do not infer them from
basenames or ownership. Replace `web` with the exact module identity and `null`
with the configured substep identity for a substep blueprint. Assign each path
to one substep. A prose mention (including negated or foreign-file examples) does
not declare delivery. Existing prose-only files need explicit migration.
See [the preflight contract](../plugins/preflight-contract/README.md) for the
closed schema and ownership rules. The scaffold does not auto-create these
assertions. Include the same blueprint in reviewed/synced control paths.

### Unit Test Section — REQUIRED

Without this section Forge writes no tests. The declared `kubeclaw.direct-command@1`
node then fails because the required test files do not exist.

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
| Executed by | Declared `kubeclaw.direct-command@1` node | LLM subagent (Claude) |
| K8s access | No | Yes (ServiceAccount) |
| Test type | Deterministic, reproducible | Intelligent, exploratory |
| Examples | parse_cpu("500m")→500 | Pod count matches kubectl |
| | GET /pods → 503 (degradation) | GET /pods → 200 with real data |
| | replicas: -1 → 422 | Scale to 3, verify via kubectl |

---

## test-spec.json

> **Current format:** The legacy format shown later in this section is retained only to explain rejected input. New and migrated projects must use `kubeclaw.api-flow.v1`. Project setup stops with `LEGACY_API_SPEC_VERSION_RETIRED` when it reads the historical format. See the [API user guide](../../../docs/architecture/pipeline-test-gate-api-user-guide.md) and [configuration reference](../../../docs/architecture/pipeline-test-gate-api-configuration-reference.md).

```json
{
  "schemaVersion": "kubeclaw.api-flow.v1",
  "setup": [{ "id": "login", "method": "POST", "path": "/api/auth/login", "extract": { "token": "token" } }],
  "steps": [{ "id": "health", "path": "/api/health", "expect": { "status": 200 } }],
  "cleanup": [{ "id": "logout", "method": "DELETE", "path": "/api/auth/session", "expect": { "status": 204 } }]
}
```

### Historical format: rejected after Suite 8 cutover

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


## Visual regression baselines

Do not put `visual-reg` in `test_suites` or `test_config`. Those fields are retired. Declare `kubeclaw.visual@1` in `.swarm/pipeline.json`.

The node requires a reviewed `kubeclaw.visual-baselines.v2` manifest, a shared `kubeclaw.browser-profiles.v1` profile file, and digest-bound PNG images. Select each route/profile pair by its manifest ID. The provider rejects missing files, path escape, digest mismatch, and capture identity mismatch.

Baseline generation is a separate trusted workflow. Test execution never updates baseline files. Review a candidate and its difference evidence, approve it through the durable human gate, then apply all PNG and manifest digest changes in one commit. See the [visual user guide](../../../docs/architecture/pipeline-test-gate-visual-user-guide.md).

Authentication belongs in the typed deployment contract. Do not add query-string bypasses or credentials to visual URLs.

## Project source admission

The canonical project runtime now requires `nova-project.v2` with explicit
`architecture` and per-module `blueprint` declarations. See
[the project contract and commands](../project/README.md). Commit all declared
control files on the stated architecture ref; the source preflight captures their
exact contents before the single Blueprint sync and first implementation. The
legacy progress/scaffold output is not a v2 project file and is not auto-imported.
