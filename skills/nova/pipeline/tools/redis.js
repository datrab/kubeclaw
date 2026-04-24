#!/usr/bin/env node
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { discordEmbeds } from '../integrations/discord.js';
import { formatSummaryForDiscord, summarizePayloadForDiscord } from '../../../common/pipeline/redaction.js';

const require = createRequire(import.meta.url);

function requireFirst(candidates) {
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const Redis = requireFirst([
  'ioredis',
  '/app/node_modules/ioredis',
  '/usr/local/lib/node_modules/ioredis',
]);

// --- CONFIG ---
let _redis = null;
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      host: process.env.REDIS_HOST || 'redis-master.kubeclaw.svc.cluster.local',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true
    });
    _redis.on('error', (err) => console.error('[Redis Error]', err.message));
  }
  return _redis;
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
  return {
    project: normalizeDiscordFieldValue(payload.project),
    runId,
    logDir: pipelineLogPath ? path.dirname(path.dirname(pipelineLogPath)) : null,
    runLogDir: pipelineRunLogPath ? path.dirname(pipelineRunLogPath) : null,
  };
}

async function logToDiscord(sender, target, type, iter, payload) {
  try {
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
      _logDir: context.logDir,
      _runLogDir: context.runLogDir,
      discord_webhook_url: WEBHOOK_URL,
      telemetry: { enabled: Boolean(context.runId) },
    }, [{
      title: `⚡ Task: ${sender} → ${target}`,
      color: 5763719,
      description: `${header}\n\nPayload redacted by default.`,
      fields: buildRedisDispatchDiscordFields(payload, iter, summaryFields),
    }], { level: 'INFO' });
  } catch (e) { /* ignore */ }
}

const BUSTER_STREAM = 'swarm:buster:tasks';

// ─── Log Callback ──────────────────────────────────────────────────────────
// Set by pipeline.js after import to write Redis operations to redis-ops.jsonl.
let _logCallback = null;

function emitLog(event) {
  if (_logCallback) {
    try { _logCallback({ ts: new Date().toISOString(), component: 'redis', ...event }); }
    catch { /* non-critical */ }
  }
}

function normalizeIdentityValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

export function normalizeExpectedCompletionIdentity(expected = {}) {
  const normalized = {
    run_id: normalizeIdentityValue(expected.run_id ?? expected.runId),
    attempt: normalizeIdentityValue(expected.attempt),
    dispatch_id: normalizeIdentityValue(expected.dispatch_id ?? expected.dispatchId),
    session_key: normalizeIdentityValue(expected.session_key ?? expected.sessionKey),
  };

  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== null));
}

export function matchesCompletionIdentity(entry = {}, expected = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const keys = Object.keys(normalizedExpected);
  if (keys.length === 0) return true;

  return keys.every((key) => normalizeIdentityValue(entry?.[key]) === normalizedExpected[key]);
}

export function selectLatestCompletion(entries = [], moduleId, expected = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const matched = entries
    .map(([id, fields]) => {
      const o = { _id: id };
      for (let i = 0; i < fields.length; i += 2) o[fields[i]] = fields[i + 1];
      return o;
    })
    .filter((entry) => entry.type === 'completion' && entry.module === moduleId && matchesCompletionIdentity(entry, normalizedExpected));

  if (matched.length === 0) return null;

  if (Object.keys(normalizedExpected).length > 0) {
    const latestAgentEntry = [...matched].reverse().find((entry) => (entry.source || '').toLowerCase() === 'agent');
    if (latestAgentEntry) return latestAgentEntry;
  }

  return matched[matched.length - 1] || null;
}

function decodeStreamEntry(id, fields) {
  const entry = { _id: id };
  for (let i = 0; i < fields.length; i += 2) entry[fields[i]] = fields[i + 1];
  return entry;
}

function nextExclusiveStreamId(id) {
  return `(${id}`;
}

export async function scanLatestCompletionFromTail(redis, streamKey, moduleId, expected = {}, opts = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const requireAgent = Object.keys(normalizedExpected).length > 0;
  const batchSize = Math.max(1, Number(opts.batchSize || 100));
  const scanLimit = Math.max(batchSize, Number(opts.scanLimit || 1000));

  let nextEnd = '+';
  let scanned = 0;
  let batches = 0;
  let latestMatch = null;

  while (scanned < scanLimit) {
    const remaining = Math.max(1, scanLimit - scanned);
    const count = Math.min(batchSize, remaining);
    const entries = await redis.xrevrange(streamKey, nextEnd, '-', 'COUNT', count);
    batches += 1;

    if (!Array.isArray(entries) || entries.length === 0) break;
    scanned += entries.length;

    for (const [id, fields] of entries) {
      const entry = decodeStreamEntry(id, fields);
      if (entry.type !== 'completion' || entry.module !== moduleId) continue;
      if (!matchesCompletionIdentity(entry, normalizedExpected)) continue;

      if (!latestMatch) latestMatch = entry;
      if (!requireAgent || (entry.source || '').toLowerCase() === 'agent') {
        return { match: entry, scanned, batches, truncated: false };
      }
    }

    if (entries.length < count) break;
    nextEnd = nextExclusiveStreamId(entries[entries.length - 1][0]);
  }

  return {
    match: latestMatch,
    scanned,
    batches,
    truncated: scanned >= scanLimit,
  };
}

export async function archiveCompletionsChunked(redis, streamKey, archiveStreamKey, moduleId, maxLen = 1000, opts = {}) {
  const batchSize = Math.max(1, Number(opts.batchSize || 100));
  let nextStart = '-';
  let scanned = 0;
  let archived = 0;
  let batches = 0;

  while (true) {
    const entries = await redis.xrange(streamKey, nextStart, '+', 'COUNT', batchSize);
    batches += 1;

    if (!Array.isArray(entries) || entries.length === 0) break;
    scanned += entries.length;

    const matching = [];
    for (const [id, fields] of entries) {
      const entry = decodeStreamEntry(id, fields);
      if (entry.type === 'completion' && entry.module === moduleId) matching.push([id, fields]);
    }

    if (matching.length > 0) {
      const archivedAt = Date.now().toString();
      const tx = redis.multi();
      for (const [id, fields] of matching) {
        tx.xadd(archiveStreamKey, '*', ...fields, 'archived_at', archivedAt);
        tx.xdel(streamKey, id);
      }
      await tx.exec();
      archived += matching.length;
    }

    if (entries.length < batchSize) break;
    nextStart = nextExclusiveStreamId(entries[entries.length - 1][0]);
  }

  if (maxLen > 0) {
    await redis.xtrim(archiveStreamKey, 'MAXLEN', '~', maxLen);
  }

  return { archived, scanned, batches };
}

const lib = {
  get client() { return getRedis(); },

  setLogCallback(fn) { _logCallback = fn; },

  /**
   * Send a task to Buster's Redis stream.
   * Nova only dispatches to Buster via Redis (Forge/Echo use ACP).
   */
  async sendTask(targetAgent, type, payload, iteration = 1) {
    const myName = process.env.AGENT_NAME || 'nova';
    const redis = getRedis();

    if (redis.status !== 'ready') {
      await new Promise(resolve => redis.once('ready', resolve));
    }

    const id = await redis.xadd(BUSTER_STREAM, '*',
      'type', type,
      'sender', myName,
      'payload', JSON.stringify(payload),
      'iteration', iteration.toString(),
      'timestamp', Date.now().toString()
    );

    console.log(`[Redis] Sent ${id} to ${BUSTER_STREAM}`);
    emitLog({ op: 'dispatch', target: targetAgent, type, stream: BUSTER_STREAM, redis_id: id, payload_keys: Object.keys(payload), payload_size: JSON.stringify(payload).length });
    await logToDiscord(myName, 'buster', type, iteration, payload);
    return { status: 'sent', id, stream: BUSTER_STREAM };
  },

  // ── Pipeline Completion Stream Functions ──────────────────────────────────
  // Used by pipeline.js via direct import to avoid per-cycle subprocess spawns.
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
  async archiveCompletions(streamKey, archiveStreamKey, moduleId, maxLen = 1000) {
    const redis = getRedis();
    const result = await archiveCompletionsChunked(redis, streamKey, archiveStreamKey, moduleId, maxLen);
    emitLog({
      op: 'archive',
      stream: streamKey,
      archive_stream: archiveStreamKey,
      module: moduleId,
      archived: result.archived,
      scanned_entries: result.scanned,
      scan_batches: result.batches,
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

// --- CLI WRAPPER (Robust: Symlink-Aware + Async Exit) ---
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const getArg = (n) => { const i = args.indexOf('--'+n); return i>-1 ? args[i+1] : null; };
      const action = getArg('action');

      if (action === 'send') {
        const type = getArg('type');
        const iter = getArg('iteration') || '1';
        const payload = JSON.parse(getArg('payload') || '{}');
        if (!type) throw new Error('Missing --type');

        const res = await lib.sendTask('buster', type, payload, iter);
        console.log(JSON.stringify(res));

      } else if (action === 'read-completion') {
        const stream = getArg('stream');
        const module = getArg('module');
        if (!stream || !module) throw new Error('Missing --stream or --module');
        const res = await lib.readCompletion(stream, module, {
          run_id: getArg('run-id') || undefined,
          attempt: getArg('attempt') || undefined,
          dispatch_id: getArg('dispatch-id') || undefined,
          session_key: getArg('session-key') || undefined,
        });
        console.log(JSON.stringify(res, null, 2));

      } else if (action === 'archive-completions') {
        const stream = getArg('stream');
        const module = getArg('module');
        if (!stream || !module) throw new Error('Missing --stream or --module');
        const archiveStream = stream + ':log';
        const res = await lib.archiveCompletions(stream, archiveStream, module);
        console.log(JSON.stringify(res));

      } else {
        throw new Error('Unknown action. Use --action send|read-completion|archive-completions');
      }
    } catch (e) {
      console.error(JSON.stringify({ error: e.message }));
      process.exit(1);
    } finally {
      await lib.disconnect();
      process.exit(0);
    }
  })();
}
