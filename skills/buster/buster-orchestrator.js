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

import { execFileSync, exec } from 'child_process';
import { promisify } from 'util';
import fs   from 'fs';
import { join, basename } from 'path';
import { hostname } from 'os';

const execAsync = promisify(exec);
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

import { resolveGatewayBaseUrl } from './agents/gateway.js';

import {
  createTelemetryContext,
  emitEvent,
  closeTelemetry,
} from './services/telemetry.js';

import { loadRedisCtor, resolveDiscordWebhookUrl } from './services/runtime.js';

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
 * Send a Discord webhook payload. Fire-and-forget and never throws.
 * Accepts either a plain embed object or a richer payload with embeds/content/files.
 * @param {object} message
 */
function discord(message) {
  const webhookUrl = resolveDiscordWebhookUrl();
  if (!webhookUrl || !message) return;

  const normalized = (message.embeds || message.content || message.files)
    ? {
        content: message.content || undefined,
        embeds: Array.isArray(message.embeds) ? message.embeds : undefined,
        files: Array.isArray(message.files)
          ? message.files.filter((f) => f?.path && fs.existsSync(f.path))
          : [],
      }
    : { content: undefined, embeds: [message], files: [] };

  try {
    if (normalized.files.length > 0) {
      const payload = JSON.stringify({
        content: normalized.content,
        embeds: normalized.embeds,
      });
      const args = ['-s', '-X', 'POST', '-F', `payload_json=${payload}`];
      normalized.files.forEach((file, idx) => {
        args.push('-F', `files[${idx}]=@${file.path};filename=${file.name || basename(file.path)}`);
      });
      args.push(webhookUrl);
      execFileSync('curl', args, { stdio: 'ignore', timeout: 10000 });
      return;
    }

    const body = JSON.stringify({
      content: normalized.content,
      embeds: normalized.embeds,
    });
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
  const pass = !criticalFailed;
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failEntries = results
    .filter(r => r.status === 'FAIL' || r.status === 'ERROR')
    .map(r => {
      const findings = (r.findings || [])
        .slice(0, 2)
        .map(f => f?.description || f?.message || f?.title || 'unknown')
        .filter(Boolean)
        .join('; ');
      return {
        suite: r.suite,
        detail: r.error || r.top_finding || findings || r.reason || 'failed',
      };
    });
  const failCount = failEntries.length;
  const passSuites = results.filter(r => r.status === 'PASS').map(r => r.suite);
  const skipSuites = results.filter(r => r.status === 'SKIP').map(r => r.suite);
  const truncate = (value, max = 1024) => {
    const s = String(value || '—');
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  };
  const fields = [
    { name: 'Status',  value: pass ? 'GO' : 'NO-GO', inline: true },
    { name: 'Module',  value: String(moduleId),       inline: true },
    { name: 'Project', value: String(project || '—'), inline: true },
    { name: 'Passed',  value: String(passCount),      inline: true },
    { name: 'Failed',  value: String(failCount),      inline: true },
  ];
  if (suiteSummary) {
    fields.push({ name: 'Summary', value: truncate(suiteSummary), inline: false });
  }
  if (passSuites.length) {
    fields.push({ name: 'Passed Suites', value: truncate(passSuites.join(', ')), inline: false });
  }
  if (failEntries.length) {
    fields.push({ name: 'Failed Suites', value: truncate(failEntries.map(r => r.suite).join(', ')), inline: false });
    fields.push({ name: 'Issue', value: truncate(failEntries.map(r => `${r.suite}: ${r.detail}`).join('\n')), inline: false });
  }
  if (skipSuites.length) {
    fields.push({ name: 'Skipped Suites', value: truncate(skipSuites.join(', ')), inline: false });
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

export function buildTaskFailureEmbed(moduleId, project, { reason, stage, attempt, taskType, commitHash }) {
  const truncate = (value, max = 1024) => {
    const s = String(value || 'unknown');
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  };

  return {
    title:  `🚨 Task Failure: ${moduleId}`,
    color:  15158332,
    fields: [
      { name: 'Status',  value: 'FAIL',                        inline: true },
      { name: 'Module',  value: String(moduleId),              inline: true },
      { name: 'Project', value: String(project || '—'),        inline: true },
      { name: 'Stage',   value: String(stage || 'unknown'),    inline: true },
      { name: 'Attempt', value: String(attempt ?? '—'),        inline: true },
      { name: 'Type',    value: String(taskType || 'unknown'), inline: true },
      { name: 'Commit',  value: String(commitHash || '—'),     inline: true },
      { name: 'Reason',  value: truncate(reason),              inline: false },
    ],
    footer:    EMBED_FOOTER,
    timestamp: new Date().toISOString(),
  };
}

function buildLegacyTaskDispatchMessage(payload, iter = 1) {
  const pretty = JSON.stringify(payload, null, 2);
  const embed = {
    title: '⚡ Task: nova → buster',
    description: `nova → buster
Type: ${payload?.task_type || 'module_test'} | Iter: ${iter}`,
    color: 0x2ecc71,
    footer: { text: 'Buster Processor legacy compatibility' },
  };

  if (pretty.length <= 1800) {
    embed.fields = [{
      name: 'Payload',
      value: `\`\`\`json
${pretty}
\`\`\``,
      inline: false,
    }];
    return { embeds: [embed] };
  }

  const payloadPath = join('/tmp', `payload-${payload?.task_type || 'module_test'}-${Date.now()}.json`);
  try {
    fs.writeFileSync(payloadPath, pretty);
    embed.description += '\n\nPayload too large for embed — see attached file.';
    return {
      embeds: [embed],
      files: [{ path: payloadPath, name: basename(payloadPath) }],
    };
  } catch {
    embed.description += '\n\nPayload too large for embed.';
    return { embeds: [embed] };
  }
}

function buildLegacySuiteResultsEmbed(moduleId, suitesInfo) {
  const suites = Object.entries(suitesInfo?.suites || {});
  const lines = suites.map(([name, s]) => {
    const icon = s.status === 'PASS' ? '✅' : s.status === 'FAIL' ? '❌' : s.status === 'SKIP' ? '⏭' : '💥';
    let line = `${icon} ${name.padEnd(10)} — ${s.status}`;
    if (s.duration_ms) line += ` (${(s.duration_ms / 1000).toFixed(1)}s)`;
    if (s.reason) line += `\n   ${s.reason}`;
    return line;
  }).join('\n');

  const action = suitesInfo?.criticalFailed
    ? '→ No subagent. FAIL reported to pipeline.'
    : '→ Spawning Subagent (results injected)';

  return {
    title: suitesInfo?.criticalFailed
      ? `❌ Pre-Test FAIL: Module ${moduleId}`
      : `🔬 Pre-Test Results: Module ${moduleId}`,
    color: suitesInfo?.criticalFailed ? 15548997 : 5763719,
    description: `\`\`\`
${lines}
\`\`\`
${action}`,
    footer: { text: `Buster Orchestrator v1.1 • ${Math.round(suitesInfo?.elapsedMs || 0)}ms total` },
  };
}

function buildLegacySessionSpawnEmbed(moduleId, project, sessionData, suitesInfo) {
  return {
    title: `🔬 ACP Session Spawned: ${moduleId}`,
    color: 5763719,
    description: suitesInfo?.suiteSummary ? `**Pre-Test:** ${suitesInfo.suiteSummary}` : '',
    fields: [
      { name: 'Project', value: `\`${project || 'unknown'}\``, inline: true },
      { name: 'Type', value: `\`${sessionData.taskType || 'module_test'}\``, inline: true },
      { name: 'Timeout', value: `${Math.max(1, Math.round((sessionData.timeoutSeconds || 0) / 60))}min`, inline: true },
      { name: 'Session', value: `\`${sessionData.childSessionKey || '—'}\``, inline: false },
    ],
    footer: { text: `Buster Orchestrator v1.1 • ${new Date().toISOString()}` },
  };
}

function buildLegacySessionCompleteEmbed(moduleId, project, result) {
  const pass = result.outcome === 'PASS';
  return {
    title: `${pass ? '✅' : '❌'} ACP Session Complete: ${moduleId}`,
    color: pass ? 5763719 : 15548997,
    description: `**Summary:** ${(result.summary || result.reason || 'test').slice(0, 500)}`,
    fields: [
      { name: 'Status', value: `\`${result.outcome || '—'}\``, inline: true },
      { name: 'Source', value: `\`${result.source || 'agent'}\``, inline: true },
      { name: 'Duration', value: `${Math.max(0, Math.round((result.durationSeconds || 0) / 60))}min`, inline: true },
      { name: 'Commit', value: `\`${result.commitHash || 'unknown'}\``, inline: true },
      { name: 'Session', value: `\`${result.childSessionKey || '—'}\``, inline: false },
    ],
    footer: { text: `Buster Orchestrator v1.1 • ${project || 'unknown-project'}` },
  };
}

function buildLegacyTaskFailureEmbed(moduleId, project, result) {
  return {
    title: `🚨 Buster Task Failed: Module ${moduleId}`,
    color: 15548997,
    description: `**Stage:** \`${result.stage || 'unknown'}\`\n**Reason:** ${(result.reason || 'unknown').slice(0, 700)}`,
    fields: [
      { name: 'Project', value: `\`${project || 'unknown'}\``, inline: true },
      { name: 'Attempt', value: `\`${result.attempt ?? '—'}\``, inline: true },
      { name: 'Type', value: `\`${result.taskType || 'module_test'}\``, inline: true },
      { name: 'Commit', value: `\`${result.commitHash || 'unknown'}\``, inline: false },
    ],
    footer: { text: `Buster Orchestrator v1.1 • ${new Date().toISOString()}` },
  };
}

function notifyTaskFailure(moduleId, project, result) {
  discord(buildTaskFailureEmbed(moduleId, project, result));
  discord(buildLegacyTaskFailureEmbed(moduleId, project, result));
}

// ── Sandbox + K8s cleanup ────────────────────────────────────────

async function doSandboxCleanup(stage, payload) {
  const start  = Date.now();
  const errors = [];

  // 1. Stop + remove all Podman containers
  try {
    await execAsync('podman stop -a 2>/dev/null; podman rm -a -f 2>/dev/null', {
      timeout: 30000, encoding: 'utf8',
    });
  } catch (e) { errors.push(`containers: ${e.message}`); }

  // 2. Prune dangling images
  try {
    await execAsync('podman image prune -f 2>/dev/null', { timeout: 10000, encoding: 'utf8' });
  } catch (e) { errors.push(`image-prune: ${e.message}`); }

  // 3. Clear sandbox directories
  try {
    await execAsync(
      'rm -rf /sandbox/www/* /sandbox/results/* && mkdir -p /sandbox/www /sandbox/results',
      { timeout: 5000, encoding: 'utf8' }
    );
  } catch (e) { errors.push(`sandbox-dirs: ${e.message}`); }

  // 4. Stop nginx
  try {
    await execAsync('nginx -s stop 2>/dev/null', { timeout: 5000, encoding: 'utf8' });
  } catch { /* nginx may not be running — ignore */ }

  // 5. Delete ephemeral K8s test namespace written by the k8s suite.
  // Only deletes namespaces matching buster-* or test-* (mirrors VAP fence).
  const k8sNsFile = '/sandbox/k8s-test-namespace';
  if (fs.existsSync(k8sNsFile)) {
    try {
      const testNs = fs.readFileSync(k8sNsFile, 'utf8').trim();
      if (testNs && /^(buster|test)-/.test(testNs)) {
        await execAsync(`kubectl delete namespace "${testNs}" --wait=false 2>/dev/null`, {
          timeout: 15000, encoding: 'utf8',
        });
      }
    } catch (e) { errors.push(`k8s-ns: ${e.message}`); }
    try { fs.unlinkSync(k8sNsFile); } catch {}
  }

  return {
    ok:               errors.length === 0,
    duration_seconds: Math.round((Date.now() - start) / 1000),
    ...(errors.length > 0 && { errors }),
  };
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
  let stage      = 'task-started';
  let spawnedSubagent = false;
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
    discord(buildLegacyTaskDispatchMessage(payload, payload?.iter || attempt || 1));

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
      notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash });
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
    discord(buildSuiteResultsEmbed(moduleId, project, suitesInfo));
    discord(buildLegacySuiteResultsEmbed(moduleId, suitesInfo));

    if (suitesInfo.criticalFailed) {
      outcome = 'FAIL';
      reason  = 'NO_SUBAGENT: critical suite failure';
      return { outcome, reason };
    }

    // ── Spawn subagent ────────────────────────────────────────────
    stage = 'spawn-session';
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
      notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash });
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
    spawnedSubagent = true;
    const sessionSpawnData = {
      ...sessionData,
      taskType,
      timeoutSeconds,
    };
    discord(buildSessionSpawnEmbed(moduleId, project, sessionSpawnData));
    discord(buildLegacySessionSpawnEmbed(moduleId, project, sessionSpawnData, suitesInfo));

    // ── Monitor session ───────────────────────────────────────────
    stage = 'monitor-session';
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
    stage = 'kill-session';
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
      reason  = `session_timeout: ${timeoutSeconds}s exceeded`;
    }

    if (outcome === 'TIMEOUT') {
      discord(buildTimeoutEmbed(moduleId, project, {
        elapsedSeconds,
        timeoutSeconds,
        childSessionKey: sessionData.childSessionKey,
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
      discord(buildSessionCompleteEmbed(moduleId, project, sessionCompleteData));
      discord(buildLegacySessionCompleteEmbed(moduleId, project, sessionCompleteData));
    }

    logger.info('OUTCOME', `Task outcome: ${outcome}`, { reason });

    return { outcome, reason };

  } catch (err) {
    outcome = 'FAIL';
    reason  = `internal_error: ${err?.message || String(err)}`;
    logger.error('TASK', `Unhandled task failure at ${stage}: ${err?.stack || err?.message || String(err)}`);
    notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash });
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
      spawned_subagent: spawnedSubagent,
    });

    logger.info('TASK', `Task completed: outcome=${outcome} reason=${reason} duration=${totalDuration}s`);

    // Send completion signal back to Nova pipeline via completion_stream.
    // Buster v2 uses telemetry for observability, but Nova still polls this
    // stream to unblock the dual-channel poller.
    if (payload?.completion_stream) {
      try {
        const redisClient = getRedisClient();
        await redisClient.xadd(
          payload.completion_stream, '*',
          'type', 'completion',
          'module', moduleId,
          'status', outcome === 'PASS' ? 'PASS' : 'FAIL',
          'source', 'buster-orchestrator',
          'summary', reason || suitesInfo.suiteSummary || '',
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

  const gatewayUrl   = resolveGatewayBaseUrl();
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

// ── Runtime constants ─────────────────────────────────────────────

const AGENT_NAME    = process.env.AGENT_NAME || 'buster';
const STREAM_KEY    = `swarm:${AGENT_NAME}:tasks`;
const GROUP_NAME    = `${AGENT_NAME}-group`;
const CONSUMER_NAME = `${AGENT_NAME}-orchestrator-${hostname()}`;

const POLL_INTERVAL  = 2000;
const STREAM_MAX_LEN = 250;

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

const GATEWAY_URL            = 'http://127.0.0.1:18789/tools/invoke';
const GATEWAY_HEALTH_URL     = 'http://127.0.0.1:18789/health';
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
    const res = await fetch(GATEWAY_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
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

async function processOne() {
  const redisClient = getRedisClient();
  const results = await redisClient.xreadgroup(
    'GROUP', GROUP_NAME, CONSUMER_NAME,
    'COUNT', 1, 'BLOCK', POLL_INTERVAL,
    'STREAMS', STREAM_KEY, '>'
  );
  if (!results) return;

  const [id, fields] = results[0][1][0];
  const data = {};
  for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];

  let payload = {};
  try { payload = JSON.parse(data.payload || '{}'); } catch {}

  const taskType     = data.type || 'unknown';
  const sender       = data.sender || 'unknown';
  const effectiveType = PIPELINE_TASK_TYPES.includes(payload.task_type)
    ? payload.task_type
    : taskType;

  console.log(`\n[TASK] ${id} | ${sender} ➔ ${AGENT_NAME} | type=${effectiveType}`);

  if (!PIPELINE_TASK_TYPES.includes(effectiveType)) {
    console.warn(`[TASK] ⚠️ Unknown task type: ${effectiveType} — skipping`);
    await redis.xack(STREAM_KEY, GROUP_NAME, id);
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
  console.log(`[ORCHESTRATOR v2.0] Starting (Buster — Suite Runner + ACP)...`);
  console.log(` Agent:   ${AGENT_NAME}`);
  console.log(` Stream:  ${STREAM_KEY}`);
  console.log(` Gateway: ${GATEWAY_URL}`);

  await doSandboxCleanup('startup', {});
  await waitForGateway();
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

  console.log('[ORCHESTRATOR] ✅ Ready. Polling for tasks...');
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

if (process.argv[2] === '--status') {
  console.log(JSON.stringify({
    lastRunLogDir: STATE.lastRunLogDir,
  }, null, 2));
  process.exit(0);
} else {
  main();
}
