// ═══════════════════════════════════════════════════════════════
// Buster Orchestrator — Task Processing & Session Monitor
// ═══════════════════════════════════════════════════════════════
//
// Two main responsibilities:
//
//  1. processTask(payload) — Full task lifecycle:
//       dequeue → pre-cleanup → git-sync → suites → decision →
//       [spawn → monitor] → final-cleanup → task_completed
//     Telemetry events are emitted at every step. A try/finally
//     ensures buster.task_completed fires on ALL exit paths.
//
//  2. monitorSession(childSessionKey, streamLogPath, payload, tctx)
//     — Poll loop that emits buster.session_monitor, agent.transcript,
//     and rate_limit.detected per cycle.
//
// ACP session monitoring is delegated to ./agents/acp-monitor.js.
// Session spawn/kill is handled by ./agents/lifecycle.js.
// Telemetry is provided by ./services/telemetry.js.
// Structured logging is provided by ./services/logger.js.

import { execFileSync } from 'child_process';
import { join } from 'path';
import { gitSync, getRepoRoot } from './services/git.js';

import {
  getAcpMonitorConfig,
  getAcpMonitorState,
  isSessionTerminal,
  waitForSessionIdle,
  readAcpTranscriptState,
} from './agents/acp-monitor.js';

import {
  spawnSession,
  killSession,
  killActiveSession,
  getActiveSession,
  clearActiveSession,
} from './agents/lifecycle.js';

import {
  createTelemetryContext,
  emitEvent,
  closeTelemetry,
} from './services/telemetry.js';

import { runSuites } from './suite-runner.js';

import {
  createRateLimitState,
  handleRateLimit,
  shouldRetryAfterRateLimit,
} from './services/rate-limit.js';

import { createLogger } from './services/logger.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── Global state ──────────────────────────────────────────────────

const STATE = {
  lastRunLogDir: null,
};

// ── Discord ───────────────────────────────────────────────────────

/**
 * Send a Discord embed via webhook. Fire-and-forget — never throws.
 * @param {object} embed - Discord embed object (from builder functions below)
 */
function discord(embed) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const body = JSON.stringify({ embeds: [embed] });
    execFileSync('curl', ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', body, webhookUrl], {
      stdio:   'ignore',
      timeout: 10000,
    });
  } catch {
    // Fire-and-forget — Discord delivery failure must not block orchestration.
  }
}

// ── Discord Embed Builders (pure — return object, don't call fetch) ─

const EMBED_FOOTER = { text: 'Buster Orchestrator v2.0' };

/**
 * Build a suite results embed (GO / NO-GO style with inline findings).
 */
export function buildSuiteResultsEmbed(moduleId, project, suitesInfo) {
  const { suiteSummary, criticalFailed, results = [] } = suitesInfo;
  const pass      = !criticalFailed;
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const fields = [
    { name: 'Status',  value: pass ? 'GO' : 'NO-GO',   inline: true },
    { name: 'Module',  value: String(moduleId),         inline: true },
    { name: 'Project', value: String(project || '—'),   inline: true },
    { name: 'Passed',  value: String(passCount),        inline: true },
    { name: 'Failed',  value: String(failCount),        inline: true },
  ];
  if (suiteSummary) {
    fields.push({ name: 'Summary', value: String(suiteSummary).slice(0, 1024), inline: false });
  }
  return {
    title:     pass ? `✅ Suite Results: GO — ${moduleId}` : `🚫 Suite Results: NO-GO — ${moduleId}`,
    color:     pass ? 5763719 : 15158332,
    fields,
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a session spawn embed (green, includes runtime type).
 */
export function buildSessionSpawnEmbed(moduleId, project, sessionData) {
  return {
    title:  `🚀 Session Spawned: ${moduleId}`,
    color:  5763719, // green
    fields: [
      { name: 'Status',  value: 'Spawned',                                  inline: true },
      { name: 'Module',  value: String(moduleId),                            inline: true },
      { name: 'Project', value: String(project || '—'),                      inline: true },
      { name: 'Runtime', value: String(sessionData.runtime || 'ACP'),        inline: true },
      { name: 'Session', value: String(sessionData.childSessionKey || '—'),  inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a session complete embed (green for PASS, red for FAIL/TIMEOUT).
 * Includes commit hash and duration.
 */
export function buildSessionCompleteEmbed(moduleId, project, { outcome, reason, commitHash, durationSeconds, childSessionKey }) {
  const pass = outcome === 'PASS';
  return {
    title:  pass
      ? `✅ Session Complete: PASS — ${moduleId}`
      : `❌ Session Complete: ${outcome} — ${moduleId}`,
    color:  pass ? 5763719 : 15158332,
    fields: [
      { name: 'Status',   value: String(outcome),               inline: true },
      { name: 'Module',   value: String(moduleId),              inline: true },
      { name: 'Project',  value: String(project || '—'),        inline: true },
      { name: 'Duration', value: `${durationSeconds}s`,         inline: true },
      { name: 'Commit',   value: String(commitHash || '—'),     inline: true },
      { name: 'Reason',   value: String(reason || '—'),         inline: true },
      { name: 'Session',  value: String(childSessionKey || '—'), inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a timeout embed (red, shows elapsed vs timeout comparison).
 */
export function buildTimeoutEmbed(moduleId, project, { elapsedSeconds, timeoutSeconds, childSessionKey }) {
  return {
    title:  `⏱️ Session Timeout: ${moduleId}`,
    color:  15158332, // red
    fields: [
      { name: 'Status',   value: 'TIMEOUT',                        inline: true },
      { name: 'Module',   value: String(moduleId),                  inline: true },
      { name: 'Project',  value: String(project || '—'),            inline: true },
      { name: 'Elapsed',  value: `${elapsedSeconds}s`,             inline: true },
      { name: 'Timeout',  value: `${timeoutSeconds}s`,             inline: true },
      { name: 'Session',  value: String(childSessionKey || '—'),   inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

// ── Stub infrastructure helpers ───────────────────────────────────
//
// doSandboxCleanup is a stub to be replaced by a future module.

async function doSandboxCleanup(stage, payload) {
  // Stub: no-op cleanup. Real implementation added by a future module.
  return { ok: true, duration_seconds: 0 };
}

// ── Task Processing ───────────────────────────────────────────────

/**
 * Process a single buster task from start to finish with telemetry.
 *
 * Emits buster.task_started at the top and buster.task_completed at the
 * end (via try/finally) regardless of exit path. All intermediate events
 * (sandbox_cleanup, git_sync, suite events, decision, agent events) are
 * emitted at the corresponding orchestration steps.
 *
 * @param {object} payload   - Task payload from the Redis task stream
 * @param {object} [opts]
 * @param {boolean} [opts.telemetryEnabled]  - Override telemetry enable flag
 * @returns {Promise<{ outcome: string, reason: string }>}
 */
export async function processTask(payload, opts = {}) {
  const moduleId   = payload?.module_id  || 'unknown';
  const taskType   = payload?.task_type  || 'module_test';
  const attempt    = payload?.attempt    ?? 1;
  const suites     = payload?.suites     || [];
  const serveType  = payload?.serve_type || null;
  const commitHash = payload?.commit_hash || null;
  const project    = payload?.project    || process.env.BUSTER_PROJECT || '';
  const runId      = payload?.run_id     || `buster-${moduleId}-${Date.now()}`;

  // ── Log directory ─────────────────────────────────────────────
  // payload.log_dir overrides the default run-scoped layout.
  const logBaseDir = payload?.log_dir ||
    join('.swarm', 'logs', 'buster', moduleId, `attempt-${attempt}`);
  STATE.lastRunLogDir = logBaseDir;

  // ── Structured logger (dual-write: stdout + JSONL) ────────────
  const logger = createLogger({
    logPath:  join(logBaseDir, 'orchestrator.jsonl'),
    module:   moduleId,
    taskType,
  });

  // Stream key override from payload
  const streamKey = payload?.telemetry_stream || undefined;

  const tctx = createTelemetryContext({
    project,
    module:  moduleId,
    runId,
    streamKey,
    enabled: opts.telemetryEnabled,
  });

  const taskStartMs = Date.now();

  let outcome    = 'FAIL';
  let reason     = 'unknown';
  let suitesInfo = { results: [], suiteSummary: '', criticalFailed: false };

  // ── Task started ────────────────────────────────────────────────
  logger.step('task-started');
  logger.info('TASK', `Starting task: module=${moduleId} attempt=${attempt} taskType=${taskType}`, {
    suites, serveType, commitHash,
  });

  await emitEvent(tctx, 'buster.task_started', {
    module_id:   moduleId,
    task_type:   taskType,
    attempt,
    suites,
    serve_type:  serveType,
    commit_hash: commitHash,
  });

  try {
    // ── Pre-cleanup ───────────────────────────────────────────────
    logger.step('pre-cleanup');

    const preCleanupStart = Date.now();
    await emitEvent(tctx, 'buster.sandbox_cleanup', {
      module_id:        moduleId,
      stage:            'pre',
      phase:            'started',
      duration_seconds: null,
      ok:               null,
    });

    const preCleanup = await doSandboxCleanup('pre', payload);

    await emitEvent(tctx, 'buster.sandbox_cleanup', {
      module_id:        moduleId,
      stage:            'pre',
      phase:            'completed',
      duration_seconds: Math.round((Date.now() - preCleanupStart) / 1000),
      ok:               preCleanup.ok,
    });

    logger.info('SANDBOX', `Pre-cleanup complete`, { ok: preCleanup.ok });

    // ── Git sync ──────────────────────────────────────────────────
    logger.step('git-sync');

    const repoRoot = getRepoRoot();
    const actualHash = await gitSync(repoRoot, commitHash, { logger });
    const syncResult = {
      ok:          actualHash !== null,
      mode:        commitHash ? 'deterministic' : 'fast-forward',
      commit_hash: actualHash || commitHash,
      error:       actualHash === null ? 'git_sync_failed' : null,
    };

    await emitEvent(tctx, 'buster.git_sync', {
      module_id:   moduleId,
      mode:        syncResult.mode,
      commit_hash: syncResult.commit_hash,
      ok:          syncResult.ok,
      error:       syncResult.error,
    });

    logger.info('GIT', `Git sync complete`, {
      ok: syncResult.ok, mode: syncResult.mode, commit_hash: syncResult.commit_hash,
    });

    if (!syncResult.ok) {
      outcome = 'FAIL';
      reason  = `git_sync_failed: ${syncResult.error || 'unknown'}`;
      logger.error('GIT', `Git sync failed: ${syncResult.error}`);
      return { outcome, reason };
    }

    // ── Run suites ────────────────────────────────────────────────
    logger.step('run-suites');

    suitesInfo = await runSuites(suites, {
      payload,
      moduleId,
      attempt,
      telemetryContext: tctx,
      logDir: logBaseDir,
    });

    logger.info('SUITES', `Suites complete: ${suitesInfo.suiteSummary}`, {
      criticalFailed: suitesInfo.criticalFailed,
    });

    // ── Decision ──────────────────────────────────────────────────
    logger.step('decision');

    const recommendation = suitesInfo.criticalFailed ? 'NO_SPAWN' : 'SPAWN';
    const decisionReason = suitesInfo.criticalFailed
      ? 'critical suite failure'
      : 'all critical suites passed';

    await emitEvent(tctx, 'buster.decision', {
      module_id:      moduleId,
      recommendation,
      reason:         decisionReason,
      suite_summary:  suitesInfo.suiteSummary,
    });

    logger.info('DECISION', `${recommendation} — ${decisionReason}`);
    discord(buildSuiteResultsEmbed(moduleId, project, suitesInfo));

    if (suitesInfo.criticalFailed) {
      outcome = 'FAIL';
      reason  = 'NO_SUBAGENT: critical suite failure';
      return { outcome, reason };
    }

    // ── Spawn subagent ────────────────────────────────────────────
    logger.step('spawn-session');

    const timeoutSeconds = payload?.timeout_seconds || 1800;
    const model          = payload?.session?.model  || 'anthropic/claude-sonnet-4-6';
    const prompt         = payload?.prompt          || '';

    let sessionData;
    try {
      sessionData = await spawnSession(payload, prompt, timeoutSeconds);
    } catch (err) {
      logger.error('SPAWN', `Spawn failed: ${err.message}`);
      outcome = 'FAIL';
      reason  = `spawn_failed: ${err.message}`;
      return { outcome, reason };
    }

    await emitEvent(tctx, 'agent.spawned', {
      module_id:         moduleId,
      agent:             'buster',
      child_session_key: sessionData.childSessionKey,
      run_id:            sessionData.runId,
      runtime:           sessionData.runtime,
      model,
      timeout_seconds:   timeoutSeconds,
    });

    logger.info('SPAWN', `Session spawned: ${sessionData.childSessionKey}`, {
      runtime: sessionData.runtime,
    });
    discord(buildSessionSpawnEmbed(moduleId, project, sessionData));

    // ── Monitor session ───────────────────────────────────────────
    logger.step('monitor-session');

    const monitorStart  = Date.now();
    const sessionResult = await monitorSession(
      sessionData.childSessionKey,
      sessionData.streamLogPath,
      payload,
      tctx,
      { moduleId, spawnedAt: monitorStart, logger },
    );

    const elapsedSeconds = Math.round((Date.now() - monitorStart) / 1000);

    // ── Kill session ──────────────────────────────────────────────
    logger.step('kill-session');

    await killSession(sessionData.childSessionKey, {
      runtime: sessionData.runtime,
      agentId: sessionData.agentId,
      label:   sessionData.label,
    });
    clearActiveSession();

    await emitEvent(tctx, 'agent.killed', {
      module_id:         moduleId,
      agent:             'buster',
      child_session_key: sessionData.childSessionKey,
      reason:            sessionResult.reason,
      elapsed_seconds:   elapsedSeconds,
    });

    logger.info('SESSION', `Session killed`, {
      reason: sessionResult.reason, elapsed: elapsedSeconds,
    });

    // ── Determine outcome ─────────────────────────────────────────
    logger.step('determine-outcome');

    if (sessionResult.reason === 'rate_limited') {
      outcome = 'RATE_LIMITED';
      reason  = `max_pauses_exceeded`;
    } else if (sessionResult.terminal) {
      // Terminal = completion received or transcript error
      outcome = (sessionResult.reason === 'session_terminal') ? 'PASS' : 'FAIL';
      reason  = sessionResult.reason || 'completion_received';
    } else {
      outcome = 'TIMEOUT';
      reason  = `session_timeout: ${timeoutSeconds}s exceeded`;
    }

    if (outcome === 'TIMEOUT') {
      discord(buildTimeoutEmbed(moduleId, project, {
        elapsedSeconds,
        timeoutSeconds,
        childSessionKey: sessionData.childSessionKey,
      }));
    } else {
      discord(buildSessionCompleteEmbed(moduleId, project, {
        outcome,
        reason,
        commitHash:      commitHash,
        durationSeconds: elapsedSeconds,
        childSessionKey: sessionData.childSessionKey,
      }));
    }

    logger.info('OUTCOME', `Task outcome: ${outcome}`, { reason });

    return { outcome, reason };

  } finally {
    // ── Final cleanup (always runs) ───────────────────────────────
    logger.step('final-cleanup');

    const finalCleanupStart = Date.now();
    await emitEvent(tctx, 'buster.sandbox_cleanup', {
      module_id:        moduleId,
      stage:            'final',
      phase:            'started',
      duration_seconds: null,
      ok:               null,
    });

    const finalCleanup = await doSandboxCleanup('final', payload);

    await emitEvent(tctx, 'buster.sandbox_cleanup', {
      module_id:        moduleId,
      stage:            'final',
      phase:            'completed',
      duration_seconds: Math.round((Date.now() - finalCleanupStart) / 1000),
      ok:               finalCleanup.ok,
    });

    // ── Task completed (always emitted) ───────────────────────────

    const totalDuration = Math.round((Date.now() - taskStartMs) / 1000);
    const passCount = suitesInfo.results.filter(r => r.status === 'PASS').length;
    const failCount = suitesInfo.results.filter(r => r.status === 'FAIL').length;
    const skipCount = suitesInfo.results.filter(r => r.status === 'SKIP').length;

    await emitEvent(tctx, 'buster.task_completed', {
      module_id:        moduleId,
      task_type:        taskType,
      attempt,
      outcome,
      reason,
      duration_seconds: totalDuration,
      suites_passed:    passCount,
      suites_failed:    failCount,
      suites_skipped:   skipCount,
      suite_summary:    suitesInfo.suiteSummary,
      spawned_subagent: outcome !== 'FAIL' || reason.startsWith('NO_SUBAGENT') === false,
    });

    logger.info('TASK', `Task completed: outcome=${outcome} reason=${reason} duration=${totalDuration}s`);
    logger.flush();

    await closeTelemetry(tctx);
  }
}

// ── Session Monitor ───────────────────────────────────────────────

/**
 * Monitor a child ACP session until it reaches a terminal state or
 * the configured timeout is exceeded.
 *
 * Enhanced with telemetry: emits buster.session_monitor at every poll
 * cycle, agent.transcript when new transcript lines appear (rate-limited
 * to max 5 events/second), and rate_limit.detected when a rate limit is
 * detected.
 *
 * @param {string}      childSessionKey  - ACP session key (from gateway spawn)
 * @param {string}      streamLogPath    - Path to the session's stream log (JSONL)
 * @param {object}      [payload={}]     - Task payload (may include acp_monitor overrides)
 * @param {object|null} [tctx=null]      - TelemetryContext (null = no telemetry)
 * @param {object}      [meta={}]        - Extra metadata: moduleId, spawnedAt, logger
 * @returns {{ terminal: boolean, reason: string|null, detail: string, state: object }}
 */
export async function monitorSession(childSessionKey, streamLogPath, payload = {}, tctx = null, meta = {}) {
  const cfg = getAcpMonitorConfig(payload.acp_monitor || {});
  const moduleId  = meta.moduleId  || payload?.module_id || 'unknown';
  const spawnedAt = meta.spawnedAt || Date.now();
  const logger    = meta.logger    || createLogger({ module: moduleId });

  const gatewayUrl   = process.env.GATEWAY_URL;
  const gatewayToken = process.env.GATEWAY_TOKEN;

  const opts = {
    gatewayUrl,
    gatewayToken,
    unknownPollLimit: cfg.unknownPollLimit,
    stalePollLimit:   cfg.stalePollLimit,
  };

  // ── Rate-limit recovery state ─────────────────────────────────
  const rlConfig = payload?.rate_limit || {};
  const rlState = createRateLimitState({
    maxPauses:        rlConfig.max_pauses          ?? payload?.acp_monitor?.max_rate_limit_pauses ?? 3,
    initialCooldownS: rlConfig.initial_cooldown_s  ?? 120,
    maxCooldownS:     rlConfig.max_cooldown_s       ?? 600,
  });

  let prev      = {};
  let pollCount = 0;

  // ── Transcript rate-limit state ───────────────────────────────
  // Max 5 agent.transcript events per second. Since poll interval
  // is 10 s by default, every poll with new lines typically qualifies.
  const TRANSCRIPT_MIN_INTERVAL_MS = 200; // 1000ms / 5 = 200ms
  let lastTranscriptEmitMs = 0;

  logger.info('MONITOR', `Monitoring session ${childSessionKey}`, {
    pollMs: cfg.monitorPollMs, unknownLimit: cfg.unknownPollLimit, staleLimit: cfg.stalePollLimit,
  });

  while (true) {
    const state = await getAcpMonitorState(childSessionKey, streamLogPath, prev, opts);
    pollCount++;

    const elapsedSeconds   = Math.round((Date.now() - spawnedAt) / 1000);
    const transcriptEvents = state.transcript?.eventCount ?? 0;

    logger.info('MONITOR', `Poll #${pollCount}`, {
      sessionState: state.sessionState,
      active:       state.sessionActive,
      stalePolls:   state.transcriptStalePolls,
      unknownPolls: state.unknownPolls,
      terminal:     state.terminal,
    });

    // ── buster.session_monitor — every poll ───────────────────────

    await emitEvent(tctx, 'buster.session_monitor', {
      module_id:         moduleId,
      child_session_key: childSessionKey,
      elapsed_seconds:   elapsedSeconds,
      acp_state:         state.sessionState,
      transcript_events: transcriptEvents,
      rate_limited:      state.rateLimited,
    });

    // ── agent.transcript — when new lines arrive (rate-limited) ───

    const prevOffset    = prev.transcript?.offset    ?? 0;
    const currentOffset = state.transcript?.offset   ?? 0;
    const newLineCount  = currentOffset - prevOffset;

    if (newLineCount > 0) {
      const nowMs = Date.now();
      if (nowMs - lastTranscriptEmitMs >= TRANSCRIPT_MIN_INTERVAL_MS) {
        lastTranscriptEmitMs = nowMs;
        // Sample: last detail from transcript (truncated)
        const sample = state.transcript?.lastDetail
          ? String(state.transcript.lastDetail).slice(0, 120)
          : null;

        await emitEvent(tctx, 'agent.transcript', {
          module_id:         moduleId,
          agent:             'buster',
          lines:             newLineCount,
          sample,
        });
      }
    }

    // ── rate_limit.detected ───────────────────────────────────────

    if (state.rateLimited) {
      await emitEvent(tctx, 'rate_limit.detected', {
        module_id:    moduleId,
        agent:        'buster',
        detail:       state.detail || 'rate limit detected',
        provider:     'anthropic',
        pause_number: rlState.pauseCount + 1,
        max_pauses:   rlState.maxPauses,
      });

      if (!shouldRetryAfterRateLimit(rlState)) {
        // Max pauses exhausted — kill the session.
        logger.warn('RATE-LIMIT', `Max pauses (${rlState.maxPauses}) exhausted for session ${childSessionKey}`);
        return {
          terminal: false,
          reason:   'rate_limited',
          detail:   state.detail,
          state,
        };
      }

      // Recovery: sleep, notify, check liveness.
      const recovery = await handleRateLimit(rlState, {
        childSessionKey,
        gatewayUrl,
        gatewayToken,
        telemetryCtx: tctx,
        moduleId,
        provider:     'anthropic',
      });

      if (recovery.action === 'resume') {
        logger.info('RATE-LIMIT', `Resuming after rate-limit recovery`, {
          pause: rlState.pauseCount, maxPauses: rlState.maxPauses,
        });
        // Reset rateLimited flag in prev so the next poll does not immediately
        // re-trigger on the same transcript entry.
        prev = {
          ...state,
          rateLimited: false,
          transcript:  state.transcript
            ? { ...state.transcript, rateLimited: false }
            : state.transcript,
        };
        // No sleep — go straight back to poll after cooldown already elapsed.
        continue;
      }

      // Session died during cooldown — report as rate_limited FAIL.
      logger.warn('RATE-LIMIT', `Session ${childSessionKey} died during rate-limit cooldown`);
      return {
        terminal: false,
        reason:   'rate_limited',
        detail:   state.detail,
        state,
      };
    }

    // ── Terminal check ────────────────────────────────────────────

    if (isSessionTerminal(state)) {
      logger.info('MONITOR', `Session terminal`, { reason: state.reason, detail: state.detail });
      return {
        terminal: true,
        reason:   state.reason,
        detail:   state.detail,
        state,
      };
    }

    prev = state;
    await sleep(cfg.monitorPollMs);
  }
}

// ── Exported helpers (re-exported for callers that need them) ────

export { waitForSessionIdle, getAcpMonitorConfig } from './agents/acp-monitor.js';
export { spawnSession, killSession, killActiveSession, getActiveSession, clearActiveSession } from './agents/lifecycle.js';
export { createTelemetryContext, emitEvent, closeTelemetry } from './services/telemetry.js';

// ── CLI: --status ─────────────────────────────────────────────────

if (process.argv[2] === '--status') {
  console.log(JSON.stringify({
    lastRunLogDir: STATE.lastRunLogDir,
  }, null, 2));
  process.exit(0);
}
