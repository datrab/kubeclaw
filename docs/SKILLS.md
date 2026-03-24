# KubeClaw Skills Reference

All skills are located at `/app/skills/` inside the container. They are JavaScript ES modules with CLI wrappers — usable both as `node /app/skills/<skill>.js` from the command line and as importable modules from other scripts.

---

## Skill Overview

| Skill | Agents | Purpose |
|-------|--------|---------|
| `memory.js` | All | Confidence-weighted vector memory (Qdrant) |
| `redis.js` | All (agent-specific versions) | Inter-agent communication via Redis Streams |
| `pipeline.js` | Nova | Deterministic module orchestration engine |
| `project-summary.js` | Nova | Project lifecycle report: code stats, pipeline metrics, quality |
| `project_setup/` | Nova | Skill: Set up a new project for the autonomous pipeline |
| `verify-task.js` | All (agent-specific for Buster) | Scope enforcement + controlled git push |
| `merge-reviews.js` | Nova | Consolidate Echo review files (legacy — single reviewer since v8) |
| `discord-purge.js` | All | Bulk-delete Discord channel messages |
| `visual-audit.js` | Buster | Headless screenshot/video → Discord |

---

## memory.js — Vector Memory (Qdrant)

Confidence-weighted vector memory with automatic feedback loops. Uses LiteLLM for embeddings and Qdrant for storage/search.

**Env vars:** `QDRANT_URL`, `LITELLM_URL`, `LITELLM_API_KEY`, `AGENT_NAME`, `CURRENT_PROJECT`, `CURRENT_MODULE`

### Commands

**remember** — Store a new memory
```bash
node /app/skills/memory.js remember \
  --text "WebSocket auth: close(4001) must be called before accept()" \
  --tags "websocket,auth,fix-pattern" \
  --scope project \
  --module 06 \
  --supersedes <old-memory-id>
```
- `--text` — Memory content (min 5 chars, be specific and actionable)
- `--tags` — Comma-separated tags for filtering
- `--scope` — `project` (default), `global` (cross-project), `agent` (private)
- `--module` — Associate with a module ID
- `--supersedes` — ID of older memory this replaces (decays the old one by -0.20)

**recall** — Search with confidence-weighted ranking
```bash
node /app/skills/memory.js recall \
  --query "websocket auth pattern" \
  --tags "auth" \
  --module 06 \
  --min-confidence 0.4 \
  --limit 5 \
  --verbose
```
Over-fetches 3× and re-ranks by `effective_score = similarity × (0.4 + 0.6 × confidence)`. Updates `last_accessed` and `access_count` on served results. Cross-agent recall gives a small confidence boost (+0.05).

**forget** — Delete a memory
```bash
node /app/skills/memory.js forget --id "<memory-id>"
```

**boost** — Increase confidence
```bash
node /app/skills/memory.js boost --id "<id>" --amount 0.2
```
Default: +0.10.

**dispute** — Decrease confidence
```bash
node /app/skills/memory.js dispute --id "<id>"
```
Applies -0.15.

**validate** — Confirm a memory is correct (semantic alias for boost)
```bash
node /app/skills/memory.js validate --id "<id>"
```

**feedback** — Bulk confidence update after module outcome
```bash
node /app/skills/memory.js feedback \
  --module 06 \
  --outcome pass \
  --reason "all tests passed"
```
- `--outcome` — `pass` (+0.15 to related), `fail` (-0.10), `blocked` (-0.20)
- Finds memories by module tag AND recently accessed (last 2h)
- Also stores the outcome itself as a new memory

**stats** — Collection overview
```bash
node /app/skills/memory.js stats
```
Returns total count, by-scope breakdown, by-agent breakdown, average confidence, most accessed memory.

### Confidence System

| Event | Delta | Notes |
|-------|-------|-------|
| Initial | 0.50 | Every new memory starts here |
| Module PASS | +0.15 | Bulk: all memories related to the module |
| Validate | +0.10 | Manual confirmation |
| Cross-agent recall | +0.05 | Recalled by a different agent than author |
| Module FAIL | -0.10 | Single decay (retries don't re-punish) |
| Dispute | -0.15 | Manual disagreement |
| Supersede | -0.20 | Replaced by a newer memory |
| Module BLOCKED | -0.20 | 3 fails, strong signal |

Display: ★★★ ≥0.75, ★★☆ 0.45–0.74, ★☆☆ <0.45.

---

## redis.js — Inter-Agent Communication

Agent-specific versions exist for Nova and Buster. Same filename, different functionality.

**Env vars:** `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `AGENT_NAME`, `DISCORD_WEBHOOK`

### Nova Version

**send** — Dispatch a task to another agent's stream
```bash
node /app/skills/redis.js --action send \
  --target forge \
  --type BUILD_MODULE \
  --payload '{"module":"06","modelInstruction":"forge-codex"}' \
  --iteration 1
```
- `--target` — `forge`, `echo`, `buster` (maps to `swarm:{agent}:tasks`)
- `--type` — Task type (BUILD_MODULE, FIX_MODULE, TEST_MODULE, REVIEW, etc.)
- `--payload` — JSON string
- `--iteration` — Retry counter (default: 1)

Automatically logs to Discord webhook with full payload.

**read** — Read from own event stream
```bash
node /app/skills/redis.js --action read
```

### Buster Version

Has all Nova actions plus:

**complete** — Pipeline completion chain (verify → push → signal)
```bash
node /app/skills/redis.js --action complete \
  --stream swarm:pipeline:completion \
  --module 06 \
  --project kubecommand \
  --status PASS \
  --summary "All 12 checks passed" \
  --task-type module_test \
  --role buster
```
This is Buster's last action in a task. It:
1. Calls `verify-task.js` (scope check, revert violations, git push)
2. Writes structured completion message to the pipeline's Redis stream
3. The Orchestrator detects this and kills the subagent session

---

## pipeline.js — Deterministic Orchestration Engine

The core pipeline that drives modules through forge → test → review cycles. Only runs on Nova.

**Env vars:** `SWARM_CONFIG` (path to swarm.config.json), `CURRENT_PROJECT`

### Commands

```bash
# Full pipeline (auto-advances through all modules)
node /app/skills/pipeline.js --project kubecommand

# Resume from current state
node /app/skills/pipeline.js --project kubecommand --resume

# Run single module
node /app/skills/pipeline.js --project kubecommand --module 06

# Print status as JSON
node /app/skills/pipeline.js --project kubecommand --status

# Preview plan without executing
node /app/skills/pipeline.js --project kubecommand --dry-run

# Release a blueprint from architecture branch
node /app/skills/pipeline.js --project kubecommand --blueprint 06

# List available blueprints
node /app/skills/pipeline.js --project kubecommand --blueprint-list
```

### Exit Codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | OK | Module PASS or pipeline complete |
| 1 | ERROR | Config/system error |
| 10 | NEEDS_NOVA | Agent failed, Nova must analyze and retry |
| 20 | BLOCKED | Max retries exceeded, human intervention |
| 30 | TIMEOUT | Agent didn't respond in time |
| 40 | RATE_LIMITED | API rate limits exhausted all pauses |

### Key Features

- **Blueprint Manager** — Releases module specs from an architecture branch into the working branch
- **ACP + Redis Dispatch** — Forge/Echo via ACP (subagents), Buster via Redis (separate pod)
- **Memory Integration** — Recalls context before Forge, feedback after outcome, Summary Agent after PASS
- **Chaos Testing** — Post-phase destructive testing with severity-based routing (critical → auto-fix loop, low → Discord notify)
- **Rate Limit Handling** — Detects RATE_LIMITED status, pauses with configurable cooldown, extends timeout deadline
- **Graceful Shutdown** — SIGTERM/SIGINT handler kills active agents, marks module FAIL, cleans temp files

### Required Files

- `swarm.config.json` — Platform config (timeouts, agent dispatch, models)
- `progress.json` — Project definition (modules, dependencies, execution order, gates)
- `status.json` — Per-module state (created by pipeline, updated by agents)

---

## project-summary.js — Project Lifecycle Report

Generates a comprehensive summary of a completed (or in-progress) KubeClaw project. Reads progress.json, all status.json files, and git history to produce code stats, pipeline metrics, and quality indicators.

**Env vars:** `CURRENT_PROJECT`, `SWARM_CONFIG`, `DISCORD_WEBHOOK`

### Commands

```bash
# Print Markdown report to stdout
node /app/skills/project-summary.js --project kubecommand

# Save report to file
node /app/skills/project-summary.js --project kubecommand --output /tmp/summary.md

# Post summary embed to Discord
node /app/skills/project-summary.js --project kubecommand --discord

# JSON output (raw data, no formatting)
node /app/skills/project-summary.js --project kubecommand --json
```

### What It Reports

| Section | Metrics |
|---------|---------|
| Overview | Modules completed/blocked/pending, total attempts, first-pass rate, avg attempts, wall clock time |
| Code | Total LOC, files (code vs .swarm), commits, authors, lines by language |
| Token Usage | Forge/Buster input/output tokens, total |
| Hardest Modules | Top 5 modules by retry count |
| Gates | Per-gate status (GO/NO-GO/PENDING) |
| Top Failure Patterns | Most common failure reasons across all modules |
| Module Detail | Full table: every module with status, fail count, duration |

### Module API

```javascript
const { generateSummary } = require('/app/skills/project-summary.js');
const result = await generateSummary({ project: 'kubecommand' });
// result.markdown — full Markdown report
// result.embeds   — Discord embed objects
// result.data     — raw { codeStats, pipelineStats }
```

---

## project_setup/ — Project Setup Skill

Nova skill for setting up a new KubeClaw project end-to-end. Located at `/app/skills/nova/project_setup/`.

### Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Entry point: architecture branch workflow, file structure, checklist, common errors |
| `references/progress-json.md` | Field reference for progress.json: modules, gates, serve config, suite config |
| `references/module-files.md` | Writing guide for FORGE.md, BUSTER.md, test-spec.json, baselines |
| `references/prism-conventions.md` | Prism preview contract: data-routes manifest, ?baselines=true auth bypass |

### What It Covers

- Architecture branch workflow (`<project>/architecture` → `releaseBlueprint()`)
- `progress.json` structure: modules, gates, execution_order, serve config
- Per-module files: FORGE.md (with unit test section), BUSTER.md, test-spec.json
- Suite selection per module type (backend, frontend scaffold, frontend pages)
- Sandbox constraints: no `node_modules`, no K8s cluster, dependency install required
- Python/FastAPI support: `image`, `start_cmd`, `test_cmd` for non-Node projects
- Critical `serve.project_dir` requirement for projects under `Projects/<project>/src`
- Visual-reg multi-path baselines: Prism preview → auto-generated paths.json + PNGs

### References

- `docs/PIPELINE-CONFIG-REFERENCE.md` — Pipeline config end-to-end
- `docs/BUSTER-CONFIG-REFERENCE.md` — Suite details and thresholds

---

## verify-task.js — Scope Enforcement + Git Push

Validates that an agent only modified files within its allowed scope, reverts violations, then commits and pushes.

**Env vars:** `AGENT_NAME` or `AGENT_ROLE`, `CURRENT_PROJECT`

### Common Version (Nova, Forge, Echo)

```bash
node /app/skills/verify-task.js --project kubecommand
```

### Buster Version (enhanced)

```bash
node /app/skills/verify-task.js \
  --project kubecommand \
  --role buster \
  --message "[BUSTER] Module 06: PASS" \
  --no-memory-check
```
- `--role` — Override agent role (default: from env)
- `--message` — Custom commit message
- `--no-memory-check` — Skip Qdrant memory verification

### Scope Rules

| Agent | Allowed | Blocked |
|-------|---------|---------|
| **Forge** | Project code + `.swarm/STATUS.md` + `.swarm/FORGE.md` | Everything else in `.swarm/` |
| **Buster** | Anything inside `.swarm/` | Any application code outside `.swarm/` |
| **Echo** | `.swarm/echo-reviews/` only | Everything else |
| **All** | Current project directory only | Cross-project files |

### Flow

1. `git status` → list changed files
2. Check each file against role-based scope rules
3. Revert violations (git checkout or delete)
4. Verify Qdrant memory entry exists (unless `--no-memory-check`)
5. Scoped `git add` → commit → push (with 3× retry)
6. Return commit hash

---

## merge-reviews.js — Review Consolidation

Reads all `review-*.json` files from the echo-reviews directory and generates a consensus report.

```bash
node /app/skills/merge-reviews.js --project kubecommand
```

### Consensus Rule

One NO-GO overrides all GOs. If any reviewer says NO-GO, the final verdict is NO-GO.

### Output

- `FINAL-REVIEW.md` — Markdown report with all findings, grouped by reviewer
- `.merge_status` — Plain text file containing just `GO` or `NO-GO`

---

## discord-purge.js — Channel Cleanup

Bulk-deletes messages from a Discord channel.

```bash
# Purge specific channel
node /app/skills/discord-purge.js <CHANNEL_ID>

# Uses DISCORD_CHANNEL env var
node /app/skills/discord-purge.js
```

**Env vars:** `DISCORD_TOKEN`, `DISCORD_CHANNEL`

Uses Discord's bulk-delete API for messages < 14 days old. Older messages cannot be bulk-deleted (Discord limitation). Handles rate limiting with automatic retry.

---

## visual-audit.js — Headless Visual Testing

Takes a screenshot or records a video of a URL and sends it to Discord.

```bash
# Screenshot (default)
node /app/skills/visual-audit.js "http://localhost:9999"

# Video recording
node /app/skills/visual-audit.js "http://localhost:9999" --mode video
```

**Env vars:** `DISCORD_TOKEN`, `DISCORD_CHANNEL`

**Requires:** Playwright + Chromium (included in Buster sandbox image, not in general image).

- Screenshot: full-page PNG, sent as image attachment
- Video: WebM recording of page load + scroll, sent as file attachment
- Max file size: 25 MB (Discord limit)

---

## Processor Sidecars

Not skills, but closely related. Each agent has a processor sidecar (`processor.cjs`) that runs as a separate container.

### Nova Processor

Consumes `swarm:nova:events` Redis stream. On message arrival:
1. Parses task type and payload
2. Recalls Qdrant context for the task
3. Injects enriched prompt into Nova's gateway (via cron job or Discord message)
4. ACKs and deletes the stream entry
5. Sends Discord notification (success or failure)

### Buster Processor (REPLACED)

The processor sidecar has been replaced by `buster-orchestrator.js`, which runs as a background process in the gateway container (dual-process start). The processor file is kept for rollback. See BUSTER-TEST-PLATFORM-PLAN.md §7.5.

---

## File Locations

```
/app/skills/
├── memory.js          # Qdrant vector memory (common)
├── redis.js           # Agent-specific (Nova or Buster version)
├── pipeline.js        # Pipeline engine (common, used by Nova)
├── verify-task.js     # Agent-specific (common or Buster version)
├── merge-reviews.js   # Review consolidation (legacy — single reviewer since v8)
├── discord-purge.js   # Channel cleanup (common)
├── visual-audit.js    # Headless visual testing (common)
└── nova/
    ├── project-summary.js # Project lifecycle report
    └── project_setup/ # Project setup skill (SKILL.md + references/)

/app/scripts/processor/
└── processor.cjs      # Agent-specific sidecar (Nova or Buster version)
```
