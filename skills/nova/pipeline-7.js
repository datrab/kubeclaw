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
  REVIEWING:          'REVIEWING',
  PASS:               'PASS',
  FAIL:               'FAIL',
  BLOCKED:            'BLOCKED',
  RATE_LIMITED:       'RATE_LIMITED',
};

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
// Track active agent sessions so we can clean up on SIGTERM/SIGINT.
// Supports multiple concurrent agents (e.g. 3 parallel reviewers).

let _shutdownState = {
  config: null,
  statusDir: null,       // Module status dir (for marking FAIL on interrupt)
  activeLabels: new Set(), // ACP session labels to kill on shutdown
  currentLabel: null,    // Label added by setShutdownContext (for clearShutdownContext cleanup)
};

function registerShutdownHooks() {
  const handler = (signal) => {
    log('WARN', `Received ${signal} — initiating graceful shutdown`);
    const { config, statusDir, activeLabels } = _shutdownState;

    // Kill ALL tracked agent sessions (best effort)
    if (config && activeLabels.size > 0) {
      for (const label of activeLabels) {
        try {
          clawExec(['sessions', 'kill', '--label', label], { stdio: 'ignore', timeout: 10000 });
          log('INFO', `Shutdown: killed session '${label}'`);
        } catch { /* best effort */ }
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
 * Track an ACP session label for graceful shutdown.
 * Call after every spawnAcpAgent / spawnReviewerAgent.
 */
function trackAgent(config, label) {
  _shutdownState.config = config;
  _shutdownState.activeLabels.add(label);
}

/**
 * Stop tracking an ACP session label (after kill).
 */
function untrackAgent(label) {
  _shutdownState.activeLabels.delete(label);
}

/**
 * Set module-level shutdown context (for status.json FAIL marking).
 * Also tracks the module's agent label.
 */
function setShutdownContext(config, agentType, moduleId, statusDir) {
  _shutdownState.config = config;
  _shutdownState.statusDir = statusDir;
  // Only track ACP agents — Redis agents can't be killed by label
  const agentConf = config.agents?.[agentType];
  if (!agentConf || agentConf.dispatch !== 'redis') {
    const label = acpLabel(agentType, moduleId);
    _shutdownState.activeLabels.add(label);
    _shutdownState.currentLabel = label;
  } else {
    _shutdownState.currentLabel = null;
  }
}

/**
 * Clear module-level shutdown context after module attempt completes.
 * Removes the current module's agent label from tracking.
 * Safe to call even if killAgent already removed it (Set.delete is idempotent).
 */
function clearShutdownContext() {
  if (_shutdownState.currentLabel) {
    _shutdownState.activeLabels.delete(_shutdownState.currentLabel);
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
function loadConfig(projectName) {
  if (!projectName) {
    throw new Error(
      'Project name required. Use --project <n> or set CURRENT_PROJECT env.'
    );
  }

  // Resolve repo root
  let repoRoot;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Not inside a git repository. Run from within a git repo.');
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
  requireField(config, 'models');
  requireField(config, 'models.buster');
  requireField(config, 'agents');
  requireField(config, 'agents.forge');
  requireField(config, 'agents.buster');

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
  if (!config.poll_interval_seconds) config.poll_interval_seconds = 30;
  if (!config.default_timeout_minutes) config.default_timeout_minutes = 45;
  if (!config.default_max_fails) config.default_max_fails = 3;

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
      if (!gate.on_nogo) {
        errors.push(`progress.gates.${gateId}.on_nogo: required (${validOnNogo.join(' | ')})`);
      } else if (!validOnNogo.includes(gate.on_nogo)) {
        errors.push(`progress.gates.${gateId}.on_nogo: '${gate.on_nogo}' not valid`);
      }
    }

    if (gate.type === 'buster') {
      if (!gate.instructions_file) errors.push(`progress.gates.${gateId}.instructions_file: required`);
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

/** Convert absolute path back to repo-relative (for git commands and payloads) */
function relPath(config, absPath)  { return path.relative(config.repo_root, absPath); }

/** Redis stream key for Buster completion signals */
function completionStreamKey(config) {
  return `swarm:pipeline:${config.project}:completions`;
}

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

async function releaseBlueprint(config, moduleId, moduleDir) {
  const branch = `${config.project}/architecture`;
  const targetPath = relPath(config, modulePath(config, moduleDir));

  log('STEP', `Releasing blueprint for ${moduleId} from ${branch}`);

  // Safety check: don't overwrite an existing non-PENDING status
  const existingStatus = loadStatus(config, moduleDir);
  if (existingStatus && existingStatus.status !== STATUS.PENDING) {
    log('WARN', `Module ${moduleId} already has status ${existingStatus.status} — skipping blueprint release`);
    return { status: 'skipped', reason: `existing status: ${existingStatus.status}`, module: moduleDir };
  }

  try { gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' }); }
  catch { log('WARN', `Could not fetch origin/${branch}, using local cache`); }

  // Verify module has required files in architecture branch
  const requiredFiles = ['FORGE.md', 'BUSTER.md'];
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
    trackAgent(config, label);
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
  untrackAgent(label);
}

// ── Redis Dispatch (Buster) ──
// Writes a structured task to Buster's Redis stream. The processor sidecar
// picks it up, enriches with Qdrant context, and injects into Buster's gateway.
//
// Task type: module_test (standard module testing via isolated subagent session).
// Chaos testing is now a regular buster gate, not a special task type.

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
        runtime: 'subagent',
        timeout_seconds: (mod?.timeout_minutes || config.default_timeout_minutes) * 60,
        label: `buster-test-${moduleId}-${Date.now()}`,
      },
      module_path: mod ? relPath(config, modulePath(config, mod.dir)) : null,
      buster_md_path: mod ? relPath(config, path.join(modulePath(config, mod.dir), 'BUSTER.md')) : null,
      status_json_path: mod ? relPath(config, statusPath(config, mod.dir)) : null,
    };
  }

  if (taskType === 'gate_test') {
    const gate = opts.gate || progress.gates?.[moduleId] || {};
    const gateTimeout = gate.timeout_minutes || config.default_timeout_minutes;
    return {
      ...base,
      instructions: taskPrompt,
      session: {
        runtime: 'subagent',
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
    return dispatchRedisTask(config, progress, agentType, moduleId, taskType, taskPrompt, opts.status, opts);
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
    // killAcpAgent calls untrackAgent internally
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
      // Write message to temp file to avoid E2BIG on large steer messages
      // (retry context with fail_summaries can exceed OS argument limits).
      // Same pattern as spawnAcpAgent uses for task prompts.
      const tmpMsgPath = tmpFile('steer', moduleId, '.md');
      fs.writeFileSync(tmpMsgPath, message);
      const steerArg = `Read the follow-up instructions from: ${tmpMsgPath}\nBegin by reading it with: cat ${tmpMsgPath}`;
      clawExec(['sessions', 'send', '--label', label, '--message', steerArg], { timeout: 15000 });
    } catch (e) {
      log('WARN', `ACP steer failed for '${label}': ${e.message}`);
    }
  }
}

/**
 * Verify an ACP agent is alive shortly after spawn.
 * Waits a few seconds then checks session status. Returns true if running.
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
  try {
    const out = clawExec(['sessions', 'status', '--label', label], { timeout: 10000 });
    // Check for any indication the session is active
    const alive = /running|active|idle|busy/i.test(out);
    if (alive) {
      log('OK', `Agent health check passed: ${label}`);
    } else {
      log('WARN', `Agent health check: session exists but status unclear: ${out.slice(0, 100)}`);
    }
    return alive;
  } catch (e) {
    log('ERROR', `Agent health check failed: ${label} — ${e.message?.split('\n')[0]}`);
    return false;
  }
}

/**
 * Poll until an ACP Forge session ends, with progress logging and crash detection.
 * Replaces the raw while-loop pattern used in gate fix cycles.
 *
 * After session end, checks if Forge actually produced git changes (HEAD diff).
 * This detects silent crashes: OOM, API errors, or other failures where the
 * session dies without producing any commits.
 *
 * @param {object} config - Pipeline config
 * @param {string} sessionLabel - ACP session label to monitor
 * @param {number} timeoutMinutes - Max wait time
 * @param {string} logLabel - For progress messages (e.g. "gatefix-final-test-1")
 * @returns {{ completed: boolean, hasChanges: boolean, reason: string }}
 */
async function pollForSessionEnd(config, sessionLabel, timeoutMinutes, logLabel = 'session-poll') {
  const interval = config.poll_interval_seconds * 1000;
  const deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();

  // Capture HEAD before Forge starts working — used to detect if anything changed
  const headBefore = headHash();

  log('INFO', `[${logLabel}] Waiting for session '${sessionLabel}' to complete | timeout: ${timeoutMinutes}min`);

  while (Date.now() < deadline) {
    await sleep(interval);
    gitPullForPolling(config);

    // Check if ACP session is still active
    let sessionActive = false;
    try {
      const out = clawExec(['sessions', 'status', '--label', sessionLabel], { timeout: 10000 });
      sessionActive = /running|active|busy/i.test(out);
    } catch {
      // Session gone = finished or crashed
      sessionActive = false;
    }

    if (!sessionActive) {
      // Session ended — check if Forge produced any commits
      invalidateHeadHash();
      const headAfter = headHash();
      const hasChanges = headBefore !== headAfter;

      if (hasChanges) {
        log('OK', `[${logLabel}] Session completed with changes (${headBefore} → ${headAfter})`);
      } else {
        log('WARN', `[${logLabel}] Session ended but no git changes detected — Forge may have crashed or produced no output`);
      }

      return { completed: true, hasChanges, reason: 'session_ended' };
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

  const limit = config.memory?.recall_limit || 5;
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
        decay_amount: config.memory?.targeted_decay_amount || 0.1,
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
 * @typedef {Object} PollResult
 * @property {boolean} ok - Whether a target status was reached
 * @property {string} reason - 'target_reached' | 'timeout' | 'blocked' | 'rate_limited' | 'rate_limit_exhausted' | 'parse_corrupted'
 * @property {object|null} status - The status.json content
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
 * @param {string} label - For log messages (e.g. "Gate 'review-01'" or "chaos-phase1")
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
 * Used by chaos tests where the only completion signal is a file appearing on disk.
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
 */
async function pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes) {
  return pollGeneric(config, async () => {
    const status = loadStatus(config, moduleDir);

    if (!status) {
      // null = file doesn't exist (normal) or parse failure (bad)
      const filePath = statusPath(config, moduleDir);
      if (fs.existsSync(filePath)) return { parse_error: true };
      return { done: false };
    }

    if (expectedStatuses.includes(status.status)) {
      return { done: true, result: pollResult(true, 'target_reached', status) };
    }
    if (status.status === STATUS.BLOCKED) {
      return { done: true, result: pollResult(false, 'blocked', status) };
    }
    if (status.status === STATUS.RATE_LIMITED) {
      return { rate_limited: true, status };
    }

    return { done: false, logMsg: `status=${status.status} phase=${status.current_phase}` };
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
  const maxPauses = config.rate_limit?.max_pauses_per_module || 5;

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
async function pollWithRateLimitRecovery(config, moduleDir, expectedStatuses, timeoutMinutes) {
  return withRateLimitRecovery(config, moduleDir,
    () => pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes));
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
  const cooldownHours = config.rate_limit?.cooldown_hours || 2;
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
// Reads the Buster completion stream for a specific module's result.
// Spawns a short-lived Node subprocess (consistent with existing redis.js pattern).
// Returns the latest completion entry for the module, or null.
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

/**
 * Generate the Redis connection boilerplate for inline CJS scripts.
 * Centralizes host/port/password config so Redis connection changes
 * only need to happen in one place (or via environment variables).
 * Used by archiveModuleCompletions and readCompletionFromRedis.
 */
function redisConnectionBlock() {
  return [
    `const Redis = require('ioredis');`,
    `const redis = new Redis({`,
    `  host: process.env.REDIS_HOST || 'redis-master.default.svc.cluster.local',`,
    `  port: parseInt(process.env.REDIS_PORT || '6379'),`,
    `  password: process.env.REDIS_PASSWORD,`,
    `  connectTimeout: 5000,`,
    `});`,
  ].join('\n');
}

/**
 * Archive old completion entries for a module before dispatching a new Buster attempt.
 * Moves entries from the active completion stream to the archive stream, then deletes
 * them from active. This prevents pollDual from reading stale FAIL/PASS entries
 * from a previous attempt.
 *
 * Called once before each Buster dispatch (not on every poll cycle).
 */
function archiveModuleCompletions(config, moduleId) {
  const stream = completionStreamKey(config);
  const archiveStream = `${stream}:log`;

  const script = [
    redisConnectionBlock(),
    `(async () => {`,
    `  try {`,
    `    const entries = await redis.xrange(${JSON.stringify(stream)}, '-', '+', 'COUNT', 200);`,
    `    let archived = 0;`,
    `    for (const [id, fields] of entries) {`,
    `      const data = {};`,
    `      for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];`,
    `      if (data.module !== ${JSON.stringify(moduleId)}) continue;`,
    `      // Copy to archive stream`,
    `      const archiveFields = [...fields, 'archived_at', Date.now().toString()];`,
    `      await redis.xadd(${JSON.stringify(archiveStream)}, '*', ...archiveFields);`,
    `      // Delete from active stream`,
    `      await redis.xdel(${JSON.stringify(stream)}, id);`,
    `      archived++;`,
    `    }`,
    `    // Trim archive to prevent unbounded growth`,
    `    await redis.xtrim(${JSON.stringify(archiveStream)}, 'MAXLEN', '~', ${COMPLETION_ARCHIVE_MAX_LEN});`,
    `    console.log(JSON.stringify({ archived }));`,
    `  } catch (e) { console.log(JSON.stringify({ archived: 0, error: e.message })); }`,
    `  finally { await redis.quit(); }`,
    `})();`,
  ].join('\n');

  const tmpPath = tmpFile('redis-archive', moduleId, '.cjs');
  fs.writeFileSync(tmpPath, script);

  try {
    const result = nodeExec(tmpPath, [], { timeout: 5000, env: process.env });
    const parsed = JSON.parse(result);
    if (parsed.archived > 0) {
      log('INFO', `Archived ${parsed.archived} old completion(s) for ${moduleId} → ${archiveStream}`);
    }
    return parsed;
  } catch (e) {
    log('DEBUG', `Completion archive failed (non-critical): ${e.message}`);
    return { archived: 0 };
  }
}

function readCompletionFromRedis(config, moduleId) {
  const stream = completionStreamKey(config);

  const script = [
    redisConnectionBlock(),
    `(async () => {`,
    `  try {`,
    `    const entries = await redis.xrange(${JSON.stringify(stream)}, '-', '+', 'COUNT', 100);`,
    `    const match = entries`,
    `      .map(([id, fields]) => {`,
    `        const o = { _id: id };`,
    `        for (let i = 0; i < fields.length; i += 2) o[fields[i]] = fields[i + 1];`,
    `        return o;`,
    `      })`,
    `      .filter(e => e.type === 'completion' && e.module === ${JSON.stringify(moduleId)})`,
    `      .pop();`,
    `    console.log(JSON.stringify(match || null));`,
    `  } catch { console.log('null'); }`,
    `  finally { await redis.quit(); }`,
    `})();`,
  ].join('\n');

  const tmpPath = tmpFile('redis-poll', moduleId, '.cjs');
  fs.writeFileSync(tmpPath, script);

  try {
    const result = nodeExec(tmpPath, [], { timeout: 5000, env: process.env });
    return JSON.parse(result);
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
      const redisEntry = readCompletionFromRedis(config, moduleId);
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

  for (const dep of mod.depends_on) {
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

async function handleFail(config, status, moduleDir, moduleId, maxFails, phase, reason, opts = {}) {
  const isTimeout = opts.isTimeout || false;
  const recalledMemoryIds = opts.recalledMemoryIds || [];

  if (reason) {
    status.fail_summaries.push({
      attempt: status.fail_count + 1,
      timestamp: new Date().toISOString(),
      summary: reason,
      phase,
      is_timeout: isTimeout,
      files_changed: status.forge_diff_stat || null,
    });
    status.fail_count++;
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

  status.status = STATUS.FAIL;
  status.current_phase = null;
  addHistory(status, STATUS.FAIL, 'pipeline',
    `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`);
  saveStatus(config, moduleDir, status);

  if (status.fail_count >= maxFails) {
    status.status = STATUS.BLOCKED;
    addHistory(status, STATUS.BLOCKED, 'pipeline', `Max retries (${maxFails}) exceeded`);
    saveStatus(config, moduleDir, status);
    log('ERROR', `Module ${moduleId} BLOCKED — failed ${maxFails}x in ${phase} phase`);
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

  // ── Assemble final prompt ──
  // Order optimized for LLM attention patterns ("lost in the middle" effect):
  //   - Priority header + Nova at the start (primacy bias → highest-priority items)
  //   - FORGE.md as baseline in the middle (bulk content, read as the "plan")
  //   - Anti-patterns near the end (recency bias → constraints stick better)
  //   - Memory last (lowest priority, recency compensated by priority header caveat)
  // Note: Priority NUMBERING in the header is unchanged — it describes authority
  // hierarchy (Nova > Anti-Patterns > FORGE.md > Memory), not document order.
  const prompt = priorityHeader + novaBlock + baseInstructions + antiPatternBlock + memoryBlock;
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
  const timeout = mod.timeout_minutes || config.default_timeout_minutes;
  const maxFails = mod.max_fails || config.default_max_fails;
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
    await releaseBlueprint(config, moduleId, dir);
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
    log('STEP', `Phase: FORGE (subagent: ${mod.forge_subagent}, model: ${mod.forge_model})`);

    // Build complete prompt with priority hierarchy and anti-pattern framing
    const promptResult = await buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt);
    if (promptResult.error) {
      log('ERROR', `Forge prompt assembly failed: ${promptResult.error}`);
      return { retry: false, result: { exit: EXIT_ERROR, reason: promptResult.error } };
    }
    const forgePrompt = promptResult.prompt;
    recalledMemoryIds = promptResult.recalledMemoryIds || [];

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
    catch (e) {
      log('ERROR', `Forge agent spawn failed: ${e.message}`);
      clearShutdownContext();
      return { retry: false, result: { exit: EXIT_ERROR, reason: `Forge spawn failed: ${e.message}` } };
    }

    // Early health check — catch silent spawn failures (OOM, bad model, gateway down)
    // in ~8 seconds instead of waiting the full timeout (up to 60 minutes).
    if (!(await verifyAgentAlive(config, 'forge', moduleId))) {
      killAgent(config, 'forge', moduleId);
      clearShutdownContext();
      const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
        'Forge agent failed health check — session not running after spawn', { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    // Poll (rate limit pauses handled transparently by wrapper)
    const result = await pollWithRateLimitRecovery(config, dir,
      [STATUS.READY_FOR_TESTING, STATUS.FAIL, STATUS.BLOCKED], timeout);

    // ALWAYS destroy session — kill-and-respawn strategy
    killAgent(config, 'forge', moduleId);
    clearShutdownContext();

    if (!result.ok) {
      status = loadStatus(config, dir) || status;

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
        status.fail_summaries.length > 0 ? null : 'Forge reported FAIL without details', { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    status = loadStatus(config, dir) || status;

    if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
      const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'forge',
        status.fail_summaries.length > 0 ? null : 'Forge reported FAIL without details', { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }

    log('OK', 'Forge complete → READY_FOR_TESTING');
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
    log('STEP', `Phase: BUSTER (model: ${config.models.buster})`);

    let busterPrompt;
    try { busterPrompt = readBusterInstructions(config, dir); }
    catch (e) {
      log('ERROR', `BUSTER.md read failed for ${moduleId}: ${e.message}`);
      return { retry: false, result: { exit: EXIT_ERROR, reason: e.message } };
    }

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

    // Archive old completion entries for this module before dispatching.
    // Prevents pollDual from reading stale FAIL/PASS from a previous attempt.
    archiveModuleCompletions(config, moduleId);

    try { spawnAgent(config, progress, 'buster', moduleId, config.models.buster, busterPrompt, { status, taskType: 'module_test' }); }
    catch (e) {
      log('ERROR', `Buster agent spawn failed: ${e.message}`);
      clearShutdownContext();
      return { retry: false, result: { exit: EXIT_ERROR, reason: `Buster spawn failed: ${e.message}` } };
    }

    const result = await pollDualWithRateLimitRecovery(config, dir, moduleId,
      [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED], timeout);

    // Kill agent session (safety net — Processor should have killed already after completion)
    killAgent(config, 'buster', moduleId);
    clearShutdownContext();

    if (!result.ok) {
      status = loadStatus(config, dir) || status;

      if (result.reason === 'timeout') {
        const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'buster',
          `TIMEOUT: Buster did not complete within ${timeout} minutes`, { isTimeout: true, recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }
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
      if (result.reason === 'parse_corrupted') {
        const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'buster',
          'status.json is permanently corrupted (unparseable after multiple attempts)', { recalledMemoryIds });
        if (failResult._retry) return { retry: true, fail_count: status.fail_count };
        return { retry: false, result: failResult };
      }
    }

    status = loadStatus(config, dir) || status;

    if (status.status === STATUS.PASS) {
      status.completed_at = new Date().toISOString();
      status.current_phase = null;
      // Reset decay tracking — positive feedback from feedbackMemory('pass')
      // will boost confidence, making the decay history irrelevant.
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

      // Memory: update confidence on related memories
      await feedbackMemory(config, moduleId, 'pass');
      // Note: Technical insights are now stored by the Buster subagent
      // directly via memory skill before signaling completion.
      // spawnSummaryAgent is no longer needed.

      return { retry: false, result: { exit: EXIT_OK, status: STATUS.PASS } };
    }

    if (status.status === STATUS.FAIL) {
      const failResult = await handleFail(config, status, dir, moduleId, maxFails, 'buster',
        status.fail_summaries.length > 0 ? null : 'Buster reported FAIL without details', { recalledMemoryIds });
      if (failResult._retry) return { retry: true, fail_count: status.fail_count };
      return { retry: false, result: failResult };
    }
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
async function _runBusterGateOnce(config, progress, gateId, gate, model, timeout, instructions) {
  // Inject commit hash so Buster tests a specific, traceable commit.
  // Without this, Buster tests "whatever is on disk" which can drift
  // between fix cycles when Forge pushes new code.
  const commitHash = headHash() || gitExec(config.repo_root, ['rev-parse', '--short', 'HEAD']);
  const enrichedInstructions = `## Test Target\n\n`
    + `**Commit:** \`${commitHash}\`\n`
    + `**Gate:** ${gateId} — ${gate.title}\n`
    + `**Branch:** \`git pull origin HEAD\` before testing to ensure you have the latest.\n\n---\n\n`
    + instructions;

  try {
    spawnAgent(config, progress, 'buster', gateId, model, enrichedInstructions, {
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

  killAgent(config, 'buster', gateId);
  return result;
}

/**
 * Extract actionable issues from a Buster gate result for Forge to fix.
 * Handles both standard test results and chaos test results.
 */
function extractGateIssues(gateResult) {
  if (!gateResult) return [];
  const data = gateResult.status || gateResult;

  // Chaos-style: { issues: [{ severity, title, description, affected_files }] }
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
function buildGateFixPrompt(gate, issues, attempt, maxAttempts) {
  const issueBlocks = issues.map((issue, i) => [
    `### Issue ${i + 1}: ${issue.title}${issue.severity ? ` [${issue.severity.toUpperCase()}]` : ''}`,
    issue.description ? `**Description:** ${issue.description}` : '',
    issue.reproduction ? `**Reproduction:** ${issue.reproduction}` : '',
    issue.affected_files?.length ? `**Affected Files:** ${issue.affected_files.join(', ')}` : '',
    '',
  ].filter(Boolean).join('\n'));

  return [
    `## Gate Fix: ${gate.title} (Attempt ${attempt}/${maxAttempts})`,
    '',
    `Buster found ${issues.length} issue(s) during testing. Fix ALL of the following:`,
    '',
    ...issueBlocks,
    '',
    'After fixing: git add -A && git commit && git push origin HEAD',
    'Then set status to READY_FOR_TESTING if applicable.',
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

  let instructions;
  try { instructions = readGateInstructions(config, gate); }
  catch (e) {
    log('ERROR', `Gate '${gateId}' instructions read failed: ${e.message}`);
    return { exit: EXIT_ERROR, reason: e.message };
  }

  const model = gate.model || config.models.buster;
  const timeout = gate.timeout_minutes || config.default_timeout_minutes;
  const maxFixCycles = gate.max_fix_cycles || config.default_max_fails;
  const hasFixLoop = gate.on_fail === 'fix_and_retest';

  await discord(config, 'INFO', `Gate: ${gate.title}`, `Starting buster gate${hasFixLoop ? ` (fix loop: max ${maxFixCycles})` : ''}`);

  // Rate limit tracking — gate-level, separate from module-level handleRateLimit
  // which requires moduleDir/statusDir context that gates don't have.
  let rateLimitPauses = 0;
  const maxRateLimitPauses = config.rate_limit?.max_pauses_per_module || 5;

  // ── Main loop: run gate, optionally fix and retry ──
  for (let attempt = 1; attempt <= (hasFixLoop ? maxFixCycles + 1 : 1); attempt++) {

    if (attempt > 1) {
      log('STEP', `Gate '${gateId}' retry attempt ${attempt - 1}/${maxFixCycles}`);
    }

    const result = await _runBusterGateOnce(config, progress, gateId, gate, model, timeout, instructions);

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
      const cooldownHours = config.rate_limit?.cooldown_hours || 2;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const resumeAt = new Date(Date.now() + cooldownMs);
      log('WARN', `Gate '${gateId}' rate limited (pause ${rateLimitPauses}/${maxRateLimitPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`);
      await discord(config, 'WARN', `Gate '${gateId}' Rate Limited`,
        `Pause ${rateLimitPauses}/${maxRateLimitPauses}. Sleeping ${cooldownHours}h. Resume at ${resumeAt.toLocaleTimeString()}.`);
      await sleep(cooldownMs);
      log('OK', `Gate '${gateId}' rate limit cooldown complete — retrying`);
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

    const fixPrompt = buildGateFixPrompt(gate, issues, attempt, maxFixCycles);
    const forgeModel = gate.forge_model || config.models?.forge || 'codex-5.3';
    const fixLabel = `gatefix-${gateId}-${attempt}`;
    const fixAcpLabel = acpLabel('forge', fixLabel);  // Actual ACP session label

    try {
      spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt);
    } catch (e) {
      log('ERROR', `Forge spawn for gate fix failed: ${e.message}`);
      continue; // Try next attempt anyway
    }

    // Verify Forge is alive
    if (!(await verifyAgentAlive(config, 'forge', fixLabel))) {
      log('WARN', `Forge health check failed for gate fix — skipping to next attempt`);
      killAgent(config, 'forge', fixLabel);
      continue;
    }

    // Poll for Forge session completion (with crash detection)
    const forgeTimeout = gate.timeout_minutes || config.default_timeout_minutes;
    const sessionResult = await pollForSessionEnd(config, fixAcpLabel, forgeTimeout, fixLabel);

    // Safety net — kill Forge session if still running
    killAgent(config, 'forge', fixLabel);

    if (!sessionResult.hasChanges) {
      log('WARN', `Gate fix '${fixLabel}' produced no changes — Forge may have crashed. Skipping retest.`);
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
// Review gates spawn N reviewer agents in parallel, each writing their own
// JSON review file. After all reviews are in, a merge script consolidates
// them into a single output (GO / NO-GO). Fix loops are handled in Phase 5.
//
// Flow: resolve config → spawn reviewers → poll all files → kill all →
//       run merge script → parse merged result → return GO/NO-GO

/**
 * Resolve review configuration by merging gate-level overrides with platform defaults.
 * null values in the gate inherit from swarm.config.review_defaults.
 */
function resolveReviewConfig(config, gate) {
  const defaults = config.review_defaults || {};
  return {
    reviewers: gate.reviewers || defaults.reviewers || [],
    mergeScript: gate.merge_script || defaults.merge_script || 'echo-reviews/merge-reviews.js',
    timeout: gate.timeout_minutes || defaults.timeout_minutes || config.default_timeout_minutes,
    maxFixCycles: gate.max_fix_cycles || defaults.max_fix_cycles || config.default_max_fails,
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
 * Poll until ALL files in the list exist. Built on pollGeneric.
 * Returns as soon as every file is present, or on timeout.
 */
async function pollForAllFiles(config, filePaths, timeoutMinutes, label = 'multi-file-poll') {
  return pollGeneric(config, async () => {
    const missing = filePaths.filter(p => !fs.existsSync(p));
    if (missing.length === 0) {
      return { done: true, result: pollResult(true, 'target_reached', { files: filePaths }) };
    }
    return { done: false, logMsg: `${filePaths.length - missing.length}/${filePaths.length} files ready` };
  }, timeoutMinutes, label);
}

/**
 * Spawn a single ACP reviewer agent with explicit agent_id and model.
 * Unlike spawnAcpAgent (which looks up config.agents[type]), this takes
 * reviewer-specific settings directly — each reviewer can use a different
 * agent/model combination.
 */
function spawnReviewerAgent(config, gateId, reviewer, instructions) {
  const label = `echo-${reviewer.label}-${gateId}`;
  const agentId = reviewer.agent_id || 'claude';
  const model = reviewer.model || 'claude-sonnet-4-6';
  const cwd = config.agents.echo?.cwd || config.repo_root;

  log('STEP', `Spawning reviewer: ${label} (agent: ${agentId}, model: ${model})`);

  const tmpPromptPath = tmpFile('review-prompt', reviewer.label, '.md');
  fs.writeFileSync(tmpPromptPath, instructions);

  const taskArg = [
    `Your full review instructions are in the file: ${tmpPromptPath}`,
    `Read this file FIRST before doing anything else.`,
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

    log('OK', `Reviewer spawned: ${label}`);
    trackAgent(config, label);
    return { label, result };
  } catch (e) {
    throw new Error(`Failed to spawn reviewer '${label}': ${e.message}`);
  }
}

/**
 * Kill a reviewer agent by label.
 */
function killReviewerAgent(config, gateId, reviewer) {
  const label = `echo-${reviewer.label}-${gateId}`;
  try {
    clawExec(['sessions', 'kill', '--label', label], { stdio: 'ignore', timeout: 15000 });
    log('OK', `Reviewer killed: ${label}`);
  } catch {
    log('WARN', `Could not kill reviewer '${label}' — may have already exited`);
  }
  untrackAgent(label);
}

/**
 * Run one complete review cycle: spawn all reviewers, poll, kill, merge, parse.
 * Returns { ok: boolean, mergedResult: object|null, mergedFilePath: string }
 *
 * @private — called by runReviewGate, not directly
 */
async function _runReviewOnce(config, progress, gateId, gate, reviewConfig) {
  const { reviewers, mergeScript, timeout } = reviewConfig;

  // Build expected output file paths
  const expectedFiles = reviewers.map(r => reviewOutputPath(config, gate, r.label));

  log('STEP', `Review cycle: ${reviewers.length} reviewers, expecting files:`);
  for (const f of expectedFiles) {
    log('INFO', `  ${path.basename(f)}`);
  }

  // Read base instructions
  let instructions;
  try { instructions = readGateInstructions(config, gate); }
  catch (e) { return { ok: false, error: e.message }; }

  // Spawn all reviewers in parallel
  const spawnErrors = [];
  for (const reviewer of reviewers) {
    const outputPath = reviewOutputPath(config, gate, reviewer.label);
    const relOutput = relPath(config, outputPath);

    // Inject output path into instructions so each reviewer knows where to write
    const reviewerInstructions = [
      instructions,
      '',
      '---',
      '',
      `## YOUR OUTPUT FILE`,
      '',
      `You are reviewer: **${reviewer.label}** (model: ${reviewer.model})`,
      `Write your review JSON to: \`${relOutput}\``,
      `Use: git add ${relOutput} && git commit -m "[review] ${reviewer.label} ${gate.review_name}" && git push origin HEAD`,
    ].join('\n');

    try {
      spawnReviewerAgent(config, gateId, reviewer, reviewerInstructions);
    } catch (e) {
      spawnErrors.push({ reviewer: reviewer.label, error: e.message });
      log('ERROR', `Reviewer spawn failed: ${reviewer.label} — ${e.message}`);
    }
  }

  // If ALL spawns failed, abort
  if (spawnErrors.length === reviewers.length) {
    return { ok: false, error: `All ${reviewers.length} reviewer spawns failed`, spawnErrors };
  }

  if (spawnErrors.length > 0) {
    log('WARN', `${spawnErrors.length}/${reviewers.length} reviewer spawn(s) failed — continuing with remaining`);
  }

  // Poll until all expected files exist
  const pollRes = await pollForAllFiles(config, expectedFiles, timeout, `Review '${gateId}'`);

  // Kill all reviewer agents (whether poll succeeded or timed out)
  for (const reviewer of reviewers) {
    killReviewerAgent(config, gateId, reviewer);
  }

  if (!pollRes.ok) {
    const missing = expectedFiles.filter(p => !fs.existsSync(p));
    log('WARN', `Review poll ended: ${pollRes.reason}. Missing ${missing.length} file(s).`);
    // If some files arrived but not all, we can still try to merge what we have
    if (missing.length === expectedFiles.length) {
      return { ok: false, error: `No review files received (${pollRes.reason})` };
    }
    log('INFO', `${expectedFiles.length - missing.length} of ${expectedFiles.length} reviews received — proceeding with merge`);
  }

  // Run merge script
  const mergeScriptPath = path.join(swarmRoot(config), mergeScript);
  const reviewOutputDir = path.join(swarmRoot(config), gate.review_output_dir || 'echo-reviews');

  if (!fs.existsSync(mergeScriptPath)) {
    log('WARN', `Merge script not found: ${mergeScriptPath} — skipping merge`);
    // Without merge, try to determine GO/NO-GO from individual reviews
    return _parseIndividualReviews(expectedFiles, gate);
  }

  log('STEP', `Running merge script: ${mergeScript}`);
  try {
    nodeExec(mergeScriptPath, [reviewOutputDir, gate.review_name], {
      timeout: 30000,
      env: process.env,
      cwd: config.repo_root,
    });
    log('OK', 'Merge script completed');
  } catch (e) {
    log('ERROR', `Merge script failed: ${e.message}`);
    return _parseIndividualReviews(expectedFiles, gate);
  }

  // Commit merged output
  await gitCommitAndPush(config,
    `[pipeline] Review merged: ${gate.review_name}`,
    { softFail: true }
  );

  // Parse merged result
  const mergedFilePath = path.join(swarmRoot(config), gate.output_file);
  if (!fs.existsSync(mergedFilePath)) {
    log('WARN', `Merged output file not found: ${mergedFilePath}`);
    return _parseIndividualReviews(expectedFiles, gate);
  }

  try {
    const mergedContent = fs.readFileSync(mergedFilePath, 'utf8');
    // Try JSON parse (structured reviews)
    try {
      const mergedResult = JSON.parse(mergedContent);
      const status = (mergedResult.status || '').toUpperCase();
      const isGo = status === 'GO' || status === 'PASS';
      log('INFO', `Merged review status: ${mergedResult.status} — ${isGo ? 'GO' : 'NO-GO'}`);
      return { ok: isGo, mergedResult, mergedFilePath };
    } catch {
      // Markdown output — check for NO-GO/FAIL patterns
      const isNoGo = /\bNO-GO\b|\bFAIL\b|\bcritical_blockers\b/i.test(mergedContent);
      log('INFO', `Merged review (markdown): ${isNoGo ? 'NO-GO detected' : 'GO (no blockers found)'}`);
      return { ok: !isNoGo, mergedResult: { raw: mergedContent }, mergedFilePath };
    }
  } catch (e) {
    log('ERROR', `Failed to read merged output: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

/**
 * Fallback: parse individual review files when merge script is unavailable or failed.
 * Returns NO-GO if any individual review has critical issues.
 * @private
 */
function _parseIndividualReviews(expectedFiles, gate) {
  const reviews = [];
  let hasNoGo = false;

  for (const filePath of expectedFiles) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      reviews.push(data);
      const status = (data.status || '').toUpperCase();
      if (status === 'NO-GO' || status === 'FAIL') hasNoGo = true;
      if (data.critical_issues?.length > 0 || data.critical_blockers?.length > 0) hasNoGo = true;
    } catch {
      log('WARN', `Could not parse review file: ${path.basename(filePath)}`);
    }
  }

  log('INFO', `Parsed ${reviews.length} individual reviews: ${hasNoGo ? 'NO-GO' : 'GO'}`);
  return {
    ok: !hasNoGo,
    mergedResult: { individual_reviews: reviews, merge_failed: true },
    mergedFilePath: null,
  };
}

/**
 * Extract actionable issues from a merged review result for Forge to fix.
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

  // Fallback: check individual reviews if merge contained them
  if (issues.length === 0 && Array.isArray(mergedResult.individual_reviews)) {
    for (const review of mergedResult.individual_reviews) {
      for (const key of ['critical_issues', 'critical_blockers']) {
        if (Array.isArray(review[key])) {
          for (const item of review[key]) {
            issues.push({
              module: item.module || item.component || null,
              location: item.location || null,
              description: item.description || item.title || 'Unknown issue',
              recommended_fix: item.recommended_fix || item.fix || null,
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Build a Forge prompt to fix issues found by Echo review.
 */
function buildReviewFixPrompt(gate, issues, attempt, maxAttempts) {
  const issueBlocks = issues.map((issue, i) => {
    const parts = [`### Issue ${i + 1}: ${issue.description}`];
    if (issue.module) parts.push(`**Module:** ${issue.module}`);
    if (issue.location) parts.push(`**Location:** ${issue.location}`);
    if (issue.recommended_fix) parts.push(`**Recommended Fix:** ${issue.recommended_fix}`);
    parts.push('');
    return parts.join('\n');
  });

  return [
    `## Review Fix: ${gate.title} (Attempt ${attempt}/${maxAttempts})`,
    '',
    `Echo review found ${issues.length} critical issue(s). Fix ALL of the following:`,
    '',
    ...issueBlocks,
    '',
    'After fixing: git add -A && git commit -m "[review-fix] ' + gate.review_name + '" && git push origin HEAD',
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
 * Core flow: spawn N reviewers in parallel -> poll -> merge -> GO/NO-GO.
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
  log('STEP', `  Reviewers: ${reviewers.map(r => r.label).join(', ')}`);
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
    `Starting ${reviewers.length} parallel reviewers`, [
      { name: 'Reviewers', value: reviewers.map(r => r.label).join(', ') },
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
    await discord(config, 'OK', `Review: ${gate.title} GO`, 'All reviewers approved');
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

    for (let cycle = 1; cycle <= maxFixCycles; cycle++) {
      log('STEP', `Review fix cycle ${cycle}/${maxFixCycles} (fix_and_continue)`);

      if (issues.length === 0) {
        log('WARN', 'NO-GO but no extractable issues \u2014 escalating');
        break;
      }

      const fixPrompt = buildReviewFixPrompt(gate, issues, cycle, maxFixCycles);
      const forgeModel = gate.forge_model || config.models?.forge || 'codex-5.3';
      const fixLabel = `reviewfix-${gateId}-${cycle}`;
      const fixAcpLabel = acpLabel('forge', fixLabel);

      try { spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt); }
      catch (e) {
        log('ERROR', `Forge spawn failed for review fix: ${e.message}`);
        continue;
      }

      if (!(await verifyAgentAlive(config, 'forge', fixLabel))) {
        killAgent(config, 'forge', fixLabel);
        continue;
      }

      // Poll for Forge session completion (with crash detection)
      const sessionResult = await pollForSessionEnd(
        config, fixAcpLabel, reviewConfig.timeout || config.default_timeout_minutes, fixLabel);

      killAgent(config, 'forge', fixLabel);

      if (!sessionResult.hasChanges) {
        log('WARN', `Review fix '${fixLabel}' produced no changes — Forge may have crashed`);
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

    for (let cycle = 1; cycle <= maxFixCycles; cycle++) {
      log('STEP', `Review fix cycle ${cycle}/${maxFixCycles} (fix_and_rereview)`);

      // \u2500\u2500 Forge fix \u2500\u2500
      const currentIssues = extractReviewIssues(reviewResult.mergedResult);
      if (currentIssues.length === 0) {
        log('WARN', 'NO-GO but no extractable issues \u2014 escalating');
        break;
      }

      const fixPrompt = buildReviewFixPrompt(gate, currentIssues, cycle, maxFixCycles);
      const forgeModel = gate.forge_model || config.models?.forge || 'codex-5.3';
      const fixLabel = `reviewfix-${gateId}-${cycle}`;
      const fixAcpLabel = acpLabel('forge', fixLabel);

      try { spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt); }
      catch (e) {
        log('ERROR', `Forge spawn failed for review fix: ${e.message}`);
        continue;
      }

      if (!(await verifyAgentAlive(config, 'forge', fixLabel))) {
        killAgent(config, 'forge', fixLabel);
        continue;
      }

      // Poll for Forge session completion (with crash detection)
      const sessionResult = await pollForSessionEnd(
        config, fixAcpLabel, reviewConfig.timeout || config.default_timeout_minutes, fixLabel);

      killAgent(config, 'forge', fixLabel);

      if (!sessionResult.hasChanges) {
        log('WARN', `Review fix '${fixLabel}' produced no changes — Forge may have crashed`);
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
 * type:"review"  -> runReviewGate (parallel reviewers, merge, fix loops)
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
      log('STEP', `[${stepId}] ${mod.title} | ${status?.status || 'PENDING'} | deps=${deps.met ? 'OK' : deps.reason} | model=${mod.forge_model}`);
    }
  }
}

// ─── Exports (for Nova to import as module) ──────────────────────────────────

export {
  loadConfig, loadProgress, loadStatus, saveStatus,
  releaseBlueprint, listBlueprints,
  spawnAgent, killAgent, steerAgent, verifyAgentAlive,
  spawnAcpAgent, killAcpAgent, dispatchRedisTask,
  recallForModule, feedbackMemory, decayRecalledMemories,
  buildForgePrompt, executeModuleAttempt,
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

      const { config, progress } = loadConfig(flags.project);

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
        const result = await releaseBlueprint(config, flags.blueprint, mod.dir);
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