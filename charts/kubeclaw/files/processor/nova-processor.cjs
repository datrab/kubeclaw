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

    // Pipeline task types — these get special handling
    const PIPELINE_TASK_TYPES = ['module_test', 'chaos_test'];

    // Stream retention — keep last N entries for audit trail (no XDEL)
    const STREAM_MAX_LEN = 250;

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
                footer: { text: `Swarm Processor v5.1 • ${new Date().toISOString()}` }
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
        footer: { text: `Swarm Processor v5.1 • ${new Date().toISOString()}` }
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
    // PIPELINE TASK HANDLER (module_test / chaos_test)
    // ═══════════════════════════════════════════════════════════════
    //
    // Pipeline tasks are different from normal swarm tasks:
    //   - Buster must spawn an ISOLATED ACP session for testing
    //   - After testing, Buster updates status.json, commits, pushes
    //   - The pipeline script polls status.json — NO Redis response needed
    //   - NO cronjob, NO discord message for the response path
    //
    // The processor's job: format the pipeline task as a structured prompt
    // and inject it into Buster's gateway via cron (one-shot fire).

    function buildPipelinePrompt(payload, memories) {
      const memoryBlock = formatMemories(memories);
      const isModuleTest = payload.task_type === 'module_test';
      const isChaosTest  = payload.task_type === 'chaos_test';

      const sessionConfig = payload.session || {};
      const onComplete    = payload.on_complete || {};

      // ── Header ──
      const header = [
        `🔬 **PIPELINE ${isModuleTest ? 'MODULE TEST' : 'CHAOS TEST'}**`,
        '',
        `**Module:** ${payload.module}`,
        `**Project:** ${payload.project}`,
        `**Commit:** \`${payload.commit_hash || 'unknown'}\``,
        `**Test Model:** ${sessionConfig.model || 'gemini-flash'}`,
        `**Task Type:** ${payload.task_type}`,
      ];

      // ── Session Instructions ──
      const sessionInstr = [
        '',
        '---',
        '',
        '## 1. SPAWN ISOLATED TEST SESSION',
        '',
        `Spawn an **isolated ACP session** for this test. The session must be destroyed after testing.`,
        '',
        '```',
        `/acp spawn ${sessionConfig.model === 'claude-sonnet-4-6' ? 'claude' : 'codex'} \\`,
        `  --mode oneshot \\`,
        `  --label ${sessionConfig.label || `buster-test-${payload.module}`} \\`,
        `  --thread off`,
        '```',
        '',
        `Pass the testing instructions below to the spawned session. Do NOT test in your main session.`,
      ];

      // ── Test Instructions ──
      let testSection;
      if (isModuleTest) {
        testSection = [
          '',
          '## 2. TESTING INSTRUCTIONS',
          '',
          `Read and follow the BUSTER.md file for this module:`,
          `\`${payload.buster_md_path || `modules/${payload.module}/BUSTER.md`}\``,
          '',
          'The full instructions are also included below:',
          '',
          '---',
          payload.instructions || '(No instructions provided — read BUSTER.md from the repo)',
          '---',
        ];
      } else {
        // Chaos test
        const chaosConfig = payload.chaos_config || {};
        testSection = [
          '',
          '## 2. CHAOS TESTING INSTRUCTIONS',
          '',
          `**Scope:** ${chaosConfig.scope || 'full application'}`,
          `**Time Limit:** ${chaosConfig.time_limit_minutes || 30} minutes`,
          '',
          `**Goal:** ${chaosConfig.goal || 'Try to crash the application.'}`,
          '',
          'Specific chaos testing strategies:',
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

      // ── Completion Protocol (differs per task type) ──
      let completionProtocol;

      if (isModuleTest) {
        completionProtocol = [
          '',
          '## 3. WHEN TESTING IS COMPLETE',
          '',
          '**You MUST do all of the following in order:**',
          '',
          `**a)** Update \`${payload.status_json_path || `modules/${payload.module}/status.json`}\`:`,
          '   - Set `"status"` to `"PASS"` if all tests pass, or `"FAIL"` if any test fails',
          '   - If FAIL: increment `"fail_count"` by 1',
          '   - If FAIL: add an entry to `"fail_summaries"` array:',
          '     ```json',
          '     {',
          `       "attempt": <current_fail_count>,`,
          `       "timestamp": "<ISO timestamp>",`,
          `       "summary": "<what failed and why — be specific>",`,
          `       "phase": "buster"`,
          '     }',
          '     ```',
          '   - If PASS: set `"completion_summary"` with a brief test results overview',
          '   - Set `"current_phase"` to `null`',
          '',
          '**b)** Git commit and push:',
          '   ```bash',
          '   git add -A',
          `   git commit -m "[buster] Module ${payload.module}: <PASS|FAIL>"`,
          '   git push origin HEAD',
          '   ```',
          '',
          '**c)** Destroy the test session after committing:',
          '   `/acp close`',
          '',
          '**d)** Do NOT send any Redis message back. Do NOT create any follow-up tasks.',
          '   The pipeline is polling status.json and will pick up your results automatically.',
          '',
          '⚠️ **CRITICAL:** The pipeline is blocked until you update status.json.',
        ];
      } else {
        // Chaos test — writes to dedicated plan + results files, NOT status.json
        completionProtocol = [
          '',
          '## 3. WHEN TESTING IS COMPLETE',
          '',
          '**You MUST create two files (the pipeline told you the exact paths in the instructions above):**',
          '',
          '**a)** Write a test plan file (BEFORE running tests) with all planned test cases.',
          '',
          '**b)** Write a results JSON file with this structure:',
          '   ```json',
          '   {',
          `     "phase": "${payload.module}",`,
          '     "status": "PASS" | "ISSUES_FOUND",',
          '     "summary": "brief overview of findings",',
          '     "issues": [',
          '       {',
          '         "severity": "critical" | "moderate" | "low",',
          '         "title": "short description",',
          '         "description": "detailed root cause analysis",',
          '         "reproduction": "exact steps or commands to reproduce",',
          '         "affected_module": "06",',
          '         "affected_files": ["path/to/file.py"]',
          '       }',
          '     ],',
          '     "tests_executed": <number>,',
          '     "tests_passed": <number>,',
          '     "tests_failed": <number>',
          '   }',
          '   ```',
          '',
          '**c)** Git commit and push:',
          '   ```bash',
          '   git add -A',
          `   git commit -m "[chaos] ${payload.module} results"`,
          '   git push origin HEAD',
          '   ```',
          '',
          '**d)** Destroy the test session: `/acp close`',
          '',
          '**e)** Do NOT update any status.json. Do NOT send Redis messages.',
          '   The pipeline polls for the results file directly.',
          '',
          '⚠️ **Severity guide:**',
          '   - **critical**: Application crashes, data loss, security bypass',
          '   - **moderate**: Degraded functionality, resource leaks, unhandled errors that dont crash',
          '   - **low**: Edge case oddities, cosmetic issues, non-standard behavior that wont break things',
        ];
      }

      // ── Memory Context ──
      const memorySection = memoryBlock
        ? [memoryBlock]
        : [];

      // ── Assemble ──
      return [
        ...header,
        ...memorySection,
        ...sessionInstr,
        ...testSection,
        ...completionProtocol,
      ].join('\n');
    }

    async function handlePipelineTask(payload, memories) {
      if (!GATEWAY_TOKEN) throw new Error('OPENCLAW_GATEWAY_TOKEN is not set');

      const prompt = buildPipelinePrompt(payload, memories);
      const jobName = `pipeline-${payload.task_type}-${payload.module}-${Date.now()}`;
      const fireAt = new Date(Date.now() + 2000).toISOString();

      console.log(`[PIPELINE] Injecting ${payload.task_type} for module ${payload.module}`);

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
      console.log(`[PIPELINE] ✅ ${payload.task_type} injected for module ${payload.module}`);
      return result;
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
          // Pipeline task → structured prompt, no follow-up expected
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
      console.log('[PROCESSOR v5.1] Starting...');
      console.log(` Agent: ${AGENT_NAME}`);
      console.log(` Stream: ${STREAM_KEY}`);
      console.log(` Gateway: ${GATEWAY_URL}`);
      console.log(` Pipeline task types: ${PIPELINE_TASK_TYPES.join(', ')}`);
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
