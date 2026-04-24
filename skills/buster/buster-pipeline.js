// ═══════════════════════════════════════════════════════════════
// Buster Pipeline — Task Processing & Session Monitor
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
//     explicit observability health edges, and delegates rate-limit
//     telemetry to the recovery layer.
//
// ACP session monitoring is delegated to the shared common ACP monitor helper.
// Session spawn/kill is handled by the shared common lifecycle helper.
// Telemetry is provided by ./pipeline/services/telemetry.js.
// Structured logging is provided by ./pipeline/services/logger.js.

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { join } from 'path';
import { hostname } from 'os';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
import { gitSync, getRepoRoot } from './pipeline/services/git.js';

import {
  spawnSession,
  killSession,
  killActiveSession,
  getActiveSession,
  clearActiveSession,
  recoverActiveSession,
} from '../common/pipeline/agents/lifecycle.js';

import { resolveGatewayHealthUrl, resolveGatewayInvokeUrl } from '../common/pipeline/integrations/gateway.js';

import {
  createTelemetryContext,
  emitEvent,
  closeTelemetry,
} from './pipeline/services/telemetry.js';

import { loadRedisCtor } from './pipeline/services/runtime.js';

import { runSuites } from './suite-runner.js';
import { createLogger } from './pipeline/services/logger.js';
import { sendDiscord } from './pipeline/services/discord.js';
import {
  resolveBusterActiveSessionPath,
  buildCompletionIdentityFields,
  resolveStatusJsonPath,
  markBusterActiveAgent,
  clearBusterActiveAgent,
  buildPreTestVerdict,
  buildSuiteResultsEmbed,
  buildSessionSpawnEmbed,
  buildSessionCompleteEmbed,
  buildTimeoutEmbed,
  buildTaskFailureEmbed,
  doSandboxCleanup,
} from './buster-pipeline-helpers.js';
import { monitorSession } from './buster-session-monitor.js';

export {
  buildSuiteResultsEmbed,
  buildSessionSpawnEmbed,
  buildSessionCompleteEmbed,
  buildTaskFailureEmbed,
  buildTimeoutEmbed,
} from './buster-pipeline-helpers.js';
export { monitorSession } from './buster-session-monitor.js';

// ── Global state ──────────────────────────────────────────────────

const STATE = {
  lastRunLogDir: null,
};

// ── Discord ───────────────────────────────────────────────────────

/**
 * Send a Discord webhook payload and persist a sanitized discord.jsonl artifact.
 * Accepts either a plain embed object or a richer payload with embeds/content/files.
 * @param {object} message
 * @param {object} [context]
 */
function discord(message, context = {}) {
  return sendDiscord(message, context);
}

function notifyTaskFailure(moduleId, project, result, context = {}) {
  discord(buildTaskFailureEmbed(moduleId, project, result), context);
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
  const gateId     = payload?.gate_id || (taskType === 'gate_test' ? moduleId : null);
  const attempt    = payload?.attempt    ?? 1;
  const suites     = payload?.suites     || [];
  const serveType  = payload?.serve_type || null;
  const commitHash = payload?.commit_hash || null;
  const project    = payload?.project    || process.env.BUSTER_PROJECT || '';
  const runId      = payload?.run_id     || `buster-${moduleId}-${Date.now()}`;
  const timeoutSeconds = payload?.timeout_seconds || payload?.session?.timeout_seconds || 1800;
  const statusJsonPath = resolveStatusJsonPath(payload);

  // ── Log directory ─────────────────────────────────────────────
  // payload.log_dir overrides the default run-scoped layout.
  const logBaseDir = payload?.log_dir ||
    join('.swarm', 'logs', 'buster', moduleId, `attempt-${attempt}`);
  STATE.lastRunLogDir = logBaseDir;

  // ── Structured logger (dual-write: stdout + JSONL) ────────────
  const logger = createLogger({
    logPath:  join(logBaseDir, 'buster-pipeline.jsonl'),
    module:   moduleId,
    taskType,
  });

  // Legacy compatibility hint from payload. The value does not rename the stream.
  const legacyTelemetryStream = payload?.telemetry_stream || undefined;

  const tctx = createTelemetryContext({
    project,
    module:  moduleId,
    runId,
    streamKey: legacyTelemetryStream,
    enabled: opts.telemetryEnabled,
    logDir: logBaseDir,
    pipelineLogPath: payload?.pipeline_log_path || null,
    pipelineRunLogPath: payload?.pipeline_run_log_path || null,
    attempt,
    dispatchId: dispatchIdForCompletion,
  });

  const taskStartMs = Date.now();

  let outcome    = 'FAIL';
  let reason     = 'unknown';
  let stage      = 'task-started';
  let spawnedSubagent = false;
  let suitesInfo = { results: [], suiteSummary: '', criticalFailed: false };
  let sessionKeyForCompletion = null;
  let dispatchIdForCompletion = payload?.dispatch_id || payload?.session?.label || null;
  const stageId = payload?.stage_id || (taskType === 'module_test' ? 'worker:module_buster' : (taskType === 'gate_test' ? 'gate:buster' : null));
  const workerType = payload?.worker_type || (taskType === 'module_test' ? 'module_buster' : null);

  const currentDiscordContext = (extra = {}) => ({
    moduleId,
    gateId: extra.gateId ?? gateId,
    project,
    runId,
    attempt,
    dispatchId: extra.dispatchId ?? dispatchIdForCompletion,
    sessionKey: extra.sessionKey ?? sessionKeyForCompletion,
    logDir: logBaseDir,
  });

  // ── Task started ────────────────────────────────────────────────
  logger.step('task-started');
  logger.info('TASK', `Starting task: module=${moduleId} attempt=${attempt} taskType=${taskType}`, {
    suites, serveType, commitHash, stageId, workerType,
  });

  await emitEvent(tctx, 'buster.task_started', {
    module_id:   moduleId,
    task_type:   taskType,
    stage_id:    stageId,
    worker_type: workerType,
    attempt,
    suites,
    serve_type:  serveType,
    commit_hash: commitHash,
  });

  try {
    // ── Pre-cleanup ───────────────────────────────────────────────
    stage = 'pre-cleanup';
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
    stage = 'git-sync';
    logger.step('git-sync');

    const repoRoot = getRepoRoot(payload?.session?.cwd || process.cwd());
    logger.info('GIT', `Resolved repo root: ${repoRoot}`);
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
      notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
      return { outcome, reason };
    }

    // ── Run suites ────────────────────────────────────────────────
    stage = 'run-suites';
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
    stage = 'decision';
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
    discord(buildSuiteResultsEmbed(moduleId, project, suitesInfo), currentDiscordContext());

    if (suitesInfo.criticalFailed) {
      outcome = 'FAIL';
      reason  = `NO_SUBAGENT: ${suitesInfo.suiteSummary || 'critical suite failure'}`;
      return { outcome, reason };
    }

    // ── Spawn subagent ────────────────────────────────────────────
    stage = 'spawn-session';
    logger.step('spawn-session');

    const model          = payload?.session?.model  || 'anthropic/claude-sonnet-4-6';
    const prompt         = payload?.prompt          || '';

    let sessionData;
    try {
      sessionData = await spawnSession(payload, prompt, timeoutSeconds, {
        activeStatePath: resolveBusterActiveSessionPath(payload?.session?.cwd || getRepoRoot()),
      });
    } catch (err) {
      logger.error('SPAWN', `Spawn failed: ${err.message}`);
      outcome = 'FAIL';
      reason  = `spawn_failed: ${err.message}`;
      notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
      return { outcome, reason };
    }

    await emitEvent(tctx, 'agent.spawned', {
      module_id:       moduleId,
      agent_type:      'buster',
      label:           sessionData.label,
      session_key:     sessionData.childSessionKey,
      runtime:         sessionData.runtime,
      model,
      timeout_seconds: timeoutSeconds,
    });

    logger.info('SPAWN', `Session spawned: ${sessionData.childSessionKey}`, {
      runtime: sessionData.runtime,
    });
    spawnedSubagent = true;
    sessionKeyForCompletion = sessionData.childSessionKey;
    dispatchIdForCompletion = dispatchIdForCompletion || sessionData.label;
    tctx.sessionKey = sessionData.childSessionKey;
    tctx.dispatchId = dispatchIdForCompletion;
    markBusterActiveAgent(statusJsonPath, payload, sessionData);
    const sessionSpawnData = {
      ...sessionData,
      taskType,
      timeoutSeconds,
    };
    discord(buildSessionSpawnEmbed(moduleId, project, sessionSpawnData), currentDiscordContext({
      dispatchId: dispatchIdForCompletion,
      sessionKey: sessionData.childSessionKey,
    }));

    // ── Monitor session ───────────────────────────────────────────
    stage = 'monitor-session';
    logger.step('monitor-session');

    const monitorStart  = Date.now();
    const sessionResult = await monitorSession(
      sessionData.childSessionKey,
      sessionData.streamLogPath,
      payload,
      tctx,
      { moduleId, spawnedAt: monitorStart, timeoutSeconds, logger },
    );

    const elapsedSeconds = Math.round((Date.now() - monitorStart) / 1000);

    // ── Kill session ──────────────────────────────────────────────
    stage = 'kill-session';
    logger.step('kill-session');

    let killResult = {
      requested: !!sessionResult.killIssued,
      confirmed: !!sessionResult.killConfirmed,
    };

    if (!sessionResult.killIssued || !sessionResult.killConfirmed) {
      killResult = await killSession(sessionData.childSessionKey, {
        runtime: sessionData.runtime,
        agentId: sessionData.agentId,
        label:   sessionData.label,
      });
    } else {
      logger.info('SESSION', `Timeout kill already requested by monitor`, {
        confirmed: sessionResult.killConfirmed,
      });
    }
    clearActiveSession({ preserveFile: !(killResult.confirmed || sessionResult.killConfirmed) });

    await emitEvent(tctx, 'agent.killed', {
      module_id:       moduleId,
      agent_type:      'buster',
      label:           sessionData.label,
      session_key:     sessionData.childSessionKey,
      reason:          sessionResult.reason,
      elapsed_seconds: elapsedSeconds,
    });

    logger.info('SESSION', `Session killed`, {
      reason: sessionResult.reason, elapsed: elapsedSeconds,
    });

    // ── Determine outcome ─────────────────────────────────────────
    stage = 'determine-outcome';
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
      reason  = sessionResult.reason || `session_timeout: ${timeoutSeconds}s exceeded`;
    }

    if (outcome === 'TIMEOUT') {
      discord(buildTimeoutEmbed(moduleId, project, {
        elapsedSeconds,
        timeoutSeconds,
        childSessionKey: sessionData.childSessionKey,
      }), currentDiscordContext({
        dispatchId: dispatchIdForCompletion,
        sessionKey: sessionData.childSessionKey,
      }));
    } else {
      const sessionCompleteData = {
        outcome,
        reason,
        commitHash,
        durationSeconds: elapsedSeconds,
        childSessionKey: sessionData.childSessionKey,
        summary: sessionResult?.detail || sessionResult?.reason || 'test',
        source: 'agent',
      };
      discord(buildSessionCompleteEmbed(moduleId, project, sessionCompleteData), currentDiscordContext({
        dispatchId: dispatchIdForCompletion,
        sessionKey: sessionData.childSessionKey,
      }));
    }

    logger.info('OUTCOME', `Task outcome: ${outcome}`, { reason });

    return { outcome, reason };

  } catch (err) {
    outcome = 'FAIL';
    reason  = `internal_error: ${err?.message || String(err)}`;
    logger.error('TASK', `Unhandled task failure at ${stage}: ${err?.stack || err?.message || String(err)}`);
    notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
    return { outcome, reason };

  } finally {
    // ── Final cleanup (always runs) ───────────────────────────────
    stage = 'final-cleanup';
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

    clearBusterActiveAgent(statusJsonPath, payload, {
      runId,
      attempt,
      dispatchId: dispatchIdForCompletion,
      sessionKey: sessionKeyForCompletion,
    });

    // ── Task completed (always emitted) ───────────────────────────

    const totalDuration = Math.round((Date.now() - taskStartMs) / 1000);
    const passCount = suitesInfo.results.filter(r => r.status === 'PASS').length;
    const failCount = suitesInfo.results.filter(r => r.status === 'FAIL').length;
    const errorCount = suitesInfo.results.filter(r => r.status === 'ERROR').length;
    const skipCount = suitesInfo.results.filter(r => r.status === 'SKIP').length;

    await emitEvent(tctx, 'buster.task_completed', {
      module_id:        moduleId,
      task_type:        taskType,
      stage_id:         stageId,
      worker_type:      workerType,
      attempt,
      outcome,
      reason,
      duration_seconds: totalDuration,
      suites_passed:    passCount,
      suites_failed:    failCount,
      suites_errored:   errorCount,
      suites_skipped:   skipCount,
      suite_summary:    suitesInfo.suiteSummary,
      spawned_subagent: spawnedSubagent,
    });

    logger.info('TASK', `Task completed: outcome=${outcome} reason=${reason} duration=${totalDuration}s`);

    // Send completion signal back to Nova pipeline via completion_stream.
    // Buster v2 uses telemetry for observability, but Nova still polls this
    // stream to unblock the dual-channel poller.
    if (payload?.completion_stream) {
      try {
        const redisClient = getRedisClient();
        const preTestVerdict = !spawnedSubagent
          ? buildPreTestVerdict(moduleId, project, suitesInfo)
          : null;
        const completionSummary = !spawnedSubagent && suitesInfo.suiteSummary
          ? suitesInfo.suiteSummary
          : (reason || suitesInfo.suiteSummary || '');
        await redisClient.xadd(
          payload.completion_stream, '*',
          'type', 'completion',
          'module', moduleId,
          'status', outcome === 'PASS' ? 'PASS' : 'FAIL',
          'outcome', outcome,
          'source', 'buster-pipeline',
          'reason', reason || '',
          'summary', completionSummary,
          ...(outcome === 'RATE_LIMITED' ? ['max_rate_limit_pauses', String(rlState.maxPauses)] : []),
          ...(preTestVerdict ? ['verdict', JSON.stringify(preTestVerdict)] : []),
          ...Object.entries(buildCompletionIdentityFields(payload, {
            runId,
            attempt,
            dispatchId: dispatchIdForCompletion,
            sessionKey: sessionKeyForCompletion,
          })).flat(),
          'timestamp', String(Date.now()),
        );
        logger.info('TASK', `Completion signal sent to ${payload.completion_stream}`);
      } catch (e) {
        logger.error('TASK', `Failed to send completion signal: ${e.message}`);
      }
    }

    logger.flush();

    await closeTelemetry(tctx);
  }
}

// ── Exported helpers (re-exported for callers that need them) ────

export { waitForSessionIdle, getAcpMonitorConfig } from '../common/pipeline/agents/acp-monitor.js';
export { spawnSession, killSession, killActiveSession, getActiveSession, clearActiveSession, recoverActiveSession } from '../common/pipeline/agents/lifecycle.js';
export { createTelemetryContext, emitEvent, closeTelemetry } from './pipeline/services/telemetry.js';

// ── Runtime constants ─────────────────────────────────────────────

const AGENT_NAME    = process.env.AGENT_NAME || 'buster';
const STREAM_KEY    = `swarm:${AGENT_NAME}:tasks`;
const GROUP_NAME    = `${AGENT_NAME}-group`;
const CONSUMER_NAME = `${AGENT_NAME}-buster-pipeline-${hostname()}`;

const POLL_INTERVAL  = 2000;
const STREAM_MAX_LEN = 250;
const PENDING_RECLAIM_IDLE_MS = parseInt(process.env.BUSTER_PENDING_RECLAIM_IDLE_MS || '60000', 10);

const PIPELINE_TASK_TYPES = ['module_test', 'gate_test'];

// ── Base Image Pre-pull ───────────────────────────────────────────

const BASE_IMAGES_STATIC = [
  'docker.io/library/python:3.12-slim',
  'docker.io/library/python:3.11-slim',
  'docker.io/library/node:20-slim',
];

const BASE_IMAGES = new Set(BASE_IMAGES_STATIC);

function normaliseImage(name) {
  if (!name.includes('/')) return `docker.io/library/${name}`;
  return name;
}

/**
 * Load additional base images from .swarm/progress.json at startup.
 * Reads serve.image from all modules and normalises bare names to FQN.
 */
function loadBaseImagesFromProgress() {
  try {
    const repoRoot    = getRepoRoot();
    const progressPath = join(repoRoot, '.swarm', 'progress.json');
    if (!fs.existsSync(progressPath)) return;
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));

    if (Array.isArray(progress.base_images)) {
      for (const img of progress.base_images) BASE_IMAGES.add(normaliseImage(img));
    }

    if (progress.modules) {
      for (const mod of Object.values(progress.modules)) {
        const img = mod.test_config?.serve?.image;
        if (img) {
          if (!img.includes('/') && !img.startsWith('docker.io')) continue;
          BASE_IMAGES.add(normaliseImage(img));
        }
      }
    }

    console.log(`[BASE_IMAGES] ${BASE_IMAGES.size} images: ${[...BASE_IMAGES].join(', ')}`);
  } catch (e) {
    console.warn(`[BASE_IMAGES] Failed to load from progress.json: ${e.message}`);
  }
}

/**
 * Pre-pull missing base images at startup.
 * Checks each image with `podman image exists`, only pulls if absent.
 */
async function ensureBaseImages() {
  console.log('[BASE_IMAGES] Ensuring base images are cached...');
  for (const img of BASE_IMAGES) {
    if (img.startsWith('localhost/') || (!img.includes('/') && !img.startsWith('docker.io'))) {
      continue;
    }
    try {
      await execAsync(`podman image exists "${img}"`, { timeout: 5000 });
      console.log(`[BASE_IMAGES] ✅ ${img} (cached)`);
    } catch {
      console.log(`[BASE_IMAGES] ⬇️  Pulling ${img}...`);
      try {
        await execAsync(`podman pull "${img}"`, { timeout: 300000, encoding: 'utf8' });
        console.log(`[BASE_IMAGES] ✅ ${img} (pulled)`);
      } catch (e) {
        console.error(`[BASE_IMAGES] ❌ Failed to pull ${img}: ${e.message}`);
      }
    }
  }
  console.log('[BASE_IMAGES] ✅ Pre-pull complete.');
}

const GATEWAY_READY_TIMEOUT  = 120000; // 120s
const GATEWAY_READY_INTERVAL = 3000;   // poll every 3s
const GATEWAY_HEALTH_INTERVAL     = 60000; // periodic check every 60s
const GATEWAY_HEALTH_MAX_FAILURES = 3;

// ── Redis ─────────────────────────────────────────────────────────

let RedisCtor = null;
let redis = null;

function getRedisClient() {
  if (redis) return redis;
  RedisCtor ||= loadRedisCtor();
  redis = new RedisCtor({
    host:                process.env.REDIS_HOST     || 'redis-master.kubeclaw.svc.cluster.local',
    port:                parseInt(process.env.REDIS_PORT || '6379'),
    password:            process.env.REDIS_PASSWORD,
    retryStrategy:       (times) => Math.min(times * 100, 5000),
    maxRetriesPerRequest: null,
    enableReadyCheck:    true,
  });

  redis.on('error',   (err) => console.error('[REDIS]', err.message));
  redis.on('connect', ()    => console.log('[REDIS] Connected.'));
  return redis;
}

// ── Gateway health ────────────────────────────────────────────────

async function checkGatewayHealth() {
  try {
    const res = await fetch(resolveGatewayHealthUrl(), { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForGateway() {
  console.log(`[GATEWAY] Waiting for gateway readiness (max ${GATEWAY_READY_TIMEOUT / 1000}s)...`);
  const deadline = Date.now() + GATEWAY_READY_TIMEOUT;
  while (Date.now() < deadline) {
    if (await checkGatewayHealth()) {
      console.log('[GATEWAY] ✅ Gateway ready.');
      return;
    }
    await new Promise(r => setTimeout(r, GATEWAY_READY_INTERVAL));
  }
  console.error('[GATEWAY] ❌ Gateway not ready within timeout. Exiting.');
  process.exit(1);
}

function startGatewayHealthMonitor() {
  let consecutiveFailures = 0;
  setInterval(async () => {
    if (shuttingDown) return;
    const healthy = await checkGatewayHealth();
    if (!healthy) {
      consecutiveFailures++;
      console.warn(`[GATEWAY] ⚠️ Health check failed (${consecutiveFailures}/${GATEWAY_HEALTH_MAX_FAILURES})`);
      if (consecutiveFailures >= GATEWAY_HEALTH_MAX_FAILURES) {
        console.error('[GATEWAY] ❌ Gateway unreachable. Exiting.');
        process.exit(1);
      }
    } else {
      if (consecutiveFailures > 0) console.log(`[GATEWAY] ✅ Recovered after ${consecutiveFailures} failed check(s).`);
      consecutiveFailures = 0;
    }
  }, GATEWAY_HEALTH_INTERVAL);
}

// ── Task dequeue ──────────────────────────────────────────────────

function parseTaskEntry(entry, reclaimed = false) {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const [id, fields] = entry;
  const data = {};
  for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];
  return { id, fields, data, reclaimed };
}

export async function reclaimPendingTask(redisClient = getRedisClient()) {
  if (!redisClient) return null;

  const result = await redisClient.call(
    'XAUTOCLAIM',
    STREAM_KEY,
    GROUP_NAME,
    CONSUMER_NAME,
    String(PENDING_RECLAIM_IDLE_MS),
    '0-0',
    'COUNT',
    '1',
  );
  const entries = Array.isArray(result?.[1]) ? result[1] : [];
  if (entries.length > 0) {
    return parseTaskEntry(entries[0], true);
  }

  return null;
}

export async function readNextTaskEntry(redisClient = getRedisClient()) {
  const reclaimed = await reclaimPendingTask(redisClient);
  if (reclaimed) return reclaimed;

  const results = await redisClient.xreadgroup(
    'GROUP', GROUP_NAME, CONSUMER_NAME,
    'COUNT', 1, 'BLOCK', POLL_INTERVAL,
    'STREAMS', STREAM_KEY, '>'
  );
  if (!results) return null;

  const streamEntries = results?.[0]?.[1] || [];
  if (!Array.isArray(streamEntries) || streamEntries.length === 0) return null;
  return parseTaskEntry(streamEntries[0], false);
}

async function processOne() {
  const redisClient = getRedisClient();
  const taskEntry = await readNextTaskEntry(redisClient);
  if (!taskEntry) return;

  const { id, data, reclaimed } = taskEntry;

  let payload = {};
  try { payload = JSON.parse(data.payload || '{}'); } catch {}

  const taskType     = data.type || 'unknown';
  const sender       = data.sender || 'unknown';
  const effectiveType = PIPELINE_TASK_TYPES.includes(payload.task_type)
    ? payload.task_type
    : taskType;

  console.log(`\n[TASK] ${id} | ${sender} ➔ ${AGENT_NAME} | type=${effectiveType}${reclaimed ? ' | reclaimed=pending' : ''}`);

  if (!PIPELINE_TASK_TYPES.includes(effectiveType)) {
    console.warn(`[TASK] ⚠️ Unknown task type: ${effectiveType} — skipping`);
    await redisClient.xack(STREAM_KEY, GROUP_NAME, id);
    return;
  }

  try {
    await processTask(payload);
    await redisClient.xack(STREAM_KEY, GROUP_NAME, id);
    await redisClient.xtrim(STREAM_KEY, 'MAXLEN', '~', STREAM_MAX_LEN);
    console.log('[TASK] ✅ Acked.');
  } catch (err) {
    console.error(`[TASK] ❌ Failed: ${err.message}`);
    await doSandboxCleanup('error', payload).catch(() => {});
    try { await redisClient.xack(STREAM_KEY, GROUP_NAME, id); } catch {}
  }
}

// ── Shutdown ──────────────────────────────────────────────────────

let shuttingDown = false;

async function recoverOrphanedActiveSession() {
  const recovered = recoverActiveSession({ activeStatePath: resolveBusterActiveSessionPath(getRepoRoot()) });
  if (!recovered?.childSessionKey) return;
  console.warn(`[RECOVERY] Found orphaned active session from prior crash: ${recovered.childSessionKey} (${recovered.label || 'unlabeled'})`);
  const killed = await killActiveSession().catch((err) => {
    console.warn(`[RECOVERY] Failed to clean orphaned session ${recovered.childSessionKey}: ${err.message}`);
    return false;
  });
  if (killed) console.log(`[RECOVERY] ✅ Orphaned session cleaned up: ${recovered.childSessionKey}`);
  else console.warn(`[RECOVERY] Cleanup could not be confirmed for orphaned session: ${recovered.childSessionKey}`);
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[SHUTDOWN] ${signal} received. Cleaning up...`);
  await killActiveSession().catch(() => {});
  await doSandboxCleanup('shutdown', {}).catch(() => {});
  try { redis?.disconnect(); } catch {}
  console.log('[SHUTDOWN] ✅ Clean exit.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log(`[BUSTER PIPELINE v2.0] Starting (Buster — Suite Runner + ACP)...`);
  console.log(` Agent:   ${AGENT_NAME}`);
  console.log(` Stream:  ${STREAM_KEY}`);
  console.log(` Gateway: ${resolveGatewayInvokeUrl()}`);

  await waitForGateway();
  await recoverOrphanedActiveSession();
  await doSandboxCleanup('startup', {});
  startGatewayHealthMonitor();

  loadBaseImagesFromProgress();
  await ensureBaseImages();

  try {
    const redisClient = getRedisClient();
    await redisClient.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '0', 'MKSTREAM');
    console.log(`[REDIS] Consumer group created: ${GROUP_NAME}`);
  } catch (e) {
    if (!e.message?.includes('BUSYGROUP')) throw e;
    console.log(`[REDIS] Consumer group exists: ${GROUP_NAME}`);
  }

  console.log(`[REDIS] Pending reclaim enabled: idle >= ${PENDING_RECLAIM_IDLE_MS}ms → ${CONSUMER_NAME}`);

  console.log('[BUSTER PIPELINE] ✅ Ready. Polling for tasks...');
  while (!shuttingDown) {
    try {
      await processOne();
    } catch (e) {
      console.error('[LOOP]', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ── CLI: --status ─────────────────────────────────────────────────

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath && process.argv[2] === '--status') {
  console.log(JSON.stringify({
    lastRunLogDir: STATE.lastRunLogDir,
  }, null, 2));
  process.exit(0);
} else if (currentPath === entryPath) {
  main();
}
