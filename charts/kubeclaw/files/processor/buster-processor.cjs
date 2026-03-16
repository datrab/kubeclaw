    const Redis = require('ioredis');
    const { hostname } = require('os');
    const { execFile } = require('child_process');
    const { promisify } = require('util');

    const execFileAsync = promisify(execFile);

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
    const DISCORD_CHANNEL = process.env.DISCORD_CHANNEL        || '';
    const MEMORY_BIN      = '/app/skills/memory.js';

    // Pipeline task types — these get subagent spawn (not cron injection)
    const PIPELINE_TASK_TYPES = ['module_test', 'chaos_test'];

    // Stream retention — keep last N entries for audit trail
    const STREAM_MAX_LEN = 250;

    // Subagent monitor poll interval (finer than pipeline's 30s)
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

    async function notifyTaskResult(id, sender, taskType, success, errObj = null, memoryHits = 0, payload = null) {
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
                footer: { text: `Buster Processor v6.0 • ${new Date().toISOString()}` }
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
        footer: { text: `Buster Processor v6.0 • ${new Date().toISOString()}` }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // QDRANT RECALL (v2 — confidence-aware)
    // ═══════════════════════════════════════════════════════════════

    async function recallContext(taskType, sender, payload) {
      const queryParts = [taskType];
      if (payload && typeof payload === 'object') {
        for (const key of ['description', 'message', 'text', 'title', 'query', 'module', 'instructions']) {
          if (payload[key]) queryParts.push(String(payload[key]).slice(0, 200));
        }
      } else if (typeof payload === 'string') {
        queryParts.push(payload.slice(0, 200));
      }

      const query = queryParts.filter(Boolean).join(' ').slice(0, 500);
      if (query.length < 5) return [];

      const cmdArgs = [MEMORY_BIN, 'recall', '--query', query, '--limit', '5'];

      if (payload?.module) {
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
        '', '---',
        '📎 **CONTEXT FROM SWARM MEMORY:**',
        '_(★★★ = validated pattern, ★★☆ = neutral, ★☆☆ = unverified)_',
        ...lines, '---'
      ].join('\n');
    }

    // ═══════════════════════════════════════════════════════════════
    // PIPELINE TASK HANDLER (v6 — Direct Subagent Spawn)
    // ═══════════════════════════════════════════════════════════════
    //
    // Pipeline tasks spawn an isolated subagent directly via Gateway API.
    // No cron injection, no main-session involvement.
    //
    // Flow:
    //   1. Build prompt (test instructions + completion protocol)
    //   2. Spawn subagent via sessions_spawn (thread-bound for Discord visibility)
    //   3. Monitor: watch completion_stream for agent's redis.js signal
    //   4. Kill subagent after completion (or on timeout)
    //
    // The subagent's completion chain:
    //   status.json → memory skill → redis.js complete → (processor kills agent)
    //

    // ── Subagent Prompt Builder ─────────────────────────────────────

    function buildSubagentPrompt(payload, memories) {
      const memoryBlock = formatMemories(memories);
      const isModuleTest = payload.task_type === 'module_test';
      const isChaosTest  = payload.task_type === 'chaos_test';
      const completionStream = payload.completion_stream;
      const moduleId = payload.module;
      const project  = payload.project;

      // ── Header ──
      const header = [
        `# ${isModuleTest ? 'MODULE TEST' : 'CHAOS TEST'}: ${moduleId}`,
        '',
        `**Project:** ${project}`,
        `**Commit:** \`${payload.commit_hash || 'unknown'}\``,
        `**Task Type:** ${payload.task_type}`,
      ];

      // ── Memory Context ──
      const memorySection = memoryBlock ? [memoryBlock, ''] : [];

      // ── Test Instructions ──
      let testSection;
      if (isModuleTest) {
        testSection = [
          '',
          '## 1. TESTING INSTRUCTIONS',
          '',
          `Read and follow the BUSTER.md file for this module:`,
          `\`${payload.buster_md_path || `modules/${moduleId}/BUSTER.md`}\``,
          '',
          'The full instructions are also included below:',
          '',
          '---',
          payload.instructions || '(Read BUSTER.md from the repo)',
          '---',
        ];
      } else {
        const chaosConfig = payload.chaos_config || {};
        testSection = [
          '',
          '## 1. CHAOS TESTING INSTRUCTIONS',
          '',
          `**Scope:** ${chaosConfig.scope || 'full application'}`,
          `**Time Limit:** ${chaosConfig.time_limit_minutes || 30} minutes`,
          '',
          `**Goal:** ${chaosConfig.goal || 'Try to crash the application.'}`,
          '',
          'Chaos testing strategies:',
          '- Send malformed/oversized requests to every API endpoint',
          '- Test authentication bypass attempts',
          '- Trigger race conditions with concurrent requests',
          '- Test resource exhaustion (memory, connections, file handles)',
          '- Send unexpected data types to all inputs',
          '- Test WebSocket connection flooding and mid-stream disconnects',
          '- Verify graceful degradation under load',
          '- Test what happens when K8s API is unavailable mid-request',
          '',
          'Document every crash, hang, or unexpected behavior.',
        ];
      }

      // ── Completion Protocol ──
      const completion = buildCompletionProtocol(payload, isModuleTest, isChaosTest);

      return [
        ...header,
        ...memorySection,
        ...testSection,
        ...completion,
      ].join('\n');
    }

    function buildCompletionProtocol(payload, isModuleTest, isChaosTest) {
      const { completion_stream, module: moduleId, project, status_json_path } = payload;

      const memoryInstructions = [
        '',
        `### Step B: Store Technical Insights`,
        '',
        'Store 1-3 key technical insights from this session:',
        '```bash',
        `node /app/skills/memory.js remember \\`,
        `  --text "Concise technical insight — what was tested and what pattern works or fails" \\`,
        `  --tags "buster,${moduleId},${project}" \\`,
        `  --scope global \\`,
        `  --module ${moduleId}`,
        '```',
        '',
        'What to store: patterns that worked, edge cases found, root causes of failures, test strategies.',
        'What NOT to store: "Tests passed" (useless metadata), project-specific details that cannot be reused.',
      ];

      const redisSignal = [
        '',
        '### Step C: Signal Completion',
        '',
        'This is your **LAST** action:',
        '```bash',
        `node /app/skills/redis.js \\`,
        `  --action complete \\`,
        `  --stream ${completion_stream} \\`,
        `  --module ${moduleId} \\`,
        `  --project ${project} \\`,
        `  --status <PASS|FAIL> \\`,
        `  --summary "brief result summary"`,
        '```',
        '',
        'Do NOT skip this step. Without it, your work cannot be registered.',
      ];

      if (isModuleTest) {
        return [
          '',
          '---',
          '',
          '## 2. WHEN TESTING IS COMPLETE',
          '',
          'Execute these steps **in this exact order**. Do not skip any step.',
          '',
          '### Step A: Update status.json',
          '',
          `Update \`${status_json_path || `modules/${payload.module}/status.json`}\`:`,
          '- Set `"status"` to `"PASS"` if all tests pass, or `"FAIL"` if any test fails',
          '- If FAIL: increment `"fail_count"` and add a `"fail_summaries"` entry:',
          '  ```json',
          '  { "attempt": N, "timestamp": "ISO", "summary": "<what failed and why — be specific>", "phase": "buster" }',
          '  ```',
          '- If PASS: set `"completion_summary"` with test results overview',
          '- Set `"current_phase"` to `null`',
          ...memoryInstructions,
          ...redisSignal,
        ];
      }

      if (isChaosTest) {
        return [
          '',
          '---',
          '',
          '## 2. WHEN TESTING IS COMPLETE',
          '',
          'Execute these steps **in this exact order**.',
          '',
          '### Step A: Write Results Files',
          '',
          'Create the test plan and results JSON as described in the instructions above.',
          ...memoryInstructions,
          // Chaos uses ISSUES_FOUND instead of FAIL
          '',
          '### Step C: Signal Completion',
          '',
          'This is your **LAST** action:',
          '```bash',
          `node /app/skills/redis.js \\`,
          `  --action complete \\`,
          `  --stream ${completion_stream} \\`,
          `  --module ${payload.module} \\`,
          `  --project ${project} \\`,
          `  --status <PASS|ISSUES_FOUND> \\`,
          `  --task-type chaos_test \\`,
          `  --summary "brief chaos test summary"`,
          '```',
          '',
          'Do NOT skip this step. Without it, your work cannot be registered.',
        ];
      }

      return [];
    }

    // ── Subagent Spawn via Gateway ──────────────────────────────────

    async function spawnBusterSubagent(payload, prompt, timeoutSeconds) {
      if (!GATEWAY_TOKEN) throw new Error('OPENCLAW_GATEWAY_TOKEN is not set');

      const sessionConfig = payload.session || {};
      const isAcp = sessionConfig.runtime === 'acp';
      const label = sessionConfig.label || `buster-${payload.task_type}-${payload.module}-${Date.now()}`;

      const spawnArgs = {
        task: prompt,
        label: label,
        thread: true,                          // Discord-Thread für Live-Sichtbarkeit
        mode: 'session',                       // persistent wegen thread-binding
        runTimeoutSeconds: timeoutSeconds,      // Platform-Level Timeout
        cleanup: 'keep',                       // Transcript behalten für Post-Mortem
      };

      // ACP sessions (chaos tests with stronger models)
      if (isAcp) {
        spawnArgs.runtime = 'acp';
        spawnArgs.agentId = sessionConfig.acp_agent_id || 'codex';
      }

      console.log(`[SPAWN] ${isAcp ? 'ACP' : 'Subagent'} label=${label} thread=true timeout=${timeoutSeconds}s`);

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

      console.log(`[SPAWN] ✅ Subagent spawned: key=${result.childSessionKey} run=${result.runId}`);

      return {
        childSessionKey: result.childSessionKey,
        runId: result.runId,
        label,
      };
    }

    // ── Subagent Kill ───────────────────────────────────────────────

    async function killSubagent(childSessionKey) {
      try {
        const response = await fetch(GATEWAY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          },
          body: JSON.stringify({
            tool: 'sessions_send',
            args: { target: childSessionKey, message: '/stop' },
          }),
        });

        if (response.ok) {
          console.log(`[MONITOR] ✅ Killed subagent: ${childSessionKey}`);
        } else {
          console.warn(`[MONITOR] Kill response: ${response.status} (may have already exited)`);
        }
      } catch (e) {
        console.warn(`[MONITOR] Kill failed (may have exited): ${e.message}`);
      }
    }

    // ── Subagent Monitor (Supervisor Loop) ──────────────────────────

    async function monitorSubagent(payload, childSessionKey, runId, timeoutSeconds) {
      const completionStream = payload.completion_stream;
      const moduleId = payload.module;
      const startTime = Date.now();
      const deadline = startTime + (timeoutSeconds * 1000);

      console.log(`[MONITOR] Watching ${childSessionKey} | stream=${completionStream} | timeout=${timeoutSeconds}s`);

      await discord({
        title: `🔬 Subagent Spawned: ${moduleId}`,
        color: 5763719,
        description: `**Session:** \`${childSessionKey}\`\n**Run:** \`${runId}\`\n**Type:** ${payload.task_type}`,
        footer: { text: `Buster Processor v6.0 • timeout ${timeoutSeconds}s` },
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
                title: `${status === 'PASS' ? '✅' : '❌'} Subagent Complete: ${moduleId}`,
                color: status === 'PASS' ? 5763719 : 15548997,
                description: `**Status:** ${status}\n**Source:** ${source}\n**Summary:** ${(data.summary || '').slice(0, 500)}`,
                fields: [
                  { name: 'Session', value: `\`${childSessionKey}\``, inline: true },
                  { name: 'Commit', value: `\`${data.commit_hash || 'unknown'}\``, inline: true },
                ],
                footer: { text: `Buster Processor v6.0` },
              });

              // ── Kill subagent — its job is done ──
              await killSubagent(childSessionKey);
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

      // ── Timeout — subagent did not complete ──
      console.error(`[MONITOR] ⏰ TIMEOUT: ${childSessionKey} did not complete within ${timeoutSeconds}s`);

      await discord({
        title: `⏰ Subagent Timeout: ${moduleId}`,
        color: 15548997,
        description: `Subagent did not complete within ${timeoutSeconds}s.\nSession: \`${childSessionKey}\``,
        footer: { text: `Buster Processor v6.0` },
      });

      // Send FAIL to completion stream so the pipeline doesn't wait forever
      try {
        const fields = [
          'type', 'completion',
          'module', moduleId,
          'task_type', payload.task_type || 'module_test',
          'status', 'FAIL',
          'source', 'processor',
          'reason', `Processor timeout: subagent did not complete within ${timeoutSeconds}s`,
          'timestamp', Date.now().toString(),
        ];
        await redis.xadd(completionStream, '*', ...fields);
        await redis.xtrim(completionStream, 'MAXLEN', '~', STREAM_MAX_LEN);
        console.log(`[MONITOR] FAIL sent to ${completionStream}`);
      } catch (e) {
        console.error(`[MONITOR] Failed to send FAIL to stream: ${e.message}`);
      }

      // Kill the timed-out subagent
      await killSubagent(childSessionKey);
    }

    // ── Pipeline Task Handler (v6) ──────────────────────────────────

    async function handlePipelineTask(payload, memories) {
      const prompt = buildSubagentPrompt(payload, memories);
      const sessionConfig = payload.session || {};
      const timeoutSeconds = sessionConfig.timeout_seconds || 3600;

      console.log(`[PIPELINE] ${payload.task_type} for module ${payload.module}`);
      console.log(`[PIPELINE] Completion stream: ${payload.completion_stream}`);

      // 1. Spawn subagent (thread-bound for Discord visibility)
      const { childSessionKey, runId } = await spawnBusterSubagent(payload, prompt, timeoutSeconds);

      // 2. Monitor until completion or timeout, then kill
      await monitorSubagent(payload, childSessionKey, runId, timeoutSeconds);

      console.log(`[PIPELINE] ✅ Pipeline task complete for module ${payload.module}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STANDARD SWARM TASK HANDLER (legacy — for non-pipeline tasks)
    // ═══════════════════════════════════════════════════════════════

    function wantsDiscord(taskType, payload) {
      if (/discord/i.test(taskType)) return true;
      try {
        const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return /discord/i.test(raw);
      } catch { return false; }
    }

    async function injectViaDiscord(prompt) {
      if (!DISCORD_CHANNEL) throw new Error('DISCORD_CHANNEL env var not set');

      const requestBody = {
        tool: 'message',
        args: { action: 'send', target: DISCORD_CHANNEL, message: prompt }
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
      console.log(`[INJECT] ✅ Discord message sent`);
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
      console.log(`[INJECT] ✅ cron job scheduled`);
      return result;
    }

    async function handleSwarmTask(taskType, sender, payload, iteration, memories) {
      if (!GATEWAY_TOKEN) throw new Error('OPENCLAW_GATEWAY_TOKEN is not set');

      const nextIter    = parseInt(iteration) + 1;
      const memoryBlock = formatMemories(memories);
      const useDiscord  = wantsDiscord(taskType, payload);
      const jobName     = `swarm-${sender}-${taskType}-${Date.now()}`;

      console.log(`[INJECT] mode=${useDiscord ? 'discord' : 'cron'} task=${taskType}`);

      if (useDiscord) {
        const prompt = [
          '⚠️ **Attention Needed** ⚠️',
          '',
          `From: **${sender}** | Type: **${taskType}** | Iteration: **${iteration}**`,
          '',
          '**PAYLOAD:**',
          '```json',
          JSON.stringify(payload, null, 2),
          '```',
          memoryBlock,
        ].join('\n');

        return injectViaDiscord(prompt);

      } else {
        const prompt = [
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

        return injectViaCron(jobName, prompt);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN LOOP — Routes tasks to correct handler
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

      console.log(`\n[TASK] ${id} | ${sender} ➔ ${AGENT_NAME} | type=${taskType}`);

      // Determine if this is a pipeline task or a regular swarm task
      const isPipelineTask = PIPELINE_TASK_TYPES.includes(taskType)
        || PIPELINE_TASK_TYPES.includes(payload.task_type);

      if (isPipelineTask) {
        console.log(`[TASK] Pipeline task detected: ${payload.task_type || taskType}`);
      }

      // 1. Recall context from Qdrant
      const memories = await recallContext(taskType, sender, payload);

      try {
        // 2. Route to correct handler
        if (isPipelineTask) {
          // Pipeline task → spawn subagent, monitor, kill
          await handlePipelineTask(payload, memories);
        } else {
          // Standard swarm task → legacy cron/discord injection
          await handleSwarmTask(taskType, sender, payload, iteration, memories);
        }

        // 3. ACK + Trim (no XDEL — keep entries for audit trail)
        await redis.xack(STREAM_KEY, GROUP_NAME, id);
        await redis.xtrim(STREAM_KEY, 'MAXLEN', '~', STREAM_MAX_LEN);

        await notifyTaskResult(id, sender, taskType, true, null, memories.length, payload);
        console.log(`[TASK] ✅ Done & Acked.`);

      } catch (err) {
        console.error(`[TASK] ❌ Failed: ${err.message}`);
        // Still ACK so we don't reprocess forever on persistent errors
        try { await redis.xack(STREAM_KEY, GROUP_NAME, id); } catch {}
        await notifyTaskResult(id, sender, taskType, false, err, memories.length, payload);
      }
    }

    async function main() {
      console.log('[PROCESSOR v6.0] Starting (Buster — Direct Subagent Spawn)...');
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
