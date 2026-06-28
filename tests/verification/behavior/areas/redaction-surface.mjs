import { pathToFileURL } from 'url';

import {
  buildBuiltInRegistry,
  platformTestDefaults,
} from './helpers.mjs';

function listFiles(fs, path, root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fs, path, fullPath));
    else files.push(fullPath);
  }
  return files;
}

function assertNoLeaks({ assert, fs, path, root, secrets }) {
  const files = listFiles(fs, path, root);
  assert(files.length > 0, `expected generated artifacts under ${root}`);
  const contents = files.map((filePath) => ({ filePath, text: fs.readFileSync(filePath, 'utf8') }));
  for (const secret of secrets) {
    const leaked = contents.find(({ text }) => text.includes(secret));
    assert.equal(leaked, undefined, `secret leaked into ${leaked?.filePath || root}`);
  }
  return { files, contents };
}

export async function registerRedactionSurfaceArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  fs,
  os,
  path,
  assert,
  materializeRuntimeTree,
  importRuntimeModule,
  busterRuntimeDiagnosticsMod,
}) {
  await record('ACP transcript evidence sanitizer returns redacted summaries and tolerates malformed inputs', async () => {
    const redactionMod = await import(`${pathToFileURL(path.join(sourceRoot, 'skills', 'common', 'pipeline', 'redaction.ts')).href}?fresh=${Date.now()}-${Math.random()}`);

    assert.equal(redactionMod.sanitizeAcpTranscriptEvidence(null), null);
    assert.equal(redactionMod.sanitizeAcpTranscriptEvidence(undefined), null);

    const malformed = redactionMod.sanitizeAcpTranscriptEvidence('partial token=UnsafeTranscriptToken1234567890');
    assert.equal(malformed.type, 'transcript.summary');
    assert.equal(malformed.redacted, true);
    assert.equal(malformed.malformed, true);
    assert.equal(JSON.stringify(malformed).includes('UnsafeTranscriptToken1234567890'), false);

    const summary = redactionMod.sanitizeAcpTranscriptEvidence({
      offset: 1,
      byteOffset: 99,
      eventCount: 2,
      lastActivityPoll: 0,
      lastDetail: 'adapter failed with token=UnsafeTranscriptToken1234567890',
      partialLine: 'unfinished api_key=UnsafePartialKey1234567890',
      newLines: [
        JSON.stringify({ kind: 'assistant', text: 'secret output UnsafeTranscriptBody1234567890' }),
      ],
      hardError: true,
      terminal: true,
    });

    const serialized = JSON.stringify(summary);
    assert.equal(summary.type, 'transcript.summary');
    assert.equal(summary.redacted, true);
    assert.equal(summary.eventCount, 2);
    assert.equal(summary.lastActivityPoll, 0);
    assert.equal(summary.new_line_count, 1);
    assert.equal(summary.lastDetail, undefined);
    assert.equal(summary.partialLine, undefined);
    assert.equal(summary.newLines, undefined);
    assert.equal(summary.detail_summary, 'adapter failed with token=[redacted-secret]');
    assert.equal(summary.partial_line_summary.startsWith('[redacted transcript_partial_line;'), true);
    assert.equal(summary.new_lines_summary.startsWith('[redacted transcript_new_lines;'), true);
    assert.equal(serialized.includes('UnsafeTranscriptToken1234567890'), false);
    assert.equal(serialized.includes('UnsafePartialKey1234567890'), false);
    assert.equal(serialized.includes('UnsafeTranscriptBody1234567890'), false);
  });

  await record('noncritical incident reporting redacts secret-bearing error details by default', async () => {
    const noncriticalMod = await import(`${pathToFileURL(path.join(sourceRoot, 'skills', 'common', 'pipeline', 'noncritical-reporting.ts')).href}?fresh=${Date.now()}-${Math.random()}`);
    const rawSecrets = {
      bearer: 'Bearer IncidentSecretToken1234567890',
      apiKey: 'sk-testIncidentSecret1234567890',
      password: 'IncidentPassword1234567890',
    };
    const emitted = [];

    const normalized = noncriticalMod.normalizeNonBlockingErrorDetail(
      new Error(`upstream failed authorization=${rawSecrets.bearer} api_key=${rawSecrets.apiKey} password=${rawSecrets.password}`),
    );

    assert.equal(normalized.includes(rawSecrets.bearer), false);
    assert.equal(normalized.includes(rawSecrets.apiKey), false);
    assert.equal(normalized.includes(rawSecrets.password), false);
    assert.equal(normalized.includes('[redacted-secret; sha256='), true);
    assert.equal(/sha256=[a-f0-9]{12}/.test(normalized), true);

    const reported = noncriticalMod.reportClassifiedNonBlockingError({
      reporter: 'redaction-behavior',
      classification: 'secret_error_detail',
      incidentKey: `redaction-behavior:${Date.now()}:${Math.random()}`,
      message: 'Synthetic incident with secret detail',
      error: new Error(`token=${rawSecrets.apiKey}`),
      fallback: (_level, line) => emitted.push(line),
    });

    assert.equal(reported, true);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].includes(rawSecrets.apiKey), false);
    assert.equal(emitted[0].includes('[redacted-secret; sha256='), true);
  });

  await record('seeded secrets are redacted across Nova pipeline logs, Discord audit logs, and module or gate artifacts', async () => {
    const { runtimeRoot: redactionRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(redactionRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const telemetryMod = await importRuntimeModule(redactionRuntimeRoot, '/app/skills/pipeline/services/telemetry.ts');
    const discordRuntimeMod = await importRuntimeModule(redactionRuntimeRoot, '/app/skills/pipeline/integrations/discord.ts');
    const statusStoreMod = await importRuntimeModule(redactionRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
    const runtimeCoreMod = await importRuntimeModule(redactionRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const redactionMod = await import(`${pathToFileURL(path.join(sourceRoot, 'skills', 'common', 'pipeline', 'redaction.ts')).href}?fresh=${Date.now()}-${Math.random()}`);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redaction-nova-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-redaction-nova-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });

    const rawSecrets = {
      openai: 'sk-live-BehaviorSecretToken1234567890',
      github: 'github_pat_BehaviorSecretToken123456789012345',
      bearer: 'Bearer BehaviorOpaqueSecretToken1234567890',
      password: 'BehaviorPassword123!',
      token: 'BehaviorToken1234567890',
    };
    const secrets = Object.values(rawSecrets);

    const config = {
      ...platformTestDefaults(),
	      project: 'behavior-redaction-nova',
	      repo_root: repoRoot,
	      telemetry: platformTestDefaults().telemetry,
	      _runId: runId,
      run_id: runId,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
	      discord_alerts: { warn: true, info: true },
	      _runStats: runtimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
	      pluginRegistry: await buildBuiltInRegistry(redactionRuntimeRoot),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
    };

    await telemetryMod.emitEvent({ config }, 'observability.degraded', {
      component: 'redaction_test',
      surface: 'telemetry_payload',
      reason: 'seeded_secret_redaction',
      detail: `stderr saw ${rawSecrets.bearer}`,
      stdout: `tool stdout token=${rawSecrets.token}`,
      error: `password=${rawSecrets.password}`,
      authorization: rawSecrets.bearer,
      payload: {
        prompt: `use ${rawSecrets.openai}`,
        nested: { token: rawSecrets.token },
      },
      transcript: [
        { text: `assistant output ${rawSecrets.github}` },
      ],
      module_id: '01',
      gate_id: 'review',
    });
    await flushAsync();

    await discordRuntimeMod.discord(config, 'WARN', 'Secret redaction audit', `tool stderr ${rawSecrets.bearer}`, [
      { name: 'Module', value: '01' },
      { name: 'Authorization', value: rawSecrets.bearer },
      { name: 'stdout', value: `captured stdout ${rawSecrets.openai}` },
      { name: 'payload', value: { prompt: `payload ${rawSecrets.github}`, token: rawSecrets.token } },
    ]);

    statusStoreMod.savePrompt(config, '01', 'forge', 1, `Use api_key=${rawSecrets.token}\n${rawSecrets.openai}\n${rawSecrets.bearer}`);
    const rawTranscriptPath = path.join(repoRoot, 'raw-stream.jsonl');
    fs.writeFileSync(rawTranscriptPath, [
      JSON.stringify({ ts: '2026-04-17T00:00:00.000Z', kind: 'assistant', text: `stdout ${rawSecrets.github}` }),
      JSON.stringify({ ts: '2026-04-17T00:00:01.000Z', kind: 'tool', data: { text: `stderr password=${rawSecrets.password}` } }),
    ].join('\n') + '\n');
    statusStoreMod.saveStreamLog(config, '01', 'forge', 1, rawTranscriptPath);

    const gateLogDir = path.join(logRoot, 'gates', 'review');
    fs.mkdirSync(gateLogDir, { recursive: true });
    redactionMod.writeRedactedPromptArtifact(
      path.join(gateLogDir, 'echo-prompt-attempt-1.md'),
      `token=${rawSecrets.token}\n${rawSecrets.bearer}`,
      { gate_id: 'review', attempt: 1, agent_type: 'echo' },
    );
    redactionMod.copyRedactedTranscriptArtifact(rawTranscriptPath, path.join(gateLogDir, 'echo-transcript-attempt-1.jsonl'));

    const expectedPaths = [
      path.join(logRoot, 'pipeline', 'pipeline.jsonl'),
      path.join(runLogDir, 'pipeline.jsonl'),
      path.join(logRoot, 'pipeline', 'discord.jsonl'),
      path.join(runLogDir, 'discord.jsonl'),
      path.join(logRoot, 'modules', '01', 'forge-prompt-attempt-1.md'),
      path.join(logRoot, 'modules', '01', 'forge-transcript-attempt-1.jsonl'),
      path.join(gateLogDir, 'echo-prompt-attempt-1.md'),
      path.join(gateLogDir, 'echo-transcript-attempt-1.jsonl'),
    ];
    for (const filePath of expectedPaths) assert.equal(fs.existsSync(filePath), true, `missing expected artifact ${filePath}`);

    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(streamEvents.length, 1);
    assert.equal(streamEvents[0].authorization, '[redacted-secret]');
    assert.equal(typeof streamEvents[0].payload?.sha256, 'string');
    assert.equal(streamEvents[0].stdout.includes(rawSecrets.token), false);

    const modulePromptText = fs.readFileSync(path.join(logRoot, 'modules', '01', 'forge-prompt-attempt-1.md'), 'utf8');
    assert.equal(modulePromptText.includes('_Prompt content omitted by default for secret hygiene._'), true);
    const moduleTranscriptLines = fs.readFileSync(path.join(logRoot, 'modules', '01', 'forge-transcript-attempt-1.jsonl'), 'utf8').trim().split('\n');
    assert.equal(JSON.parse(moduleTranscriptLines[0]).type, 'transcript.summary');

    const { files, contents } = assertNoLeaks({ assert, fs, path, root: logRoot, secrets });
    assert.equal(files.some((filePath) => filePath.endsWith(path.join('pipeline', 'pipeline.jsonl'))), true);
    assert.equal(contents.some(({ text }) => text.includes('[redacted-secret]')), true);
    assert.equal(contents.some(({ text }) => text.includes('[redacted prompt;') || text.includes('[redacted payload;') || text.includes('transcript.summary')), true);
  });

  await record('universal egress redaction preserves JSON readback and Markdown structure', async () => {
    const { runtimeRoot: egressRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(egressRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const loggerMod = await importRuntimeModule(egressRuntimeRoot, '/app/skills/pipeline/core/logger.ts');
    const runtimeCoreMod = await importRuntimeModule(egressRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const statusStoreMod = await importRuntimeModule(egressRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
    const summaryMod = await importRuntimeModule(egressRuntimeRoot, '/app/skills/pipeline/services/summary.ts');
    const caseStudyMod = await importRuntimeModule(egressRuntimeRoot, '/app/skills/pipeline/services/case-study.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redaction-egress-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-redaction-egress-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(path.join(modulesDir, '01'), { recursive: true });
    fs.mkdirSync(runLogDir, { recursive: true });

    const rawSecrets = {
      token: 'sk-live-EgressSecretToken1234567890',
      bearer: 'Bearer EgressBearerSecret1234567890',
      password: 'EgressPassword1234567890',
    };
    const secrets = Object.values(rawSecrets);
    const config = {
      ...platformTestDefaults(),
	      project: 'behavior-redaction-egress',
	      repo_root: repoRoot,
	      _runId: runId,
      run_id: runId,
      _disable_discord_webhooks: true,
      fallback_model: 'gpt-test',
      rate_limit: { ...platformTestDefaults().rate_limit, max_pauses_per_module: 0 },
      case_study: { timeout_minutes: 1 },
      _runStats: runtimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
      _progress: { modules: { '01': { dir: '01', title: 'Module 01' } } },
      paths: { swarm_dir: swarmDir, modules_dir: modulesDir },
    };

    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const stdoutLines = [];
    const stderrLines = [];
    console.log = (line) => stdoutLines.push(String(line));
    console.error = (line) => stderrLines.push(String(line));
    try {
      runtimeCoreMod.output({ status: 'error', authorization: rawSecrets.bearer, payload: { prompt: rawSecrets.token } });
      const ctx = {
        config,
        runId,
        stats: config._runStats,
        _pipelineLogPath: path.join(logRoot, 'pipeline', 'pipeline.jsonl'),
        _runPipelineLogPath: path.join(runLogDir, 'pipeline.jsonl'),
      };
      loggerMod.createLogger(ctx).log('ERROR', `failed with ${rawSecrets.bearer}`, {
        token: rawSecrets.token,
        nested: { password: rawSecrets.password },
      });
    } finally {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
    }

    statusStoreMod.saveStatus(config, '01', {
      module_id: '01',
      title: 'Module 01',
      status: 'PENDING',
      fail_count: 0,
      fail_summaries: [],
      history: [{ note: `token=${rawSecrets.token}` }],
      active_agent: { session_key: 'agent-01', token: rawSecrets.token },
    });

    summaryMod.writeSummary(config, 1, `failed ${rawSecrets.bearer}`, null, { modules: {} });

    await summaryMod.generateProjectSummary(config, {
      generatorOverride: async () => ({
        markdown: [
          '# Project Summary: Egress',
          '',
          '| Metric | Value |',
          '|---|---|',
          `| Secret | ${rawSecrets.token} |`,
          '',
          '- Bullet remains a bullet',
        ].join('\n'),
        data: { report: { token: rawSecrets.token, note: `authorization=${rawSecrets.bearer}` } },
        caseStudyBase: { narrative: `password=${rawSecrets.password}` },
        embeds: [],
      }),
    });

    const caseStudyPath = path.join(swarmDir, 'logs', 'pipeline', 'case-study.md');
    await caseStudyMod.generateCaseStudy(config, {
      case_study: { enabled: true, timeout_minutes: 1 },
      defaults: { models: { echo: 'gpt-test' } },
    }, {
      deps: {
        caseStudy: {
          spawnSession: async () => ({ childSessionKey: 'case-study-session-1' }),
          terminateSession: async () => ({ sessionKey: 'summary-session', requested: true, confirmed: true, unconfirmed: false, terminal: true, state: 'closed', cleanupAttempted: false, cleanupConfirmed: false, cleanupError: null, graceMs: 5000 }),
          trackAgent: () => {},
          untrackAgent: () => {},
          pollForFile: async () => {
            fs.mkdirSync(path.dirname(caseStudyPath), { recursive: true });
            fs.writeFileSync(caseStudyPath, [
              '# Case Study',
              '',
              '| Section | Value |',
              '|---|---|',
              `| Secret | ${rawSecrets.bearer} |`,
              '',
              '- Case-study bullet remains intact',
            ].join('\n'));
            return { ok: true, status: { session_key: 'case-study-session-1' } };
          },
          sleep: async () => {},
          discord: async () => {},
          emitEvent: async () => {},
          copyRedactedTranscriptArtifact: () => {},
        },
      },
    });

    const lifecycleReadModels = statusStoreMod.loadLifecycleReadModels(config);
    assert.equal(lifecycleReadModels.modules['01'].status, 'PENDING');
    assert.equal(lifecycleReadModels.modules['01'].session_key, 'agent-01');
    assert.equal(JSON.stringify(lifecycleReadModels).includes(rawSecrets.token), false);
    assert.equal(JSON.stringify(lifecycleReadModels).includes(rawSecrets.bearer), false);

    const markdown = fs.readFileSync(path.join(logRoot, 'pipeline', 'project-summary.md'), 'utf8');
    assert.equal(markdown.includes('# Project Summary: Egress'), true);
    assert.equal(markdown.includes('| Metric | Value |'), true);
    assert.equal(markdown.includes('|---|---|'), true);
    assert.equal(markdown.includes('- Bullet remains a bullet'), true);

    const caseStudyMarkdown = fs.readFileSync(caseStudyPath, 'utf8');
    assert.equal(caseStudyMarkdown.includes('# Case Study'), true);
    assert.equal(caseStudyMarkdown.includes('| Section | Value |'), true);
    assert.equal(caseStudyMarkdown.includes('|---|---|'), true);
    assert.equal(caseStudyMarkdown.includes('- Case-study bullet remains intact'), true);

    const { contents } = assertNoLeaks({ assert, fs, path, root: logRoot, secrets });
    assert.equal(stdoutLines.join('\n').includes(rawSecrets.bearer), false);
    assert.equal(stderrLines.join('\n').includes(rawSecrets.bearer), false);
    assert.equal(contents.some(({ text }) => text.includes('[redacted-secret]')), true);
  });

  await record('seeded secrets are redacted across Buster telemetry mirrors and Discord audit artifacts', async () => {
    const { runtimeRoot: sandboxRedactionRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    installFakeRedis(sandboxRedactionRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const busterTelemetryMod = await importRuntimeModule(sandboxRedactionRoot, '/app/skills/pipeline/services/telemetry.ts');
    const busterDiscordMod = await importRuntimeModule(sandboxRedactionRoot, '/app/skills/pipeline/services/discord.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redaction-buster-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const moduleLogDir = path.join(logRoot, 'modules', '07');
    const runId = 'run-redaction-buster-1';
    const pipelineLogPath = path.join(logRoot, 'pipeline', 'pipeline.jsonl');
    const pipelineRunLogPath = path.join(logRoot, 'pipeline', 'runs', runId, 'pipeline.jsonl');

    const rawSecrets = {
      openai: 'sk-live-BusterSecretToken1234567890',
      github: 'github_pat_BusterSecretToken123456789012345',
      bearer: 'Bearer BusterOpaqueSecretToken1234567890',
      token: 'BusterToken1234567890',
      cookie: 'BusterCookie1234567890',
    };
    const secrets = Object.values(rawSecrets);

    const tctx = busterTelemetryMod.createTelemetryContext({
      project: 'behavior-redaction-buster',
	      module_id: '07',
	      run_id: runId,
	      enabled: true,
        telemetry: platformTestDefaults().telemetry,
        streamMaxLen: platformTestDefaults().telemetry.stream_max_len,
	      log_dir: moduleLogDir,
	      pipeline_log_path: pipelineLogPath,
	      pipeline_run_log_path: pipelineRunLogPath,
	      attempt: 2,
	      dispatch_id: 'dispatch-buster-07-2',
	      session_key: 'agent:main:acp:buster-07-2',
	    });

    await busterTelemetryMod.emitPluginEvent(tctx, 'task_completed', {
      module_id: '07',
      outcome: 'FAIL',
      stdout: `pytest stdout ${rawSecrets.openai}`,
      stderr: `cookie=${rawSecrets.cookie}`,
      authorization: rawSecrets.bearer,
      payload: {
        prompt: `payload ${rawSecrets.github}`,
        token: rawSecrets.token,
      },
    });
    await flushAsync();

    const discordPayload = busterDiscordMod.sendDiscord({
      title: 'Buster secret redaction audit',
      description: `captured stderr ${rawSecrets.bearer}`,
      fields: [
        { name: 'payload', value: { prompt: `payload ${rawSecrets.github}`, token: rawSecrets.token } },
        { name: 'stdout', value: `captured stdout ${rawSecrets.openai}` },
      ],
    }, {
      project: 'behavior-redaction-buster',
      module_id: '07',
      run_id: runId,
      attempt: 2,
      dispatch_id: 'dispatch-buster-07-2',
      session_key: 'agent:main:acp:buster-07-2',
      log_dir: moduleLogDir,
      disableDiscordWebhooks: true,
      webhook_url: 'https://example.invalid/webhook',
    });
    await busterTelemetryMod.closeTelemetry(tctx);

    assert.equal(discordPayload.embeds[0].description.includes(rawSecrets.bearer), false);
    assert.equal(discordPayload.embeds[0].fields[0].value.includes(rawSecrets.github), false);

    const streamEvents = xaddEvents(`pipeline:telemetry:behavior-redaction-buster:${runId}`);
    assert.equal(streamEvents.length, 1);
    assert.equal(streamEvents[0].details.authorization, '[redacted-secret]');
    assert.equal(streamEvents[0].details.stderr.includes(rawSecrets.cookie), false);

    const expectedPaths = [
      pipelineLogPath,
      pipelineRunLogPath,
      path.join(moduleLogDir, 'discord.jsonl'),
    ];
    for (const filePath of expectedPaths) assert.equal(fs.existsSync(filePath), true, `missing expected artifact ${filePath}`);

    const { contents } = assertNoLeaks({ assert, fs, path, root: logRoot, secrets });
    assert.equal(contents.some(({ text }) => text.includes('[redacted-secret]')), true);
    assert.equal(contents.some(({ text }) => text.includes('"redacted":true') || text.includes('"json_bytes"') || text.includes('```json')), true);
  });

  await record('Buster logger redacts structured data and degraded telemetry details', async () => {
    const { runtimeRoot: sandboxLoggerRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const busterLoggerMod = await importRuntimeModule(sandboxLoggerRoot, '/app/skills/pipeline/services/logger.ts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-logger-redaction-'));
    const rawSecrets = {
      apiKey: 'sk-testBusterLoggerSecret1234567890',
      bearer: 'Bearer BusterLoggerBearerSecret1234567890',
      password: 'BusterLoggerPassword1234567890',
    };
    const secrets = Object.values(rawSecrets);

    const logPath = path.join(root, 'safe', 'buster.jsonl');
    const logger = busterLoggerMod.createLogger({ logPath, module: '07', taskType: 'module_test' });
    logger.info('SECRET', 'structured secret detail', {
      stdout: `api_key=${rawSecrets.apiKey}`,
      nested: { authorization: rawSecrets.bearer, password: rawSecrets.password },
    });

    const logText = fs.readFileSync(logPath, 'utf8');
    for (const secret of secrets) assert.equal(logText.includes(secret), false, `secret leaked into Buster logger JSONL: ${secret}`);
    assert.equal(logText.includes('[redacted-secret; sha256='), true);

    const blockedParent = path.join(root, `token=${rawSecrets.apiKey}`);
    fs.writeFileSync(blockedParent, 'not a directory');
    const telemetryEvents = [];
    busterLoggerMod.createLogger({
      logPath: path.join(blockedParent, 'blocked.jsonl'),
      module: '07',
      taskType: 'module_test',
      emitTelemetry: (type, payload) => telemetryEvents.push({ type, payload }),
    });

    assert.equal(telemetryEvents.length, 1);
    assert.equal(telemetryEvents[0].type, 'observability.degraded');
    const telemetryText = JSON.stringify(telemetryEvents[0].payload);
    for (const secret of secrets) assert.equal(telemetryText.includes(secret), false, `secret leaked into Buster logger telemetry: ${secret}`);
    assert.equal(telemetryText.includes('[redacted-secret; sha256='), true);
  });

  await record('Buster task/provider failure details are sanitized before logs and artifacts', async () => {
    const rawSecrets = {
      apiKey: 'sk-testBusterTaskSecret1234567890',
      bearer: 'Bearer BusterTaskBearerSecret1234567890',
      password: 'BusterTaskPassword1234567890',
    };
    const secrets = Object.values(rawSecrets);

    const sanitizedDetail = busterRuntimeDiagnosticsMod.sanitizeBusterRuntimeDetail(
      `spawn failed api_key=${rawSecrets.apiKey} authorization=${rawSecrets.bearer} password=${rawSecrets.password}`,
    );
    for (const secret of secrets) assert.equal(sanitizedDetail.includes(secret), false, `secret leaked from sanitized Buster detail: ${secret}`);
    assert.equal(sanitizedDetail.includes('[redacted-secret; sha256='), true);

    const diagnostic = busterRuntimeDiagnosticsMod.buildBusterProcessDiagnosticRecord({
      component: 'buster_task',
      surface: 'task_failure',
      reason: 'internal_error',
      detail: new Error(`provider stack ${rawSecrets.bearer} token=${rawSecrets.apiKey}`),
      ts: '2026-04-29T12:00:00.000Z',
    });
    const diagnosticText = JSON.stringify(diagnostic);
    for (const secret of secrets) assert.equal(diagnosticText.includes(secret), false, `secret leaked from Buster diagnostic: ${secret}`);
    assert.equal(diagnostic.detail.includes('[redacted-secret; sha256='), true);

    const busterSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'buster-pipeline.ts'), 'utf8');
    assert.equal(busterSource.includes('monitorError?.stack'), false);
    assert.equal(busterSource.includes('err?.stack'), false);
    assert.equal(busterSource.includes('err.message'), false);
    assert.equal(busterSource.includes('error.message'), false);
  });
}
