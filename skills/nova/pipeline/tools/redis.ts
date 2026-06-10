#!/usr/bin/env node
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { parseCliFlagValues } from '../cli-args.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { createRedisTaskQueue } from '../services/task-transport-contract.ts';

// --- CONFIG ---
const REDIS_READY_TIMEOUT_MS = Number.parseInt(process.env.REDIS_READY_TIMEOUT_MS || '10000', 10);

let _redis = null;
function getRedis() {
  if (!_redis) {
    _redis = createRedisClient(loadRedisCtor(), {}, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true
    });
    _redis.on('error', (err) => console.error('[Redis Error]', err.message));
  }
  return _redis;
}

function waitForRedisReady(redis, timeoutMs = REDIS_READY_TIMEOUT_MS) {
  if (redis.status === 'ready') return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout = null;

    const cleanup = () => {
      redis.off?.('ready', onReady);
      redis.off?.('error', onError);
      redis.off?.('end', onEnd);
      redis.off?.('close', onClose);
      if (timeout) clearTimeout(timeout);
    };
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onReady = () => settle(resolve);
    const onError = (err) => settle(reject, err instanceof Error ? err : new Error(String(err || 'Redis connection failed')));
    const onEnd = () => settle(reject, new Error('Redis connection ended before ready'));
    const onClose = () => settle(reject, new Error('Redis connection closed before ready'));

    redis.once('ready', onReady);
    redis.once('error', onError);
    redis.once('end', onEnd);
    redis.once('close', onClose);
    timeout = setTimeout(() => {
      settle(reject, new Error(`Redis did not become ready within ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

// ═══════════════════════════════════════════════════════════════
// DISCORD LOGGING — Full payload, no truncation
//
// Discord limits:
//   Embed description: 4096 chars
//   Embed field value:  1024 chars
//   Total embed:        6000 chars
//
// Strategy: payload goes in description (4096 budget).
// If payload > 3500 chars, split across multiple embeds.
// ═══════════════════════════════════════════════════════════════

function normalizeDiscordFieldValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function buildRedisDispatchDiscordFields(payload = {}, iter = 1, extra = []) {
  const fields = [];
  const runId = normalizeDiscordFieldValue(payload.run_id ?? payload.runId);
  const moduleId = normalizeDiscordFieldValue(payload.module ?? payload.module_id ?? payload.moduleId);
  const gateId = normalizeDiscordFieldValue(payload.gate_id ?? payload.gateId);
  const gateTitle = normalizeDiscordFieldValue(payload.gate_title ?? payload.gateTitle);
  const gateType = normalizeDiscordFieldValue(payload.gate_type ?? payload.gateType);
  const stageId = normalizeDiscordFieldValue(payload.stage_id ?? payload.stageId);
  const dispatchId = normalizeDiscordFieldValue(payload.dispatch_id ?? payload.dispatchId);
  const attempt = normalizeDiscordFieldValue(payload.attempt ?? iter);
  const sessionKey = normalizeDiscordFieldValue(payload.session_key ?? payload.sessionKey);

  if (runId) fields.push({ name: 'Run ID', value: runId, inline: true });
  if (moduleId) fields.push({ name: 'Module', value: moduleId, inline: true });
  if (gateId) fields.push({ name: 'Gate', value: gateTitle ? `${gateId} — ${gateTitle}` : gateId, inline: true });
  if (gateType) fields.push({ name: 'Gate Type', value: gateType, inline: true });
  if (stageId) fields.push({ name: 'Stage', value: stageId, inline: true });
  if (attempt) fields.push({ name: 'Attempt', value: attempt, inline: true });
  if (dispatchId) fields.push({ name: 'Dispatch', value: dispatchId, inline: true });
  if (sessionKey) fields.push({ name: 'Session', value: sessionKey, inline: true });
  return [...fields, ...extra];
}

function resolveRedisDiscordContext(payload = {}) {
  const pipelineLogPath = normalizeDiscordFieldValue(payload.pipeline_log_path ?? payload.pipelineLogPath);
  const pipelineRunLogPath = normalizeDiscordFieldValue(payload.pipeline_run_log_path ?? payload.pipelineRunLogPath);
  const runId = normalizeDiscordFieldValue(payload.run_id ?? payload.runId);
  const gateId = normalizeDiscordFieldValue(payload.gate_id ?? payload.gateId);
  return {
    project: normalizeDiscordFieldValue(payload.project),
    runId,
    moduleId: gateId ? null : normalizeDiscordFieldValue(payload.module_id ?? payload.module ?? payload.moduleId),
    gateId,
    gateType: normalizeDiscordFieldValue(payload.gate_type ?? payload.gateType),
    attempt: normalizeDiscordFieldValue(payload.attempt),
    dispatchId: normalizeDiscordFieldValue(payload.dispatch_id ?? payload.dispatchId),
    sessionKey: normalizeDiscordFieldValue(payload.session_key ?? payload.sessionKey),
    globalDiscordPath: pipelineLogPath ? path.join(path.dirname(pipelineLogPath), 'discord.jsonl') : null,
    runDiscordPath: pipelineRunLogPath ? path.join(path.dirname(pipelineRunLogPath), 'discord.jsonl') : null,
  };
}

async function logToDiscord(sender, target, type, iter, payload) {
  try {
    const [{ discordEmbeds }, { formatSummaryForDiscord, summarizePayloadForDiscord }] = await Promise.all([
      import('../integrations/discord.ts'),
      import('../redaction.ts'),
    ]);
    const header = `**${sender}** → **${target}**\nType: \`${type}\` | Iter: \`${iter}\``;
    const payloadSummary = summarizePayloadForDiscord(payload, 'task_payload');
    const summaryFields = [];
    if (payload && typeof payload === 'object') {
      if (payload.project) summaryFields.push({ name: 'Project', value: String(payload.project), inline: true });
      if (Array.isArray(payload.test_suites) && payload.test_suites.length) summaryFields.push({ name: 'Suites', value: payload.test_suites.join(', '), inline: true });
      if (target === 'buster' && type === 'module_test') {
        summaryFields.push({ name: 'Meaning', value: 'Queued for Buster only. This does not mean suites started or that a subagent exists yet.', inline: false });
      }
    }
    summaryFields.push({ name: 'Payload', value: formatSummaryForDiscord(payloadSummary), inline: false });

    const context = resolveRedisDiscordContext(payload);
    await discordEmbeds({
      project: context.project,
      _runId: context.runId,
      run_id: context.runId,
      discord_webhook_url: WEBHOOK_URL,
      telemetry: { enabled: Boolean(context.runId) },
    }, [{
      title: `⚡ Task: ${sender} → ${target}`,
      color: 5763719,
      description: `${header}\n\nPayload redacted by default.`,
      fields: buildRedisDispatchDiscordFields(payload, iter, summaryFields),
    }], {
      level: 'INFO',
      correlation: {
        module_id: context.moduleId,
        gate_id: context.gateId,
        gate_type: context.gateType,
        attempt: context.attempt ?? iter,
        dispatch_id: context.dispatchId,
        session_key: context.sessionKey,
      },
      auditTargets: [context.globalDiscordPath, context.runDiscordPath],
    });
  } catch (e) { /* ignore */ }
}

const BUSTER_STREAM = process.env.BUSTER_TASK_STREAM || 'swarm:buster:tasks';

// ─── Log Callback ──────────────────────────────────────────────────────────
// Set by pipeline.ts after import to write Redis operations to redis-ops.jsonl.
let _logCallback = null;

function emitLog(event) {
  if (_logCallback) {
    try { _logCallback({ ts: new Date().toISOString(), component: 'redis', ...event }); }
    catch (_error) { /* non-critical */ }
  }
}

import {
  archiveCompletionsChunked,
  assertRedisTaskEntry,
  buildRedisTaskStreamEntry,
  getMissingExpectedCompletionIdentityFields,
  hasStrongExpectedCompletionIdentity,
  normalizeExpectedCompletionIdentity,
  scanLatestCompletionFromTail,
} from '../services/redis-completion.ts';
export {
  REDIS_COMPLETION_OUTCOMES,
  REDIS_COMPLETION_SOURCES,
  REDIS_COMPLETION_STATUSES,
  REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION,
  REDIS_PIPELINE_STREAM_ROLES,
  REDIS_PIPELINE_TARGET_KINDS,
  REDIS_TASK_TYPES,
  RedisPipelineMessageInvalidError,
  archiveCompletionsChunked,
  assertRedisCompletionEntry,
  assertRedisTaskEntry,
  attachIgnoredCompletionSourceDiagnostics,
  attachSameOutcomeDuplicateDiagnostics,
  buildCompletionConflictEntry,
  buildRedisTaskStreamEntry,
  getMissingExpectedCompletionIdentityFields,
  hasStrongExpectedCompletionIdentity,
  inferRedisPipelineTargetKind,
  inferRedisTaskTarget,
  isValidRedisCompletionEntry,
  isValidRedisTaskEntry,
  matchesCompletionIdentity,
  normalizeExpectedCompletionIdentity,
  normalizeRedisPipelineEnvelope,
  scanLatestCompletionFromTail,
  selectLatestCompletion,
  validateRedisCompletionEntry,
  validateRedisPipelineEnvelope,
  validateRedisTaskEntry,
} from '../services/redis-completion.ts';
const lib = {
  get client() { return getRedis(); },

  setLogCallback(fn) { _logCallback = fn; },

  /**
   * Publish a task to Buster's task queue.
   * Nova only dispatches to Buster via this TaskQueue boundary (Forge/Echo use ACP).
   */
  async publishTask(targetAgent, type, payload, iteration = 1) {
    const myName = process.env.AGENT_NAME || 'nova';
    const redis = getRedis();

    await waitForRedisReady(redis);

    const taskEntry = buildRedisTaskStreamEntry({ type, sender: myName, source: myName, payload, iteration });
    assertRedisTaskEntry(taskEntry, { requireStreamId: false, requireCanonicalEnvelope: true });

    const queue = createRedisTaskQueue(redis, { streamKey: BUSTER_STREAM });
    const published = await queue.publishTask(BUSTER_STREAM, taskEntry);
    const id = published.id;

    console.error(`[Redis] Sent ${id} to ${BUSTER_STREAM}`);
    emitLog({ op: 'dispatch', target: targetAgent, type, stream: BUSTER_STREAM, redis_id: id, payload_keys: Object.keys(payload), payload_size: JSON.stringify(payload).length });
    await logToDiscord(myName, 'buster', type, iteration, payload);
    return { status: 'sent', id, stream: BUSTER_STREAM };
  },

  // ── Pipeline Completion Stream Functions ──────────────────────────────────
  // Used by pipeline.ts via direct import to avoid per-cycle subprocess spawns.
  // These replace the inline CJS scripts that were generated on every poll cycle.

  /**
   * Read the latest completion entry for a module from the active stream.
   * @param {string} streamKey - Redis stream key (e.g. swarm:pipeline:kubecommand:completions)
   * @param {string} moduleId - Module to filter for
   * @param {object} [expected] - Optional strong identity filter (run_id, attempt, dispatch_id, session_key)
   * @returns {object|null} - Completion entry or null
   */
  async readCompletion(streamKey, moduleId, expected = {}) {
    const redis = getRedis();
    const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
    if (!hasStrongExpectedCompletionIdentity(normalizedExpected)) {
      const missing = getMissingExpectedCompletionIdentityFields(normalizedExpected);
      emitLog({
        op: 'read_completion_rejected_weak_identity',
        stream: streamKey,
        module: moduleId,
        expected_identity: normalizedExpected,
        missing_fields: missing,
      });
      return null;
    }
    const result = await scanLatestCompletionFromTail(redis, streamKey, moduleId, normalizedExpected);
    const match = result.match;
    emitLog({
      op: 'read_completion',
      stream: streamKey,
      module: moduleId,
      expected_identity: normalizedExpected,
      found: !!match,
      scanned_entries: result.scanned,
      scan_batches: result.batches,
      scan_truncated: result.truncated,
      ...(match && { entry: { status: match.status, source: match.source, summary: match.summary?.slice(0, 200), commit_hash: match.commit_hash, run_id: match.run_id, attempt: match.attempt, dispatch_id: match.dispatch_id, session_key: match.session_key, redis_id: match._id } }),
    });
    return match || null;
  },

  /**
   * Archive old completion entries for a module from active → archive stream.
   * Prevents pollDual from reading stale FAIL/PASS entries from previous attempts.
   * @param {string} streamKey - Active stream key
   * @param {string} archiveStreamKey - Archive stream key (typically streamKey + ':log')
   * @param {string} moduleId - Module to archive completions for
   * @param {number} maxLen - Max archive stream length (trimmed with ~ approximation)
   * @returns {{ archived: number }}
   */
  async archiveCompletions(streamKey, archiveStreamKey, moduleId, maxLen = 1000, activeIdentity = {}) {
    const redis = getRedis();
    const result = await archiveCompletionsChunked(redis, streamKey, archiveStreamKey, moduleId, maxLen, { activeIdentity });
    emitLog({
      op: 'archive',
      stream: streamKey,
      archive_stream: archiveStreamKey,
      module: moduleId,
      archived: result.archived,
      scanned_entries: result.scanned,
      scan_batches: result.batches,
      active_identity: result.active_identity,
      identity_scoped: result.identity_scoped,
    });
    return { archived: result.archived };
  },

  async disconnect() {
    if (_redis) {
      await _redis.quit();
      _redis = null;
    }
  }
};

export default lib;

async function main(args = process.argv.slice(2)) {
  const flags = parseCliFlagValues(args, {
    flags: {
      action: { type: 'string', required: true },
      type: { type: 'string' },
      iteration: { type: 'string', default: '1' },
      payload: { type: 'string', default: '{}' },
      stream: { type: 'string' },
      module: { type: 'string' },
      'run-id': { type: 'string' },
      attempt: { type: 'string' },
      'dispatch-id': { type: 'string' },
      'session-key': { type: 'string' },
    },
  });
  const action = flags.action;

  try {
    if (action === 'send') {
      const type = flags.type;
      const iter = flags.iteration;
      const payload = JSON.parse(flags.payload || '{}');
      if (!type) throw new Error('Missing --type');

      const res = await lib.publishTask('buster', type, payload, iter);
      console.log(JSON.stringify(res));
      return;
    }

    if (action === 'read-completion') {
      const stream = flags.stream;
      const module = flags.module;
      if (!stream || !module) throw new Error('Missing --stream or --module');
      const expectedIdentity = {
        run_id: flags['run-id'] || undefined,
        attempt: flags.attempt || undefined,
        dispatch_id: flags['dispatch-id'] || undefined,
        session_key: flags['session-key'] || undefined,
      };
      const missingIdentity = getMissingExpectedCompletionIdentityFields(expectedIdentity);
      if (missingIdentity.length) {
        const flagNames = {
          run_id: '--run-id',
          attempt: '--attempt',
          dispatch_id: '--dispatch-id',
          session_key: '--session-key',
        };
        throw new Error(`Missing completion identity fields: ${missingIdentity.map((field) => flagNames[field] || field).join(', ')}`);
      }
      const res = await lib.readCompletion(stream, module, expectedIdentity);
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    if (action === 'archive-completions') {
      const stream = flags.stream;
      const module = flags.module;
      if (!stream || !module) throw new Error('Missing --stream or --module');
      const archiveStream = stream + ':log';
      const res = await lib.archiveCompletions(stream, archiveStream, module, 1000, {
        run_id: flags['run-id'] || undefined,
        attempt: flags.attempt || undefined,
        dispatch_id: flags['dispatch-id'] || undefined,
        session_key: flags['session-key'] || undefined,
      });
      console.log(JSON.stringify(res));
      return;
    }

    throw new Error('Unknown action. Use --action send|read-completion|archive-completions');
  } finally {
    await lib.disconnect();
  }
}

export { main };
export { waitForRedisReady };

// --- CLI WRAPPER (Robust: Symlink-Aware + Async Exit) ---
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath) {
  main().then(
    () => {},
    (e) => {
      console.error(JSON.stringify({ error: e.message }));
      process.exitCode = 1;
    }
  );
}
