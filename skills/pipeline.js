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
  const defaults = { encoding: 'utf8', timeout: 30000 };
  const result = execFileSync('git', ['-C', repoRoot, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

/**
 * Run an openclaw CLI command safely.
 * @param {string[]} args - Command arguments
 * @param {object} opts - Options for execFileSync
 * @returns {string} stdout (trimmed)
 */
function clawExec(args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000 };
  const result = execFileSync('openclaw', args, { ...defaults, ...opts });
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
  const defaults = { encoding: 'utf8', timeout: 30000 };
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

// ─── Path Validation ─────────────────────────────────────────────────────────
// Dynamic script paths from config (redis_js_path, memory_js_path) are validated
// against an allowlist of prefixes. This prevents code execution via path traversal
// if config is ever modified by an untrusted source.

const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];

function validateSafePath(filePath, label) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`${label}: path is empty or not a string`);
  }
  const normalized = path.resolve(filePath);
  if (normalized.includes('..')) {
    throw new Error(`${label}: path traversal detected in '${filePath}'`);
  }
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
  REVIEWING:          'REVIEWING',
  PASS:               'PASS',
  FAIL:               'FAIL',
  BLOCKED:            'BLOCKED',
  RATE_LIMITED:       'RATE_LIMITED',
};

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
// Track the currently running agent so we can clean up on SIGTERM/SIGINT.

let _shutdownState = { config: null, agentType: null, moduleId: null, statusDir: null };

function registerShutdownHooks() {
  const handler = (signal) => {
    log('WARN', `Received ${signal} — initiating graceful shutdown`);
    const { config, agentType, moduleId, statusDir } = _shutdownState;

    // Kill active agent session
    if (config && agentType && moduleId) {
      try { killAgent(config, agentType, moduleId); }
      catch { /* best effort */ }
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

function setShutdownContext(config, agentType, moduleId, statusDir) {
  _shutdownState = { config, agentType, moduleId, statusDir };
}

function clearShutdownContext() {
  _shutdownState = { config: null, agentType: null, moduleId: null, statusDir: null };
}

// ─── Structured Logging ──────────────────────────────────────────────────────
// JSON lines to stderr — parseable by Mission Control, log aggregators, etc.
// stdout is reserved for pipeline output JSON (Nova parses this).
//
// Each log entry: { ts, level, run_id, module?, phase?, msg, data? }
// The run_id correlates all log lines from a single pipeline invocation.

const RUN_ID = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let LOG_MODULE = null;  // Set when entering a module context
let LOG_PHASE = null;   // Set when entering a phase (forge/buster/chaos)

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

function loadConfig(projectName) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.join(scriptDir, 'pipeline.config.json');
  if (!fs.existsSync(configPath)) throw new Error(`Config not found: ${configPath}`);

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.project = projectName || config.project;
  if (!config.project) throw new Error('No project specified. Use --project <n> or set in config.');

  // Resolve repo root
  if (!config.repo_root) {
    try {
      config.repo_root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    } catch {
      throw new Error('Not inside a git repository. Set repo_root in pipeline.config.json');
    }
  }

  // Resolve template paths
  for (const [key, val] of Object.entries(config.paths || {})) {
    config.paths[key] = val.replace(/\$\{project\}/g, config.project);
  }

  // Validate all required fields (fail fast instead of cryptic TypeError later)
  validateConfig(config);

  return config;
}

/**
 * Validate that all required config fields are present.
 * Fails fast at startup with a clear error message instead of
 * cryptic TypeErrors deep in the pipeline.
 */
function validateConfig(config) {
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

  requireField(config, 'project');
  requireField(config, 'repo_root');
  requireField(config, 'paths');
  requireField(config, 'paths.progress_file');
  requireField(config, 'paths.modules_dir');
  requireField(config, 'models');
  requireField(config, 'models.buster');
  requireField(config, 'agents');
  requireField(config, 'agents.forge');
  requireField(config, 'agents.buster');

  for (const [name, agentConf] of Object.entries(config.agents || {})) {
    if (!agentConf.dispatch) {
      errors.push(`config.agents.${name}.dispatch: required ('acp' or 'redis')`);
    }
    if (agentConf.dispatch === 'redis' && !agentConf.redis_js_path) {
      errors.push(`config.agents.${name}.redis_js_path: required for redis dispatch agents`);
    }
  }

  // Defaults (set if missing, don't error)
  if (!config.poll_interval_seconds) config.poll_interval_seconds = 30;
  if (!config.default_timeout_minutes) config.default_timeout_minutes = 60;
  if (!config.default_max_fails) config.default_max_fails = 3;

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n  ${errors.join('\n  ')}`);
  }

  // Validate dynamic script paths (security)
  for (const [name, agentConf] of Object.entries(config.agents || {})) {
    if (agentConf.redis_js_path) {
      validateSafePath(agentConf.redis_js_path, `config.agents.${name}.redis_js_path`);
    }
  }
  if (config.memory?.memory_js_path) {
    validateSafePath(config.memory.memory_js_path, 'config.memory.memory_js_path');
  }
}

function loadProgress(config) {
  const p = path.join(config.repo_root, config.paths.progress_file);
  if (!fs.existsSync(p)) throw new Error(`Progress file not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function modulePath(config, dir)   { return path.join(config.repo_root, config.paths.modules_dir, dir); }
function statusPath(config, dir)   { return path.join(modulePath(config, dir), 'status.json'); }
function swarmRoot(config)         { return path.join(config.repo_root, config.paths.modules_dir, '..'); }

function loadStatus(config, dir) {
  const p = statusPath(config, dir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    // JSON parse can fail due to:
    // - Git merge conflict markers in the file
    // - Partial write (agent was mid-commit)
    // - File corruption
    // Return null so the polling loop treats it as "status not ready yet"
    log('WARN', `status.json parse failed (${dir}): ${e.message} — treating as not ready`);
    return null;
  }
}

function saveStatus(config, dir, status) {
  const p = statusPath(config, dir);
  status.updated_at = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(status, null, 2) + '\n');
  gitCommitQuiet(config, p, `[pipeline] ${status.module_id} → ${status.status}`);
}

function gitCommitQuiet(config, filePath, message) {
  try {
    gitExec(config.repo_root, ['add', filePath], { stdio: 'ignore' });
    gitExec(config.repo_root, ['commit', '-m', message, '--allow-empty'], { stdio: 'ignore' });
    invalidateHeadHash();
  } catch (e) {
    // Git commit failure means status.json is on disk but NOT in git.
    // This can cause issues on the next `git pull --rebase` (untracked file conflicts).
    const reason = e.message?.split('\n')[0] || 'unknown';
    log('WARN', `Git commit failed for status update — file on disk but not in git: ${reason}`);
    discord(config, 'WARN', 'Git Commit Failed',
      `Status update could not be committed: ${reason}`).catch(() => {});
  }
}

/**
 * Safe git pull with context-sensitive rebase abort recovery.
 * @param {object} config - The pipeline configuration
 * @param {boolean} allowDestructiveRecovery - If false, throws an error on conflict instead of doing a hard reset.
 */
function gitPullSafe(config, allowDestructiveRecovery = false) {
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
            gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' });
            gitExec(config.repo_root, ['reset', '--hard', `origin/${branch}`], { stdio: 'ignore' });
            invalidateHeadHash();
            log('OK', `Rebase aborted — reset to origin/${branch}`);
          } else {
            log('OK', 'Rebase aborted — detached HEAD, skipping reset');
          }
        } else {
          throw new Error("Git Rebase conflict detected before push. Aborting to prevent local data loss.");
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

// ─── Git Hash Cache ──────────────────────────────────────────────────────────
// Avoid spawning `git rev-parse --short HEAD` on every addHistory call.
// Invalidated after any git operation that changes HEAD.

let _headHashCache = null;

function headHash() {
  if (_headHashCache) return _headHashCache;
  try {
    _headHashCache = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    return _headHashCache;
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
        footer: { text: `OpenClaw Pipeline · ${config.project} · ${RUN_ID}` },
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
  const dir = config.paths.modules_dir;

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch { /* use cache */ }

  try {
    const out = gitExec(config.repo_root, ['ls-tree', '-d', '--name-only', `origin/${branch}`, `${dir}/`]);
    return out.split('\n').filter(Boolean).map(f => path.basename(f));
  } catch (e) {
    throw new Error(`Cannot read architecture branch '${branch}': ${e.message}`);
  }
}

function releaseBlueprint(config, moduleId, moduleDir) {
  const branch = `${config.project}/architecture`;
  const targetPath = `${config.paths.modules_dir}/${moduleDir}`;

  log('STEP', `Releasing blueprint for ${moduleId} from ${branch}`);

  // Safety check: don't overwrite an existing non-PENDING status
  const existingStatus = loadStatus(config, moduleDir);
  if (existingStatus && existingStatus.status !== STATUS.PENDING) {
    log('WARN', `Module ${moduleId} already has status ${existingStatus.status} — skipping blueprint release`);
    return { status: 'skipped', reason: `existing status: ${existingStatus.status}`, module: moduleDir };
  }

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch { log('WARN', `Could not fetch origin/${branch}, using local cache`); }

  // Verify module exists
  try {
    gitExec(config.repo_root, ['cat-file', '-e', `origin/${branch}:${targetPath}/BUSTER.md`], { stdio: 'ignore' });
  } catch {
    throw new Error(`Module ${moduleId} not found in architecture branch at ${targetPath}`);
  }

  // Checkout into workspace
  try {
    gitExec(config.repo_root, ['checkout', `origin/${branch}`, '--', targetPath], { stdio: 'ignore' });
  } catch (e) {
    throw new Error(`Blueprint checkout failed: ${e.message}`);
  }

  // Commit & push
  try {
    gitExec(config.repo_root, ['add', targetPath], { stdio: 'ignore' });
    const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
    if (porcelain) {
      gitExec(config.repo_root, ['commit', '-m', `[blueprint] Release module ${moduleId} (${moduleDir})`], { stdio: 'ignore' });
      invalidateHeadHash();
      gitPullSafe(config, false); // Block destructive recovery before push
      gitExec(config.repo_root, ['push', 'origin', 'HEAD'], { stdio: 'ignore' });
      log('OK', `Blueprint released and pushed: ${moduleDir}`);
      return { status: 'success', action: 'released', module: moduleDir };
    }
    log('INFO', `Blueprint already up to date: ${moduleDir}`);
    return { status: 'success', action: 'no_changes', module: moduleDir };
  } catch (e) {
    throw new Error(`Blueprint commit/push failed: ${e.message}`);
  }
}

// ─── Agent Dispatch (Dual Mode: ACP + Redis) ────────────────────────────────
//
// Two dispatch modes based on agent type:
//
// ACP agents (Forge, Echo) — Nova's subagents
//   - Spawned as thread-bound ACP sessions via OpenClaw CLI
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

// ── ACP Dispatch (Forge, Echo) ──

function spawnAcpAgent(config, agentType, moduleId, model, taskPrompt) {
  const agentConfig = config.agents[agentType];
  const label = acpLabel(agentType, moduleId);
  const agentId = agentConfig.acp_agent_id || agentType;
  const cwd = agentConfig.cwd || config.repo_root;

  log('STEP', `Spawning ACP session: ${label} (agent: ${agentId}, model: ${model})`);

  // Write prompt to temp file to avoid OS argument length limits (E2BIG)
  // on large prompts (FORGE.md + retry context + memory context can be 10KB+).
  // The agent is instructed to read the file for its task instructions.
  const tmpPromptPath = tmpFile('prompt', moduleId, '.md');
  fs.writeFileSync(tmpPromptPath, taskPrompt);

  // The task arg tells the agent WHERE to find its instructions, not the instructions themselves.
  // This keeps CLI args small and avoids E2BIG regardless of prompt size.
  const taskArg = [
    `Your full task instructions are in the file: ${tmpPromptPath}`,
    `Read this file FIRST before doing anything else.`,
    `The file contains your complete FORGE.md instructions, retry context (if any), and memory context.`,
    `Begin by reading it with: cat ${tmpPromptPath}`,
  ].join('\n');

  try {
    const result = clawExec([
      'sessions', 'spawn',
      '--agentId', agentId,
      '--runtime', 'acp',
      '--mode', 'persistent',
      '--label', label,
      '--model', model,
      '--cwd', cwd,
      '--thread', 'auto',
      '--task', taskArg,
    ], { timeout: 30000 });

    log('OK', `ACP session spawned: ${label}`);
    return { label, result };
  } catch (e) {
    throw new Error(`Failed to spawn ACP session '${label}': ${e.message}`);
  }
  // Note: prompt temp file is NOT cleaned up here — the agent needs to read it.
  // It lives in the per-run _tmpDir which is cleaned up when the pipeline exits.
}

function killAcpAgent(config, agentType, moduleId) {
  const label = acpLabel(agentType, moduleId);
  log('STEP', `Destroying ACP session: ${label}`);
  try {
    clawExec(['sessions', 'kill', '--label', label], { stdio: 'ignore', timeout: 15000 });
    log('OK', `Session destroyed: ${label}`);
  } catch {
    log('WARN', `Could not destroy session '${label}' — may have already exited`);
  }
}

// ── Redis Dispatch (Buster) ──
// Writes a structured task to Buster's Redis stream. The processor sidecar
// picks it up, enriches with Qdrant context, and injects into Buster's gateway.
//
// Two task types:
//   module_test  — Standard module testing (spawns isolated gemini-flash session)
//   chaos_test   — Post-milestone chaos testing (spawns codex/sonnet session)

function buildBusterPayload(config, progress, moduleId, taskType, taskPrompt, status) {
  const mod = progress.modules[moduleId];

  // Common fields
  const base = {
    task_type: taskType,
    module: moduleId,
    project: config.project,
    commit_hash: status?.forge_commit_hash || null,
    timestamp: new Date().toISOString(),
  };

  if (taskType === 'module_test') {
    // Standard module test — isolated gemini-flash session
    return {
      ...base,
      instructions: taskPrompt,
      session: {
        model: 'gemini-flash',
        mode: 'oneshot',
        destroy_after: true,
        label: `buster-test-${moduleId}-${Date.now()}`,
      },
      module_path: mod ? `${config.paths.modules_dir}/${mod.dir}` : null,
      buster_md_path: mod ? `${config.paths.modules_dir}/${mod.dir}/BUSTER.md` : null,
      status_json_path: mod ? `${config.paths.modules_dir}/${mod.dir}/status.json` : null,
      on_complete: {
        update_status_json: true,
        git_commit: true,
        git_push: true,
        include_commit_hash: true,
        status_on_pass: 'PASS',
        status_on_fail: 'FAIL',
        fail_summary_required: true,
      },
    };
  }

  if (taskType === 'chaos_test') {
    // Chaos test — use stronger model, broader scope
    return {
      ...base,
      instructions: taskPrompt,
      session: {
        model: config.chaos_test?.model || 'claude-sonnet-4-6',
        mode: 'oneshot',
        destroy_after: true,
        label: `buster-chaos-${moduleId}-${Date.now()}`,
      },
      chaos_config: {
        scope: 'full_application',
        goal: 'Try to crash the application. Test edge cases, invalid inputs, race conditions, resource exhaustion, malformed requests. Be creative and destructive.',
        time_limit_minutes: config.chaos_test?.time_limit_minutes || 30,
      },
      on_complete: {
        update_status_json: true,
        git_commit: true,
        git_push: true,
        include_commit_hash: true,
        status_on_pass: 'PASS',
        status_on_fail: 'FAIL',
        fail_summary_required: true,
      },
    };
  }

  // Fallback for steer or other types
  return { ...base, message: taskPrompt };
}

function dispatchRedisTask(config, progress, agentType, moduleId, taskType, payload, status = null) {
  const agentConfig = config.agents[agentType];
  const redisJsPath = validateSafePath(
    agentConfig.redis_js_path || '/app/skills/redis.js',
    `agents.${agentType}.redis_js_path`
  );

  log('STEP', `Dispatching to Redis: ${agentType} (module: ${moduleId}, type: ${taskType})`);

  // Build structured payload
  const taskPayload = (taskType === 'module_test' || taskType === 'chaos_test')
    ? buildBusterPayload(config, progress, moduleId, taskType, payload, status)
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
    return JSON.parse(result);
  } catch (e) {
    throw new Error(`Failed to dispatch Redis task to ${agentType}: ${e.message}`);
  }
  // Temp files live in _tmpDir — cleaned up when the pipeline exits
}

// ── Unified Interface ──
// The rest of the pipeline uses these three functions without caring
// whether the agent is ACP or Redis.

function spawnAgent(config, progress, agentType, moduleId, model, taskPrompt, opts = {}) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);

  if (agentConfig.dispatch === 'redis') {
    const taskType = opts.taskType || 'module_test';
    return dispatchRedisTask(config, progress, agentType, moduleId, taskType, taskPrompt, opts.status);
  } else {
    return spawnAcpAgent(config, agentType, moduleId, model, taskPrompt);
  }
}

function killAgent(config, agentType, moduleId) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return;

  if (agentConfig.dispatch === 'redis') {
    // Redis agents are persistent instances — no session to destroy.
    // Buster finishes its task and returns to idle on its own.
    log('INFO', `${agentType} is a Redis agent — no session to destroy (persistent instance)`);
  } else {
    killAcpAgent(config, agentType, moduleId);
  }
}

function steerAgent(config, progress, agentType, moduleId, message) {
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
    try {
      clawExec(['sessions', 'send', '--label', label, '--message', message], { timeout: 15000 });
    } catch (e) {
      log('WARN', `ACP steer failed for '${label}': ${e.message}`);
    }
  }
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
async function recallForModule(config, moduleId, moduleTitle, additionalContext = '') {
  if (!memoryEnabled(config)) return { block: '', count: 0 };

  const limit = config.memory?.recall_limit || 5;
  const memPath = memoryJsPath(config);

  // Build a natural language query — embedding models work better with sentences
  // than with keyword dumps like "06 WebSockets 06a 06b"
  const substepInfo = additionalContext ? ` with steps ${additionalContext}` : '';
  const query = `What established patterns, solutions, and architectural decisions exist for building ${moduleTitle}${substepInfo}? Include relevant technical insights from similar modules.`;

  log('STEP', `Memory recall for module ${moduleId}: "${query.slice(0, 80)}..."`);

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
      return { block: '', count: 0 };
    }

    log('OK', `${memories.length} memories recalled`);

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

    const block = [
      '',
      '---',
      '## 📎 CONTEXT FROM SWARM MEMORY',
      '',
      'The following learnings from previous work may be relevant.',
      '★★★ = validated pattern, ★★☆ = neutral, ★☆☆ = unverified.',
      'Use these as guidance, not as absolute truth.',
      '',
      ...lines,
      '',
      '---',
      '',
    ].join('\n');

    return { block, count: memories.length };
  } catch (e) {
    log('WARN', `Memory recall failed: ${e.message}`);
    return { block: '', count: 0 };
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
 * Spawn a Summary Agent after module PASS to extract and store technical insights.
 *
 * Instead of storing useless metadata like "Module 03 completed successfully",
 * this spawns a short ACP oneshot Echo agent that:
 *   1. Reads the git diff since module start
 *   2. Reads fail_summaries (what went wrong on retries)
 *   3. Writes a concise technical summary of WHAT was built and HOW
 *   4. Stores it via memory.js with appropriate scope and tags
 *
 * Clean passes (0 retries) → scope=global (cross-project reusable)
 * Messy passes (retries)   → scope=global (even MORE valuable — we learned something)
 * The real question is not "did it pass clean" but "is the insight reusable"
 */
async function spawnSummaryAgent(config, moduleId, moduleTitle, status) {
  if (!memoryEnabled(config)) return;
  if (!config.memory?.store_patterns_globally) return;

  const memPath = memoryJsPath(config);
  const failCount = status?.fail_count || 0;
  const failSummaries = status?.fail_summaries || [];
  const forgeCommit = status?.forge_commit_hash || '';

  log('STEP', `Spawning Summary Agent for module ${moduleId}`);

  // Marker file — Summary Agent writes this when done so next pipeline run
  // can verify it finished (fire-and-forget tracking).
  const markerDir = path.join(swarmRoot(config), 'summary-markers');
  const markerPath = path.join(markerDir, `${moduleId}-summary.json`);

  // Skip if already summarized (idempotent)
  if (fs.existsSync(markerPath)) {
    log('INFO', `Summary Agent already completed for ${moduleId} — skipping`);
    return;
  }
  if (!fs.existsSync(markerDir)) fs.mkdirSync(markerDir, { recursive: true });

  // Build the summary prompt
  const failContext = failSummaries.length > 0
    ? [
        '',
        '## What Failed (and how it was fixed)',
        '',
        ...failSummaries.map((f, i) =>
          `**Attempt ${f.attempt}** (${f.phase}): ${f.summary}`
        ),
        '',
        'The fix that eventually worked is in the current code. Identify WHAT was changed to make it pass.',
      ].join('\n')
    : '';

  const summaryPrompt = [
    `## Task: Extract Technical Insights for Module ${moduleId}`,
    '',
    `You are a Summary Agent. Your job is to extract reusable technical knowledge.`,
    `Module "${moduleTitle}" just passed all tests${failCount > 0 ? ` after ${failCount} retries` : ' on first attempt'}.`,
    '',
    `### Instructions`,
    '',
    `1. Run: \`git diff ${forgeCommit ? forgeCommit + '~1..' + forgeCommit : 'HEAD~5..HEAD'} --stat\``,
    `   to see what files were changed.`,
    '',
    `2. Read the key files that were created/modified.`,
    '',
    `3. For EACH significant technical decision or pattern, store a memory:`,
    '   ```bash',
    `   node ${memPath} remember \\`,
    `     --text "Concise technical insight — what was done and why" \\`,
    `     --tags "tag1,tag2,${moduleId},${config.project}" \\`,
    `     --scope global \\`,
    `     --module ${moduleId}`,
    '   ```',
    '',
    '### What to extract (examples):',
    '- "WebSocket auth: must call close(4001) BEFORE accept() — calling after accept sends the close to an already-open connection"',
    '- "FastAPI WebSocket routes must be registered on app directly, not on APIRouter — Router does not support ws"',
    '- "K8s pod log streaming: use run_in_executor for blocking readline() to avoid blocking the asyncio event loop"',
    '- "Podman rootless in K8s: needs SYS_ADMIN + SYS_CHROOT capabilities and tmpfs mount for storage"',
    '',
    '### What NOT to store:',
    '- "Module 06 passed" (useless metadata)',
    '- "The code works" (no technical content)',
    '- Implementation details that are project-specific and not reusable',
    '',
    failContext,
    '',
    '### Rules',
    '- Store 1-5 insights (quality over quantity)',
    '- Each insight must be a self-contained sentence an engineer can act on',
    '- Use `--scope global` for reusable patterns, `--scope project` for project-specific context',
    '- Include technology names in tags for discoverability',
    `- AFTER storing all insights, write a completion marker:`,
    '  ```bash',
    `  mkdir -p ${markerDir}`,
    `  echo '{"module":"${moduleId}","completed_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","insights_stored":N}' > ${markerPath}`,
    `  git add ${markerPath} && git commit -m "[summary] ${moduleId} insights stored" && git push origin HEAD`,
    '  ```',
    '- Then exit. No further action needed.',
  ].join('\n');

  // Spawn as lightweight native subagent session (no ACP overhead needed)
  // Fire-and-forget: the summary agent is non-critical. Its output (Qdrant memories)
  // will be available for the NEXT module's recall, not the current one.
  // No reason to block the pipeline waiting for it.
  const label = `summary-${moduleId}`;
  const model = config.models.echo || 'claude-sonnet-4-6';

  try {
    clawExec([
      'sessions', 'spawn',
      '--agentId', 'echo',
      '--label', label,
      '--model', model,
      '--task', summaryPrompt,
    ], { timeout: 60000 });
    log('OK', `Summary Agent spawned (fire-and-forget): ${label}`);
  } catch (e) {
    log('WARN', `Summary Agent spawn failed: ${e.message}`);
  }
  // Agent runs in background, stores memories, exits on its own.
  // No sleep, no kill — pipeline continues immediately.
}

// ─── Polling ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Consistent poll result wrapper — all callers get the same shape.
 * @typedef {Object} PollResult
 * @property {boolean} ok - Whether a target status was reached
 * @property {string} reason - 'target_reached' | 'timeout' | 'blocked' | 'rate_limit_exhausted' | 'parse_corrupted'
 * @property {object|null} status - The status.json content
 */
function pollResult(ok, reason, status = null) {
  return { ok, reason, status };
}

async function pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes) {
  const interval = config.poll_interval_seconds * 1000;
  let deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  let rateLimitPauses = 0;
  let consecutiveParseFailures = 0;
  const maxParseFailures = 10; // ~5min at 30s intervals

  log('INFO', `Polling every ${config.poll_interval_seconds}s | timeout: ${timeoutMinutes}min | waiting for: ${expectedStatuses.join(' | ')}`);

  while (Date.now() < deadline) {
    await sleep(interval);

    // Agent may have committed — pull latest
    gitPullSafe(config); // Default: Destructive Recovery allowed

    const status = loadStatus(config, moduleDir);

    if (!status) {
      // null can mean: file doesn't exist yet (normal) OR parse failure (bad)
      // Track consecutive nulls — if the file EXISTS but can't parse, it's corruption
      const filePath = statusPath(config, moduleDir);
      if (fs.existsSync(filePath)) {
        consecutiveParseFailures++;
        if (consecutiveParseFailures >= maxParseFailures) {
          log('ERROR', `status.json has been unparseable for ${consecutiveParseFailures} consecutive polls — treating as corrupted`);
          return pollResult(false, 'parse_corrupted', { module_id: moduleDir });
        }
        log('WARN', `status.json parse failure ${consecutiveParseFailures}/${maxParseFailures}`);
      }
      continue;
    }

    // Successful parse — reset counter
    consecutiveParseFailures = 0;

    if (expectedStatuses.includes(status.status)) {
      log('OK', `Target status reached: ${status.status}`);
      return pollResult(true, 'target_reached', status);
    }

    if (status.status === STATUS.BLOCKED) {
      log('ERROR', 'Module externally marked BLOCKED');
      return pollResult(false, 'blocked', status);
    }

    // Rate limit detection — pause and resume, with max pause limit
    if (status.status === STATUS.RATE_LIMITED) {
      rateLimitPauses++;
      const maxPauses = config.rate_limit?.max_pauses_per_module || 5;

      if (rateLimitPauses > maxPauses) {
        log('ERROR', `Rate limit pauses exceeded max (${rateLimitPauses}/${maxPauses}) — giving up`);
        return pollResult(false, 'rate_limit_exhausted', status);
      }

      await handleRateLimit(config, status, moduleDir, rateLimitPauses, maxPauses);
      const cooldownMs = (config.rate_limit?.cooldown_hours || 2) * 60 * 60 * 1000;
      deadline += cooldownMs;
      log('INFO', `Timeout deadline extended by ${config.rate_limit?.cooldown_hours || 2}h after rate limit pause (${rateLimitPauses}/${maxPauses})`);
      continue;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log('INFO', `[${status.module_id}] status=${status.status} phase=${status.current_phase} elapsed=${elapsed}s remaining=${remaining}s`);
  }

  log('ERROR', `Timeout after ${timeoutMinutes} minutes`);
  return pollResult(false, 'timeout', null);
}

// ─── Rate Limit Handling ─────────────────────────────────────────────────────
// Agents or the processor sidecar can set status to RATE_LIMITED when the
// upstream API (OpenAI, Anthropic) returns 429 or equivalent.
// The pipeline pauses for a configurable cooldown, then resumes polling.
// The agent session stays alive during the pause — no kill-and-respawn.
// The timeout clock is frozen during the pause.

async function handleRateLimit(config, status, moduleDir, pauseCount = 1, maxPauses = 5) {
  const cooldownHours = config.rate_limit?.cooldown_hours || 2;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const resumeAt = new Date(Date.now() + cooldownMs);

  // Capture current phase BEFORE sleep — don't rely on status reference after 2h
  const preSleepPhase = status.current_phase;

  log('WARN', `Rate limit detected! Pause ${pauseCount}/${maxPauses}. Sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`);

  await discord(config, 'WARN', `Rate Limited — Pause ${pauseCount}/${maxPauses}`,
    `Module ${status.module_id} hit API rate limit. Agent session preserved. Auto-resume at ${resumeAt.toLocaleTimeString()}.`, [
      { name: 'Module', value: status.module_id },
      { name: 'Phase', value: status.current_phase },
      { name: 'Pause', value: `${pauseCount}/${maxPauses}` },
      { name: 'Resume At', value: resumeAt.toISOString() },
    ]);

  // Add to history
  addHistory(status, STATUS.RATE_LIMITED, 'pipeline', `Paused ${cooldownHours}h (rate limit)`);
  saveStatus(config, moduleDir, status);

  // Sleep through the cooldown
  await sleep(cooldownMs);

  log('OK', 'Rate limit cooldown complete — resuming polling');
  await discord(config, 'INFO', 'Rate limit cooldown complete', `Resuming module ${status.module_id}`);

  // IMPORTANT: Load FRESH status after sleep — discard the old reference.
  // Another process may have modified the file during the 2h cooldown.
  const freshStatus = loadStatus(config, moduleDir);
  if (freshStatus && freshStatus.status === STATUS.RATE_LIMITED) {
    freshStatus.status = preSleepPhase === 'forge' ? STATUS.IN_PROGRESS : STATUS.TESTING;
    addHistory(freshStatus, freshStatus.status, 'pipeline', 'Resumed after rate limit cooldown');
    saveStatus(config, moduleDir, freshStatus);
  }
}

// ─── Git Sync (Forge → Buster handoff) ──────────────────────────────────────
// Before Buster starts, ALL Forge changes must be committed and pushed.
// The commit hash is recorded in status.json so Buster works on verified code.

function gitSyncBeforeBuster(config, moduleDir, status) {
  log('STEP', 'Git sync: committing and pushing Forge output before Buster');

  try {
    // Stage everything in the repo (Forge may have created files anywhere)
    gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });

    const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
    if (porcelain) {
      gitExec(config.repo_root, [
        'commit', '-m', `[pipeline] Module ${status.module_id}: Forge output — ready for Buster`
      ], { stdio: 'ignore' });
      invalidateHeadHash();
      log('OK', 'Forge output committed');
    } else {
      log('INFO', 'No uncommitted changes (Forge already committed)');
    }

    // Pull before push to avoid non-fast-forward rejection
    // (another agent or human may have pushed while Forge was working)
    // False = Block destructive recovery. If conflict occurs here, throw error and retry pipeline.

    gitPullSafe(config, false); 
    gitExec(config.repo_root, ['push', 'origin', 'HEAD'], { stdio: 'ignore' });
    log('OK', 'Pushed to origin');

    // Record commit hash
    const commitHash = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const shortHash = commitHash.substring(0, 8);
    invalidateHeadHash();

    status.forge_commit_hash = commitHash;
    addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline', `Git sync complete (${shortHash})`);
    log('OK', `Forge commit hash recorded: ${shortHash}`);

    return commitHash;
  } catch (e) {
    throw new Error(`Git sync failed before Buster handoff: ${e.message}`);
  }
}

function checkDependencies(config, progress, moduleId) {
  const mod = progress.modules[moduleId];
  if (!mod) return { met: false, reason: `Module ${moduleId} not found` };

  for (const dep of mod.depends_on) {
    if (dep.startsWith('gate:')) {
      const gateId = dep.replace('gate:', '');
      const gate = progress.gates[gateId];
      if (!gate) return { met: false, reason: `Gate '${gateId}' not defined` };

      if (gate.output_file) {
        if (!fs.existsSync(path.join(swarmRoot(config), gate.output_file))) {
          return { met: false, reason: `Gate '${gateId}' not completed` };
        }
      }
      if (gate.type === 'buster') {
        const gsp = path.join(swarmRoot(config), `${gateId}-status.json`);
        if (!fs.existsSync(gsp)) return { met: false, reason: `Gate '${gateId}' not completed` };
        const gs = JSON.parse(fs.readFileSync(gsp, 'utf8'));
        if (gs.status !== STATUS.PASS) return { met: false, reason: `Gate '${gateId}' is ${gs.status}` };
      }
    } else {
      const depMod = progress.modules[dep];
      if (!depMod) return { met: false, reason: `Dependency '${dep}' not defined` };
      const depStatus = loadStatus(config, depMod.dir);
      if (!depStatus || depStatus.status !== STATUS.PASS) {
        return { met: false, reason: `Module ${dep} (${depMod.title}) is ${depStatus?.status || 'NOT_STARTED'}` };
      }
    }
  }

  return { met: true };
}

// ─── Failure Handler ─────────────────────────────────────────────────────────

async function handleFail(config, status, moduleDir, moduleId, maxFails, phase, reason, opts = {}) {
  const isTimeout = opts.isTimeout || false;

  if (reason) {
    status.fail_summaries.push({
      attempt: status.fail_count + 1,
      timestamp: new Date().toISOString(),
      summary: reason,
      phase,
      is_timeout: isTimeout,
    });
    status.fail_count++;
  }

  // Memory feedback: avoid "over-punishment"
  // A module failing 3 times because of a syntax error should NOT decay
  // architectural memories 3x. The memories were likely correct — the agent
  // just made implementation mistakes.
  //
  // Strategy:
  //   fail_count == 1 → feedbackMemory('fail') — first failure, single decay
  //   fail_count > 1 && < maxFails → skip — retries don't re-punish memories
  //   fail_count >= maxFails → feedbackMemory('blocked') — final, strong signal
  const failReason = reason || status.fail_summaries?.[status.fail_summaries.length - 1]?.summary || '';
  if (status.fail_count === 1) {
    await feedbackMemory(config, moduleId, 'fail', failReason);
  } else if (status.fail_count >= maxFails) {
    await feedbackMemory(config, moduleId, 'blocked', failReason);
  }
  // Intermediate retries: no memory feedback (memories are not to blame)

  status.status = STATUS.FAIL;
  status.current_phase = null;
  addHistory(status, STATUS.FAIL, 'pipeline',
    `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`);
  saveStatus(config, moduleDir, status);

  if (status.fail_count >= maxFails) {
    status.status = STATUS.BLOCKED;
    addHistory(status, STATUS.BLOCKED, 'pipeline', `Max retries (${maxFails}) exceeded`);
    saveStatus(config, moduleDir, status);
    await discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED`,
      `Failed ${maxFails} times in ${phase} phase. Human intervention needed.`);
    return { exit: EXIT_BLOCKED, reason: `Max retries exceeded (${phase})`, module: moduleId, status };
  }

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

  // Escalation — either timeout or auto-retry threshold exceeded
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

  return {
    exit: exitCode,
    reason: isTimeout
      ? `${phase} timed out — agent did not respond`
      : `${phase} failed ${status.fail_count}x — Nova must provide new approach via --resume --module ${moduleId} --prompt "..."`,
    module: moduleId,
    module_dir: moduleDir,
    fail_count: status.fail_count,
    max_fails: maxFails,
    is_timeout: isTimeout,
    last_fail: status.fail_summaries[status.fail_summaries.length - 1] || null,
  };
}

// ─── Module Runner ───────────────────────────────────────────────────────────

async function runModule(config, progress, moduleId, opts = {}) {
  const mod = progress.modules[moduleId];
  if (!mod) throw new Error(`Module ${moduleId} not in progress.json`);

  const dir = mod.dir;
  const timeout = mod.timeout_minutes || config.default_timeout_minutes;
  const maxFails = mod.max_fails || config.default_max_fails;

  // Nova prompt override: passed via --resume --module <id> --prompt "new approach"
  // This is injected into the Forge prompt when Nova has analyzed a failure and
  // wants the agent to take a specific different approach.
  const novaPrompt = opts.novaPrompt || null;

  // Set logging context for this module
  LOG_MODULE = moduleId;
  LOG_PHASE = null;

  log('STEP', `═══════════════════════════════════════════════════`);
  log('STEP', `  MODULE ${moduleId}: ${mod.title}`);
  log('STEP', `═══════════════════════════════════════════════════`);

  // ── Dependencies ──
  const deps = checkDependencies(config, progress, moduleId);
  if (!deps.met) return { exit: EXIT_ERROR, reason: `Dependencies not met: ${deps.reason}` };

  // ──────────────────────────────────────────────────────────────────────────
  //  RETRY LOOP
  //  Auto-retries are handled internally (up to auto_retry_threshold).
  //  The loop re-reads status from disk each iteration so fail_count,
  //  fail_summaries, and retry context are always fresh.
  // ──────────────────────────────────────────────────────────────────────────
  while (true) {

  // ── Load or init status ──
  let status = loadStatus(config, dir);

  if (status?.status === STATUS.PASS) {
    log('OK', `Module ${moduleId} already PASS — skipping`);
    return { exit: EXIT_OK, status: STATUS.PASS };
  }
  if (status?.status === STATUS.BLOCKED) {
    return { exit: EXIT_BLOCKED, reason: `Module ${moduleId} is BLOCKED`, module: moduleId };
  }

  // ── Release blueprint if needed ──
  if (!status || status.status === STATUS.PENDING) {
    releaseBlueprint(config, moduleId, dir);
    if (!status) {
      status = initStatus(moduleId, mod);
      saveStatus(config, dir, status);
    }
  }

  // ── Determine resume point ──
  const needsForge = [STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.FAIL].includes(status.status)
    && status.current_phase !== 'buster';
  const needsBuster = status.status === STATUS.READY_FOR_TESTING
    || (status.status === STATUS.TESTING && status.current_phase === 'buster');

  // ──────────────────────────────────────────────────────────────────────────
  //  FORGE PHASE
  // ──────────────────────────────────────────────────────────────────────────
  if (needsForge) {
    LOG_PHASE = 'forge';
    log('STEP', `Phase: FORGE (subagent: ${mod.forge_subagent}, model: ${mod.forge_model})`);

    let forgePrompt;
    try { forgePrompt = readForgeInstructions(config, dir, mod); }
    catch (e) { return { exit: EXIT_ERROR, reason: e.message }; }

    // On retry: append structured fail context for the fresh agent
    if (status.status === STATUS.FAIL && status.fail_summaries.length > 0) {
      const lastFail = status.fail_summaries[status.fail_summaries.length - 1];
      forgePrompt += '\n\n---\n\n';
      forgePrompt += `## RETRY CONTEXT (Attempt ${status.fail_count + 1}/${maxFails})\n\n`;
      forgePrompt += `The previous attempt failed. Here is what went wrong:\n\n`;
      forgePrompt += `**Phase:** ${lastFail.phase}\n`;
      forgePrompt += `**Error:** ${lastFail.summary}\n\n`;
      forgePrompt += `Fix the issues. Do NOT repeat the same approach if it already failed.\n`;
      forgePrompt += `Read the error carefully and take a fundamentally different approach if needed.`;
    }

    // Nova prompt override: if Nova analyzed the failure and provided a new approach,
    // inject it as a high-priority section after the retry context.
    if (novaPrompt) {
      forgePrompt += '\n\n---\n\n';
      forgePrompt += `## NOVA DIRECTIVE (High Priority)\n\n`;
      forgePrompt += `Nova has analyzed the previous failures and determined a new approach.\n`;
      forgePrompt += `Follow these instructions with higher priority than the retry context above:\n\n`;
      forgePrompt += novaPrompt;
      forgePrompt += '\n';
      log('INFO', `Nova prompt override injected (${novaPrompt.length} chars)`);
    }

    // Recall relevant memories from Qdrant (project + global cross-project patterns)
    if (config.memory?.recall_before_forge !== false) {
      const additionalCtx = mod.substeps ? mod.substeps.join(', ') : '';
      const { block: memoryBlock, count: memoryCount } = await recallForModule(
        config, moduleId, mod.title, additionalCtx
      );
      if (memoryBlock) {
        forgePrompt += memoryBlock;
        log('INFO', `${memoryCount} memories injected into Forge prompt`);
      }
    }

    status.status = STATUS.IN_PROGRESS;
    status.current_phase = 'forge';
    if (!status.started_at) status.started_at = new Date().toISOString();
    addHistory(status, STATUS.IN_PROGRESS, 'pipeline', `Forge started (${mod.forge_subagent})`);
    saveStatus(config, dir, status);

    await discord(config, 'INFO', `Module ${moduleId} started`, mod.title, [
      { name: 'Model', value: mod.forge_model },
      { name: 'Subagent', value: mod.forge_subagent },
      { name: 'Attempt', value: `${status.fail_count + 1}/${maxFails}` },
    ]);

    setShutdownContext(config, 'forge', moduleId, dir);

    // Spawn fresh Forge session
    try { spawnAgent(config, progress, 'forge', moduleId, mod.forge_model, forgePrompt); }
    catch (e) { return { exit: EXIT_ERROR, reason: `Forge spawn failed: ${e.message}` }; }

    // Poll
    const result = await pollStatus(config, dir,
      [STATUS.READY_FOR_TESTING, STATUS.FAIL, STATUS.BLOCKED], timeout);

    // ALWAYS destroy session — kill-and-respawn strategy
    killAgent(config, 'forge', moduleId);
    clearShutdownContext();

    if (!result.ok) {
      status = loadStatus(config, dir) || status;

      if (result.reason === 'timeout') {
        const failResultTO = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
          `TIMEOUT: Forge did not complete within ${timeout} minutes`, { isTimeout: true });
        if (failResultTO._retry) { log('INFO', 'Auto-retrying after forge timeout...'); continue; }
        return failResultTO;
      }
      if (result.reason === 'rate_limit_exhausted') {
      await discord(config, 'CRITICAL', `Module ${moduleId} RATE LIMITED`,
        `Exceeded max rate limit pauses. Pipeline cannot continue.`);
        return {
          exit: EXIT_RATE_LIMITED,
          reason: 'Rate limit pauses exceeded maximum — pipeline halted',
          module: moduleId, module_dir: dir,
        };
      }
      if (result.reason === 'parse_corrupted') {
        const failResultPC = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
          'status.json is permanently corrupted (unparseable after multiple attempts)');
        if (failResultPC._retry) { log('INFO', 'Auto-retrying after parse corruption...'); continue; }
        return failResultPC;
      }

      // blocked or FAIL without details
      const failResult1 = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
        status.fail_summaries.length > 0 ? null : 'Forge reported FAIL without details');
      if (failResult1._retry) { log('INFO', 'Auto-retrying forge phase...'); continue; }
      return failResult1;
    }

    status = loadStatus(config, dir) || status;

    if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
      const failResult2 = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
        status.fail_summaries.length > 0 ? null : 'Forge reported FAIL without details');
      if (failResult2._retry) { log('INFO', 'Auto-retrying forge phase...'); continue; }
      return failResult2;
    }

    log('OK', 'Forge complete → READY_FOR_TESTING');
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  GIT SYNC (Forge → Buster handoff)
  //  Ensures Buster always works on committed, pushed code.
  //  Records commit hash in status.json for traceability.
  // ──────────────────────────────────────────────────────────────────────────
  if (needsBuster || status.status === STATUS.READY_FOR_TESTING) {
    try {
      gitSyncBeforeBuster(config, dir, status);
      saveStatus(config, dir, status);
    } catch (e) {
      return { exit: EXIT_ERROR, reason: e.message };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  BUSTER PHASE
  // ──────────────────────────────────────────────────────────────────────────
  if (status.status === STATUS.READY_FOR_TESTING) {
    LOG_PHASE = 'buster';
    log('STEP', `Phase: BUSTER (model: ${config.models.buster})`);

    let busterPrompt;
    try { busterPrompt = readBusterInstructions(config, dir); }
    catch (e) { return { exit: EXIT_ERROR, reason: e.message }; }

    // Inject commit hash so Buster knows exactly which code to test
    if (status.forge_commit_hash) {
      busterPrompt = `## Test Target\n\n`
        + `**Commit:** \`${status.forge_commit_hash.substring(0, 8)}\`\n`
        + `**Module:** ${moduleId} — ${mod.title}\n`
        + `**Branch:** \`git pull origin HEAD\` before testing to ensure you have the latest.\n\n---\n\n`
        + busterPrompt;
    }

    status.status = STATUS.TESTING;
    status.current_phase = 'buster';
    addHistory(status, STATUS.TESTING, 'pipeline', 'Buster started');
    saveStatus(config, dir, status);

    setShutdownContext(config, 'buster', moduleId, dir);

    try { spawnAgent(config, progress, 'buster', moduleId, config.models.buster, busterPrompt, { status, taskType: 'module_test' }); }
    catch (e) { return { exit: EXIT_ERROR, reason: `Buster spawn failed: ${e.message}` }; }

    const result = await pollStatus(config, dir,
      [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED], timeout);

    // ALWAYS destroy session
    killAgent(config, 'buster', moduleId);
    clearShutdownContext();

    if (!result.ok) {
      status = loadStatus(config, dir) || status;

      if (result.reason === 'timeout') {
        const bFailTO = await handleFail(config, status, dir, moduleId, maxFails, 'buster',
          `TIMEOUT: Buster did not complete within ${timeout} minutes`, { isTimeout: true });
        if (bFailTO._retry) { log('INFO', 'Auto-retrying after buster timeout...'); continue; }
        return bFailTO;
      }
      if (result.reason === 'rate_limit_exhausted') {
      await discord(config, 'CRITICAL', `Module ${moduleId} RATE LIMITED (Buster)`,
        `Exceeded max rate limit pauses during testing.`);
        return {
          exit: EXIT_RATE_LIMITED,
          reason: 'Rate limit pauses exceeded maximum during Buster phase',
          module: moduleId, module_dir: dir,
        };
      }
      if (result.reason === 'parse_corrupted') {
        const bFailPC = await handleFail(config, status, dir, moduleId, maxFails, 'buster',
          'status.json is permanently corrupted (unparseable after multiple attempts)');
        if (bFailPC._retry) { log('INFO', 'Auto-retrying after buster parse corruption...'); continue; }
        return bFailPC;
      }
    }

    status = loadStatus(config, dir) || status;

    if (status.status === STATUS.PASS) {
      status.completed_at = new Date().toISOString();
      status.current_phase = null;
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

      // Memory: update confidence on related memories
      await feedbackMemory(config, moduleId, 'pass');
      // Summary Agent: extract and store real technical insights
      await spawnSummaryAgent(config, moduleId, mod.title, status);

      return { exit: EXIT_OK, status: STATUS.PASS };
    }

    if (status.status === STATUS.FAIL) {
      const bFailFinal = await handleFail(config, status, dir, moduleId, maxFails, 'buster',
        status.fail_summaries.length > 0 ? null : 'Buster reported FAIL without details');
      if (bFailFinal._retry) { log('INFO', 'Auto-retrying module from forge phase...'); continue; }
      return bFailFinal;
    }
  }

  LOG_MODULE = null;
  LOG_PHASE = null;
  return { exit: EXIT_ERROR, reason: `Unexpected status: ${status?.status}` };

  } // end retry loop
}

// ─── Gate Runner ─────────────────────────────────────────────────────────────

function gateStatusPath(config, gateId) {
  return path.join(swarmRoot(config), `${gateId}-gate-status.json`);
}

function loadGateStatus(config, gateId) {
  const p = gateStatusPath(config, gateId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

async function runGate(config, progress, gateId) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found`);

  log('STEP', `═══════════════════════════════════════════════════`);
  log('STEP', `  GATE: ${gate.title}`);
  log('STEP', `═══════════════════════════════════════════════════`);

  if (gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    if (fs.existsSync(outPath)) {
      log('OK', `Gate '${gateId}' already completed — skipping`);
      return { exit: EXIT_OK, status: STATUS.PASS };
    }
  }

  let instructions;
  try { instructions = readGateInstructions(config, gate); }
  catch (e) { return { exit: EXIT_ERROR, reason: e.message }; }

  const agentType = gate.type;
  const model = gate.model || config.models[agentType];
  const timeout = gate.timeout_minutes || config.default_timeout_minutes;

  await discord(config, 'INFO', `Gate: ${gate.title}`, `Starting ${agentType} gate`);

  try { spawnAgent(config, progress, agentType, gateId, model, instructions); }
  catch (e) { return { exit: EXIT_ERROR, reason: `Gate spawn failed: ${e.message}` }; }

  const deadline = Date.now() + timeout * 60 * 1000;

  while (Date.now() < deadline) {
    await sleep(config.poll_interval_seconds * 1000);

    gitPullSafe(config); // Default: Destructive Recovery allowed

    if (gate.output_file) {
      if (fs.existsSync(path.join(swarmRoot(config), gate.output_file))) {
        killAgent(config, agentType, gateId);
        log('OK', `Gate '${gateId}' completed`);
        await discord(config, 'OK', `Gate: ${gate.title} PASS`, 'Review completed');
        return { exit: EXIT_OK, status: STATUS.PASS };
      }
    }

    // Check for gate status file (handles FAIL/crash detection)
    const gateStatus = loadGateStatus(config, gateId);
    if (gateStatus?.status === STATUS.FAIL) {
      killAgent(config, agentType, gateId);
      log('ERROR', `Gate '${gateId}' agent reported FAIL: ${gateStatus.reason || 'no details'}`);
      await discord(config, 'CRITICAL', `Gate '${gateId}' FAIL`,
        `Agent reported failure: ${gateStatus.reason || 'unknown'}`);
      return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' failed: ${gateStatus.reason || 'unknown'}` };
    }

    const remaining = Math.round((deadline - Date.now()) / 1000);
    log('INFO', `Gate '${gateId}' pending... ${remaining}s remaining`);
  }

  killAgent(config, agentType, gateId);
  await discord(config, 'CRITICAL', `Gate '${gateId}' TIMEOUT`,
    `${agentType} did not complete within ${timeout}min`);
  return { exit: EXIT_TIMEOUT, reason: `Gate '${gateId}' timed out` };
}

// ─── Chaos Test Trigger ──────────────────────────────────────────────────────
// After certain phases complete, Buster runs a chaos test. Results are written
// to dedicated files (not status.json). The pipeline evaluates severity:
//   critical/moderate → auto-spawn Forge to fix → re-test with Buster
//   low → Discord summary to Davide, continue pipeline
//   none → continue

function getCompletedPhaseId(config, progress, justPassedModuleId) {
  if (!config.chaos_test?.after_phases?.length) return null;

  // Check all configured phases — not just based on which module just passed.
  // A phase is ready for chaos testing when:
  //   1. It's in the after_phases config
  //   2. ALL its modules are PASS
  //   3. The just-passed module belongs to this phase (avoid re-checking unrelated phases)
  //   4. No chaos marker exists yet (not already tested)
  for (const phase of progress.phases) {
    if (!config.chaos_test.after_phases.includes(phase.id)) continue;
    if (!phase.modules.includes(justPassedModuleId)) continue;

    // Skip if already chaos-tested
    const marker = chaosMarkerPath(config, phase.id);
    if (fs.existsSync(marker)) continue;

    const allPass = phase.modules.every(modId => {
      const mod = progress.modules[modId];
      if (!mod) return false;
      const status = loadStatus(config, mod.dir);
      return status?.status === STATUS.PASS;
    });

    if (allPass) return phase;
  }

  return null;
}

function chaosTestDir(config, phaseId) {
  return path.join(swarmRoot(config), 'chaos-tests');
}

function chaosResultsPath(config, phaseId) {
  return path.join(chaosTestDir(config, phaseId), `${phaseId}-results.json`);
}

function chaosPlanPath(config, phaseId) {
  return path.join(chaosTestDir(config, phaseId), `${phaseId}-plan.md`);
}

function chaosMarkerPath(config, phaseId) {
  return path.join(chaosTestDir(config, phaseId), `${phaseId}-done.json`);
}

function loadChaosResults(config, phaseId) {
  const p = chaosResultsPath(config, phaseId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    log('WARN', `Chaos results parse failed: ${e.message}`);
    return null;
  }
}

function getHighestSeverity(results) {
  if (!results?.issues?.length) return 'none';
  const severities = results.issues.map(i => i.severity);
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('moderate')) return 'moderate';
  if (severities.includes('low')) return 'low';
  return 'none';
}

async function runChaosTest(config, progress, phase) {
  const marker = chaosMarkerPath(config, phase.id);

  // Already done?
  if (fs.existsSync(marker)) {
    log('INFO', `Chaos test for ${phase.id} already completed — skipping`);
    return { exit: EXIT_OK };
  }

  // Ensure chaos-tests directory exists
  const chaosDir = chaosTestDir(config, phase.id);
  if (!fs.existsSync(chaosDir)) fs.mkdirSync(chaosDir, { recursive: true });

  log('STEP', `═══════════════════════════════════════════════════`);
  log('STEP', `  CHAOS TEST: ${phase.name} (${phase.id})`);
  log('STEP', `═══════════════════════════════════════════════════`);

  const model = config.chaos_test?.model || 'claude-sonnet-4-6';
  const timeout = config.chaos_test?.time_limit_minutes || 30;
  const maxFixAttempts = config.chaos_test?.max_fix_attempts || 2;
  const lastModule = phase.modules[phase.modules.length - 1];
  const lastModConfig = progress.modules[lastModule];
  const lastStatus = loadStatus(config, lastModConfig.dir);

  const resultsFile = chaosResultsPath(config, phase.id);
  const planFile = chaosPlanPath(config, phase.id);

  // Build chaos prompt — tells Buster where to write results
  const chaosPrompt = [
    `Chaos test for ${phase.name} (modules ${phase.modules.join(', ')}).`,
    `All modules in this phase have passed functional tests. Your job is to break the application.`,
    `Focus on the code built in this phase.`,
    '',
    `You MUST create two files:`,
    `1. Test plan: ${planFile}`,
    `   Write your planned test cases BEFORE executing them.`,
    '',
    `2. Results: ${resultsFile}`,
    `   Write structured JSON results after testing:`,
    '   ```json',
    '   {',
    `     "phase": "${phase.id}",`,
    '     "status": "PASS" | "ISSUES_FOUND",',
    '     "summary": "brief overview",',
    '     "issues": [',
    '       {',
    '         "severity": "critical" | "moderate" | "low",',
    '         "title": "short description",',
    '         "description": "detailed explanation + root cause",',
    '         "reproduction": "exact steps or command to reproduce",',
    '         "affected_module": "06",',
    '         "affected_files": ["backend/websockets/logs.py"]',
    '       }',
    '     ],',
    '     "tests_executed": 24,',
    '     "tests_passed": 21,',
    '     "tests_failed": 3',
    '   }',
    '   ```',
    '',
    'After writing both files: `git add -A && git commit -m "[chaos] ${phase.id} results" && git push origin HEAD`',
    'Do NOT update any status.json. Do NOT send Redis messages.',
  ].join('\n');

  await discord(config, 'INFO', `Chaos Test: ${phase.name}`,
    `Starting chaos testing after ${phase.id} completion`, [
      { name: 'Model', value: model },
      { name: 'Modules', value: phase.modules.join(', ') },
      { name: 'Time Limit', value: `${timeout}min` },
    ]);

  // ── Run chaos test ──
  try {
    spawnAgent(config, progress, 'buster', `chaos-${phase.id}`, model, chaosPrompt, {
      status: lastStatus,
      taskType: 'chaos_test',
    });
  } catch (e) {
    log('WARN', `Chaos test spawn failed: ${e.message}`);
    return { exit: EXIT_ERROR, reason: e.message };
  }

  // Poll for results file (not status.json)
  const deadline = Date.now() + timeout * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(config.poll_interval_seconds * 1000);
    gitPullSafe(config); // Default: Destructive Recovery allowed

    if (fs.existsSync(resultsFile)) {
      log('OK', 'Chaos test results file found');
      break;
    }
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log('INFO', `Waiting for chaos results... ${remaining}s remaining`);
  }

  killAgent(config, 'buster', `chaos-${phase.id}`);

  // ── Evaluate results ──
  const results = loadChaosResults(config, phase.id);

  if (!results) {
    log('WARN', 'Chaos test timed out or produced no results — continuing');
    await discord(config, 'WARN', `Chaos Test: ${phase.name} — No Results`,
      `Chaos test did not produce results within ${timeout}min.`);

    fs.writeFileSync(marker, JSON.stringify({
      phase: phase.id, completed_at: new Date().toISOString(), result: 'TIMEOUT',
    }) + '\n');
    return { exit: EXIT_OK };
  }

  const severity = getHighestSeverity(results);
  log('INFO', `Chaos test severity: ${severity} (${results.issues?.length || 0} issues)`);

  // ── LOW: Discord summary, continue ──
  if (severity === 'none' || severity === 'low') {
    if (severity === 'low') {
      const lowIssues = results.issues.filter(i => i.severity === 'low');
      const issueList = lowIssues.map(i => `• **${i.title}** (${i.affected_module || '?'})`).join('\n');

      await discord(config, 'WARN', `Chaos Test: ${phase.name} — Low-Severity Issues`,
        `${lowIssues.length} low-severity issue(s) found. Pipeline continues.\n\n${issueList}`, [
          { name: 'Tests Run', value: String(results.tests_executed || 0) },
          { name: 'Passed', value: String(results.tests_passed || 0) },
          { name: 'Failed', value: String(results.tests_failed || 0) },
        ]);

      // Store as memory for future reference
      for (const issue of lowIssues) {
        const text = `[Chaos Test ${phase.id}] Low-severity: ${issue.title}. ${issue.description || ''}`;
        try {
          nodeExec(memoryJsPath(config), [
            'remember', '--text', text.slice(0, 500),
            '--tags', `chaos-test,low,${issue.affected_module || phase.id},${config.project}`,
            '--scope', 'project', '--module', issue.affected_module || phase.id,
          ], { timeout: 10000, env: process.env });
        } catch { /* non-critical */ }
      }
    } else {
      await discord(config, 'OK', `Chaos Test Passed: ${phase.name}`,
        `No issues found. ${results.tests_executed || 0} tests executed.`);
    }

    fs.writeFileSync(marker, JSON.stringify({
      phase: phase.id, completed_at: new Date().toISOString(),
      result: severity === 'none' ? 'PASS' : 'LOW_ISSUES', issues_count: results.issues?.length || 0,
    }) + '\n');
    return { exit: EXIT_OK };
  }

  // ── CRITICAL / MODERATE: Auto-fix loop ──
  const blockingIssues = results.issues.filter(i => i.severity === 'critical' || i.severity === 'moderate');

  log('STEP', `${blockingIssues.length} critical/moderate issues — starting auto-fix loop`);
  await discord(config, 'WARN', `Chaos Test: ${phase.name} — Fixing ${blockingIssues.length} Issues`,
    `${severity} issues found. Auto-spawning Forge to fix before continuing.`, [
      { name: 'Critical', value: String(results.issues.filter(i => i.severity === 'critical').length) },
      { name: 'Moderate', value: String(results.issues.filter(i => i.severity === 'moderate').length) },
    ]);

  for (let attempt = 1; attempt <= maxFixAttempts; attempt++) {
    log('STEP', `Fix attempt ${attempt}/${maxFixAttempts}`);

    // ── Spawn Forge to fix issues ──
    const fixPrompt = [
      `## CHAOS TEST FIX — ${phase.name} (Attempt ${attempt}/${maxFixAttempts})`,
      '',
      `Buster found ${blockingIssues.length} critical/moderate issues during chaos testing.`,
      `Fix ALL of the following issues:`,
      '',
      ...blockingIssues.map((issue, i) => [
        `### Issue ${i + 1}: ${issue.title} [${issue.severity.toUpperCase()}]`,
        `**Description:** ${issue.description}`,
        `**Reproduction:** ${issue.reproduction || 'See chaos test plan'}`,
        `**Affected Module:** ${issue.affected_module || 'unknown'}`,
        `**Affected Files:** ${issue.affected_files?.join(', ') || 'unknown'}`,
        '',
      ].join('\n')),
      '',
      `After fixing: update status.json to READY_FOR_TESTING, then git add, commit, push.`,
    ].join('\n');

    // Use the last module's Forge config for the fix
    const forgeModel = lastModConfig.forge_model || 'codex-5.3';

    try {
      spawnAgent(config, progress, 'forge', `chaosfix-${phase.id}-${attempt}`, forgeModel, fixPrompt);
    } catch (e) {
      log('ERROR', `Forge spawn for chaos fix failed: ${e.message}`);
      break;
    }

    // Collect ALL affected module dirs for multi-module fix polling
    const affectedModuleDirs = new Set();
    for (const issue of blockingIssues) {
      const affMod = issue.affected_module && progress.modules[issue.affected_module];
      if (affMod) affectedModuleDirs.add(affMod.dir);
    }
    affectedModuleDirs.add(lastModConfig.dir); // Always include last module as fallback

    // Poll for Forge completion: any affected module reaching READY_FOR_TESTING
    const forgeDeadline = Date.now() + timeout * 60 * 1000;
    let forgeCompleted = false;
    while (Date.now() < forgeDeadline) {
      await sleep(config.poll_interval_seconds * 1000);
      gitPullSafe(config);
      for (const modDir of affectedModuleDirs) {
        const modStatus = loadStatus(config, modDir);
        if (modStatus?.status === STATUS.READY_FOR_TESTING) { forgeCompleted = true; break; }
      }
      if (forgeCompleted) break;
    }

    killAgent(config, 'forge', `chaosfix-${phase.id}-${attempt}`);

    if (!forgeCompleted) {
      log('WARN', `Forge fix attempt ${attempt} timed out or failed`);
      continue;
    }

    // ── Git sync ──
    try {
      gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });
      const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
      if (porcelain) {
        gitExec(config.repo_root, ['commit', '-m', `[pipeline] Chaos fix ${phase.id} attempt ${attempt}`], { stdio: 'ignore' });
        gitPullSafe(config, false); // Block destructive recovery before push
        gitExec(config.repo_root, ['push', 'origin', 'HEAD'], { stdio: 'ignore' });
      }
    } catch (e) {
      log('WARN', `Chaos fix git sync failed: ${e.message?.split('\n')[0]} — Buster may test stale code`);
    }

    // ── Re-run chaos test to verify fix ──
    log('STEP', `Re-running chaos test to verify fix (attempt ${attempt})`);

    // Remove old results so Buster writes fresh ones
    try { fs.unlinkSync(resultsFile); } catch { /* ok */ }

    try {
      spawnAgent(config, progress, 'buster', `chaosverify-${phase.id}-${attempt}`, model, chaosPrompt, {
        status: lastStatus, taskType: 'chaos_test',
      });
    } catch (e) {
      log('ERROR', `Buster re-test spawn failed: ${e.message}`);
      continue;
    }

    // Poll for new results
    const verifyDeadline = Date.now() + timeout * 60 * 1000;
    while (Date.now() < verifyDeadline) {
      await sleep(config.poll_interval_seconds * 1000);
      gitPullSafe(config); // Default: Destructive Recovery allowed
      if (fs.existsSync(resultsFile)) break;
    }

    killAgent(config, 'buster', `chaosverify-${phase.id}-${attempt}`);

    const verifyResults = loadChaosResults(config, phase.id);
    const verifySeverity = getHighestSeverity(verifyResults);

    if (verifySeverity === 'none' || verifySeverity === 'low') {
      log('OK', `Chaos fix verified — all critical/moderate issues resolved (attempt ${attempt})`);
      await discord(config, 'OK', `Chaos Fix Verified: ${phase.name}`,
        `All critical/moderate issues resolved after ${attempt} fix attempt(s).`);

      fs.writeFileSync(marker, JSON.stringify({
        phase: phase.id, completed_at: new Date().toISOString(),
        result: 'FIXED', fix_attempts: attempt, remaining_severity: verifySeverity,
      }) + '\n');
      return { exit: EXIT_OK };
    }

    log('WARN', `Fix attempt ${attempt} did not resolve all issues (severity: ${verifySeverity})`);
  }

  // ── Fix loop exhausted — escalate to Nova ──
  log('ERROR', `Chaos fix loop exhausted (${maxFixAttempts} attempts). Escalating to Nova.`);
  await discord(config, 'CRITICAL', `Chaos Test: ${phase.name} — Needs Nova`,
    `Auto-fix failed after ${maxFixAttempts} attempts. Critical/moderate issues remain.`);

  return {
    exit: EXIT_NEEDS_NOVA,
    reason: `Chaos test found critical/moderate issues that auto-fix could not resolve`,
    phase: phase.id,
    results_file: resultsFile,
    fix_attempts: maxFixAttempts,
    remaining_issues: blockingIssues.length,
  };
}

// ─── Pipeline Runner ─────────────────────────────────────────────────────────

function findNextStep(config, progress) {
  for (const stepId of progress.execution_order) {
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = progress.gates[gateId];
      if (gate?.output_file && fs.existsSync(path.join(swarmRoot(config), gate.output_file))) continue;
      return { type: 'gate', id: gateId };
    } else {
      const mod = progress.modules[stepId];
      if (!mod) continue;
      const status = loadStatus(config, mod.dir);
      if (status?.status === STATUS.PASS) continue;
      if (status?.status === STATUS.BLOCKED) return { type: 'blocked', id: stepId };
      return { type: 'module', id: stepId };
    }
  }
  return { type: 'done' };
}

async function runPipeline(config, progress, opts = {}) {
  log('STEP', `╔═══════════════════════════════════════════════════╗`);
  log('STEP', `║  PIPELINE: ${config.project.toUpperCase().padEnd(38)}║`);
  log('STEP', `╚═══════════════════════════════════════════════════╝`);

  await discord(config, 'INFO', `Pipeline started: ${config.project}`,
    opts.module ? `Single module: ${opts.module}` : 'Full pipeline run');

  // Single module mode
  if (opts.module) {
    const result = await runModule(config, progress, opts.module, { novaPrompt: opts.novaPrompt });
    output(result);
    return result.exit;
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
      output({ exit: EXIT_BLOCKED, module: next.id, reason: 'BLOCKED' });
      return EXIT_BLOCKED;
    }

    const result = next.type === 'gate'
      ? await runGate(config, progress, next.id)
      : await runModule(config, progress, next.id);

    if (result.exit === EXIT_OK) {
      // Check if a phase just completed and needs chaos testing
      if (next.type === 'module') {
        const completedPhase = getCompletedPhaseId(config, progress, next.id);
        if (completedPhase) {
          log('INFO', `Phase ${completedPhase.id} (${completedPhase.name}) complete — running chaos test`);
          const chaosResult = await runChaosTest(config, progress, completedPhase);

          if (chaosResult.exit === EXIT_NEEDS_NOVA) {
            // Auto-fix loop failed — Nova must intervene
            log('ERROR', `Chaos test auto-fix failed for ${completedPhase.id} — escalating to Nova`);
            output(chaosResult);
            return chaosResult.exit;
          }
          // EXIT_OK or EXIT_ERROR (spawn failure) — continue either way
        }
      }
      continue;
    }

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
      log('STEP', `[${stepId}] ${mod.title} | ${status?.status || 'PENDING'} | deps=${deps.met ? 'OK' : deps.reason} | model=${mod.forge_model}`);
    }
  }
}

// ─── Exports (for Nova to import as module) ──────────────────────────────────

export {
  loadConfig, loadProgress, loadStatus, saveStatus,
  releaseBlueprint, listBlueprints,
  spawnAgent, killAgent, steerAgent,
  spawnAcpAgent, killAcpAgent, dispatchRedisTask,
  recallForModule, feedbackMemory, spawnSummaryAgent,
  runModule, runGate, runPipeline, runChaosTest,
  printStatus, gitSyncBeforeBuster, handleRateLimit,
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
OpenClaw Swarm Pipeline — Deterministic Orchestrator

Usage: node pipeline.js [options]

Pipeline commands:
  --project <n>           Project name (or CURRENT_PROJECT env)
  --module <id>           Run a single module
  --resume                Resume pipeline from current state
  --prompt "text"         Nova's prompt override (injected into Forge prompt)
  --prompt-file <path>    Read Nova's prompt from file (for long prompts)
  --status                Print current pipeline status as JSON
  --dry-run               Show execution plan, spawn nothing

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

      const config = loadConfig(flags.project);

      // Blueprint commands
      if (flags.blueprintList) {
        output({ status: 'success', modules: listBlueprints(config) });
        cleanupTempDir();
        process.exit(EXIT_OK);
      }
      if (flags.blueprint) {
        const progress = loadProgress(config);
        const mod = progress.modules[flags.blueprint];
        if (!mod) {
          output({ status: 'error', error: `Module '${flags.blueprint}' not in progress.json` });
          process.exit(EXIT_ERROR);
        }
        const result = releaseBlueprint(config, flags.blueprint, mod.dir);
        output(result);
        cleanupTempDir();
        process.exit(EXIT_OK);
      }

      // Pipeline commands
      const progress = loadProgress(config);

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
