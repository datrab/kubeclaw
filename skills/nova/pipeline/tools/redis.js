#!/usr/bin/env node
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';

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

async function logToDiscord(sender, target, type, iter, payload) {
  if (!WEBHOOK_URL) return;
  try {
    const raw = JSON.stringify(payload, null, 2);
    const header = `**${sender}** → **${target}**\nType: \`${type}\` | Iter: \`${iter}\``;
    const summaryFields = [];
    if (payload && typeof payload === 'object') {
      if (payload.project) summaryFields.push({ name: 'Project', value: String(payload.project), inline: true });
      if (payload.module) summaryFields.push({ name: 'Module', value: String(payload.module), inline: true });
      if (Array.isArray(payload.test_suites) && payload.test_suites.length) summaryFields.push({ name: 'Suites', value: payload.test_suites.join(', '), inline: true });
      if (target === 'buster' && type === 'module_test') {
        summaryFields.push({ name: 'Meaning', value: 'Queued for Buster only. This does not mean suites started or that a subagent exists yet.', inline: false });
      }
    }

    // If payload fits in one embed description (leave room for header + code fences)
    if (raw.length <= 3500) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `⚡ Task: ${sender} → ${target}`,
            color: 5763719,
            description: `${header}\n\n\`\`\`json\n${raw}\n\`\`\``,
            fields: summaryFields
          }]
        })
      });
    }
    // If payload is large, send header embed + payload as file attachment
    else {
      const boundary = '----FormBoundary' + Date.now();
      const payloadJson = JSON.stringify({
        embeds: [{
          title: `⚡ Task: ${sender} → ${target}`,
          color: 5763719,
          description: `${header}\n\n_Payload too large for embed — see attached file._`,
          fields: summaryFields
        }]
      });

      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="payload_json"',
        'Content-Type: application/json',
        '',
        payloadJson,
        `--${boundary}`,
        `Content-Disposition: form-data; name="files[0]"; filename="payload-${type}-${Date.now()}.json"`,
        'Content-Type: application/json',
        '',
        raw,
        `--${boundary}--`
      ].join('\r\n');

      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body
      });
    }
  } catch (e) { /* ignore */ }
}

const BUSTER_STREAM = 'swarm:buster:tasks';

// ─── Log Callback ──────────────────────────────────────────────────────────
// Set by pipeline.js after import to write Redis operations to redis.jsonl.
let _logCallback = null;

function emitLog(event) {
  if (_logCallback) {
    try { _logCallback({ ts: new Date().toISOString(), component: 'redis', ...event }); }
    catch { /* non-critical */ }
  }
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
   * @returns {object|null} - Completion entry or null
   */
  async readCompletion(streamKey, moduleId) {
    const redis = getRedis();
    const entries = await redis.xrange(streamKey, '-', '+', 'COUNT', 100);
    const match = entries
      .map(([id, fields]) => {
        const o = { _id: id };
        for (let i = 0; i < fields.length; i += 2) o[fields[i]] = fields[i + 1];
        return o;
      })
      .filter(e => e.type === 'completion' && e.module === moduleId)
      .pop();
    emitLog({ op: 'read_completion', stream: streamKey, module: moduleId, found: !!match, ...(match && { entry: { status: match.status, source: match.source, summary: match.summary?.slice(0, 200), commit_hash: match.commit_hash, redis_id: match._id } }) });
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
    const entries = await redis.xrange(streamKey, '-', '+', 'COUNT', 200);
    let archived = 0;
    for (const [id, fields] of entries) {
      const data = {};
      for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];
      if (data.module !== moduleId) continue;
      const archiveFields = [...fields, 'archived_at', Date.now().toString()];
      await redis.xadd(archiveStreamKey, '*', ...archiveFields);
      await redis.xdel(streamKey, id);
      archived++;
    }
    if (maxLen > 0) {
      await redis.xtrim(archiveStreamKey, 'MAXLEN', '~', maxLen);
    }
    emitLog({ op: 'archive', stream: streamKey, archive_stream: archiveStreamKey, module: moduleId, archived });
    return { archived };
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
        const res = await lib.readCompletion(stream, module);
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
