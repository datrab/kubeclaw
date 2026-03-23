#!/usr/bin/env node

// =============================================================================
// PIPELINE.JS — Deterministic Swarm Orchestrator
// =============================================================================
//
// Called by Nova to run the module pipeline. Handles the happy path autonomously.
// On failure, exits with structured JSON so Nova can analyze and retry.
//
// Exit codes:
//   0  = Pipeline complete / module PASS
//   1  = Configuration or system error
//   10 = NEEDS_NOVA — module failed, Nova must analyze and write new prompt
//   20 = BLOCKED — max retries exceeded, human intervention needed
//   30 = TIMEOUT — agent didn't respond within time limit
//   40 = RATE_LIMITED — API rate limit pauses exceeded maximum
//
// Usage:
//   node pipeline.js --project kubecommand                    # Run full pipeline
//   node pipeline.js --project kubecommand --module 06        # Run specific module
//   node pipeline.js --project kubecommand --resume           # Resume from last state
//   node pipeline.js --project kubecommand --status           # Print current status
//   node pipeline.js --project kubecommand --dry-run          # Show what would happen
//   node pipeline.js --project kubecommand --blueprint 06     # Release blueprint only
//   node pipeline.js --project kubecommand --blueprint-list   # List available blueprints
//
// Agent lifecycle:
//   On PASS  → agent session is destroyed, new one spawned for next module
//   On FAIL  → agent session is destroyed, Nova analyzes, new one spawned for retry
//   On TIMEOUT → agent session is destroyed, treated as FAIL
//
//   Rationale: fresh agents with better prompts outperform stale agents with
//   polluted context windows. Kill-and-respawn is always the correct strategy.
//
// =============================================================================

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// ─── Safe Execution Wrappers ─────────────────────────────────────────────────
// All external commands go through these wrappers. Arguments are passed as
// arrays to execFileSync, which bypasses the shell entirely and makes
// command injection impossible — even if LLM-generated content contains
// shell metacharacters like $(), backticks, semicolons, or pipes.

/**
 * Run a git command safely. Arguments are passed as an array.
 * @param {string} repoRoot - Path to the git repository
 * @param {string[]} args - Git subcommand and arguments
 * @param {object} opts - Options for execFileSync
 * @returns {string} stdout (trimmed)
 */
function gitExec(repoRoot, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 };
  const result = execFileSync('git', ['-C', repoRoot, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

/**
 * Run a node script safely with arguments as array.
 * @param {string} scriptPath - Path to the .js file
 * @param {string[]} args - Script arguments
 * @param {object} opts - Options for execFileSync
 * @returns {string} stdout (trimmed)
 */
function nodeExec(scriptPath, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 };
  const result = execFileSync('node', [scriptPath, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

/**
 * Run curl safely for webhook delivery.
 * @param {string} url - Webhook URL
 * @param {string} jsonPayload - JSON string to POST
 * @param {object} opts - Options for execFileSync
 */
function curlPost(url, jsonPayload, opts = {}) {
  execFileSync('curl', [
    '-s', '-X', 'POST',
    '-H', 'Content-Type: application/json',
    '-d', jsonPayload,
    url,
  ], { stdio: 'ignore', timeout: 10000, ...opts });
}

// ─── Gateway Tool API ────────────────────────────────────────────────────────
// ACP sessions (Forge, Echo) are managed through the Gateway's Tool API.
// This is the only supported programmatic interface — `openclaw sessions spawn`
// does NOT exist as a CLI command (verified via --help).
//
// Docs: https://docs.openclaw.ai/concepts/session-tool
//       https://docs.openclaw.ai/tools/acp-agents

const GATEWAY_URL   = 'http://127.0.0.1:18789/tools/invoke';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

/**
 * Invoke a Gateway tool via HTTP POST.
 * Used for sessions_spawn, sessions_send, session_status.
 *
 * @param {string} tool - Tool name (e.g. 'sessions_spawn')
 * @param {object} args - Tool arguments
 * @param {number} timeoutMs - HTTP timeout in ms (default 30s)
 * @param {object} opts - Optional top-level fields merged into request body (e.g. { sessionKey })
 * @param {object} extraHeaders - Additional HTTP headers (e.g. Discord context for thread-bound spawns)
 * @returns {Promise<object>} Parsed JSON response
 */
async function gatewayInvoke(tool, args, timeoutMs = 30000, opts = {}, extraHeaders = {}) {
  const maxRetries = 3;
  const retryDelayMs = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(GATEWAY_TOKEN ? { 'Authorization': `Bearer ${GATEWAY_TOKEN}` } : {}),
          ...extraHeaders,
        },
        body: JSON.stringify({ tool, args, ...opts }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        const err = new Error(`Gateway ${tool} failed: ${response.status} ${response.statusText}`);
        err.httpStatus = response.status;
        err.httpBody = text;
        throw err;  // HTTP errors are not retried — they're application-level
      }

      try { return JSON.parse(text); } catch { return { raw: text }; }
    } catch (e) {
      clearTimeout(timer);

      // Only retry on transient network errors (fetch failed, ECONNREFUSED, abort/timeout)
      const isNetworkError = !e.httpStatus && (
        e.name === 'AbortError' ||
        e.code === 'ECONNREFUSED' ||
        e.code === 'ECONNRESET' ||
        e.code === 'ETIMEDOUT' ||
        e.cause?.code === 'ECONNREFUSED' ||
        e.cause?.code === 'ECONNRESET' ||
        /fetch failed|network|socket/i.test(e.message)
      );

      if (!isNetworkError || attempt >= maxRetries) throw e;

      log('WARN', `Gateway ${tool} network error (attempt ${attempt}/${maxRetries}): ${e.message} — retrying in ${retryDelayMs / 1000}s`);
      await sleep(retryDelayMs);
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Path Validation ─────────────────────────────────────────────────────────
// Dynamic script paths from config (redis_js_path, memory_js_path) are validated
// against an allowlist of prefixes. This prevents code execution via path traversal
// if config is ever modified by an untrusted source.

const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];

function validateSafePath(filePath, label) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`${label}: path is empty or not a string`);
  }
  // path.resolve() produces an absolute path with all '..' segments resolved.
  // The prefix allowlist below is the actual security boundary.
  const normalized = path.resolve(filePath);
  const allowed = ALLOWED_PATH_PREFIXES.some(prefix => normalized.startsWith(prefix));
  if (!allowed) {
    throw new Error(
      `${label}: path '${normalized}' not in allowed prefixes [${ALLOWED_PATH_PREFIXES.join(', ')}]. ` +
      `Update ALLOWED_PATH_PREFIXES in pipeline.js if this is intentional.`
    );
  }
  return normalized;
}

// ─── Temp Directory Management ───────────────────────────────────────────────
// One temp directory per pipeline run. Cleaned up on exit (including crashes).
// All temp files (prompts, payloads, dispatch scripts) live here.

let _tmpDir = null;

function initTempDir() {
  _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-pipeline-'));
  log('INFO', `Temp directory created: ${_tmpDir}`);
  // Guarantee cleanup on ANY exit — process.exit(), normal end, unhandled exceptions.
  // This makes the manual cleanupTempDir() calls throughout the code a nice-to-have
  // rather than a requirement. Even if a code path forgets to call it, cleanup happens.
  process.on('exit', cleanupTempDir);
  return _tmpDir;
}

function cleanupTempDir() {
  if (_tmpDir && fs.existsSync(_tmpDir)) {
    try {
      fs.rmSync(_tmpDir, { recursive: true, force: true });
      log('INFO', `Temp directory cleaned: ${_tmpDir}`);
    } catch (e) {
      log('WARN', `Temp directory cleanup failed: ${e.message}`);
    }
  }
}

function tmpFile(prefix, moduleId = '', ext = '.tmp') {
  if (!_tmpDir) initTempDir();
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join(_tmpDir, `${prefix}-${moduleId}-${ts}-${rand}${ext}`);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_NEEDS_NOVA = 10;
const EXIT_BLOCKED = 20;
const EXIT_TIMEOUT = 30;
const EXIT_RATE_LIMITED = 40;

const STATUS = {
  PENDING:            'PENDING',
  IN_PROGRESS:        'IN_PROGRESS',
  READY_FOR_TESTING:  'READY_FOR_TESTING',
  TESTING:            'TESTING',
  PASS:               'PASS',
  FAIL:               'FAIL',
  BLOCKED:            'BLOCKED',
  RATE_LIMITED:       'RATE_LIMITED',
};

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
// Track active ACP sessions so we can clean up on SIGTERM/SIGINT.
// Map supports multiple concurrent sessions (e.g. module agent + gate fix agent).
// Map: label → childSessionKey (from sessions_spawn response)

let _shutdownState = {
  config: null,
  statusDir: null,       // Module status dir (for marking FAIL on interrupt)
  activeSessions: new Map(), // label → { sessionKey, agentId, gatewayLabel }
  currentLabel: null,    // Label added by setShutdownContext (for clearShutdownContext cleanup)
};

/**
 * Synchronous Gateway kill via curl — used only in shutdown handler.
 * Normal operations use async gatewayInvoke() instead.
 */
function gatewayKillSync(sessionKey) {
  try {
    const payload = JSON.stringify({
      tool: 'sessions_send',
      args: { sessionKey, message: '/stop' },
    });
    execFileSync('curl', [
      '-s', '-X', 'POST',
      '-H', 'Content-Type: application/json',
      ...(GATEWAY_TOKEN ? ['-H', `Authorization: Bearer ${GATEWAY_TOKEN}`] : []),
      '-d', payload,
      GATEWAY_URL,
    ], { stdio: 'ignore', timeout: 10000 });
  } catch { /* best effort — gateway may be unreachable during shutdown */ }
}

/**
 * Clean up acpx internal session tracking.
 * acpx tracks sessions in ~/.acpx/sessions/index.json — sending /stop via Gateway
 * kills the OpenClaw session but doesn't clean up acpx's internal state.
 * Without this, session slots fill up and new spawns fail.
 */
function acpxCleanupSync(agentId, gatewayLabel) {
  if (!agentId || !gatewayLabel) return;
  try {
    execFileSync('acpx', [agentId, 'sessions', 'close', '--name', gatewayLabel],
      { stdio: 'ignore', timeout: 10000 });
  } catch { /* best effort */ }
}

async function acpxCleanup(agentId, gatewayLabel) {
  if (!agentId || !gatewayLabel) return;
  try {
    execFileSync('acpx', [agentId, 'sessions', 'close', '--name', gatewayLabel],
      { stdio: 'ignore', timeout: 10000 });
    log('DEBUG', `acpx session closed: ${agentId} / ${gatewayLabel}`);
  } catch {
    log('DEBUG', `acpx session close failed (non-critical): ${agentId} / ${gatewayLabel}`);
  }
}

/**
 * Parse session state from a session_status response.
 * Handles both the legacy format (acp.state field) and the new format
 * (statusText with "Queue: running" / "Queue: collect").
 *
 * @param {object} statusResult - Parsed session_status response (result.details or raw)
 * @returns {{ active: boolean, state: string }} - active=true if session is working
 */
function parseSessionState(statusResult) {
  if (!statusResult) return { active: false, state: 'unknown' };

  // Legacy format: acp.state field
  const acpState = statusResult?.acp?.state || statusResult?.state || null;
  if (acpState) {
    const active = /^(running|creating|cancelling)$/i.test(acpState);
    return { active, state: acpState.toLowerCase() };
  }

  // New format: statusText contains queue state
  const statusText = statusResult?.statusText || '';
  if (statusText) {
    if (/Queue:\s*running/i.test(statusText)) {
      return { active: true, state: 'running' };
    }
    if (/Queue:\s*collect/i.test(statusText)) {
      return { active: false, state: 'idle' };
    }
    // statusText exists but no recognized pattern — session exists but state unclear
    // Conservative: treat as inactive (oneshot sessions auto-close)
    return { active: false, state: `unknown (${statusText.slice(0, 80)})` };
  }

  // No state info at all — session gone or format unrecognized
  return { active: false, state: 'unknown' };
}

/**
 * Wait for an ACP session to become idle before killing.
 * Gives the agent time to write a thread summary after completing work.
 *
 * Flow: poll session_status every 10s → once idle → wait extraGraceMs → return.
 * If session is already closed/error → return immediately.
 * If totalTimeoutMs exceeded → return (caller will force-kill).
 *
 * @param {string} sessionKey - Gateway childSessionKey
 * @param {number} extraGraceMs - Extra time after idle detected (default 2min)
 * @param {number} totalTimeoutMs - Max total wait time (default 10min)
 */
async function waitForSessionIdle(sessionKey, extraGraceMs = 120000, totalTimeoutMs = 600000) {
  const deadline = Date.now() + totalTimeoutMs;
  const pollMs = 10000;

  while (Date.now() < deadline) {
    try {
      const raw = await gatewayInvoke('session_status', {}, 10000, { sessionKey });
      const statusResult = raw?.result?.details || raw;
      const { active, state } = parseSessionState(statusResult);

      if (state === 'unknown' || /^(closed|error)$/i.test(state)) {
        log('DEBUG', `Session already ${state} — no grace needed`);
        return;
      }

      if (!active) {
        log('DEBUG', `Session ${state} — waiting ${extraGraceMs / 1000}s grace period for thread summary`);
        await sleep(Math.min(extraGraceMs, deadline - Date.now()));
        return;
      }

      // Still running/creating — keep waiting
    } catch {
      // Session unreachable — treat as gone
      return;
    }

    await sleep(pollMs);
  }

  log('DEBUG', `Grace timeout (${totalTimeoutMs / 1000}s) — proceeding with kill`);
}

function registerShutdownHooks() {
  const handler = (signal) => {
    log('WARN', `Received ${signal} — initiating graceful shutdown`);
    const { config, statusDir, activeSessions } = _shutdownState;

    // Kill ALL tracked ACP sessions via Gateway Tool API (best effort)
    if (config && activeSessions.size > 0) {
      for (const [label, entry] of activeSessions) {
        const sessionKey = entry?.sessionKey || entry; // backward compat if string
        if (!sessionKey) continue;  // Pre-tracked but spawn not yet completed
        gatewayKillSync(sessionKey);
        acpxCleanupSync(entry?.agentId, entry?.gatewayLabel);
        log('INFO', `Shutdown: killed session '${label}' (${sessionKey})`);
      }
    }

    // Mark current module as FAIL so resume works correctly
    if (config && statusDir) {
      try {
        const status = loadStatus(config, statusDir);
        if (status && ![STATUS.PASS, STATUS.BLOCKED].includes(status.status)) {
          addHistory(status, STATUS.FAIL, 'pipeline', `Interrupted by ${signal}`);
          status.status = STATUS.FAIL;
          status.current_phase = null;
          saveStatus(config, statusDir, status);
        }
      } catch { /* best effort */ }
    }

    cleanupTempDir();
    process.exit(EXIT_ERROR);
  };
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
}

/**
 * Track an ACP session for graceful shutdown and acpx cleanup.
 * @param {object} config - Pipeline config
 * @param {string} label - Deterministic tracking key (e.g. 'forge-02')
 * @param {string} sessionKey - Gateway childSessionKey from sessions_spawn
 * @param {string} agentId - Harness name (e.g. 'claude', 'codex') for acpx cleanup
 * @param {string} gatewayLabel - Unique label sent to Gateway for acpx session close
 */
function trackAgent(config, label, sessionKey, agentId, gatewayLabel, streamLogPath = null) {
  _shutdownState.config = config;
  _shutdownState.activeSessions.set(label, { sessionKey, agentId, gatewayLabel, streamLogPath });
}

/**
 * Stop tracking an ACP session (after kill).
 */
function untrackAgent(label) {
  _shutdownState.activeSessions.delete(label);
}

/**
 * Set module-level shutdown context (for status.json FAIL marking).
 * Also pre-tracks the module's agent label (sessionKey added later by trackAgent after spawn).
 */
function setShutdownContext(config, agentType, moduleId, statusDir) {
  _shutdownState.config = config;
  _shutdownState.statusDir = statusDir;
  // Only track ACP agents — Redis agents can't be killed by sessionKey
  const agentConf = config.agents?.[agentType];
  if (!agentConf || agentConf.dispatch !== 'redis') {
    const label = acpLabel(agentType, moduleId);
    // Pre-set with null sessionKey — updated by trackAgent after spawn succeeds
    if (!_shutdownState.activeSessions.has(label)) {
      _shutdownState.activeSessions.set(label, { sessionKey: null, agentId: null, gatewayLabel: null, streamLogPath: null });
    }
    _shutdownState.currentLabel = label;
  } else {
    _shutdownState.currentLabel = null;
  }
}

/**
 * Clear module-level shutdown context after module attempt completes.
 * Removes the current module's agent label from tracking.
 * Safe to call even if killAgent already removed it (Map.delete is idempotent).
 */
function clearShutdownContext() {
  if (_shutdownState.currentLabel) {
    _shutdownState.activeSessions.delete(_shutdownState.currentLabel);
    _shutdownState.currentLabel = null;
  }
  _shutdownState.statusDir = null;
  // Don't clear config — gate agents may still need it.
}

// ─── Structured Logging ──────────────────────────────────────────────────────
// JSON lines to stderr — parseable by Mission Control, log aggregators, etc.
// stdout is reserved for pipeline output JSON (Nova parses this).
//
// Each log entry: { ts, level, run_id, module?, phase?, msg, data? }
// The run_id correlates all log lines from a single pipeline invocation.

const RUN_ID = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let LOG_MODULE = null;  // Set when entering a module context
let LOG_PHASE = null;   // Set when entering a phase (forge/buster)

function log(level, msg, data = null) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    run_id: RUN_ID,
    ...(LOG_MODULE && { module: LOG_MODULE }),
    ...(LOG_PHASE && { phase: LOG_PHASE }),
    msg,
    ...(data !== null && { data }),
  };
  console.error(JSON.stringify(entry));
}

function output(result) {
  console.log(JSON.stringify(result, null, 2));
}

// ─── Config & File Helpers ───────────────────────────────────────────────────

/**
 * Load and merge platform config (swarm.config.json) with project config (progress.json).
 *
 * Two sources, clear separation:
 *   swarm.config.json -- platform-level (agents, discord, memory, polling, defaults)
 *   progress.json     -- project-level (modules, gates, execution_order, phases)
 *
 * Paths are derived from convention, not configured:
 *   swarm_dir     = <repoRoot>/Projects/<project>/src/.swarm
 *   modules_dir   = <swarm_dir>/modules
 *   progress_file = <swarm_dir>/progress.json
 *
 * @param {string} projectName - Project identifier (e.g. 'kubecommand')
 * @returns {{ config: object, progress: object }}
 */
function loadConfig(projectName, opts = {}) {
  if (!projectName) {
    throw new Error(
      'Project name required. Use --project <n> or set CURRENT_PROJECT env.'
    );
  }

  // Resolve repo root: --repo flag > REPO_ROOT env > git rev-parse (CWD fallback)
  let repoRoot = opts.repoRoot || process.env.REPO_ROOT || null;
  if (repoRoot) {
    repoRoot = path.resolve(repoRoot);
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
      throw new Error(`Repo root '${repoRoot}' is not a git repository (no .git directory)`);
    }
    log('INFO', `Repo root from ${opts.repoRoot ? '--repo flag' : 'REPO_ROOT env'}: ${repoRoot}`);
  } else {
    try {
      repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    } catch {
      throw new Error(
        'Cannot determine repo root. Either:\n' +
        '  --repo <path>        Pass the repo path explicitly\n' +
        '  REPO_ROOT=<path>     Set as environment variable\n' +
        '  cd <repo>            Run from within the git repo'
      );
    }
  }

  // Load swarm.config.json (platform-level)
  const swarmConfigPath = process.env.SWARM_CONFIG || '/app/config/swarm.config.json';
  if (!fs.existsSync(swarmConfigPath)) {
    throw new Error(
      `Swarm config not found: ${swarmConfigPath}\n` +
      `  Set SWARM_CONFIG env or place at /app/config/swarm.config.json`
    );
  }
  const swarmConfig = JSON.parse(fs.readFileSync(swarmConfigPath, 'utf8'));

  // Derive paths from convention: Projects/<project>/src/.swarm/
  const swarmDir = path.join(repoRoot, 'Projects', projectName, 'src', '.swarm');
  const progressFile = path.join(swarmDir, 'progress.json');
  const modulesDir = path.join(swarmDir, 'modules');

  // Load progress.json (project-level)
  if (!fs.existsSync(progressFile)) {
    throw new Error(
      `Progress file not found: ${progressFile}\n` +
      `  Expected at: <repo>/Projects/${projectName}/src/.swarm/progress.json`
    );
  }
  const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));

  // Merge into unified config object.
  // Base: swarm.config.json (platform defaults).
  // Overlays: project identity + derived paths.
  const config = {
    ...swarmConfig,
    project: projectName,
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
      progress_file: progressFile,
    },
  };

  // Set module-level _repoRoot so headHash() can use gitExec
  // even in contexts where config isn't passed (e.g. addHistory -> headHash).
  _repoRoot = config.repo_root;

  // Discord webhook: swarm.config.json (explicit) > DISCORD_WEBHOOK env (K8s secret)
  if (!config.discord_webhook_url && process.env.DISCORD_WEBHOOK) {
    config.discord_webhook_url = process.env.DISCORD_WEBHOOK;
  }

  // Validate merged config (fail fast instead of cryptic TypeError later)
  validateConfig(config, progress);

  return { config, progress };
}

/**
 * Validate merged config (swarm.config + project overrides) and progress.
 * Fails fast at startup with a clear error message instead of
 * cryptic TypeErrors deep in the pipeline.
 *
 * @param {object} config - Merged config (swarm.config + derived paths)
 * @param {object} progress - Project progress (modules, gates, execution_order)
 */
function validateConfig(config, progress) {
  const errors = [];

  const requireField = (obj, fieldPath, parentPath = 'config') => {
    const keys = fieldPath.split('.');
    let current = obj;
    let currentPath = parentPath;
    for (const key of keys) {
      currentPath = `${currentPath}.${key}`;
      if (current === null || current === undefined || typeof current !== 'object') {
        errors.push(`${currentPath}: parent is ${current === null ? 'null' : typeof current}`);
        return;
      }
      current = current[key];
    }
    if (current === undefined || current === null) {
      errors.push(`${currentPath}: required field is missing`);
    }
  };

  // ---- Config fields (from swarm.config.json + loadConfig merge) ----
  requireField(config, 'project');
  requireField(config, 'repo_root');
  requireField(config, 'paths');
  requireField(config, 'paths.swarm_dir');
  requireField(config, 'paths.progress_file');
  requireField(config, 'paths.modules_dir');
  requireField(config, 'agents');
  requireField(config, 'agents.forge');
  requireField(config, 'agents.buster');

  // Buster is ALWAYS Redis-dispatched (isolated pod with Podman sandbox).
  // This is architectural — Buster cannot run as an ACP subagent of Nova.
  config.agents.buster.dispatch = 'redis';
  config.agents.buster.redis_js_path ??= '/app/skills/redis.js';

  // models section: optional in config (progress.json can provide project-level defaults)
  // but at least one source must exist — validated at runtime when resolveModel() is called.
  config.models ??= {};

  // Agent dispatch validation
  for (const [name, agentConf] of Object.entries(config.agents || {})) {
    if (typeof agentConf !== 'object' || agentConf === null) continue;
    if (name.startsWith('_')) continue; // skip _doc fields
    if (!agentConf.dispatch) {
      errors.push(`config.agents.${name}.dispatch: required ('acp' or 'redis')`);
    }
    if (agentConf.dispatch === 'redis' && !agentConf.redis_js_path) {
      errors.push(`config.agents.${name}.redis_js_path: required for redis dispatch agents`);
    }
  }

  // Defaults (set if missing, don't error)
  // ??= only fills null/undefined — explicit 0 is preserved (e.g. max_fails: 0 = "never retry")
  config.poll_interval_seconds ??= 30;
  config.default_timeout_minutes ??= 45;
  config.default_max_fails ??= 3;

  // ---- Progress fields ----
  requireField(progress, 'project', 'progress');
  requireField(progress, 'execution_order', 'progress');
  requireField(progress, 'modules', 'progress');

  // Gate type validation
  const validGateTypes = ['buster', 'review'];
  const validOnNogo = ['fix_and_continue', 'fix_and_rereview'];
  const validOnFail = ['fix_and_retest'];

  for (const [gateId, gate] of Object.entries(progress.gates || {})) {
    if (!gate.type) {
      errors.push(`progress.gates.${gateId}.type: required (${validGateTypes.join(' | ')})`);
    } else if (!validGateTypes.includes(gate.type)) {
      errors.push(`progress.gates.${gateId}.type: '${gate.type}' not valid (${validGateTypes.join(' | ')})`);
    }

    if (gate.type === 'review') {
      if (!gate.review_name) errors.push(`progress.gates.${gateId}.review_name: required for review gates`);
      if (!gate.instructions_file) errors.push(`progress.gates.${gateId}.instructions_file: required`);
      if (!gate.output_file) errors.push(`progress.gates.${gateId}.output_file: required for review gates (findNextStep uses it as completion signal)`);
      if (!gate.on_nogo) {
        errors.push(`progress.gates.${gateId}.on_nogo: required (${validOnNogo.join(' | ')})`);
      } else if (!validOnNogo.includes(gate.on_nogo)) {
        errors.push(`progress.gates.${gateId}.on_nogo: '${gate.on_nogo}' not valid`);
      }
    }

    if (gate.type === 'buster') {
      if (!gate.instructions_file) errors.push(`progress.gates.${gateId}.instructions_file: required`);
      if (!gate.output_file) errors.push(`progress.gates.${gateId}.output_file: required for buster gates (primary completion signal)`);
      if (gate.on_fail && !validOnFail.includes(gate.on_fail)) {
        errors.push(`progress.gates.${gateId}.on_fail: '${gate.on_fail}' not valid`);
      }
    }
  }

  // Cross-reference: execution_order items must exist in modules or gates
  for (const step of progress.execution_order || []) {
    if (step.startsWith('gate:')) {
      const gateId = step.replace('gate:', '');
      if (!progress.gates?.[gateId]) {
        errors.push(`progress.execution_order: gate '${gateId}' not defined in gates`);
      }
    } else {
      if (!progress.modules?.[step]) {
        errors.push(`progress.execution_order: module '${step}' not defined in modules`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n  ${errors.join('\n  ')}`);
  }

  // Validate dynamic script paths (security)
  for (const [name, agentConf] of Object.entries(config.agents || {})) {
    if (typeof agentConf !== 'object' || agentConf === null) continue;
    if (name.startsWith('_')) continue;
    if (agentConf.redis_js_path) {
      validateSafePath(agentConf.redis_js_path, `config.agents.${name}.redis_js_path`);
    }
  }
  if (config.memory?.memory_js_path) {
    validateSafePath(config.memory.memory_js_path, 'config.memory.memory_js_path');
  }
}

/**
 * Load progress from config paths.
 * Kept for export compatibility (Nova may import this).
 * Primary path: loadConfig() returns { config, progress } directly.
 */
function loadProgress(config) {
  const p = config.paths.progress_file;
  if (!fs.existsSync(p)) throw new Error(`Progress file not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function modulePath(config, dir)   { return path.join(config.paths.modules_dir, dir); }
function statusPath(config, dir)   { return path.join(modulePath(config, dir), 'status.json'); }
function swarmRoot(config)         { return config.paths.swarm_dir; }

/** Project source root — where agents should read/write code. Derived from swarm_dir (parent of .swarm). */
function projectSrcPath(config)    { return path.dirname(config.paths.swarm_dir); }

/** Convert absolute path back to repo-relative (for git commands and payloads) */
function relPath(config, absPath)  { return path.relative(config.repo_root, absPath); }

/** Redis stream key for Buster completion signals */
function completionStreamKey(config) {
  return `swarm:pipeline:${config.project}:completions`;
}

/**
 * Save a prompt to disk for debugging/analysis.
 * Path: .swarm/modules/<dir>/prompts/<runId>/<agent>-attempt-<N>.md
 * Best-effort — failure is logged but never blocks the pipeline.
 */
function savePrompt(config, dir, agentType, attempt, prompt) {
  try {
    const promptDir = path.join(modulePath(config, dir), 'prompts', RUN_ID);
    fs.mkdirSync(promptDir, { recursive: true });
    const filePath = path.join(promptDir, `${agentType}-attempt-${attempt}.md`);
    fs.writeFileSync(filePath, prompt);
    log('DEBUG', `Prompt saved: ${relPath(config, filePath)} (${prompt.length} chars)`);
  } catch (e) {
    log('DEBUG', `Prompt save failed (non-critical): ${e.message}`);
  }
}

/**
 * Copy ACP stream log (JSONL) from the gateway's streamLogPath into the
 * module's .swarm streams directory for post-mortem analysis and git persistence.
 *
 * Directory: .swarm/modules/<dir>/streams/<RUN_ID>/
 *
 * Called after session ends (in pollStatus / pollForSessionEnd).
 * Non-critical — failure is logged but never blocks the pipeline.
 *
 * @param {object} config - Pipeline config
 * @param {string} dir - Module directory (e.g. '08-git-build-pipeline')
 * @param {string} agentType - 'forge', 'buster', or 'echo'
 * @param {number} attempt - Current attempt number
 * @param {string} streamLogPath - Absolute path to the JSONL stream file
 */
function saveStreamLog(config, dir, agentType, attempt, streamLogPath) {
  if (!streamLogPath) return;
  try {
    if (!fs.existsSync(streamLogPath)) {
      log('DEBUG', `Stream log not found: ${streamLogPath}`);
      return;
    }
    const streamDir = path.join(modulePath(config, dir), 'streams', RUN_ID);
    fs.mkdirSync(streamDir, { recursive: true });
    const destPath = path.join(streamDir, `${agentType}-stream-attempt-${attempt}.jsonl`);
    fs.copyFileSync(streamLogPath, destPath);
    const size = fs.statSync(destPath).size;
    log('OK', `Stream log saved: ${relPath(config, destPath)} (${(size / 1024).toFixed(1)} KB)`);
  } catch (e) {
    log('DEBUG', `Stream log save failed (non-critical): ${e.message}`);
  }
}

/**
 * Resolve model for an agent with three-level fallback:
 *   1. Explicit override (per-module forge_model, per-gate model, per-reviewer model)
 *   2. progress.json project-level (progress.models.<agent>)
 *   3. swarm.config platform-level (config.models.<agent>)
 *
 * @param {string} agentType - 'forge', 'buster', or 'echo'
 * @param {object} config - Platform config (swarm.config.json)
 * @param {object} progress - Project config (progress.json)
 * @param {string} [override] - Explicit override (e.g. mod.forge_model, gate.model)
 * @returns {string} Resolved model string
 */
function resolveModel(agentType, config, progress, override) {
  const model = override ?? progress.models?.[agentType] ?? config.models?.[agentType];
  if (!model) {
    throw new Error(`No model configured for '${agentType}'. Set it in progress.json (models.${agentType}) or swarm.config.json (models.${agentType}).`);
  }
  return model;
}

function loadStatus(config, dir) {
  const p = statusPath(config, dir);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));

    // Defensive defaults for safety-critical fields. If an agent overwrites
    // status.json with a minimal object (e.g. { "status": "FAIL", "reason": "..." }),
    // the pipeline would crash on .push(), .map(), .length, or ++ of missing fields.
    // Spread preserves any existing values; defaults only fill gaps.
    const STATUS_DEFAULTS = {
      fail_summaries: [],
      fail_count: 0,
      history: [],
      decayed_memory_ids: [],
      cost: {
        forge_tokens_in: 0, forge_tokens_out: 0,
        buster_tokens_in: 0, buster_tokens_out: 0,
        total_duration_seconds: 0,
      },
    };

    return { ...STATUS_DEFAULTS, ...parsed };
  } catch (e) {
    // JSON parse can fail due to:
    // - Git merge conflict markers in the file
    // - Partial write (agent was mid-commit)
    // - File corruption
    // Return null so the polling loop treats it as "status not ready yet"
    // Log file content preview so we can distinguish partial-write (normal) from real bugs
    let preview = '';
    try { preview = fs.readFileSync(p, 'utf8').slice(0, 200); } catch { /* unreadable */ }
    log('WARN', `status.json parse failed (${dir}): ${e.message} — treating as not ready`, { preview });
    return null;
  }
}

function saveStatus(config, dir, status) {
  const p = statusPath(config, dir);
  const tmp = p + '.tmp';
  status.updated_at = new Date().toISOString();
  // Atomic write: write to temp file, then rename.
  // rename() is atomic on POSIX when src and dst are on the same filesystem.
  // This prevents partial-read scenarios where another process (Forge, Buster, polling)
  // reads a half-written JSON file.
  fs.writeFileSync(tmp, JSON.stringify(status, null, 2) + '\n');
  fs.renameSync(tmp, p);
  gitCommitQuiet(config, p, `[pipeline] ${status.module_id} → ${status.status}`);
}

function gitCommitQuiet(config, filePath, message) {
  try {
    gitExec(config.repo_root, ['add', filePath], { stdio: 'ignore' });
    gitExec(config.repo_root, ['commit', '-m', message], { stdio: 'ignore' });
    invalidateHeadHash();
  } catch (e) {
    // "nothing to commit" is normal when status didn't actually change
    // (e.g. saveStatus wrote identical content, or gitPullForPolling already has it).
    // Silently ignore — no empty commits, no false alarms.
    if (/nothing to commit|no changes added/i.test(e.message)) return;

    // Real commit failure — status.json is on disk but NOT in git.
    // This can cause issues on the next `git pull --rebase` (untracked file conflicts).
    const reason = e.message?.split('\n')[0] || 'unknown';
    log('WARN', `Git commit failed for status update — file on disk but not in git: ${reason}`);
    discord(config, 'WARN', 'Git Commit Failed',
      `Status update could not be committed: ${reason}`).catch(() => {});
  }
}

/**
 * Git pull with context-sensitive rebase abort recovery.
 *
 * Two public functions — use the one that matches your context:
 *
 *   gitPullForPolling(config)
 *     During status polling loops. No local work is at risk — if rebase
 *     conflicts occur, abort and reset --hard to origin. This is safe because
 *     the pipeline only READS status.json during polling; Forge/Buster own
 *     the commits.
 *
 *   gitPullBeforePush(config)
 *     Before git push (Forge→Buster handoff, blueprint release, gate fix).
 *     Local commits exist that must NOT be lost. If rebase conflicts occur,
 *     throw an error instead of resetting. The caller handles the error
 *     (typically: retry the module).
 *
 * @private
 */
function _gitPullCore(config, allowDestructiveRecovery) {
  try {
    gitExec(config.repo_root, ['pull', '--rebase', '--quiet'], { stdio: 'ignore' });
    invalidateHeadHash();
  } catch (e) {
    const msg = e.message || '';

    // Check if we're stuck in a rebase
    const rebaseDir = path.join(config.repo_root, '.git', 'rebase-merge');
    const rebaseApplyDir = path.join(config.repo_root, '.git', 'rebase-apply');
    const isRebasing = fs.existsSync(rebaseDir) || fs.existsSync(rebaseApplyDir);

    if (isRebasing) {
      log('WARN', 'Git pull left repo in REBASING state — aborting rebase');
      try {
        gitExec(config.repo_root, ['rebase', '--abort'], { stdio: 'ignore' });

        if (allowDestructiveRecovery) {
          const branch = gitExec(config.repo_root, ['branch', '--show-current']).trim();
          if (branch) {
            log('WARN', `Performing destructive reset to origin/${branch} — any unpushed local commits will be lost`);
            gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' });
            gitExec(config.repo_root, ['reset', '--hard', `origin/${branch}`], { stdio: 'ignore' });
            invalidateHeadHash();
            log('OK', `Rebase aborted — reset to origin/${branch}`);
          } else {
            log('OK', 'Rebase aborted — detached HEAD, skipping reset');
          }
        } else {
          throw new Error(
            `Git rebase conflict detected before push. Aborting to prevent local data loss.\n` +
            `  Recovery:\n` +
            `    cd ${config.repo_root}\n` +
            `    git rebase --abort\n` +
            `    git pull --rebase origin HEAD\n` +
            `  Then resume the pipeline:\n` +
            `    node pipeline.js --project ${config.project} --resume`
          );
        }
      } catch (abortErr) {
        log('ERROR', `Rebase recovery failed: ${abortErr.message?.split('\n')[0]}`);
        if (!allowDestructiveRecovery) throw abortErr;
      }
    } else {
      log('DEBUG', `Git pull failed (non-rebase): ${msg.split('\n')[0]}`);
    }
  }
}

/** Pull during polling loops — destructive recovery allowed (no local work at risk). */
function gitPullForPolling(config) {
  _gitPullCore(config, true);
}

/** Pull before push — throws on conflict to protect local commits. */
function gitPullBeforePush(config) {
  _gitPullCore(config, false);
}

/**
 * Push to origin with retry for transient failures (network timeouts,
 * SSH drops, remote temporarily unavailable).
 * @param {object} config - Pipeline config
 * @param {number} maxRetries - Number of attempts (default: 3)
 * @param {number} delayMs - Delay between retries in ms (default: 5000)
 */
async function gitPushWithRetry(config, maxRetries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      gitExec(config.repo_root, ['push', 'origin', 'HEAD'], { stdio: 'ignore', timeout: 60000 });
      return;
    } catch (e) {
      if (attempt === maxRetries) throw e;
      log('WARN', `git push failed (attempt ${attempt}/${maxRetries}): ${e.message?.split('\n')[0]}`);
      await sleep(delayMs);
    }
  }
}

/**
 * Unified git add → commit → pull-before-push → push with retry.
 * Replaces scattered git-sync logic across gitSyncBeforeBuster, releaseBlueprint,
 * and gate-fix. Ensures consistent behavior: invalidateHeadHash always called,
 * push always retried, hash optionally captured.
 *
 * @param {object} config - Pipeline config
 * @param {string} message - Commit message
 * @param {object} opts
 * @param {string[]} opts.addPaths - Paths to git add (default: ['-A'])
 * @param {boolean} opts.captureHash - Return commit hash after push (default: false)
 * @param {boolean} opts.softFail - Log warning instead of throwing on error (default: false)
 * @returns {{ committed: boolean, hash?: string }}
 */
async function gitCommitAndPush(config, message, { addPaths = ['-A'], captureHash = false, softFail = false } = {}) {
  try {
    gitExec(config.repo_root, ['add', ...addPaths], { stdio: 'ignore' });

    const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
    if (!porcelain) {
      log('INFO', 'No uncommitted changes — nothing to push');
      return { committed: false };
    }

    gitExec(config.repo_root, ['commit', '-m', message], { stdio: 'ignore' });
    invalidateHeadHash();
    gitPullBeforePush(config);
    await gitPushWithRetry(config);

    const hash = captureHash ? gitExec(config.repo_root, ['rev-parse', 'HEAD']) : null;
    // No invalidateHeadHash here — rev-parse reads HEAD, doesn't change it.
    // The invalidation after commit (above) is sufficient.

    log('OK', `Committed and pushed: ${message.slice(0, 60)}${hash ? ` (${hash.substring(0, 8)})` : ''}`);
    return { committed: true, hash };
  } catch (e) {
    if (softFail) {
      log('WARN', `Git commit+push failed (soft): ${e.message?.split('\n')[0]}`);
      return { committed: false, error: e.message };
    }
    throw e;
  }
}

// ─── Git Hash Cache ──────────────────────────────────────────────────────────
// Avoid spawning `git rev-parse --short HEAD` on every addHistory call.
// Invalidated after any git operation that changes HEAD.
// Uses _repoRoot (set by loadConfig) to go through gitExec like all other git calls.

let _headHashCache = null;
let _repoRoot = null;  // Set by loadConfig — used by headHash before config is passed around

function headHash() {
  if (_headHashCache) return _headHashCache;
  try {
    if (_repoRoot) {
      _headHashCache = gitExec(_repoRoot, ['rev-parse', '--short', 'HEAD']);
      return _headHashCache;
    }
    // Before loadConfig: _repoRoot not set yet. Return empty string rather than
    // using CWD (which could be wrong if pipeline is started from outside the repo).
    // This only affects the commit_hash in the initial PENDING history entry —
    // purely informational, no functional impact.
    return '';
  } catch { return ''; }
}

function invalidateHeadHash() {
  _headHashCache = null;
}

function addHistory(status, newStatus, agent, note) {
  status.history.push({
    timestamp: new Date().toISOString(),
    status: newStatus,
    agent,
    note: note || '',
    commit_hash: headHash(),
  });
}

function initStatus(moduleId, moduleConfig) {
  return {
    module_id: moduleId,
    title: moduleConfig.title,
    status: STATUS.PENDING,
    current_phase: null,
    fail_count: 0,
    started_at: null,
    updated_at: new Date().toISOString(),
    completed_at: null,
    substeps: moduleConfig.substeps
      ? moduleConfig.substeps.map(id => ({ id, title: id, forge_done: false }))
      : null,
    history: [{
      timestamp: new Date().toISOString(),
      status: STATUS.PENDING,
      agent: 'pipeline',
      note: 'Initialized',
      commit_hash: headHash(),
    }],
    fail_summaries: [],
    completion_summary: null,
    forge_commit_hash: null,
    forge_diff_stat: null,
    // Track which Qdrant memory IDs have already had their confidence decayed
    // for this module. Prevents the same memory from being decayed multiple times
    // across pipeline runs (the "bleed-out" problem).
    // Reset on PASS (positive feedback boosts everything back up anyway).
    decayed_memory_ids: [],
    // Cost tracking — informational only, no budget enforcement.
    // Populated by agents via status.json updates. Used for Discord reports
    // and post-mortem analysis. Token budgets are managed at the API/OAuth level.
    cost: {
      forge_tokens_in: 0, forge_tokens_out: 0,
      buster_tokens_in: 0, buster_tokens_out: 0,
      total_duration_seconds: 0,
    },
  };
}

// ─── Discord Notifications ───────────────────────────────────────────────────

async function discord(config, level, title, description, fields = []) {
  // Entire function wrapped in try/catch to prevent webhook URL leaking
  // in stack traces if any step fails (JSON.stringify, curlPost, etc.)
  try {
    if (!config.discord_webhook_url) return;
    if (!config.discord_alerts?.[level.toLowerCase()]) return;

    const colors = { INFO: 0x3498db, WARN: 0xe67e22, CRITICAL: 0xe74c3c, OK: 0x2ecc71 };
    const icons  = { INFO: 'ℹ️', WARN: '⚠️', CRITICAL: '🚨', OK: '✅' };

    const payload = {
      embeds: [{
        title: `${icons[level] || ''} ${title}`,
        description,
        color: colors[level] || 0x95a5a6,
        fields: fields.map(f => ({ name: f.name, value: String(f.value), inline: f.inline ?? true })),
        footer: { text: `KubeClaw Pipeline · ${config.project} · ${RUN_ID}` },
        timestamp: new Date().toISOString(),
      }],
    };

    curlPost(config.discord_webhook_url, JSON.stringify(payload));
  } catch {
    log('WARN', 'Discord webhook delivery failed (details suppressed for security)');
  }
}

// ─── Blueprint Manager (integrated) ─────────────────────────────────────────

function listBlueprints(config) {
  const branch = `${config.project}/architecture`;
  const dir = relPath(config, config.paths.modules_dir);

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch { /* use cache */ }

  try {
    const out = gitExec(config.repo_root, ['ls-tree', '-d', '--name-only', `origin/${branch}`, `${dir}/`]);
    return out.split('\n').filter(Boolean).map(f => path.basename(f));
  } catch (e) {
    throw new Error(`Cannot read architecture branch '${branch}': ${e.message}`);
  }
}

async function releaseBlueprint(config, progress, moduleId, moduleDir, stages = ['forge', 'buster']) {
  const branch = `${config.project}/architecture`;
  const targetPath = relPath(config, modulePath(config, moduleDir));
  const moduleConfig = progress.modules[moduleId] || {};

  log('STEP', `Releasing blueprint for ${moduleId} from ${branch}`);

  // Safety check: don't overwrite an existing non-PENDING status
  const existingStatus = loadStatus(config, moduleDir);
  if (existingStatus && existingStatus.status !== STATUS.PENDING) {
    log('WARN', `Module ${moduleId} already has status ${existingStatus.status} — skipping blueprint release`);
    return { status: 'skipped', reason: `existing status: ${existingStatus.status}`, module: moduleDir };
  }

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch { log('WARN', `Could not fetch origin/${branch}, using local cache`); }

  // Verify module has required files in architecture branch.
  // Stage-aware: only require files for configured stages.
  // Substep-aware: if module has substeps, check <stepId>/FORGE.md instead of top-level FORGE.md.
  const requiredFiles = [];
  if (stages.includes('forge')) {
    if (moduleConfig.substeps && moduleConfig.substeps.length > 0) {
      // Substep modules: FORGE.md lives inside each substep directory
      for (const stepId of moduleConfig.substeps) {
        requiredFiles.push(`${stepId}/FORGE.md`);
      }
    } else {
      requiredFiles.push('FORGE.md');
    }
  }
  if (stages.includes('buster')) requiredFiles.push('BUSTER.md');
  for (const file of requiredFiles) {
    try {
      gitExec(config.repo_root, ['cat-file', '-e', `origin/${branch}:${targetPath}/${file}`], { stdio: 'ignore' });
    } catch {
      throw new Error(`Blueprint incomplete: ${file} not found for ${moduleId} in architecture branch at ${targetPath}`);
    }
  }

  // Checkout into workspace
  try {
    gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', targetPath], { stdio: 'ignore' });
  } catch (e) {
    throw new Error(`Blueprint checkout failed: ${e.message}`);
  }

  // Commit & push
  try {
    const result = await gitCommitAndPush(config, `[blueprint] Release module ${moduleId} (${moduleDir})`, {
      addPaths: [targetPath],
    });
    if (result.committed) {
      log('OK', `Blueprint released and pushed: ${moduleDir}`);
      return { status: 'success', action: 'released', module: moduleDir };
    }
    log('INFO', `Blueprint already up to date: ${moduleDir}`);
    return { status: 'success', action: 'no_changes', module: moduleDir };
  } catch (e) {
    throw new Error(`Blueprint commit/push failed: ${e.message}`);
  }
}

/**
 * Release gate files (echo-review/, buster-test/) from the architecture branch.
 * Unlike module blueprints (released per-module on demand), gate files are released
 * once at pipeline start because gates can appear at any point in execution_order.
 *
 * Collects unique directories from gate instructions_file paths, checks them out
 * from the architecture branch, and commits in a single push.
 */
async function releaseGateFiles(config, progress) {
  const gates = progress.gates;
  if (!gates || Object.keys(gates).length === 0) return;

  const branch = `${config.project}/architecture`;

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch { log('WARN', `Could not fetch origin/${branch} for gate files`); return; }

  // Collect unique directories from gate file paths
  const gateDirs = new Set();
  for (const gate of Object.values(gates)) {
    if (gate.instructions_file) {
      const dir = gate.instructions_file.split('/')[0]; // "echo-review/FOO.md" → "echo-review"
      gateDirs.add(dir);
    }
    if (gate.review_output_dir) {
      gateDirs.add(gate.review_output_dir);
    }
  }

  if (gateDirs.size === 0) return;

  const swarmRelPath = relPath(config, swarmRoot(config));
  let checkedOut = [];

  for (const dir of gateDirs) {
    const targetPath = `${swarmRelPath}/${dir}`;

    // Check if directory exists in architecture branch
    try {
      gitExec(config.repo_root, ['cat-file', '-e', `origin/${branch}:${targetPath}`], { stdio: 'ignore' });
    } catch {
      log('DEBUG', `Gate dir '${dir}' not found in architecture branch — skipping`);
      continue;
    }

    // Check if already released (any file exists locally)
    const localPath = path.join(swarmRoot(config), dir);
    if (fs.existsSync(localPath) && fs.readdirSync(localPath).length > 0) {
      log('DEBUG', `Gate dir '${dir}' already exists locally — skipping`);
      continue;
    }

    try {
      gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', targetPath], { stdio: 'ignore' });
      checkedOut.push(dir);
      log('OK', `Gate files released: ${dir}/`);
    } catch (e) {
      log('WARN', `Failed to checkout gate dir '${dir}': ${e.message}`);
    }
  }

  if (checkedOut.length > 0) {
    try {
      await gitCommitAndPush(config, `[blueprint] Release gate files: ${checkedOut.join(', ')}`, {
        addPaths: checkedOut.map(d => `${swarmRelPath}/${d}`),
      });
      log('OK', `Gate files committed and pushed: ${checkedOut.join(', ')}`);
    } catch (e) {
      log('WARN', `Gate files commit/push failed (non-critical): ${e.message}`);
    }
  }
}

// ─── Agent Dispatch (Dual Mode: ACP + Redis) ────────────────────────────────
//
// Two dispatch modes based on agent type:
//
// ACP agents (Forge, Echo) — Nova's subagents
//   - Spawned as thread-bound ACP sessions via Gateway Tool API
//   - Session destroyed after each phase (kill-and-respawn)
//   - Pipeline has direct lifecycle control
//
// Redis agents (Buster) — Separate OpenClaw instances
//   - Task dispatched to their Redis stream via redis.js
//   - Buster's processor sidecar picks up the task, injects Qdrant context,
//     and feeds it into Buster's gateway
//   - Pipeline has NO direct lifecycle control — Buster is always running
//   - "Kill" is a no-op (Buster finishes and goes idle on its own)
//
// Why Buster is Redis, not ACP:
//   Buster runs in an isolated pod with Podman-in-Pod sandbox (SYS_ADMIN,
//   SYS_CHROOT, etc.). It needs its own K8s pod and persistent environment.
//   It cannot be a subagent of Nova.
//
// Kill-and-respawn (ACP agents only):
//   Fresh agents with better prompts outperform stale agents with polluted
//   context windows. On fail, ACP sessions are always destroyed and re-spawned.

function acpLabel(agentType, moduleId) {
  return `${agentType}-${moduleId}`;
}

/**
 * Derive the ACP harness ID from a model name.
 * The harness determines which coding tool runs the ACP session
 * (Claude Code, Codex, Gemini CLI, etc.).
 *
 * Available acpx harnesses: pi, claude, codex, opencode, gemini, kimi
 * See: https://docs.openclaw.ai/tools/acp-agents#acpx-harness-support-current
 *
 * @param {string} modelId - Model identifier (e.g. 'claude-sonnet-4-6', 'codex-5.4', 'gemini-pro')
 * @returns {string|null} Harness ID or null if unknown
 */
function modelToHarness(modelId) {
  if (!modelId) return null;
  const m = modelId.toLowerCase();
  if (m.includes('claude'))    return 'claude';
  if (m.includes('codex'))     return 'codex';
  if (m.includes('gpt'))       return 'codex';
  if (m.includes('gemini'))    return 'gemini';
  if (m.includes('opencode'))  return 'opencode';
  if (m.includes('kimi'))      return 'kimi';
  return null;
}

// ── ACP Dispatch (Forge, Echo) — via Gateway Tool API ──
// sessions_spawn with runtime: "acp" — see https://docs.openclaw.ai/tools/acp-agents
// Always oneshot (mode: 'run'), headless (no thread), with stream logging.
// Pipeline owns the session lifecycle. Stream log is saved to .swarm/ after completion.

async function spawnAcpAgent(config, agentType, moduleId, model, taskPrompt) {
  const agentConfig = config.agents[agentType];
  const trackingKey = acpLabel(agentType, moduleId);       // Deterministic — used for Map lookups
  const gatewayLabel = `${trackingKey}-${Date.now()}`;     // Unique — sent to Gateway (rejects duplicates)
  // Prio: model-derived harness → config acp_agent_id → agentType as fallback
  const agentId = modelToHarness(model) || agentConfig.acp_agent_id || agentType;
  const cwd = agentConfig.cwd || config.repo_root;

  log('STEP', `Spawning ACP session: ${gatewayLabel} (agent: ${agentId}, model: ${model})`);

  // sessions_spawn args — see https://docs.openclaw.ai/concepts/session-tool#sessions_spawn
  const spawnArgs = {
    task: taskPrompt,
    runtime: 'acp',
    agentId: agentId,
    label: gatewayLabel,
    model: model,
    cwd: cwd,
    thread: false,              // Headless — no Discord thread (oneshot sessions don't benefit from threads)
    mode: 'run',                // Always oneshot — session closes after task completes
    streamTo: 'parent',         // Stream JSONL log to file for post-mortem analysis
    cleanup: 'keep',            // Keep transcript for post-mortem
  };

  try {
    // sessions_spawn returns wrapped: { ok, result: { details: { status, childSessionKey, runId, streamLogPath? } } }
    const raw = await gatewayInvoke('sessions_spawn', spawnArgs, 30000);
    const result = raw?.result?.details || raw;

    if (result.status !== 'accepted') {
      throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
    }

    const streamLogPath = result.streamLogPath || null;
    log('OK', `ACP session spawned: ${gatewayLabel} → ${result.childSessionKey}${streamLogPath ? ` (stream: ${streamLogPath})` : ''}`);
    trackAgent(config, trackingKey, result.childSessionKey, agentId, gatewayLabel, streamLogPath);
    return { label: trackingKey, childSessionKey: result.childSessionKey, runId: result.runId, streamLogPath };
  } catch (e) {
    throw new Error(`Failed to spawn ACP session '${gatewayLabel}': ${e.message}`);
  }
}

async function killAcpAgent(config, agentType, moduleId, graceful = false) {
  const label = acpLabel(agentType, moduleId);
  const entry = _shutdownState.activeSessions.get(label);
  const sessionKey = entry?.sessionKey;

  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — skipping kill`);
    untrackAgent(label);
    return;
  }

  // Grace period: wait for agent to finish thread summary before killing
  if (graceful) {
    log('INFO', `Waiting for session to become idle: ${label}`);
    await waitForSessionIdle(sessionKey);
  }

  log('STEP', `Destroying ACP session: ${label} (${sessionKey})`);
  try {
    // sessions_send with /stop — see https://docs.openclaw.ai/concepts/session-tool#sessions_send
    await gatewayInvoke('sessions_send', { sessionKey, message: '/stop' }, 15000);
    log('OK', `Session destroyed: ${label}`);
  } catch {
    log('WARN', `Could not destroy session '${label}' — may have already exited`);
  }
  await acpxCleanup(entry.agentId, entry.gatewayLabel);
  untrackAgent(label);
}

// ── Redis Dispatch (Buster) ──
// Writes a structured task to Buster's Redis stream. The orchestrator
// (buster-orchestrator.js) picks it up, runs deterministic suites, enriches
// the prompt with results, and spawns a subagent via gateway.
//
// Task types:
//   module_test — standard module testing (BUSTER.md driven)
//   gate_test   — gate testing (instructions_file driven, e.g. final system test)

function buildBusterPayload(config, progress, moduleId, taskType, taskPrompt, status, opts = {}) {
  // Common fields — all pipeline tasks include the completion stream
  const base = {
    task_type: taskType,
    module: moduleId,
    project: config.project,
    commit_hash: status?.forge_commit_hash || null,
    timestamp: new Date().toISOString(),
    completion_stream: completionStreamKey(config),
  };

  if (taskType === 'module_test') {
    const mod = progress.modules[moduleId];
    return {
      ...base,
      instructions: taskPrompt,
      session: {
        model: opts.model || null,
        agentId: modelToHarness(opts.model) || null,
        cwd: config.repo_root,
        timeout_seconds: (mod?.timeout_minutes ?? config.default_timeout_minutes) * 60,
        label: `buster-test-${moduleId}-${Date.now()}`,
      },
      module_path: mod ? relPath(config, modulePath(config, mod.dir)) : null,
      buster_md_path: mod ? relPath(config, path.join(modulePath(config, mod.dir), 'BUSTER.md')) : null,
      status_json_path: mod ? relPath(config, statusPath(config, mod.dir)) : null,
      test_suites: mod?.test_suites || null,
      test_config: mod?.test_config || null,
      run_id: opts.run_id || null,
      attempt: opts.attempt || 1,
    };
  }

  if (taskType === 'gate_test') {
    const gate = opts.gate || progress.gates?.[moduleId] || {};
    const gateTimeout = gate.timeout_minutes ?? config.default_timeout_minutes;
    return {
      ...base,
      instructions: taskPrompt,
      session: {
        model: opts.model || null,
        agentId: modelToHarness(opts.model) || null,
        cwd: config.repo_root,
        timeout_seconds: gateTimeout * 60,
        label: `buster-gate-${moduleId}-${Date.now()}`,
      },
      gate_id: moduleId,
      gate_title: gate.title || moduleId,
      // Gate working directory is the swarm root (not a module subdir)
      work_dir: relPath(config, swarmRoot(config)),
      output_file: gate.output_file ? relPath(config, path.join(swarmRoot(config), gate.output_file)) : null,
      instructions_file: gate.instructions_file ? relPath(config, path.join(swarmRoot(config), gate.instructions_file)) : null,
    };
  }

  // Fallback for steer or other types
  return { ...base, message: taskPrompt };
}

function dispatchRedisTask(config, progress, agentType, moduleId, taskType, payload, status = null, opts = {}) {
  const agentConfig = config.agents[agentType];
  const redisJsPath = validateSafePath(
    agentConfig.redis_js_path || '/app/skills/redis.js',
    `agents.${agentType}.redis_js_path`
  );

  log('STEP', `Dispatching to Redis: ${agentType} (module: ${moduleId}, type: ${taskType})`);

  // Build structured payload
  const taskPayload = (taskType === 'module_test' || taskType === 'gate_test')
    ? buildBusterPayload(config, progress, moduleId, taskType, payload, status, opts)
    : { module: moduleId, project: config.project, message: payload, timestamp: new Date().toISOString() };

  // Write payload + dispatch script to temp files (avoids shell interpolation entirely)
  const tmpPayloadPath = tmpFile('payload', moduleId, '.json');
  const tmpScriptPath = tmpFile('dispatch', moduleId, '.mjs');

  fs.writeFileSync(tmpPayloadPath, JSON.stringify(taskPayload));
  fs.writeFileSync(tmpScriptPath, `
    import fs from 'fs';
    try {
      const lib = await import(${JSON.stringify(redisJsPath)});
      const payload = JSON.parse(fs.readFileSync(${JSON.stringify(tmpPayloadPath)}, 'utf8'));
      const result = await lib.default.sendTask(${JSON.stringify(agentType)}, ${JSON.stringify(taskType)}, payload, 1);
      console.log(JSON.stringify(result));
      await lib.default.disconnect();
    } catch (e) {
      console.error(JSON.stringify({ error: e.message, code: e.code || 'UNKNOWN' }));
      process.exit(1);
    }
  `);

  try {
    const result = nodeExec(tmpScriptPath, [], { timeout: 15000, env: process.env });
    log('OK', `Redis task dispatched to ${agentType}: ${result}`);
    // redis.js may output a "[Redis] Sent..." prefix before the JSON
    const jsonMatch = result.match(/(\{[\s\S]*\})\s*$/);
    return JSON.parse(jsonMatch ? jsonMatch[1] : result);
  } catch (e) {
    throw new Error(`Failed to dispatch Redis task to ${agentType}: ${e.message}`);
  }
  // Temp files live in _tmpDir — cleaned up when the pipeline exits
}

// ── Unified Interface ──
// The rest of the pipeline uses these three functions without caring
// whether the agent is ACP or Redis. All are async — callers must await.

async function spawnAgent(config, progress, agentType, moduleId, model, taskPrompt, opts = {}) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);

  if (agentConfig.dispatch === 'redis') {
    const taskType = opts.taskType || 'module_test';
    opts.model = model;  // Pass resolved model to Redis payload builder
    return dispatchRedisTask(config, progress, agentType, moduleId, taskType, taskPrompt, opts.status, opts);
  } else {
    return await spawnAcpAgent(config, agentType, moduleId, model, taskPrompt);
  }
}

async function killAgent(config, agentType, moduleId, graceful = false) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return;

  if (agentConfig.dispatch === 'redis') {
    // Redis agents are persistent instances — no session to destroy.
    // Buster finishes its task and returns to idle on its own.
    log('INFO', `${agentType} is a Redis agent — no session to destroy (persistent instance)`);
  } else {
    // killAcpAgent calls untrackAgent internally
    await killAcpAgent(config, agentType, moduleId, graceful);
  }
}

async function steerAgent(config, progress, agentType, moduleId, message) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return;

  if (agentConfig.dispatch === 'redis') {
    log('STEP', `Steering ${agentType} via Redis follow-up message`);
    try {
      dispatchRedisTask(config, progress, agentType, moduleId, 'steer', message);
    } catch (e) {
      log('WARN', `Redis steer failed for ${agentType}: ${e.message}`);
    }
  } else {
    const label = acpLabel(agentType, moduleId);
    const sessionKey = _shutdownState.activeSessions.get(label)?.sessionKey;

    if (!sessionKey) {
      log('WARN', `No sessionKey tracked for '${label}' — cannot steer`);
      return;
    }

    try {
      // sessions_send delivers the steer message to the running ACP session.
      // No temp file needed — HTTP POST handles large payloads natively.
      await gatewayInvoke('sessions_send', { sessionKey, message }, 15000);
    } catch (e) {
      log('WARN', `ACP steer failed for '${label}': ${e.message}`);
    }
  }
}

/**
 * Verify an ACP agent is alive shortly after spawn.
 * Waits a few seconds then checks session status via Gateway Tool API.
 * For Redis agents: always returns true (Processor handles spawn verification).
 *
 * This catches silent spawn failures (OOM, bad model ID, gateway down) in seconds
 * instead of waiting the full polling timeout (up to 60 minutes).
 */
async function verifyAgentAlive(config, agentType, moduleId, waitMs = 8000) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return false;

  // Redis agents: trust the dispatch — Processor monitors the subagent
  if (agentConfig.dispatch === 'redis') return true;

  // Wait for ACP session to initialize
  await sleep(waitMs);

  const label = acpLabel(agentType, moduleId);
  const sessionKey = _shutdownState.activeSessions.get(label)?.sessionKey;

  if (!sessionKey) {
    log('ERROR', `Agent health check failed: no sessionKey for '${label}'`);
    return false;
  }

  try {
    const raw = await gatewayInvoke('session_status', {}, 10000, { sessionKey });
    const result = raw?.result?.details || raw;
    const { active, state } = parseSessionState(result);

    // Terminal states right after spawn = spawn failed
    if (/^(closed|error)$/i.test(state)) {
      log('ERROR', `Agent health check: session in terminal state '${state}': ${label}`);
      return false;
    }

    log('OK', `Agent health check passed: ${label} (${sessionKey}, state: ${state})`);
    return true;
  } catch (e) {
    log('ERROR', `Agent health check failed: ${label} — ${e.message?.split('\n')[0]}`);
    return false;
  }
}

/**
 * Poll until an ACP Forge session ends, with progress logging and crash detection.
 * Replaces the raw while-loop pattern used in gate fix cycles.
 *
 * Uses Gateway Tool API (session_status / sessions_send) instead of CLI.
 *
 * After session end, checks if Forge actually produced git changes (HEAD diff).
 * This detects silent crashes: OOM, API errors, or other failures where the
 * session dies without producing any commits.
 *
 * @param {object} config - Pipeline config
 * @param {string} sessionLabel - ACP session label (used to look up childSessionKey)
 * @param {number} timeoutMinutes - Max wait time
 * @param {string} logLabel - For progress messages (e.g. "gatefix-final-test-1")
 * @returns {{ completed: boolean, hasChanges: boolean, reason: string }}
 */
async function pollForSessionEnd(config, sessionLabel, timeoutMinutes, logLabel = 'session-poll') {
  const interval = config.poll_interval_seconds * 1000;
  const deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  const nudgeThreshold = config.session_nudge_threshold ?? 0.75;
  let nudgeSent = false;

  // Resolve sessionKey from label
  const sessionKey = _shutdownState.activeSessions.get(sessionLabel)?.sessionKey;
  if (!sessionKey) {
    log('ERROR', `[${logLabel}] No sessionKey for label '${sessionLabel}' — cannot poll`);
    return { completed: false, hasChanges: false, reason: 'no_session_key' };
  }

  // Capture HEAD before Forge starts — used as fallback change detection
  const headBefore = headHash();

  // Startup grace period: ACP oneshot sessions can take 35–60s to initialize.
  // During that window, session_status returns 'idle' which looks like "not active".
  // Don't declare session dead until grace period expires.
  const STARTUP_GRACE_MS = 180000; // 180s
  let sessionDeadCycles = 0;

  log('INFO', `[${logLabel}] Waiting for session '${sessionLabel}' (${sessionKey}) to complete | timeout: ${timeoutMinutes}min`);

  while (Date.now() < deadline) {
    await sleep(interval);
    gitPullForPolling(config);

    let sessionActive = false;
    try {
      const raw = await gatewayInvoke('session_status', {}, 10000, { sessionKey });
      const statusResult = raw?.result?.details || raw;
      const parsed = parseSessionState(statusResult);
      sessionActive = parsed.active;
      if (!sessionActive) {
        log('INFO', `[${logLabel}] Session state: '${parsed.state}'`);
      }
    } catch {
      // Session gone = finished or crashed (404 / connection error)
      sessionActive = false;
    }

    if (!sessionActive) {
      const elapsedSinceSpawn = Date.now() - startTime;

      if (elapsedSinceSpawn < STARTUP_GRACE_MS) {
        log('DEBUG', `[${logLabel}] Session not active but within startup grace (${Math.round(elapsedSinceSpawn / 1000)}s / ${STARTUP_GRACE_MS / 1000}s) — ignoring`);
        continue;
      }

      sessionDeadCycles++;
      if (sessionDeadCycles < 2) {
        log('INFO', `[${logLabel}] Session not active (dead cycle ${sessionDeadCycles}/2) — confirming...`);
        continue;
      }

      log('INFO', `[${logLabel}] Session confirmed ended — detecting changes`);

      // Session ended — detect changes and commit them.
      let hasChanges = false;

      // Phase 1: Check for uncommitted file changes (agent wrote files but didn't commit)
      try {
        gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });
        const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
        if (porcelain) {
          gitExec(config.repo_root, ['commit', '-m', `[pipeline] ${logLabel}: agent output`], { stdio: 'ignore' });
          invalidateHeadHash();
          hasChanges = true;
          log('OK', `[${logLabel}] Session completed — committed agent output`);
        }
      } catch (e) {
        log('DEBUG', `[${logLabel}] Post-session commit: ${e.message?.split('\n')[0]}`);
      }

      // Phase 2: Fallback — check if HEAD moved (agent committed directly)
      if (!hasChanges) {
        invalidateHeadHash();
        const headAfter = headHash();
        hasChanges = headBefore !== headAfter;
      }

      if (!hasChanges) {
        log('WARN', `[${logLabel}] Session ended but no changes detected — agent may have crashed or produced no output`);
      }

      return { completed: true, hasChanges, reason: 'session_ended' };
    } else {
      sessionDeadCycles = 0;
    }

    // ── Timeout nudge ──
    // When the session is past the configured threshold (default 75%) of its
    // timeout, send a one-time reminder. This rescues agents that are working
    // but lost in detail — they can prioritize and wrap up.
    const percentElapsed = (Date.now() - startTime) / (timeoutMinutes * 60 * 1000);
    if (!nudgeSent && percentElapsed >= nudgeThreshold) {
      log('WARN', `[${logLabel}] Session at ${Math.round(percentElapsed * 100)}% of timeout — sending completion nudge`);
      try {
        const remainingMin = Math.round((deadline - Date.now()) / 60000);
        await gatewayInvoke('sessions_send', {
          sessionKey,
          message: `TIMEOUT WARNING: You have ~${remainingMin} minutes remaining. Complete your current task and write your output files now. Unfinished work will be lost.`,
        }, 10000);
        nudgeSent = true;
      } catch { /* best effort — session may have just ended */ }
    }

    // Progress logging
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log('INFO', `[${logLabel}] Session active | ${elapsed}s elapsed, ${remaining}s remaining`);
  }

  log('WARN', `[${logLabel}] Timeout — session still running after ${timeoutMinutes}min`);
  return { completed: false, hasChanges: false, reason: 'timeout' };
}

// ─── File Readers ────────────────────────────────────────────────────────────

function readForgeInstructions(config, moduleDir, moduleConfig) {
  const modPath = modulePath(config, moduleDir);

  if (!moduleConfig.substeps) {
    const p = path.join(modPath, 'FORGE.md');
    if (!fs.existsSync(p)) throw new Error(`FORGE.md not found: ${p}`);
    return fs.readFileSync(p, 'utf8');
  }

  const parts = [];
  for (const stepId of moduleConfig.substeps) {
    const p = path.join(modPath, stepId, 'FORGE.md');
    if (fs.existsSync(p)) parts.push(fs.readFileSync(p, 'utf8'));
  }
  if (parts.length === 0) throw new Error(`No FORGE.md files found in ${moduleDir}`);
  return parts.join('\n\n---\n\n');
}

function readBusterInstructions(config, moduleDir) {
  const p = path.join(modulePath(config, moduleDir), 'BUSTER.md');
  if (!fs.existsSync(p)) throw new Error(`BUSTER.md not found: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function readGateInstructions(config, gate) {
  const p = path.join(swarmRoot(config), gate.instructions_file);
  if (!fs.existsSync(p)) throw new Error(`Gate instructions not found: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

// ─── Buster Prompt Builder ──────────────────────────────────────────────────
//
// Builds the complete prompt for Buster subagent sessions.
// Analogous to buildForgePrompt — pipeline.js owns the full prompt.
// The orchestrator (buster-orchestrator.js) enriches it with Pre-Test
// Results before spawning the subagent.
//
// Prompt order (optimized for LLM attention):
//   0. Pre-Test Results — injected by orchestrator (verdict JSON, app URL)
//   1. Context Block — factual orientation (paths, commit, attempt)
//   2. Test Workspace — where to write test scripts (per-attempt dirs)
//   3. Test Instructions — BUSTER.md / gate instructions (inline, full content)
//   4. Completion Protocol — status.json → memory.js → redis.js
//
// No anti-patterns (Buster executes specs, doesn't need creative guidance).
// No memory injection (Buster's decisions are spec-driven, not context-driven).
// Orchestrator handles: git pull, build, serve, cleanup, deterministic suites.

/**
 * Git context section — informational only.
 * The orchestrator already did git pull before spawning the subagent.
 * This just tells the agent what commit it's working on.
 */
function buildGitSyncSection(commitHash) {
  const lines = [
    '## Git Context',
    '',
    'The orchestrator already synced the repo before your session started. Do NOT run `git pull`.',
    '',
  ];
  if (commitHash) {
    lines.push(
      `Expected commit: \`${commitHash.substring(0, 8)}\``,
      '',
    );
  }
  lines.push('---', '');
  return lines;
}

/**
 * Available tools section — injected into Buster prompts because ACP subagent
 * sessions don't inherit the main session's workspace (TOOLS.md).
 *
 * The orchestrator handles git pull, build, serve, and cleanup.
 * The subagent must NEVER run sandbox-build/serve/cleanup or git pull.
 */
function buildAvailableToolsSection() {
  return [
    '## Available Tools',
    '',
    'All scripts at `/app/skills/`. All env vars are pre-set.',
    '',
    '### What the Orchestrator Already Did',
    '',
    '- `git pull` — repo is synced to the expected commit',
    '- Build + Serve — the app is running (URL in Pre-Test Results above)',
    '- Deterministic test suites (build, health, a11y, perf, etc.) — results in Pre-Test Results above',
    '- Do **NOT** run `sandbox-build`, `sandbox-serve`, `sandbox-cleanup`, or `git pull`',
    '',
    '### Testing Tools',
    '```',
    'npx playwright test              # E2E tests',
    'k6 run script.js                 # Load tests',
    'curl -s <url> | jq .             # Quick HTTP checks',
    'node /app/skills/visual-audit.js "<url>" [--mode image|video]  # Screenshot/video to Discord',
    '```',
    '',
    '### Completion (redis.cjs)',
    '```',
    'node /app/skills/redis.cjs --action complete --module <ID> --status <PASS|FAIL> --summary "text"',
    '```',
    '',
    '### Memory (Qdrant)',
    '```',
    'node /app/skills/memory.js remember --text "finding" --tags "t1,t2" [--module <ID>]',
    'node /app/skills/memory.js recall --query "text" [--tags "t1"] [--module <ID>] [--limit 5]',
    '```',
    '',
    '### Conventions',
    '',
    'Follow `/app/skills/buster/CONVENTIONS.md`:',
    '- Output: JSON to stdout (not Markdown)',
    '- Naming: `test-<suite>-<module>-<attempt>.js`',
    '- Timeouts: Every request and script must have a timeout',
    '- Error reports: Repro-Steps, Actual vs Expected, Environment, Severity',
    '- Exit codes: 0 = PASS, 1 = FAIL, 2 = ERROR',
    '',
    '---',
    '',
  ];
}


/**
 * Shared test workspace section for all Buster prompts.
 * Tells the agent where to write test scripts so they persist in the repo,
 * are separated per attempt, and stay within .swarm/ (verify-task.js scope).
 */
function buildTestWorkspaceSection(testWorkspacePath) {
  return [
    '## Test Workspace',
    '',
    `**Test directory:** \`${testWorkspacePath}/\``,
    '',
    'Simple checks (curl, ls, single commands) can run inline.',
    'Multi-step tests, Playwright scripts, k6 scenarios, or anything longer than a few lines:',
    'write as an executable script file in the test directory above, then run it.',
    'This keeps your tests documented and reproducible.',
    '',
    '- Create the directory if it does not exist',
    '- The application code is **read-only** (changes outside `.swarm/` will be reverted)',
    '- Reference application code via relative paths to **Project Source**',
    '',
    '---',
    '',
  ];
}

/**
 * Build a complete Buster prompt for module_test tasks.
 *
 * @param {object} config - Pipeline config
 * @param {string} moduleId - Module ID
 * @param {object} mod - Module definition from progress.json
 * @param {string} dir - Module directory name
 * @param {object} status - Current status.json content
 * @param {number} maxFails - Max allowed failures
 * @returns {{ prompt: string } | { error: string }}
 */
function buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails) {
  // ── Read test spec ──
  let testInstructions;
  try { testInstructions = readBusterInstructions(config, dir); }
  catch (e) { return { error: e.message }; }

  const attempt = status.fail_count + 1;

  // ── Context Block ──
  const contextBlock = [
    '## 🔬 TEST CONTEXT',
    '',
    `**Project:** ${config.project}`,
    `**Module:** ${moduleId} — ${mod.title}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Module Path:** \`${relPath(config, modulePath(config, dir))}\``,
    `**Status JSON:** \`${relPath(config, statusPath(config, dir))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Working Directory:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Attempt:** ${attempt}/${maxFails}`,
    status.forge_commit_hash
      ? `**Commit:** \`${status.forge_commit_hash.substring(0, 8)}\``
      : '',
    '',
    'All file paths in the test instructions below are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before running any tests.`,
    '',
  ].filter(Boolean);

  if (status.forge_diff_stat) {
    contextBlock.push('**Files Changed by Forge:**', '```', status.forge_diff_stat, '```', '');
  }

  contextBlock.push('---', '');

  // ── Git Sync (Step 0) ──
  const gitSync = buildGitSyncSection(status.forge_commit_hash);

  // ── Available Tools ──
  const availableTools = buildAvailableToolsSection();

  // ── Test Workspace ──
  const testWorkspacePath = relPath(config, path.join(modulePath(config, dir), 'tests', `attempt-${attempt}`));
  const testWorkspace = buildTestWorkspaceSection(testWorkspacePath);

  // ── Test Instructions (BUSTER.md inline) ──
  const testSection = [
    '## Test Instructions',
    '',
    testInstructions,
    '',
    '---',
    '',
  ];

  // ── Completion Protocol ──
  const completionProtocol = buildBusterCompletionProtocol(config, moduleId, dir, status);

  const prompt = [...contextBlock, ...gitSync, ...availableTools, ...testWorkspace, ...testSection, ...completionProtocol].join('\n');
  return { prompt };
}

/**
 * Build a complete Buster prompt for gate_test tasks.
 *
 * @param {object} config - Pipeline config
 * @param {string} gateId - Gate ID
 * @param {object} gate - Gate definition from progress.json
 * @param {string} instructions - Gate instructions content (already read)
 * @param {string|null} commitHash - Current commit hash
 * @param {number} [attempt=1] - Current attempt number
 * @returns {string} Complete prompt
 */
function buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt = 1) {
  // ── Context Block ──
  const contextBlock = [
    '## 🔬 TEST CONTEXT',
    '',
    `**Project:** ${config.project}`,
    `**Gate:** ${gateId} — ${gate.title}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Working Directory:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Attempt:** ${attempt}`,
    commitHash ? `**Commit:** \`${commitHash}\`` : '',
    '',
    'All file paths in the test instructions below are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before running any tests.`,
    '',
    '---',
    '',
  ].filter(Boolean);

  // ── Git Sync (Step 0) ──
  const gitSync = buildGitSyncSection(commitHash);

  // ── Available Tools ──
  const availableTools = buildAvailableToolsSection();

  // ── Test Workspace ──
  const gateDir = gate.output_file ? path.dirname(gate.output_file) : gateId;
  const testWorkspacePath = relPath(config, path.join(swarmRoot(config), gateDir, 'tests', `attempt-${attempt}`));
  const testWorkspace = buildTestWorkspaceSection(testWorkspacePath);

  // ── Test Instructions (gate instructions inline) ──
  const testSection = [
    '## Test Instructions',
    '',
    instructions,
    '',
    '---',
    '',
  ];

  // ── Completion Protocol (gate variant) ──
  const completionProtocol = buildBusterGateCompletionProtocol(config, gateId, gate);

  return [...contextBlock, ...gitSync, ...availableTools, ...testWorkspace, ...testSection, ...completionProtocol].join('\n');
}

/**
 * Completion protocol for module_test: status.json → memory.js → redis.js
 */
function buildBusterCompletionProtocol(config, moduleId, dir, status) {
  const statusJsonPath = relPath(config, statusPath(config, dir));

  return [
    '## When Testing Is Complete',
    '',
    'Execute these steps **in this exact order**. Do not skip any step.',
    '',
    '### Step 1: Update status.json',
    '',
    `Update \`${statusJsonPath}\`:`,
    '- Read the existing JSON first (it contains pipeline metadata — do NOT overwrite it)',
    '- Set `"status"` to `"PASS"` if all tests pass, or `"FAIL"` if any test fails',
    '- If FAIL: increment `"fail_count"` and add a `"fail_summaries"` entry:',
    '  ```json',
    '  { "attempt": N, "timestamp": "ISO", "summary": "<what failed and why — be specific>", "phase": "buster" }',
    '  ```',
    '- If PASS: set `"completion_summary"` with test results overview',
    '- Set `"current_phase"` to `null`',
    '',
    '### Step 2: Store Technical Insights (MANDATORY)',
    '',
    'Store 1-3 key technical insights from this session:',
    '```bash',
    `node /app/skills/memory.js remember \\`,
    `  --text "Concise technical insight — what was tested and what pattern works or fails" \\`,
    `  --tags "buster,${moduleId},${config.project}" \\`,
    `  --scope global \\`,
    `  --module ${moduleId}`,
    '```',
    '',
    'What to store: patterns that worked, edge cases found, root causes of failures, test strategies.',
    'What NOT to store: "Tests passed" (useless metadata), project-specific details that cannot be reused.',
    '',
    '⚠️ Step 2 is MANDATORY. `redis.cjs --action complete` triggers `verify-task.js`,',
    'which checks that at least one memory entry exists for this module.',
    'If you skip Step 2, Step 3 will fail with MISSING MEMORY ENTRY.',
    '',
    '### Step 3: Signal Completion',
    '',
    'This is your **LAST** action:',
    '```bash',
    `node /app/skills/redis.cjs \\`,
    `  --action complete \\`,
    `  --module ${moduleId} \\`,
    `  --status <PASS|FAIL> \\`,
    `  --summary "brief result summary"`,
    '```',
    '',
    'Do NOT skip this step. Without it, your work cannot be registered.',
  ];
}

/**
 * Completion protocol for gate_test: output_file → memory.js → redis.js
 */
function buildBusterGateCompletionProtocol(config, gateId, gate) {
  const outputFile = gate.output_file
    ? relPath(config, path.join(swarmRoot(config), gate.output_file))
    : null;

  return [
    '## When Testing Is Complete',
    '',
    'Execute these steps **in this exact order**. Do not skip any step.',
    '',
    '### Step 1: Write Results',
    '',
    outputFile
      ? `Write your results to \`${outputFile}\` as JSON with at minimum a \`"status"\` field (\`"PASS"\` or \`"FAIL"\`).`
      : 'Write your results as described in the instructions above.',
    'Include a `"summary"` field with a brief overview and a `"findings"` array with details.',
    '',
    '### Step 2: Store Technical Insights (MANDATORY)',
    '',
    'Store 1-3 key technical insights from this session:',
    '```bash',
    `node /app/skills/memory.js remember \\`,
    `  --text "Concise technical insight — what was tested and what pattern works or fails" \\`,
    `  --tags "buster,${gateId},${config.project}" \\`,
    `  --scope global \\`,
    `  --module ${gateId}`,
    '```',
    '',
    'What to store: patterns that worked, edge cases found, root causes of failures, test strategies.',
    'What NOT to store: "Tests passed" (useless metadata), project-specific details that cannot be reused.',
    '',
    '⚠️ Step 2 is MANDATORY. `redis.cjs --action complete` triggers `verify-task.js`,',
    'which checks that at least one memory entry exists for this module.',
    'If you skip Step 2, Step 3 will fail with MISSING MEMORY ENTRY.',
    '',
    '### Step 3: Signal Completion',
    '',
    'This is your **LAST** action:',
    '```bash',
    `node /app/skills/redis.cjs \\`,
    `  --action complete \\`,
    `  --module ${gateId} \\`,
    `  --status <PASS|FAIL> \\`,
    `  --summary "brief result summary"`,
    '```',
    '',
    'Do NOT skip this step. Without it, your work cannot be registered.',
  ];
}

// ─── Qdrant Memory Integration ───────────────────────────────────────────────
//
// Three integration points:
//
// 1. BEFORE FORGE (recall)
//    Pull relevant memories from Qdrant and inject into the Forge prompt.
//    This includes project-scoped memories AND global patterns from other projects.
//    The scope filter in memory.js already handles this:
//      - global (cross-project patterns, reusable learnings)
//      - project:kubecommand (project-specific context)
//      - agent:forge (agent-specific knowledge)
//
// 2. AFTER PASS/FAIL (feedback)
//    Call memory.js feedback to bulk-update confidence scores on memories
//    that were relevant to this module. PASS = boost, FAIL = decay.
//    This creates a natural reinforcement loop.
//
// 3. AFTER PASS (store pattern)
//    Extract a reusable pattern from the successful module and store it
//    with scope=global. This makes it available to all future projects.
//    Example: "WebSocket auth must reject before accept() for 4001 codes"

function memoryEnabled(config) {
  return config.memory?.enabled !== false;
}

function memoryJsPath(config) {
  return validateSafePath(
    config.memory?.memory_js_path || '/app/skills/memory.js',
    'config.memory.memory_js_path'
  );
}

// ── Dynamic import of memory.js with CLI fallback ──
// If memory.js exports named functions (recall, feedback, remember), import them
// directly to avoid subprocess overhead (~7 spawns per module). Falls back to CLI
// if the import fails (e.g. memory.js doesn't have exports yet).

let _memoryModule = null;
let _memoryImportAttempted = false;

async function getMemoryModule(config) {
  if (_memoryImportAttempted) return _memoryModule;
  _memoryImportAttempted = true;

  const memPath = memoryJsPath(config);
  try {
    _memoryModule = await import(memPath);
    log('INFO', 'Memory module loaded via direct import (no subprocess overhead)');
  } catch (e) {
    log('INFO', `Memory module import failed (${e.message}) — using CLI fallback`);
    _memoryModule = null;
  }
  return _memoryModule;
}

/**
 * Recall relevant memories for a module.
 * Returns formatted markdown block to inject into the agent's prompt,
 * or empty string if no memories found / memory disabled.
 */
async function recallForModule(config, moduleId, moduleTitle, additionalContext = '', failContext = '') {
  if (!memoryEnabled(config)) return { block: '', count: 0, ids: [] };

  const limit = config.memory?.recall_limit ?? 5;
  const memPath = memoryJsPath(config);
  const isRetry = !!failContext;

  // Build a natural language query — embedding models work better with sentences
  // than with keyword dumps like "06 WebSockets 06a 06b"
  const substepInfo = additionalContext ? ` with steps ${additionalContext}` : '';

  // On retry: include fail context so the embedding search can find memories
  // that are relevant to the SOLUTION, not to the failed approach.
  // This doesn't filter memories — it biases the semantic search toward
  // "what works" rather than "what we already tried".
  const retryHint = isRetry
    ? ` Previous approaches failed: ${failContext.slice(0, 200)}. Focus on alternative patterns and workarounds.`
    : '';
  const query = `What established patterns, solutions, and architectural decisions exist for building ${moduleTitle}${substepInfo}?${retryHint} Include relevant technical insights from similar modules.`;

  log('STEP', `Memory recall for module ${moduleId}${isRetry ? ' (retry-aware)' : ''}: "${query.slice(0, 100)}..."`);

  try {
    let memories;

    // Try direct import first (no subprocess overhead)
    const memModule = await getMemoryModule(config);
    if (memModule?.recall) {
      memories = await memModule.recall(query, { limit });
    } else {
      // CLI fallback
      const result = nodeExec(memPath, ['recall', '--query', query, '--limit', String(limit)],
        { timeout: 15000, env: process.env });
      memories = JSON.parse(result);
    }

    if (!memories.length) {
      log('INFO', 'No relevant memories found');
      return { block: '', count: 0, ids: [] };
    }

    log('OK', `${memories.length} memories recalled`);

    // Extract IDs for targeted confidence decay on failure.
    // These are the specific memories that were injected into the agent's prompt —
    // if the module fails, these (and only these) should have their confidence decayed.
    const ids = memories.map(m => m.id).filter(Boolean);

    // Format as markdown block for prompt injection
    const lines = memories.map((m, i) => {
      const conf = m.confidence ?? 0.5;
      const stars = conf >= 0.75 ? '★★★' : conf >= 0.45 ? '★★☆' : '★☆☆';
      const score = (m.score ?? 0).toFixed(2);
      const module = m.module ? `module:${m.module}` : '';
      const agent = m.agent ? `by:${m.agent}` : '';
      const tags = m.tags?.length ? `tags:${m.tags.join(',')}` : '';
      const meta = [module, agent, tags].filter(Boolean).join(' · ');
      return `${i + 1}. [${stars} relevance:${score}] ${m.text}${meta ? `\n   _(${meta})_` : ''}`;
    });

    // Adjust header based on retry context — on retry, memories need a caveat
    const headerNote = isRetry
      ? 'These learnings may or may not apply to the current retry.\nIf a memory contradicts something in the ANTI-PATTERNS section above, the anti-pattern takes precedence.'
      : 'Use these as guidance, not as absolute truth.';

    const block = [
      '',
      '---',
      '## 📎 CONTEXT FROM SWARM MEMORY',
      '',
      'The following learnings from previous work may be relevant.',
      '★★★ = validated pattern, ★★☆ = neutral, ★☆☆ = unverified.',
      headerNote,
      '',
      ...lines,
      '',
      '---',
      '',
    ].join('\n');

    return { block, count: memories.length, ids };
  } catch (e) {
    log('WARN', `Memory recall failed: ${e.message}`);
    return { block: '', count: 0, ids: [] };
  }
}

/**
 * Send outcome feedback to Qdrant after module PASS/FAIL.
 * Updates confidence scores on memories related to this module.
 */
async function feedbackMemory(config, moduleId, outcome, reason = '') {
  if (!memoryEnabled(config)) return;
  if (!config.memory?.feedback_after_outcome) return;

  const memPath = memoryJsPath(config);

  log('STEP', `Memory feedback: module=${moduleId} outcome=${outcome}`);

  try {
    let feedback;

    const memModule = await getMemoryModule(config);
    if (memModule?.feedback) {
      feedback = await memModule.feedback(moduleId, outcome, { reason: reason.slice(0, 500) });
    } else {
      const args = ['feedback', '--module', moduleId, '--outcome', outcome];
      if (reason) args.push('--reason', reason.slice(0, 500));
      const result = nodeExec(memPath, args, { timeout: 15000, env: process.env });
      feedback = JSON.parse(result);
    }

    log('OK', `Memory feedback applied: ${feedback.memories_affected} memories updated, outcome stored as ${feedback.outcome_memory_id}`);
    return feedback;
  } catch (e) {
    log('WARN', `Memory feedback failed: ${e.message}`);
  }
}

/**
 * Targeted confidence decay for specific memories that were in the agent's prompt.
 *
 * Unlike feedbackMemory (which operates on all memories related to a module),
 * this decays ONLY the memories that were actually recalled and injected into
 * the Forge prompt for this specific attempt. This is precise:
 *   - If a memory was in the prompt and the agent failed → the memory may have
 *     been misleading or irrelevant. Decay it.
 *   - If a memory was NOT in the prompt → it had no influence. Leave it alone.
 *
 * Cross-run protection:
 *   Decayed IDs are tracked in status.decayed_memory_ids. If the same module
 *   fails again in a later pipeline run, memories that were already decayed
 *   are skipped. This prevents a correct memory from bleeding out to zero
 *   confidence over multiple runs where the actual problem is elsewhere.
 *   The set resets on PASS (positive feedback boosts everything back anyway).
 *
 * @param {object} config - Pipeline config
 * @param {string} moduleId - Module that failed
 * @param {string[]} memoryIds - Qdrant point IDs of recalled memories
 * @param {object} status - Module status object (mutated: decayed_memory_ids updated)
 * @param {string} reason - Why the module failed (for logging)
 */
async function decayRecalledMemories(config, moduleId, memoryIds, status, reason = '') {
  if (!memoryEnabled(config)) return;
  if (!memoryIds?.length) return;

  // ── Cross-run protection ──
  // Filter out memories that have already been decayed for this module.
  // status.decayed_memory_ids persists across runs via status.json.
  const alreadyDecayed = new Set(status.decayed_memory_ids || []);
  const newIds = memoryIds.filter(id => !alreadyDecayed.has(id));

  if (newIds.length === 0) {
    log('INFO', `All ${memoryIds.length} recalled memories already decayed for ${moduleId} — skipping (cross-run protection)`);
    return;
  }

  if (newIds.length < memoryIds.length) {
    log('INFO', `${memoryIds.length - newIds.length} of ${memoryIds.length} memories already decayed — decaying ${newIds.length} new`);
  }

  const memPath = memoryJsPath(config);

  log('STEP', `Targeted memory decay: ${newIds.length} memories that were in failed prompt for ${moduleId}`);

  try {
    const memModule = await getMemoryModule(config);
    if (memModule?.decayByIds) {
      // Direct import path — if memory.js exposes a targeted decay function
      await memModule.decayByIds(newIds, {
        module: moduleId,
        reason: reason.slice(0, 500),
        decay_amount: config.memory?.targeted_decay_amount ?? 0.1,
      });
    } else if (memModule?.feedback) {
      // Fallback: use feedback with explicit IDs if supported
      await memModule.feedback(moduleId, 'fail', {
        reason: reason.slice(0, 500),
        memory_ids: newIds,
      });
    } else {
      // CLI fallback — pass IDs as comma-separated list
      const args = [
        'feedback', '--module', moduleId, '--outcome', 'fail',
        '--memory-ids', newIds.join(','),
      ];
      if (reason) args.push('--reason', reason.slice(0, 500));
      nodeExec(memPath, args, { timeout: 15000, env: process.env });
    }

    // Record decayed IDs in status (persisted by handleFail's saveStatus call)
    if (!status.decayed_memory_ids) status.decayed_memory_ids = [];
    status.decayed_memory_ids.push(...newIds);

    log('OK', `Decayed ${newIds.length} recalled memories for ${moduleId} (${status.decayed_memory_ids.length} total tracked)`);
  } catch (e) {
    // Non-critical — log and continue. The pipeline should never fail
    // because memory confidence updates didn't work.
    log('WARN', `Targeted memory decay failed: ${e.message}`);
  }
}

// ─── Summary Agent (REMOVED) ────────────────────────────────────────────────
// spawnSummaryAgent was removed in the Buster Architecture Refactor.
// Technical insights are now stored by the Buster subagent directly via
// the memory skill as part of the completion protocol (Step B), before
// signaling completion via redis.js. This eliminates the fire-and-forget
// Echo agent, the temp-file timing issue, and the extra agent spawn.

// ─── Polling ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Consistent poll result wrapper — all callers get the same shape.
 *
 * IMPORTANT: ok=true means "a terminal status was reached", NOT "module passed".
 * FAIL is a valid terminal status — the caller inspects status.status to decide
 * whether it's a PASS or FAIL and handles each case separately.
 *
 * @typedef {Object} PollResult
 * @property {boolean} ok - Whether a terminal status was reached (PASS, FAIL, etc.)
 * @property {string} reason - 'target_reached' | 'gate_fail' | 'timeout' | 'blocked' | 'rate_limited' | 'rate_limit_exhausted' | 'parse_corrupted' | 'spawn_failed'
 * @property {object|null} status - The status.json content or Redis completion data
 */
function pollResult(ok, reason, status = null) {
  return { ok, reason, status };
}

/**
 * Generic polling loop with rate-limit handling, parse-corruption tracking,
 * and deadline management. All polling in the pipeline shares this scaffolding.
 *
 * @param {object} config - Pipeline config
 * @param {function} checkFn - Called each cycle. Returns:
 *   { done: true, result: PollResult }     → terminal, return immediately
 *   { done: false, logMsg?: string }       → keep polling (optional status message)
 *   { rate_limited: true, status: object } → rate limit detected
 *   { parse_error: true }                  → increment corruption counter
 * @param {number} timeoutMinutes - Max polling duration
 * @param {string} label - For log messages (e.g. "Gate 'review-01'" or "module-06")
 * @returns {PollResult}
 */
async function pollGeneric(config, checkFn, timeoutMinutes, label = 'poll') {
  const interval = config.poll_interval_seconds * 1000;
  let deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  let consecutiveParseFailures = 0;
  const maxParseFailures = 10;
  log('INFO', `[${label}] Polling every ${config.poll_interval_seconds}s | timeout: ${timeoutMinutes}min`);

  while (Date.now() < deadline) {
    await sleep(interval);
    gitPullForPolling(config);

    const check = await checkFn();

    // ── Terminal result ──
    if (check.done) {
      return check.result;
    }

    // ── Parse corruption tracking ──
    if (check.parse_error) {
      consecutiveParseFailures++;
      if (consecutiveParseFailures >= maxParseFailures) {
        log('ERROR', `[${label}] Parse corruption limit reached (${consecutiveParseFailures})`);
        return pollResult(false, 'parse_corrupted', null);
      }
      log('WARN', `[${label}] Parse failure ${consecutiveParseFailures}/${maxParseFailures}`);
      continue;
    }
    consecutiveParseFailures = 0;

    // ── Rate limit ──
    // Return to caller — pollGeneric doesn't have the moduleDir/statusDir context
    // needed by handleRateLimit. Callers (pollWithRateLimitRecovery,
    // pollDualWithRateLimitRecovery, runBusterGate) handle rate limits with
    // proper context.
    if (check.rate_limited) {
      log('WARN', `[${label}] Rate limit detected — returning to caller`);
      return pollResult(false, 'rate_limited', check.status);
    }

    // ── Progress log ──
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log('INFO', `[${label}] ${check.logMsg || 'pending'} | ${elapsed}s elapsed, ${remaining}s remaining`);
  }

  log('ERROR', `[${label}] Timeout after ${timeoutMinutes} minutes`);
  return pollResult(false, 'timeout', null);
}

/**
 * Simple file-existence poller built on pollGeneric.
 * Used by gates where the only completion signal is a file appearing on disk.
 *
 * @returns {PollResult} - ok=true if file found, ok=false on timeout
 */
async function pollForFile(config, filePath, timeoutMinutes, label = 'file-poll') {
  return pollGeneric(config, async () => {
    if (fs.existsSync(filePath)) {
      return { done: true, result: pollResult(true, 'target_reached', { file: filePath }) };
    }
    return { done: false };
  }, timeoutMinutes, label);
}

/**
 * Status poller — reads status.json until a target status is reached.
 * Built on pollGeneric. Returns immediately on RATE_LIMITED (caller decides).
 *
 * opts.sessionLabel — if set, also checks ACP session state each cycle.
 *   When the session ends and HEAD moved → auto-advances to READY_FOR_TESTING.
 *   This catches Forge agents that commit but forget to update status.json.
 * opts.headBefore — HEAD hash captured before Forge spawn (required with sessionLabel).
 * opts.moduleDir — module dir for status.json update on auto-advance.
 */
async function pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, opts = {}) {
  const { sessionLabel, headBefore } = opts;

  return pollGeneric(config, async () => {
    // ── Channel 1: status.json (primary signal) ──
    const status = loadStatus(config, moduleDir);

    if (!status) {
      const filePath = statusPath(config, moduleDir);
      if (fs.existsSync(filePath)) return { parse_error: true };
      // Fall through to session check if available
    } else {
      if (expectedStatuses.includes(status.status)) {
        return { done: true, result: pollResult(true, 'target_reached', status) };
      }
      if (status.status === STATUS.BLOCKED) {
        return { done: true, result: pollResult(false, 'blocked', status) };
      }
      if (status.status === STATUS.RATE_LIMITED) {
        return { rate_limited: true, status };
      }
    }

    // ── Channel 2: ACP session state (early exit detection) ──
    if (sessionLabel && headBefore) {
      const sessionKey = _shutdownState.activeSessions.get(sessionLabel)?.sessionKey;
      if (sessionKey) {
        let sessionActive = true;
        try {
          const raw = await gatewayInvoke('session_status', {}, 10000, { sessionKey });
          const statusResult = raw?.result?.details || raw;
          const parsed = parseSessionState(statusResult);
          sessionActive = parsed.active;
        } catch {
          // Session gone (404 / connection error) = finished or crashed
          sessionActive = false;
        }

        if (!sessionActive) {
          // Session ended — commit any uncommitted changes, then check if HEAD moved.
          // With oneshot mode, Forge may write files but not commit them.
          // Pipeline owns all git operations — commit whatever Forge produced.

          // Phase 1: Commit uncommitted file changes (Forge wrote files but didn't commit)
          let committedLocally = false;
          try {
            gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });
            const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
            if (porcelain) {
              gitExec(config.repo_root, ['commit', '-m', `[pipeline] Forge output: ${moduleDir} (auto-committed on session end)`], { stdio: 'ignore' });
              invalidateHeadHash();
              committedLocally = true;
              log('OK', `Session ended — committed uncommitted Forge output for ${moduleDir}`);
            }
          } catch (e) {
            log('DEBUG', `Post-session commit: ${e.message?.split('\n')[0]}`);
          }

          // Phase 2: Check if HEAD moved (local commit above OR Forge committed directly)
          gitPullForPolling(config);
          invalidateHeadHash();
          const headNow = headHash();

          if (headNow !== headBefore || committedLocally) {
            // Forge produced changes → auto-advance to READY_FOR_TESTING
            log('WARN', `Session ended + changes detected (${headBefore} → ${headNow}${committedLocally ? ', includes uncommitted' : ''}) — auto-advancing to READY_FOR_TESTING`);
            const currentStatus = loadStatus(config, moduleDir) || status || {};
            currentStatus.status = STATUS.READY_FOR_TESTING;
            addHistory(currentStatus, STATUS.READY_FOR_TESTING, 'pipeline',
              `Auto-advanced: Forge session ended${committedLocally ? ' (uncommitted changes committed by pipeline)' : ' with commits'} but did not update status.json`);
            saveStatus(config, moduleDir, currentStatus);
            await discord(config, 'INFO', `Forge session ended → READY_FOR_TESTING (${moduleDir})`,
              committedLocally
                ? 'Forge wrote files but did not commit or update status.json. Pipeline committed and advanced.'
                : 'Forge committed but did not write READY_FOR_TESTING. Pipeline auto-advanced.');
            return { done: true, result: pollResult(true, 'target_reached', currentStatus) };
          } else {
            // Session ended with no changes — Forge crashed or produced nothing
            log('WARN', `Session ended but no changes detected — Forge produced no output`);
            return { done: true, result: pollResult(false, 'session_ended_no_changes', status) };
          }
        }
      }
    }

    const logStatus = status?.status || 'no-status-file';
    const logPhase = status?.current_phase || '';
    return { done: false, logMsg: `status=${logStatus} phase=${logPhase}` };
  }, timeoutMinutes, moduleDir);
}

/**
 * Generic rate-limit recovery wrapper for any poll function.
 * Handles the retry-after-cooldown loop that is identical for all polling modes.
 *
 * @param {object} config - Pipeline config
 * @param {string} moduleDir - Module directory (for handleRateLimit's saveStatus/loadStatus)
 * @param {function} pollFn - Zero-arg async function that returns a PollResult
 * @returns {PollResult}
 */
async function withRateLimitRecovery(config, moduleDir, pollFn) {
  let rateLimitPauses = 0;
  const maxPauses = config.rate_limit?.max_pauses_per_module ?? 5;

  while (true) {
    const result = await pollFn();

    // Any result except rate_limited → pass through to caller
    if (result.reason !== 'rate_limited') return result;

    // Rate limit detected — check budget
    rateLimitPauses++;
    if (rateLimitPauses > maxPauses) {
      log('ERROR', `Rate limit pauses exceeded max (${rateLimitPauses}/${maxPauses}) — giving up`);
      return pollResult(false, 'rate_limit_exhausted', result.status);
    }

    // Pause (sleeps for hours, updates status, sends Discord alert)
    await handleRateLimit(config, result.status, moduleDir, rateLimitPauses, maxPauses);

    // After cooldown: pollFn restarts with its full original timeout.
    // Cooldown is "dead time" — doesn't count against the agent's work budget.
    log('INFO', `Rate limit cooldown complete — restarting poll (pause ${rateLimitPauses}/${maxPauses})`);
  }
}

/** Forge-phase rate-limit recovery (wraps pollStatus). */
async function pollWithRateLimitRecovery(config, moduleDir, expectedStatuses, timeoutMinutes, opts = {}) {
  return withRateLimitRecovery(config, moduleDir,
    () => pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, opts));
}

/** Buster-phase rate-limit recovery (wraps pollDual). */
async function pollDualWithRateLimitRecovery(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes) {
  return withRateLimitRecovery(config, moduleDir,
    () => pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes));
}

// ─── Rate Limit Handling ─────────────────────────────────────────────────────
// Agents or the processor sidecar can set status to RATE_LIMITED when the
// upstream API (OpenAI, Anthropic) returns 429 or equivalent.
// The pipeline pauses for a configurable cooldown, then resumes polling.
// The agent session stays alive during the pause — no kill-and-respawn.
// The timeout clock is frozen during the pause.

async function handleRateLimit(config, callerStatus, moduleDir, pauseCount = 1, maxPauses = 5) {
  const cooldownHours = config.rate_limit?.cooldown_hours ?? 2;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const resumeAt = new Date(Date.now() + cooldownMs);

  // Read caller's status for logging only — do NOT mutate it.
  // The caller may continue using their reference after we return.
  const moduleId = callerStatus.module_id || moduleDir;
  const currentPhase = callerStatus.current_phase;

  log('WARN', `Rate limit detected! Pause ${pauseCount}/${maxPauses}. Sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`);

  await discord(config, 'WARN', `Rate Limited — Pause ${pauseCount}/${maxPauses}`,
    `Module ${moduleId} hit API rate limit. Agent session preserved. Auto-resume at ${resumeAt.toLocaleTimeString()}.`, [
      { name: 'Module', value: moduleId },
      { name: 'Phase', value: currentPhase },
      { name: 'Pause', value: `${pauseCount}/${maxPauses}` },
      { name: 'Resume At', value: resumeAt.toISOString() },
    ]);

  // Load fresh status from disk, add history, save — without touching the caller's object
  const preStatus = loadStatus(config, moduleDir);
  if (preStatus) {
    addHistory(preStatus, STATUS.RATE_LIMITED, 'pipeline', `Paused ${cooldownHours}h (rate limit)`);
    saveStatus(config, moduleDir, preStatus);
  }

  // Sleep through the cooldown
  await sleep(cooldownMs);

  log('OK', 'Rate limit cooldown complete — resuming polling');
  await discord(config, 'INFO', 'Rate limit cooldown complete', `Resuming module ${moduleId}`);

  // IMPORTANT: Load FRESH status after sleep — another process may have
  // modified the file during the 2h cooldown.
  const freshStatus = loadStatus(config, moduleDir);
  if (freshStatus && freshStatus.status === STATUS.RATE_LIMITED) {
    freshStatus.status = currentPhase === 'forge' ? STATUS.IN_PROGRESS : STATUS.TESTING;
    addHistory(freshStatus, freshStatus.status, 'pipeline', 'Resumed after rate limit cooldown');
    saveStatus(config, moduleDir, freshStatus);
  }
}

// ─── Redis Completion Reader ────────────────────────────────────────────────
// Reads the Buster completion stream via direct import of redis.js.
// Single connection reused across all poll cycles — no temp files, no subprocess spawns.
//
// Archive pattern:
//   Active stream:  swarm:pipeline:<project>:completions     (current entries)
//   Archive stream: swarm:pipeline:<project>:completions:log (processed entries)
//
// Before Buster dispatch: archiveModuleCompletions() moves old entries for this
// module from active → archive, so pollDual never reads stale completions.
// After pipeline reads a completion: the entry stays in the active stream until
// the next archiveModuleCompletions() call clears it.

const COMPLETION_ARCHIVE_MAX_LEN = 1000;

let _redisModule = null;
let _redisImportAttempted = false;

async function getRedisModule(config) {
  if (_redisImportAttempted) return _redisModule;
  _redisImportAttempted = true;

  const agentConf = Object.values(config.agents || {}).find(
    a => typeof a === 'object' && a?.dispatch === 'redis' && a?.redis_js_path
  );
  const redisPath = agentConf?.redis_js_path || '/app/skills/redis.js';

  try {
    const validated = validateSafePath(redisPath, 'redis.js (completion reader)');
    const mod = await import(validated);
    _redisModule = mod.default;
    log('INFO', 'Redis module loaded via direct import');
  } catch (e) {
    log('ERROR', `Redis module import failed: ${e.message} — completion polling will fall back to Git only`);
    _redisModule = null;
  }
  return _redisModule;
}

/**
 * Archive old completion entries for a module before dispatching a new Buster attempt.
 * Moves entries from the active stream to the archive stream, preventing pollDual
 * from reading stale FAIL/PASS entries from a previous attempt.
 *
 * Called once before each Buster dispatch (not on every poll cycle).
 */
async function archiveModuleCompletions(config, moduleId) {
  const stream = completionStreamKey(config);
  const archiveStream = `${stream}:log`;

  try {
    const redisMod = await getRedisModule(config);
    if (!redisMod) return { archived: 0 };
    const result = await redisMod.archiveCompletions(stream, archiveStream, moduleId, COMPLETION_ARCHIVE_MAX_LEN);
    if (result.archived > 0) {
      log('INFO', `Archived ${result.archived} old completion(s) for ${moduleId} → ${archiveStream}`);
    }
    return result;
  } catch (e) {
    log('DEBUG', `Completion archive failed (non-critical): ${e.message}`);
    return { archived: 0 };
  }
}

async function readCompletionFromRedis(config, moduleId) {
  const stream = completionStreamKey(config);
  try {
    const redisMod = await getRedisModule(config);
    if (!redisMod) return null;
    return await redisMod.readCompletion(stream, moduleId);
  } catch {
    return null;
  }
}

// ─── Dual-Channel Polling (Redis + Git) ─────────────────────────────────────
// Checks BOTH the Redis completion stream (fast path, seconds) and
// Git-polled status.json (fallback, 30s intervals). First signal wins.
//
// This replaces pollStatus for the Buster phase only. Forge phase
// continues to use pure Git polling (Forge is ACP, no Redis signal).
// Built on pollGeneric — gitPullForPolling is handled by the scaffolding.

async function pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes) {
  return pollGeneric(config, async () => {
    // ── Channel 1: Redis Completion Stream (fast path) ──
    try {
      const redisEntry = await readCompletionFromRedis(config, moduleId);
      if (redisEntry && redisEntry.status) {
        const mappedStatus = mapRedisStatus(redisEntry.status);
        log('OK', `Redis completion: status=${redisEntry.status} mapped=${mappedStatus} source=${redisEntry.source || 'unknown'}`);

        if (expectedStatuses.includes(mappedStatus)) {
          return { done: true, result: pollResult(true, 'target_reached', {
            module_id: moduleId,
            status: mappedStatus,
            completion_summary: redisEntry.summary || null,
            forge_commit_hash: redisEntry.commit_hash || null,
            _source: 'redis',
            _redis_entry: redisEntry,
          })};
        }
        if (mappedStatus === STATUS.BLOCKED) {
          return { done: true, result: pollResult(false, 'blocked', redisEntry) };
        }
        if (mappedStatus === STATUS.RATE_LIMITED) {
          return { rate_limited: true, status: redisEntry };
        }
      }
    } catch (e) {
      log('DEBUG', `Redis poll error (non-critical): ${e.message}`);
    }

    // ── Channel 2: Git status.json (fallback) ──
    // gitPullForPolling already called by pollGeneric before this checkFn
    const status = loadStatus(config, moduleDir);

    if (!status) {
      const filePath = statusPath(config, moduleDir);
      if (fs.existsSync(filePath)) return { parse_error: true };
      return { done: false };
    }

    if (expectedStatuses.includes(status.status)) {
      return { done: true, result: pollResult(true, 'target_reached', { ...status, _source: 'git' }) };
    }
    if (status.status === STATUS.BLOCKED) {
      return { done: true, result: pollResult(false, 'blocked', status) };
    }
    if (status.status === STATUS.RATE_LIMITED) {
      return { rate_limited: true, status };
    }

    return { done: false, logMsg: `status=${status.status} phase=${status.current_phase}` };
  }, timeoutMinutes, `dual:${moduleId}`);
}

function mapRedisStatus(redisStatus) {
  const map = {
    'PASS': STATUS.PASS,
    'FAIL': STATUS.FAIL,
    'ISSUES_FOUND': STATUS.FAIL,
    'BLOCKED': STATUS.BLOCKED,
    'RATE_LIMITED': STATUS.RATE_LIMITED,
  };
  return map[(redisStatus || '').toUpperCase()] || STATUS.FAIL;
}

// ─── Git Sync (Forge → Buster handoff) ──────────────────────────────────────
// Before Buster starts, ALL Forge changes must be committed and pushed.
// The commit hash is recorded in status.json so Buster works on verified code.

async function gitSyncBeforeBuster(config, moduleDir, status) {
  log('STEP', 'Git sync: committing and pushing Forge output before Buster');

  try {
    // Commit any uncommitted Forge output + push.
    // If Forge already committed (porcelain empty), gitCommitAndPush returns committed:false.
    // In that case we STILL need to push — Forge may have committed but not pushed.
    const result = await gitCommitAndPush(config,
      `[pipeline] Module ${status.module_id}: Forge output — ready for Buster`,
      { captureHash: true }
    );

    if (!result.committed) {
      // Nothing new to commit, but ensure any existing unpushed commits get pushed
      log('INFO', 'No uncommitted changes (Forge already committed) — pushing existing commits');
      gitPullBeforePush(config);
      await gitPushWithRetry(config);
    }

    // Record commit hash (always — whether we committed or Forge did)
    const commitHash = result.hash || gitExec(config.repo_root, ['rev-parse', 'HEAD']);
    const shortHash = commitHash.substring(0, 8);

    status.forge_commit_hash = commitHash;

    // Capture diff stat so the next Forge attempt knows exactly what files
    // were changed if this attempt fails. Cheap (one git command, ~5-20 lines).
    try {
      status.forge_diff_stat = gitExec(config.repo_root, ['diff', '--stat', 'HEAD~1', 'HEAD']);
    } catch {
      status.forge_diff_stat = null; // first commit or shallow clone
    }

    addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline', `Git sync complete (${shortHash})`);
    log('OK', `Forge commit hash recorded: ${shortHash}`);

    return commitHash;
  } catch (e) {
    throw new Error(`Git sync failed before Buster handoff: ${e.message}`);
  }
}

function checkDependencies(config, progress, moduleId) {
  const mod = progress.modules[moduleId];
  if (!mod) {
    log('ERROR', `checkDependencies: module ${moduleId} not found in progress.json`);
    return { met: false, reason: `Module ${moduleId} not found` };
  }

  for (const dep of mod.depends_on || []) {
    if (dep.startsWith('gate:')) {
      const gateId = dep.replace('gate:', '');
      const gate = progress.gates[gateId];
      if (!gate) {
        log('WARN', `Dependency gate '${gateId}' not defined for module ${moduleId}`);
        return { met: false, reason: `Gate '${gateId}' not defined` };
      }

      if (gate.output_file) {
        const outPath = path.join(swarmRoot(config), gate.output_file);
        if (!fs.existsSync(outPath)) {
          log('INFO', `Dependency not met: gate '${gateId}' output file not found`);
          return { met: false, reason: `Gate '${gateId}' not completed` };
        }
        // Content-aware: a FAIL/ISSUES_FOUND/NO-GO output file is not a completed dependency
        try {
          const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
          const s = (data.status || '').toUpperCase();
          if (s === 'FAIL' || s === 'ISSUES_FOUND' || s === 'NO-GO') {
            log('INFO', `Dependency not met: gate '${gateId}' has status '${data.status}'`);
            return { met: false, reason: `Gate '${gateId}' has status '${data.status}'` };
          }
        } catch { /* non-JSON file = completed (e.g. markdown review) */ }
      }
      if (gate.type === 'buster') {
        const gsp = gateStatusPath(config, gateId);
        if (!fs.existsSync(gsp)) {
          log('INFO', `Dependency not met: gate '${gateId}' gate-status.json not found`);
          return { met: false, reason: `Gate '${gateId}' not completed` };
        }
        try {
          const gs = JSON.parse(fs.readFileSync(gsp, 'utf8'));
          if (gs.status !== STATUS.PASS && gs.status !== 'OK') {
            log('INFO', `Dependency not met: gate '${gateId}' is ${gs.status}`);
            return { met: false, reason: `Gate '${gateId}' is ${gs.status}` };
          }
        } catch {
          log('WARN', `Dependency gate '${gateId}' status file unparseable`);
          return { met: false, reason: `Gate '${gateId}' status file unparseable` };
        }
      }
    } else {
      const depMod = progress.modules[dep];
      if (!depMod) {
        log('WARN', `Dependency '${dep}' not defined in progress.json for module ${moduleId}`);
        return { met: false, reason: `Dependency '${dep}' not defined` };
      }
      const depStatus = loadStatus(config, depMod.dir);
      if (!depStatus || depStatus.status !== STATUS.PASS) {
        log('INFO', `Dependency not met: module ${dep} (${depMod.title}) is ${depStatus?.status || 'NOT_STARTED'}`);
        return { met: false, reason: `Module ${dep} (${depMod.title}) is ${depStatus?.status || 'NOT_STARTED'}` };
      }
    }
  }

  return { met: true };
}

// ─── Failure Handler ─────────────────────────────────────────────────────────

/**
 * Extract a meaningful failure reason from the agent's status.json output.
 * Agents may write their failure details to various fields — this function
 * checks them in priority order and returns the best available reason.
 * Used by callers of handleFail to always provide informative anti-pattern data.
 */
function extractAgentFailReason(status, phase) {
  // Check last history entry from the agent (not from 'pipeline')
  const agentHistory = [...(status.history || [])].reverse()
    .find(h => h.agent !== 'pipeline' && h.note);
  if (agentHistory?.note) return `[${phase}] ${agentHistory.note}`;

  // Check completion_summary (Buster sometimes writes here on fail)
  if (status.completion_summary) return `[${phase}] ${status.completion_summary}`;

  // Fallback
  return `${phase} reported FAIL (no details from agent)`;
}

async function handleFail(config, status, moduleDir, moduleId, maxFails, phase, reason, opts = {}) {
  const isTimeout = opts.isTimeout || false;
  const recalledMemoryIds = opts.recalledMemoryIds || [];

  // ALWAYS increment fail_count — this is the safety-critical counter that
  // drives BLOCKED detection and auto-retry thresholds. Without unconditional
  // increment, a missing reason would cause an infinite retry loop.
  status.fail_count++;

  if (reason) {
    status.fail_summaries.push({
      attempt: status.fail_count,
      timestamp: new Date().toISOString(),
      summary: reason,
      phase,
      is_timeout: isTimeout,
      files_changed: status.forge_diff_stat || null,
    });
  }

  // ── Memory feedback strategy ──
  // Two layers:
  //
  // 1. Targeted decay (recalledMemoryIds):
  //    Decays ONLY the specific memories that were in the agent's prompt.
  //    Applied on EVERY failure — these memories were present and the agent
  //    still failed, so they may be misleading or irrelevant.
  //    This is precise and doesn't affect unrelated memories.
  //
  // 2. Broad feedback (feedbackMemory):
  //    Updates ALL memories related to this module (by module tag).
  //    Reserved for strong signals only:
  //      fail_count >= maxFails → feedbackMemory('blocked') — definitive signal
  //    NOT called on individual failures — targeted decay handles that.
  //
  // The old over-punishment problem is solved:
  //   Old: fail_count==1 → broad decay, fail_count 2-N → nothing, maxFails → broad blocked
  //   New: every fail → precise decay of recalled memories, maxFails → broad blocked signal

  const failReason = reason || status.fail_summaries?.[status.fail_summaries.length - 1]?.summary || '';

  // Targeted decay: decay the specific memories that were in the prompt
  // (status object is mutated — decayed_memory_ids updated, persisted by saveStatus below)
  if (recalledMemoryIds.length > 0) {
    await decayRecalledMemories(config, moduleId, recalledMemoryIds, status, failReason);
  }

  // Broad feedback: only on final BLOCKED (strong definitive signal)
  if (status.fail_count >= maxFails) {
    await feedbackMemory(config, moduleId, 'blocked', failReason);
  }

  // ── Status update — single save, single git commit ──
  // BLOCKED path sets FAIL + BLOCKED in one commit instead of two.
  if (status.fail_count >= maxFails) {
    status.status = STATUS.BLOCKED;
    status.current_phase = null;
    addHistory(status, STATUS.FAIL, 'pipeline',
      `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`);
    addHistory(status, STATUS.BLOCKED, 'pipeline', `Max retries (${maxFails}) exceeded`);
    saveStatus(config, moduleDir, status);

    log('ERROR', `Module ${moduleId} BLOCKED — failed ${maxFails}x in ${phase} phase`);
    await discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED`,
      `Failed ${maxFails} times in ${phase} phase. Human intervention needed.`);
    return { exit: EXIT_BLOCKED, reason: `Max retries exceeded (${phase})`, module: moduleId, status };
  }

  status.status = STATUS.FAIL;
  status.current_phase = null;
  addHistory(status, STATUS.FAIL, 'pipeline',
    `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`);
  saveStatus(config, moduleDir, status);

  // Auto-retry vs. escalation decision:
  //   fail_count <= auto_retry_threshold → internal retry (pipeline continues)
  //   fail_count > auto_retry_threshold  → EXIT_NEEDS_NOVA (Nova must intervene)
  //   timeout                            → always EXIT_TIMEOUT (different recovery)
  const autoRetryThreshold = config.auto_retry_threshold ?? 2;
  const canAutoRetry = !isTimeout && status.fail_count <= autoRetryThreshold;

  if (canAutoRetry) {
    // Internal retry — pipeline will loop and try again with retry context
    log('INFO', `Auto-retry ${status.fail_count}/${autoRetryThreshold} — pipeline will retry internally`);
    await discord(config, 'WARN', `Module ${moduleId} FAIL (${phase}) — Auto-Retry`,
      `Attempt ${status.fail_count}/${maxFails}. Auto-retrying (${status.fail_count}/${autoRetryThreshold}).`, [
        { name: 'Phase', value: phase },
        { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
        { name: 'Auto-Retry', value: `${status.fail_count}/${autoRetryThreshold}` },
      ]);

    return {
      _retry: true,
      module: moduleId,
      module_dir: moduleDir,
      fail_count: status.fail_count,
      max_fails: maxFails,
      last_fail: status.fail_summaries[status.fail_summaries.length - 1] || null,
    };
  }

  // ── Escalation — EXIT_NEEDS_NOVA or EXIT_TIMEOUT ──
  // Build a complete context package so Nova can analyze without reading status.json.
  // Nova's agent.md defines HOW to handle this; the pipeline provides all the DATA.

  const exitCode = isTimeout ? EXIT_TIMEOUT : EXIT_NEEDS_NOVA;
  const escalationReason = isTimeout
    ? 'Agent timed out.'
    : `Auto-retry exhausted (${autoRetryThreshold}x). Nova must analyze and provide new prompt.`;

  await discord(config, 'WARN', `Module ${moduleId} ${isTimeout ? 'TIMEOUT' : 'NEEDS_NOVA'} (${phase})`,
    `Attempt ${status.fail_count}/${maxFails}. ${escalationReason}`, [
      { name: 'Phase', value: phase },
      { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
      ...(isTimeout ? [{ name: 'Type', value: 'TIMEOUT' }] : []),
      ...(!isTimeout ? [{ name: 'Action', value: 'Resume with --prompt' }] : []),
    ]);

  return buildNovaEscalation(config, status, moduleId, moduleDir, maxFails, phase, isTimeout, autoRetryThreshold);
}

/**
 * Build the complete escalation package for Nova.
 * Contains everything Nova needs to analyze the failure without reading status.json:
 * full fail history, retry state, module snapshot, and the explicit resume command.
 *
 * Separated from handleFail for readability and testability.
 */
function buildNovaEscalation(config, status, moduleId, moduleDir, maxFails, phase, isTimeout, autoRetryThreshold) {
  const exitCode = isTimeout ? EXIT_TIMEOUT : EXIT_NEEDS_NOVA;

  return {
    exit: exitCode,
    module: moduleId,
    module_dir: moduleDir,
    is_timeout: isTimeout,

    // ── Complete failure context for Nova ──
    reason: isTimeout
      ? `${phase} timed out — agent did not respond within time limit`
      : `${phase} failed ${status.fail_count}x — auto-retry exhausted, Nova must intervene`,

    // Retry state
    fail_count: status.fail_count,
    max_fails: maxFails,
    auto_retry_threshold: autoRetryThreshold,
    remaining_attempts: maxFails - status.fail_count,

    // ALL failures — not just the last one. Nova needs the full history
    // to spot patterns (e.g. "always fails in buster" vs "alternating phases")
    fail_history: status.fail_summaries.map(f => ({
      attempt: f.attempt,
      phase: f.phase,
      summary: f.summary,
      is_timeout: f.is_timeout || false,
      files_changed: f.files_changed || null,
      timestamp: f.timestamp,
    })),

    // The last failure for quick reference
    last_fail: status.fail_summaries[status.fail_summaries.length - 1] || null,

    // Current module state snapshot
    module_status: {
      status: status.status,
      current_phase: status.current_phase,
      started_at: status.started_at,
      forge_commit_hash: status.forge_commit_hash || null,
      cost: status.cost,
    },

    // How to resume — explicit command Nova can execute
    resume_command: `node pipeline.js --project ${config.project} --resume --module ${moduleId} --prompt "YOUR_NEW_APPROACH_HERE"`,
  };
}

// ─── Lint Report Generation ─────────────────────────────────────────────────
//
// Shared core for running lint-report.js. Used by:
//   1. runPreCheck()     — fast Tier 1 check after Forge, before Buster
//   2. _runReviewOnce()  — full Tier 2 report injected into reviewer prompt
//
// Returns the parsed JSON report or null on failure. Never throws —
// callers decide how to handle degradation.

/**
 * Run lint-report.js and return the parsed JSON report.
 *
 * @param {object} config - Pipeline config
 * @param {string} tier - 'pre-check' or 'full'
 * @param {object} opts
 * @param {string} opts.moduleDir - Module directory name (for --module-path)
 * @param {string} opts.moduleId - Module identifier (for temp file naming)
 * @param {string|null} opts.forgeDiffStat - forge_diff_stat from status.json (for --changed-files)
 * @param {number} opts.timeoutMs - Timeout in ms (default: 30000 for pre-check, 120000 for full)
 * @returns {{ report: object|null, error: string|null }}
 */
function generateLintReport(config, tier, opts = {}) {
  const lintReportPath = validateSafePath(
    config.pre_check?.lint_report_path || '/app/skills/lint-report.js',
    'config.pre_check.lint_report_path'
  );

  if (!fs.existsSync(lintReportPath)) {
    log('WARN', `lint-report.js not found at ${lintReportPath}`);
    return { report: null, error: `lint-report.js not found at ${lintReportPath}` };
  }

  const defaultTimeout = tier === 'pre-check' ? 30000 : 120000;
  const timeout = opts.timeoutMs || defaultTimeout;
  const outputPath = tmpFile(`lint-${tier}`, opts.moduleId || 'report', '.json');

  const args = [
    '--repo', config.repo_root,
    '--tier', tier,
    '--project', config.project,
    '--output', outputPath,
  ];

  // Pass semgrep config path if configured (platform-level, not repo-level)
  if (config.pre_check?.semgrep_config_path) {
    args.push('--semgrep-config', config.pre_check.semgrep_config_path);
  }

  if (opts.moduleDir) {
    const modRelPath = relPath(config, modulePath(config, opts.moduleDir));
    args.push('--module-path', modRelPath);
  }

  if (opts.forgeDiffStat) {
    const changedFiles = opts.forgeDiffStat
      .split('\n')
      .map(line => line.trim().split(/\s+\|/)[0]?.trim())
      .filter(f => f && !f.includes('changed') && !f.includes('insertion') && !f.includes('deletion'));

    if (changedFiles.length > 0) {
      args.push('--changed-files', changedFiles.join(','));
    }
  }

  log('STEP', `Lint report: running lint-report.js --tier ${tier}`);

  try {
    nodeExec(lintReportPath, args, { timeout, env: process.env });
  } catch (e) {
    if (!fs.existsSync(outputPath)) {
      log('WARN', `lint-report.js crashed: ${e.message?.split('\n')[0]}`);
      return { report: null, error: e.message };
    }
    // Non-zero exit with output file = errors found (expected)
  }

  try {
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const { total_errors, total_warnings, tools_ok, tools_failed } = report.summary;
    log('INFO', `Lint report (${tier}): ${total_errors} errors, ${total_warnings} warnings (${tools_ok} ok, ${tools_failed} failed)`);
    return { report, error: null };
  } catch (e) {
    log('WARN', `Lint report unparseable: ${e.message}`);
    return { report: null, error: e.message };
  }
}

/**
 * Format lint report errors into a human-readable summary for anti-pattern blocks.
 * Groups by tool, shows only errors, caps at 20 per tool.
 */
function formatLintErrors(report) {
  const errorLines = [];
  for (const [toolId, toolResult] of Object.entries(report.tools)) {
    if (toolResult.status !== 'ok' || toolResult.errors === 0) continue;
    errorLines.push(`### ${toolId}: ${toolResult.errors} error(s)`);
    const errors = (toolResult.findings || []).filter(f => f.severity === 'error');
    for (const finding of errors.slice(0, 20)) {
      const loc = finding.line ? `:${finding.line}` : '';
      errorLines.push(`- \`${finding.file || '?'}${loc}\`: ${finding.message}${finding.code ? ` (${finding.code})` : ''}`);
    }
    if (errors.length > 20) {
      errorLines.push(`- ... and ${errors.length - 20} more`);
    }
    errorLines.push('');
  }
  return errorLines.join('\n');
}

/**
 * Format lint report as a structured block for injection into a reviewer prompt.
 * Includes both errors and warnings, grouped by tool.
 */
function formatLintReportForReviewer(report) {
  const lines = [
    '## 📊 STATIC ANALYSIS REPORT (Automated)',
    '',
    `**Tier:** ${report.tier} | **Timestamp:** ${report.timestamp}`,
    `**Summary:** ${report.summary.total_errors} errors, ${report.summary.total_warnings} warnings`,
    `**Tools:** ${report.summary.tools_ok} passed, ${report.summary.tools_skipped} skipped, ${report.summary.tools_failed} failed`,
    '',
  ];

  if (report.changed_files?.length > 0) {
    lines.push(`**Scoped to changed files:** ${report.changed_files.join(', ')}`, '');
  }

  for (const [toolId, toolResult] of Object.entries(report.tools)) {
    if (toolResult.status === 'skipped') continue;

    if (toolResult.status === 'error') {
      lines.push(`### ❌ ${toolId} — TOOL ERROR`, `Error: ${toolResult.error}`, '');
      continue;
    }

    if (toolResult.errors === 0 && toolResult.warnings === 0) {
      lines.push(`### ✅ ${toolId} — clean`);
      continue;
    }

    lines.push(`### ${toolResult.errors > 0 ? '🔴' : '🟡'} ${toolId} — ${toolResult.errors} errors, ${toolResult.warnings} warnings`);
    lines.push('');

    const findings = toolResult.findings || [];
    for (const finding of findings.slice(0, 30)) {
      const loc = finding.line ? `:${finding.line}` : '';
      const icon = finding.severity === 'error' ? '🔴' : '🟡';
      lines.push(`${icon} \`${finding.file || '?'}${loc}\`: ${finding.message}${finding.code ? ` (${finding.code})` : ''}`);
    }
    if (findings.length > 30) {
      lines.push(`... and ${findings.length - 30} more findings`);
    }
    lines.push('');
  }

  lines.push('---', '');
  return lines.join('\n');
}

// ─── Pre-Check (Forge Output Validation) ────────────────────────────────────
//
// Runs fast Tier 1 analysis on Forge output BEFORE handing off to Buster.
// On failure: routes to handleFail with pre_check phase — Forge gets the
// exact errors as anti-patterns and can retry immediately.

/**
 * Run pre-check static analysis on Forge output.
 *
 * @param {object} config - Pipeline config
 * @param {string} moduleDir - Module directory name
 * @param {object} status - Module status object (for forge_diff_stat)
 * @param {string} moduleId - Module identifier
 * @returns {{ passed: boolean, report: object|null, error: string|null }}
 */
async function runPreCheck(config, moduleDir, status, moduleId) {
  if (config.pre_check?.enabled === false) {
    log('INFO', 'Pre-check disabled via config');
    return { passed: true, report: null, error: null };
  }

  const timeout = (config.pre_check?.timeout_seconds || 30) * 1000;
  const { report, error } = generateLintReport(config, 'pre-check', {
    moduleDir,
    moduleId,
    forgeDiffStat: status.forge_diff_stat,
    timeoutMs: timeout,
  });

  if (!report) {
    log('WARN', `Pre-check skipped: ${error}`);
    return { passed: true, report: null, error };
  }

  if (report.summary.total_errors === 0) {
    log('OK', 'Pre-check passed — no errors found');
    return { passed: true, report, error: null };
  }

  const errorSummary = `PRE-CHECK FAILED: ${report.summary.total_errors} static analysis error(s) in Forge output.\n\n` +
    formatLintErrors(report);

  log('WARN', `Pre-check failed: ${report.summary.total_errors} errors — routing to handleFail`);
  return { passed: false, report, error: errorSummary };
}

// ─── Forge Prompt Assembly ───────────────────────────────────────────────────
//
// Builds the complete prompt for a Forge agent, with explicit priority hierarchy.
// A fresh agent sees this as its ONLY input — the priority header eliminates
// ambiguity when sections contain conflicting guidance.
//
// Priority hierarchy (listed in header, enforced by agent):
//   1. Nova directive (if present — Nova outranks everything)
//   2. Anti-patterns from failures (what NOT to do)
//   3. FORGE.md base instructions (what TO do)
//   4. Memory context (supplementary learnings, may be outdated)
//
// Text order (optimized for LLM attention — "lost in the middle" mitigation):
//   Priority header → Nova → FORGE.md → Anti-patterns → Memory

async function buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt) {
  // ── Base instructions ──
  let baseInstructions;
  try { baseInstructions = readForgeInstructions(config, dir, mod); }
  catch (e) { return { error: e.message }; }

  const isRetry = status.status === STATUS.FAIL && status.fail_summaries.length > 0;
  const hasNova = !!novaPrompt;

  // ── Module context block ──
  // Factual orientation so Forge knows WHERE it's working, WHAT state things are in,
  // and WHICH attempt this is — without wasting tokens on `pwd`, `find .`, `git log`.
  const forgeCwd = config.agents?.forge?.cwd || config.repo_root;
  const contextBlock = [
    '## 🔧 MODULE CONTEXT',
    '',
    `**Project:** ${config.project}`,
    `**Module:** ${moduleId} — ${mod.title}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Module Path:** \`${relPath(config, modulePath(config, dir))}\``,
    `**Status JSON:** \`${relPath(config, statusPath(config, dir))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Working Directory:** \`${forgeCwd}\``,
    `**Current Status:** ${status.status}`,
    `**Attempt:** ${status.fail_count + 1}/${maxFails}`,
    `**Stages:** ${(mod.stages || ['forge', 'buster']).join(' → ')}`,
    status.forge_commit_hash
      ? `**Last Forge Commit:** \`${status.forge_commit_hash.substring(0, 8)}\``
      : '',
    '',
    'All file paths in your instructions below are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before creating or modifying any files.`,
    '',
    '---',
    '',
  ].filter(Boolean).join('\n');

  // ── Anti-pattern block (retry only) ──
  // Frames previous failures as explicit ANTI-PATTERNS rather than vague "try something else".
  // This gives the agent concrete negative constraints alongside the positive instructions.
  let antiPatternBlock = '';
  if (isRetry) {
    const summaries = status.fail_summaries;
    const antiPatterns = summaries.map((f, i) => {
      const label = f.is_timeout ? 'TIMEOUT' : 'FAILED';
      let entry = `${i + 1}. [${label} in ${f.phase}] ${f.summary}`;
      if (f.files_changed) {
        entry += `\n   _Files changed:_ \`\`\`\n   ${f.files_changed.split('\n').join('\n   ')}\n   \`\`\``;
      }
      return entry;
    });

    antiPatternBlock = [
      '',
      '---',
      '',
      `## ⛔ ANTI-PATTERNS — Known Failed Approaches (Attempt ${status.fail_count + 1}/${maxFails})`,
      '',
      'The following approaches have been tried and FAILED. Do NOT repeat them.',
      'Each is a concrete anti-pattern — understand WHY it failed and avoid the root cause.',
      '',
      ...antiPatterns,
      '',
      'Your job: deliver a working implementation that avoids ALL of the above.',
      'If the same root cause keeps appearing, the architecture may need a different approach entirely.',
      '',
    ].join('\n');
  }

  // ── Nova directive ──
  let novaBlock = '';
  if (hasNova) {
    novaBlock = [
      '',
      '---',
      '',
      '## 🔴 NOVA DIRECTIVE (Highest Priority)',
      '',
      'Nova has analyzed the previous failures and determined a specific new approach.',
      'This directive OVERRIDES any conflicting guidance from other sections.',
      '',
      novaPrompt,
      '',
    ].join('\n');
    log('INFO', `Nova prompt override injected (${novaPrompt.length} chars)`);
  }

  // ── Memory recall ──
  // On retry: pass fail summaries as negative context so the query can
  // de-prioritize memories that match the failed approach.
  let memoryBlock = '';
  let recalledMemoryIds = [];
  if (config.memory?.recall_before_forge !== false) {
    const additionalCtx = mod.substeps ? mod.substeps.join(', ') : '';
    const failContext = isRetry
      ? status.fail_summaries.map(f => f.summary).join('; ')
      : '';
    const { block, count, ids } = await recallForModule(
      config, moduleId, mod.title, additionalCtx, failContext
    );
    if (block) {
      memoryBlock = block;
      recalledMemoryIds = ids || [];
      log('INFO', `${count} memories injected into Forge prompt (${recalledMemoryIds.length} IDs tracked for decay)`);
    }
  }

  // ── Priority header (only when multiple sections are present) ──
  let priorityHeader = '';
  if (isRetry || hasNova || memoryBlock) {
    const sections = [];
    if (hasNova)          sections.push('1. **NOVA DIRECTIVE** — highest authority, overrides everything');
    if (isRetry)          sections.push(`${hasNova ? '2' : '1'}. **ANTI-PATTERNS** — concrete constraints, must be avoided`);
    sections.push(`${sections.length + 1}. **FORGE.md** — base implementation instructions`);
    if (memoryBlock)      sections.push(`${sections.length + 1}. **MEMORY CONTEXT** — supplementary, may be outdated or irrelevant`);

    priorityHeader = [
      '## 📋 INSTRUCTION PRIORITY (Read First)',
      '',
      'This prompt contains multiple sections. When they conflict, follow this priority:',
      '',
      ...sections,
      '',
      'When in doubt, higher-priority sections win.',
      '',
      '---',
      '',
    ].join('\n');
  }

  // ── Forge Completion Protocol ──
  const statusJsonPath = relPath(config, statusPath(config, dir));
  const completionBlock = [
    '',
    '---',
    '',
    '## 🚨 CRITICAL — YOUR FINAL STEPS (DO NOT SKIP)',
    '',
    'When your implementation is complete, you MUST do the following before your session ends:',
    '',
    `**Step 1:** Update \`${statusJsonPath}\` to signal readiness:`,
    '```bash',
    `cd ${config.repo_root}`,
    `cat ${statusJsonPath} | jq '.status = "READY_FOR_TESTING" | .current_phase = "forge"' > /tmp/status_update.json`,
    `mv /tmp/status_update.json ${statusJsonPath}`,
    '```',
    '',
    '**Step 2:** Commit and push ALL changes:',
    '```bash',
    'git add -A',
    'git commit -m "[forge] Module complete: <brief description>"',
    'git push origin',
    '```',
    '',
    'Both steps are mandatory. Without them, the pipeline cannot detect your work.',
    'Do NOT set status to "PASS" — only Buster can promote to PASS after testing.',
    'This must be the LAST thing you do.',
    '',
  ].join('\n');

  // ── Assemble final prompt ──
  // Order optimized for LLM attention patterns ("lost in the middle" effect):
  //   - Context block first (factual orientation — not an instruction, no priority conflict)
  //   - Priority header + Nova at the start (primacy bias → highest-priority items)
  //   - FORGE.md as baseline in the middle (bulk content, read as the "plan")
  //   - Anti-patterns near the end (recency bias → constraints stick better)
  //   - Memory last (lowest priority, recency compensated by priority header caveat)
  //   - Completion protocol at the very end (recency bias → final action sticks)
  // Note: Priority NUMBERING in the header is unchanged — it describes authority
  // hierarchy (Nova > Anti-Patterns > FORGE.md > Memory), not document order.
  const prompt = contextBlock + priorityHeader + novaBlock + baseInstructions + antiPatternBlock + memoryBlock + completionBlock;
  return { prompt, recalledMemoryIds };
}

// ─── Module Runner ───────────────────────────────────────────────────────────
//
// Orchestrator for a single module. The retry loop is a clean 5-line wrapper
// around executeModuleAttempt(), which handles one complete Forge→Buster cycle.
//
// executeModuleAttempt returns:
//   { retry: true }           → loop continues (auto-retry)
//   { retry: false, result }  → loop exits with result

async function runModule(config, progress, moduleId, opts = {}) {
  const mod = progress.modules[moduleId];
  if (!mod) throw new Error(`Module ${moduleId} not in progress.json`);

  const dir = mod.dir;
  const timeout = mod.timeout_minutes ?? config.default_timeout_minutes;
  const maxFails = mod.max_fails ?? config.default_max_fails;
  const novaPrompt = opts.novaPrompt || null;

  // Set logging context for this module
  LOG_MODULE = moduleId;
  LOG_PHASE = null;

  log('STEP', `═══════════════════════════════════════════════════`);
  log('STEP', `  MODULE ${moduleId}: ${mod.title}`);
  log('STEP', `  Stages: ${(mod.stages || ['forge', 'buster']).join(' → ')}`);
  log('STEP', `═══════════════════════════════════════════════════`);

  // ── Dependencies (checked once, before any attempt) ──
  const deps = checkDependencies(config, progress, moduleId);
  if (!deps.met) {
    log('ERROR', `Module ${moduleId} dependencies not met: ${deps.reason}`);
    return { exit: EXIT_ERROR, reason: `Dependencies not met: ${deps.reason}` };
  }

  // ── Retry loop ──
  // Each iteration re-reads status from disk so fail_count, fail_summaries,
  // and retry context are always fresh after handleFail writes them.
  while (true) {
    const attempt = await executeModuleAttempt(
      config, progress, moduleId, mod, dir, timeout, maxFails, novaPrompt
    );
    if (!attempt.retry) return attempt.result;
    log('INFO', `Retry loop continuing — attempt ${attempt.fail_count}/${maxFails}`);
    await sleep(5000); // Allow gateway to release session labels before retry
  }
}

/**
 * Execute one complete module attempt. Stages determine which phases run:
 *   ['forge', 'buster'] — full cycle (default)
 *   ['forge']           — build only, PASS after Forge
 *   ['buster']          — test only, skip Forge
 *
 * @returns {{ retry: true, fail_count: number }} - auto-retry, loop again
 * @returns {{ retry: false, result: object }}    - done (PASS, BLOCKED, EXIT_*)
 */
async function executeModuleAttempt(config, progress, moduleId, mod, dir, timeout, maxFails, novaPrompt) {

  // Track memory IDs that were injected into the Forge prompt for this attempt.
  // If the module fails (in forge OR buster), these specific memories get decayed.
  // Declared here so the IDs survive from forge phase through buster phase.
  let recalledMemoryIds = [];

  // ── Load or init status ──
  let status = loadStatus(config, dir);

  if (status?.status === STATUS.PASS) {
    log('OK', `Module ${moduleId} already PASS — skipping`);
    return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
  }
  if (status?.status === STATUS.BLOCKED) {
    log('WARN', `Module ${moduleId} is BLOCKED — cannot proceed`);
    return { retry: false, result: { exit: EXIT_BLOCKED, reason: `Module ${moduleId} is BLOCKED`, module: moduleId } };
  }

  // ── Release blueprint if needed ──
  // CRITICAL: Distinguish "file doesn't exist" (→ init) from "file exists but corrupt"
  // (→ error). loadStatus returns null for both cases. If status.json EXISTS on disk
  // but couldn't parse, we must NOT release a blueprint — that would overwrite
  // existing Forge output with the architecture-branch template.
  const statusFileExists = fs.existsSync(statusPath(config, dir));
  if (!status && statusFileExists) {
    log('ERROR', `status.json for ${moduleId} is corrupt — aborting to prevent data loss`);
    return { retry: false, result: {
      exit: EXIT_ERROR,
      reason: `status.json for ${moduleId} exists but is unparseable (corrupt). ` +
        `Pipeline cannot safely proceed — blueprint release would overwrite existing work. ` +
        `Inspect: ${statusPath(config, dir)}`,
      module: moduleId,
    }};
  }
  if (!status || status.status === STATUS.PENDING) {
    try {
      await releaseBlueprint(config, progress, moduleId, dir, mod.stages || ['forge', 'buster']);
    } catch (e) {
      log('ERROR', `Blueprint release failed: ${e.message}`);
      return { retry: false, result: {
        exit: EXIT_NEEDS_NOVA,
        reason: `Blueprint release failed: ${e.message}. Nova may need to create/fix the architecture branch.`,
        module: moduleId,
        resume_command: `node pipeline.js --project ${config.project} --resume --module ${moduleId}`,
      }};
    }
    if (!status) {
      status = initStatus(moduleId, mod);
      saveStatus(config, dir, status);
    }
  }

  // ── Determine stages and resume point ──
  // Stages control which phases run for this module.
  // Default: ['forge', 'buster'] (full build+test cycle).
  // Examples: ['forge'] = build only, ['buster'] = test only.
  const stages = mod.stages || ['forge', 'buster'];

  log('INFO', `Module ${moduleId}: entering attempt (status=${status?.status || 'NEW'}, ` +
    `fail_count=${status?.fail_count || 0}, stages=${stages.join('+')})`);

  const needsForge = stages.includes('forge')
    && [STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.FAIL].includes(status.status)
    && status.current_phase !== 'buster';
  const needsBuster = stages.includes('buster')
    && (status.status === STATUS.READY_FOR_TESTING
      || (status.status === STATUS.TESTING && status.current_phase === 'buster'));

  // ──────────────────────────────────────────────────────────────────────────
  //  FORGE PHASE
  // ──────────────────────────────────────────────────────────────────────────
  if (needsForge) {
    LOG_PHASE = 'forge';
    const forgeModel = resolveModel('forge', config, progress, mod.forge_model);
    const forgeHarness = modelToHarness(forgeModel) || config.agents?.forge?.acp_agent_id || 'forge';
    log('STEP', `Phase: FORGE (harness: ${forgeHarness}, model: ${forgeModel})`);

    // Build complete prompt with priority hierarchy and anti-pattern framing
    const promptResult = await buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt);
    if (promptResult.error) {
      log('ERROR', `Forge prompt assembly failed: ${promptResult.error}`);
      return { retry: false, result: { exit: EXIT_ERROR, reason: promptResult.error } };
    }
    const forgePrompt = promptResult.prompt;
    recalledMemoryIds = promptResult.recalledMemoryIds || [];

    savePrompt(config, dir, 'forge', status.fail_count + 1, forgePrompt);

    status.status = STATUS.IN_PROGRESS;
    status.current_phase = 'forge';
    if (!status.started_at) status.started_at = new Date().toISOString();
    addHistory(status, STATUS.IN_PROGRESS, 'pipeline', `Forge started (${forgeHarness})`);
    saveStatus(config, dir, status);

    await discord(config, 'INFO', `Module ${moduleId} started`, mod.title, [
      { name: 'Model', value: forgeModel },
      { name: 'Harness', value: forgeHarness },
      { name: 'Attempt', value: `${status.fail_count + 1}/${maxFails}` },
    ]);

    setShutdownContext(config, 'forge', moduleId, dir);

    // Capture HEAD before Forge starts — used for stall detection in pollStatus
    invalidateHeadHash();
    const headBeforeForge = headHash();
    const forgeSessionLabel = acpLabel('forge', moduleId);

    // Spawn fresh Forge session
    try { await spawnAgent(config, progress, 'forge', moduleId, forgeModel, forgePrompt); }
    catch (e) {
      log('ERROR', `Forge agent spawn failed: ${e.message}`);
      clearShutdownContext();
      return { retry: false, result: { exit: EXIT_ERROR, reason: `Forge spawn failed: ${e.message}` } };
    }

    // Early health check — catch silent spawn failures (OOM, bad model, gateway down)
    // in ~8 seconds instead of waiting the full timeout (up to 60 minutes).
    if (!(await verifyAgentAlive(config, 'forge', moduleId))) {
      await killAgent(config, 'forge', moduleId);
      clearShutdownContext();
      const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
        'Forge agent failed health check — session not running after spawn', { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    // Poll — dual channel: status.json + ACP session state.
    // If Forge's session ends and HEAD moved, pollStatus auto-advances to READY_FOR_TESTING.
    const result = await pollWithRateLimitRecovery(config, dir,
      [STATUS.READY_FOR_TESTING, STATUS.FAIL, STATUS.BLOCKED], timeout,
      { sessionLabel: forgeSessionLabel, headBefore: headBeforeForge });

    // ALWAYS destroy session — kill-and-respawn strategy
    // Graceful (wait for idle + summary) only on successful completion
    const forgeStreamPath = _shutdownState.activeSessions.get(forgeSessionLabel)?.streamLogPath;
    await killAgent(config, 'forge', moduleId, result.ok);
    saveStreamLog(config, dir, 'forge', status.fail_count + 1, forgeStreamPath);
    clearShutdownContext();

    if (!result.ok) {
      status = loadStatus(config, dir) || status;

      if (result.reason === 'session_ended_no_changes') {
        const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
          'Forge session ended but produced no commits — agent may have crashed or errored', { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }

      if (result.reason === 'timeout') {
        const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
          `TIMEOUT: Forge did not complete within ${timeout} minutes`, { isTimeout: true, recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }
      if (result.reason === 'rate_limit_exhausted') {
        log('ERROR', `Module ${moduleId} rate limit pauses exhausted in forge phase`);
        await discord(config, 'CRITICAL', `Module ${moduleId} RATE LIMITED`,
          `Exceeded max rate limit pauses. Pipeline cannot continue.`);
        return { retry: false, result: {
          exit: EXIT_RATE_LIMITED,
          reason: 'Rate limit pauses exceeded maximum — pipeline halted',
          module: moduleId, module_dir: dir,
        }};
      }
      if (result.reason === 'parse_corrupted') {
        const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
          'status.json is permanently corrupted (unparseable after multiple attempts)', { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }

      // blocked or FAIL without details
      const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
        extractAgentFailReason(status, 'forge'), { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    status = loadStatus(config, dir) || status;

    if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
      const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
        extractAgentFailReason(status, 'forge'), { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    // ── Pipeline guarantee: READY_FOR_TESTING ──
    // Forge may have committed code but forgotten to update status.json.
    // The pipeline owns the state machine — if Forge produced changes and
    // didn't set a terminal status (FAIL/BLOCKED), force READY_FOR_TESTING.
    if (status.status !== STATUS.READY_FOR_TESTING) {
      log('WARN', `Forge finished but status is '${status.status}' instead of READY_FOR_TESTING — pipeline forcing advancement`);
      status.status = STATUS.READY_FOR_TESTING;
      addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline',
        'Pipeline forced READY_FOR_TESTING: Forge completed with changes but did not update status.json');
      saveStatus(config, dir, status);
      await discord(config, 'WARN', `Module ${moduleId} — forced READY_FOR_TESTING`,
        'Forge completed but did not update status.json. Pipeline advanced automatically.');
    }

    log('OK', 'Forge complete → READY_FOR_TESTING');

    // ── Discord: Forge completion summary ──
    const forgeDurationSec = Math.round((Date.now() - new Date(status.started_at).getTime()) / 1000);
    const forgeNextStep = stages.includes('buster') ? 'Buster' : 'done (no Buster)';
    await discord(config, 'OK', `Module ${moduleId} Forge complete → ${forgeNextStep}`, mod.title, [
      { name: 'Forge Duration', value: `${Math.round(forgeDurationSec / 60)}min` },
      { name: 'Model', value: forgeModel },
      { name: 'Attempt', value: `${status.fail_count + 1}/${maxFails}` },
    ]);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  FORGE-ONLY PASS (no Buster in stages)
  //  When stages = ['forge'], READY_FOR_TESTING is the terminal state.
  //  Promote directly to PASS — there's no Buster to run tests.
  // ──────────────────────────────────────────────────────────────────────────
  if (!stages.includes('buster') && status.status === STATUS.READY_FOR_TESTING) {
    log('INFO', 'No buster in stages — promoting READY_FOR_TESTING → PASS');

    // Still commit+push so the code is on origin
    try {
      await gitCommitAndPush(config, `[pipeline] Module ${moduleId}: Forge output (no buster)`, { softFail: true });
    } catch { /* non-critical */ }

    status.status = STATUS.PASS;
    status.completed_at = new Date().toISOString();
    status.current_phase = null;
    status.decayed_memory_ids = [];
    if (status.started_at) {
      status.cost.total_duration_seconds = Math.round(
        (new Date(status.completed_at) - new Date(status.started_at)) / 1000
      );
    }
    addHistory(status, STATUS.PASS, 'pipeline', 'Forge-only module — no Buster phase');
    saveStatus(config, dir, status);

    await discord(config, 'OK', `Module ${moduleId} PASS ✓ (forge-only)`, mod.title, [
      { name: 'Duration', value: `${Math.round(status.cost.total_duration_seconds / 60)}min` },
      { name: 'Stages', value: stages.join(', ') },
    ]);

    log('OK', `Module ${moduleId} PASS (forge-only)`);
    LOG_MODULE = null;
    LOG_PHASE = null;

    await feedbackMemory(config, moduleId, 'pass');
    return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  BUSTER-ONLY PROMOTION (no Forge in stages)
  //  When stages = ['buster'], there's no Forge to set READY_FOR_TESTING.
  //  Promote PENDING/FAIL → READY_FOR_TESTING so the Buster phase can start.
  // ──────────────────────────────────────────────────────────────────────────
  if (!stages.includes('forge') && stages.includes('buster')
      && [STATUS.PENDING, STATUS.FAIL].includes(status.status)) {
    log('INFO', 'No forge in stages — promoting to READY_FOR_TESTING for buster-only run');
    if (!status.started_at) status.started_at = new Date().toISOString();
    status.status = STATUS.READY_FOR_TESTING;
    addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline', 'Buster-only module — skipping Forge');
    saveStatus(config, dir, status);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  PRE-CHECK (Forge output validation)
  //  Fast static analysis (tsc, ruff, shellcheck) on Forge output.
  //  Catches type errors in seconds instead of burning a 45-min Buster cycle.
  //  Only runs when Forge produced output AND Buster will follow.
  //  On failure: handleFail with pre_check phase → Forge retry with errors.
  // ──────────────────────────────────────────────────────────────────────────
  if (stages.includes('forge') && stages.includes('buster')
      && status.status === STATUS.READY_FOR_TESTING && needsForge) {

    const preCheckResult = await runPreCheck(config, dir, status, moduleId);

    if (!preCheckResult.passed) {
      log('WARN', `Pre-check failed for ${moduleId} — routing to Forge retry (skipping Buster)`);
      await discord(config, 'WARN', `Module ${moduleId} PRE-CHECK FAIL`,
        `Static analysis found errors in Forge output. Retrying without Buster.`, [
          { name: 'Errors', value: String(preCheckResult.report?.summary?.total_errors || '?') },
          { name: 'Phase', value: 'pre_check' },
        ]);

      const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'pre_check',
        preCheckResult.error, { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  GIT SYNC (Forge → Buster handoff)
  //  Ensures Buster always works on committed, pushed code.
  //  Records commit hash in status.json for traceability.
  // ──────────────────────────────────────────────────────────────────────────
  if (stages.includes('buster') && (needsBuster || status.status === STATUS.READY_FOR_TESTING)) {
    try {
      await gitSyncBeforeBuster(config, dir, status);
      saveStatus(config, dir, status);
    } catch (e) {
      log('ERROR', `Git sync before Buster failed: ${e.message}`);
      return { retry: false, result: { exit: EXIT_ERROR, reason: e.message } };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  BUSTER PHASE
  //  Enters on READY_FOR_TESTING (normal flow) or TESTING+buster (resume after interrupt).
  // ──────────────────────────────────────────────────────────────────────────
  if (status.status === STATUS.READY_FOR_TESTING
      || (status.status === STATUS.TESTING && status.current_phase === 'buster')) {
    LOG_PHASE = 'buster';
    const busterModel = resolveModel('buster', config, progress);
    log('STEP', `Phase: BUSTER (model: ${busterModel})`);

    // Buster subagent crash retry loop.
    // Crashes (orchestrator-detected, timeouts) retry the Buster dispatch directly
    // instead of going back to Forge. Status stays at READY_FOR_TESTING.
    // Only real test failures (source: 'agent') or exhausted retries go to handleFail → Forge.
    const maxBusterCrashRetries = mod.max_buster_crash_retries ?? config.max_buster_crash_retries ?? 2;

    for (let busterAttempt = 1; busterAttempt <= maxBusterCrashRetries + 1; busterAttempt++) {
      const isLastBusterAttempt = busterAttempt > maxBusterCrashRetries;

      let busterPrompt;
      {
        const promptResult = buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails);
        if (promptResult.error) {
          log('ERROR', `Buster prompt build failed for ${moduleId}: ${promptResult.error}`);
          return { retry: false, result: { exit: EXIT_ERROR, reason: promptResult.error } };
        }
        busterPrompt = promptResult.prompt;
      }

      savePrompt(config, dir, 'buster', status.fail_count + 1, busterPrompt);

      status.status = STATUS.TESTING;
      status.current_phase = 'buster';
      addHistory(status, STATUS.TESTING, 'pipeline',
        `Buster started (subagent attempt ${busterAttempt}/${maxBusterCrashRetries + 1})`);
      saveStatus(config, dir, status);

      setShutdownContext(config, 'buster', moduleId, dir);

      // Archive old completion entries for this module before dispatching.
      // Prevents pollDual from reading stale FAIL/PASS from a previous attempt.
      await archiveModuleCompletions(config, moduleId);

      try { await spawnAgent(config, progress, 'buster', moduleId, busterModel, busterPrompt, {
        status, taskType: 'module_test', run_id: RUN_ID, attempt: status.fail_count + 1,
      }); }
      catch (e) {
        log('ERROR', `Buster agent spawn failed: ${e.message}`);
        clearShutdownContext();
        return { retry: false, result: { exit: EXIT_ERROR, reason: `Buster spawn failed: ${e.message}` } };
      }

      const result = await pollDualWithRateLimitRecovery(config, dir, moduleId,
        [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED], timeout);

      // Kill agent session (safety net — Processor should have killed already after completion)
      await killAgent(config, 'buster', moduleId);
      clearShutdownContext();

      // ── Poll failed (timeout, parse error, etc.) ──
      if (!result.ok) {
        status = loadStatus(config, dir) || status;

        if (result.reason === 'rate_limit_exhausted') {
          log('ERROR', `Module ${moduleId} rate limit pauses exhausted in buster phase`);
          await discord(config, 'CRITICAL', `Module ${moduleId} RATE LIMITED (Buster)`,
            `Exceeded max rate limit pauses during testing.`);
          return { retry: false, result: {
            exit: EXIT_RATE_LIMITED,
            reason: 'Rate limit pauses exceeded maximum during Buster phase',
            module: moduleId, module_dir: dir,
          }};
        }

        // Crash-retryable: timeout, parse corruption, catch-all
        if (!isLastBusterAttempt) {
          const reason = result.reason === 'timeout'
            ? `Buster timed out (${timeout}min)`
            : result.reason === 'parse_corrupted'
              ? 'status.json corrupted'
              : `Poll failed: ${result.reason}`;
          log('WARN', `Buster subagent crash (attempt ${busterAttempt}/${maxBusterCrashRetries + 1}): ${reason} — retrying Buster`);
          await discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
            `${reason}. Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`);

          // Reset to READY_FOR_TESTING for next Buster attempt
          status.status = STATUS.READY_FOR_TESTING;
          addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline',
            `Buster subagent crashed — retrying (${busterAttempt}/${maxBusterCrashRetries})`);
          saveStatus(config, dir, status);
          continue; // → next busterAttempt
        }

        // Last attempt exhausted — BLOCKED, not handleFail.
        // Buster crashing repeatedly is an infrastructure problem, not a code problem.
        // Forge can't fix it. Requires human intervention.
        log('ERROR', `Buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);

        status.status = STATUS.BLOCKED;
        status.current_phase = 'buster';
        addHistory(status, STATUS.BLOCKED, 'pipeline',
          `Buster subagent crashed ${maxBusterCrashRetries + 1} times without producing a test result. Infrastructure issue — Forge cannot fix this.`);
        saveStatus(config, dir, status);

        await discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
          `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
            { name: 'Last Reason', value: result.reason || 'unknown' },
            { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
          ]);

        return { retry: false, result: {
          exit: EXIT_BLOCKED,
          reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
          module: moduleId, module_dir: dir,
        }};
      }

      // ── Poll succeeded (terminal status reached) ──
      status = loadStatus(config, dir) || status;

      // Trust Redis over stale status.json
      const redisEntry = result.status?._redis_entry;
      if (redisEntry?.status) {
        const redisStatus = mapRedisStatus(redisEntry.status);
        if ([STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(redisStatus) &&
            ![STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(status.status)) {
          log('WARN', `status.json shows '${status.status}' but Redis says '${redisStatus}' — trusting Redis`);
          status.status = redisStatus;
          if (redisEntry.summary) {
            status.fail_summaries = status.fail_summaries || [];
            status.fail_summaries.push(redisEntry.summary);
          }
          saveStatus(config, dir, status);
        }
      }

      // ── PASS ──
      if (status.status === STATUS.PASS) {
        status.completed_at = new Date().toISOString();
        status.current_phase = null;
        status.decayed_memory_ids = [];
        if (status.started_at) {
          status.cost.total_duration_seconds = Math.round(
            (new Date(status.completed_at) - new Date(status.started_at)) / 1000
          );
        }
        saveStatus(config, dir, status);

        await discord(config, 'OK', `Module ${moduleId} PASS ✓`, mod.title, [
          { name: 'Duration', value: `${Math.round(status.cost.total_duration_seconds / 60)}min` },
          { name: 'Attempts', value: `${status.fail_count + 1}` },
        ]);

        log('OK', `Module ${moduleId} PASS`);

        LOG_MODULE = null;
        LOG_PHASE = null;

        await feedbackMemory(config, moduleId, 'pass');

        return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
      }

      // ── FAIL / BLOCKED ──
      if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
        // Check if this was a subagent crash (orchestrator-detected) or a real test failure
        const source = redisEntry?.source || 'unknown';
        const isCrash = /^orchestrator/i.test(source);

        if (isCrash && !isLastBusterAttempt) {
          log('WARN', `Buster subagent crashed (source: ${source}, attempt ${busterAttempt}/${maxBusterCrashRetries + 1}) — retrying Buster`);
          await discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
            `Subagent crashed (source: ${source}). Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`);

          // Reset to READY_FOR_TESTING — don't count as fail_count (that's for Forge retries)
          status.status = STATUS.READY_FOR_TESTING;
          addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline',
            `Buster subagent crashed (source: ${source}) — retrying (${busterAttempt}/${maxBusterCrashRetries})`);
          saveStatus(config, dir, status);
          continue; // → next busterAttempt
        }

        // Real test failure → handleFail (goes to Forge)
        // Crash retries exhausted → BLOCKED (infrastructure issue)
        if (isCrash) {
          log('ERROR', `Buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);

          status.status = STATUS.BLOCKED;
          status.current_phase = 'buster';
          addHistory(status, STATUS.BLOCKED, 'pipeline',
            `Buster subagent crashed ${maxBusterCrashRetries + 1} times (source: ${source}). Infrastructure issue — Forge cannot fix this.`);
          saveStatus(config, dir, status);

          await discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
            `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
              { name: 'Source', value: source },
              { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
            ]);

          return { retry: false, result: {
            exit: EXIT_BLOCKED,
            reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
            module: moduleId, module_dir: dir,
          }};
        }

        // Real test failure from agent → Forge retry
        const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'buster',
          extractAgentFailReason(status, 'buster'), { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }

      // Unexpected status — break out of retry loop
      break;
    } // end busterAttempt loop
  }

  LOG_MODULE = null;
  LOG_PHASE = null;
  log('ERROR', `Module ${moduleId} ended in unexpected status: ${status?.status}`);
  return { retry: false, result: { exit: EXIT_ERROR, reason: `Unexpected status: ${status?.status}` } };
}

// ─── Gate Runner ─────────────────────────────────────────────────────────────

function gateStatusPath(config, gateId) {
  return path.join(swarmRoot(config), `${gateId}-gate-status.json`);
}

/**
 * Run a single Buster gate attempt: spawn -> poll -> kill -> interpret.
 * Returns the poll result for the caller to handle.
 * @private
 */
async function _runBusterGateOnce(config, progress, gateId, gate, model, timeout, instructions, attempt) {
  const commitHash = headHash() || gitExec(config.repo_root, ['rev-parse', '--short', 'HEAD']);
  const busterPrompt = buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt);

  // Save gate prompt for debugging
  try {
    const gateDir = gate.instructions_file ? gate.instructions_file.split('/')[0] : gateId;
    const promptDir = path.join(swarmRoot(config), gateDir, 'prompts', RUN_ID);
    fs.mkdirSync(promptDir, { recursive: true });
    fs.writeFileSync(path.join(promptDir, `buster-gate-${gateId}-attempt-${attempt}.md`), busterPrompt);
    log('DEBUG', `Buster gate prompt saved: ${gateDir}/prompts/${RUN_ID}/buster-gate-${gateId}-attempt-${attempt}.md`);
  } catch { /* non-critical */ }

  try {
    await spawnAgent(config, progress, 'buster', gateId, model, busterPrompt, {
      taskType: 'gate_test',
      gate,
    });
  } catch (e) {
    // Return as PollResult shape so the caller handles it consistently.
    // 'spawn_failed' is treated as non-fixable by runBusterGate.
    return pollResult(false, 'spawn_failed', { error: e.message });
  }

  const result = await pollGeneric(config, async () => {
    // Primary completion signal: output file exists
    // File existence means "agent finished" — content determines PASS or FAIL.
    if (gate.output_file) {
      const outPath = path.join(swarmRoot(config), gate.output_file);
      if (fs.existsSync(outPath)) {
        let data = { gate: gateId };
        try { data = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* raw file */ }

        // Content-aware: check if the result indicates failure
        const resultStatus = (data.status || '').toUpperCase();
        if (resultStatus === 'FAIL' || resultStatus === 'ISSUES_FOUND') {
          return { done: true, result: pollResult(false, 'gate_fail', data) };
        }
        // PASS, GO, OK, or no status field = success
        return { done: true, result: pollResult(true, 'target_reached', data) };
      }
    }

    // Secondary signal: gate status file (FAIL/RATE_LIMITED/crash detection)
    const gateStatusFile = gateStatusPath(config, gateId);
    if (!fs.existsSync(gateStatusFile)) {
      return { done: false, logMsg: 'waiting for output' };
    }

    let gateStatus;
    try {
      gateStatus = JSON.parse(fs.readFileSync(gateStatusFile, 'utf8'));
    } catch {
      return { parse_error: true };
    }

    if (gateStatus?.status === STATUS.FAIL || gateStatus?.status === 'ISSUES_FOUND') {
      return { done: true, result: pollResult(false, 'gate_fail', gateStatus) };
    }
    if (gateStatus?.status === STATUS.RATE_LIMITED) {
      return { rate_limited: true, status: gateStatus };
    }
    // PASS/OK from gate-status.json — Buster completed but output_file may not exist yet
    const gsUpper = (gateStatus?.status || '').toUpperCase();
    if (gsUpper === 'PASS' || gsUpper === 'OK') {
      log('INFO', `Gate '${gateId}' PASS detected via gate-status.json (output_file not yet written)`);
      return { done: true, result: pollResult(true, 'target_reached', gateStatus) };
    }

    return { done: false, logMsg: `status=${gateStatus?.status || 'unknown'}` };
  }, timeout, `Gate '${gateId}'`);

  await killAgent(config, 'buster', gateId);
  return result;
}

/**
 * Extract actionable issues from a Buster gate result for Forge to fix.
 * Supports two result formats: structured (issues array) and flat (reason string).
 */
function extractGateIssues(gateResult) {
  if (!gateResult) return [];
  const data = gateResult.status || gateResult;

  // Structured: { issues: [{ severity, title, description, affected_files }] }
  if (Array.isArray(data.issues)) {
    return data.issues
      .filter(i => i.severity === 'critical' || i.severity === 'moderate' || !i.severity)
      .map(i => ({
        title: i.title || 'Unknown issue',
        description: i.description || '',
        affected_module: i.affected_module || null,
        affected_files: i.affected_files || [],
        severity: i.severity || 'unknown',
        reproduction: i.reproduction || null,
      }));
  }

  // Standard test-style: { reason, fail_details, ... }
  const reason = data.reason || data.summary || 'Gate test failed without details';
  return [{ title: 'Gate test failure', description: reason, severity: 'unknown', affected_files: [] }];
}

/**
 * Build a Forge prompt to fix issues found by a Buster gate.
 */
function buildGateFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory = []) {
  // ── Context header — fresh Forge has no context window history ──
  const header = [
    `## Gate Fix: ${gate.title} (Attempt ${attempt}/${maxAttempts})`,
    '',
    `**Project:** ${config.project}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Working Directory:** \`${relPath(config, swarmRoot(config))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    '',
    'All code paths are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before modifying any files.`,
    '',
  ];

  // ── Anti-patterns from previous fix attempts ──
  if (fixHistory.length > 0) {
    header.push(
      '### ⛔ Previous Fix Attempts (Do NOT repeat these approaches)',
      '',
    );
    for (const prev of fixHistory) {
      if (!prev.hasChanges) {
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Forge crashed or produced no changes.`);
      } else {
        const issueList = prev.issues.map(i => i.title || i.description).join('; ');
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Applied changes but issues persisted: ${issueList}`);
      }
    }
    header.push('', 'Understand WHY these fixes failed and take a fundamentally different approach.', '');
  }

  const issueBlocks = issues.map((issue, i) => [
    `### Issue ${i + 1}: ${issue.title}${issue.severity ? ` [${issue.severity.toUpperCase()}]` : ''}`,
    issue.description ? `**Description:** ${issue.description}` : '',
    issue.reproduction ? `**Reproduction:** ${issue.reproduction}` : '',
    issue.affected_files?.length ? `**Affected Files:** ${issue.affected_files.join(', ')}` : '',
    '',
  ].filter(Boolean).join('\n'));

  return [
    ...header,
    `Buster found ${issues.length} issue(s) during testing. Fix ALL of the following:`,
    '',
    ...issueBlocks,
    '---',
    '',
    '## 🚨 CRITICAL — YOUR FINAL STEP (DO NOT SKIP)',
    '',
    'After fixing all issues above, you MUST commit and push your changes.',
    'This is how the pipeline knows you are done. If you do not do this, your work is lost.',
    '',
    '```bash',
    `cd ${config.repo_root}`,
    'git add -A',
    'git commit -m "[forge] Gate fix: <brief description of what you fixed>"',
    'git push origin',
    '```',
    '',
    'This must be the LAST thing you do before your session ends.',
    '',
  ].join('\n');
}

/**
 * Run a type:"buster" gate with optional fix-and-retest loop.
 *
 * If gate.on_fail === 'fix_and_retest':
 *   FAIL -> extract issues -> Forge fix -> cleanup old output -> retest (max N cycles)
 * Otherwise: FAIL -> EXIT_NEEDS_NOVA (old behavior)
 */
async function runBusterGate(config, progress, gateId) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found`);

  log('STEP', `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
  log('STEP', `  GATE: ${gate.title}`);
  log('STEP', `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);

  // Already completed? Check output file AND its content.
  // File existence alone is not enough — it may contain FAIL/ISSUES_FOUND from a previous run.
  if (gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    if (fs.existsSync(outPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const resultStatus = (data.status || '').toUpperCase();
        if (resultStatus !== 'FAIL' && resultStatus !== 'ISSUES_FOUND') {
          log('OK', `Gate '${gateId}' already completed (status: ${data.status || 'ok'}) — skipping`);
          return { exit: EXIT_OK, status: STATUS.PASS };
        }
        log('INFO', `Gate '${gateId}' output file exists but status is '${data.status}' — re-running`);
      } catch {
        // Non-JSON file (e.g. markdown review) — existence = done
        log('OK', `Gate '${gateId}' already completed — skipping`);
        return { exit: EXIT_OK, status: STATUS.PASS };
      }
    }
  }

  // Fallback: check gate-status.json when output_file is absent
  const gsPath = gateStatusPath(config, gateId);
  if (fs.existsSync(gsPath)) {
    try {
      const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
      const s = (gs.status || '').toUpperCase();
      if (s === 'PASS' || s === 'OK') {
        log('OK', `Gate '${gateId}' already completed via gate-status.json (output_file missing) — skipping`);
        return { exit: EXIT_OK, status: STATUS.PASS };
      }
    } catch { /* unparseable = not completed */ }
  }

  // Clean up stale output files from previous runs BEFORE entering the main loop.
  // Without this, _runBusterGateOnce's pollGeneric immediately finds the old FAIL
  // file and returns a phantom gate_fail — wasting a Buster spawn + Forge fix cycle.
  // Same cleanup pattern as the fix-loop cleanup at the bottom of the loop body.
  if (gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch { /* ok */ }
  }
  try {
    const gsp = gateStatusPath(config, gateId);
    if (fs.existsSync(gsp)) fs.unlinkSync(gsp);
  } catch { /* ok */ }

  let instructions;
  try { instructions = readGateInstructions(config, gate); }
  catch (e) {
    log('ERROR', `Gate '${gateId}' instructions read failed: ${e.message}`);
    return { exit: EXIT_ERROR, reason: e.message };
  }

  const model = resolveModel('buster', config, progress, gate.model);
  const timeout = gate.timeout_minutes ?? config.default_timeout_minutes;
  const maxFixCycles = gate.max_fix_cycles ?? config.default_max_fails;
  const hasFixLoop = gate.on_fail === 'fix_and_retest';

  await discord(config, 'INFO', `Gate: ${gate.title}`, `Starting buster gate${hasFixLoop ? ` (fix loop: max ${maxFixCycles})` : ''}`);

  // Rate limit tracking — gate-level, separate from module-level handleRateLimit
  // which requires moduleDir/statusDir context that gates don't have.
  let rateLimitPauses = 0;
  const maxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;

  // Fix history — tracks what each previous fix attempt did so Forge
  // doesn't repeat failed approaches (anti-pattern framing for gate fixes).
  const fixHistory = [];

  // ── Main loop: run gate, optionally fix and retry ──
  for (let attempt = 1; attempt <= (hasFixLoop ? maxFixCycles + 1 : 1); attempt++) {

    if (attempt > 1) {
      log('STEP', `Gate '${gateId}' retry attempt ${attempt - 1}/${maxFixCycles}`);
    }

    const result = await _runBusterGateOnce(config, progress, gateId, gate, model, timeout, instructions, attempt);

    // ── PASS ──
    if (result.ok) {
      log('OK', `Gate '${gateId}' PASS${attempt > 1 ? ` (after ${attempt - 1} fix cycle(s))` : ''}`);
      await discord(config, 'OK', `Gate: ${gate.title} PASS`,
        attempt > 1 ? `Passed after ${attempt - 1} fix cycle(s)` : 'Passed on first run');
      return { exit: EXIT_OK, status: STATUS.PASS };
    }

    // ── Non-fixable failures ──
    if (result.reason === 'spawn_failed') {
      const err = result.status?.error || 'unknown';
      log('ERROR', `Gate '${gateId}' agent spawn failed: ${err}`);
      await discord(config, 'CRITICAL', `Gate '${gateId}' Spawn Failed`,
        `Buster agent could not be spawned: ${err}`);
      return { exit: EXIT_ERROR, reason: `Gate '${gateId}' spawn failed: ${err}` };
    }
    if (result.reason === 'parse_corrupted') {
      log('ERROR', `Gate '${gateId}' status file permanently corrupted`);
      await discord(config, 'CRITICAL', `Gate '${gateId}' Parse Corrupted`,
        `Gate status file is permanently unparseable after multiple attempts.`);
      return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' status file permanently corrupted` };
    }
    if (result.reason === 'timeout') {
      log('ERROR', `Gate '${gateId}' timed out after ${timeout}min`);
      await discord(config, 'CRITICAL', `Gate '${gateId}' TIMEOUT`,
        `Buster did not complete within ${timeout}min`);
      // Timeouts are not auto-fixable
      return { exit: EXIT_TIMEOUT, reason: `Gate '${gateId}' timed out` };
    }

    // ── Rate limit (gate-level handling) ──
    // Gates don't have moduleDir/statusDir, so we handle rate limits inline
    // instead of delegating to handleRateLimit (which is module-specific).
    if (result.reason === 'rate_limited') {
      rateLimitPauses++;
      if (rateLimitPauses > maxRateLimitPauses) {
        log('ERROR', `Gate '${gateId}' rate limit pauses exceeded (${rateLimitPauses}/${maxRateLimitPauses})`);
        await discord(config, 'CRITICAL', `Gate '${gateId}' Rate Limit Exhausted`,
          `Exceeded max rate limit pauses (${maxRateLimitPauses}). Pipeline cannot continue.`);
        return { exit: EXIT_RATE_LIMITED, reason: `Gate '${gateId}' exceeded max rate limit pauses` };
      }
      const cooldownHours = config.rate_limit?.cooldown_hours ?? 2;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const resumeAt = new Date(Date.now() + cooldownMs);
      log('WARN', `Gate '${gateId}' rate limited (pause ${rateLimitPauses}/${maxRateLimitPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`);
      await discord(config, 'WARN', `Gate '${gateId}' Rate Limited`,
        `Pause ${rateLimitPauses}/${maxRateLimitPauses}. Sleeping ${cooldownHours}h. Resume at ${resumeAt.toLocaleTimeString()}.`);
      await sleep(cooldownMs);
      log('OK', `Gate '${gateId}' rate limit cooldown complete — retrying (attempt stays at ${attempt} due to rate limit)`);
      // Rate limit pause is NOT a fix attempt — don't increment attempt counter
      attempt--;
      continue;
    }

    // \u2500\u2500 FAIL \u2500\u2500
    const failData = result.status || {};
    const issues = extractGateIssues(failData);
    const failReason = issues.map(i => i.title).join('; ') || 'unknown';

    log('WARN', `Gate '${gateId}' FAIL: ${failReason}`);

    // No fix loop configured or exhausted?
    if (!hasFixLoop) {
      await discord(config, 'CRITICAL', `Gate '${gateId}' FAIL`, `Agent reported failure: ${failReason}`);
      return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' failed: ${failReason}` };
    }

    if (attempt > maxFixCycles) {
      log('ERROR', `Gate '${gateId}' fix loop exhausted (${maxFixCycles} attempts)`);
      await discord(config, 'CRITICAL', `Gate '${gateId}' BLOCKED`,
        `Fix loop exhausted after ${maxFixCycles} attempts. Issues: ${failReason}`);
      return {
        exit: EXIT_NEEDS_NOVA,
        reason: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`,
        gate: gateId,
        fix_attempts: maxFixCycles,
        remaining_issues: issues,
      };
    }

    // \u2500\u2500 Fix cycle: Forge fixes, then retry \u2500\u2500
    log('STEP', `Gate '${gateId}' fix cycle ${attempt}/${maxFixCycles}`);
    await discord(config, 'WARN', `Gate '${gateId}' FAIL \u2014 Auto-Fix`,
      `Attempt ${attempt}/${maxFixCycles}. Spawning Forge to fix ${issues.length} issue(s).`);

    const fixPrompt = buildGateFixPrompt(config, gate, issues, attempt, maxFixCycles, fixHistory);
    const forgeModel = resolveModel('forge', config, progress, gate.forge_model);
    const fixLabel = `gatefix-${gateId}-${attempt}`;
    const fixAcpLabel = acpLabel('forge', fixLabel);  // Actual ACP session label

    // Save gate fix prompt for debugging
    try {
      const gateDir = gate.instructions_file ? gate.instructions_file.split('/')[0] : gateId;
      const promptDir = path.join(swarmRoot(config), gateDir, 'prompts', RUN_ID);
      fs.mkdirSync(promptDir, { recursive: true });
      fs.writeFileSync(path.join(promptDir, `forge-gatefix-${gateId}-attempt-${attempt}.md`), fixPrompt);
    } catch { /* non-critical */ }

    try {
      await spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt);
    } catch (e) {
      log('ERROR', `Forge spawn for gate fix failed: ${e.message}`);
      continue; // Try next attempt anyway
    }

    // Verify Forge is alive
    if (!(await verifyAgentAlive(config, 'forge', fixLabel))) {
      log('WARN', `Forge health check failed for gate fix — skipping to next attempt`);
      await killAgent(config, 'forge', fixLabel);
      continue;
    }

    // Poll for Forge session completion (with crash detection)
    const forgeTimeout = gate.timeout_minutes ?? config.default_timeout_minutes;
    const sessionResult = await pollForSessionEnd(config, fixAcpLabel, forgeTimeout, fixLabel);

    // Safety net — kill Forge session if still running
    await killAgent(config, 'forge', fixLabel, sessionResult.hasChanges);

    // Track this fix attempt for anti-pattern framing in subsequent attempts
    fixHistory.push({ attempt, hasChanges: sessionResult.hasChanges, issues });

    if (!sessionResult.hasChanges) {
      const reason = sessionResult.completed ? 'no changes (crashed?)' : 'timeout';
      log('WARN', `Gate fix '${fixLabel}' ${reason}. Skipping retest.`);
      await discord(config, 'WARN', `Gate Fix ${reason}: ${gateId}`,
        `Fix attempt ${attempt}/${maxFixCycles} produced no usable output.`);
      continue;
    }

    // Git sync Forge output
    await gitCommitAndPush(config, `[pipeline] Gate fix: ${gateId} attempt ${attempt}`, { softFail: true });

    // Cleanup old output so Buster writes fresh results
    if (gate.output_file) {
      const outPath = path.join(swarmRoot(config), gate.output_file);
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch { /* ok */ }
    }
    const gateStatusFile = gateStatusPath(config, gateId);
    try { if (fs.existsSync(gateStatusFile)) fs.unlinkSync(gateStatusFile); } catch { /* ok */ }

    // Loop continues -> next iteration runs _runBusterGateOnce again
  }

  // Should not reach here, but safety net
  log('ERROR', `Gate '${gateId}' ended unexpectedly — this should not happen`);
  return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' ended unexpectedly` };
}

// ─── Review Gate Runner ──────────────────────────────────────────────────────
//
// Review gates run a lint report (deterministic static analysis) then spawn
// a single reviewer agent with the lint findings + gate instructions.
// The reviewer produces a structured JSON review (GO / NO-GO).
// Fix loops are handled by runReviewGate.
//
// Flow: lint report → spawn reviewer → poll file → kill →
//       parse review result → return GO/NO-GO

/**
 * Resolve review configuration by merging gate-level overrides with platform defaults.
 * null values in the gate inherit from swarm.config.review_defaults.
 */
function resolveReviewConfig(config, gate) {
  const defaults = config.review_defaults ?? {};
  return {
    reviewers: gate.reviewers ?? defaults.reviewers ?? [],
    timeout: gate.timeout_minutes ?? defaults.timeout_minutes ?? config.default_timeout_minutes,
    maxFixCycles: gate.max_fix_cycles ?? defaults.max_fix_cycles ?? config.default_max_fails,
    lintTier: gate.lint_tier ?? defaults.lint_tier ?? 'full',
  };
}

/**
 * Build the output path for an individual reviewer's JSON file.
 * Pattern: <swarm_dir>/<review_output_dir>/<label>-<review_name>.json
 * Example: .swarm/echo-reviews/echo-codex-MIDPOINT-REVIEW.json
 */
function reviewOutputPath(config, gate, reviewerLabel) {
  return path.join(
    swarmRoot(config),
    gate.review_output_dir || 'echo-reviews',
    `${reviewerLabel}-${gate.review_name}.json`
  );
}

/**
 * Spawn a single ACP reviewer agent with explicit agent_id and model.
 * Unlike spawnAcpAgent (which looks up config.agents[type]), this takes
 * reviewer-specific settings directly — each reviewer can use a different
 * agent/model combination.
 *
 * Uses Gateway Tool API (sessions_spawn with runtime: "acp").
 */
async function spawnReviewerAgent(config, progress, gateId, reviewer, instructions) {
  const trackingKey = `echo-${reviewer.label}-${gateId}`;
  const gatewayLabel = `${trackingKey}-${Date.now()}`;
  const model = resolveModel('echo', config, progress, reviewer.model);
  // Prio: model-derived harness → reviewer config → 'claude' fallback
  const agentId = modelToHarness(model) || reviewer.agent_id || 'claude';
  const cwd = config.agents.echo?.cwd || config.repo_root;

  log('STEP', `Spawning reviewer: ${gatewayLabel} (agent: ${agentId}, model: ${model})`);

  const spawnArgs = {
    task: instructions,
    runtime: 'acp',
    agentId: agentId,
    label: gatewayLabel,
    model: model,
    cwd: cwd,
    thread: false,              // Headless — no Discord thread
    mode: 'run',                // Always oneshot — session closes after task completes
    streamTo: 'parent',         // Stream JSONL log to file for post-mortem analysis
    cleanup: 'keep',
  };

  try {
    const raw = await gatewayInvoke('sessions_spawn', spawnArgs, 30000);
    const result = raw?.result?.details || raw;

    if (result.status !== 'accepted') {
      throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
    }

    const streamLogPath = result.streamLogPath || null;
    log('OK', `Reviewer spawned: ${gatewayLabel} → ${result.childSessionKey}${streamLogPath ? ` (stream: ${streamLogPath})` : ''}`);
    trackAgent(config, trackingKey, result.childSessionKey, agentId, gatewayLabel, streamLogPath);
    return { label: trackingKey, childSessionKey: result.childSessionKey, runId: result.runId, streamLogPath };
  } catch (e) {
    throw new Error(`Failed to spawn reviewer '${gatewayLabel}': ${e.message}`);
  }
}

/**
 * Kill a reviewer agent via Gateway Tool API.
 */
async function killReviewerAgent(config, gateId, reviewer, graceful = false) {
  const label = `echo-${reviewer.label}-${gateId}`;
  const entry = _shutdownState.activeSessions.get(label);
  const sessionKey = entry?.sessionKey;

  if (!sessionKey) {
    log('WARN', `No sessionKey for reviewer '${label}' — skipping kill`);
    untrackAgent(label);
    return;
  }

  if (graceful) {
    log('INFO', `Waiting for reviewer session to become idle: ${label}`);
    await waitForSessionIdle(sessionKey);
  }

  try {
    await gatewayInvoke('sessions_send', { sessionKey, message: '/stop' }, 15000);
    log('OK', `Reviewer killed: ${label}`);
  } catch {
    log('WARN', `Could not kill reviewer '${label}' — may have already exited`);
  }
  await acpxCleanup(entry.agentId, entry.gatewayLabel);
  untrackAgent(label);
}

/**
 * Run one complete review cycle: lint report → single reviewer → parse.
 *
 * Flow:
 *   1. Generate lint report (tier: full) — deterministic tool findings
 *   2. Read gate instructions
 *   3. Build reviewer prompt: instructions + lint report + output path
 *   4. Spawn single reviewer agent (first from reviewers array)
 *   5. Poll for single review output file
 *   6. Kill reviewer
 *   7. Parse the review JSON
 *   8. Commit review output
 *   9. Return GO / NO-GO
 *
 * Graceful degradation: if lint-report.js fails, the reviewer still runs
 * without the lint data. Only if the reviewer itself fails to produce
 * output does this return an error.
 *
 * Returns { ok: boolean, mergedResult: object|null, mergedFilePath: string|null, error?: string }
 * Note: "mergedResult" naming preserved for backward compatibility with
 * extractReviewIssues() and runReviewGate() fix loops.
 *
 * @private — called by runReviewGate, not directly
 */
async function _runReviewOnce(config, progress, gateId, gate, reviewConfig) {
  const { reviewers, timeout, lintTier } = reviewConfig;

  if (reviewers.length === 0) {
    return { ok: false, error: 'No reviewers configured' };
  }

  // Use the first (and typically only) reviewer
  const reviewer = reviewers[0];
  const outputFilePath = reviewOutputPath(config, gate, reviewer.label);
  const relOutput = relPath(config, outputFilePath);

  // Ensure output directory exists (usually created by Nova, but defensive)
  const outDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  log('STEP', `Review cycle: reviewer=${reviewer.label}, output=${path.basename(outputFilePath)}`);

  // ── Phase 1: Generate lint report ──
  // Intentionally no moduleDir or forgeDiffStat — review gates assess the entire
  // project (cross-module regressions, architectural issues), not a single module.
  // Compare with runPreCheck which IS module-scoped via moduleDir + forgeDiffStat.
  let lintBlock = '';
  const { report: lintReport, error: lintError } = generateLintReport(config, lintTier || 'full', {
    moduleId: gateId,
  });

  if (lintReport) {
    lintBlock = formatLintReportForReviewer(lintReport);
    log('OK', `Lint report ready: ${lintReport.summary.total_errors} errors, ${lintReport.summary.total_warnings} warnings`);
  } else {
    log('WARN', `Lint report unavailable (${lintError}) — reviewer will run without static analysis data`);
    lintBlock = [
      '## 📊 STATIC ANALYSIS REPORT',
      '',
      '⚠️ Lint report generation failed. Review the code manually for type errors, lint issues, and security concerns.',
      `Error: ${lintError || 'unknown'}`,
      '',
      '---',
      '',
    ].join('\n');
  }

  // ── Phase 2: Build reviewer prompt ──
  let instructions;
  try { instructions = readGateInstructions(config, gate); }
  catch (e) { return { ok: false, error: e.message }; }

  const reviewerPrompt = [
    '## Review Context',
    '',
    `**Project:** ${config.project}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Gate:** ${gateId} — ${gate.title}`,
    '',
    '---',
    '',
    instructions,
    '',
    '---',
    '',
    lintBlock,
    '## YOUR OUTPUT FILE',
    '',
    `You are reviewer: **${reviewer.label}** (model: ${reviewer.model})`,
    `Write your review JSON to: \`${relOutput}\``,
    '',
    'Your output MUST be valid JSON with this structure:',
    '```json',
    '{',
    '  "status": "GO" or "NO-GO",',
    '  "critical_issues": [',
    '    {',
    '      "source": "tsc | eslint | architectural | ...",',
    '      "description": "What is wrong",',
    '      "affected_files": ["path/to/file.ts"],',
    '      "recommended_fix": "How to fix it"',
    '    }',
    '  ],',
    '  "deferred_issues": [],',
    '  "summary": "Brief overall assessment"',
    '}',
    '```',
    '',
    'Rules:',
    '- Status is GO only if there are zero critical issues.',
    '- Architectural patterns that will propagate to downstream modules are ALWAYS critical, even if the current code works. Fix the pattern now while only 1-2 modules exist, not after 10+.',
    '- On early review gates (first half of the pipeline): prefer NO-GO when in doubt. Foundation patterns are cheap to fix now, expensive to fix later.',
    '- Error response shapes, data model conventions, and API contract patterns that downstream modules will copy are critical by definition.',
    '- Lint findings that are errors (🔴) should be treated as critical unless they are false positives.',
    '- Lint warnings (🟡) should be deferred unless they indicate a real problem.',
    '- Add architectural issues the tools cannot detect (race conditions, security, design flaws).',
  ].join('\n');

  // ── Phase 3: Spawn reviewer ──
  // Clean up stale output from previous runs BEFORE spawning. Without this,
  // pollForFile finds the old file instantly and returns stale review data
  // while the reviewer hasn't even started working yet.
  try { if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath); } catch { /* ok */ }

  // Save reviewer prompt for debugging
  try {
    const reviewDir = gate.review_output_dir || 'echo-review';
    const echoPromptDir = path.join(swarmRoot(config), reviewDir, 'prompts', RUN_ID);
    fs.mkdirSync(echoPromptDir, { recursive: true });
    fs.writeFileSync(path.join(echoPromptDir, `echo-${gateId}-${reviewer.label}.md`), reviewerPrompt);
    log('DEBUG', `Echo prompt saved: ${reviewDir}/prompts/${RUN_ID}/echo-${gateId}-${reviewer.label}.md`);
  } catch { /* non-critical */ }

  const echoStartTime = Date.now();

  try {
    await spawnReviewerAgent(config, progress, gateId, reviewer, reviewerPrompt);
  } catch (e) {
    log('ERROR', `Reviewer spawn failed: ${reviewer.label} — ${e.message}`);
    return { ok: false, error: `Reviewer spawn failed: ${e.message}` };
  }

  // ── Phase 4: Poll for review output ──
  const pollRes = await pollForFile(config, outputFilePath, timeout, `Review '${gateId}'`);

  // ── Phase 5: Kill reviewer ──
  const echoTrackingKey = `echo-${reviewer.label}-${gateId}`;
  const echoStreamPath = _shutdownState.activeSessions.get(echoTrackingKey)?.streamLogPath;
  await killReviewerAgent(config, gateId, reviewer, pollRes.ok);

  // Save stream log to review streams directory
  if (echoStreamPath) {
    try {
      if (fs.existsSync(echoStreamPath)) {
        const reviewDir = gate.review_output_dir || 'echo-review';
        const echoLogDir = path.join(swarmRoot(config), reviewDir, 'streams', RUN_ID);
        fs.mkdirSync(echoLogDir, { recursive: true });
        const destPath = path.join(echoLogDir, `echo-stream-${gateId}-${reviewer.label}.jsonl`);
        fs.copyFileSync(echoStreamPath, destPath);
        log('OK', `Echo stream log saved: ${reviewDir}/streams/${RUN_ID}/echo-stream-${gateId}-${reviewer.label}.jsonl`);
      }
    } catch (e) { log('DEBUG', `Echo stream log save failed (non-critical): ${e.message}`); }
  }

  if (!pollRes.ok) {
    log('WARN', `Review poll ended: ${pollRes.reason}. Review file not received.`);
    return { ok: false, error: `Review file not received (${pollRes.reason})` };
  }

  // ── Discord: Echo completion summary ──
  const echoDurationSec = Math.round((Date.now() - echoStartTime) / 1000);
  const echoModel = resolveModel('echo', config, progress, reviewer.model);
  await discord(config, 'INFO', `Echo complete: ${gate.title}`, `Reviewer: ${reviewer.label}`, [
    { name: 'Duration', value: `${Math.round(echoDurationSec / 60)}min` },
    { name: 'Model', value: echoModel },
    { name: 'Reviewer', value: reviewer.label },
  ]);

  // ── Phase 6: Commit review output ──
  await gitCommitAndPush(config,
    `[pipeline] Review: ${gate.review_name} (${reviewer.label})`,
    { softFail: true }
  );

  // ── Phase 7: Parse review result ──
  // Copy to gate output_file location if it differs from reviewer output path
  if (gate.output_file) {
    const gateOutputPath = path.join(swarmRoot(config), gate.output_file);
    if (gateOutputPath !== outputFilePath) {
      try {
        fs.copyFileSync(outputFilePath, gateOutputPath);
      } catch (e) {
        log('WARN', `Could not copy review to gate output: ${e.message}`);
      }
    }
  }

  try {
    const content = fs.readFileSync(outputFilePath, 'utf8');
    try {
      const reviewResult = JSON.parse(content);
      const status = (reviewResult.status || '').toUpperCase();
      const isGo = status === 'GO' || status === 'PASS';
      log('INFO', `Review result: ${reviewResult.status} — ${isGo ? 'GO' : 'NO-GO'}`);
      return { ok: isGo, mergedResult: reviewResult, mergedFilePath: outputFilePath };
    } catch {
      // Non-JSON output — check for NO-GO/FAIL patterns in raw text
      const isNoGo = /\bNO-GO\b|\bFAIL\b|\bcritical_blockers\b/i.test(content);
      log('INFO', `Review result (non-JSON): ${isNoGo ? 'NO-GO detected' : 'GO (no blockers found)'}`);
      return { ok: !isNoGo, mergedResult: { raw: content }, mergedFilePath: outputFilePath };
    }
  } catch (e) {
    log('ERROR', `Failed to read review output: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

/**
 * Extract actionable issues from a review result for Forge to fix.
 */
function extractReviewIssues(mergedResult) {
  if (!mergedResult) return [];
  const issues = [];

  // Structured JSON reviews: critical_issues or critical_blockers arrays
  for (const key of ['critical_issues', 'critical_blockers']) {
    if (Array.isArray(mergedResult[key])) {
      for (const item of mergedResult[key]) {
        issues.push({
          module: item.module || item.component || null,
          location: item.location || null,
          description: item.description || item.title || 'Unknown issue',
          recommended_fix: item.recommended_fix || item.fix || null,
        });
      }
    }
  }

  return issues;
}

/**
 * Build a Forge prompt to fix issues found by Echo review.
 */
function buildReviewFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory = []) {
  // ── Context header — fresh Forge has no context window history ──
  const header = [
    `## Review Fix: ${gate.title} (Attempt ${attempt}/${maxAttempts})`,
    '',
    `**Project:** ${config.project}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Working Directory:** \`${relPath(config, swarmRoot(config))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    '',
    'All code paths are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before modifying any files.`,
    '',
  ];

  // ── Anti-patterns from previous fix attempts ──
  if (fixHistory.length > 0) {
    header.push(
      '### ⛔ Previous Fix Attempts (Do NOT repeat these approaches)',
      '',
    );
    for (const prev of fixHistory) {
      if (!prev.hasChanges) {
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Forge crashed or produced no changes.`);
      } else {
        const issueList = prev.issues.map(i => i.description || i.title).join('; ');
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Applied changes but issues persisted: ${issueList}`);
      }
    }
    header.push('', 'Understand WHY these fixes failed and take a fundamentally different approach.', '');
  }

  const issueBlocks = issues.map((issue, i) => {
    const parts = [`### Issue ${i + 1}: ${issue.description}`];
    if (issue.module) parts.push(`**Module:** ${issue.module}`);
    if (issue.location) parts.push(`**Location:** ${issue.location}`);
    if (issue.recommended_fix) parts.push(`**Recommended Fix:** ${issue.recommended_fix}`);
    parts.push('');
    return parts.join('\n');
  });

  return [
    ...header,
    `Echo review found ${issues.length} critical issue(s). Fix ALL of the following:`,
    '',
    ...issueBlocks,
    '---',
    '',
    '## 🚨 CRITICAL — YOUR FINAL STEP (DO NOT SKIP)',
    '',
    'After fixing all issues above, you MUST commit and push your changes.',
    'This is how the pipeline knows you are done. If you do not do this, your work is lost.',
    '',
    '```bash',
    `cd ${config.repo_root}`,
    'git add -A',
    'git commit -m "[forge] Review fix: <brief description of what you fixed>"',
    'git push origin',
    '```',
    '',
    'This must be the LAST thing you do before your session ends.',
    '',
  ].join('\n');
}

/**
 * Clean up all review files before a re-review cycle.
 * Removes per-reviewer JSON files AND the merged output file
 * so fresh reviews can be written and merged cleanly.
 */
function cleanupReviewFiles(config, gate, reviewers) {
  for (const reviewer of reviewers) {
    const filePath = reviewOutputPath(config, gate, reviewer.label);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log('INFO', `Cleaned up: ${path.basename(filePath)}`);
      }
    } catch { /* non-critical */ }
  }
  // Also clean merged output file
  if (gate.output_file) {
    const mergedPath = path.join(swarmRoot(config), gate.output_file);
    try { if (fs.existsSync(mergedPath)) fs.unlinkSync(mergedPath); } catch { /* ok */ }
  }
}

/**
 * Run a type:"review" gate.
 *
 * Core flow: lint report → single reviewer → GO/NO-GO.
 *
 * Fix lifecycles (on_nogo):
 *   "fix_and_continue"  — Forge fixes, pipeline continues (no re-review)
 *   "fix_and_rereview"  — Forge fixes, Echo re-reviews, repeat until GO or exhausted
 *
 * @param {object} config - Pipeline config
 * @param {object} progress - Project progress
 * @param {string} gateId - Gate identifier
 */
async function runReviewGate(config, progress, gateId) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);

  const reviewConfig = resolveReviewConfig(config, gate);
  const { reviewers, maxFixCycles } = reviewConfig;

  log('STEP', `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
  log('STEP', `  REVIEW GATE: ${gate.title}`);
  log('STEP', `  Reviewer: ${reviewers[0]?.label || 'none'} | lint_tier: ${reviewConfig.lintTier}`);
  log('STEP', `  on_nogo: ${gate.on_nogo} | max_fix_cycles: ${maxFixCycles}`);
  log('STEP', `\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);

  // Already completed? Content-aware: a NO-GO file from a crashed fix cycle is NOT completed.
  if (gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    if (fs.existsSync(outPath)) {
      let isCompleted = true;
      try {
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const s = (data.status || '').toUpperCase();
        if (s === 'NO-GO' || s === 'FAIL') {
          isCompleted = false;
          log('INFO', `Review gate '${gateId}' output file exists but status is '${data.status}' — re-running`);
        }
      } catch { /* non-JSON (e.g. markdown) = completed */ }

      if (isCompleted) {
        log('OK', `Review gate '${gateId}' already completed — skipping`);
        return { exit: EXIT_OK, status: STATUS.PASS };
      }
    }
  }

  if (reviewers.length === 0) {
    log('ERROR', `No reviewers configured for gate '${gateId}'`);
    return { exit: EXIT_ERROR, reason: 'No reviewers configured' };
  }

  await discord(config, 'INFO', `Review Gate: ${gate.title}`,
    `Reviewer: ${reviewers[0]?.label || 'none'} with lint report (tier: ${reviewConfig.lintTier})`, [
      { name: 'Reviewer', value: reviewers[0]?.label || 'none' },
      { name: 'on_nogo', value: gate.on_nogo },
    ]);

  // \u2500\u2500 Initial review \u2500\u2500
  let reviewResult = await _runReviewOnce(config, progress, gateId, gate, reviewConfig);

  if (reviewResult.error) {
    log('ERROR', `Review gate '${gateId}' failed: ${reviewResult.error}`);
    return { exit: EXIT_ERROR, reason: `Review failed: ${reviewResult.error}` };
  }

  if (reviewResult.ok) {
    log('OK', `Review gate '${gateId}' GO`);
    await discord(config, 'OK', `Review: ${gate.title} GO`, 'Review approved');
    return { exit: EXIT_OK, status: STATUS.PASS };
  }

  // \u2500\u2500 NO-GO \u2500\u2500
  log('WARN', `Review gate '${gateId}' NO-GO`);
  const issues = extractReviewIssues(reviewResult.mergedResult);
  log('INFO', `${issues.length} critical issue(s) extracted from review`);

  // \u2500\u2500 fix_and_continue: Forge fixes, pipeline continues \u2500\u2500
  if (gate.on_nogo === 'fix_and_continue') {
    await discord(config, 'WARN', `Review: ${gate.title} NO-GO \u2014 Fix & Continue`,
      `${issues.length} critical issue(s). Forge will fix, then pipeline continues.`);

    const fixHistory = [];
    for (let cycle = 1; cycle <= maxFixCycles; cycle++) {
      log('STEP', `Review fix cycle ${cycle}/${maxFixCycles} (fix_and_continue)`);

      if (issues.length === 0) {
        log('WARN', 'NO-GO but no extractable issues \u2014 escalating');
        break;
      }

      const fixPrompt = buildReviewFixPrompt(config, gate, issues, cycle, maxFixCycles, fixHistory);
      const forgeModel = resolveModel('forge', config, progress, gate.forge_model);
      const fixLabel = `reviewfix-${gateId}-${cycle}`;
      const fixAcpLabel = acpLabel('forge', fixLabel);

      // Save review fix prompt for debugging
      try {
        const reviewDir = gate.review_output_dir || 'echo-review';
        const promptDir = path.join(swarmRoot(config), reviewDir, 'prompts', RUN_ID);
        fs.mkdirSync(promptDir, { recursive: true });
        fs.writeFileSync(path.join(promptDir, `forge-reviewfix-${gateId}-cycle-${cycle}.md`), fixPrompt);
      } catch { /* non-critical */ }

      try { await spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt); }
      catch (e) {
        log('ERROR', `Forge spawn failed for review fix: ${e.message}`);
        continue;
      }

      if (!(await verifyAgentAlive(config, 'forge', fixLabel))) {
        await killAgent(config, 'forge', fixLabel);
        continue;
      }

      // Poll for Forge session completion (with crash detection)
      const sessionResult = await pollForSessionEnd(
        config, fixAcpLabel, reviewConfig.timeout ?? config.default_timeout_minutes, fixLabel);

      await killAgent(config, 'forge', fixLabel, sessionResult.hasChanges);

      // Track this fix attempt for anti-pattern framing in subsequent attempts
      fixHistory.push({ attempt: cycle, hasChanges: sessionResult.hasChanges, issues });

      if (!sessionResult.hasChanges) {
        const reason = sessionResult.completed ? 'no changes (crashed?)' : 'timeout';
        log('WARN', `Review fix '${fixLabel}' ${reason}`);
        await discord(config, 'WARN', `Review Fix ${reason}: ${gateId}`,
          `Fix cycle ${cycle}/${maxFixCycles} produced no usable output.`);
        continue;
      }

      await gitCommitAndPush(config, `[pipeline] Review fix: ${gateId} cycle ${cycle}`, { softFail: true });

      // Forge ran successfully — no point re-running with the same issues.
      // Further cycles only matter if spawn/health-check failed (continue above).
      log('OK', `Fix cycle ${cycle} completed — Forge applied fixes`);
      break;
    }

    // Write GO status to output file so findNextStep recognizes completion on resume.
    // Without this, the NO-GO file from the initial review stays on disk and
    // findNextStep would re-trigger the gate.
    if (gate.output_file) {
      const outPath = path.join(swarmRoot(config), gate.output_file);
      const goResult = JSON.stringify({
        status: 'GO',
        note: `Fixes applied (${maxFixCycles} cycle(s)). No re-review performed (fix_and_continue).`,
        completed_at: new Date().toISOString(),
      }, null, 2) + '\n';
      fs.writeFileSync(outPath, goResult);
      await gitCommitAndPush(config, `[pipeline] Review gate '${gateId}' fix_and_continue complete`, { softFail: true });
    }

    // Pipeline continues regardless — no re-review
    log('OK', `Review gate '${gateId}' fix_and_continue complete — pipeline continues`);
    return { exit: EXIT_OK, status: STATUS.PASS };
  }

  // \u2500\u2500 fix_and_rereview: Forge fixes, Echo re-reviews \u2500\u2500
  if (gate.on_nogo === 'fix_and_rereview') {
    await discord(config, 'WARN', `Review: ${gate.title} NO-GO \u2014 Fix & Re-Review`,
      `${issues.length} critical issue(s). Starting fix-and-rereview cycle.`);

    const fixHistory = [];
    for (let cycle = 1; cycle <= maxFixCycles; cycle++) {
      log('STEP', `Review fix cycle ${cycle}/${maxFixCycles} (fix_and_rereview)`);

      // \u2500\u2500 Forge fix \u2500\u2500
      const currentIssues = extractReviewIssues(reviewResult.mergedResult);
      if (currentIssues.length === 0) {
        log('WARN', 'NO-GO but no extractable issues \u2014 escalating');
        break;
      }

      const fixPrompt = buildReviewFixPrompt(config, gate, currentIssues, cycle, maxFixCycles, fixHistory);
      const forgeModel = resolveModel('forge', config, progress, gate.forge_model);
      const fixLabel = `reviewfix-${gateId}-${cycle}`;
      const fixAcpLabel = acpLabel('forge', fixLabel);

      // Save review fix prompt for debugging
      try {
        const reviewDir = gate.review_output_dir || 'echo-review';
        const promptDir = path.join(swarmRoot(config), reviewDir, 'prompts', RUN_ID);
        fs.mkdirSync(promptDir, { recursive: true });
        fs.writeFileSync(path.join(promptDir, `forge-reviewfix-${gateId}-cycle-${cycle}.md`), fixPrompt);
      } catch { /* non-critical */ }

      try { await spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt); }
      catch (e) {
        log('ERROR', `Forge spawn failed for review fix: ${e.message}`);
        continue;
      }

      if (!(await verifyAgentAlive(config, 'forge', fixLabel))) {
        await killAgent(config, 'forge', fixLabel);
        continue;
      }

      // Poll for Forge session completion (with crash detection)
      const sessionResult = await pollForSessionEnd(
        config, fixAcpLabel, reviewConfig.timeout ?? config.default_timeout_minutes, fixLabel);

      await killAgent(config, 'forge', fixLabel, sessionResult.hasChanges);

      // Track this fix attempt for anti-pattern framing in subsequent attempts
      fixHistory.push({ attempt: cycle, hasChanges: sessionResult.hasChanges, issues: currentIssues });

      if (!sessionResult.hasChanges) {
        const reason = sessionResult.completed ? 'no changes (crashed?)' : 'timeout';
        log('WARN', `Review fix '${fixLabel}' ${reason}`);
        await discord(config, 'WARN', `Review Fix ${reason}: ${gateId}`,
          `Fix cycle ${cycle}/${maxFixCycles} produced no usable output.`);
        continue;
      }

      await gitCommitAndPush(config, `[pipeline] Review fix: ${gateId} cycle ${cycle}`, { softFail: true });

      // \u2500\u2500 Cleanup old review files and re-review \u2500\u2500
      cleanupReviewFiles(config, gate, reviewers);

      reviewResult = await _runReviewOnce(config, progress, gateId, gate, reviewConfig);

      if (reviewResult.error) {
        log('ERROR', `Re-review failed: ${reviewResult.error}`);
        continue;
      }

      if (reviewResult.ok) {
        log('OK', `Review gate '${gateId}' GO after ${cycle} fix cycle(s)`);
        await discord(config, 'OK', `Review: ${gate.title} GO`,
          `Passed after ${cycle} fix cycle(s)`);
        return { exit: EXIT_OK, status: STATUS.PASS };
      }

      log('WARN', `Re-review still NO-GO after fix cycle ${cycle}/${maxFixCycles}`);
    }

    // Exhausted
    log('ERROR', `Review gate '${gateId}' fix_and_rereview exhausted (${maxFixCycles} cycles)`);
    await discord(config, 'CRITICAL', `Review: ${gate.title} BLOCKED`,
      `Fix-and-rereview exhausted after ${maxFixCycles} cycles. Nova must intervene.`);

    return {
      exit: EXIT_NEEDS_NOVA,
      reason: `Review gate '${gateId}' NO-GO after ${maxFixCycles} fix cycles`,
      gate: gateId,
      fix_cycles: maxFixCycles,
      last_review: reviewResult.mergedResult,
    };
  }

  // Unknown on_nogo strategy
  log('ERROR', `Unknown on_nogo strategy '${gate.on_nogo}' for gate '${gateId}'`);
  return { exit: EXIT_ERROR, reason: `Unknown on_nogo: ${gate.on_nogo}` };
}

/**
 * Gate dispatcher. Routes to the appropriate runner based on gate.type.
 * type:"buster"  -> runBusterGate (with optional fix-and-retest loop)
 * type:"review"  -> runReviewGate (single reviewer with lint report, fix loops)
 */
async function runGate(config, progress, gateId) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found in progress.json`);

  if (gate.type === 'buster') {
    return runBusterGate(config, progress, gateId);
  }

  if (gate.type === 'review') {
    return runReviewGate(config, progress, gateId);
  }

  log('ERROR', `Unknown gate type '${gate.type}' for gate '${gateId}'`);
  return { exit: EXIT_ERROR, reason: `Unknown gate type '${gate.type}' for gate '${gateId}'` };
}

// ─── Pipeline Runner ─────────────────────────────────────────────────────────

function findNextStep(config, progress) {
  for (const stepId of progress.execution_order) {
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = progress.gates[gateId];

      // Primary: check gate.output_file (canonical completion signal)
      if (gate?.output_file) {
        const outPath = path.join(swarmRoot(config), gate.output_file);
        if (fs.existsSync(outPath)) {
          // Content-aware: a FAIL/ISSUES_FOUND/NO-GO output file means the gate needs re-running
          let isPass = true;
          try {
            const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
            const s = (data.status || '').toUpperCase();
            if (s === 'FAIL' || s === 'ISSUES_FOUND' || s === 'NO-GO') isPass = false;
          } catch { /* non-JSON (e.g. merged review .md) = completed */ }
          if (isPass) continue;
        }
      }

      // Fallback: check gate-status.json (secondary signal from Buster)
      // Covers the edge case where Buster writes PASS to gate-status.json
      // but crashes before writing output_file.
      if (gate?.type === 'buster') {
        const gsPath = gateStatusPath(config, gateId);
        if (fs.existsSync(gsPath)) {
          try {
            const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
            const s = (gs.status || '').toUpperCase();
            if (s === 'PASS' || s === 'OK') {
              log('INFO', `Gate '${gateId}' completed via gate-status.json (output_file missing) — skipping`);
              continue;
            }
          } catch { /* unparseable = not completed */ }
        }
      }

      return { type: 'gate', id: gateId };
    } else {
      const mod = progress.modules[stepId];
      if (!mod) continue;
      const status = loadStatus(config, mod.dir);
      if (status?.status === STATUS.PASS) continue;
      if (status?.status === STATUS.BLOCKED) return { type: 'blocked', id: stepId };
      if (status?.status === STATUS.FAIL) {
        log('INFO', `Module ${stepId} is FAIL (${status.fail_count} attempts) — will retry`);
      } else if (status) {
        log('INFO', `Module ${stepId} resuming from ${status.status}`);
      }
      return { type: 'module', id: stepId };
    }
  }
  return { type: 'done' };
}

async function runPipeline(config, progress, opts = {}) {
  log('STEP', `╔═══════════════════════════════════════════════════╗`);
  log('STEP', `║  PIPELINE: ${config.project.toUpperCase().padEnd(38)}║`);
  log('STEP', `╚═══════════════════════════════════════════════════╝`);

  // Compute pipeline progress for observability
  let startDescription;
  if (opts.module) {
    startDescription = `Single module: ${opts.module}`;
  } else {
    const pendingModules = progress.execution_order.filter(s => {
      if (s.startsWith('gate:')) return false;
      const mod = progress.modules[s];
      if (!mod) return false;
      const st = loadStatus(config, mod.dir);
      return !st || st.status !== STATUS.PASS;
    }).length;
    const totalModules = progress.execution_order.filter(s => !s.startsWith('gate:')).length;
    const totalGates = progress.execution_order.filter(s => s.startsWith('gate:')).length;
    startDescription = `Full pipeline: ${pendingModules}/${totalModules} modules pending, ${totalGates} gate(s)`;
  }

  await discord(config, 'INFO', `Pipeline started: ${config.project}`, startDescription);

  // Single module mode
  if (opts.module) {
    const result = await runModule(config, progress, opts.module, { novaPrompt: opts.novaPrompt });
    output(result);

    // Pipeline-level exit notification (single module mode)
    if (result.exit === EXIT_OK) {
      await discord(config, 'OK', `Pipeline: single module done`, `Module ${opts.module} completed successfully.`);
    } else {
      await discord(config, 'CRITICAL', `Pipeline halted: ${config.project}`,
        `Single module run ended with exit code ${result.exit}.`, [
          { name: 'Module', value: opts.module },
          { name: 'Reason', value: (result.reason || 'unknown').slice(0, 200) },
          { name: 'Exit Code', value: String(result.exit) },
        ]);
    }

    return result.exit;
  }

  // Release gate files from architecture branch (once per pipeline run)
  try {
    await releaseGateFiles(config, progress);
  } catch (e) {
    log('WARN', `Gate files release failed (non-critical): ${e.message}`);
  }

  // Full / resume
  while (true) {
    const next = findNextStep(config, progress);

    if (next.type === 'done') {
      log('OK', '🎉 Pipeline complete — all modules and gates PASS');
      await discord(config, 'OK', `Pipeline Complete: ${config.project}`, 'All modules passed!');
      output({ exit: EXIT_OK, status: 'PIPELINE_COMPLETE' });
      return EXIT_OK;
    }

    if (next.type === 'blocked') {
      log('ERROR', `Module ${next.id} is BLOCKED — pipeline halted`);
      await discord(config, 'CRITICAL', `Pipeline halted: ${config.project}`,
        `Module ${next.id} is BLOCKED. Human intervention needed.`, [
          { name: 'Blocked At', value: next.id },
          { name: 'Action', value: 'Fix manually, then --resume' },
        ]);
      output({ exit: EXIT_BLOCKED, module: next.id, reason: 'BLOCKED' });
      return EXIT_BLOCKED;
    }

    const result = next.type === 'gate'
      ? await runGate(config, progress, next.id)
      : await runModule(config, progress, next.id);

    if (result.exit === EXIT_OK) {
      continue;
    }

    // Pipeline stopping due to non-OK exit — send summary notification.
    // The individual module/gate already sent its specific failure Discord,
    // but this tells Davide "the pipeline is no longer running".
    const exitLabels = {
      [EXIT_ERROR]: 'ERROR',
      [EXIT_NEEDS_NOVA]: 'NEEDS_NOVA',
      [EXIT_BLOCKED]: 'BLOCKED',
      [EXIT_TIMEOUT]: 'TIMEOUT',
      [EXIT_RATE_LIMITED]: 'RATE_LIMITED',
    };
    await discord(config, 'CRITICAL', `Pipeline halted: ${config.project}`,
      `Pipeline stopped at ${next.type} '${next.id}'. Exit: ${exitLabels[result.exit] || result.exit}.`, [
        { name: 'Stopped At', value: `${next.type}:${next.id}` },
        { name: 'Exit Code', value: `${result.exit} (${exitLabels[result.exit] || 'UNKNOWN'})` },
        { name: 'Reason', value: (result.reason || 'see previous alert').slice(0, 200) },
      ]);

    output(result);
    return result.exit;
  }
}

// ─── Status & Dry Run ────────────────────────────────────────────────────────

function printStatus(config, progress) {
  const overview = { project: config.project, timestamp: new Date().toISOString(), run_id: RUN_ID, modules: {}, gates: {} };

  for (const [id, mod] of Object.entries(progress.modules)) {
    const s = loadStatus(config, mod.dir);
    overview.modules[id] = {
      title: mod.title,
      status: s?.status || 'NOT_INITIALIZED',
      fail_count: s?.fail_count || 0,
      current_phase: s?.current_phase || null,
      duration_min: s?.cost?.total_duration_seconds ? Math.round(s.cost.total_duration_seconds / 60) : 0,
    };
  }

  for (const [id, gate] of Object.entries(progress.gates)) {
    const outPath = gate.output_file ? path.join(swarmRoot(config), gate.output_file) : null;
    overview.gates[id] = { title: gate.title, completed: outPath ? fs.existsSync(outPath) : false };
  }

  output(overview);
}

function dryRun(config, progress) {
  log('INFO', 'DRY RUN — no agents will be spawned\n');

  for (const stepId of progress.execution_order) {
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = progress.gates[gateId];
      const done = gate?.output_file
        ? fs.existsSync(path.join(swarmRoot(config), gate.output_file)) : false;
      log('STEP', `[GATE] ${gate.title} | type=${gate.type} model=${gate.model} | ${done ? 'DONE' : 'PENDING'}`);
    } else {
      const mod = progress.modules[stepId];
      if (!mod) continue;
      const status = loadStatus(config, mod.dir);
      const deps = checkDependencies(config, progress, stepId);
      log('STEP', `[${stepId}] ${mod.title} | ${status?.status || 'PENDING'} | deps=${deps.met ? 'OK' : deps.reason} | model=${mod.forge_model ?? progress.models?.forge ?? config.models?.forge ?? '?'}`);
    }
  }
}

// ─── Exports (for Nova to import as module) ──────────────────────────────────

export {
  loadConfig, loadProgress, loadStatus, saveStatus,
  releaseBlueprint, listBlueprints,
  spawnAgent, killAgent, steerAgent, verifyAgentAlive, modelToHarness,
  spawnAcpAgent, killAcpAgent, dispatchRedisTask,
  recallForModule, feedbackMemory, decayRecalledMemories,
  buildForgePrompt, buildBusterModulePrompt, buildBusterGatePrompt,
  executeModuleAttempt, runPreCheck, generateLintReport, formatLintReportForReviewer,
  runModule, runGate, runBusterGate, runReviewGate, runPipeline,
  printStatus, gitSyncBeforeBuster, gitPullForPolling, gitPullBeforePush, gitPushWithRetry, gitCommitAndPush,
  pollStatus, pollWithRateLimitRecovery, pollDual, pollDualWithRateLimitRecovery, pollGeneric, pollForFile,
  handleRateLimit, completionStreamKey, archiveModuleCompletions,
  STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_TIMEOUT, EXIT_RATE_LIMITED,
};

export default runPipeline;

// ─── CLI Wrapper ─────────────────────────────────────────────────────────────
// When executed directly (not imported), parse CLI args and run.

const __currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const __entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (__currentPath === __entryPath) {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === '--project'        && args[i+1]) flags.project = args[++i];
    else if (a === '--repo'           && args[i+1]) flags.repo = args[++i];
    else if (a === '--module'         && args[i+1]) flags.module = args[++i];
    else if (a === '--blueprint'      && args[i+1]) flags.blueprint = args[++i];
    else if (a === '--blueprint-list')              flags.blueprintList = true;
    else if (a === '--prompt'         && args[i+1]) flags.prompt = args[++i];
    else if (a === '--prompt-file'   && args[i+1]) flags.promptFile = args[++i];
    else if (a === '--resume')                      flags.resume = true;
    else if (a === '--status')                      flags.status = true;
    else if (a === '--dry-run')                     flags.dryRun = true;
    else if (a === '--help') {
      console.error(`
KubeClaw Swarm Pipeline — Deterministic Orchestrator

Usage: node pipeline.js [options]

Pipeline commands:
  --project <n>           Project name (or CURRENT_PROJECT env)
  --repo <path>           Git repo root (or REPO_ROOT env; auto-detected if in repo)
  --module <id>           Run a single module
  --resume                Resume pipeline from current state
  --prompt "text"         Nova's prompt override (injected into Forge prompt)
  --prompt-file <path>    Read Nova's prompt from file (for long prompts)
  --status                Print current pipeline status as JSON
  --dry-run               Show execution plan, spawn nothing

Config:
  Platform config:  SWARM_CONFIG env or /app/config/swarm.config.json
  Project config:   <repo>/Projects/<project>/src/.swarm/progress.json

Retry flow:
  Auto-retries 1-2 happen internally (no exit).
  After auto_retry_threshold (default 2), exits with code 10 (NEEDS_NOVA).
  Nova resumes: --resume --module 06 --prompt "Use approach X instead of Y"  

Blueprint commands:
  --blueprint <id>        Release a specific blueprint from architecture branch
  --blueprint-list        List all available blueprints

Exit codes:
  0   Success / pipeline complete
  1   Configuration or system error
  10  NEEDS_NOVA — failure, Nova must analyze
  20  BLOCKED — max retries exceeded, human needed
  30  TIMEOUT — agent didn't respond in time
      `);
      process.exit(0);
    }
  }

  // Env fallback
  if (!flags.project) flags.project = process.env.CURRENT_PROJECT;

  (async () => {
    try {
      // Initialize temp directory and shutdown hooks FIRST
      initTempDir();
      registerShutdownHooks();

      const { config, progress } = loadConfig(flags.project, { repoRoot: flags.repo });

      // Blueprint commands
      if (flags.blueprintList) {
        output({ status: 'success', modules: listBlueprints(config) });
        cleanupTempDir();
        process.exit(EXIT_OK);
      }
      if (flags.blueprint) {
        const mod = progress.modules[flags.blueprint];
        if (!mod) {
          output({ status: 'error', error: `Module '${flags.blueprint}' not in progress.json` });
          cleanupTempDir();
          process.exit(EXIT_ERROR);
        }
        const result = await releaseBlueprint(config, progress, flags.blueprint, mod.dir, mod.stages || ['forge', 'buster']);
        output(result);
        cleanupTempDir();
        process.exit(EXIT_OK);
      }

      if (flags.status)  { printStatus(config, progress); cleanupTempDir(); process.exit(EXIT_OK); }
      if (flags.dryRun)  { dryRun(config, progress); cleanupTempDir(); process.exit(EXIT_OK); }

      // Resolve Nova prompt from --prompt or --prompt-file
      let novaPrompt = flags.prompt || null;
      if (!novaPrompt && flags.promptFile) {
        if (!fs.existsSync(flags.promptFile)) {
          throw new Error(`Prompt file not found: ${flags.promptFile}`);
        }
        novaPrompt = fs.readFileSync(flags.promptFile, 'utf8').trim();
        log('INFO', `Nova prompt loaded from file: ${flags.promptFile} (${novaPrompt.length} chars)`);
      }

      const exitCode = await runPipeline(config, progress, {
        module: flags.module,
        resume: flags.resume,
        novaPrompt,
      });
      cleanupTempDir();
      process.exit(exitCode);

    } catch (e) {
      log('ERROR', e.message);
      output({ exit: EXIT_ERROR, error: e.message });
      cleanupTempDir();
      process.exit(EXIT_ERROR);
    }
  })();
}
