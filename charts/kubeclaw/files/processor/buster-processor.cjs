const Redis = require('ioredis');
const { hostname } = require('os');

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const AGENT_NAME      = process.env.AGENT_NAME    || 'buster';
const STREAM_KEY      = `swarm:${AGENT_NAME}:tasks`;
const GROUP_NAME      = `${AGENT_NAME}-group`;
const CONSUMER_NAME   = `${AGENT_NAME}-processor-${hostname()}`;
const POLL_INTERVAL   = 2000;
const GATEWAY_URL     = 'http://127.0.0.1:18789/tools/invoke';
const GATEWAY_TOKEN   = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const WEBHOOK_URL     = process.env.DISCORD_WEBHOOK        || '';

// Pipeline task types — all Buster tasks come through the pipeline
const PIPELINE_TASK_TYPES = ['module_test', 'gate_test'];

// Stream retention — keep last N entries for audit trail
const STREAM_MAX_LEN = 250;

// ACP session monitor poll interval (finer than pipeline's 30s)
const MONITOR_POLL_MS = 10000;

// ═══════════════════════════════════════════════════════════════
// REDIS
// ═══════════════════════════════════════════════════════════════
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-master.kubeclaw.svc.cluster.local',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 100, 5000),
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});

redis.on('error', (err) => console.error('[REDIS]', err.message));
redis.on('connect', ()  => console.log('[REDIS] Connected.'));

// ═══════════════════════════════════════════════════════════════
// DISCORD LOGGING
// ═══════════════════════════════════════════════════════════════
async function discord(embed) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) { console.error('[DISCORD]', e.message); }
}

async function notifyTaskResult(id, sender, taskType, success, errObj = null, payload = null) {
  const fields = [
    { name: 'Task ID',  value: `\`${id}\``,       inline: true },
    { name: 'Type',     value: `\`${taskType}\``, inline: true },
    { name: 'Sender',   value: `\`${sender}\``,   inline: true },
  ];

  if (!success && errObj) {
    const message = String(errObj.message || errObj).slice(0, 950);
    fields.push({ name: '❌ Error', value: `\`\`\`\n${message}\n\`\`\`` });
    if (errObj.step) fields.push({ name: '📍 Step', value: `\`${errObj.step}\``, inline: true });
    if (errObj.httpStatus) fields.push({ name: 'HTTP', value: `\`${errObj.httpStatus}\``, inline: true });
  }

  const title = success
    ? `✅ Task Dispatched: ${sender} ➔ ${AGENT_NAME}`
    : `❌ Dispatch Failed: ${sender} ➔ ${AGENT_NAME}`;

  let description = '';
  if (payload) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    if (raw.length <= 3000) {
      description = `**Payload:**\n\`\`\`json\n${raw}\n\`\`\``;
    } else {
      description = '_Payload attached as file (too large for embed)._';
      try {
        const boundary = '----FormBoundary' + Date.now();
        const embedJson = JSON.stringify({
          embeds: [{ title, color: success ? 5763719 : 15548997, description, fields,
            footer: { text: `Buster Processor v7.0 • ${new Date().toISOString()}` }
          }]
        });
        const body = [
          `--${boundary}`,
          'Content-Disposition: form-data; name="payload_json"',
          'Content-Type: application/json',
          '', embedJson,
          `--${boundary}`,
          `Content-Disposition: form-data; name="files[0]"; filename="payload-${taskType}-${Date.now()}.json"`,
          'Content-Type: application/json',
          '', raw,
          `--${boundary}--`
        ].join('\r\n');

        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body
        });
        return;
      } catch (e) {
        console.error('[DISCORD] File attach failed, falling back:', e.message);
        description = `**Payload (truncated):**\n\`\`\`json\n${raw.slice(0, 3000)}...\n\`\`\``;
      }
    }
  }

  await discord({
    title,
    color: success ? 5763719 : 15548997,
    description,
    fields,
    footer: { text: `Buster Processor v7.0 • ${new Date().toISOString()}` }
  });
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE TASK HANDLER (v7 — Pipeline Owns the Prompt)
// ═══════════════════════════════════════════════════════════════
//
// Pipeline.js builds the complete Buster prompt (context, instructions,
// completion protocol). The processor relays it to the gateway as an
// ACP session (runtime: "acp") and monitors for completion.
//
// ACP vs Subagent: Buster uses ACP because it needs a full coding harness
// (native filesystem access, shell context, code navigation) to handle
// large codebases with hundreds of files across modules.
//
// Flow:
//   1. Spawn ACP session via sessions_spawn with payload.instructions as task
//   2. Monitor: watch completion_stream for agent's redis.js signal
//   3. Kill session after completion (or on timeout)
//
// The agent's completion chain:
//   status.json → memory skill → redis.js complete → (processor kills session)
//

// ── ACP Session Spawn via Gateway ───────────────────────────────

async function spawnBusterSession(payload, prompt, timeoutSeconds) {
  if (!GATEWAY_TOKEN) throw new Error('OPENCLAW_GATEWAY_TOKEN is not set');

  const sessionConfig = payload.session || {};
  const label = sessionConfig.label || `buster-${payload.task_type}-${payload.module}-${Date.now()}`;

  // sessions_spawn with runtime: "acp" — see https://docs.openclaw.ai/tools/acp-agents
  // Required: task, runtime: "acp"
  // mode: "session" requires thread: true (persistent thread-bound conversation)
  // agentId: from pipeline payload (model-derived via modelToHarness), omit to use gateway acp.defaultAgent
  const agentId = sessionConfig.agentId || undefined;  // undefined = let gateway use acp.defaultAgent

  const spawnArgs = {
    task: prompt,
    runtime: 'acp',                        // ACP harness (Claude Code / Codex / Gemini CLI)
    label: label,
    thread: true,                          // Discord-Thread für Live-Sichtbarkeit
    mode: 'session',                       // Persistent thread-bound session
    runTimeoutSeconds: timeoutSeconds,      // Platform-Level Timeout
    cleanup: 'keep',                       // Transcript behalten für Post-Mortem
  };

  // Only set agentId if pipeline provided one (otherwise gateway uses acp.defaultAgent)
  if (agentId) spawnArgs.agentId = agentId;

  // cwd from pipeline — repo root so the harness can navigate the full codebase
  if (sessionConfig.cwd) spawnArgs.cwd = sessionConfig.cwd;

  // Model from pipeline (resolved via progress.json → swarm.config fallback)
  if (sessionConfig.model) {
    spawnArgs.model = sessionConfig.model;
  }

  console.log(`[SPAWN] ACP session: label=${label} agent=${agentId || 'gateway-default'} model=${spawnArgs.model || 'gateway-default'} cwd=${spawnArgs.cwd || 'default'} timeout=${timeoutSeconds}s`);

  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({
      tool: 'sessions_spawn',
      args: spawnArgs,
    }),
  });

  const responseText = await response.text().catch(() => '(unreadable)');
  if (!response.ok) {
    const err = new Error(`Spawn failed: ${response.status} ${response.statusText}`);
    err.step = 'spawn';
    err.httpStatus = response.status;
    err.httpBody = responseText;
    throw err;
  }

  let result;
  try { result = JSON.parse(responseText); } catch { result = { raw: responseText }; }

  // sessions_spawn returns: { status: "accepted", runId, childSessionKey }
  if (result.status !== 'accepted') {
    throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
  }

  console.log(`[SPAWN] ✅ ACP session spawned: key=${result.childSessionKey} run=${result.runId}`);

  return {
    childSessionKey: result.childSessionKey,
    runId: result.runId,
    label,
  };
}

// ── ACP Session Kill ────────────────────────────────────────────
// sessions_send with /stop terminates the ACP session.
// Parameter: sessionKey (required) — see https://docs.openclaw.ai/concepts/session-tool

async function killSession(childSessionKey) {
  try {
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        tool: 'sessions_send',
        args: { sessionKey: childSessionKey, message: '/stop' },
      }),
    });

    if (response.ok) {
      console.log(`[MONITOR] ✅ Killed ACP session: ${childSessionKey}`);
    } else {
      console.warn(`[MONITOR] Kill response: ${response.status} (session may have already exited)`);
    }
  } catch (e) {
    console.warn(`[MONITOR] Kill failed (session may have exited): ${e.message}`);
  }
}

// ── ACP Session Monitor (Supervisor Loop) ───────────────────────

async function monitorSession(payload, childSessionKey, runId, timeoutSeconds) {
  const completionStream = payload.completion_stream;
  const moduleId = payload.module;
  const startTime = Date.now();
  const deadline = startTime + (timeoutSeconds * 1000);

  console.log(`[MONITOR] Watching ${childSessionKey} | stream=${completionStream} | timeout=${timeoutSeconds}s`);

  await discord({
    title: `🔬 ACP Session Spawned: ${moduleId}`,
    color: 5763719,
    description: `**Session:** \`${childSessionKey}\`\n**Run:** \`${runId}\`\n**Type:** ${payload.task_type}`,
    footer: { text: `Buster Processor v7.0 • timeout ${timeoutSeconds}s` },
  });

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, MONITOR_POLL_MS));

    // ── Check Redis completion stream ──
    try {
      const entries = await redis.xrange(completionStream, '-', '+', 'COUNT', 50);
      
      // Find completion entry for this module
      for (const [entryId, fields] of entries) {
        const data = {};
        for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];

        if (data.type === 'completion' && data.module === moduleId) {
          const source = data.source || 'unknown';
          const status = data.status || 'UNKNOWN';

          console.log(`[MONITOR] ✅ Completion detected: module=${moduleId} status=${status} source=${source}`);

          await discord({
            title: `${status === 'PASS' ? '✅' : '❌'} ACP Session Complete: ${moduleId}`,
            color: status === 'PASS' ? 5763719 : 15548997,
            description: `**Status:** ${status}\n**Source:** ${source}\n**Summary:** ${(data.summary || '').slice(0, 500)}`,
            fields: [
              { name: 'Session', value: `\`${childSessionKey}\``, inline: true },
              { name: 'Commit', value: `\`${data.commit_hash || 'unknown'}\``, inline: true },
            ],
            footer: { text: `Buster Processor v7.0` },
          });

          // ── Kill ACP session — its job is done ──
          await killSession(childSessionKey);
          return;
        }
      }
    } catch (e) {
      // Redis errors are non-fatal — stream may not exist yet
      console.log(`[MONITOR] Redis check: ${e.message}`);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    console.log(`[MONITOR] ${childSessionKey} running... ${elapsed}s elapsed, ${remaining}s remaining`);
  }

  // ── Timeout — ACP session did not complete ──
  console.error(`[MONITOR] ⏰ TIMEOUT: ${childSessionKey} did not complete within ${timeoutSeconds}s`);

  await discord({
    title: `⏰ ACP Session Timeout: ${moduleId}`,
    color: 15548997,
    description: `ACP session did not complete within ${timeoutSeconds}s.\nSession: \`${childSessionKey}\``,
    footer: { text: `Buster Processor v7.0` },
  });

  // Send FAIL to completion stream so the pipeline doesn't wait forever
  try {
    const fields = [
      'type', 'completion',
      'module', moduleId,
      'task_type', payload.task_type || 'module_test',
      'status', 'FAIL',
      'source', 'processor',
      'reason', `Processor timeout: ACP session did not complete within ${timeoutSeconds}s`,
      'timestamp', Date.now().toString(),
    ];
    await redis.xadd(completionStream, '*', ...fields);
    await redis.xtrim(completionStream, 'MAXLEN', '~', STREAM_MAX_LEN);
    console.log(`[MONITOR] FAIL sent to ${completionStream}`);
  } catch (e) {
    console.error(`[MONITOR] Failed to send FAIL to stream: ${e.message}`);
  }

  // Kill the timed-out ACP session
  await killSession(childSessionKey);
}

// ── Pipeline Task Handler (v7 — ACP) ───────────────────────────

async function handlePipelineTask(payload) {
  const prompt = payload.instructions;
  if (!prompt) throw new Error(`No instructions in payload for ${payload.task_type}/${payload.module}`);

  const sessionConfig = payload.session || {};
  const timeoutSeconds = sessionConfig.timeout_seconds || 3600;

  console.log(`[PIPELINE] ${payload.task_type} for module ${payload.module}`);
  console.log(`[PIPELINE] Completion stream: ${payload.completion_stream}`);
  console.log(`[PIPELINE] Prompt size: ${prompt.length} chars`);

  // 0. Git sync — ensure repo is up-to-date before spawning the subagent
  const repoDir = '/home/node/.openclaw/workspace/git-repo';
  const expectedHash = payload.commit_hash || null;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['-C', repoDir, 'pull', '--rebase', 'origin', 'HEAD'], {
      encoding: 'utf8', timeout: 30000, stdio: 'pipe'
    });
    const currentHash = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8', timeout: 5000
    }).trim();
    const short = currentHash.substring(0, 8);
    if (expectedHash && !currentHash.startsWith(expectedHash.substring(0, 8))) {
      console.warn(`[GIT] ⚠️ Hash mismatch: expected ${expectedHash.substring(0, 8)}, got ${short} — proceeding with latest`);
    } else {
      console.log(`[GIT] ✅ Repo synced: ${short}`);
    }
  } catch (e) {
    console.error(`[GIT] ⚠️ Pull failed (proceeding anyway): ${e.message}`);
  }

  // 1. Spawn ACP session (thread-bound for Discord visibility)
  const { childSessionKey, runId } = await spawnBusterSession(payload, prompt, timeoutSeconds);

  // 2. Monitor until completion or timeout, then kill session
  await monitorSession(payload, childSessionKey, runId, timeoutSeconds);

  console.log(`[PIPELINE] ✅ Pipeline task complete for module ${payload.module}`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOOP — All tasks are pipeline tasks (ACP session spawn)
// ═══════════════════════════════════════════════════════════════
async function processOne() {
  const results = await redis.xreadgroup('GROUP', GROUP_NAME, CONSUMER_NAME, 'COUNT', 1, 'BLOCK', POLL_INTERVAL, 'STREAMS', STREAM_KEY, '>');
  if (!results) return;

  const [id, fields] = results[0][1][0];
  const data = {};
  for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];

  let payload = {};
  try { payload = JSON.parse(data.payload || '{}'); } catch {}

  const taskType  = data.type || 'unknown';
  const sender    = data.sender || 'unknown';

  console.log(`\n[TASK] ${id} | ${sender} ➔ ${AGENT_NAME} | type=${taskType}`);

  // Resolve effective task type (stream-level or payload-level)
  const effectiveType = PIPELINE_TASK_TYPES.includes(payload.task_type)
    ? payload.task_type
    : taskType;

  if (!PIPELINE_TASK_TYPES.includes(effectiveType)) {
    console.warn(`[TASK] ⚠️ Unknown task type: ${effectiveType} — skipping (expected: ${PIPELINE_TASK_TYPES.join(', ')})`);
    await redis.xack(STREAM_KEY, GROUP_NAME, id);
    await notifyTaskResult(id, sender, taskType, false, { message: `Unknown task type: ${effectiveType}` }, payload);
    return;
  }

  console.log(`[TASK] Pipeline task: ${effectiveType}`);

  try {
    // 1. Spawn ACP session, monitor, kill
    await handlePipelineTask(payload);

    // 2. ACK + Trim (no XDEL — keep entries for audit trail)
    await redis.xack(STREAM_KEY, GROUP_NAME, id);
    await redis.xtrim(STREAM_KEY, 'MAXLEN', '~', STREAM_MAX_LEN);

    await notifyTaskResult(id, sender, taskType, true, null, payload);
    console.log(`[TASK] ✅ Done & Acked.`);

  } catch (err) {
    console.error(`[TASK] ❌ Failed: ${err.message}`);
    // Still ACK so we don't reprocess forever on persistent errors
    try { await redis.xack(STREAM_KEY, GROUP_NAME, id); } catch {}
    await notifyTaskResult(id, sender, taskType, false, err, payload);
  }
}

async function main() {
  console.log('[PROCESSOR v7.0] Starting (Buster — ACP Pipeline)...');
  console.log(` Agent: ${AGENT_NAME}`);
  console.log(` Stream: ${STREAM_KEY}`);
  console.log(` Gateway: ${GATEWAY_URL}`);
  console.log(` Pipeline task types: ${PIPELINE_TASK_TYPES.join(', ')}`);
  console.log(` Monitor poll: ${MONITOR_POLL_MS}ms`);
  console.log(` Stream retention: ~${STREAM_MAX_LEN} entries`);

  try {
    await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '0', 'MKSTREAM');
  } catch (e) {
    if (!e.message?.includes('BUSYGROUP')) throw e;
  }

  while (true) {
    try { await processOne(); }
    catch (e) { console.error('[LOOP]', e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
}

main();
