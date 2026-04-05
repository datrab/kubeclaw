// services/polling.js — Polling engine and dual-channel Redis+Git polling

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { statusPath, completionStreamKey, validateSafePath } from '../core/paths.js';
import { loadStatus, saveStatus, addHistory } from './status-store.js';
import { getAcpMonitorState, getAcpMonitorConfig, readAcpTranscriptState, publishTranscriptDelta } from '../agents/acp-monitor.js';
import { emitTranscriptLine, emitAgentProgress } from './telemetry.js';
import { getTrackedAgent } from '../agents/shutdown.js';
import { gatewayInvoke } from '../integrations/gateway.js';
import { withRateLimitRecovery } from './rate-limit.js';
import { gitPullForPolling, headHash, invalidateHeadHash, gitExec } from '../integrations/git.js';

const STATUS = {
  PENDING:           'PENDING',
  IN_PROGRESS:       'IN_PROGRESS',
  READY_FOR_TESTING: 'READY_FOR_TESTING',
  TESTING:           'TESTING',
  PASS:              'PASS',
  FAIL:              'FAIL',
  BLOCKED:           'BLOCKED',
  RATE_LIMITED:      'RATE_LIMITED',
};

// ─── Primitives ───────────────────────────────────────────────────────────────

export function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
export function pollResult(ok, reason, status = null) {
  return { ok, reason, status };
}

function syncRepoForPolling(config, label = 'poll') {
  if (!config?.repo_root) return { ok: true, skipped: true, reason: 'no_repo_root' };
  try {
    const result = gitPullForPolling(config) || { ok: true };
    if (result.skipped) {
      log('DEBUG', `[${label}] Git pull skipped (${result.reason || 'skipped'})`);
    } else if (result.ok === false) {
      const error = {
        code: 'POLLING_GIT_PULL_FAILED',
        message: result.reason || result.details || 'git pull failed during polling',
        details: result,
      };
      log('WARN', `[${label}] Polling git pull failed: ${error.message}`);
      return { ok: false, error };
    }
    return { ok: true, result };
  } catch (e) {
    const error = {
      code: e.code || 'POLLING_GIT_FAILED',
      message: e.message?.split('\n')[0] || 'git pull failed during polling',
      details: e.pollingGit || null,
    };
    log('ERROR', `[${label}] ${error.message}`);
    return { ok: false, error };
  }
}

// ─── Generic Polling Engine ───────────────────────────────────────────────────

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
export async function pollGeneric(config, checkFn, timeoutMinutes, label = 'poll') {
  const interval = config.poll_interval_seconds * 1000;
  let deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  let consecutiveParseFailures = 0;
  const maxParseFailures = 10;
  log('INFO', `[${label}] Polling every ${config.poll_interval_seconds}s | timeout: ${timeoutMinutes}min`);

  while (Date.now() < deadline) {
    await sleep(interval);
    const gitSync = syncRepoForPolling(config, label);
    if (!gitSync.ok) return pollResult(false, 'git_error', gitSync.error);

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

// ─── File Poller ──────────────────────────────────────────────────────────────

/**
 * Simple file-existence poller built on pollGeneric.
 * Used by gates where the only completion signal is a file appearing on disk.
 *
 * @returns {PollResult} - ok=true if file found, ok=false on timeout
 */
export async function pollForFile(config, filePath, timeoutMinutes, label = 'file-poll', sessionLabel = null) {
  let acpState = {};

  return pollGeneric(config, async () => {
    // Signal A: Output file exists → success (always wins)
    if (fs.existsSync(filePath)) {
      return { done: true, result: pollResult(true, 'target_reached', { file: filePath }) };
    }

    // Signal B: ACP transcript / session terminal state without file → fail fast
    if (sessionLabel) {
      acpState = await getAcpMonitorState(config, sessionLabel, acpState);

      if (acpState.rateLimited) {
        log('WARN', `[${label}] ACP monitor detected rate limit: ${acpState.detail}`);
        return { rate_limited: true, status: { module_id: label, current_phase: 'review', reason: acpState.detail } };
      }

      if (acpState.terminal) {
        log('WARN', `[${label}] ACP monitor terminal (${acpState.reason}): ${acpState.detail}`);
        return { done: true, result: pollResult(false, 'session_ended_no_output', { state: acpState.sessionState, reason: acpState.reason, detail: acpState.detail }) };
      }

      return {
        done: false,
        logMsg: `session=${acpState.sessionState} unknown=${acpState.unknownPolls}/${getAcpMonitorConfig(config).unknown_poll_limit} transcript_stale=${acpState.transcriptStalePolls}/${getAcpMonitorConfig(config).stale_poll_limit}`,
      };
    }

    return { done: false };
  }, timeoutMinutes, label);
}

// ─── Status Poller ────────────────────────────────────────────────────────────

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
export async function pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, opts = {}) {
  const { sessionLabel, headBefore } = opts;
  let acpState = {};

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

    // ── Channel 2: ACP transcript/session terminal state (fail-fast on crash) ──
    if (sessionLabel) {
      acpState = await getAcpMonitorState(config, sessionLabel, acpState);

      if (acpState.rateLimited) {
        const currentStatus = status || loadStatus(config, moduleDir) || { module_id: moduleDir, current_phase: 'forge' };
        currentStatus.status = STATUS.RATE_LIMITED;
        currentStatus.current_phase ||= 'forge';
        currentStatus.rate_limit_reason = acpState.detail;
        return { rate_limited: true, status: currentStatus };
      }

      if (acpState.terminal) {
        // Session died — check if HEAD moved (agent pushed before crashing)
        const gitSync = syncRepoForPolling(config, moduleDir);
        if (!gitSync.ok) {
          return { done: true, result: pollResult(false, 'git_error', gitSync.error) };
        }
        invalidateHeadHash();
        const headNow = headHash();
        if (headBefore && headNow !== headBefore) {
          log('INFO', `Session ${acpState.sessionState} but HEAD moved (${headBefore} → ${headNow}) — auto-advancing to READY_FOR_TESTING`);
          const currentStatus = loadStatus(config, moduleDir);
          if (currentStatus && currentStatus.status !== STATUS.READY_FOR_TESTING) {
            addHistory(currentStatus, STATUS.READY_FOR_TESTING, 'pipeline', `Session ${acpState.sessionState}, HEAD moved — auto-advanced`);
            currentStatus.status = STATUS.READY_FOR_TESTING;
            saveStatus(config, moduleDir, currentStatus);
          }
          return { done: true, result: pollResult(true, 'target_reached', currentStatus || status) };
        }
        log('WARN', `Session ${acpState.sessionState} without HEAD movement — agent crashed or made no changes (${acpState.reason})`);
        return { done: true, result: pollResult(false, 'session_ended_no_changes', status) };
      }
    }

    const logStatus = status?.status || 'no-status-file';
    const logPhase = status?.current_phase || '';
    return { done: false, logMsg: `status=${logStatus} phase=${logPhase}` };
  }, timeoutMinutes, moduleDir);
}

// ─── Session End Poller ───────────────────────────────────────────────────────

/**
 * @param {object} config
 * @param {string} sessionLabel - ACP session label (used to look up childSessionKey)
 * @param {number} timeoutMinutes - Max wait time
 * @param {string} logLabel - For progress messages (e.g. "gatefix-final-test-1")
 * @returns {{ completed: boolean, hasChanges: boolean, reason: string, transcript: object|null }}
 */
export async function pollForSessionEnd(config, sessionLabel, timeoutMinutes, logLabel = 'session-poll') {
  let acpState = {};
  const interval = config.poll_interval_seconds * 1000;
  let deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  const nudgeThreshold = config.session_nudge_threshold ?? 0.75;
  let nudgeSent = false;
  const _monCfg = getAcpMonitorConfig(config);
  let _transcriptExtensions = 0;
  const _maxTranscriptExtensions = _monCfg.max_transcript_extensions;
  const _transcriptGraceMs = _monCfg.transcript_grace_ms;

  // Resolve sessionKey from label
  const _trackedEntry = getTrackedAgent(sessionLabel);
  const sessionKey = _trackedEntry?.sessionKey;
  if (!sessionKey) {
    log('ERROR', `[${logLabel}] No sessionKey for label '${sessionLabel}' — cannot poll`);
    return { completed: false, hasChanges: false, reason: 'no_session_key' };
  }

  // Telemetry context and transcript streaming setup
  const _streamLogPath = _trackedEntry?.streamLogPath || null;
  const _moduleId = _trackedEntry?.moduleId || logLabel || sessionLabel;
  const _isSubagent = _trackedEntry?.runtime === 'subagent';
  const _ctx = { config };
  let _lastProgressEmit = startTime;
  const PROGRESS_INTERVAL_MS = 30000;

  // Mirror subagent transcript to .swarm/logs after session completes (non-critical).
  // For ACP sessions _streamLogPath is an ephemeral .acp-stream.jsonl; for subagents
  // it's the full session transcript — worth preserving alongside other pipeline logs.
  function _mirrorSubagentTranscript() {
    if (!_isSubagent || !_streamLogPath || !config._logDir) return;
    try {
      if (!fs.existsSync(_streamLogPath)) return;
      const destDir = path.join(config._logDir, 'modules', _moduleId);
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, 'subagent-transcript.jsonl');
      fs.copyFileSync(_streamLogPath, dest);
      log('OK', `[${logLabel}] Subagent transcript mirrored → ${dest}`);
    } catch (e) {
      log('DEBUG', `[${logLabel}] Transcript mirror failed (non-critical): ${e.message?.split('\n')[0]}`);
    }
  }

  // Capture HEAD before Forge starts — used for change detection
  const headBefore = headHash();

  // Two completion signals (first one wins):
  //   1. HEAD movement + grace period — agent pushed commits, wait for more, then done
  //   2. Session closed/error — agent finished (with or without pushing)
  //
  // 'idle' is intentionally NOT treated as a completion signal — it's ambiguous
  // with oneshot sessions (can mean initializing, between tool calls, or finished).
  // Only 'closed' and 'error' are unambiguous end states.

  const POST_CHANGE_GRACE_MS = 60000; // 60s of no new changes after HEAD moves = done
  let lastHeadChangeTime = 0;
  let lastKnownHead = headBefore;       // Track the last HEAD we've seen (for multi-commit detection)
  let sessionEndDetected = false;        // Set when session_status reports closed/error
  let sessionEndGraceStart = 0;          // When we first detected session end

  // After session closes, allow a short grace for the final git push to arrive.
  // ACP sessions sometimes close before the push completes on the remote.
  const SESSION_END_GRACE_MS = 15000;

  log('INFO', `[${logLabel}] Waiting for session '${sessionLabel}' (${sessionKey}) to complete | timeout: ${timeoutMinutes}min`);

  _transcriptExtensionLoop: while (true) { // outer loop handles transcript-based deadline extensions
  while (Date.now() < deadline) {
    await sleep(interval);
    const gitSync = syncRepoForPolling(config, logLabel);
    if (!gitSync.ok) {
      return { completed: false, hasChanges: false, reason: 'git_error', error: gitSync.error };
    }

    // Check if HEAD moved (agent pushed commits)
    invalidateHeadHash();
    const headNow = headHash();

    if (headNow !== lastKnownHead) {
      lastHeadChangeTime = Date.now();
      lastKnownHead = headNow;
      log('INFO', `[${logLabel}] HEAD moved (${headNow}) — agent pushed changes. Waiting ${POST_CHANGE_GRACE_MS / 1000}s grace for more...`);
    }

    // ── Signal 1: HEAD moved and grace period expired ──
    if (lastHeadChangeTime > 0 && (Date.now() - lastHeadChangeTime) >= POST_CHANGE_GRACE_MS) {
      log('INFO', `[${logLabel}] No new changes for ${POST_CHANGE_GRACE_MS / 1000}s after HEAD movement — session complete`);

      // Commit any remaining uncommitted changes
      let hasChanges = true;
      try {
        gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });
        const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
        if (porcelain) {
          gitExec(config.repo_root, ['commit', '-m', `[pipeline] ${logLabel}: agent output`], { stdio: 'ignore' });
          invalidateHeadHash();
          log('OK', `[${logLabel}] Committed remaining uncommitted files`);
        }
      } catch (e) {
        log('DEBUG', `[${logLabel}] Post-session commit: ${e.message?.split('\n')[0]}`);
      }

      _mirrorSubagentTranscript();
      return { completed: true, hasChanges, reason: 'session_ended', transcript: acpState.transcript || null };
    }

    // ── Signal 2: Session closed/error (ACP session no longer running) ──
    // Check session_status every cycle. 'closed' or 'error' = session is done.
    // If HEAD also moved, return hasChanges=true. If not, the agent completed
    // without pushing (crash, or no changes made).
    if (!sessionEndDetected) {
      const _prevTxOffset = acpState.transcript?.offset ?? 0;
      acpState = await getAcpMonitorState(config, sessionLabel, acpState);

      // Transcript streaming: publish new lines (fire-and-forget)
      const _currTxOffset = acpState.transcript?.offset ?? 0;
      if (_currTxOffset > _prevTxOffset && _streamLogPath) {
        Promise.resolve().then(() => {
          try {
            const allLines = fs.readFileSync(_streamLogPath, 'utf8').split('\n').filter(Boolean);
            const newLines = allLines.slice(_prevTxOffset, _currTxOffset);
            if (newLines.length > 0) publishTranscriptDelta(_ctx, sessionLabel, _moduleId, newLines, emitTranscriptLine);
          } catch { /* non-critical */ }
        }).catch(() => {});
      }

      // Agent progress every 30s
      if (Date.now() - _lastProgressEmit >= PROGRESS_INTERVAL_MS) {
        const _agentType = sessionLabel.split('-')[0] || 'forge';
        emitAgentProgress(_ctx, {
          agent_type: _agentType,
          label: sessionLabel,
          module_id: _moduleId,
          elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
          transcript_events: acpState.transcript?.eventCount ?? null,
          last_activity: acpState.transcript?.lastDetail || null,
          status: 'active',
        });
        _lastProgressEmit = Date.now();
      }

      if (acpState.rateLimited) {
        log('WARN', `[${logLabel}] ACP monitor detected rate limit: ${acpState.detail}`);
        return { completed: false, hasChanges: false, reason: 'rate_limited' };
      }

      if (acpState.terminal) {
        sessionEndDetected = true;
        sessionEndGraceStart = Date.now();
        log('INFO', `[${logLabel}] Session ${acpState.sessionState} (${acpState.reason}) — waiting ${SESSION_END_GRACE_MS / 1000}s for final push to arrive`);
      }
    }

    // Session ended + grace expired → done (even without HEAD movement)
    if (sessionEndDetected && (Date.now() - sessionEndGraceStart) >= SESSION_END_GRACE_MS) {
      // One final git pull to catch any last-second push
      const finalGitSync = syncRepoForPolling(config, logLabel);
      if (!finalGitSync.ok) {
        return { completed: false, hasChanges: false, reason: 'git_error', error: finalGitSync.error };
      }
      invalidateHeadHash();
      const finalHead = headHash();
      const hasChanges = finalHead !== headBefore;

      if (hasChanges) {
        log('OK', `[${logLabel}] Session closed with changes (HEAD: ${headBefore} → ${finalHead})`);
      } else {
        log('WARN', `[${logLabel}] Session closed without pushing changes — agent may have crashed or made no edits`);
      }

      // Commit any uncommitted local changes (defensive)
      try {
        gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });
        const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
        if (porcelain) {
          gitExec(config.repo_root, ['commit', '-m', `[pipeline] ${logLabel}: agent output (session closed)`], { stdio: 'ignore' });
          invalidateHeadHash();
        }
      } catch { /* ok */ }

      _mirrorSubagentTranscript();
      return { completed: true, hasChanges, reason: hasChanges ? 'session_ended' : 'session_closed_no_changes', transcript: acpState.transcript || null };
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
    log('INFO', `[${logLabel}] Session active | ${elapsed}s elapsed, ${remaining}s remaining${sessionEndDetected ? ' (session closed, waiting for push)' : ''}`);
  }

  // Inner while loop exited (deadline reached) — check transcript before giving up
  if (!sessionEndDetected && _transcriptExtensions < _maxTranscriptExtensions) {
    const _tsTracked = getTrackedAgent(sessionLabel);
    const _tsState = readAcpTranscriptState(_tsTracked?.streamLogPath, acpState.transcript || {});
    if (_tsState.lastActivityPoll === 0 && _tsState.eventCount > 0) {
      _transcriptExtensions++;
      deadline = Date.now() + _transcriptGraceMs;
      log('WARN', `[${logLabel}] Transcript active (${_tsState.eventCount} events) — extending deadline by ${_transcriptGraceMs / 1000}s (extension ${_transcriptExtensions}/${_maxTranscriptExtensions})`);
      continue _transcriptExtensionLoop;
    }
  }
  break _transcriptExtensionLoop;
  } // end _transcriptExtensionLoop

  const _finalTranscript = acpState.transcript || null;
  const _transcriptDesc = _finalTranscript
    ? (_finalTranscript.lastActivityPoll === 0
        ? `active (${_finalTranscript.eventCount} events)`
        : `stale (no activity for ${_finalTranscript.lastActivityPoll} polls)`)
    : 'unknown';
  log('WARN', `[${logLabel}] Timeout — session still running after ${timeoutMinutes}min | Transcript: ${_transcriptDesc}`);
  return { completed: false, hasChanges: false, reason: 'timeout', transcript: _finalTranscript };
}

// ─── Redis Completion Reader ──────────────────────────────────────────────────
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

    // Set log callback for Redis operation tracing → pipeline/redis.jsonl
    if (_redisModule?.setLogCallback && config._logDir) {
      const redisLogPath = path.join(config._logDir, 'pipeline', 'redis.jsonl');
      _redisModule.setLogCallback((event) => {
        try { fs.appendFileSync(redisLogPath, JSON.stringify(event) + '\n'); } catch { /* non-critical */ }
      });
    }
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
export async function archiveModuleCompletions(config, moduleId) {
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

export async function readCompletionFromRedis(config, moduleId) {
  const stream = completionStreamKey(config);
  try {
    const redisMod = await getRedisModule(config);
    if (!redisMod) return null;
    return await redisMod.readCompletion(stream, moduleId);
  } catch (e) {
    log('DEBUG', `Redis completion read failed for ${moduleId}: ${e.message}`);
    return null;
  }
}

// ─── Dual-Channel Polling (Redis + Git) ──────────────────────────────────────
// Checks BOTH the Redis completion stream (fast path, seconds) and
// Git-polled status.json (fallback, 30s intervals). First signal wins.
//
// This replaces pollStatus for the Buster phase only. Forge phase
// continues to use pure Git polling (Forge is ACP, no Redis signal).
// Built on pollGeneric — gitPullForPolling is handled by the scaffolding.

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

export async function pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes) {
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

// ─── Rate-Limit Recovery Wrappers ─────────────────────────────────────────────

/** Forge-phase rate-limit recovery (wraps pollStatus). */
export async function pollWithRateLimitRecovery(config, moduleDir, expectedStatuses, timeoutMinutes, opts = {}) {
  return withRateLimitRecovery(config, moduleDir,
    () => pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, opts));
}

/** Buster-phase rate-limit recovery (wraps pollDual). */
export async function pollDualWithRateLimitRecovery(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes) {
  return withRateLimitRecovery(config, moduleDir,
    () => pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes));
}
