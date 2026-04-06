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
import path from 'path';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';

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

// ─── Config ─────────────────────────────────────────────────────────────────

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
   * Stream and project are auto-derived from CURRENT_PROJECT env var.
   * The completion stream is always: swarm:pipeline:<project>:completions
   *
   * @param {object} opts
   * @param {string} opts.module - Module or gate ID (e.g. '06', 'final-buster')
   * @param {string} opts.status - Result: 'PASS', 'FAIL'
   * @param {string} opts.summary - Brief result summary
   * @param {string} [opts.project] - Override project (default: CURRENT_PROJECT env)
   * @param {string} [opts.stream] - Override stream (default: derived from project)
   * @param {string} [opts.taskType] - 'module_test' or 'gate_test'
   * @param {string} [opts.agentRole] - Agent role for verify (default: 'buster')
   */
  async complete(opts) {
    const project = opts.project || process.env.CURRENT_PROJECT;
    if (!project) throw new Error('complete: project unknown (set --project or CURRENT_PROJECT env)');

    const stream = opts.stream || `swarm:pipeline:${project}:completions`;
    const moduleId = opts.module;
    const status = opts.status;
    const summary = opts.summary || '';
    const taskType = opts.taskType || 'module_test';
    const agentRole = opts.agentRole || process.env.AGENT_ROLE || process.env.AGENT_NAME || 'buster';
    const logPath = opts.logPath || null;
    const startTime = Date.now();

    // Structured completion log — accumulated and written at end
    const completionLog = {
      ts: null,
      operation: 'complete',
      module: moduleId,
      status,
      task_type: taskType,
      project,
      verify: null,
      verify_fallback_used: false,
      completion_entry: null,
      stream,
      redis_id: null,
      duration_ms: null,
    };

    if (!moduleId) throw new Error('complete: --module required');
    if (!status) throw new Error('complete: --status required (PASS, FAIL)');

    console.log(`[COMPLETE] project=${project} stream=${stream} module=${moduleId} status=${status}`);

    // ── Step 1: verify-task.js → scope check + push ──
    console.log('[COMPLETE] Running verify-task.js...');
    let verifyResult;
    try {
      const verifyMod = await import('/app/skills/verify-task.js');
      verifyResult = await verifyMod.default(agentRole, project, {
        commitMessage: `[${agentRole.toUpperCase()}] Module ${moduleId}: ${status}`,
      });
      console.log(`[COMPLETE] Verify: ${verifyResult.status} (${verifyResult.action})`);

      // Log verify details
      if (verifyResult.logs?.length) {
        verifyResult.logs.forEach(l => console.log(`  ${l}`));
      }
      completionLog.verify = { status: verifyResult.status, action: verifyResult.action, files_pushed: verifyResult.files_pushed || 0, commit_hash: verifyResult.commit_hash, logs: verifyResult.logs || [] };
    } catch (e) {
      console.error(`[COMPLETE] Verify failed: ${e.message}`);
      completionLog.verify = { status: 'error', error: e.message };
      completionLog.verify_fallback_used = true;

      // Proceed with commit+push despite verify failure (scope check + push still needed)
      try {
        const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
        let currentBranch;
        try {
          currentBranch = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
        } catch { currentBranch = 'HEAD'; }
        if (!currentBranch || currentBranch === 'HEAD') {
          try {
            const refs = execFileSync('git', ['-C', repoRoot, 'for-each-ref', '--format=%(refname:short)',
              '--sort=-committerdate', '--points-at=HEAD', 'refs/remotes/origin/'], { encoding: 'utf8' }).trim();
            const realRef = refs.split('\n').find(r => r && r !== 'origin/HEAD');
            currentBranch = realRef ? realRef.replace('origin/', '') : 'main';
          } catch { currentBranch = 'main'; }
        }

        execFileSync('git', ['-C', repoRoot, 'add', '-A'], { encoding: 'utf8', timeout: 10000, maxBuffer: 50 * 1024 * 1024 });
        execFileSync('git', ['-C', repoRoot, 'commit', '-m',
          `[${agentRole.toUpperCase()}] Module ${moduleId}: ${status} (verify-task error)`],
          { encoding: 'utf8', timeout: 10000, maxBuffer: 50 * 1024 * 1024 });

        // Push with rebase-before-each-attempt (handles concurrent pipeline pushes)
        let pushed = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            execFileSync('git', ['-C', repoRoot, 'pull', '--rebase', 'origin', currentBranch],
              { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 });
          } catch {
            try { execFileSync('git', ['-C', repoRoot, 'rebase', '--abort'], { encoding: 'utf8' }); } catch { /* ok */ }
            if (attempt < 3) { execFileSync('sleep', ['2']); continue; }
          }
          try {
            execFileSync('git', ['-C', repoRoot, 'push', 'origin', `HEAD:${currentBranch}`],
              { encoding: 'utf8', timeout: 60000, maxBuffer: 50 * 1024 * 1024 });
            pushed = true;
            break;
          } catch (e) {
            if (attempt < 3) { execFileSync('sleep', ['2']); continue; }
            throw e;
          }
        }
        console.log('[COMPLETE] Fallback commit+push succeeded');
      } catch (gitErr) {
        console.warn(`[COMPLETE] Fallback commit+push failed: ${gitErr.message}`);
      }

      // Send original status to Redis (not FAIL override)
      const fallbackResult = await lib._sendCompletion(stream, {
        module: moduleId,
        task_type: taskType,
        status: status.toUpperCase(),
        source: 'agent',
        reason: `verify-task.js failed: ${e.message}`,
        verify_status: 'error',
      });
      completionLog.completion_entry = { status: status.toUpperCase(), source: 'agent', reason: `verify-task.js failed` };
      completionLog.redis_id = fallbackResult.id;
      completionLog.ts = new Date().toISOString();
      completionLog.duration_ms = Date.now() - startTime;
      _writeCompletionLog(logPath, completionLog);
      return { status: 'sent', warning: e.message };
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

    const result = await lib._sendCompletion(stream, completionData);
    console.log(`[COMPLETE] ✅ Completion sent: ${result.id}`);
    completionLog.completion_entry = { status: completionData.status, source: 'agent', summary: completionData.summary?.slice(0, 200), commit_hash: completionData.commit_hash };
    completionLog.redis_id = result.id;
    completionLog.ts = new Date().toISOString();
    completionLog.duration_ms = Date.now() - startTime;
    _writeCompletionLog(logPath, completionLog);
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
    console.log(`[REDIS] XADD ${stream} → ${id} (fields: ${Object.keys(data).join(', ')})`);

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

function _writeCompletionLog(logPath, data) {
  if (!logPath) return;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(data, null, 2));
  } catch { /* non-critical */ }
}

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
        // --stream and --project are optional (derived from CURRENT_PROJECT env)
        const res = await lib.complete({
          module:    getArg('module'),
          status:    getArg('status'),
          summary:   getArg('summary') || '',
          project:   getArg('project') || undefined,
          stream:    getArg('stream') || undefined,
          taskType:  getArg('task-type') || 'module_test',
          agentRole: getArg('role') || undefined,
          logPath:   getArg('log-path') || undefined,
        });
        console.log(JSON.stringify(res));

      } else {
        throw new Error(
          'Unknown action. Use --action send|read|complete\n\n' +
          'complete usage:\n' +
          '  node redis.js --action complete \\\n' +
          '    --module <module_id> \\\n' +
          '    --status <PASS|FAIL> \\\n' +
          '    --summary "brief result summary" \\\n' +
          '    [--project <name>]      # default: CURRENT_PROJECT env\n' +
          '    [--stream <key>]        # default: swarm:pipeline:<project>:completions\n' +
          '    [--task-type module_test|gate_test]\n' +
          '    [--role buster]'
        );
      }
    } catch (e) {
      console.error(JSON.stringify({ error: e.message }));
      await lib.disconnect();
      process.exit(1);
    }
    await lib.disconnect();
    process.exit(0);
  })();
}
