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

function loadConfig(projectName, configOverridePath = null) {
  // Project name is required BEFORE config loading — the config path depends on it.
  // pipeline.js is a generic skill (/app/skills/), config is project-specific.
  if (!projectName) {
    throw new Error(
      'Project name required. Use --project <name> or set CURRENT_PROJECT env.\n' +
      '  Config lives at: <repo>/projects/<project>/.swarm/pipeline.config.json'
    );
  }

  // Resolve repo root FIRST — config lives inside the repo, not next to the script.
  let repoRoot;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Not inside a git repository. Run from within a git repo.');
  }

  // Config resolution order:
  //   1. --config <path>                                           (explicit override)
  //   2. <repo_root>/projects/<project>/.swarm/pipeline.config.json (standard location)
  const configPath = configOverridePath
    || path.join(repoRoot, 'projects', projectName, '.swarm', 'pipeline.config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config not found: ${configPath}\n` +
      `  Expected at: <repo>/projects/${projectName}/.swarm/pipeline.config.json\n` +
      `  Or specify explicitly: --config /path/to/pipeline.config.json`
    );
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.project = projectName;

  // Use auto-detected repo root, allow config override
  if (!config.repo_root) {
    config.repo_root = repoRoot;
  }

  // Set module-level _repoRoot so headHash() can use gitExec
  // even in contexts where config isn't passed (e.g. addHistory → headHash).
  _repoRoot = config.repo_root;

  // ── Path resolution ──
  // All swarm data lives under a single swarm_dir. Defaults:
  //   swarm_dir:     projects/<project>/.swarm       (relative to repo_root)
  //   progress_file: progress.json                   (relative to swarm_dir)
  //   modules_dir:   modules                         (relative to swarm_dir)
  //
  // Config can override any of these. ${project} is resolved in all path values.

  if (!config.paths) config.paths = {};

  // Resolve ${project} template in all path values
  for (const [key, val] of Object.entries(config.paths)) {
    if (typeof val === 'string') {
      config.paths[key] = val.replace(/\$\{project\}/g, config.project);
    }
  }

  // Set defaults AFTER template resolution (so user overrides take precedence)
  if (!config.paths.swarm_dir)      config.paths.swarm_dir = `projects/${config.project}/.swarm`;
  if (!config.paths.progress_file)  config.paths.progress_file = 'progress.json';
  if (!config.paths.modules_dir)    config.paths.modules_dir = 'modules';

  // Resolve swarm_dir to absolute (relative to repo_root)
  if (!path.isAbsolute(config.paths.swarm_dir)) {
    config.paths.swarm_dir = path.join(config.repo_root, config.paths.swarm_dir);
  }

  // Resolve progress_file and modules_dir relative to swarm_dir
  if (!path.isAbsolute(config.paths.progress_file)) {
    config.paths.progress_file = path.join(config.paths.swarm_dir, config.paths.progress_file);
  }
  if (!path.isAbsolute(config.paths.modules_dir)) {
    config.paths.modules_dir = path.join(config.paths.swarm_dir, config.paths.modules_dir);
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
  requireField(config, 'paths.swarm_dir');
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
 *     Before git push (Forge→Buster handoff, blueprint release, chaos fix).
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
function gitPushWithRetry(config, maxRetries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      gitExec(config.repo_root, ['push', 'origin', 'HEAD'], { stdio: 'ignore', timeout: 60000 });
      return;
    } catch (e) {
      if (attempt === maxRetries) throw e;
      log('WARN', `git push failed (attempt ${attempt}/${maxRetries}): ${e.message?.split('\n')[0]}`);
      execFileSync('sleep', [String(delayMs / 1000)]);
    }
  }
}

/**
 * Unified git add → commit → pull-before-push → push with retry.
 * Replaces scattered git-sync logic across gitSyncBeforeBuster, releaseBlueprint,
 * and chaos-fix. Ensures consistent behavior: invalidateHeadHash always called,
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
function gitCommitAndPush(config, message, { addPaths = ['-A'], captureHash = false, softFail = false } = {}) {
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
    gitPushWithRetry(config);

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

function releaseBlueprint(config, moduleId, moduleDir) {
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
    const result = gitCommitAndPush(config, `[blueprint] Release module ${moduleId} (${moduleDir})`, {
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

  if (taskType === 'chaos_test') {
    return {
      ...base,
      instructions: taskPrompt,
      session: {
        runtime: 'acp',
        acp_agent_id: config.chaos_test?.acp_agent_id || 'codex',
        timeout_seconds: (config.chaos_test?.time_limit_minutes || 30) * 60,
        label: `buster-chaos-${moduleId}-${Date.now()}`,
      },
      chaos_config: {
        scope: 'full_application',
        goal: 'Try to crash the application. Test edge cases, invalid inputs, race conditions, resource exhaustion, malformed requests. Be creative and destructive.',
        time_limit_minutes: config.chaos_test?.time_limit_minutes || 30,
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
function verifyAgentAlive(config, agentType, moduleId, waitMs = 8000) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return false;

  // Redis agents: trust the dispatch — Processor monitors the subagent
  if (agentConfig.dispatch === 'redis') return true;

  // Wait for ACP session to initialize
  execFileSync('sleep', [String(waitMs / 1000)]);

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
  let rateLimitPauses = 0;
  const maxPauses = config.rate_limit?.max_pauses_per_module || 5;

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
    if (check.rate_limited) {
      rateLimitPauses++;
      if (rateLimitPauses > maxPauses) {
        log('ERROR', `[${label}] Rate limit pauses exceeded (${rateLimitPauses}/${maxPauses})`);
        return pollResult(false, 'rate_limit_exhausted', check.status);
      }
      await handleRateLimit(config, check.status, label, rateLimitPauses, maxPauses);
      // Reset deadline — cooldown doesn't count against work time
      deadline = Date.now() + timeoutMinutes * 60 * 1000;
      log('INFO', `[${label}] Deadline reset to full ${timeoutMinutes}min after rate limit pause`);
      continue;
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
 * Pure status poller — reads status.json until a target status is reached.
 * Does NOT handle rate limits, does NOT sleep for hours, does NOT write state.
 * Returns immediately when it sees RATE_LIMITED (caller decides what to do).
 */
async function pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes) {
  const interval = config.poll_interval_seconds * 1000;
  const deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  let consecutiveParseFailures = 0;
  const maxParseFailures = 10; // ~5min at 30s intervals

  log('INFO', `Polling every ${config.poll_interval_seconds}s | timeout: ${timeoutMinutes}min | waiting for: ${expectedStatuses.join(' | ')}`);

  while (Date.now() < deadline) {
    await sleep(interval);

    // Agent may have committed — pull latest
    gitPullForPolling(config);

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

    // Rate limit: return immediately — caller handles pause/resume
    if (status.status === STATUS.RATE_LIMITED) {
      log('WARN', 'Agent reported RATE_LIMITED — returning to caller for pause handling');
      return pollResult(false, 'rate_limited', status);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log('INFO', `[${status.module_id}] status=${status.status} phase=${status.current_phase} elapsed=${elapsed}s remaining=${remaining}s`);
  }

  log('ERROR', `Timeout after ${timeoutMinutes} minutes`);
  return pollResult(false, 'timeout', null);
}

/**
 * Wrapper around pollStatus that handles rate limit pauses.
 *
 * Separation of concerns:
 *   pollStatus — pure reader, returns on any terminal condition
 *   pollWithRateLimitRecovery — handles RATE_LIMITED by sleeping and re-polling
 *
 * After each rate limit cooldown, polling restarts with the FULL original timeout.
 * Cooldown time is "dead time" that doesn't count against the agent's work budget.
 * This is fair: the agent was blocked by external API limits, not by being slow.
 */
async function pollWithRateLimitRecovery(config, moduleDir, expectedStatuses, timeoutMinutes) {
  let rateLimitPauses = 0;
  const maxPauses = config.rate_limit?.max_pauses_per_module || 5;

  while (true) {
    const result = await pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes);

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

    // After cooldown: restart polling with full timeout budget.
    // The agent's work clock resets — rate limit pauses don't count against it.
    log('INFO', `Rate limit cooldown complete — restarting poll with full ${timeoutMinutes}min timeout (pause ${rateLimitPauses}/${maxPauses})`);
  }
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
    `const Redis = require('ioredis');`,
    `const redis = new Redis({`,
    `  host: process.env.REDIS_HOST || 'redis-master.default.svc.cluster.local',`,
    `  port: parseInt(process.env.REDIS_PORT || '6379'),`,
    `  password: process.env.REDIS_PASSWORD,`,
    `});`,
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
    `const Redis = require('ioredis');`,
    `const redis = new Redis({`,
    `  host: process.env.REDIS_HOST || 'redis-master.default.svc.cluster.local',`,
    `  port: parseInt(process.env.REDIS_PORT || '6379'),`,
    `  password: process.env.REDIS_PASSWORD,`,
    `});`,
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

async function pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes) {
  const interval = config.poll_interval_seconds * 1000;
  const deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  let consecutiveParseFailures = 0;
  const maxParseFailures = 10;

  log('INFO', `Dual polling: Redis(${completionStreamKey(config)}) + Git(${moduleDir}) | timeout: ${timeoutMinutes}min | waiting for: ${expectedStatuses.join(' | ')}`);

  while (Date.now() < deadline) {
    await sleep(interval);

    // ── Channel 1: Redis Completion Stream (fast path) ──
    try {
      const redisEntry = readCompletionFromRedis(config, moduleId);
      if (redisEntry && redisEntry.status) {
        const mappedStatus = mapRedisStatus(redisEntry.status);
        log('OK', `Redis completion: status=${redisEntry.status} mapped=${mappedStatus} source=${redisEntry.source || 'unknown'}`);

        if (expectedStatuses.includes(mappedStatus)) {
          return pollResult(true, 'target_reached', {
            module_id: moduleId,
            status: mappedStatus,
            completion_summary: redisEntry.summary || null,
            forge_commit_hash: redisEntry.commit_hash || null,
            _source: 'redis',
            _redis_entry: redisEntry,
          });
        }
        if (mappedStatus === STATUS.BLOCKED) return pollResult(false, 'blocked', redisEntry);
        if (mappedStatus === STATUS.RATE_LIMITED) return pollResult(false, 'rate_limited', redisEntry);
      }
    } catch (e) {
      log('DEBUG', `Redis poll error (non-critical): ${e.message}`);
    }

    // ── Channel 2: Git Polling (fallback) ──
    gitPullForPolling(config);
    const status = loadStatus(config, moduleDir);

    if (!status) {
      const filePath = statusPath(config, moduleDir);
      if (fs.existsSync(filePath)) {
        consecutiveParseFailures++;
        if (consecutiveParseFailures >= maxParseFailures) {
          log('ERROR', `status.json permanently corrupted (${consecutiveParseFailures} consecutive failures)`);
          return pollResult(false, 'parse_corrupted', { module_id: moduleDir });
        }
        log('WARN', `status.json parse failure ${consecutiveParseFailures}/${maxParseFailures}`);
      }
      continue;
    }

    consecutiveParseFailures = 0;

    if (expectedStatuses.includes(status.status)) {
      log('OK', `Git polling: target status reached: ${status.status}`);
      return pollResult(true, 'target_reached', { ...status, _source: 'git' });
    }
    if (status.status === STATUS.BLOCKED) return pollResult(false, 'blocked', status);
    if (status.status === STATUS.RATE_LIMITED) {
      log('WARN', 'Agent reported RATE_LIMITED — returning to caller');
      return pollResult(false, 'rate_limited', status);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log('INFO', `[${moduleId}] status=${status.status} phase=${status.current_phase} elapsed=${elapsed}s remaining=${remaining}s`);
  }

  log('ERROR', `Timeout after ${timeoutMinutes} minutes`);
  return pollResult(false, 'timeout', null);
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

/**
 * Wrapper around pollDual that handles rate limit pauses.
 * Same pattern as pollWithRateLimitRecovery wraps pollStatus.
 */
async function pollDualWithRateLimitRecovery(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes) {
  let rateLimitPauses = 0;
  const maxPauses = config.rate_limit?.max_pauses_per_module || 5;

  while (true) {
    const result = await pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes);

    if (result.reason !== 'rate_limited') return result;

    rateLimitPauses++;
    if (rateLimitPauses > maxPauses) {
      log('ERROR', `Rate limit pauses exceeded max (${rateLimitPauses}/${maxPauses}) — giving up`);
      return pollResult(false, 'rate_limit_exhausted', result.status);
    }

    await handleRateLimit(config, result.status, moduleDir, rateLimitPauses, maxPauses);
    log('INFO', `Rate limit cooldown complete — restarting dual poll with full ${timeoutMinutes}min timeout`);
  }
}

// ─── Git Sync (Forge → Buster handoff) ──────────────────────────────────────
// Before Buster starts, ALL Forge changes must be committed and pushed.
// The commit hash is recorded in status.json so Buster works on verified code.

function gitSyncBeforeBuster(config, moduleDir, status) {
  log('STEP', 'Git sync: committing and pushing Forge output before Buster');

  try {
    // Commit any uncommitted Forge output + push.
    // If Forge already committed (porcelain empty), gitCommitAndPush returns committed:false.
    // In that case we STILL need to push — Forge may have committed but not pushed.
    const result = gitCommitAndPush(config,
      `[pipeline] Module ${status.module_id}: Forge output — ready for Buster`,
      { captureHash: true }
    );

    if (!result.committed) {
      // Nothing new to commit, but ensure any existing unpushed commits get pushed
      log('INFO', 'No uncommitted changes (Forge already committed) — pushing existing commits');
      gitPullBeforePush(config);
      gitPushWithRetry(config);
    }

    // Record commit hash (always — whether we committed or Forge did)
    const commitHash = result.hash || gitExec(config.repo_root, ['rev-parse', 'HEAD']);
    const shortHash = commitHash.substring(0, 8);

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
  const recalledMemoryIds = opts.recalledMemoryIds || [];

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
// Assembly order (top = highest priority at runtime):
//   1. Priority header (tells agent how to resolve conflicts)
//   2. Nova directive (if present — Nova outranks everything)
//   3. Anti-patterns from failures (what NOT to do)
//   4. FORGE.md base instructions (what TO do)
//   5. Memory context (supplementary learnings, may be outdated)

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
      return `${i + 1}. [${label} in ${f.phase}] ${f.summary}`;
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
  const prompt = priorityHeader + novaBlock + antiPatternBlock + baseInstructions + memoryBlock;
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
  log('STEP', `═══════════════════════════════════════════════════`);

  // ── Dependencies (checked once, before any attempt) ──
  const deps = checkDependencies(config, progress, moduleId);
  if (!deps.met) return { exit: EXIT_ERROR, reason: `Dependencies not met: ${deps.reason}` };

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
 * Execute one complete Forge → Git Sync → Buster cycle for a module.
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
    return { retry: false, result: { exit: EXIT_BLOCKED, reason: `Module ${moduleId} is BLOCKED`, module: moduleId } };
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

    // Build complete prompt with priority hierarchy and anti-pattern framing
    const promptResult = await buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt);
    if (promptResult.error) return { retry: false, result: { exit: EXIT_ERROR, reason: promptResult.error } };
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
    catch (e) { return { retry: false, result: { exit: EXIT_ERROR, reason: `Forge spawn failed: ${e.message}` } }; }

    // Early health check — catch silent spawn failures (OOM, bad model, gateway down)
    // in ~8 seconds instead of waiting the full timeout (up to 60 minutes).
    if (!verifyAgentAlive(config, 'forge', moduleId)) {
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
  //  GIT SYNC (Forge → Buster handoff)
  //  Ensures Buster always works on committed, pushed code.
  //  Records commit hash in status.json for traceability.
  // ──────────────────────────────────────────────────────────────────────────
  if (needsBuster || status.status === STATUS.READY_FOR_TESTING) {
    try {
      gitSyncBeforeBuster(config, dir, status);
      saveStatus(config, dir, status);
    } catch (e) {
      return { retry: false, result: { exit: EXIT_ERROR, reason: e.message } };
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
    catch (e) { return { retry: false, result: { exit: EXIT_ERROR, reason: e.message } }; }

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
    catch (e) { return { retry: false, result: { exit: EXIT_ERROR, reason: `Buster spawn failed: ${e.message}` } }; }

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
  return { retry: false, result: { exit: EXIT_ERROR, reason: `Unexpected status: ${status?.status}` } };
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

  // Poll using generic poller with gate-specific check function
  const result = await pollGeneric(config, async () => {
    // Primary completion signal: output file exists
    if (gate.output_file) {
      if (fs.existsSync(path.join(swarmRoot(config), gate.output_file))) {
        return { done: true, result: pollResult(true, 'target_reached', { gate: gateId }) };
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

    if (gateStatus?.status === STATUS.FAIL) {
      return { done: true, result: pollResult(false, 'gate_fail', gateStatus) };
    }
    if (gateStatus?.status === STATUS.RATE_LIMITED) {
      return { rate_limited: true, status: gateStatus };
    }

    return { done: false, logMsg: `status=${gateStatus?.status || 'unknown'}` };
  }, timeout, `Gate '${gateId}'`);

  // ── Post-poll: always kill agent ──
  killAgent(config, agentType, gateId);

  // ── Interpret result ──
  if (result.ok) {
    log('OK', `Gate '${gateId}' completed`);
    await discord(config, 'OK', `Gate: ${gate.title} PASS`, 'Review completed');
    return { exit: EXIT_OK, status: STATUS.PASS };
  }

  if (result.reason === 'gate_fail') {
    const reason = result.status?.reason || 'unknown';
    log('ERROR', `Gate '${gateId}' agent reported FAIL: ${reason}`);
    await discord(config, 'CRITICAL', `Gate '${gateId}' FAIL`,
      `Agent reported failure: ${reason}`);
    return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' failed: ${reason}` };
  }

  if (result.reason === 'parse_corrupted') {
    log('ERROR', `Gate '${gateId}' status file permanently corrupted`);
    return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' status file permanently corrupted` };
  }

  if (result.reason === 'rate_limit_exhausted') {
    log('ERROR', `Gate '${gateId}' rate limit pauses exceeded`);
    return { exit: EXIT_RATE_LIMITED, reason: `Gate '${gateId}' exceeded max rate limit pauses` };
  }

  // Timeout
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

function chaosTestDir(config) {
  return path.join(swarmRoot(config), 'chaos-tests');
}

function chaosResultsPath(config, phaseId) {
  return path.join(chaosTestDir(config), `${phaseId}-results.json`);
}

function chaosPlanPath(config, phaseId) {
  return path.join(chaosTestDir(config), `${phaseId}-plan.md`);
}

function chaosMarkerPath(config, phaseId) {
  return path.join(chaosTestDir(config), `${phaseId}-done.json`);
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
  const chaosDir = chaosTestDir(config);
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
  await pollForFile(config, resultsFile, timeout, `chaos-${phase.id}`);

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

    // Pick the forge model from the most-affected module (first issue with a known module).
    // Falls back to last module config, then to default.
    // If issues span multiple modules with different models, the first affected module wins —
    // the fix agent needs to handle all issues regardless of which model it runs on.
    let forgeModel = null;
    for (const issue of blockingIssues) {
      const affMod = issue.affected_module && progress.modules[issue.affected_module];
      if (affMod?.forge_model) { forgeModel = affMod.forge_model; break; }
    }
    if (!forgeModel) forgeModel = lastModConfig.forge_model || 'codex-5.3';

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
      gitPullForPolling(config);
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
    const syncResult = gitCommitAndPush(config,
      `[pipeline] Chaos fix ${phase.id} attempt ${attempt}`,
      { softFail: true }
    );
    if (syncResult.error) {
      log('WARN', `Chaos fix git sync failed: ${syncResult.error} — Buster may test stale code`);
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
    await pollForFile(config, resultsFile, timeout, `chaosverify-${phase.id}-${attempt}`);

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
  spawnAgent, killAgent, steerAgent, verifyAgentAlive,
  spawnAcpAgent, killAcpAgent, dispatchRedisTask,
  recallForModule, feedbackMemory, decayRecalledMemories,
  buildForgePrompt, executeModuleAttempt,
  runModule, runGate, runPipeline, runChaosTest,
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
    else if (a === '--config'         && args[i+1]) flags.config = args[++i];
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
  --config <path>         Config file override (default: <repo>/projects/<project>/.swarm/pipeline.config.json)
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

      const config = loadConfig(flags.project, flags.config);

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
          cleanupTempDir();
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
