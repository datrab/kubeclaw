import fs from 'fs';
import path from 'path';
import { log, getActiveContext } from '../core/logger.js';
import { saveStatus, addHistory } from './status-store.js';
import { discord } from '../integrations/discord.js';
import { gatewayInvoke } from '../integrations/gateway.js';

const EXIT_NEEDS_NOVA = 10;
const EXIT_BLOCKED = 20;
const EXIT_TIMEOUT = 30;

const STATUS = {
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
};

export const FAIL_PATTERNS = {
  BUSTER_IMAGE_UNAVAILABLE: 'BUSTER_IMAGE_UNAVAILABLE',
  BUSTER_PORT_CONFLICT: 'BUSTER_PORT_CONFLICT',
  BLUEPRINT_ALREADY_RELEASED: 'BLUEPRINT_ALREADY_RELEASED',
  FORGE_TS_COMPILE_ERROR: 'FORGE_TS_COMPILE_ERROR',
  GIT_REBASE_CONFLICT: 'GIT_REBASE_CONFLICT',
  MODULE_ORPHANED: 'MODULE_ORPHANED',
  UNKNOWN: 'unknown',
};

function classifyFailPattern(text) {
  const value = String(text || '');
  if (!value.trim()) return undefined;

  if (/image not known|image pull|no such image/i.test(value)) return FAIL_PATTERNS.BUSTER_IMAGE_UNAVAILABLE;
  if (/address already in use|eaddrinuse|errno 98/i.test(value)) return FAIL_PATTERNS.BUSTER_PORT_CONFLICT;
  if (/nothing to commit|nothing added to commit/i.test(value)) return FAIL_PATTERNS.BLUEPRINT_ALREADY_RELEASED;
  if (/error TS\d+|is not assignable|has no exported member|declared but never read/i.test(value)) return FAIL_PATTERNS.FORGE_TS_COMPILE_ERROR;
  if (/rebase conflict|\bCONFLICT\b|rebase --abort/i.test(value)) return FAIL_PATTERNS.GIT_REBASE_CONFLICT;
  if (/\bBLOCKED\b/i.test(value) && (/no reason field/i.test(value) || /empty reason/i.test(value) || /\[.*\]\s*BLOCKED\s*$/i.test(value) || /^BLOCKED$/i.test(value.trim()))) return FAIL_PATTERNS.MODULE_ORPHANED;

  return FAIL_PATTERNS.UNKNOWN;
}

function getRunStats() {
  return getActiveContext()?.stats || null;
}

function getRunId() {
  return getActiveContext()?.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Used by callers of handleFail to always provide informative anti-pattern data.
 */
export function extractAgentFailReason(status, phase) {
  const agentHistory = [...(status.history || [])].reverse()
    .find(h => h.agent !== 'pipeline' && h.note);
  const reason = agentHistory?.note
    ? `[${phase}] ${agentHistory.note}`
    : status.completion_summary
      ? `[${phase}] ${status.completion_summary}`
      : `${phase} reported FAIL (no details from agent)`;
  return reason;
}

/**
 * Extract a Forge-actionable fail reason from an orchestrator pre-test failure.
 */
export function extractPreTestFailReason(redisEntry) {
  const reason = redisEntry?.reason || 'Pre-test failure (no details)';
  let verdictDetails = '';

  if (redisEntry?.verdict) {
    try {
      const v = typeof redisEntry.verdict === 'string'
        ? JSON.parse(redisEntry.verdict)
        : redisEntry.verdict;
      const failedSuites = Object.entries(v.suites || {})
        .filter(([_, s]) => s.status === 'FAIL' || s.status === 'ERROR')
        .map(([name, s]) => {
          const topFindings = (s.findings || [])
            .slice(0, 3)
            .map(f => f.description || f.message || f.title || 'unknown')
            .join('; ');
          return `${name}: ${s.error || topFindings || 'failed'}`;
        });
      if (failedSuites.length > 0) {
        verdictDetails = ` | Failed suites: ${failedSuites.join(' | ')}`;
      }
    } catch {}
  }

  return `[buster/pre-test] ${reason}${verdictDetails}`;
}

/**
 * Extract the names of failed suites from a Redis completion entry's verdict.
 */
export function getFailedSuiteNames(redisEntry) {
  if (!redisEntry?.verdict) return [];
  try {
    const v = typeof redisEntry.verdict === 'string'
      ? JSON.parse(redisEntry.verdict)
      : redisEntry.verdict;
    return Object.entries(v.suites || {})
      .filter(([_, s]) => s.status === 'FAIL' || s.status === 'ERROR')
      .map(([name]) => name);
  } catch {
    return [];
  }
}

/**
 * Resolve the auto-retry threshold for a module or gate.
 * Priority: module/gate config > project config > platform config > default (2)
 */
export function resolveAutoRetryThreshold(config, progress, moduleIdOrGateId) {
  const moduleConf = progress?.modules?.[moduleIdOrGateId];
  const gateConf = progress?.gates?.[moduleIdOrGateId];
  return (
    moduleConf?.auto_retry_threshold ??
    gateConf?.auto_retry_threshold ??
    progress?.auto_retry_threshold ??
    config?.auto_retry_threshold ??
    2
  );
}

export async function handleFail(config, status, moduleDir, moduleId, maxFails, phase, reason, opts = {}) {
  const isTimeout = opts.isTimeout || false;

  status.fail_count++;

  if (reason) {
    status.fail_summaries.push({
      attempt: status.fail_count,
      timestamp: new Date().toISOString(),
      summary: reason,
      phase,
      failPattern: classifyFailPattern(reason),
      is_timeout: isTimeout,
      files_changed: status.forge_diff_stat || null,
    });
  }

  if (status.fail_count >= maxFails) {
    status.status = STATUS.BLOCKED;
    status.current_phase = null;
    status.blockedReason = reason || 'max_fails_reached';
    status.blockedAt = new Date().toISOString();
    status.blockedPhase = phase;
    status.blockedFailCount = status.fail_count;
    addHistory(status, STATUS.FAIL, 'pipeline', `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`);
    addHistory(status, STATUS.BLOCKED, 'pipeline', `Max retries (${maxFails}) exceeded`);
    saveStatus(config, moduleDir, status);

    log('ERROR', `Module ${moduleId} BLOCKED — failed ${maxFails}x in ${phase} phase`);
    const stats = getRunStats();
    if (stats) stats.modules_blocked.push(moduleId);
    await discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED`, `Failed ${maxFails} times in ${phase} phase. Human intervention needed.`);
    return { exit: EXIT_BLOCKED, reason: `Max retries exceeded (${phase})`, module: moduleId, status };
  }

  status.status = STATUS.FAIL;
  status.current_phase = null;
  addHistory(status, STATUS.FAIL, 'pipeline', `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`);
  saveStatus(config, moduleDir, status);

  const autoRetryThreshold = opts.autoRetryThreshold ?? resolveAutoRetryThreshold(config, opts.progress, moduleId);
  const canAutoRetry = !isTimeout && status.fail_count <= autoRetryThreshold;

  if (canAutoRetry) {
    log('INFO', `Auto-retry ${status.fail_count}/${autoRetryThreshold} — pipeline will retry internally`);
    await discord(config, 'WARN', `Module ${moduleId} FAIL (${phase}) — Auto-Retry`, `Attempt ${status.fail_count}/${maxFails}. Auto-retrying (${status.fail_count}/${autoRetryThreshold}).`, [
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

  const escalationReason = isTimeout
    ? 'Agent timed out.'
    : `Auto-retry exhausted (${autoRetryThreshold}x). Nova must analyze and provide new prompt.`;
  const stats = getRunStats();
  if (stats) stats.modules_failed.push(moduleId);

  await discord(config, 'WARN', `Module ${moduleId} ${isTimeout ? 'TIMEOUT' : 'NEEDS_NOVA'} (${phase})`, `Attempt ${status.fail_count}/${maxFails}. ${escalationReason}`, [
    { name: 'Phase', value: phase },
    { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
    ...(isTimeout ? [{ name: 'Type', value: 'TIMEOUT' }] : []),
    ...(!isTimeout ? [{ name: 'Action', value: 'Resume with --prompt' }] : []),
  ]);

  return buildNovaEscalation(config, status, moduleId, moduleDir, maxFails, phase, isTimeout, autoRetryThreshold);
}

export function buildNovaEscalation(config, status, moduleId, moduleDir, maxFails, phase, isTimeout, autoRetryThreshold) {
  const exitCode = isTimeout ? EXIT_TIMEOUT : EXIT_NEEDS_NOVA;

  return {
    exit: exitCode,
    module: moduleId,
    module_dir: moduleDir,
    is_timeout: isTimeout,
    reason: isTimeout
      ? `${phase} timed out — agent did not respond within time limit`
      : `${phase} failed ${status.fail_count}x — auto-retry exhausted, Nova must intervene`,
    fail_count: status.fail_count,
    max_fails: maxFails,
    auto_retry_threshold: autoRetryThreshold,
    remaining_attempts: maxFails - status.fail_count,
    fail_history: status.fail_summaries.map(f => ({
      attempt: f.attempt,
      phase: f.phase,
      summary: f.summary,
      failPattern: f.failPattern,
      is_timeout: f.is_timeout || false,
      files_changed: f.files_changed || null,
      timestamp: f.timestamp,
    })),
    last_fail: status.fail_summaries[status.fail_summaries.length - 1] || null,
    module_status: {
      status: status.status,
      current_phase: status.current_phase,
      started_at: status.started_at,
      forge_commit_hash: status.forge_commit_hash || null,
      cost: status.cost,
    },
    resume_command: `node pipeline.js --project ${config.project} --resume --module ${moduleId} --prompt "YOUR_NEW_APPROACH_HERE"`,
  };
}

export async function injectNeedsNova(config, result, novaChannel, stepType = 'module', stepId = null) {
  const channelId = novaChannel || process.env.NOVA_CHANNEL || null;
  const targetId = stepId || result?.module || 'unknown';
  const exitCode = result?.exit;
  const exitLabel = exitCode === EXIT_TIMEOUT ? 'TIMEOUT' : 'NEEDS_NOVA';
  const injectionLogPath = config?._logDir
    ? path.join(config._logDir, 'pipeline', 'nova-injections.jsonl')
    : null;

  const entry = {
    ts: new Date().toISOString(),
    run_id: getRunId(),
    status: 'skipped',
    channel: channelId,
    step_type: stepType,
    step_id: targetId,
    module: result?.module || null,
    exit: exitCode,
    exit_label: exitLabel,
    reason: (result?.reason || '').slice(0, 500),
    fail_count: result?.fail_count ?? null,
    max_fails: result?.max_fails ?? null,
    remaining_attempts: result?.remaining_attempts ?? null,
  };

  const appendInjectionLog = () => {
    if (!injectionLogPath) return;
    try {
      fs.appendFileSync(injectionLogPath, JSON.stringify(entry) + '\n');
    } catch {}
  };

  if (!channelId) {
    log('INFO', 'EXIT 10/TIMEOUT — no --nova-channel set, skipping Nova session injection');
    entry.status = 'skipped_no_channel';
    appendInjectionLog();
    return;
  }

  const sessionKey = `agent:main:discord:channel:${channelId}`;
  const messageLines = [
    '⚠️ Cronjob injected — Nova working on resolution.',
    `Project: ${config.project}`,
    `${stepType === 'gate' ? 'Gate' : 'Module'}: ${targetId}`,
    `Exit: ${exitLabel}`,
  ];
  if (result?.reason) messageLines.push(`Reason: ${String(result.reason).slice(0, 300)}`);
  if (result?.fail_count != null && result?.max_fails != null) {
    messageLines.push(`Attempts: ${result.fail_count}/${result.max_fails}`);
  }
  if (result?.resume_command) {
    messageLines.push(`Resume: ${String(result.resume_command).slice(0, 400)}`);
  }
  const message = messageLines.join('\n');

  try {
    await gatewayInvoke('sessions_send', { sessionKey, message }, 15000);
    entry.status = 'ok';
    log('OK', `${exitLabel} injected into Nova channel ${channelId} for ${stepType} ${targetId}`);
    await discord(config, 'WARN', `Nova injection sent: ${targetId}`, `Cronjob injected Nova into Discord channel for ${stepType} ${targetId}.`, [
      { name: 'Exit', value: exitLabel },
      { name: 'Channel', value: channelId },
      { name: 'Target', value: `${stepType}:${targetId}` },
    ]);
  } catch (e) {
    const errMsg = e?.message?.split('\n')[0] || 'unknown error';
    const isAbort = /aborted|abort/i.test(errMsg);
    if (isAbort) {
      entry.status = 'ok_aborted';
      log('OK', `${exitLabel} injected into Nova channel ${channelId} for ${stepType} ${targetId} (response aborted during shutdown — message delivered)`);
    } else {
      entry.status = 'failed';
      entry.error = errMsg;
      log('WARN', `Failed to inject ${exitLabel} into Nova channel ${channelId}: ${errMsg}`);
      await discord(config, 'CRITICAL', `Nova injection FAILED: ${targetId}`, `Cronjob could not inject Nova into Discord for ${stepType} ${targetId}. Manual intervention required.`, [
        { name: 'Exit', value: exitLabel },
        { name: 'Channel', value: channelId },
        { name: 'Target', value: `${stepType}:${targetId}` },
        { name: 'Error', value: errMsg.slice(0, 200) },
      ]);
    }
  } finally {
    appendInjectionLog();
  }
}
