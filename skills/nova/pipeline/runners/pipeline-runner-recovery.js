import fs from 'fs';
import os from 'os';
import path from 'path';

import { log } from '../core/logger.js';
import {
  loadStatus,
  saveStatus,
  appendStaleRecoveryLifecycleEvent,
} from '../services/status-store.js';
import { gateActiveSessionPath } from '../core/paths.js';
import { discord } from '../integrations/discord.js';
import { onModuleStatusChanged } from '../services/telemetry.js';
import { observeAcpMonitorSurfaces } from '../services/acp-observability.js';
import { killSession } from '../../../common/pipeline/agents/lifecycle.js';
import { reaperAfterKill } from '../agents/shutdown.js';
import { getRetryStatusForPhase, transitionModuleStatus } from '../../../common/pipeline/lifecycle-state.js';
import {
  STALE_RECOVERY_ACTIONS,
  isDefinitivelyStoppedMonitorState,
  describeStaleRecovery,
} from '../services/failure-semantics.js';
import {
  buildPipelineDiscordFields,
  getModuleAttempt,
  getProgressGateType,
} from './pipeline-runner-shared.js';

function pipelineRunLockPath(config) {
  return path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'active-run.lock.json');
}

export const PIPELINE_RUN_CONCURRENCY_LIMIT = 1;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPipelineRunLock(lockPath) {
  if (!lockPath || !fs.existsSync(lockPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function removeFileIfPresent(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function isPipelineRunLockActive(lock) {
  if (!lock?.pid) return false;
  if (lock.hostname && lock.hostname !== os.hostname()) return true;
  return pidAlive(Number(lock.pid));
}

export function acquirePipelineRunLock(config, opts = {}) {
  const lockPath = pipelineRunLockPath(config);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  const owner = {
    token: `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pid: process.pid,
    hostname: os.hostname(),
    project: config.project,
    run_id: config._runId || config.run_id || null,
    module: opts.module || null,
    resume: opts.resume === true,
    acquired_at: new Date().toISOString(),
    repo_root: config.repo_root || process.cwd(),
  };

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify(owner, null, 2) + '\n');
      } finally {
        fs.closeSync(fd);
      }
      log('INFO', `Pipeline run lock acquired: ${lockPath}`);
      return { path: lockPath, token: owner.token };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const existing = readPipelineRunLock(lockPath);
      if (isPipelineRunLockActive(existing)) {
        throw new Error(
          `Another pipeline run is already active for project '${config.project}'`
          + `${existing?.run_id ? ` (run ${existing.run_id})` : ''}`
          + `${existing?.module ? `, module ${existing.module}` : ''}`
          + `${existing?.pid ? `, pid ${existing.pid}` : ''}`
        );
      }
      try { fs.unlinkSync(lockPath); } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') throw unlinkErr;
      }
    }
  }
}

export function releasePipelineRunLock(lock) {
  if (!lock?.path) return;
  try {
    const current = readPipelineRunLock(lock.path);
    if (current?.token && lock.token && current.token !== lock.token) return;
    fs.unlinkSync(lock.path);
    log('INFO', `Pipeline run lock released: ${lock.path}`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function reconcileStaleModuleState(config, progress) {
  const now = new Date().toISOString();
  const moduleEntries = Object.entries(progress.modules || {});
  for (const [moduleId, mod] of moduleEntries) {
    const dir = mod?.dir || moduleId;
    const status = loadStatus(config, dir);
    if (!status) continue;
    if (!['IN_PROGRESS', 'TESTING'].includes(status.status)) continue;
    const oldStatus = status.status;

    let shouldReset = false;
    let note = null;
    let recoveryAction = null;
    const active = status.active_agent || null;
    const previousPhase = status.current_phase || 'unknown';

    if (active?.session_key) {
      try {
        const { monitor: mon } = await observeAcpMonitorSurfaces(config, active.session_key, {
          module_id: moduleId,
          gateway_label: active.gateway_label || active.label || null,
          session_key: active.session_key || null,
          attempt: active.attempt ?? getModuleAttempt(status),
          dispatch_id: active.dispatch_id || null,
          agent_type: previousPhase,
        }, {
          streamLogPath: active.stream_log_path || null,
        });
        const definitelyStopped = isDefinitivelyStoppedMonitorState(mon);
        if (definitelyStopped) {
          shouldReset = true;
          recoveryAction = STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL;
          note = describeStaleRecovery(previousPhase, recoveryAction, {
            detail: mon.lastDetail || mon.lastSummary || 'terminal',
          });
        } else {
          const stopResult = await killSession(active.session_key, {
            runtime: active.runtime || null,
            model: active.model || null,
            agentId: active.agent_id || null,
            label: active.gateway_label || active.label || null,
          });
          if (!stopResult?.confirmed) {
            throw new Error(`orphaned child session could not be confirmed stopped (${stopResult?.state || 'unknown'})`);
          }
          if ((active.runtime || '').toLowerCase() !== 'subagent') {
            await reaperAfterKill(active.agent_id || null, active.session_key, active.gateway_label || active.label || null);
          }
          shouldReset = true;
          recoveryAction = STALE_RECOVERY_ACTIONS.KILLED_ORPHAN;
          note = describeStaleRecovery(previousPhase, recoveryAction, {
            sessionKey: active.session_key,
          });
        }
      } catch (e) {
        throw new Error(`Failed to reconcile stale ${previousPhase} session for module ${moduleId}: ${e.message}`);
      }
    } else if (status.updated_at) {
      const ageMs = Date.now() - new Date(status.updated_at).getTime();
      if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
        shouldReset = true;
        recoveryAction = STALE_RECOVERY_ACTIONS.RESET_WITHOUT_SESSION;
        note = describeStaleRecovery(previousPhase, recoveryAction, {
          inactivityMinutes: Math.round(ageMs / 60000),
        });
      }
    }

    if (!shouldReset) continue;
    const recoveryTargetStatus = getRetryStatusForPhase(previousPhase);
    appendStaleRecoveryLifecycleEvent(config, {
      moduleId,
      dir,
      status,
      attempt: active?.attempt ?? null,
      recoveryTargetStatus,
      recoveryAction,
      reason: note,
      sessionKey: active?.session_key || null,
      dispatchId: active?.dispatch_id || null,
      gatewayLabel: active?.gateway_label || active?.label || null,
      staleEvidence: {
        previous_phase: previousPhase,
        observed_via: active?.session_key ? 'session_monitor' : 'status_age',
        status_before_reset: oldStatus,
      },
      occurredAt: now,
    });
    transitionModuleStatus(status, recoveryTargetStatus, {
      now,
      note,
      clearActiveAgent: true,
    });
    saveStatus(config, dir, status);
    onModuleStatusChanged({ config, runId: config?.run_id || config?._runId || '' }, moduleId, {
      title: mod?.title || null,
      old_status: oldStatus,
      new_status: status.status || null,
      phase: previousPhase,
      reason: note,
    });
    log('WARN', `[stale-reconcile] ${moduleId}: ${note}`);
    try {
      await discord(config, 'WARN', `Module ${moduleId} — Recovered stale ${previousPhase} state`,
        `${note}. No new Buster suite ran yet; the pipeline only cleared old interrupted state before retrying.`, [
          ...buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown', module_id: moduleId, attempt: active.attempt ?? getModuleAttempt(status), dispatch_id: active.dispatch_id || null, gateway_label: active.gateway_label || active.label || null, session_key: active.session_key || null }),
          { name: 'Previous Phase', value: previousPhase, inline: true },
          { name: 'Recovery Action', value: recoveryAction || STALE_RECOVERY_ACTIONS.RESET_WITHOUT_SESSION, inline: true },
          { name: 'Status Reset To', value: status.status || 'PENDING', inline: true },
          { name: 'Meaning', value: 'No fresh suite result exists yet. This message is recovery from an earlier interrupted child session.', inline: false },
        ]);
    } catch {}
  }
}

export async function reconcileStaleGateSessions(config, progress) {
  for (const gateId of Object.keys(progress.gates || {})) {
    const activePath = gateActiveSessionPath(config, gateId);
    if (!fs.existsSync(activePath)) continue;

    const active = readJsonFile(activePath);
    if (!active?.session_key) {
      removeFileIfPresent(activePath);
      continue;
    }

    const previousPhase = active.phase || 'gate';
    const gateType = getProgressGateType(progress, gateId);
    let note = null;
    let recoveryAction = null;
    try {
      const { monitor: mon } = await observeAcpMonitorSurfaces(config, active.session_key, {
        gate_id: gateId,
        gate_type: gateType,
        gateway_label: active.gateway_label || active.label || null,
        session_key: active.session_key || null,
        attempt: active.attempt ?? null,
        dispatch_id: active.dispatch_id || null,
        agent_type: previousPhase,
      }, {
        streamLogPath: active.stream_log_path || null,
      });
      const definitelyStopped = isDefinitivelyStoppedMonitorState(mon);

      if (definitelyStopped) {
        recoveryAction = STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL;
        note = describeStaleRecovery(previousPhase, recoveryAction, {
          detail: mon.lastDetail || mon.lastSummary || 'terminal',
        }).replace(' state ', ' session ');
      } else {
        const stopResult = await killSession(active.session_key, {
          runtime: active.runtime || null,
          model: active.model || null,
          agentId: active.agent_id || null,
          label: active.gateway_label || active.label || null,
        });
        if (!stopResult?.confirmed) {
          throw new Error(`orphaned gate session could not be confirmed stopped (${stopResult?.state || 'unknown'})`);
        }
        if ((active.runtime || '').toLowerCase() !== 'subagent') {
          await reaperAfterKill(active.agent_id || null, active.session_key, active.gateway_label || active.label || null);
        }
        recoveryAction = STALE_RECOVERY_ACTIONS.KILLED_ORPHAN;
        note = describeStaleRecovery(previousPhase, recoveryAction, {
          sessionKey: active.session_key,
        }).replace(' state ', ' session ');
      }

      appendStaleRecoveryLifecycleEvent(config, {
        gateId,
        gateType,
        attempt: active.attempt ?? null,
        recoveryTargetStatus: 'PENDING',
        recoveryAction: recoveryAction || STALE_RECOVERY_ACTIONS.KILLED_ORPHAN,
        reason: note,
        sessionKey: active.session_key || null,
        dispatchId: active.dispatch_id || null,
        gatewayLabel: active.gateway_label || active.label || null,
        staleEvidence: {
          previous_phase: previousPhase,
          observed_via: 'session_monitor',
          active_session_path: activePath,
        },
      });
      removeFileIfPresent(activePath);
      log('WARN', `[stale-reconcile] gate ${gateId}: ${note}`);
      try {
        await discord(config, 'WARN', `Gate ${gateId} — Recovered stale ${previousPhase} session`, note, [
          ...buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gateType, attempt: active.attempt ?? null, dispatch_id: active.dispatch_id || null, gateway_label: active.gateway_label || active.label || null, session_key: active.session_key || null }),
          { name: 'Previous Phase', value: previousPhase, inline: true },
          { name: 'Recovery Action', value: recoveryAction || STALE_RECOVERY_ACTIONS.KILLED_ORPHAN, inline: true },
          { name: 'Action', value: 'Cleared stale gate session state', inline: true },
        ]);
      } catch {}
    } catch (e) {
      throw new Error(`Failed to reconcile stale ${previousPhase} session for gate ${gateId}: ${e.message}`);
    }
  }
}
