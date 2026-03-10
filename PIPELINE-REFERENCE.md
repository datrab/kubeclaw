# pipeline.js — Reference & Architecture (v2.0)

## What is pipeline.js?

pipeline.js is the deterministic orchestrator of the OpenClaw Swarm. Nova calls this script to autonomously execute the build pipeline for any project. It controls the entire lifecycle of a module: checking out blueprints, spawning Forge (builds the code), spawning echo (reviews the code), git handling, messaging Buster (tests the code), chaos testing after phase completion, and memory integration via Qdrant.

The core philosophy is **Kill-and-Respawn**: on failure, there is never an attempt to repair a running agent. Instead, the session is destroyed, Nova analyzes the error, writes a better prompt, and a fresh agent is started. Fresh agents with better prompts always outperform stale agents with polluted context windows.


## Expected Files & Directory Structure

### Config Files (where pipeline.js looks for them)

```
<script_dir>/                        # Directory where pipeline.js lives
  pipeline.js                        # The script itself
  pipeline.config.json               # ← Main configuration (must be next to pipeline.js)

<repo_root>/                         # Git repository root (from config or git rev-parse)
  <paths.progress_file>              # e.g. swarm/<project>/progress.json
  <paths.modules_dir>/               # e.g. swarm/<project>/modules/
    <module_dir>/                     # e.g. 06-websockets/
      FORGE.md                        # Instructions for Forge (builder)
      BUSTER.md                       # Instructions for Buster (tester)
      status.json                     # Runtime status of the module
      <substep>/FORGE.md              # Optional: substep instructions
```

### pipeline.config.json — Expected Fields

```jsonc
{
  "project": "<project>",           // Project name (overridable via --project)
  "repo_root": "/app/repo",           // Git repo root (optional, auto-detected)

  "paths": {
    "progress_file": "swarm/${project}/progress.json",
    "modules_dir": "swarm/${project}/modules"
  },

  "models": {
    "buster": "gemini-flash",          // Required
    "echo": "claude-sonnet-4-6"        // Optional (for Summary Agent)
  },

  "agents": {
    "forge": {
      "dispatch": "acp",               // "acp" or "redis" — required
      "acp_agent_id": "forge",         // Optional
      "cwd": "/app/repo"               // Optional (default: repo_root)
    },
    "buster": {
      "dispatch": "redis",             // Required
      "redis_js_path": "/app/skills/redis.js"  // Required for Redis agents
    }
  },

  // Optional with defaults:
  "poll_interval_seconds": 30,         // Default: 30
  "default_timeout_minutes": 60,       // Default: 60
  "default_max_fails": 3,             // Default: 3
  "auto_retry_threshold": 2,          // Default: 2 (auto-retries before Nova escalation)

  "discord_webhook_url": "https://discord.com/api/webhooks/...",
  "discord_alerts": {
    "info": true, "warn": true, "critical": true, "ok": true
  },

  "memory": {
    "enabled": true,
    "memory_js_path": "/app/skills/memory.js",
    "recall_limit": 5,
    "recall_before_forge": true,
    "feedback_after_outcome": true,
    "store_patterns_globally": true
  },

  "rate_limit": {
    "cooldown_hours": 2,
    "max_pauses_per_module": 5
  },

  "chaos_test": {
    "after_phases": ["phase_1", "phase_2"],
    "model": "claude-sonnet-4-6",
    "time_limit_minutes": 30,
    "max_fix_attempts": 2
  }
}
```

### progress.json — Project Manifest

```jsonc
{
  "execution_order": ["01", "02", "gate:review_1", "03", "04"],
  "modules": {
    "01": {
      "title": "Auth API",
      "dir": "01-auth",
      "depends_on": [],
      "forge_model": "codex-5.3",
      "forge_subagent": "forge",
      "substeps": null,                  // or ["01a", "01b"]
      "timeout_minutes": 90,
      "max_fails": 3
    }
  },
  "gates": {
    "review_1": {
      "title": "Architecture Review",
      "type": "forge",                   // Agent type that runs the gate
      "model": "claude-sonnet-4-6",
      "instructions_file": "gates/review_1.md",
      "output_file": "gates/review_1-result.json",
      "timeout_minutes": 30
    }
  },
  "phases": [
    {
      "id": "phase_1",
      "name": "Core Backend",
      "modules": ["01", "02", "03"]
    }
  ]
}
```

### status.json — Module Runtime Status (per module)

```jsonc
{
  "module_id": "06",
  "title": "WebSocket Streaming",
  "status": "PASS",                    // PENDING|IN_PROGRESS|READY_FOR_TESTING|TESTING|PASS|FAIL|BLOCKED|RATE_LIMITED
  "current_phase": null,               // "forge"|"buster"|null
  "fail_count": 1,
  "started_at": "2025-03-08T10:00:00Z",
  "updated_at": "2025-03-08T11:30:00Z",
  "completed_at": "2025-03-08T11:30:00Z",
  "substeps": [{ "id": "06a", "title": "06a", "forge_done": false }],
  "history": [
    { "timestamp": "...", "status": "PENDING", "agent": "pipeline", "note": "Initialized", "commit_hash": "abc1234" }
  ],
  "fail_summaries": [
    { "attempt": 1, "timestamp": "...", "summary": "TypeError in handler", "phase": "buster", "is_timeout": false }
  ],
  "forge_commit_hash": "abc1234def5678...",
  "cost": {
    "forge_tokens_in": 0, "forge_tokens_out": 0,
    "buster_tokens_in": 0, "buster_tokens_out": 0,
    "total_duration_seconds": 5400
  }
}
```


## Startup Sequence (CLI Entry Point)

```
node pipeline.js --project <project> [--module 06] [--resume] [--status] [--dry-run]
node pipeline.js --project <project> --resume --module 06 --prompt "Use X instead of Y"
node pipeline.js --project <project> --resume --module 06 --prompt-file /tmp/nova-fix.md
```

1. **`initTempDir()`** — Creates an isolated temp directory (`/tmp/swarm-pipeline-XXXXXX`) for all temporary files of this run
2. **`registerShutdownHooks()`** — Registers SIGTERM/SIGINT handlers for graceful shutdown
3. **`loadConfig(projectName)`** — Reads `pipeline.config.json` next to the script, resolves `${project}` templates
4. **`validateConfig(config)`** — Checks all required fields, sets defaults, validates script paths against allowlist
5. **`loadProgress(config)`** — Reads `progress.json` from the repo
6. Dispatch based on CLI flags:
   - `--blueprint-list` → `listBlueprints()` → exit
   - `--blueprint 06` → `releaseBlueprint()` → exit
   - `--status` → `printStatus()` → exit
   - `--dry-run` → `dryRun()` → exit
   - Default → `runPipeline()` (full or single-module)
7. **`cleanupTempDir()`** + `process.exit(exitCode)`


## Pipeline Main Loop

`runPipeline()` iterates over `progress.execution_order`:

```
┌─────────────────────────────────────────────────────┐
│  findNextStep()                                     │
│    Iterates execution_order linearly                │
│    Skips PASS modules and completed gates           │
│    Stops at BLOCKED                                 │
│    Returns: { type: 'module'|'gate'|'blocked'|      │
│                     'done', id }                    │
└──────────────────────┬──────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │  type === 'done'?   │──yes──→ EXIT_OK (Pipeline complete)
            └──────────┬──────────┘
                       │no
            ┌──────────▼──────────┐
            │  type === 'blocked'?│──yes──→ EXIT_BLOCKED (Human needed)
            └──────────┬──────────┘
                       │no
            ┌──────────▼──────────┐
            │  type === 'gate'?   │──yes──→ runGate() ──→ Loop back
            └──────────┬──────────┘
                       │no (module)
            ┌──────────▼──────────┐
            │    runModule()      │
            │                     │──FAIL──→ output(result) → exit
            │                     │──OK────→ Check chaos test → Loop
            └─────────────────────┘
                       │
            ┌──────────▼──────────────────┐
            │  getCompletedPhaseId()      │
            │  Checks if an entire phase  │
            │  just completed AND chaos   │
            │  testing is configured      │
            └──────────┬──────────────────┘
                       │ Phase complete?
            ┌──────────▼──────────┐
            │  runChaosTest()     │
            └─────────────────────┘
```


## runModule() — Detailed Flow

```
╔══════════════════════════════════════════════════════╗
║  MODULE 06: WebSocket Streaming                      ║
╠══════════════════════════════════════════════════════╣

  1. LOG_MODULE = moduleId, LOG_PHASE = null
  
  2. checkDependencies()
     Checks depends_on[] in progress.json
     Gates: Does output_file exist? Is gate-status PASS?
     Modules: Is status PASS?
     → If not met: EXIT_ERROR

  3. RETRY LOOP (while true) — re-reads status.json each iteration

  4. loadStatus() or initStatus()
     If PASS → skip
     If BLOCKED → EXIT_BLOCKED
     If PENDING or null → releaseBlueprint()
       └─ Safety check: does not overwrite non-PENDING status
       └─ git checkout origin/<project>/architecture -- <module_path>
       └─ git commit + push

  5. Determine resume point
     needsForge = PENDING | IN_PROGRESS | FAIL (and phase ≠ buster)
     needsBuster = READY_FOR_TESTING | (TESTING + phase=buster)
```

### Phase 1: FORGE (Write Code)

```
  LOG_PHASE = 'forge'
  
  5a. readForgeInstructions()
      Reads FORGE.md (or substep/FORGE.md for each substep)
  
  5b. Append retry context (if status=FAIL)
      Last fail_summary is appended as "## RETRY CONTEXT" block
  
  5c. Append Nova directive (if --prompt was provided)
      Injected as "## NOVA DIRECTIVE (High Priority)" block
  
  5d. recallForModule() — Qdrant Memory
      ┌─ Tries dynamic import of memory.js (no subprocess)
      ├─ Fallback: nodeExec('node', [memPath, 'recall', ...])
      └─ Formatted as "## CONTEXT FROM SWARM MEMORY" block
      
  5e. Status → IN_PROGRESS, phase → forge
      Discord: "Module 06 started"
  
  5f. setShutdownContext() — For SIGTERM cleanup
  
  5g. spawnAgent(config, progress, 'forge', moduleId, model, prompt)
      ├─ ACP agent: Writes prompt to temp file, passes file path as --task
      │   (avoids E2BIG on large prompts)
      └─ Redis agent: Builds payload, writes .mjs dispatch script, executes it
  
  5h. pollStatus() — Polling loop
      ┌─ Every poll_interval_seconds: sleep → gitPullSafe → loadStatus
      ├─ Waits for: READY_FOR_TESTING | FAIL | BLOCKED
      ├─ On RATE_LIMITED: handleRateLimit() (sleep 2h, fresh status after)
      ├─ On parse corruption (10x): pollResult(false, 'parse_corrupted')
      └─ Timeout: pollResult(false, 'timeout')
      
      Returns: { ok: boolean, reason: string, status: object|null }
  
  5i. killAgent() — ALWAYS, even on success (kill-and-respawn)
      clearShutdownContext()
  
  5j. Evaluate result:
      ├─ !ok + timeout → handleFail(isTimeout: true)
      ├─ !ok + rate_limit_exhausted → EXIT_RATE_LIMITED
      ├─ !ok + parse_corrupted → handleFail()
      ├─ FAIL/BLOCKED → handleFail()
      │   └─ handleFail returns { _retry: true }?
      │       → yes: continue (loop back to step 3)
      │       → no: return EXIT_NEEDS_NOVA or EXIT_BLOCKED
      └─ READY_FOR_TESTING → continue to Git Sync
```

### Git Sync (Forge → Buster Handoff)

```
  6. gitSyncBeforeBuster()
     ├─ git add -A
     ├─ git commit (if uncommitted changes)
     ├─ gitPullSafe(false) — no destructive recovery before push
     ├─ git push origin HEAD
     └─ Record forge_commit_hash in status.json
```

### Phase 2: BUSTER (Test Code)

```
  LOG_PHASE = 'buster'
  
  7a. readBusterInstructions()
      Reads BUSTER.md, injects commit hash as "## Test Target"
  
  7b. Status → TESTING, phase → buster
      setShutdownContext()
  
  7c. spawnAgent(config, progress, 'buster', ...)
      Redis dispatch: payload with session config, on_complete hooks
  
  7d. pollStatus() — Waits for PASS | FAIL | BLOCKED
  
  7e. killAgent() + clearShutdownContext()
  
  7f. On PASS:
      ├─ Compute completed_at + total_duration
      ├─ saveStatus()
      ├─ Discord: "Module 06 PASS ✓"
      ├─ feedbackMemory('pass') — Qdrant confidence boost
      ├─ spawnSummaryAgent() — Fire-and-forget Echo agent
      │   └─ Reads git diff, extracts 1-5 technical insights
      │   └─ Stores via memory.js remember
      │   └─ Writes marker file: summary-markers/<moduleId>-summary.json
      └─ EXIT_OK
  
  7g. On FAIL:
      └─ handleFail()
          ├─ { _retry: true } → continue (loop back to step 3, full forge+buster)
          └─ EXIT_NEEDS_NOVA or EXIT_BLOCKED
```

### handleFail() — Failure Handling

```
  ├─ Append fail_summary (attempt, phase, reason, is_timeout)
  ├─ fail_count++
  ├─ Memory feedback:
  │   fail_count == 1 → feedbackMemory('fail') — single decay
  │   fail_count > 1 && < max → skip (memories not at fault)
  │   fail_count >= max → feedbackMemory('blocked') — strong signal
  ├─ Status → FAIL, current_phase → null
  ├─ If fail_count >= maxFails:
  │   Status → BLOCKED, Discord: CRITICAL
  │   → EXIT_BLOCKED
  ├─ If fail_count <= auto_retry_threshold (default 2):
  │   Discord: WARN (auto-retry)
  │   → { _retry: true } (internal loop continues)
  └─ If fail_count > auto_retry_threshold:
      Discord: WARN (needs Nova)
      → EXIT_NEEDS_NOVA
```


## runGate() — Gate Execution

```
  1. Check if output_file already exists → skip
  2. readGateInstructions()
  3. spawnAgent() with gate.type as agentType
  4. Polling loop (custom, not pollStatus):
     ├─ Checks output_file existence (primary signal)
     ├─ Checks <gateId>-gate-status.json for FAIL detection
     │   → EXIT_NEEDS_NOVA if FAIL
     └─ Timeout → EXIT_TIMEOUT
```


## runChaosTest() — Chaos Testing After Phase Completion

Triggered when all modules of a phase are PASS and the phase is configured in `chaos_test.after_phases`.

```
  1. Check chaos marker (chaos-tests/<phaseId>-done.json)
  2. Spawn Buster with chaos_test taskType
     └─ Prompt: "Break the application. Write plan + results JSON."
  3. Poll for results file (not status.json)
  4. Evaluate results:
     ├─ severity none → write marker, continue
     ├─ severity low → Discord summary, store as memory, continue
     └─ severity critical/moderate → Auto-fix loop:
         ┌─ Spawn Forge with fix prompt
         ├─ Poll across ALL affected modules (not just last)
         ├─ Git sync
         ├─ Re-spawn Buster for verification
         └─ max fix_attempts reached? → EXIT_NEEDS_NOVA
```


## Logging — What Gets Logged Where

### Output Channels

| Channel | Format | Consumer |
|---------|--------|----------|
| **stderr** | JSON Lines (one line per event) | Mission Control, log aggregators, terminal |
| **stdout** | JSON (pretty-printed) | Nova (parses the result programmatically) |

### Log Entry Structure (stderr)

```json
{
  "ts": "2025-03-08T14:30:00.123Z",
  "level": "INFO",
  "run_id": "run-1741448400000-a3f2",
  "module": "06",
  "phase": "forge",
  "msg": "Forge complete → READY_FOR_TESTING",
  "data": null
}
```

- **run_id** — Unique per pipeline invocation, correlates all logs of a run
- **module** — Set when `runModule()` is entered (`LOG_MODULE`)
- **phase** — `forge`, `buster`, `chaos`, `chaos-fix-N`, `chaos-verify-N` (`LOG_PHASE`)

### What Gets Logged Where

| Event | Level | Phase | Message |
|-------|-------|-------|---------|
| Pipeline start | STEP | — | `PIPELINE: <project>` |
| Module start | STEP | — | `MODULE 06: WebSocket Streaming` |
| Forge start | STEP | forge | `Phase: FORGE (subagent: forge, model: codex-5.3)` |
| Agent spawn (ACP) | STEP→OK | forge | `Spawning ACP session` → `ACP session spawned` |
| Agent spawn (Redis) | STEP→OK | — | `Dispatching to Redis` → `Redis task dispatched` |
| Memory recall | STEP | forge | `Memory recall for module 06` |
| Memory inject | INFO | forge | `3 memories injected into Forge prompt` |
| Nova directive | INFO | forge | `Nova prompt override injected (142 chars)` |
| Auto-retry | INFO | — | `Auto-retry 1/2 — pipeline will retry internally` |
| Poll tick | INFO | forge | `status=IN_PROGRESS phase=forge 120s/3600s` |
| Git pull conflict | WARN | — | `Git pull left repo in REBASING state` |
| Git commit fail | WARN | — | `Git commit failed for status update` |
| Target reached | OK | forge | `Target status reached: READY_FOR_TESTING` |
| Session kill | STEP→OK | forge | `Destroying ACP session` → `Session destroyed` |
| Git sync | STEP→OK | — | `Git sync: committing...` → `Forge commit hash recorded` |
| Buster start | STEP | buster | `Phase: BUSTER (model: gemini-flash)` |
| Module PASS | OK | buster | `Module 06 PASS` |
| Module FAIL | — | — | (via handleFail → saveStatus → Discord) |
| Rate limit | WARN | — | `Rate limit detected! Pause 1/5. Sleeping 2h` |
| Timeout | ERROR | — | `Timeout after 60 minutes` |
| Chaos test | STEP | chaos | `CHAOS TEST: Core Backend (phase_1)` |
| Shutdown signal | WARN | — | `Received SIGTERM — initiating graceful shutdown` |

### Discord Notifications

| Event | Level | When |
|-------|-------|------|
| Module started | INFO | Forge phase begins |
| Module PASS | OK | Buster confirms |
| Module FAIL (auto-retry) | WARN | Each auto-retry attempt |
| Module NEEDS_NOVA | WARN | Auto-retry threshold exceeded |
| Module BLOCKED | CRITICAL | Max retries exceeded |
| Rate limited | WARN | API rate limit detected |
| Gate PASS/FAIL/TIMEOUT | OK/CRITICAL | Gate completed/failed |
| Chaos test result | INFO/WARN/OK | After evaluation |
| Git commit failed | WARN | Status on disk but not in git |
| Pipeline complete | OK | All modules PASS |


## Retry Behavior (v2.0)

The pipeline has a **tiered retry mechanism**:

### Auto-Retry (internal, no exit)

The first `auto_retry_threshold` failed attempts (default: 2) are handled **internally**. The pipeline does not stop or exit — it loops back internally and starts a fresh Forge agent with the retry context. Discord notifies on each failed attempt.

```
Attempt 1: Forge builds → Buster tests → FAIL
  ↓ handleFail returns { _retry: true }
  ↓ runModule while-loop: continue → re-read status.json
Attempt 2: Forge builds (with retry context) → Buster tests → FAIL
  ↓ handleFail returns { _retry: true }
  ↓ runModule while-loop: continue
Attempt 3: fail_count (2) > auto_retry_threshold (2)
  ↓ handleFail returns EXIT_NEEDS_NOVA (exit code 10)
  ↓ Pipeline stops
```

### Nova Escalation (EXIT_NEEDS_NOVA = 10)

After exceeding the auto-retry threshold, the pipeline exits with code 10. Nova (or you) must then resume with a new approach:

```bash
# Nova analyzes the failure and provides a new approach:
node pipeline.js --project <project> --resume --module 06 \
  --prompt "WebSocket handler must be registered on app directly, not on APIRouter. Use app.websocket() instead of router.websocket()."

# For longer prompts:
node pipeline.js --project <project> --resume --module 06 \
  --prompt-file /tmp/nova-analysis-06.md
```

### What the Forge Agent Receives

The assembled prompt has this order (highest priority last):

```
1. FORGE.md                    ← Original instructions from disk (unchanged)
2. ## RETRY CONTEXT             ← Automatic: last fail_summary
3. ## NOVA DIRECTIVE            ← Only when --prompt is provided
4. ## CONTEXT FROM SWARM MEMORY ← Qdrant recall (confidence-adjusted after fails)
```

### Config

```jsonc
{
  "auto_retry_threshold": 2,   // Default: 2 (attempts 1+2 auto, from 3 → Nova)
  "default_max_fails": 3       // Default: 3 (attempt 3 = BLOCKED if Nova also fails)
}
```

The interplay: `auto_retry_threshold` controls when Nova gets involved. `max_fails` controls when the module becomes BLOCKED (human needed). With default values: 2 auto-retries, 1 Nova retry, then BLOCKED.


## Exit Codes

| Code | Constant | Meaning | Next Action |
|------|----------|---------|-------------|
| 0 | EXIT_OK | Success | — |
| 1 | EXIT_ERROR | Config/system error | Fix config |
| 10 | EXIT_NEEDS_NOVA | Auto-retries exhausted | Nova: `--resume --module <id> --prompt "..."` |
| 20 | EXIT_BLOCKED | Max retries exceeded | Human intervention needed |
| 30 | EXIT_TIMEOUT | Agent did not respond | Nova adjusts timeout/prompt |
| 40 | EXIT_RATE_LIMITED | API rate limit exhausted | Wait or adjust plan |


## Status Transitions

```
PENDING → IN_PROGRESS → READY_FOR_TESTING → TESTING → PASS
                ↓                              ↓
              FAIL ←─────────────────────── FAIL
                │
    ┌───────────┤
    │ auto-retry (internal loop, ≤ threshold)
    │           │
    │   ┌───────▼──────┐
    │   │ FAIL (again) │──── still under threshold? ──→ loop again
    │   └───────┬──────┘
    │           │ threshold exceeded
    │   ┌───────▼──────────┐
    │   │ EXIT_NEEDS_NOVA  │  Nova: --resume --prompt "..."
    │   └───────┬──────────┘
    │           │
    │   ┌───────▼──────┐
    │   │ FAIL (nova)  │──── fail_count >= max_fails?
    │   └───────┬──────┘
    │           │ yes
    │   ┌───────▼──────┐
    │   │   BLOCKED    │  Human intervention needed
    │   └──────────────┘
    │
    └── * → RATE_LIMITED → (previous status after cooldown)
```


## Agent Dispatch Modes

### ACP Agents (Forge, Echo)
- Nova's subagents via OpenClaw CLI (`openclaw sessions spawn`)
- Pipeline has full lifecycle control (spawn/kill)
- Prompt is written to temp file, agent receives file path
- Session is destroyed after each phase

### Redis Agents (Buster)
- Standalone OpenClaw instances in a separate K8s pod
- Task dispatched via Redis Stream (`redis.js`)
- Processor sidecar picks up task, injects Qdrant context, feeds gateway
- Pipeline has NO direct lifecycle control — "kill" is a no-op
- Buster runs as Podman-in-Pod sandbox (SYS_ADMIN, SYS_CHROOT)


## Security Measures (v2.0)

- **Path Validation**: `validateSafePath()` checks redis_js_path and memory_js_path against allowlist (`/app/`, `/opt/`, `/home/`)
- **No Shell**: All external commands via `execFileSync` with array args (no shell bypass)
- **Temp Isolation**: One `mkdtempSync` directory per run, automatically cleaned up
- **Config Validation**: All required fields checked at startup with clear error messages
- **Graceful Shutdown**: SIGTERM/SIGINT kills running agent, sets status to FAIL
- **Discord URL Protection**: Entire `discord()` function wrapped in try/catch (no URL leak in stack traces)
- **Git Safe Mode**: `gitPullSafe()` defaults to `allowDestructiveRecovery=false` — no `reset --hard` without explicit permission


## Generated Runtime Files

| Path | Created by | Purpose |
|------|-----------|---------|
| `/tmp/swarm-pipeline-XXXXXX/` | `initTempDir()` | Temp directory for this run |
| `.../prompt-<mod>-*.md` | `spawnAcpAgent()` | Forge/Echo prompt files |
| `.../payload-<mod>-*.json` | `dispatchRedisTask()` | Redis task payloads |
| `.../dispatch-<mod>-*.mjs` | `dispatchRedisTask()` | Redis dispatch scripts |
| `<swarmRoot>/summary-markers/<mod>-summary.json` | Summary Agent | Completion marker |
| `<swarmRoot>/chaos-tests/<phase>-plan.md` | Chaos Buster | Test plan |
| `<swarmRoot>/chaos-tests/<phase>-results.json` | Chaos Buster | Test results |
| `<swarmRoot>/chaos-tests/<phase>-done.json` | Pipeline | Chaos completion marker |
| `<swarmRoot>/<gateId>-gate-status.json` | Gate Agent | Gate FAIL detection |
