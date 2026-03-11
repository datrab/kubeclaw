# PIPELINE.JS — Complete Architecture & Reference Documentation (v2)

**File:** `pipeline.js` (3223 lines)  
**Type:** ES Module (Node.js)  
**Purpose:** Deterministic Swarm Orchestrator for the OpenClaw Multi-Agent Platform  
**Caller:** Nova (Opus Orchestrator) or directly via CLI  
**Version:** v2 — Post Buster-Refactor + Review Optimizations  

---

## Table of Contents

1. [Overview and Design Philosophy](#1-overview-and-design-philosophy)
2. [Exit Codes and Status Model](#2-exit-codes-and-status-model)
3. [Imports and Dependencies](#3-imports-and-dependencies)
4. [Security Layer: Safe Execution Wrappers](#4-security-layer-safe-execution-wrappers)
5. [Path Validation](#5-path-validation)
6. [Temp Directory Management](#6-temp-directory-management)
7. [Graceful Shutdown](#7-graceful-shutdown)
8. [Structured Logging](#8-structured-logging)
9. [Configuration and File Management](#9-configuration-and-file-management)
10. [Status Management and Git Integration](#10-status-management-and-git-integration)
11. [Git Operations](#11-git-operations)
12. [Discord Notifications](#12-discord-notifications)
13. [Blueprint Manager](#13-blueprint-manager)
14. [Agent Dispatch System (Dual Mode)](#14-agent-dispatch-system-dual-mode)
15. [File Readers](#15-file-readers)
16. [Qdrant Memory Integration](#16-qdrant-memory-integration)
17. [Polling System](#17-polling-system)
18. [Rate Limit Handling](#18-rate-limit-handling)
19. [Redis Completion Stream (Buster)](#19-redis-completion-stream-buster)
20. [Git Sync (Forge → Buster Handoff)](#20-git-sync-forge--buster-handoff)
21. [Dependency Checking](#21-dependency-checking)
22. [Failure Handler](#22-failure-handler)
23. [Forge Prompt Assembly](#23-forge-prompt-assembly)
24. [Module Runner (Main Orchestrator)](#24-module-runner-main-orchestrator)
25. [Gate Runner](#25-gate-runner)
26. [Chaos Test System](#26-chaos-test-system)
27. [Pipeline Runner (Top Level)](#27-pipeline-runner-top-level)
28. [Status Output and Dry Run](#28-status-output-and-dry-run)
29. [CLI Wrapper and Entrypoint](#29-cli-wrapper-and-entrypoint)
30. [Exports](#30-exports)
31. [Complete Flow Graph](#31-complete-flow-graph)
32. [Function Dependency Graph](#32-function-dependency-graph)
33. [Cross-System Architecture (Buster Refactor)](#33-cross-system-architecture-buster-refactor)

---

## 1. Overview and Design Philosophy

### Core Concept

`pipeline.js` is the deterministic orchestrator of the OpenClaw Swarm. It is called by Nova to autonomously handle the module pipeline workflow. On the happy path, everything runs automatically. On failure, it exits with structured JSON so Nova can analyze and retry.

### Kill-and-Respawn Strategy

The central design principle is **Kill-and-Respawn**: Fresh agents with better prompts outperform stale agents with polluted context windows. On every phase transition or failure, the agent session is destroyed and a new one spawned. Since the Buster Refactor, this principle applies consistently to ALL agents — Buster now also gets fresh subagents per test (instead of injection into a persistent main session).

### Agent Lifecycle

- **PASS** → Agent session destroyed, new agent spawned for next module
- **FAIL** → Agent session destroyed, Nova analyzes, new agent spawned for retry
- **TIMEOUT** → Agent session destroyed, treated as FAIL

### Invocation Modes

```
node pipeline.js --project <project>                    # Full pipeline
node pipeline.js --project <project> --module 06        # Single module
node pipeline.js --project <project> --resume           # Resume from state
node pipeline.js --project <project> --status           # Print status JSON
node pipeline.js --project <project> --dry-run          # Preview plan
node pipeline.js --project <project> --blueprint 06     # Release blueprint
node pipeline.js --project <project> --blueprint-list   # List blueprints
```

---

## 2. Exit Codes and Status Model

### Exit Codes (Lines 162–167)

| Code | Constant           | Meaning                                          |
|------|--------------------|--------------------------------------------------|
| `0`  | `EXIT_OK`          | Pipeline/module completed successfully            |
| `1`  | `EXIT_ERROR`       | Configuration or system error                     |
| `10` | `EXIT_NEEDS_NOVA`  | Module failed, Nova must analyze                  |
| `20` | `EXIT_BLOCKED`     | Max retries exceeded, human intervention needed   |
| `30` | `EXIT_TIMEOUT`     | Agent did not respond within time limit           |
| `40` | `EXIT_RATE_LIMITED` | Rate limit pauses exceeded                       |

### Status Enum (Lines 169–179)

| Status              | Meaning                                                        |
|---------------------|----------------------------------------------------------------|
| `PENDING`           | Module initialized, not yet started                            |
| `IN_PROGRESS`       | Forge is working on the module                                 |
| `READY_FOR_TESTING` | Forge complete, ready for Buster                               |
| `TESTING`           | Buster is testing the module                                   |
| `REVIEWING`         | Echo (code review) is checking (reserved)                      |
| `PASS`              | All tests passed                                               |
| `FAIL`              | Phase failed, retry possible                                   |
| `BLOCKED`           | Max retries exceeded, pipeline stopped                         |
| `RATE_LIMITED`      | Upstream API limit reached, pipeline paused                    |

---

## 3. Imports and Dependencies

**Lines 36–40** — Exclusively Node.js built-in modules:

| Import              | Usage                                                   |
|---------------------|---------------------------------------------------------|
| `execFileSync`      | Shell-free execution of external commands (security)     |
| `fs`                | Filesystem operations (sync)                             |
| `path`              | Path resolution, composition, normalization              |
| `fileURLToPath`     | ESM `import.meta.url` → file path (CLI detection)       |
| `os`                | `os.tmpdir()` for temp directory                         |

**Critical:** `execFileSync` instead of `execSync` — passes arguments as an array directly to the process, without a shell. Command injection is impossible, even if LLM-generated content contains shell metacharacters.

---

## 4. Security Layer: Safe Execution Wrappers

### `gitExec(repoRoot, args, opts)` — Line 55

Safe git wrapper. Uses `-C repoRoot` for repository context. Defaults: `encoding: 'utf8'`, `timeout: 30000`.

### `clawExec(args, opts)` — Line 67

Safe OpenClaw CLI wrapper. For ACP agent lifecycle (spawn, kill, send, status).

### `nodeExec(scriptPath, args, opts)` — Line 80

Safe Node.js script wrapper. For redis.js, memory.js, and dynamically generated inline scripts.

### `curlPost(url, jsonPayload, opts)` — Line 92

Safe webhook wrapper. `stdio: 'ignore'`, `timeout: 10000`. Only used by `discord()`.

---

## 5. Path Validation

### `ALLOWED_PATH_PREFIXES` — Line 106

```javascript
const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];
```

### `validateSafePath(filePath, label)` — Line 108

Validates dynamic script paths (redis_js_path, memory_js_path) against the allowlist. Checks for empty strings, path traversal (`..`), and prefix match. Callers: `validateConfig`, `dispatchRedisTask`, `memoryJsPath`.

---

## 6. Temp Directory Management

### `initTempDir()` — Line 132

Creates `swarm-pipeline-*` under `os.tmpdir()`. Registers **`process.on('exit', cleanupTempDir)`** for guaranteed cleanup on any exit — `process.exit()`, normal termination, and unhandled exceptions. Manual `cleanupTempDir()` calls at exit points are a safety net, not a requirement.

### `cleanupTempDir()` — Line 142

Recursive `fs.rmSync`. On error: warning only, no throw.

### `tmpFile(prefix, moduleId, ext)` — Line 153

Generates unique temp file paths: `{prefix}-{moduleId}-{ts}-{rand}{ext}`. Used for prompts, payloads, dispatch scripts, Redis poll scripts.

---

## 7. Graceful Shutdown

### `registerShutdownHooks()` — Line 186

SIGTERM/SIGINT handler: kill agent → mark status as FAIL → cleanup temp → exit 1.

### `setShutdownContext()` / `clearShutdownContext()` — Lines 217/221

Sets/clears the active agent context for the shutdown handler.

---

## 8. Structured Logging

### `log(level, msg, data)` — Line 236

JSON lines to stderr: `{ ts, level, run_id, module?, phase?, msg, data? }`. The `RUN_ID` (line 232) correlates all entries of a pipeline invocation.

### `output(result)` — Line 249

Pretty-printed JSON to stdout. Nova parses this output.

---

## 9. Configuration and File Management

### `loadConfig(projectName, configOverridePath)` — Line 255

Loads and validates pipeline configuration. Config resolution: `--config` override → `<repo>/projects/<project>/.swarm/pipeline.config.json`. Resolves `${project}` templates, sets path defaults, validates via `validateConfig()`.

### `validateConfig(config)` — Line 345

Fail-fast validation of all required fields. Sets defaults: `poll_interval_seconds: 30`, `default_timeout_minutes: 60`, `default_max_fails: 3`. Validates dynamic script paths via `validateSafePath`.

### `loadProgress(config)` — Line 406

Loads `progress.json` with modules, gates, phases, and `execution_order`.

### Path Helper Functions (Lines 412–421)

| Function | Returns |
|----------|---------|
| `modulePath(config, dir)` | Absolute path to module directory |
| `statusPath(config, dir)` | `<modules_dir>/<dir>/status.json` |
| `swarmRoot(config)` | `config.paths.swarm_dir` |
| `relPath(config, absPath)` | Repo-relative path |
| `completionStreamKey(config)` | `swarm:pipeline:<project>:completions` |

---

## 10. Status Management and Git Integration

### `loadStatus(config, dir)` — Line 424

Loads status.json. On JSON parse error: returns `null` + logs a **content preview** (first 200 chars) for quick diagnosis — partial write, merge conflict markers, or real bugs are immediately distinguishable.

### `saveStatus(config, dir, status)` — Line 443

**Atomic write:** Writes to `.tmp` file, then `fs.renameSync` (POSIX-atomic on same filesystem). Prevents partial-read scenarios during concurrent access. Then commits via `gitCommitQuiet()`.

### `gitCommitQuiet(config, filePath, message)` — Line 456

Quiet git commit: `git add` + `git commit --allow-empty`. On error: warning + Discord alert (no throw).

### Git Hash Cache (Lines 618–636)

`headHash()` returns the short git HEAD hash (cached). Before `loadConfig`, returns empty string (no unsafe CWD fallback). `invalidateHeadHash()` is called after every HEAD-changing git operation.

### `addHistory(status, newStatus, agent, note)` — Line 640

Adds history entry: `{ timestamp, status, agent, note, commit_hash }`.

### `initStatus(moduleId, moduleConfig)` — Line 650

Creates fresh status object with all fields. Cost tracking is **informational only** — no budget enforcement. Token budgets are managed at the API/OAuth level.

---

## 11. Git Operations

### `_gitPullCore(config, allowDestructiveRecovery)` — Line 490

Core implementation for `git pull --rebase` with rebase-abort recovery.

- **`allowDestructiveRecovery = true`** (polling): `reset --hard origin/<branch>`. Logs **WARN** before the destructive reset.
- **`allowDestructiveRecovery = false`** (before push): Throws error with **concrete recovery instructions** (cd, rebase --abort, pull, resume command).

### `gitPullForPolling(config)` — Line 540

Destructive recovery allowed. For polling loops.

### `gitPullBeforePush(config)` — Line 545

Throws on conflict. Protects local commits.

### `gitPushWithRetry(config, maxRetries, delayMs)` — Line 556

Push with 3 attempts, 5s delay, 60s timeout per attempt. Catches transient network failures.

### `gitCommitAndPush(config, message, opts)` — Line 583

**Unified function for all git commit+push operations.** Replaces scattered logic in releaseBlueprint, gitSyncBeforeBuster, and chaos fix.

**Options:**
- `addPaths` (string[]): Paths for `git add` (default: `['-A']`)
- `captureHash` (boolean): Returns commit hash after push (default: false)
- `softFail` (boolean): Logs warning instead of throwing on error (default: false)

**Guarantees:** `invalidateHeadHash()` after every commit. Push always via `gitPushWithRetry`.

**Callers:** `releaseBlueprint`, `gitSyncBeforeBuster`, chaos fix in `runChaosTest`.

---

## 12. Discord Notifications

### `discord(config, level, title, description, fields)` — Line 691

Sends rich embeds to Discord webhook. Entire function wrapped in try/catch to prevent webhook URL leaks. Color scheme: INFO=Blue, WARN=Orange, CRITICAL=Red, OK=Green.

---

## 13. Blueprint Manager

### `listBlueprints(config)` — Line 720

Lists blueprints from `<project>/architecture` branch.

### `releaseBlueprint(config, moduleId, moduleDir)` — Line 735

Copies blueprint from architecture branch. **Verifies both FORGE.md and BUSTER.md** before checkout (via `requiredFiles` loop). Uses `gitCommitAndPush()` for commit+push.

---

## 14. Agent Dispatch System (Dual Mode)

### Architecture

**ACP Agents (Forge, Echo):** Thread-bound ACP sessions via OpenClaw CLI. Pipeline has direct lifecycle control.

**Redis Agents (Buster):** Task is dispatched to Redis stream. Buster's **Processor sidecar spawns a subagent directly** via `sessions_spawn` (no cron, no main session). The subagent runs in a Discord thread (visible) and signals completion via redis.js.

### `acpLabel(agentType, moduleId)` — Line 809

Format: `<agentType>-<moduleId>`.

### `spawnAcpAgent(config, agentType, moduleId, model, taskPrompt)` — Line 815

Writes prompt to temp file (E2BIG protection), spawns via `openclaw sessions spawn`.

### `killAcpAgent(config, agentType, moduleId)` — Line 860

`openclaw sessions kill --label <label>`. Best effort on error.

### `buildBusterPayload(config, progress, moduleId, taskType, taskPrompt, status)` — Line 879

Builds payload for Buster's Redis stream. Includes `completion_stream` for the return channel.

**`module_test` payload:**
```json
{
  "task_type": "module_test",
  "completion_stream": "swarm:pipeline:<project>:completions",
  "session": { "runtime": "subagent", "timeout_seconds": 3600, "label": "buster-test-06-..." },
  "module_path": "...", "buster_md_path": "...", "status_json_path": "..."
}
```

**`chaos_test` payload:**
```json
{
  "session": { "runtime": "acp", "acp_agent_id": "codex", "timeout_seconds": 1800 },
  "chaos_config": { "scope": "full_application", "goal": "..." }
}
```

No `on_complete` field — the subagent handles completion itself via the redis.js `complete` action.

### `dispatchRedisTask(...)` — Line 929

Writes payload + dispatch script to temp files, executes via `nodeExec`.

### Unified Interface (Lines 976–1035)

| Function | ACP Routing | Redis Routing |
|----------|------------|---------------|
| `spawnAgent()` | `spawnAcpAgent()` | `dispatchRedisTask()` |
| `killAgent()` | `killAcpAgent()` | No-op (Processor kills) |
| `steerAgent()` | Temp file + `sessions send` | `dispatchRedisTask(steer)` |

`steerAgent` now uses temp files for messages (E2BIG protection), consistent with `spawnAcpAgent`.

### `verifyAgentAlive(config, agentType, moduleId, waitMs)` — Line 1036

Health check after ACP spawn. Waits 8s, checks via `openclaw sessions status --label <label>`. Catches silent spawn failures (OOM, gateway down) in seconds instead of the full 60-minute polling timeout. Redis agents skip the check (Processor monitors).

---

## 15. File Readers

### `readForgeInstructions(config, moduleDir, moduleConfig)` — Line 1065

Reads FORGE.md (single file or assembled from substeps).

### `readBusterInstructions(config, moduleDir)` — Line 1083

Reads BUSTER.md.

### `readGateInstructions(config, gate)` — Line 1089

Reads gate instruction file.

---

## 16. Qdrant Memory Integration

### Three Integration Points

1. **BEFORE FORGE (Recall):** `recallForModule()` — Inject memories from Qdrant into Forge prompt
2. **AFTER PASS/FAIL (Feedback):** `feedbackMemory()` — Bulk-update confidence scores
3. **AFTER FAIL (Decay):** `decayRecalledMemories()` — Targeted decay only for memories that were in the prompt

### Removed Integration Point

~~4. AFTER PASS (Store Pattern): `spawnSummaryAgent()`~~ — **Removed.** Buster subagent now stores insights directly via memory skill as part of the completion protocol (Step B: Memory → Step C: redis.js complete).

### `recallForModule(...)` — Line 1156

Builds natural language query, on retry with fail context. Formats as markdown with confidence stars (★★★/★★☆/★☆☆). Returns `{ block, count, ids }`.

### `feedbackMemory(...)` — Line 1247

Bulk update on module-related memories. PASS = boost, BLOCKED = decay.

### `decayRecalledMemories(...)` — Line 1298

Targeted decay only for memories from the Forge prompt. Cross-run protection via `status.decayed_memory_ids`.

---

## 17. Polling System

### `pollGeneric(config, checkFn, timeoutMinutes, label)` — Line 1394

**Shared foundation** for all polling loops. Handles: deadline loop, sleep, gitPull, rate limit handling (with deadline reset), parse corruption tracking (10 consecutive failures), progress logging.

The caller provides a `checkFn` called each cycle, returning:
- `{ done: true, result: PollResult }` → Terminal
- `{ done: false, logMsg? }` → Keep polling
- `{ rate_limited: true, status }` → Rate limit pause
- `{ parse_error: true }` → Increment corruption counter

### `pollForFile(config, filePath, timeoutMinutes, label)` — Line 1458

One-liner wrapper: waits until file exists. Used by chaos tests.

### `pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes)` — Line 1472

Pure git polling loop for status.json. Used by the **Forge phase**.

### `pollWithRateLimitRecovery(...)` — Line 1543

Wrapper around `pollStatus` with rate limit handling. Forge phase uses this.

### `pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes)` — Line 1733

**Dual-channel polling** for the Buster phase: Redis completion stream (fast, seconds) + Git status.json (fallback, 30s). First signal wins.

### `pollDualWithRateLimitRecovery(...)` — Line 1822

Wrapper around `pollDual` with rate limit handling. Buster phase uses this.

### `mapRedisStatus(redisStatus)` — Line 1807

Maps Redis completion status to pipeline status (`PASS`→`PASS`, `FAIL`→`FAIL`, `ISSUES_FOUND`→`FAIL`).

---

## 18. Rate Limit Handling

### `handleRateLimit(config, status, moduleDir, pauseCount, maxPauses)` — Line 1576

Pauses on rate limit: calculate cooldown → Discord alert → sleep → load fresh status → restore phase. Timeout clock resets after cooldown.

---

## 19. Redis Completion Stream (Buster)

### Architecture

```
Active:  swarm:pipeline:<project>:completions       ← current entries
Archive: swarm:pipeline:<project>:completions:log   ← processed entries
```

### `archiveModuleCompletions(config, moduleId)` — Line 1638

**Called BEFORE each Buster dispatch.** Moves old completion entries for the module from active → archive. Prevents `pollDual` from reading stale FAIL/PASS from a previous attempt. Archive stream is trimmed at ~1000 entries.

### `readCompletionFromRedis(config, moduleId)` — Line 1688

Reads the latest completion entry for a module from the active stream. Spawns a short-lived Node subprocess (consistent with existing redis.js pattern).

---

## 20. Git Sync (Forge → Buster Handoff)

### `gitSyncBeforeBuster(config, moduleDir, status)` — Line 1846

Uses `gitCommitAndPush()` with `captureHash: true`. If Forge already committed (no new commit needed), still pushes to deliver unpushed commits to origin. Records `forge_commit_hash` in status.

---

## 21. Dependency Checking

### `checkDependencies(config, progress, moduleId)` — Line 1879

Checks gate dependencies (output_file, gate status) and module dependencies (PASS status).

---

## 22. Failure Handler

### `handleFail(config, status, moduleDir, moduleId, maxFails, phase, reason, opts)` — Line 1915

Central failure handler with five steps:

1. **Capture fail summary** → `status.fail_summaries`
2. **Memory feedback** — Targeted decay (on every fail) + broad feedback (only on BLOCKED)
3. **Status update** → FAIL or BLOCKED
4. **Auto-retry decision** — `fail_count <= auto_retry_threshold` → internal retry, otherwise escalation
5. **Escalation** → `buildNovaEscalation()` for complete context package

### `buildNovaEscalation(...)` — Line 2031

Extracted function for the Nova escalation package. Contains: reason, fail_count, fail_history (all failures), module_status snapshot, and explicit `resume_command`.

---

## 23. Forge Prompt Assembly

### `buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt)` — Line 2091

Priority order (top = highest):
1. Priority Header (conflict resolution instructions)
2. Nova Directive (overrides everything)
3. Anti-Patterns (concrete negative constraints)
4. FORGE.md (base instructions)
5. Memory Context (supplementary, may be outdated)

---

## 24. Module Runner (Main Orchestrator)

### `runModule(config, progress, moduleId, opts)` — Line 2203

Retry loop around `executeModuleAttempt()`. Dependencies are checked once before all attempts.

### `executeModuleAttempt(...)` — Line 2242

**One complete Forge → Git Sync → Buster cycle.**

#### Forge Phase
1. `buildForgePrompt()` → Prompt with priority hierarchy
2. `spawnAgent('forge')` → ACP session
3. **`verifyAgentAlive()`** → Health check after 8s (catches silent failures)
4. `pollWithRateLimitRecovery()` → Git polling
5. `killAgent('forge')` → always

#### Git Sync
1. `archiveModuleCompletions()` → archive stale Redis entries
2. `gitSyncBeforeBuster()` → `gitCommitAndPush()` + push

#### Buster Phase
1. `readBusterInstructions()` + commit hash injection
2. `spawnAgent('buster')` → Redis dispatch → Processor spawns subagent
3. **`pollDualWithRateLimitRecovery()`** → Redis + Git in parallel
4. `killAgent('buster')` → safety net (Processor should have killed already)

#### On PASS
- `feedbackMemory('pass')` → Confidence boost
- *(Insights are stored by the Buster subagent directly — no Summary Agent)*

#### On FAIL
- `handleFail()` → Decay + auto-retry or escalation

---

## 25. Gate Runner

### `runGate(config, progress, gateId)` — Line 2510

Uses `pollGeneric()` with a gate-specific `checkFn`:
- Checks `output_file` (primary completion signal)
- Checks gate status file (FAIL, RATE_LIMITED)
- Parse corruption and rate limits are handled automatically by `pollGeneric`

Agent is killed **after** the poll loop (once, cleanly).

---

## 26. Chaos Test System

### Flow

1. `getCompletedPhaseId()` checks if a phase is complete
2. `runChaosTest()` spawns Buster for chaos testing
3. Polling via `pollForFile()` for results JSON
4. Severity evaluation: none/low → continue, critical/moderate → auto-fix loop

### Auto-Fix Loop

Forge model is now pulled from the **affected module** (instead of the last module in the phase). Git sync uses `gitCommitAndPush()` with `softFail: true`. Chaos verify polling also uses `pollForFile()`.

---

## 27. Pipeline Runner (Top Level)

### `findNextStep(config, progress)` — Line 2960

Iterates `execution_order`: next non-PASS step.

### `runPipeline(config, progress, opts)` — Line 2979

Main loop: `findNextStep()` → `runGate()` or `runModule()`. After module PASS: checks chaos test trigger.

---

## 28. Status Output and Dry Run

### `printStatus(config, progress)` — Line 3042

Outputs pipeline status as JSON (all modules + gates).

### `dryRun(config, progress)` — Line 3064

Shows execution plan without spawning agents.

---

## 29. CLI Wrapper and Entrypoint

Lines 3102–3224. Manual argument parsing. Environment fallback: `CURRENT_PROJECT`.

**Execution order:**
1. `initTempDir()` (+ `process.on('exit')` cleanup)
2. `registerShutdownHooks()`
3. `loadConfig()` → Blueprint commands (exit early)
4. `loadProgress()` → Status/dry-run (exit early)
5. Resolve Nova prompt → `runPipeline()` → cleanup → exit

---

## 30. Exports

```javascript
export {
  // Config & Status
  loadConfig, loadProgress, loadStatus, saveStatus,

  // Blueprints
  releaseBlueprint, listBlueprints,

  // Agent Management
  spawnAgent, killAgent, steerAgent, verifyAgentAlive,
  spawnAcpAgent, killAcpAgent, dispatchRedisTask,

  // Memory
  recallForModule, feedbackMemory, decayRecalledMemories,

  // Prompt Building
  buildForgePrompt, executeModuleAttempt,

  // Runners
  runModule, runGate, runPipeline, runChaosTest,

  // Git Operations
  printStatus, gitSyncBeforeBuster, gitPullForPolling, gitPullBeforePush,
  gitPushWithRetry, gitCommitAndPush,

  // Polling
  pollStatus, pollWithRateLimitRecovery,
  pollDual, pollDualWithRateLimitRecovery,
  pollGeneric, pollForFile,

  // Infrastructure
  handleRateLimit, completionStreamKey, archiveModuleCompletions,

  // Constants
  STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_TIMEOUT, EXIT_RATE_LIMITED,
};

export default runPipeline;
```

---

## 31. Complete Flow Graph

### Happy Path

```
CLI Entrypoint
  │
  ├─ initTempDir() + process.on('exit', cleanup)
  ├─ registerShutdownHooks()
  ├─ loadConfig() + loadProgress()
  │
  └─ runPipeline()
       │
       └─ LOOP: findNextStep()
            │
            ├─ type: 'gate'
            │   └─ runGate()
            │       ├─ spawnAgent()
            │       ├─ pollGeneric(checkFn)     ← output_file + gate status
            │       └─ killAgent()
            │
            ├─ type: 'module'
            │   └─ runModule()
            │       ├─ checkDependencies()
            │       └─ RETRY LOOP: executeModuleAttempt()
            │           │
            │           ├─ releaseBlueprint() [if PENDING]
            │           │   └─ verifies FORGE.md + BUSTER.md
            │           │
            │           ├─ ═══ FORGE PHASE ═══
            │           │   ├─ buildForgePrompt()
            │           │   │   ├─ readForgeInstructions()
            │           │   │   ├─ Anti-Patterns + Nova Directive + Memory Recall
            │           │   │   └─ Priority Header
            │           │   ├─ spawnAgent('forge') → ACP
            │           │   ├─ verifyAgentAlive() → 8s health check
            │           │   ├─ pollWithRateLimitRecovery() → Git only
            │           │   └─ killAgent('forge')
            │           │
            │           ├─ ═══ GIT SYNC ═══
            │           │   ├─ archiveModuleCompletions() → clear stale Redis
            │           │   └─ gitSyncBeforeBuster()
            │           │       └─ gitCommitAndPush(captureHash: true)
            │           │
            │           ├─ ═══ BUSTER PHASE ═══
            │           │   ├─ readBusterInstructions() + commit hash inject
            │           │   ├─ spawnAgent('buster') → Redis dispatch
            │           │   │   └─ Processor spawns subagent (thread-bound)
            │           │   ├─ pollDualWithRateLimitRecovery()
            │           │   │   ├─ Redis completion stream (fast, seconds)
            │           │   │   └─ Git status.json (fallback, 30s)
            │           │   └─ killAgent('buster') → safety net
            │           │
            │           ├─ ON PASS:
            │           │   └─ feedbackMemory('pass')
            │           │       (insights stored by Buster subagent directly)
            │           │
            │           └─ ON FAIL:
            │               └─ handleFail()
            │                   ├─ decayRecalledMemories()
            │                   └─ auto-retry / buildNovaEscalation()
            │
            ├─ AFTER MODULE PASS:
            │   └─ getCompletedPhaseId() → runChaosTest()
            │       ├─ pollForFile() (results)
            │       └─ Auto-Fix: gitCommitAndPush(softFail) + pollForFile(verify)
            │
            └─ type: 'done' → 🎉 EXIT_OK
```

### Buster Completion Chain (Cross-System)

```
Pipeline dispatches → Redis Stream → Processor
  ├─ recallContext() → Qdrant
  ├─ buildSubagentPrompt() (no /acp spawn instructions)
  ├─ sessions_spawn(thread: true, mode: session)
  │   → Discord thread created (visible live)
  ├─ monitorSubagent() — poll completion stream + timeout
  │
  Subagent (isolated, fresh context):
  │ ├─ Tests per BUSTER.md
  │ ├─ Writes status.json (PASS/FAIL)
  │ ├─ memory skill (insights stored ALWAYS)
  │ └─ redis.js --action complete
  │     ├─ verify-task.js → scope check, revert violations, scoped push
  │     └─ Redis XADD → completion_stream (+ XTRIM ~250)
  │
  Processor sees completion → kills subagent
  Pipeline sees completion (Redis or Git fallback) → continues
```

---

## 32. Function Dependency Graph

### Calls (per function → calls)

| Function | Calls |
|----------|-------|
| `loadConfig` | `execFileSync`, `validateConfig` |
| `validateConfig` | `validateSafePath` |
| `saveStatus` | `fs.writeFileSync` (tmp), `fs.renameSync` (atomic), `gitCommitQuiet` |
| `gitCommitAndPush` | `gitExec(add, commit)`, `invalidateHeadHash`, `gitPullBeforePush`, `gitPushWithRetry` |
| `gitPushWithRetry` | `gitExec(push)`, `execFileSync(sleep)` |
| `releaseBlueprint` | `gitExec(cat-file)` (FORGE.md + BUSTER.md), `gitCommitAndPush` |
| `spawnAcpAgent` | `tmpFile`, `clawExec` |
| `steerAgent` | `tmpFile` + `clawExec` (ACP) or `dispatchRedisTask` (Redis) |
| `verifyAgentAlive` | `execFileSync(sleep)`, `clawExec(sessions status)` |
| `buildBusterPayload` | `completionStreamKey`, `relPath`, `modulePath` |
| `pollGeneric` | `sleep`, `gitPullForPolling`, `handleRateLimit` |
| `pollForFile` | `pollGeneric` |
| `pollDual` | `sleep`, `readCompletionFromRedis`, `gitPullForPolling`, `loadStatus` |
| `archiveModuleCompletions` | `tmpFile`, `nodeExec` |
| `readCompletionFromRedis` | `tmpFile`, `nodeExec` |
| `handleFail` | `decayRecalledMemories`, `feedbackMemory`, `saveStatus`, `discord`, `buildNovaEscalation` |
| `buildForgePrompt` | `readForgeInstructions`, `recallForModule` |
| `executeModuleAttempt` | `releaseBlueprint`, `buildForgePrompt`, `spawnAgent`, `verifyAgentAlive`, `pollWithRateLimitRecovery`, `archiveModuleCompletions`, `gitSyncBeforeBuster`, `pollDualWithRateLimitRecovery`, `handleFail`, `feedbackMemory`, `killAgent` |
| `runGate` | `spawnAgent`, `pollGeneric`, `killAgent`, `discord` |
| `runChaosTest` | `spawnAgent`, `pollForFile`, `killAgent`, `gitCommitAndPush(softFail)`, `discord` |
| `runPipeline` | `findNextStep`, `runModule`, `runGate`, `getCompletedPhaseId`, `runChaosTest` |

### Global State

| Variable | Set by | Used by |
|----------|--------|---------|
| `_tmpDir` | `initTempDir()` | `tmpFile()`, `cleanupTempDir()`, `process.on('exit')` |
| `_shutdownState` | `setShutdownContext()` | Shutdown handler |
| `RUN_ID` | Initialization (const) | `log()`, `discord()` |
| `LOG_MODULE` / `LOG_PHASE` | `runModule()`, `executeModuleAttempt()` | `log()` |
| `_headHashCache` / `_repoRoot` | `loadConfig()`, `headHash()` | `headHash()`, `gitExec` |
| `_memoryModule` | `getMemoryModule()` | Memory functions |

---

## 33. Cross-System Architecture (Buster Refactor)

### Affected Files

| File | Role | Version |
|------|------|---------|
| `pipeline.js` | Orchestrator (runs in Nova) | v2 (3223 lines) |
| `buster-processor.cjs` | Buster sidecar (spawns subagents) | v6.0 |
| `redis.js` | Buster agent skill (complete action) | Buster version |
| `verify-task.js` | Agent scope firewall + push gate | v2 |
| `nova-processor.cjs` | Nova sidecar (unchanged logic) | v5.1 |

### Redis Streams

| Stream | Direction | Purpose |
|--------|-----------|---------|
| `swarm:buster:tasks` | Pipeline → Processor | Task dispatch (XTRIM ~250) |
| `swarm:pipeline:<project>:completions` | Subagent → Pipeline | Completion signal |
| `swarm:pipeline:<project>:completions:log` | Archive | Old completions (XTRIM ~1000) |

### verify-task.js Scope Rules

| Agent Role | Allowed | Blocked |
|------------|---------|---------|
| `forge` | Project code + `.swarm/{STATUS.md, FORGE.md}` | Other .swarm files |
| `buster` | Everything inside `.swarm/` | App code outside `.swarm/` |
| `echo` | `.swarm/echo-reviews/` | Everything else |

### Deployment Prerequisites

```json
{
  "channels": {
    "discord": {
      "threadBindings": {
        "enabled": true,
        "spawnSubagentSessions": true,
        "spawnAcpSessions": true
      }
    }
  }
}
```

---

## Appendix: External Dependencies

### System Binaries

| Binary | Used for |
|--------|----------|
| `git` | All git operations (via `gitExec`) |
| `openclaw` | ACP agent lifecycle (via `clawExec`) |
| `node` | Script execution (via `nodeExec`) |
| `curl` | Discord webhooks (via `curlPost`) |
| `sleep` | Synchronous delays in retry loops |

### External Services

| Service | Integration |
|---------|------------|
| **Qdrant** | Vector memory (recall, feedback, decay) |
| **Redis** | Agent task dispatch + completion signaling |
| **Discord** | Webhook alerts + thread-bound agent visibility |
| **Git Remote** | Code synchronization (push/pull) |
| **OpenClaw Gateway** | sessions_spawn (Buster Processor) |

### Filesystem Artifacts

| Artifact | Creator | Reader |
|----------|---------|--------|
| `status.json` | Pipeline (atomic write), Buster subagent | Pipeline, all |
| `FORGE.md` / `BUSTER.md` | Architecture branch | Pipeline → Forge/Buster |
| `progress.json` | Manual/Nova | Pipeline |
| `pipeline.config.json` | Manual | Pipeline |
| `chaos-tests/*-results.json` | Buster (chaos) | Pipeline |
| `chaos-tests/*-done.json` | Pipeline | Pipeline (idempotency) |
| `*-gate-status.json` | Gate agent | Pipeline |
| Temp: `prompt-*.md` | Pipeline | Forge agent |
| Temp: `steer-*.md` | Pipeline | Agent (via steerAgent) |
| Temp: `redis-poll-*.cjs` | Pipeline | Node.js (Redis reader) |
| Temp: `redis-archive-*.cjs` | Pipeline | Node.js (Redis archiver) |
