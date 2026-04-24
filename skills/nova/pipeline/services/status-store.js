// services/status-store.js — File-backed pipeline state (status.json, gate files, logs)

import fs from 'fs';
import path from 'path';

import { statusPath, moduleLogDir, relPath, gateLogDir, pipelineRunLogDir } from '../core/paths.js';
import { log, initContextLogging } from '../core/logger.js';
import { copyRedactedTranscriptArtifact, writeRedactedPromptArtifact } from '../../../common/pipeline/redaction.js';
import { buildLatestPointer } from './artifact-bundle.js';
import { consumePendingLifecycleMutation } from '../../../common/pipeline/lifecycle-state.js';
import {
  appendModuleLifecycleEvent,
  isLegacyModuleStatusBootstrapEnabled,
  resetLifecycleStore,
} from './status-store-lifecycle.js';
import { projectModuleCompatibilityState } from './status-store-compat.js';

export {
  appendCooldownLifecycleEvent,
  appendLifecycleEvent,
  appendModuleLifecycleEvent,
  appendPipelineLifecycleEvent,
  appendStaleRecoveryLifecycleEvent,
  appendWaitLifecycleEvent,
  getLifecycleCooldown,
  getLifecycleGateState,
  getLifecycleModuleState,
  loadLifecycleReadModels,
  readLifecycleEvents,
} from './status-store-lifecycle.js';

export {
  gateOutputExists,
  getAuthoritativeModuleState,
  projectGateCompatibilityState,
  projectModuleCompatibilityState,
  readBusterGateCompletion,
  readGateOutput,
  readGateStatusJson,
  syncApprovalWaitState,
} from './status-store-compat.js';

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

  const runLogDir = pipelineRunLogDir(config);
  fs.mkdirSync(runLogDir, { recursive: true });
  config._runLogDir = runLogDir;

  const pipelineLogFd = fs.createWriteStream(path.join(pipelineDir, 'pipeline.jsonl'), { flags: 'a' });
  const runPipelineLogFd = fs.createWriteStream(path.join(runLogDir, 'pipeline.jsonl'), { flags: 'a' });
  config._pipelineLogFd = pipelineLogFd;
  config._runPipelineLogFd = runPipelineLogFd;

  fs.writeFileSync(
    path.join(pipelineDir, 'latest.json'),
    JSON.stringify(buildLatestPointer(config, {
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      exitCode: null,
    }), null, 2)
  );

  resetLifecycleStore(config);
  initContextLogging(ctx, pipelineLogFd, runPipelineLogFd);
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
  fs.mkdirSync(path.dirname(p), { recursive: true });

  const pendingMutation = consumePendingLifecycleMutation(status);
  if (pendingMutation?.eventType) {
    appendModuleLifecycleEvent(config, dir, status, pendingMutation);
  }
  projectModuleCompatibilityState(config, dir, status, null, {
    allowBootstrap: isLegacyModuleStatusBootstrapEnabled(config),
  });

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
    attempt_started_at: null,
    phase_started_at: null,
    completed_at: null,
    cost: {
      total_duration_seconds: 0,
      attempt_duration_seconds: 0,
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

// ---------------------------------------------------------------------------
// Prompt / transcript persistence
// ---------------------------------------------------------------------------

export function savePrompt(config, dir, agentType, attempt, prompt) {
  if (!config?._logDir || !dir || typeof prompt !== 'string') {
    log('DEBUG', 'Prompt save skipped (non-critical): missing log dir, module dir, or prompt content');
    return;
  }
  try {
    const logDir = moduleLogDir(config, dir);
    fs.mkdirSync(logDir, { recursive: true });
    const filePath = path.join(logDir, `${agentType}-prompt-attempt-${attempt}.md`);
    writeRedactedPromptArtifact(filePath, prompt, { agent_type: agentType, attempt, module_dir: dir });
    log('DEBUG', `Prompt metadata saved: ${relPath(config, filePath)} (${prompt.length} chars redacted)`);
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
    copyRedactedTranscriptArtifact(streamLogPath, destPath);
    const size = fs.statSync(destPath).size;
    log('OK', `Stream log metadata saved: ${relPath(config, destPath)} (${(size / 1024).toFixed(1)} KB)`);
  } catch (e) {
    log('DEBUG', `Stream log save failed (non-critical): ${e.message}`);
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
