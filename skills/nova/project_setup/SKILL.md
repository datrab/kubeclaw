---
name: project-setup
description: Set up a new KubeClaw project for the autonomous pipeline. Use when creating a new project from scratch, configuring progress.json, writing FORGE.md/BUSTER.md/test-spec.json per module, or preparing the architecture branch for pipeline execution. Triggers on "set up a project", "create modules", "configure the pipeline", "write FORGE.md", "write BUSTER.md", "prepare architecture branch", "new project for pipeline".
---

# Project Setup

Set up a KubeClaw project so `pipeline.js --resume` runs end-to-end.

## Architecture Branch Workflow

All module files live in the **architecture branch** (`<project>/architecture`). The pipeline releases them automatically per module via `releaseBlueprint()`.

```bash
# 1. Create/switch to architecture branch
git checkout -b <project>/architecture

# 2. Create .swarm/ structure (progress.json, FORGE.md, BUSTER.md, etc.)
#    All paths under: Projects/<project>/src/.swarm/

# 3. Commit and push
git add Projects/<project>/src/.swarm/
git commit -m "[architecture] Project setup: <project>"
git push origin <project>/architecture

# 4. Switch back, start pipeline
git checkout main
node /app/skills/pipeline.js --project <project> --resume
```

The pipeline does `git checkout origin/<project>/architecture -- <module-path>` before each module. Update the architecture branch anytime — next blueprint release picks up changes.

## File Structure

All paths relative to repo root:

```
Projects/<project>/src/.swarm/
├── progress.json                              # Project definition
├── echo-review/
│   ├── MIDPOINT-REVIEW-INSTRUCTIONS.md        # If gate:midpoint-review in execution_order
│   └── FINAL-REVIEW-INSTRUCTIONS.md           # If gate:final-review in execution_order
├── buster-test/
│   ├── FINAL-BUSTER.md                        # If gate:final-buster in execution_order
│   └── final-test-spec.json                   # If api in gate test_suites
└── modules/<module-dir>/
    ├── FORGE.md                               # Build instructions (or substep FORGEs)
    ├── BUSTER.md                              # Test instructions
    ├── test-spec.json                         # If api in test_suites
    ├── baselines/baseline.png                 # If visual-reg in test_suites
    └── <substep-id>/FORGE.md                  # For modules with substeps
```

`swarm.config.json` and `.semgrep.yml` are deployed via Helm — not repo files.

## Critical: `serve.project_dir`

The sandbox starts at the repo root. Without `project_dir`, `cd backend` and all relative paths break.

Set in **every** module's `test_config.serve`:
```json
"serve": { "project_dir": "Projects/<project>/src", ... }
```

All relative paths in `spec_file`, `tests_dir`, `baseline_dir` resolve from `project_dir`.
Paths in `dockerfile` and `build_context` resolve from repo root (NOT from `project_dir`).

## Critical: Backend Dockerfile Pattern

Backend modules should use `dockerfile` + `build_context` to bake dependencies into the image. This avoids `pip install` on every task run and eliminates network dependency during builds (`--pull=never`).

```json
"serve": {
  "type": "server",
  "dockerfile": "backend/Dockerfile",
  "build_context": "backend/",
  "image": "<project>-backend:m<id>",
  "start_cmd": "ENV_VARS python -m uvicorn main:app --host 0.0.0.0 --port 8000",
  ...
}
```

The Dockerfile **must** use fully-qualified base image names:
```dockerfile
FROM docker.io/library/python:3.12-slim
```

## Substeps

Modules with substeps get **one** Forge spawn. `readForgeInstructions()` concatenates all substep FORGE.md files with `---` separators. BUSTER.md stays at module level (one per module).

```
modules/<module-dir>/
├── BUSTER.md              # Module level
├── test-spec.json         # Module level
├── 03a/FORGE.md           # Per substep
├── 03b/FORGE.md
└── 03c/FORGE.md
```

## Suite Selection

| Suite | Backend | Frontend (Scaffold) | Frontend (Pages) |
|---|---|---|---|
| `build`, `health` | ✅ | ✅ | ✅ |
| `api` | ✅ if endpoints | ❌ | ❌ |
| `security` | ✅ if sets headers | ❌ | ❌ |
| `unit` | ✅ pytest | ✅ vitest | ✅ vitest |
| `a11y`, `perf`, `bundle` | ❌ | ✅ | ✅ |
| `visual-reg`, `e2e` | ❌ | ❌ | ✅ real pages |

## Sandbox Rules

The sandbox is **empty** — no `node_modules/`, no `venv`.

**With `dockerfile`** (backend pattern): Dependencies are baked into the image at `podman build` time. `start_cmd` only starts the server — no `pip install` needed. The Dockerfile must use fully-qualified base images (`FROM docker.io/library/python:3.12-slim`).

**Without `dockerfile`** (frontend pattern / legacy): Every `start_cmd`, `build_cmd`, and `test_cmd` must install dependencies first.

The sandbox has **no K8s cluster**. K8s-dependent endpoints return 503. Test degradation (503), auth enforcement (401), input validation (422), SQLite endpoints (200).

## Checklist

### Create

- [ ] Architecture branch: `git checkout -b <project>/architecture`
- [ ] `progress.json` with `project`, `models`, `execution_order`, `modules`, `gates`
- [ ] Every module: `serve.project_dir` set (`Projects/<project>/src`)
- [ ] Backend modules: `serve.type: "server"` + `dockerfile` + `build_context` + `image` (project-specific tag) + `start_cmd` (no pip install) + `port` + `health_path`
- [ ] Backend modules: `health_retries: 10` + `health_timeout: 15000` + `health_base_delay: 5000`
- [ ] Backend Dockerfile: `FROM docker.io/library/python:3.12-slim` (fully-qualified!)
- [ ] Frontend modules: `serve.type: "static"` + `build_cmd` (incl. `npm install`) + `image: "node:20-slim"`
- [ ] Every module: FORGE.md with unit test section
- [ ] Every module: BUSTER.md
- [ ] API modules: test-spec.json + `api.spec_file` in test_config
- [ ] Gate files: instructions + output paths
- [ ] `final-buster` gate with `dockerfile`/`build_context` + enforced `thresholds` on all suites

### Verify

- [ ] Backend `start_cmd` does NOT contain `pip install` (deps in Dockerfile)
- [ ] Frontend `build_cmd` DOES contain `npm install` (no Dockerfile)
- [ ] API key in test-spec.json matches key in `start_cmd` env vars
- [ ] At least 1 regression test per module in test-spec.json
- [ ] Commit + push architecture branch

### Start

```bash
node /app/skills/pipeline.js --project <name> --dry-run   # Preview
node /app/skills/pipeline.js --project <name> --resume     # Run
```

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| Build FAIL immediately | `serve.type: "static"` on backend | Set `serve.type: "server"` |
| `cd backend: No such file` | `project_dir` missing | Set `serve.project_dir` |
| Health FAIL 404 | Wrong `health_path` | Set correct endpoint |
| Health FAIL timeout | Backend needs 60-120s to start | Set `health_retries: 10`, `health_base_delay: 5000` |
| `image not known` in podman build | Unqualified `FROM` in Dockerfile | Use `FROM docker.io/library/python:3.12-slim` |
| api SKIP | No `spec_file` | Create test-spec.json |
| unit SKIP | No tests in code | Add unit test section to FORGE.md |
| unit FAIL `npm test` on Python | Default test_cmd wrong | Set `test_cmd` to pytest |
| unit FAIL MODULE_NOT_FOUND | Dependencies missing | With Dockerfile: check Dockerfile. Without: prefix `test_cmd` with install |
| visual-reg SKIP | No baseline.png or .html | Add HTML design reference to baselines/ (auto-generates PNG) |
| Blueprint release failed | Missing FORGE.md/BUSTER.md | Check architecture branch |

## References

For detailed field specifications and writing guides:

- **progress.json fields, module/gate config, serve types**: Read [references/progress-json.md](references/progress-json.md)
- **Writing FORGE.md, BUSTER.md, test-spec.json, baselines**: Read [references/module-files.md](references/module-files.md)
