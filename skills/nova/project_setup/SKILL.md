---
name: project-setup
description: Set up a new KubeClaw project for the autonomous pipeline. Use when creating a new project from scratch, configuring progress.json, writing FORGE.md/BUSTER.md/test-spec.json per module, or preparing the architecture branch for pipeline execution. Triggers on "set up a project", "create modules", "configure the pipeline", "write FORGE.md", "write BUSTER.md", "prepare architecture branch", "new project for pipeline".
---

# Project Setup

Set up a project so `pipeline.js --resume` runs end-to-end.

## Steps

### 1. Create Architecture Branch

All module files live on the **architecture branch** (`<project>/architecture`). The pipeline releases them per module via `releaseBlueprint()`.

```bash
git checkout -b <project>/architecture
```

### 2. Create File Structure

```
Projects/<project>/src/.swarm/
├── progress.json
├── echo-review/
│   └── <GATE>-INSTRUCTIONS.md
├── buster-test/
│   └── <GATE>.md
└── modules/<module-dir>/
    ├── FORGE.md
    ├── BUSTER.md                    # If module has buster stage
    ├── test-spec.json               # If api in test_suites
    └── <substep-id>/FORGE.md        # For modules with substeps
```

### 3. Write progress.json

For the complete field reference, read [progress-json.md](progress-json.md).

Minimal template:

```json
{
  "project": "my-project",
  "version": 1,
  "models": {
    "forge": "anthropic/claude-sonnet-4-6",
    "buster": "anthropic/claude-sonnet-4-6",
    "echo": "anthropic/claude-opus-4-6"
  },
  "execution_order": ["01-scaffold", "02-api", "gate:review", "gate:buster"],
  "modules": {
    "01-scaffold": {
      "title": "Project Scaffold",
      "dir": "01-scaffold",
      "depends_on": [],
      "stages": ["forge"],
      "thinking_level": "adaptive"
    },
    "02-api": {
      "title": "REST API",
      "dir": "02-api",
      "depends_on": ["01-scaffold"],
      "stages": ["forge", "buster"],
      "thinking_level": "adaptive",
      "test_suites": ["build", "health", "unit"],
      "test_config": { "serve": { "type": "server", "project_dir": "Projects/my-project/src", ... } }
    }
  },
  "gates": {
    "review": { "type": "review", ... },
    "buster": { "type": "buster", ... }
  }
}
```

#### Key Module Fields

| Field | Required | Description |
|---|---|---|
| `title` | yes | Human-readable name |
| `dir` | yes | Directory under `.swarm/modules/` |
| `depends_on` | yes | Module IDs that must PASS first |
| `stages` | no | `["forge"]` forge-only, `["forge", "buster"]` full cycle |
| `thinking_level` | no | `"adaptive"`, `"high"`, `"medium"`, `"low"`, `"none"`, `"xhigh"` |
| `forge_model` | no | Override default forge model |
| `timeout_minutes` | no | Default 300 |
| `max_fails` | no | Default 3 |
| `session.runtime` | no | `"acp"` or `"subagent"` — per-task runtime selection |

#### Key Gate Fields

**Review gates** need `forge_model` and `forge_thinking_level` to control fix-cycle agents:
```json
{
  "type": "review",
  "forge_model": "anthropic/claude-sonnet-4-6",
  "forge_thinking_level": "adaptive",
  "reviewers": [{ "label": "echo-opus", "model": "anthropic/claude-opus-4-6", "dispatch": "acp", "agent_id": "claude" }],
  "max_fix_cycles": 3
}
```

**Buster gates** need `test_config` with serve settings and enforced `thresholds`.

#### Post-Pipeline Agents

```json
{
  "arch_validation": { "enabled": false },
  "pipeline_review": { "enabled": true, "model": "anthropic/claude-opus-4-6", "thinking_level": "high" },
  "case_study": { "enabled": true, "model": "anthropic/claude-sonnet-4-6", "thinking_level": "adaptive" }
}
```

### 4. Write Module Files

For each module write `FORGE.md`. For buster-stage modules also write `BUSTER.md`. For `api` suite write `test-spec.json`.

See [module-files.md](module-files.md) for full format spec.

**Substeps** — One Forge spawn per module. Pipeline concatenates substep FORGE.md files:

```
modules/<dir>/
├── BUSTER.md
├── 03a/FORGE.md
├── 03b/FORGE.md
└── 03c/FORGE.md
```

### 5. Verify

```bash
node /app/skills/pipeline.js --project <name> --dry-run
```

### 6. Run

```bash
git add Projects/<project>/src/.swarm/
git commit -m "[architecture] Project setup: <project>"
git push origin <project>/architecture
git checkout main
node /app/skills/pipeline.js --project <project> --resume
```

## Suite Selection

| Suite | Backend | Frontend |
|---|---|---|
| `build`, `health` | ✅ | ✅ |
| `api` | ✅ (needs test-spec.json) | ❌ |
| `security` | ✅ | ❌ |
| `unit` | ✅ (pytest) | ✅ (vitest) |
| `a11y`, `perf`, `bundle` | ❌ | ✅ |
| `visual-reg`, `e2e` | ❌ | ✅ (needs baselines) |
| `k8s` | ✅ (deployment modules) | ❌ |

Without `thresholds` → informational. With `thresholds` → enforced (can FAIL).

### k8s Suite — required test_config fields

Use for any module that produces a Dockerfile + K8s manifests.

```json
"test_suites": ["k8s"],
"test_config": {
  "k8s": {
    "dockerfile":    "Projects/<name>/src/Dockerfile",
    "image_name":    "<app>",
    "service_name":  "<k8s-service-name>",
    "manifests":     ["Projects/<name>/src/k8s/<app>-all.yaml"],
    "port":          3001,
    "health_path":   "/health"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `dockerfile` | yes | Path relative to repo root |
| `image_name` | yes | Image name without registry/tag (used for image override) |
| `service_name` | yes | K8s Service name in the manifests |
| `manifests` | yes | Array of manifest paths relative to repo root |
| `port` | no | Service port (default: 3000) |
| `health_path` | no | Health check path (default: /health) |
| `build_context` | no | Podman build context dir (default: dockerfile directory) |
| `secrets_to_copy` | no | Secret names to copy from `kubeclaw` ns into the test ns |
| `ready_timeout_seconds` | no | Pod readiness wait (default: 120) |
| `namespace_prefix` | no | Test namespace prefix — `buster` or `test` (default: buster) |

**Notes:**
- Manifests may hardcode `namespace:` — the suite strips it so `-n testNs` takes effect
- `image_name` match is substring: any `image:` line containing it gets overridden with the test registry tag
- The test namespace is cleaned up by the orchestrator after the session ends
- Suite is `critical: true` — failure blocks the LLM subagent spawn

## Checklist

### Create
- [ ] Architecture branch created and pushed
- [ ] `progress.json` with project, models, execution_order, modules, gates
- [ ] Every module: `serve.project_dir` set
- [ ] Backend: `dockerfile` + `build_context` (full repo-root paths)
- [ ] Frontend: `build_cmd` includes `npm install`
- [ ] Every module: FORGE.md written
- [ ] Modules with buster stage: BUSTER.md written
- [ ] API modules: test-spec.json
- [ ] Gates: instructions + output paths
- [ ] Review gates: `forge_model` set (avoids fallback to gateway default)

### Verify
- [ ] `--dry-run` passes
- [ ] Backend `start_cmd` has NO `pip install`
- [ ] Frontend `build_cmd` HAS `npm install`

## Common Errors

| Symptom | Fix |
|---|---|
| `cd backend: No such file` | Set `serve.project_dir` |
| Health FAIL timeout | Set `health_retries: 10`, `health_base_delay: 5000` |
| `image not known` | Use fully-qualified `FROM` in Dockerfile |
| Fix cycle uses wrong model | Set `forge_model` on review gates |
| Arch validator 404 | Set `arch_validation.model` or `arch_validation.enabled: false` |

## References

- **progress.json complete reference**: [progress-json.md](progress-json.md)
- **Writing FORGE.md, BUSTER.md, test-spec.json**: [module-files.md](module-files.md)
