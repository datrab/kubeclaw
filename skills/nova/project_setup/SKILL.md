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
│   ├── final-test-spec.json                   # If api in gate test_suites
│   └── baselines/                             # If visual-reg in gate test_suites
│       └── preview.html                       # Prism preview → auto-generates paths.json + PNGs
└── modules/<module-dir>/
    ├── FORGE.md                               # Build instructions (or substep FORGEs)
    ├── BUSTER.md                              # Test instructions
    ├── test-spec.json                         # If api in test_suites
    ├── baselines/                             # If visual-reg in test_suites
    │   └── preview.html                       # Prism preview (or baseline.png for single-page)
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
Paths in `dockerfile` and `build_context` resolve from **repo root** (NOT from `project_dir`). Use full paths like `Projects/<project>/src/backend/Dockerfile`.

## Critical: Backend Dockerfile Pattern

Backend modules should use `dockerfile` + `build_context` to bake dependencies into the image. This avoids `pip install` on every task run and eliminates network dependency during builds (`--pull=never`).

**Both paths are relative to the repo root, NOT to `project_dir`:**
```json
"serve": {
  "type": "server",
  "dockerfile": "Projects/<project>/src/backend/Dockerfile",
  "build_context": "Projects/<project>/src/backend/",
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

## Critical: Reviewer Dispatch

Reviewer execution is now selected by model family unless explicitly overridden in `progress.json`:

- **Anthropic / Claude reviewer models** → reviewer uses **ACP spawn**
- **OpenAI / Codex / GPT-5 reviewer models** → reviewer uses **native one-shot subagent spawn**

This means Codex reviews should be configured in `progress.json` as native reviewers, while Opus/Sonnet reviews can continue to use ACP.

If you need an explicit override, use reviewer `dispatch` in `progress.json`:

- `"dispatch": "acp"`
- `"dispatch": "subagent"`

Native reviewer fallback also requires the running agent policy to allow subagent spawning for the requested reviewer agent id.

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
- [ ] Optional: `pipeline_review` configured if you want an end-of-run audit agent writing to `.swarm/logs/pipeline-review/`
- [ ] Every module: `serve.project_dir` set (`Projects/<project>/src`)
- [ ] Backend modules: `serve.type: "server"` + `dockerfile` + `build_context` (full path from repo root!) + `image` (project-specific tag) + `start_cmd` (no pip install) + `port` + `health_path`
- [ ] Backend modules: `health_retries: 10` + `health_timeout: 15000` + `health_base_delay: 5000`
- [ ] Backend Dockerfile: `FROM docker.io/library/python:3.12-slim` (fully-qualified!)
- [ ] Frontend modules: `serve.type: "static"` + `build_cmd` (incl. `npm install`) + `image: "node:20-slim"`
- [ ] Every module: FORGE.md with unit test section
- [ ] Every module: BUSTER.md
- [ ] API modules: test-spec.json + `api.spec_file` in test_config
- [ ] Gate files: instructions + output paths
- [ ] `final-buster` gate with `dockerfile`/`build_context` + enforced `thresholds` on all suites
- [ ] Visual-reg modules: Prism preview.html in baselines/ with `data-routes` manifest + `?baselines=true` support

### Verify

- [ ] Backend `start_cmd` does NOT contain `pip install` (deps in Dockerfile)
- [ ] Frontend `build_cmd` DOES contain `npm install` (no Dockerfile)
- [ ] API key in test-spec.json matches key in `start_cmd` env vars
- [ ] At least 1 regression test per module in test-spec.json
- [ ] Prism previews: `data-routes` nav labels match visible sidebar/nav text exactly
- [ ] Commit + push architecture branch

### Start

```bash
node /app/skills/pipeline.js --project <name> --dry-run   # Preview
node /app/skills/pipeline.js --project <name> --resume     # Run
```

## Optional: Pipeline Review

Add `pipeline_review` to `progress.json` to run an end-of-pipeline audit agent after summary generation.

Behavior is model-family based:

- OpenAI / Codex / GPT-5 family → native one-shot subagent
- Anthropic / Claude family → ACP

Outputs default to:

- `.swarm/logs/pipeline-review/PIPELINE-REVIEW.md`
- `.swarm/logs/pipeline-review/PIPELINE-REVIEW.json`

The review agent should inspect pipeline logs tactically and recommend improvements to prompts, testing, review strategy, and pipeline design.

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
| visual-reg SKIP | No baseline.png or .html | Add Prism preview.html to baselines/ (auto-generates paths.json + PNGs) |
| visual-reg 0 pages compared | paths.json exists but no PNGs | Run `node screenshot.cjs --generate-baselines preview.html baselines/` |
| visual-reg nav click fails | `data-routes` nav label mismatch | Ensure `nav` field matches visible text exactly (case-sensitive) |
| visual-reg screenshots login only | Missing `?baselines=true` support | Add auth bypass to preview (see prism-conventions.md) |
| Blueprint release failed | Missing FORGE.md/BUSTER.md | Check architecture branch |

## Wave 2 Governance Conventions

Projects running with Wave 2 governance get additional pipeline behavior. Configure it in `progress.json` and `swarm.config.json`.

### Architecture Validator

Runs automatically before module 01. No extra configuration required for deterministic checks. To configure the model for Phase 2 (agent judgment):

```json
{
  "defaults": {
    "models": {
      "arch_validator": "anthropic/claude-sonnet-4-6"
    }
  }
}
```

Artifacts are written to `.swarm/logs/architecture-validator/`. Blocking findings halt the pipeline before any module runs.

### Approval Gates

Add `type: "approval"` gates to `progress.json`:

```json
{
  "gates": {
    "gate-qa": {
      "type": "approval",
      "title": "QA Approval",
      "timeout_minutes": 60,
      "on_timeout": "block"
    }
  },
  "execution_order": ["01-module", "gate:gate-qa", "02-module"]
}
```

V1 operator flow: pipeline posts Discord embed → operator responds via Nova-bridge → Nova writes `.swarm/<gate-id>-gate-status.json` → pipeline resumes.

**Do not configure native Discord buttons or slash commands** — V1 does not support inbound Discord interaction.

### Observability Configuration

Budget thresholds in `swarm.config.json`:

```json
{
  "observability": {
    "budget": {
      "warn_cost_usd": 1.00,
      "hard_limit_cost_usd": 5.00,
      "warn_tokens": 500000
    }
  }
}
```

Budget thresholds emit events and log warnings but are non-blocking unless calling code explicitly checks `isBudgetExceeded()`.

### Key `.swarm/` Paths for Governed Projects

| Path | Contents |
|---|---|
| `.swarm/progress.json` | Project definition |
| `.swarm/<gate-id>-gate-status.json` | Approval gate state (authoritative) |
| `.swarm/logs/pipeline/pipeline.jsonl` | Lifecycle event stream |
| `.swarm/logs/pipeline/model-policy.jsonl` | Model resolution log |
| `.swarm/logs/pipeline/summary.json` | End-of-run summary |
| `.swarm/logs/architecture-validator/` | Validator findings and report |
| `.swarm/logs/cost/cost-report.json` | Aggregated cost/token report |
| `.swarm/logs/gates/<id>/` | Approval gate audit artifacts |

### Governance Docs

- Observability layout: `Projects/governance/src/docs/observability-reference.md`
- Approval gate operator guide: `Projects/governance/src/docs/approval-gate.md`
- Architecture validator: `Projects/governance/src/docs/architecture-validator-reference.md`
- Operator debugging: `Projects/governance/src/docs/governance-integration-guide.md`

## References

For detailed field specifications and writing guides:

- **progress.json fields, module/gate config, serve types**: Read [references/progress-json.md](references/progress-json.md)
- **Writing FORGE.md, BUSTER.md, test-spec.json, baselines**: Read [references/module-files.md](references/module-files.md)
- **Prism preview conventions for visual-reg baselines**: Read [references/prism-conventions.md](references/prism-conventions.md)
