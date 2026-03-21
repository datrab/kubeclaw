// ═══════════════════════════════════════════════════════════════
// Buster Orchestrator v1.0 — Replaces Processor Sidecar
// ═══════════════════════════════════════════════════════════════
//
// Runs as background process in the Gateway container (not a sidecar).
// Full access to Podman, Playwright, nginx, /sandbox.
//
// Flow per task:
//   1. Redis XREADGROUP → receive task
//   2. sandbox-cleanup (clean slate)
//   3. git pull --rebase
//   4. Save prompt to file (audit)
//   5. suite-runner.js (build + health + configured suites)
//   6. Decision: NO_SUBAGENT → direct FAIL | SPAWN → enrich prompt
//   7. Timeout calculation (total - suite time - buffer)
//   8. ACP session spawn + monitor
//   9. Cleanup + ACK
//
// Start: node /app/skills/buster-orchestrator.js &
//        (launched alongside gateway in buster-values.yaml)

const Redis = require('ioredis');
const { hostname } = require('os');
const path  = require('path');
const fs    = require('fs');
const { execFile, exec } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const execAsync     = promisify(exec);

const { runSuites }    = require('./suite-runner.cjs');
const { RECOMMENDATION, truncateForPrompt } = require('./verdict-schema.cjs');

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const AGENT_NAME      = process.env.AGENT_NAME    || 'buster';
const STREAM_KEY      = `swarm:${AGENT_NAME}:tasks`;
const GROUP_NAME      = `${AGENT_NAME}-group`;
const CONSUMER_NAME   = `${AGENT_NAME}-orchestrator-${hostname()}`;
const POLL_INTERVAL   = 2000;
const GATEWAY_URL     = 'http://127.0.0.1:18789/tools/invoke';
const GATEWAY_TOKEN   = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const WEBHOOK_URL     = process.env.DISCORD_WEBHOOK        || '';
const REPO_DIR        = '/home/node/.openclaw/workspace/git-repo';
const RESULTS_DIR     = '/sandbox/results';

const PIPELINE_TASK_TYPES = ['module_test', 'gate_test'];
const STREAM_MAX_LEN      = 250;
const MONITOR_POLL_MS     = 10000;

// Gateway readiness
const GATEWAY_HEALTH_URL      = 'http://127.0.0.1:18789/health';
const GATEWAY_READY_TIMEOUT   = 120000; // 120s max wait
const GATEWAY_READY_INTERVAL  = 3000;   // poll every 3s
const GATEWAY_HEALTH_INTERVAL = 60000;  // periodic check every 60s

// Suite defaults
const DEFAULT_SUITES = ['build', 'health'];
const DEFAULT_CONFIG = { serve: { type: 'static' } };

// Timeout buffer for cleanup + spawn overhead
const TIMEOUT_BUFFER_SECONDS = 60;

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let activeSessionKey = null;  // Currently running ACP session (for SIGTERM cleanup)
let shuttingDown = false;

const STATE = {
  status: 'starting',
  startedAt: Date.now(),
  currentModule: null,
  currentStep: null,
  lastTask: null,
  tasksTotal: 0,
  tasksPassed: 0,
  tasksFailed: 0,
};

function setStep(step) {
  STATE.currentStep = step;
  console.log(`[STEP] ▶ ${step}`);
}

// ═══════════════════════════════════════════════════════════════
// BASE IMAGES — Pre-pulled at startup via ensureBaseImages()
// ═══════════════════════════════════════════════════════════════

const BASE_IMAGES_STATIC = [
  'docker.io/library/python:3.12-slim',
  'docker.io/library/python:3.11-slim',
  'docker.io/library/node:20-slim',
];

const BASE_IMAGES = new Set(BASE_IMAGES_STATIC);

/**
 * Load additional base images from progress.json at startup.
 * Reads serve.image from all modules and normalises bare names to FQN.
 */
function loadBaseImagesFromProgress() {
  try {
    const progressPath = path.join(REPO_DIR, '.swarm', 'progress.json');
    if (!fs.existsSync(progressPath)) return;
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));

    // Explicit base_images field
    if (Array.isArray(progress.base_images)) {
      for (const img of progress.base_images) BASE_IMAGES.add(normaliseImage(img));
    }

    // Auto-detect from modules[*].test_config.serve.image
    if (progress.modules) {
      for (const mod of Object.values(progress.modules)) {
        const img = mod.test_config?.serve?.image;
        if (img) {
          // Skip locally-built tags (e.g. kubecommand-backend:m01)
          if (!img.includes('/') && !img.startsWith('docker.io')) continue;
          BASE_IMAGES.add(normaliseImage(img));
        }
      }
    }

    console.log(`[BASE_IMAGES] ${BASE_IMAGES.size} images protected: ${[...BASE_IMAGES].join(', ')}`);
  } catch (e) {
    console.warn(`[BASE_IMAGES] Failed to load from progress.json: ${e.message}`);
  }
}

function normaliseImage(name) {
  // docker.io/library/ prefix for bare names like "python:3.12-slim"
  if (!name.includes('/')) return `docker.io/library/${name}`;
  return name;
}

// ═══════════════════════════════════════════════════════════════
// REDIS
// ═══════════════════════════════════════════════════════════════

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-master.kubeclaw.svc.cluster.local',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 100, 5000),
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
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
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) { console.error('[DISCORD]', e.message); }
}

async function notifyTaskResult(id, sender, taskType, success, errObj = null) {
  const fields = [
    { name: 'Task ID',  value: `\`${id}\``,       inline: true },
    { name: 'Type',     value: `\`${taskType}\``, inline: true },
    { name: 'Sender',   value: `\`${sender}\``,   inline: true },
  ];

  if (!success && errObj) {
    const message = String(errObj.message || errObj).slice(0, 950);
    fields.push({ name: '❌ Error', value: `\`\`\`\n${message}\n\`\`\`` });
    if (errObj.step) fields.push({ name: '📍 Step', value: `\`${errObj.step}\``, inline: true });
  }

  await discord({
    title: success
      ? `✅ Task Complete: ${sender} ➔ ${AGENT_NAME}`
      : `❌ Task Failed: ${sender} ➔ ${AGENT_NAME}`,
    color: success ? 5763719 : 15548997,
    fields,
    footer: { text: `Buster Orchestrator v1.0 • ${new Date().toISOString()}` },
  });
}

async function notifySuiteResults(moduleId, verdict) {
  const lines = Object.entries(verdict.suites).map(([name, s]) => {
    const icon = s.status === 'PASS' ? '✅' :
                 s.status === 'FAIL' ? '❌' :
                 s.status === 'SKIP' ? '⏭' : '💥';
    let line = `${icon} ${name.padEnd(10)} — ${s.status}`;
    if (s.duration_ms) line += ` (${(s.duration_ms / 1000).toFixed(1)}s)`;
    if (s.reason) line += `\n   ${s.reason}`;
    if (s.status === 'FAIL' && s.findings?.[0]) {
      line += `\n   ${s.findings[0].message.slice(0, 120)}`;
    }
    return line;
  }).join('\n');

  const action = verdict.recommendation === RECOMMENDATION.NO_SUBAGENT
    ? '→ No subagent. FAIL reported to pipeline.'
    : '→ Spawning Subagent (results injected)';

  const title = verdict.critical_failure
    ? `❌ Pre-Test FAIL: Module ${moduleId}`
    : `🔬 Pre-Test Results: Module ${moduleId}`;

  await discord({
    title,
    color: verdict.critical_failure ? 15548997 : 5763719,
    description: `\`\`\`\n${lines}\n\`\`\`\n${action}`,
    footer: { text: `Buster Orchestrator v1.0 • ${verdict.duration_ms}ms total` },
  });
}

// ═══════════════════════════════════════════════════════════════
// GATEWAY HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

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
      return true;
    }
    await new Promise(r => setTimeout(r, GATEWAY_READY_INTERVAL));
  }

  console.error('[GATEWAY] ❌ Gateway not ready within timeout. Exiting.');
  process.exit(1);
}

// Periodic health check — if gateway dies, orchestrator exits → pod restart
const GATEWAY_HEALTH_MAX_FAILURES = 3; // consecutive failures before exit

function startGatewayHealthMonitor() {
  let consecutiveFailures = 0;
  setInterval(async () => {
    if (shuttingDown) return;
    const healthy = await checkGatewayHealth();
    if (!healthy) {
      consecutiveFailures++;
      console.warn(`[GATEWAY] ⚠️ Health check failed (${consecutiveFailures}/${GATEWAY_HEALTH_MAX_FAILURES})`);
      if (consecutiveFailures >= GATEWAY_HEALTH_MAX_FAILURES) {
        console.error('[GATEWAY] ❌ Gateway unreachable after 3 consecutive checks. Exiting.');
        process.exit(1);
      }
    } else {
      if (consecutiveFailures > 0) {
        console.log(`[GATEWAY] ✅ Recovered after ${consecutiveFailures} failed check(s).`);
      }
      consecutiveFailures = 0;
    }
  }, GATEWAY_HEALTH_INTERVAL);
}

// ═══════════════════════════════════════════════════════════════
// SANDBOX HELPERS
// ═══════════════════════════════════════════════════════════════

async function sandboxCleanup() {
  console.log('[CLEANUP] Running sandbox cleanup...');
  try {
    // 1. Stop + remove all containers
    await execAsync('podman stop -a 2>/dev/null; podman rm -a -f 2>/dev/null', {
      timeout: 30000, encoding: 'utf8',
    }).catch(() => {});

    // 2. Remove dangling images only (<none>:<none> from rebuilt tags)
    await execAsync('podman image prune -f 2>/dev/null', {
      timeout: 10000, encoding: 'utf8',
    }).catch(() => {});

    // 3. Clear sandbox directories
    await execAsync('rm -rf /sandbox/www/* /sandbox/results/*', {
      timeout: 5000, encoding: 'utf8',
    }).catch(() => {});

    // 4. Stop nginx
    await execAsync('nginx -s stop 2>/dev/null', {
      timeout: 5000, encoding: 'utf8',
    }).catch(() => {});

    console.log('[CLEANUP] ✅ Done.');
  } catch (e) {
    console.warn(`[CLEANUP] ⚠️ ${e.message}`);
  }
}

/**
 * Pre-pull missing base images at startup.
 * Checks each non-local BASE_IMAGE with `podman image exists`,
 * only pulls if not already local.
 */
async function ensureBaseImages() {
  console.log('[BASE_IMAGES] Ensuring base images are cached...');
  for (const img of BASE_IMAGES) {
    // Skip locally-built tags (e.g. kubecommand-backend:m01)
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

async function gitSync(expectedHash) {
  console.log('[GIT] Syncing repo...');
  try {
    // Always fetch latest refs
    await execFileAsync('git', ['-C', REPO_DIR, 'fetch', 'origin'], {
      encoding: 'utf8', timeout: 30000,
    });

    // Keep main branch ref in sync with origin
    await execFileAsync('git', ['-C', REPO_DIR, 'checkout', 'main'], {
      encoding: 'utf8', timeout: 15000,
    }).catch(() => {}); // may fail if already on main or detached — ok
    await execFileAsync('git', ['-C', REPO_DIR, 'reset', '--hard', 'origin/main'], {
      encoding: 'utf8', timeout: 15000,
    });

    if (expectedHash) {
      // Deterministic: checkout exact commit from pipeline
      await execFileAsync('git', ['-C', REPO_DIR, 'checkout', expectedHash], {
        encoding: 'utf8', timeout: 15000,
      });
      console.log(`[GIT] ✅ Checked out exact commit: ${expectedHash.substring(0, 8)}`);
      return expectedHash;
    }

    // No hash provided (e.g. gate_test) — pull current tracking branch
    await execFileAsync('git', ['-C', REPO_DIR, 'pull', '--rebase', 'origin'], {
      encoding: 'utf8', timeout: 30000,
    });
    const currentHash = (await execFileAsync('git', ['-C', REPO_DIR, 'rev-parse', 'HEAD'], {
      encoding: 'utf8', timeout: 5000,
    })).stdout.trim();
    console.log(`[GIT] ✅ Pulled latest: ${currentHash.substring(0, 8)}`);
    return currentHash;
  } catch (e) {
    console.error(`[GIT] ⚠️ Sync failed: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// PROMPT ENRICHMENT
// ═══════════════════════════════════════════════════════════════

function enrichPrompt(originalPrompt, verdict, serveConfig) {
  const type = serveConfig?.type || 'static';
  const port = type === 'server' ? (serveConfig?.port || 3000) : 9999;
  const url  = `http://localhost:${port}`;

  // Truncate findings for prompt (top 5 per suite)
  const truncated = truncateForPrompt(verdict, 5);

  // Build the pre-test results block
  const preTestBlock = [
    '## Pre-Test Results (automatically executed — no action required)',
    '',
    `The app is already running on ${url} — you do NOT need to build or serve.`,
    '',
    '```json',
    JSON.stringify(truncated, null, 2),
    '```',
    '',
    `Full report: ${RESULTS_DIR}/runner-verdict.json`,
    '',
    '---',
    '',
  ].join('\n');

  // Inject before the original prompt
  return preTestBlock + originalPrompt;
}

// ═══════════════════════════════════════════════════════════════
// ACP SESSION — Spawn, Monitor, Kill
// ═══════════════════════════════════════════════════════════════
// Carried over from buster-processor.cjs v7.0 with minimal changes.

async function spawnBusterSession(payload, prompt, timeoutSeconds) {
  if (!GATEWAY_TOKEN) throw new Error('OPENCLAW_GATEWAY_TOKEN is not set');

  const sessionConfig = payload.session || {};
  const label = sessionConfig.label || `buster-${payload.task_type}-${payload.module}-${Date.now()}`;

  const agentId = sessionConfig.agentId || undefined;

  const spawnArgs = {
    task: prompt,
    runtime: 'acp',
    label,
    thread: false,
    mode: 'run',
    runTimeoutSeconds: timeoutSeconds,
    cleanup: 'keep',
  };

  if (agentId) spawnArgs.agentId = agentId;
  if (sessionConfig.cwd) spawnArgs.cwd = sessionConfig.cwd;
  if (sessionConfig.model) spawnArgs.model = sessionConfig.model;

  console.log(`[SPAWN] ACP session: label=${label} agent=${agentId || 'gateway-default'} model=${spawnArgs.model || 'gateway-default'} timeout=${timeoutSeconds}s`);

  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({ tool: 'sessions_spawn', args: spawnArgs }),
  });

  const responseText = await response.text().catch(() => '(unreadable)');
  if (!response.ok) {
    const err = new Error(`Spawn failed: ${response.status} ${response.statusText}`);
    err.step = 'spawn';
    err.httpStatus = response.status;
    err.detail = responseText;
    throw err;
  }

  let result;
  try {
    const raw = JSON.parse(responseText);
    result = raw?.result?.details || raw;
  } catch { result = { raw: responseText }; }

  if (result.status !== 'accepted') {
    throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
  }

  console.log(`[SPAWN] ✅ Session spawned: key=${result.childSessionKey} run=${result.runId}`);

  return {
    childSessionKey: result.childSessionKey,
    runId: result.runId,
    label,
  };
}

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
      console.log(`[MONITOR] ✅ Killed session: ${childSessionKey}`);
    } else {
      console.warn(`[MONITOR] Kill response: ${response.status} (session may have exited)`);
    }
  } catch (e) {
    console.warn(`[MONITOR] Kill failed: ${e.message}`);
  }
}

async function monitorSession(payload, childSessionKey, runId, timeoutSeconds) {
  const completionStream = payload.completion_stream;
  const moduleId = payload.module;
  const startTime = Date.now();
  const deadline = startTime + (timeoutSeconds * 1000);

  console.log(`[MONITOR] Watching ${childSessionKey} | stream=${completionStream} | timeout=${timeoutSeconds}s`);

  activeSessionKey = childSessionKey;

  await discord({
    title: `🔬 ACP Session Spawned: ${moduleId}`,
    color: 5763719,
    description: `**Session:** \`${childSessionKey}\`\n**Run:** \`${runId}\`\n**Type:** ${payload.task_type}`,
    footer: { text: `Buster Orchestrator v1.0 • timeout ${timeoutSeconds}s` },
  });

  let lastSeenId = '0-0'; // Track position — only read new entries each poll

  while (Date.now() < deadline) {
    if (shuttingDown) {
      console.log('[MONITOR] Shutdown signal — killing session.');
      await killSession(childSessionKey);
      activeSessionKey = null;
      return;
    }

    await new Promise(r => setTimeout(r, MONITOR_POLL_MS));

    // Check Redis completion stream (incremental — only entries after lastSeenId)
    try {
      const exclusiveStart = lastSeenId === '0-0' ? '-' : `(${lastSeenId}`;
      const entries = await redis.xrange(completionStream, exclusiveStart, '+', 'COUNT', 50);

      for (const [entryId, fields] of entries) {
        lastSeenId = entryId;
        const data = {};
        for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];

        if (data.type === 'completion' && data.module === moduleId) {
          const source = data.source || 'unknown';
          const status = data.status || 'UNKNOWN';

          console.log(`[MONITOR] ✅ Completion: module=${moduleId} status=${status} source=${source}`);

          await discord({
            title: `${status === 'PASS' ? '✅' : '❌'} ACP Session Complete: ${moduleId}`,
            color: status === 'PASS' ? 5763719 : 15548997,
            description: `**Status:** ${status}\n**Source:** ${source}\n**Summary:** ${(data.summary || '').slice(0, 500)}`,
            fields: [
              { name: 'Session', value: `\`${childSessionKey}\``, inline: true },
              { name: 'Commit', value: `\`${data.commit_hash || 'unknown'}\``, inline: true },
            ],
            footer: { text: `Buster Orchestrator v1.0` },
          });

          await killSession(childSessionKey);
          activeSessionKey = null;
          return;
        }
      }
    } catch (e) {
      console.log(`[MONITOR] Redis check: ${e.message}`);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    console.log(`[MONITOR] ${childSessionKey} running... ${elapsed}s elapsed, ${remaining}s remaining`);
  }

  // Timeout
  console.error(`[MONITOR] ⏰ TIMEOUT: ${childSessionKey} did not complete within ${timeoutSeconds}s`);

  await discord({
    title: `⏰ ACP Session Timeout: ${moduleId}`,
    color: 15548997,
    description: `Session did not complete within ${timeoutSeconds}s.\nSession: \`${childSessionKey}\``,
    footer: { text: `Buster Orchestrator v1.0` },
  });

  // Send FAIL to completion stream
  try {
    const fields = [
      'type', 'completion',
      'module', moduleId,
      'task_type', payload.task_type || 'module_test',
      'status', 'FAIL',
      'source', 'orchestrator',
      'reason', `Orchestrator timeout: session did not complete within ${timeoutSeconds}s`,
      'timestamp', Date.now().toString(),
    ];
    await redis.xadd(completionStream, '*', ...fields);
    await redis.xtrim(completionStream, 'MAXLEN', '~', STREAM_MAX_LEN);
    console.log(`[MONITOR] FAIL sent to ${completionStream}`);
  } catch (e) {
    console.error(`[MONITOR] Failed to send FAIL: ${e.message}`);
  }

  await killSession(childSessionKey);
  activeSessionKey = null;
}

// ═══════════════════════════════════════════════════════════════
// PROCESS TASK — The core orchestration logic
// ═══════════════════════════════════════════════════════════════

async function processTask(payload) {
  const moduleId = payload.module;
  const prompt   = payload.instructions;
  if (!prompt) throw new Error(`No instructions in payload for ${payload.task_type}/${moduleId}`);

  const sessionConfig    = payload.session || {};
  const totalTimeout     = sessionConfig.timeout_seconds || 18000;
  const completionStream = payload.completion_stream;

  // Suite config from pipeline (via progress.json)
  const suiteList = payload.test_suites || DEFAULT_SUITES;
  const testConfig = payload.test_config || DEFAULT_CONFIG;

  console.log(`\n[TASK] ═══════════════════════════════════════════════════════`);
  console.log(`[TASK]   Module:     ${moduleId}`);
  console.log(`[TASK]   Type:       ${payload.task_type}`);
  console.log(`[TASK]   Project:    ${payload.project || 'unknown'}`);
  console.log(`[TASK]   Suites:     [${suiteList.join(', ')}]`);
  console.log(`[TASK]   Serve:      ${testConfig.serve?.type || 'static'}`);
  console.log(`[TASK]   Timeout:    ${totalTimeout}s`);
  console.log(`[TASK]   Stream:     ${completionStream}`);
  console.log(`[TASK]   Commit:     ${payload.commit_hash || '(latest)'}`);
  console.log(`[TASK]   Prompt:     ${prompt.length} chars`);
  console.log(`[TASK] ═══════════════════════════════════════════════════════`);

  STATE.currentModule = moduleId;
  STATE.tasksTotal++;
  const taskStartTime = Date.now();

  // ── Step 0: Sandbox Cleanup (clean slate) ──
  setStep('sandbox-cleanup');
  await sandboxCleanup();

  // ── Step 1: Git Pull ──
  setStep('git-sync');
  await gitSync(payload.commit_hash);

  // ── Step 2: Save prompt to file (audit/debug) ──
  setStep('save-prompt');
  const promptPath = `/tmp/buster-task-${moduleId}-${Date.now()}.md`;
  try {
    fs.writeFileSync(promptPath, prompt);
    console.log(`[TASK] Prompt saved: ${promptPath}`);
  } catch (e) {
    console.warn(`[TASK] Prompt save failed: ${e.message}`);
  }

  // ── Step 3+4: Run Suites (build + serve + health + ...) ──
  setStep('suite-runner');
  // build.js handles both compilation and serving.
  // health.js checks if the app responds.
  // All configured suites run sequentially with dependency ordering.

  console.log('[SUITE] Starting suite-runner...');
  const suiteStartTime = Date.now();

  // Determine swarm results dir for git persistence
  const modulePath = payload.module_path || null;
  const swarmResultsDir = modulePath
    ? path.join(REPO_DIR, modulePath, 'test-results')
    : null;

  const verdict = await runSuites({
    module: moduleId,
    project: payload.project || 'unknown',
    suites: suiteList,
    config: { ...DEFAULT_CONFIG, ...testConfig },
    swarmResultsDir,
  });

  const suiteTimeSeconds = Math.ceil((Date.now() - suiteStartTime) / 1000);
  console.log(`[SUITE] Complete: ${verdict.overall_status} → ${verdict.recommendation} (${suiteTimeSeconds}s)`);

  // ── Discord: Suite Results ──
  await notifySuiteResults(moduleId, verdict);

  // ── Step 5: Decision ──
  setStep('decision');
  if (verdict.recommendation === RECOMMENDATION.NO_SUBAGENT) {
    console.log(`[TASK] ❌ Critical failure — skipping subagent, sending FAIL to pipeline.`);

    // Send FAIL to completion stream
    try {
      const fields = [
        'type', 'completion',
        'module', moduleId,
        'task_type', payload.task_type || 'module_test',
        'status', 'FAIL',
        'source', 'orchestrator',
        'reason', `Pre-test critical failure: ${verdict.summary}`,
        'summary', verdict.summary,
        'timestamp', Date.now().toString(),
      ];
      await redis.xadd(completionStream, '*', ...fields);
      await redis.xtrim(completionStream, 'MAXLEN', '~', STREAM_MAX_LEN);
      console.log(`[TASK] FAIL sent to ${completionStream}`);
    } catch (e) {
      console.error(`[TASK] Failed to send FAIL: ${e.message}`);
    }

    // Update status.json so Git channel is consistent with Redis
    if (payload.module_path) {
      try {
        const statusPath = path.join(REPO_DIR, payload.module_path, 'status.json');
        let status = {};
        if (fs.existsSync(statusPath)) {
          try { status = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch {}
        }
        status.status = 'FAIL';
        status.current_phase = 'buster';
        status.fail_summaries = status.fail_summaries || [];
        status.fail_summaries.push(`Pre-test critical failure: ${verdict.summary}`);
        status.fail_count = (status.fail_count || 0) + 1;
        fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));

        // Commit + push (best effort)
        await execFileAsync('git', ['-C', REPO_DIR, 'add', statusPath], {
          encoding: 'utf8', timeout: 5000,
        });
        await execFileAsync('git', ['-C', REPO_DIR, 'commit', '-m',
          `[buster] Module ${moduleId}: pre-test FAIL — ${verdict.summary.slice(0, 80)}`], {
          encoding: 'utf8', timeout: 10000,
        });
        await execFileAsync('git', ['-C', REPO_DIR, 'push', 'origin'], {
          encoding: 'utf8', timeout: 30000,
        });
        console.log(`[TASK] status.json updated + pushed (FAIL)`);
      } catch (e) {
        console.warn(`[TASK] status.json update failed (non-critical): ${e.message}`);
      }
    }

    // Cleanup and return — no subagent spawned
    STATE.tasksFailed++;
    STATE.lastTask = `${moduleId} → FAIL (pre-test)`;
    STATE.currentModule = null;
    STATE.currentStep = null;
    await sandboxCleanup();
    return;
  }

  // ── Step 6: Enrich prompt with suite results ──
  setStep('enrich-prompt');
  const enrichedPrompt = enrichPrompt(prompt, verdict, testConfig.serve);
  console.log(`[TASK] Prompt enriched: ${prompt.length} → ${enrichedPrompt.length} chars`);

  // Save enriched prompt for debugging (uses run_id from pipeline if available)
  if (payload.module_path) {
    try {
      const runId = payload.run_id || `orchestrator-${Date.now()}`;
      const attempt = payload.attempt || 1;
      const promptDir = path.join(REPO_DIR, payload.module_path, 'prompts', runId);
      fs.mkdirSync(promptDir, { recursive: true });
      const promptPath = path.join(promptDir, `buster-enriched-attempt-${attempt}.md`);
      fs.writeFileSync(promptPath, enrichedPrompt);
      console.log(`[TASK] Enriched prompt saved: ${promptPath} (${enrichedPrompt.length} chars)`);
    } catch (e) {
      console.warn(`[TASK] Prompt save failed (non-critical): ${e.message}`);
    }
  }

  // ── Step 7: Calculate subagent timeout ──
  setStep('calc-timeout');
  const subagentTimeout = Math.max(
    totalTimeout - suiteTimeSeconds - TIMEOUT_BUFFER_SECONDS,
    300 // minimum 5 minutes
  );
  console.log(`[TASK] Subagent timeout: ${totalTimeout} - ${suiteTimeSeconds} - ${TIMEOUT_BUFFER_SECONDS} = ${subagentTimeout}s`);

  // ── Step 8: Spawn ACP Session ──
  setStep('spawn-subagent');
  const { childSessionKey, runId } = await spawnBusterSession(payload, enrichedPrompt, subagentTimeout);

  // ── Step 9: Monitor until completion or timeout ──
  setStep('monitor-session');
  await monitorSession(payload, childSessionKey, runId, subagentTimeout);

  // ── Step 10: Final cleanup ──
  setStep('final-cleanup');
  await sandboxCleanup();

  STATE.tasksPassed++;
  STATE.lastTask = `${moduleId} → complete`;
  STATE.currentModule = null;
  STATE.currentStep = null;

  const totalTime = Math.round((Date.now() - taskStartTime) / 1000);
  console.log(`[TASK] ✅ Task complete for module ${moduleId} (${totalTime}s total)`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOOP — Sequential task processing via Redis Stream
// ═══════════════════════════════════════════════════════════════

async function processOne() {
  const results = await redis.xreadgroup(
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

  const taskType = data.type || 'unknown';
  const sender   = data.sender || 'unknown';

  console.log(`\n[TASK] ${id} | ${sender} ➔ ${AGENT_NAME} | type=${taskType}`);

  // Resolve effective task type
  const effectiveType = PIPELINE_TASK_TYPES.includes(payload.task_type)
    ? payload.task_type
    : taskType;

  if (!PIPELINE_TASK_TYPES.includes(effectiveType)) {
    console.warn(`[TASK] ⚠️ Unknown task type: ${effectiveType} — skipping`);
    await redis.xack(STREAM_KEY, GROUP_NAME, id);
    await notifyTaskResult(id, sender, taskType, false, { message: `Unknown task type: ${effectiveType}` });
    return;
  }

  try {
    await processTask(payload);

    // ACK + Trim after successful completion
    await redis.xack(STREAM_KEY, GROUP_NAME, id);
    await redis.xtrim(STREAM_KEY, 'MAXLEN', '~', STREAM_MAX_LEN);

    await notifyTaskResult(id, sender, taskType, true);
    console.log(`[TASK] ✅ Acked.`);

  } catch (err) {
    console.error(`[TASK] ❌ Failed: ${err.message}`);

    // Cleanup on error
    await sandboxCleanup().catch(() => {});

    // Still ACK to avoid infinite reprocessing
    try { await redis.xack(STREAM_KEY, GROUP_NAME, id); } catch {}
    await notifyTaskResult(id, sender, taskType, false, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// SIGTERM HANDLER — Graceful shutdown
// ═══════════════════════════════════════════════════════════════

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[SHUTDOWN] ${signal} received. Cleaning up...`);

  // 1. Kill active subagent
  if (activeSessionKey) {
    console.log(`[SHUTDOWN] Killing active session: ${activeSessionKey}`);
    await killSession(activeSessionKey);
  }

  // 2. Sandbox cleanup
  await sandboxCleanup().catch(() => {});

  // 3. Redis disconnect
  try { redis.disconnect(); } catch {}

  console.log('[SHUTDOWN] ✅ Clean exit.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('[ORCHESTRATOR v1.1] Starting (Buster — Suite Runner + ACP)...');
  console.log(` Agent: ${AGENT_NAME}`);
  console.log(` Stream: ${STREAM_KEY}`);
  console.log(` Gateway: ${GATEWAY_URL}`);
  console.log(` Suites dir: ${path.join(__dirname, 'suites')}`);
  console.log(` Default suites: ${DEFAULT_SUITES.join(', ')}`);
  console.log(` Monitor poll: ${MONITOR_POLL_MS}ms`);
  console.log(` Timeout buffer: ${TIMEOUT_BUFFER_SECONDS}s`);

  // 1. Load base images from progress.json (before any cleanup or pull)
  loadBaseImagesFromProgress();

  // 2. Wait for Gateway readiness
  await waitForGateway();

  // 3. Start periodic health monitor
  startGatewayHealthMonitor();

  // 4. Pre-pull missing base images
  await ensureBaseImages();

  // 5. Create consumer group
  try {
    await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '0', 'MKSTREAM');
    console.log(`[REDIS] Consumer group created: ${GROUP_NAME}`);
  } catch (e) {
    if (!e.message?.includes('BUSYGROUP')) throw e;
    console.log(`[REDIS] Consumer group exists: ${GROUP_NAME}`);
  }

  // 6. Main loop
  STATE.status = 'polling';
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

// ═══════════════════════════════════════════════════════════════
// CLI: --status flag (print live state and exit)
// ═══════════════════════════════════════════════════════════════

if (process.argv.includes('--status')) {
  (async () => {
    const uptime = Math.round((Date.now() - STATE.startedAt) / 1000);
    console.log(`\n═══ Buster Orchestrator Status ═══`);
    console.log(`  Status:         ${STATE.status}`);
    console.log(`  Uptime:         ${uptime}s`);
    console.log(`  Current Module: ${STATE.currentModule || '(idle)'}`);
    console.log(`  Current Step:   ${STATE.currentStep || '(none)'}`);
    console.log(`  Tasks Total:    ${STATE.tasksTotal}`);
    console.log(`  Tasks Passed:   ${STATE.tasksPassed}`);
    console.log(`  Tasks Failed:   ${STATE.tasksFailed}`);
    console.log(`  Last Task:      ${STATE.lastTask || '(none)'}`);

    // Check Redis queue depth
    try {
      const shortRedis = new Redis({
        host: process.env.REDIS_HOST || 'redis-master.kubeclaw.svc.cluster.local',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 3000,
      });
      const len = await shortRedis.xlen(STREAM_KEY);
      console.log(`  Queue Depth:    ${len}`);
      shortRedis.disconnect();
    } catch {
      console.log(`  Queue Depth:    (unavailable)`);
    }

    console.log(`═════════════════════════════════\n`);
    process.exit(0);
  })();
} else {
  main();
}
