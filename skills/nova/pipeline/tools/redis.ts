#!/usr/bin/env node
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { parseCliFlagValues } from '../cli-args.ts';
import { expandSwarmConfig } from '../core/platform-config.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { createRedisEventBus } from '../services/task-transport-contract.ts';
import { resolveRedisCompletionPolicy } from '../services/redis-completion-policy.ts';
import { waitForRedisReady } from '../redis-transport.ts';
import { readNovaEnvironment } from '../core/runtime-environment.ts';
import { logRedisDispatchToDiscord } from './redis-discord-log.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// --- CONFIG ---
const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';

function loadSwarmConfig() {
  const configuredPath = readNovaEnvironment('SWARM_CONFIG');
  const configPath = configuredPath !== undefined && configuredPath !== null && String(configuredPath).trim()
    ? String(configuredPath)
    : DEFAULT_SWARM_CONFIG_PATH;
  return expandSwarmConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
}

function redisToolPolicy() {
  const config = loadSwarmConfig();
  const runtime = config?.buster?.runtime;
  if (selectTruthyValue(() => (!runtime), () => (typeof runtime !== 'object'))) throw new Error('config.buster.runtime: required platform config object');
  const completionPolicy = resolveRedisCompletionPolicy(config);
  const readyTimeoutMs = Number(config?.gateway?.health?.timeout_ms);
  if (selectTruthyValue(() => (!Number.isInteger(readyTimeoutMs)), () => (readyTimeoutMs <= 0))) {
    throw new Error('config.gateway.health.timeout_ms: required positive integer in swarm.config.json');
  }
  return {
    readyTimeoutMs,
    taskStream: String(selectDefinedValue(() => (runtime.task_stream), () => (''))).trim(),
    archiveMaxLen: completionPolicy.archiveMaxLen,
    tailScanBatchSize: completionPolicy.tailScanBatchSize,
    tailScanLimit: completionPolicy.tailScanLimit,
  };
}

function requiredEnvString(name: any) {
  const value = readNovaEnvironment(name as 'AGENT_NAME');
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (!String(value).trim()))) {
    throw new Error(`${name}: required runtime identity env var`);
  }
  return String(value).trim();
}

const redisToolState: { redis: any; logCallback: ((entry:any)=>void) | null } = { redis: null, logCallback: null };
function getRedis() {
  if (!redisToolState.redis) {
    redisToolState.redis = createRedisClient(loadRedisCtor(), {}, {
      retryStrategy: (times:number) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true
    });
    redisToolState.redis.on('error', (err:any) => console.error('[Redis Error]', err.message));
  }
  return redisToolState.redis;
}

const WEBHOOK_URL = readNovaEnvironment('DISCORD_WEBHOOK');

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

async function logToDiscord(sender: any, target: any, type: any, iter: any, payload: any) {
  try {
    await logRedisDispatchToDiscord(WEBHOOK_URL, sender, target, type, payload);
  } catch (e: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): this side effect is noncritical and the owning operation remains authoritative. */ /* ignore */ }
}

function busterTaskStream() {
  const stream = redisToolPolicy().taskStream;
  if (!stream) throw new Error('config.buster.runtime.task_stream: required non-empty string');
  return stream;
}

// ─── Log Callback ──────────────────────────────────────────────────────────
// Set by pipeline.ts after import to write Redis operations to redis-ops.jsonl.
function emitLog(event:any) {
  if (redisToolState.logCallback) {
    try { redisToolState.logCallback({ ts: new Date().toISOString(), component: 'redis', ...event }); }
    catch (_error: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): this side effect is noncritical and the owning operation remains authoritative. */ /* non-critical */ }
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

  setLogCallback(fn: any) { redisToolState.logCallback = fn; },

  /**
   * Publish a task to Buster's task queue.
   * Nova only dispatches to Buster via this TaskQueue boundary (Forge/Echo use ACP).
   */
  async publishTask(targetAgent: any, type: any, payload: any, iteration: any = 1) {
    const myName = requiredEnvString('AGENT_NAME');
    const redis = getRedis();

    await waitForRedisReady(redis, redisToolPolicy().readyTimeoutMs);

    const taskEntry = buildRedisTaskStreamEntry({ type, sender: myName, source: myName, payload, iteration });
    assertRedisTaskEntry(taskEntry, { requireStreamId: false, requireCanonicalEnvelope: true });

    const taskStream = busterTaskStream();
    const published = await createRedisEventBus(redis).publish(taskStream, taskEntry);
    const id = published.id;

    console.error(`[Redis] Sent ${id} to ${taskStream}`);
    emitLog({ op: 'dispatch', target: targetAgent, type, stream: taskStream, redis_id: id, payload_keys: Object.keys(payload), payload_size: JSON.stringify(payload).length });
    await logToDiscord(myName, 'buster', type, iteration, payload);
    return { status: 'sent', id, stream: taskStream };
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
  async readCompletion(streamKey: any, moduleId: any, expected: any = {}) {
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
    const policy = redisToolPolicy();
    const result = await scanLatestCompletionFromTail(redis, streamKey, moduleId, normalizedExpected, {
      batchSize: policy.tailScanBatchSize,
      scanLimit: policy.tailScanLimit,
    });
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
    return selectTruthyValue(() => (match), () => (null));
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
  async archiveCompletions(streamKey: any, archiveStreamKey: any, moduleId: any, maxLen: any, activeIdentity: any = {}, opts: any = {}) {
    const redis = getRedis();
    const policy = redisToolPolicy();
    const archiveMaxLen = policy.archiveMaxLen;
    const result = await archiveCompletionsChunked(redis, streamKey, archiveStreamKey, moduleId, archiveMaxLen, {
      activeIdentity,
      batchSize: policy.tailScanBatchSize,
    });
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
    if (redisToolState.redis) {
      await redisToolState.redis.quit();
      redisToolState.redis = null;
    }
  }
};

export default lib;

function parseRedisToolFlags(args: any) {
  return parseCliFlagValues(args, {
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
}

async function sendTaskAction(flags: any) {
  const type = flags.type;
  const payloadText = typeof flags.payload === 'string' ? flags.payload : '{}';
  if (!type) throw new Error('Missing --type');
  const result = await lib.publishTask('buster', type, JSON.parse(payloadText), flags.iteration);
  console.log(JSON.stringify(result));
}

function completionIdentityFlags(flags: any) {
  return {
    run_id: flags['run-id'] || undefined,
    attempt: flags.attempt || undefined,
    dispatch_id: flags['dispatch-id'] || undefined,
    session_key: flags['session-key'] || undefined,
  };
}

async function readCompletionAction(flags: any) {
  if (!flags.stream || !flags.module) throw new Error('Missing --stream or --module');
  const identity = completionIdentityFlags(flags);
  const missing = getMissingExpectedCompletionIdentityFields(identity);
  const flagNames: Record<string, string> = {
    run_id: '--run-id', attempt: '--attempt', dispatch_id: '--dispatch-id', session_key: '--session-key',
  };
  if (missing.length) {
    throw new Error(`Missing completion identity fields: ${missing.map((field: string) => flagNames[field] || field).join(', ')}`);
  }
  console.log(JSON.stringify(await lib.readCompletion(flags.stream, flags.module, identity), null, 2));
}

async function archiveCompletionAction(flags: any) {
  if (!flags.stream || !flags.module) throw new Error('Missing --stream or --module');
  const policy = redisToolPolicy();
  const result = await lib.archiveCompletions(
    flags.stream,
    `${flags.stream}:log`,
    flags.module,
    policy.archiveMaxLen,
    completionIdentityFlags(flags),
    { batchSize: policy.tailScanBatchSize },
  );
  console.log(JSON.stringify(result));
}

async function main(args: any = process.argv.slice(2)) {
  const flags = parseRedisToolFlags(args);
  try {
    if (flags.action === 'send') await sendTaskAction(flags);
    else if (flags.action === 'read-completion') await readCompletionAction(flags);
    else if (flags.action === 'archive-completions') await archiveCompletionAction(flags);
    else throw new Error('Unknown action. Use --action send|read-completion|archive-completions');
  } finally {
    await lib.disconnect();
  }
}

export { main };
export { waitForRedisReady };
export const __redisToolTest = { loadSwarmConfig, redisToolPolicy };

// --- CLI WRAPPER (Robust: Symlink-Aware + Async Exit) ---
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath) {
  main().then(
    () => {},
    (e: any) => {
      console.error(JSON.stringify({ error: e.message }));
      process.exitCode = 1;
    }
  );
}
