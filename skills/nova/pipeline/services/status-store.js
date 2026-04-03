// services/status-store.js — File-backed pipeline state (status.json, gate files, logs)
// Extracted from pipeline-original.js (module 04)

import fs from 'fs';
import path from 'path';
import { statusPath, moduleLogDir, relPath, gateLogDir, swarmRoot, gateStatusPath } from '../core/paths.js';
import { log, initContextLogging } from '../core/logger.js';

// ---------------------------------------------------------------------------
// Log directory init
// ---------------------------------------------------------------------------

export function initLogDir(config, ctx) {
  const logDir = path.join(config.paths.swarm_dir, 'logs');
  const pipelineDir = path.join(logDir, 'pipeline');
  fs.mkdirSync(pipelineDir, { recursive: true });
  fs.mkdirSync(path.join(logDir, 'modules'), { recursive: true });
  fs.mkdirSync(path.join(logDir, 'gates'), { recursive: true });

  config._logDir = logDir;
  const pipelineLogFd = fs.createWriteStream(path.join(pipelineDir, 'pipeline.jsonl'), { flags: 'a' });
  initContextLogging(ctx, pipelineLogFd);
  log('INFO', `Log directory initialized: ${logDir}`);
}

// ---------------------------------------------------------------------------
// Status file operations
// ---------------------------------------------------------------------------

export function loadStatus(config, dir) {
  const p = statusPath(config, dir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    let preview = '';
    try { preview = fs.readFileSync(p, 'utf8').slice(0, 200); } catch { /* unreadable */ }
    log('WARN', `status.json parse failed (${dir}): ${e.message} — treating as not ready`, { preview });
    return null;
  }
}

export function saveStatus(config, dir, status) {
  const p = statusPath(config, dir);
  const tmp = p + '.tmp';
  status.updated_at = new Date().toISOString();
  fs.writeFileSync(tmp, JSON.stringify(status, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

export function initStatus(moduleId, moduleConfig) {
  return {
    module_id: moduleId,
    title: moduleConfig.title,
    status: 'PENDING',
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    history: [],
    started_at: null,
    completed_at: null,
    cost: {
      total_duration_seconds: 0,
    },
    validation: {
      attempt: 1,
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    },
    forge_commit: null,
    buster_commit: null,
  };
}

export function addHistory(status, newStatus, agent, note) {
  status.history.push({
    timestamp: new Date().toISOString(),
    from: status.status,
    to: newStatus,
    agent,
    note: note || '',
  });
  status.status = newStatus;
}

// ---------------------------------------------------------------------------
// Prompt / transcript persistence
// ---------------------------------------------------------------------------

export function savePrompt(config, dir, agentType, attempt, prompt) {
  if (!config?._logDir || !dir || typeof prompt !== 'string') {
    log('DEBUG', `Prompt save skipped (non-critical): missing log dir, module dir, or prompt content`);
    return;
  }
  try {
    const logDir = moduleLogDir(config, dir);
    fs.mkdirSync(logDir, { recursive: true });
    const filePath = path.join(logDir, `${agentType}-prompt-attempt-${attempt}.md`);
    fs.writeFileSync(filePath, prompt);
    log('DEBUG', `Prompt saved: ${relPath(config, filePath)} (${prompt.length} chars)`);
  } catch (e) {
    log('DEBUG', `Prompt save failed (non-critical): ${e.message}`);
  }
}

export function saveStreamLog(config, dir, agentType, attempt, streamLogPath) {
  if (!streamLogPath) return;
  try {
    if (!fs.existsSync(streamLogPath)) {
      log('DEBUG', `Stream log not found: ${streamLogPath}`);
      return;
    }
    const logDir = moduleLogDir(config, dir);
    fs.mkdirSync(logDir, { recursive: true });
    const destPath = path.join(logDir, `${agentType}-transcript-attempt-${attempt}.jsonl`);
    fs.copyFileSync(streamLogPath, destPath);
    const size = fs.statSync(destPath).size;
    log('OK', `Stream log saved: ${relPath(config, destPath)} (${(size / 1024).toFixed(1)} KB)`);
  } catch (e) {
    log('DEBUG', `Stream log save failed (non-critical): ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Gate output file helpers
// ---------------------------------------------------------------------------

/**
 * Read a gate's output file and determine if the gate has passed.
 * Content-aware: a FAIL/ISSUES_FOUND/NO-GO file is not a pass.
 * Non-JSON files (e.g. markdown reviews) are treated as passed.
 *
 * @returns {{ exists: boolean, data: object|null, isPass: boolean }}
 */
export function readGateOutput(config, gate) {
  if (!gate?.output_file) return { exists: false, data: null, isPass: false };
  const outPath = path.join(swarmRoot(config), gate.output_file);
  if (!fs.existsSync(outPath)) return { exists: false, data: null, isPass: false };
  try {
    const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const s = (data.status || '').toUpperCase();
    const isFail = s === 'FAIL' || s === 'ISSUES_FOUND' || s === 'NO-GO';
    return { exists: true, data, isPass: !isFail };
  } catch {
    // Non-JSON file (e.g. markdown review) — existence = done
    return { exists: true, data: null, isPass: true };
  }
}

/**
 * Check if a gate's output file exists (regardless of content).
 * Use readGateOutput for content-aware completion checks.
 */
export function gateOutputExists(config, gate) {
  if (!gate?.output_file) return false;
  return fs.existsSync(path.join(swarmRoot(config), gate.output_file));
}

/**
 * Read the gate-status.json fallback file (written by Buster on PASS).
 * Used when output_file is absent (Buster crashed before writing it).
 *
 * @returns {{ exists: boolean, data: object|null, isPass: boolean }}
 */
export function readGateStatusJson(config, gateId) {
  const gsPath = gateStatusPath(config, gateId);
  if (!fs.existsSync(gsPath)) return { exists: false, data: null, isPass: false };
  try {
    const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
    const s = (gs.status || '').toUpperCase();
    return { exists: true, data: gs, isPass: s === 'PASS' || s === 'OK' || s === 'APPROVED' };
  } catch {
    return { exists: true, data: null, isPass: false };
  }
}

// ---------------------------------------------------------------------------
// Archive helpers
// ---------------------------------------------------------------------------

export function gateArchiveDir(config, gateId) {
  return path.join(gateLogDir(config, gateId), 'archive');
}

export function archiveGateOutputIfPresent(config, gateId, sourcePath, { attempt = null, label = null } = {}) {
  if (!fs.existsSync(sourcePath)) return null;

  const archiveDir = gateArchiveDir(config, gateId);
  fs.mkdirSync(archiveDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const parsed = path.parse(sourcePath);
  const attemptSuffix = attempt ? `-attempt-${attempt}` : '';
  const labelSuffix = label ? `-${label}` : '';
  const archivedPath = path.join(archiveDir, `${parsed.name}${labelSuffix}${attemptSuffix}-${ts}${parsed.ext || '.json'}`);
  fs.copyFileSync(sourcePath, archivedPath);
  return archivedPath;
}
