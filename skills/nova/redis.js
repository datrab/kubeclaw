#!/usr/bin/env node
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const Redis = require('ioredis');

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

    // If payload fits in one embed description (leave room for header + code fences)
    if (raw.length <= 3500) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `⚡ Task: ${sender} → ${target}`,
            color: 5763719,
            description: `${header}\n\n\`\`\`json\n${raw}\n\`\`\``
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
          description: `${header}\n\n_Payload too large for embed — see attached file._`
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

const lib = {
  get client() { return getRedis(); },

  async sendTask(targetAgent, type, payload, iteration = 1) {
    const streams = {
      'dev': 'swarm:forge:tasks', 'forge': 'swarm:forge:tasks',
      'review': 'swarm:echo:tasks', 'echo': 'swarm:echo:tasks',
      'test': 'swarm:buster:tasks', 'buster': 'swarm:buster:tasks'
    };

    const targetKey = targetAgent.toLowerCase();
    const streamKey = streams[targetKey];
    if (!streamKey) throw new Error(`Unknown target: ${targetAgent}`);

    const myName = process.env.AGENT_NAME || 'unknown';
    const redis = getRedis();

    if (redis.status !== 'ready') {
      await new Promise(resolve => redis.once('ready', resolve));
    }

    const id = await redis.xadd(streamKey, '*',
      'type', type,
      'sender', myName,
      'payload', JSON.stringify(payload),
      'iteration', iteration.toString(),
      'timestamp', Date.now().toString()
    );

    console.log(`[Redis] Sent ${id} to ${streamKey}`);
    await logToDiscord(myName, targetKey, type, iteration, payload);
    return { status: 'sent', id, stream: streamKey };
  },

  async readMyTasks(count = 1) {
    const myName = process.env.AGENT_NAME;
    if (!myName) throw new Error('Env AGENT_NAME missing');

    const streamKey = `swarm:${myName}:tasks`;
    const groupName = `${myName}-group`;
    const consumerName = `${myName}-${process.env.HOSTNAME || 'pod'}`;
    const redis = getRedis();

    try { await redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM'); }
    catch (e) { if (!e.message.includes('BUSYGROUP')) throw e; }

    return await redis.xreadgroup('GROUP', groupName, consumerName, 'COUNT', count, 'BLOCK', 2000, 'STREAMS', streamKey, '>');
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
        const target = getArg('target');
        const type = getArg('type');
        const iter = getArg('iteration') || '1';
        const payload = JSON.parse(getArg('payload') || '{}');
        if (!target || !type) throw new Error('Missing --target or --type');

        const res = await lib.sendTask(target, type, payload, iter);
        console.log(JSON.stringify(res));

      } else if (action === 'read') {
        const res = await lib.readMyTasks();
        console.log(JSON.stringify(res, null, 2));

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
        throw new Error('Unknown action. Use --action send|read|read-completion|archive-completions');
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
