#!/usr/bin/env node

// =============================================================================
// REDIS.JS — Swarm Agent Redis Communication Skill (Buster Version)
// =============================================================================
//
// Three modes:
//   send     — Send a task to another agent's Redis stream
//   read     — Read tasks from own stream
//   complete — Pipeline completion chain: verify → push → Redis signal
//
// The 'complete' action is the critical pipeline integration point:
//   1. Calls verify-task.js (scope check, revert violations, git push)
//   2. Sends structured completion message to pipeline's completion stream
//   3. The pipeline reads this stream and continues
//
// The agent MUST call 'complete' as its LAST action. After this call,
// the Processor will kill the subagent session.
//
// =============================================================================

import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';

const require = createRequire(import.meta.url);
const Redis = require('ioredis');

// ─── Config ─────────────────────────────────────────────────────────────────

let _redis = null;
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      host: process.env.REDIS_HOST || 'redis-master.default.svc.cluster.local',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true,
    });
    _redis.on('error', (err) => console.error('[Redis Error]', err.message));
  }
  return _redis;
}

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

// Stream trim size — keep last N entries for audit trail
const STREAM_MAX_LEN = 250;

// ─── Discord Logging ────────────────────────────────────────────────────────

async function logToDiscord(sender, target, type, iter, payload) {
  if (!WEBHOOK_URL) return;
  try {
    const raw = JSON.stringify(payload, null, 2);
    const header = `**${sender}** → **${target}**\nType: \`${type}\` | Iter: \`${iter}\``;

    if (raw.length <= 3500) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `⚡ Task: ${sender} → ${target}`,
            color: 5763719,
            description: `${header}\n\n\`\`\`json\n${raw}\n\`\`\``,
          }],
        }),
      });
    } else {
      const boundary = '----FormBoundary' + Date.now();
      const payloadJson = JSON.stringify({
        embeds: [{
          title: `⚡ Task: ${sender} → ${target}`,
          color: 5763719,
          description: `${header}\n\n_Payload too large for embed — see attached file._`,
        }],
      });

      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="payload_json"',
        'Content-Type: application/json',
        '', payloadJson,
        `--${boundary}`,
        `Content-Disposition: form-data; name="files[0]"; filename="payload-${type}-${Date.now()}.json"`,
        'Content-Type: application/json',
        '', raw,
        `--${boundary}--`,
      ].join('\r\n');

      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      });
    }
  } catch { /* ignore — Discord is non-critical */ }
}

// ─── Core Library ───────────────────────────────────────────────────────────

const lib = {
  get client() { return getRedis(); },

  /**
   * Send a task to another agent's Redis stream.
   */
  async sendTask(targetAgent, type, payload, iteration = 1) {
    const streams = {
      'dev': 'swarm:forge:tasks', 'forge': 'swarm:forge:tasks',
      'review': 'swarm:echo:tasks', 'echo': 'swarm:echo:tasks',
      'test': 'swarm:buster:tasks', 'buster': 'swarm:buster:tasks',
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

  /**
   * Read tasks from own stream (consumer group).
   */
  async readMyTasks(count = 1) {
    const myName = process.env.AGENT_NAME;
    if (!myName) throw new Error('Env AGENT_NAME missing');

    const streamKey = `swarm:${myName}:tasks`;
    const groupName = `${myName}-group`;
    const consumerName = `${myName}-${process.env.HOSTNAME || 'pod'}`;
    const redis = getRedis();

    try { await redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM'); }
    catch (e) { if (!e.message.includes('BUSYGROUP')) throw e; }

    return await redis.xreadgroup('GROUP', groupName, consumerName,
      'COUNT', count, 'BLOCK', 2000, 'STREAMS', streamKey, '>');
  },

  /**
   * Pipeline completion chain: verify → push → Redis signal.
   *
   * This is the LAST action a Buster subagent calls. After this:
   *   1. verify-task.js checks scope, reverts violations, pushes
   *   2. Completion message is written to the pipeline's Redis stream
   *   3. The Processor detects this and kills the subagent
   *
   * @param {object} opts
   * @param {string} opts.stream - Pipeline completion stream key
   * @param {string} opts.module - Module ID (e.g. '06')
   * @param {string} opts.project - Project name
   * @param {string} opts.status - Result: 'PASS', 'FAIL', 'ISSUES_FOUND'
   * @param {string} opts.summary - Brief result summary
   * @param {string} [opts.taskType] - 'module_test' or 'chaos_test'
   * @param {string} [opts.agentRole] - Agent role for verify (default: 'buster')
   */
  async complete(opts) {
    const {
      stream, module: moduleId, project, status, summary = '',
      taskType = 'module_test',
      agentRole = process.env.AGENT_ROLE || process.env.AGENT_NAME || 'buster',
    } = opts;

    if (!stream) throw new Error('complete: --stream required');
    if (!moduleId) throw new Error('complete: --module required');
    if (!project) throw new Error('complete: --project required');
    if (!status) throw new Error('complete: --status required (PASS, FAIL, ISSUES_FOUND)');

    // ── Step 1: verify-task.js → scope check + push ──
    console.log('[COMPLETE] Running verify-task.js...');
    let verifyResult;
    try {
      const verifyMod = await import('/app/skills/verify-task.js');
      verifyResult = await verifyMod.default(agentRole, project, {
        requireMemory: true,
        commitMessage: `[${agentRole.toUpperCase()}] Module ${moduleId}: ${status}`,
      });
      console.log(`[COMPLETE] Verify: ${verifyResult.status} (${verifyResult.action})`);

      // Log verify details
      if (verifyResult.logs?.length) {
        verifyResult.logs.forEach(l => console.log(`  ${l}`));
      }
    } catch (e) {
      console.error(`[COMPLETE] Verify failed: ${e.message}`);

      // Verify failure → still send completion so pipeline doesn't hang
      await this._sendCompletion(stream, {
        module: moduleId,
        task_type: taskType,
        status: 'FAIL',
        source: 'agent',
        reason: `verify-task.js failed: ${e.message}`,
        verify_status: 'error',
      });
      return { status: 'error', error: e.message };
    }

    // ── Step 2: Redis completion message ──
    console.log(`[COMPLETE] Sending completion to ${stream}...`);

    const completionData = {
      module: moduleId,
      task_type: taskType,
      status: status.toUpperCase(),
      source: 'agent',
      summary: summary.slice(0, 1000),
      commit_hash: verifyResult.commit_hash || getGitHash(),
      verify_action: verifyResult.action || 'unknown',
      verify_files_pushed: String(verifyResult.files_pushed || 0),
    };

    const result = await this._sendCompletion(stream, completionData);
    console.log(`[COMPLETE] ✅ Completion sent: ${result.id}`);
    return { status: 'sent', ...result };
  },

  /**
   * Internal: write completion entry to Redis stream with XTRIM.
   */
  async _sendCompletion(stream, data) {
    const redis = getRedis();
    if (redis.status !== 'ready') {
      await new Promise(resolve => redis.once('ready', resolve));
    }

    const fields = [];
    fields.push('type', 'completion');
    fields.push('timestamp', Date.now().toString());
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && val !== null) {
        fields.push(key, String(val));
      }
    }

    const id = await redis.xadd(stream, '*', ...fields);

    // Trim to keep last N entries (audit trail, no unbounded growth)
    try {
      await redis.xtrim(stream, 'MAXLEN', '~', STREAM_MAX_LEN);
    } catch { /* non-critical */ }

    return { id, stream };
  },

  async disconnect() {
    if (_redis) {
      await _redis.quit();
      _redis = null;
    }
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGitHash() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
}

// ─── CLI Wrapper ────────────────────────────────────────────────────────────

export default lib;

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = fs.existsSync(process.argv[1])
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const getArg = (n) => {
        const i = args.indexOf('--' + n);
        return i > -1 && args[i + 1] ? args[i + 1] : null;
      };
      const action = getArg('action');

      if (action === 'send') {
        // ── Legacy: send task to another agent ──
        const target = getArg('target');
        const type = getArg('type');
        const iter = getArg('iteration') || '1';
        const payload = JSON.parse(getArg('payload') || '{}');
        if (!target || !type) throw new Error('Missing --target or --type');

        const res = await lib.sendTask(target, type, payload, iter);
        console.log(JSON.stringify(res));

      } else if (action === 'read') {
        // ── Legacy: read tasks from own stream ──
        const res = await lib.readMyTasks();
        console.log(JSON.stringify(res, null, 2));

      } else if (action === 'complete') {
        // ── Pipeline completion: verify → push → Redis signal ──
        const res = await lib.complete({
          stream:    getArg('stream'),
          module:    getArg('module'),
          project:   getArg('project'),
          status:    getArg('status'),
          summary:   getArg('summary') || '',
          taskType:  getArg('task-type') || 'module_test',
          agentRole: getArg('role') || undefined,
        });
        console.log(JSON.stringify(res));

      } else {
        throw new Error(
          'Unknown action. Use --action send|read|complete\n\n' +
          'complete usage:\n' +
          '  node redis.js --action complete \\\n' +
          '    --stream <completion_stream> \\\n' +
          '    --module <module_id> \\\n' +
          '    --project <project_name> \\\n' +
          '    --status <PASS|FAIL|ISSUES_FOUND> \\\n' +
          '    --summary "brief result summary" \\\n' +
          '    [--task-type module_test|chaos_test] \\\n' +
          '    [--role buster]'
        );
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
