const Redis = require('ioredis');
const { hostname } = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const AGENT_NAME      = process.env.AGENT_NAME    || 'unknown';
const STREAM_KEY      = `swarm:${AGENT_NAME}:tasks`;
const GROUP_NAME      = `${AGENT_NAME}-group`;
const CONSUMER_NAME   = `${AGENT_NAME}-processor-${hostname()}`;
const POLL_INTERVAL   = 2000;
const GATEWAY_URL     = 'http://127.0.0.1:18789/tools/invoke';
const GATEWAY_TOKEN   = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const WEBHOOK_URL     = process.env.DISCORD_WEBHOOK        || '';
const DISCORD_CHANNEL = process.env.DISCORD_CHANNEL        || '';
const MEMORY_BIN      = '/app/skills/memory.js';

// ═══════════════════════════════════════════════════════════════
// REDIS
// ═══════════════════════════════════════════════════════════════
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-master.default.svc.cluster.local',
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

async function notifyTaskResult(id, sender, taskType, success, errObj = null, memoryHits = 0, payload = null) {
  // Discord embed limits:
  //   description: 4096 chars
  //   field value:  1024 chars
  //   total embed:  6000 chars
  //
  // Strategy: metadata in fields, payload in description, errors in fields.
  // If payload > 3000 chars, send as file attachment instead.

  const fields = [
    { name: 'Task ID',  value: `\`${id}\``,       inline: true },
    { name: 'Type',     value: `\`${taskType}\``, inline: true },
    { name: 'Sender',   value: `\`${sender}\``,   inline: true },
  ];

  if (memoryHits > 0) {
    fields.push({ name: '🧠 Context', value: `${memoryHits} memories injected`, inline: true });
  }

  if (!success && errObj) {
    const message = String(errObj.message || errObj).slice(0, 950);
    fields.push({ name: '❌ Error', value: `\`\`\`\n${message}\n\`\`\`` });
    if (errObj.step) fields.push({ name: '📍 Step', value: `\`${errObj.step}\``, inline: true });
    if (errObj.httpStatus) fields.push({ name: 'HTTP', value: `\`${errObj.httpStatus}\``, inline: true });
  }

  const title = success
    ? `✅ Task Injected: ${sender} ➔ ${AGENT_NAME}`
    : `❌ Injection Failed: ${sender} ➔ ${AGENT_NAME}`;

  // Build description with full payload
  let description = '';
  if (payload) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    if (raw.length <= 3000) {
      description = `**Payload:**\n\`\`\`json\n${raw}\n\`\`\``;
    } else {
      // Payload too large for embed — send as file
      description = '_Payload attached as file (too large for embed)._';
      try {
        const boundary = '----FormBoundary' + Date.now();
        const embedJson = JSON.stringify({
          embeds: [{ title, color: success ? 5763719 : 15548997, description, fields,
            footer: { text: `Swarm Processor v4.0 • ${new Date().toISOString()}` }
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
        return; // Already sent with file, done
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
    footer: { text: `Swarm Processor v4.0 • ${new Date().toISOString()}` }
  });
}

// ═══════════════════════════════════════════════════════════════
// QDRANT RECALL (v2 — confidence-aware)
// ═══════════════════════════════════════════════════════════════

async function recallContext(taskType, sender, payload) {
  // Build query from task payload — same logic as before
  const queryParts = [taskType];
  if (payload && typeof payload === 'object') {
    for (const key of ['description', 'message', 'text', 'title', 'query', 'module']) {
      if (payload[key]) queryParts.push(String(payload[key]).slice(0, 200));
    }
  } else if (typeof payload === 'string') {
    queryParts.push(payload.slice(0, 200));
  }

  const query = queryParts.filter(Boolean).join(' ').slice(0, 500);
  if (query.length < 5) return [];

  // Build recall command args
  const cmdArgs = [MEMORY_BIN, 'recall', '--query', query, '--limit', '5'];

  // If the task payload includes a module, scope recall to it too
  if (payload?.module) {
    // Don't hard-filter by module — let vector similarity handle it.
    // But log it for debugging.
    console.log(`[MEMORY] Module context: ${payload.module}`);
  }

  try {
    console.log(`[MEMORY] Recalling: "${query.slice(0, 80)}..."`);
    const { stdout } = await execFileAsync('node', cmdArgs, {
      env: process.env,
      timeout: 15000
    });

    const results = JSON.parse(stdout);
    return results.length ? results : [];
  } catch (e) {
    console.warn(`[MEMORY] Recall failed: ${e.message}`);
    return [];
  }
}

function formatMemories(memories) {
  if (!memories.length) return '';

  const lines = memories.map((m, i) => {
    const conf = m.confidence ?? 0.5;
    const stars = conf >= 0.75 ? '★★★' : conf >= 0.45 ? '★★☆' : '★☆☆';
    const score = (m.score ?? 0).toFixed(2);
    const module = m.module ? `module:${m.module}` : '';
    const agent = m.agent ? `by:${m.agent}` : '';
    const meta = [module, agent].filter(Boolean).join(', ');
    const metaStr = meta ? ` _(${meta})_` : '';

    return `${i + 1}. [${stars} ${score}] ${m.text}${metaStr}`;
  });

  return [
    '',
    '---',
    '📎 **CONTEXT FROM SWARM MEMORY:**',
    '_(★★★ = validated pattern, ★★☆ = neutral, ★☆☆ = unverified)_',
    ...lines,
    '---'
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════
// GATEWAY INJECTION
// ═══════════════════════════════════════════════════════════════

function wantsDiscord(taskType, payload) {
  if (/discord/i.test(taskType)) return true;
  try {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return /discord/i.test(raw);
  } catch { return false; }
}

async function injectViaDiscord(prompt) {
  if (!DISCORD_CHANNEL) throw new Error('DISCORD_CHANNEL env var not set — cannot send direct Discord message');

  const requestBody = {
    tool: 'message',
    args: {
      action:  'send',
      target:  DISCORD_CHANNEL,
      message: prompt
    }
  };

  console.log(`[INJECT] mode=discord channel=${DISCORD_CHANNEL}`);

  const response = await fetch(GATEWAY_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GATEWAY_TOKEN}` },
    body:    JSON.stringify(requestBody)
  });

  const responseText = await response.text().catch(() => '(unreadable)');
  if (!response.ok) {
    const err = new Error(`Gateway returned ${response.status} ${response.statusText}`);
    err.step = 'gateway_http'; err.httpStatus = response.status; err.httpBody = responseText;
    throw err;
  }

  let result;
  try { result = JSON.parse(responseText); } catch { result = { raw: responseText }; }
  console.log(`[INJECT] ✅ Discord message sent: ${JSON.stringify(result).slice(0, 200)}`);
  return result;
}

async function injectViaCron(jobName, prompt) {
  const fireAt = new Date(Date.now() + 2000).toISOString();

  const requestBody = {
    tool: 'cron',
    action: 'add',
    sessionKey: 'main',
    args: {
      name:          jobName,
      schedule:      { kind: 'at', at: fireAt },
      payload:       { kind: 'systemEvent', text: prompt },
      sessionTarget: 'main',
      wakeMode:      'now',
      deleteAfterRun: true,
    }
  };

  console.log(`[INJECT] mode=cron job="${jobName}" fireAt=${fireAt}`);

  const response = await fetch(GATEWAY_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GATEWAY_TOKEN}` },
    body:    JSON.stringify(requestBody)
  });

  const responseText = await response.text().catch(() => '(unreadable)');
  if (!response.ok) {
    const err = new Error(`Gateway returned ${response.status} ${response.statusText}`);
    err.step = 'gateway_http'; err.httpStatus = response.status; err.httpBody = responseText;
    throw err;
  }

  let result;
  try { result = JSON.parse(responseText); } catch { result = { raw: responseText }; }
  console.log(`[INJECT] ✅ cron job scheduled: ${JSON.stringify(result).slice(0, 200)}`);
  return result;
}

async function injectIntoGateway(taskType, sender, payload, iteration, memories) {
  if (!GATEWAY_TOKEN) throw new Error('OPENCLAW_GATEWAY_TOKEN is not set');

  const nextIter    = parseInt(iteration) + 1;
  const memoryBlock = formatMemories(memories);
  const useDiscord  = wantsDiscord(taskType, payload);
  const jobName     = `swarm-${sender}-${taskType}-${Date.now()}`;

  console.log(`[INJECT] mode=${useDiscord ? 'discord' : 'cron'} task=${taskType}`);

  if (useDiscord) {
    const promptDiscord = [
      '⚠️ **Attention Needed** ⚠️',
      '',
      `From: **${sender}** | Type: **${taskType}** | Iteration: **${iteration}**`,
      '',
      '**PAYLOAD:**',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
      memoryBlock,
      ''
    ].join('\n');

    return injectViaDiscord(promptDiscord);

  } else {
    const promptCron = [
      '⚠️ **INCOMING SWARM TASK** ⚠️',
      '',
      `From: **${sender}** | Type: **${taskType}** | Iteration: **${iteration}**`,
      '',
      '**PAYLOAD:**',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
      memoryBlock,
      '',
      '**ANWEISUNG:**',
      '1. Bearbeite die Aufgabe.',
      `2. Falls Weiterleitung nötig: \`--iteration ${nextIter}\``,
      '',
      '⚠️ **MEMORY PFLICHT:** Speichere neue Erkenntnisse:',
      '`node /app/skills/memory.js remember --text "..." --tags "tag1,tag2" --scope project`',
      '',
      'Nutze `--module <mod>` wenn modulbezogen. Keine Enums nötig — freie Tags.',
      'Wenn du eine bestehende Erkenntnis korrigierst: `--supersedes <alte-id>`'
    ].join('\n');

    return injectViaCron(jobName, promptCron);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOOP
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
  const iteration = data.iteration || '1';

  console.log(`\n[TASK] ${id} | ${sender} ➔ ${AGENT_NAME}`);

  // Full payload log
  console.log(JSON.stringify(payload, null, 2));

  // 1. Recall context from Qdrant
  const memories = await recallContext(taskType, sender, payload);

  try {
    // 2. Inject into gateway
    await injectIntoGateway(taskType, sender, payload, iteration, memories);

    // 3. ACK & Delete
    await redis.xack(STREAM_KEY, GROUP_NAME, id);
    await redis.xdel(STREAM_KEY, id);

    await notifyTaskResult(id, sender, taskType, true, null, memories.length, payload);
    console.log(`[TASK] ✅ Done & Acked.`);

  } catch (err) {
    console.error(`[TASK] ❌ Failed: ${err.message}`);
    await notifyTaskResult(id, sender, taskType, false, err, memories.length, payload);
  }
}

async function main() {
  console.log('[PROCESSOR v4.0] Starting...');
  console.log(` Target Gateway: ${GATEWAY_URL}`);

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
