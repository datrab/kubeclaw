export async function registerOperatorSurfaceArea({
  record,
  sourceRoot,
  overlayRoot,
  contractPath,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  startGatewayServer,
  fs,
  os,
  path,
  assert,
  execFileSync,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
  writeExecutable,
  runtimeRoot,
  sandboxRuntimeRoot,
  pipelineEntryMod,
  pipelineIndexMod,
  pipelineRunnerMod,
  orchestrationMod,
  pipelineRedisMod,
  runtimeMod,
  gatewayMod,
  discordMod,
  lifecycleMod,
  lifecycleStateMod,
  monitorMod,
  redisLogMod,
  pathsMod,
  busterPipelineMod,
}) {
await record('Discord audit artifacts and embeds carry run correlation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-audit-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-discord-1');
  fs.mkdirSync(runLogDir, { recursive: true });

  await discordMod.discord({
    project: 'behavior-discord',
    _runId: 'run-discord-1',
    _logDir: logDir,
    _runLogDir: runLogDir,
  }, 'INFO', 'Module 01 started', 'Testing Discord correlation', [
    { name: 'Session', value: 'agent:forge:mod-01' },
    { name: 'Attempt', value: '2/3' },
    { name: 'Module', value: '01' },
  ]);

  const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const discordSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'integrations', 'discord.js'), 'utf8');

  assert.equal(topLevelEntry.project, 'behavior-discord');
  assert.equal(topLevelEntry.run_id, 'run-discord-1');
  assert.equal(topLevelEntry.session_key, 'agent:forge:mod-01');
  assert.equal(topLevelEntry.attempt, 2);
  assert.equal(topLevelEntry.module_id, '01');
  assert.equal(runScopedEntry.project, 'behavior-discord');
  assert.equal(runScopedEntry.run_id, 'run-discord-1');
  assert.equal(runScopedEntry.session_key, 'agent:forge:mod-01');
  assert.equal(runScopedEntry.attempt, 2);
  assert.equal(runScopedEntry.module_id, '01');
  assert.equal(discordSource.includes('KubeClaw Pipeline · ${config.project}${runId ? ` · ${runId}` : \'\'}'), true);
});

await record('Discord audit artifacts capture gate_type correlation from embed fields', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-gate-type-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-discord-gate-type-1');
  fs.mkdirSync(runLogDir, { recursive: true });

  await discordMod.discord({
    project: 'behavior-discord-gate-type',
    _runId: 'run-discord-gate-type-1',
    _logDir: logDir,
    _runLogDir: runLogDir,
  }, 'CRITICAL', 'Pipeline halted: gate review', 'Testing gate type correlation', [
    { name: 'Gate', value: 'review' },
    { name: 'Gate Type', value: 'review' },
    { name: 'Session', value: 'agent:echo:review-1' },
  ]);

  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const discordSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'integrations', 'discord.js'), 'utf8');

  assert.equal(runScopedEntry.gate_id, 'review');
  assert.equal(runScopedEntry.gate_type, 'review');
  assert.equal(runScopedEntry.session_key, 'agent:echo:review-1');
  assert.equal(discordSource.includes("else if ((name === 'gate type' || name === 'gate_type') && !correlation.gate_type) correlation.gate_type = value;"), true);
});

await record('approval gate Discord audit artifacts preserve canonical gate_type reporting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-approval-gate-type-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-approval-gate-type-1');
  fs.mkdirSync(runLogDir, { recursive: true });

  await discordMod.discord({
    project: 'behavior-approval-gate-type',
    _runId: 'run-approval-gate-type-1',
    _logDir: logDir,
    _runLogDir: runLogDir,
  }, 'WARN', '⏸️ Approval Required: Production deploy', 'Testing approval gate type correlation', [
    { name: 'Run ID', value: 'run-approval-gate-type-1', inline: true },
    { name: 'Gate', value: 'gate:approval', inline: true },
    { name: 'Gate Type', value: 'approval', inline: true },
    { name: 'Approved by', value: 'operator', inline: false },
  ]);

  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const approvalGateRunner = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/approval-gate-runner.js');

  assert.equal(runScopedEntry.run_id, 'run-approval-gate-type-1');
  assert.equal(runScopedEntry.gate_id, 'gate:approval');
  assert.equal(runScopedEntry.gate_type, 'approval');
  assert.equal(approvalGateRunner.includes("fields: buildApprovalGateDiscordFields({ run_id: gateState.run_id, gate_id: gateId, gate_type: gate.type }, embed.fields)"), true);
  assert.equal(approvalGateRunner.includes("fields: buildApprovalGateDiscordFields({ run_id: state.run_id, gate_id: gateId, gate_type: gate.type }, normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE"), true);
  assert.equal(approvalGateRunner.includes("fields: buildApprovalGateDiscordFields({ run_id: current.run_id || config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type }, ["), true);
});

await record('verification mode mutes live Discord webhook delivery while keeping audit artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-mute-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-discord-muted');
  const busterLogDir = path.join(root, '.swarm', 'logs', 'gates', 'gate-muted');
  const fakeBinDir = path.join(root, 'bin');
  const curlLog = path.join(root, 'curl.log');
  fs.mkdirSync(runLogDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });
  writeExecutable(path.join(fakeBinDir, 'curl'), `#!/bin/sh\necho invoked >> ${curlLog}\n`);

  const oldPath = process.env.PATH || '';
  process.env.PATH = `${fakeBinDir}:${oldPath}`;
  try {
    await discordMod.discord({
      project: 'behavior-discord-muted',
      _runId: 'run-discord-muted',
      _logDir: logDir,
      _runLogDir: runLogDir,
      discord_webhook_url: 'https://example.invalid/webhook',
      discord_alerts: { info: true },
    }, 'INFO', 'Muted Discord', 'This should not hit curl.', [
      { name: 'Module', value: '01' },
    ]);

    const { runtimeRoot: sandboxDiscordRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const busterDiscordMod = await importRuntimeModule(sandboxDiscordRoot, '/app/skills/pipeline/services/discord.js');
    busterDiscordMod.sendDiscord({
      title: 'Muted Buster Discord',
      description: 'This should not hit curl.',
    }, {
      project: 'behavior-discord-muted',
      runId: 'run-discord-muted',
      gateId: 'gate:muted',
      webhookUrl: 'https://example.invalid/webhook',
      logDir: busterLogDir,
    });
  } finally {
    process.env.PATH = oldPath;
  }

  assert.equal(fs.existsSync(curlLog), false, 'verification mode must not invoke curl for Discord webhooks');
  assert.equal(fs.existsSync(path.join(logDir, 'pipeline', 'discord.jsonl')), true, 'Nova Discord audit log should still be written while webhooks are muted');
  assert.equal(fs.existsSync(path.join(runLogDir, 'discord.jsonl')), true, 'run-scoped Nova Discord audit log should still be written while webhooks are muted');
  assert.equal(fs.existsSync(path.join(busterLogDir, 'discord.jsonl')), true, 'Buster Discord audit log should still be written while webhooks are muted');
});

await record('Discord webhook delivery failures emit explicit degraded observability telemetry with operator correlation', async () => {
  const { runtimeRoot: discordRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(discordRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const discordRuntimeMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/integrations/discord.js');
  const runtimeCoreMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-webhook-fail-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runId = 'run-discord-webhook-fail-1';
  const runLogDir = path.join(logDir, 'pipeline', 'runs', runId);
  const fakeBinDir = path.join(root, 'bin');
  fs.mkdirSync(runLogDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });
  writeExecutable(path.join(fakeBinDir, 'curl'), '#!/bin/sh\nexit 22\n');

  const oldPath = process.env.PATH || '';
  const oldMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  process.env.PATH = `${fakeBinDir}:${oldPath}`;
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '';
  try {
    await discordRuntimeMod.discord({
      project: 'behavior-discord-webhook-fail',
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _logDir: logDir,
      _runLogDir: runLogDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-12T00:00:00.000Z'),
      discord_webhook_url: 'https://example.invalid/webhook',
      discord_alerts: { warn: true },
    }, 'WARN', 'Discord degraded', 'Testing webhook failure observability', [
      { name: 'Module', value: '01' },
      { name: 'Label', value: 'forge-01-1712876400000' },
      { name: 'Session', value: 'agent:forge:discord-fail' },
      { name: 'Attempt', value: '2' },
      { name: 'Dispatch', value: 'dispatch-mod-01-2' },
    ]);
    await flushAsync();
  } finally {
    process.env.PATH = oldPath;
    process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = oldMute;
  }

  const events = xaddEvents(`pipeline:telemetry:behavior-discord-webhook-fail:${runId}`)
    .filter((event) => event.type === 'observability.degraded' || event.type === 'observability.restored');

  assert.deepEqual(events.map((event) => event.type), ['observability.degraded']);
  assert.equal(events[0].component, 'discord');
  assert.equal(events[0].surface, 'webhook');
  assert.equal(events[0].reason, 'webhook_delivery_failed');
  assert.equal(events[0].module_id, '01');
  assert.equal(events[0].gateway_label, 'forge-01-1712876400000');
  assert.equal(events[0].session_key, 'agent:forge:discord-fail');
  assert.equal(events[0].attempt, 2);
  assert.equal(events[0].dispatch_id, 'dispatch-mod-01-2');
  assert.equal(events[0].detail, 'discord webhook delivery failed: curl exited with status 22');
});

await record('Discord webhook delivery recovery emits explicit restored observability telemetry after a later successful post', async () => {
  const { runtimeRoot: discordRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(discordRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const discordRuntimeMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/integrations/discord.js');
  const runtimeCoreMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-webhook-restore-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runId = 'run-discord-webhook-restore-1';
  const runLogDir = path.join(logDir, 'pipeline', 'runs', runId);
  const fakeBinDir = path.join(root, 'bin');
  const statePath = path.join(root, 'curl-state');
  fs.mkdirSync(runLogDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.writeFileSync(statePath, 'fail\n');
  writeExecutable(path.join(fakeBinDir, 'curl'), `#!/bin/sh\nif [ "$(cat ${statePath})" = "fail" ]; then\n  exit 22\nfi\nexit 0\n`);

  const oldPath = process.env.PATH || '';
  const oldMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  process.env.PATH = `${fakeBinDir}:${oldPath}`;
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '';
  try {
    const config = {
      project: 'behavior-discord-webhook-restore',
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _logDir: logDir,
      _runLogDir: runLogDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-12T00:00:00.000Z'),
      discord_webhook_url: 'https://example.invalid/webhook',
    };

    await discordRuntimeMod.discordEmbeds(config, [{
      title: 'Review gate stalled',
      description: 'Testing webhook recovery observability',
      fields: [
        { name: 'Gate', value: 'gate:review' },
        { name: 'Gate Type', value: 'review' },
        { name: 'Label', value: 'reviewfix-review-01-1-1712876400000' },
        { name: 'Session', value: 'agent:echo:review-discord' },
        { name: 'Attempt', value: '1' },
        { name: 'Dispatch', value: 'dispatch-review-01-1' },
      ],
    }], { level: 'WARN' });
    await flushAsync();

    fs.writeFileSync(statePath, 'ok\n');

    await discordRuntimeMod.discordEmbeds(config, [{
      title: 'Review gate recovered',
      description: 'Testing webhook recovery observability',
      fields: [
        { name: 'Gate', value: 'gate:review' },
        { name: 'Gate Type', value: 'review' },
        { name: 'Label', value: 'reviewfix-review-01-1-1712876400000' },
        { name: 'Session', value: 'agent:echo:review-discord' },
        { name: 'Attempt', value: '1' },
        { name: 'Dispatch', value: 'dispatch-review-01-1' },
      ],
    }], { level: 'OK' });
    await flushAsync();
  } finally {
    process.env.PATH = oldPath;
    process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = oldMute;
  }

  const events = xaddEvents(`pipeline:telemetry:behavior-discord-webhook-restore:${runId}`)
    .filter((event) => event.type === 'observability.degraded' || event.type === 'observability.restored');

  assert.deepEqual(events.map((event) => event.type), ['observability.degraded', 'observability.restored']);
  assert.equal(events[0].component, 'discord');
  assert.equal(events[0].surface, 'webhook');
  assert.equal(events[0].reason, 'webhook_delivery_failed');
  assert.equal(events[0].gate_id, 'gate:review');
  assert.equal(events[0].gate_type, 'review');
  assert.equal(events[0].gateway_label, 'reviewfix-review-01-1-1712876400000');
  assert.equal(events[0].session_key, 'agent:echo:review-discord');
  assert.equal(events[0].attempt, 1);
  assert.equal(events[0].dispatch_id, 'dispatch-review-01-1');
  assert.equal(events[1].component, 'discord');
  assert.equal(events[1].surface, 'webhook');
  assert.equal(events[1].reason, 'webhook_delivery_failed');
  assert.equal(events[1].gate_id, 'gate:review');
  assert.equal(events[1].gate_type, 'review');
  assert.equal(events[1].gateway_label, 'reviewfix-review-01-1-1712876400000');
  assert.equal(events[1].session_key, 'agent:echo:review-discord');
  assert.equal(events[1].attempt, 1);
  assert.equal(events[1].dispatch_id, 'dispatch-review-01-1');
  assert.equal(events[1].detail, 'discord webhook delivery restored');
  assert.equal(typeof events[1].restored_after_ms, 'number');
});

await record('Redis-dispatched task alerts now flow through canonical Discord audit mirroring with dispatch correlation', async () => {
  const { runtimeRoot: redisRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(redisRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-redis-discord-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runId = 'run-redis-discord-1';
  const runLogDir = path.join(logDir, 'pipeline', 'runs', runId);
  fs.mkdirSync(runLogDir, { recursive: true });

  const oldWebhook = process.env.DISCORD_WEBHOOK;
  const oldDiscordMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  const oldAgentName = process.env.AGENT_NAME;
  process.env.DISCORD_WEBHOOK = 'https://example.invalid/webhook';
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '1';
  process.env.AGENT_NAME = 'nova';

  try {
    const redisToolMod = await importRuntimeModule(redisRuntimeRoot, '/app/skills/pipeline/tools/redis.js');
    await redisToolMod.default.sendTask('buster', 'module_test', {
      project: 'behavior-redis-discord',
      module: '07',
      test_suites: ['unit', 'api'],
      run_id: runId,
      attempt: 2,
      dispatch_id: 'buster-module_test-07-1',
      pipeline_log_path: path.join(logDir, 'pipeline', 'pipeline.jsonl'),
      pipeline_run_log_path: path.join(runLogDir, 'pipeline.jsonl'),
    }, 2);
    await redisToolMod.default.disconnect();
  } finally {
    process.env.DISCORD_WEBHOOK = oldWebhook;
    process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = oldDiscordMute;
    process.env.AGENT_NAME = oldAgentName;
  }

  const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));

  assert.equal(topLevelEntry.project, 'behavior-redis-discord');
  assert.equal(topLevelEntry.run_id, runId);
  assert.equal(topLevelEntry.module_id, '07');
  assert.equal(topLevelEntry.attempt, 2);
  assert.equal(topLevelEntry.dispatch_id, 'buster-module_test-07-1');
  assert.equal(runScopedEntry.run_id, runId);
  assert.equal(runScopedEntry.dispatch_id, 'buster-module_test-07-1');
  assert.equal(runScopedEntry.fields.some((field) => field.name === 'Run ID' && field.value === runId), true);
  assert.equal(runScopedEntry.fields.some((field) => field.name === 'Dispatch' && field.value === 'buster-module_test-07-1'), true);
});

await record('Discord audit-log write failures emit explicit degraded observability telemetry and later restore with preserved correlation', async () => {
  const { runtimeRoot: discordRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(discordRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const discordRuntimeMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/integrations/discord.js');
  const runtimeCoreMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-audit-restore-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runId = 'run-discord-audit-restore-1';
  const brokenRunLogDir = path.join(root, 'broken-run-log');
  fs.mkdirSync(path.dirname(brokenRunLogDir), { recursive: true });
  fs.writeFileSync(brokenRunLogDir, 'not-a-directory\n');

  const config = {
    project: 'behavior-discord-audit-restore',
    telemetry: { enabled: true },
    _runId: runId,
    run_id: runId,
    _logDir: logDir,
    _runLogDir: brokenRunLogDir,
    _runStats: runtimeCoreMod.createRunStats('2026-04-12T00:00:00.000Z'),
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
  };

  await discordRuntimeMod.discordEmbeds(config, [{
    title: 'Review gate degraded audit mirror',
    description: 'Testing discord.jsonl audit-log degradation',
    fields: [
      { name: 'Gate', value: 'gate:review' },
      { name: 'Gate Type', value: 'review' },
      { name: 'Label', value: 'reviewfix-review-01-1-1712876400000' },
      { name: 'Session', value: 'agent:echo:review-discord-audit' },
      { name: 'Attempt', value: '1' },
      { name: 'Dispatch', value: 'dispatch-review-01-1' },
    ],
  }], { level: 'WARN' });
  await flushAsync();

  const fixedRunLogDir = path.join(logDir, 'pipeline', 'runs', runId);
  fs.mkdirSync(fixedRunLogDir, { recursive: true });
  config._runLogDir = fixedRunLogDir;

  await discordRuntimeMod.discordEmbeds(config, [{
    title: 'Review gate restored audit mirror',
    description: 'Testing discord.jsonl audit-log recovery',
    fields: [
      { name: 'Gate', value: 'gate:review' },
      { name: 'Gate Type', value: 'review' },
      { name: 'Label', value: 'reviewfix-review-01-1-1712876400000' },
      { name: 'Session', value: 'agent:echo:review-discord-audit' },
      { name: 'Attempt', value: '1' },
      { name: 'Dispatch', value: 'dispatch-review-01-1' },
    ],
  }], { level: 'OK' });
  await flushAsync();

  const events = xaddEvents(`pipeline:telemetry:behavior-discord-audit-restore:${runId}`)
    .filter((event) => event.type === 'observability.degraded' || event.type === 'observability.restored');
  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(fixedRunLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));

  assert.deepEqual(events.map((event) => event.type), ['observability.degraded', 'observability.restored']);
  assert.equal(events[0].component, 'discord');
  assert.equal(events[0].surface, 'audit_log');
  assert.equal(events[0].reason, 'audit_write_failed');
  assert.equal(events[0].gate_id, 'gate:review');
  assert.equal(events[0].gate_type, 'review');
  assert.equal(events[0].gateway_label, 'reviewfix-review-01-1-1712876400000');
  assert.equal(events[0].session_key, 'agent:echo:review-discord-audit');
  assert.equal(events[0].attempt, 1);
  assert.equal(events[0].dispatch_id, 'dispatch-review-01-1');
  assert.equal(String(events[0].detail).startsWith('discord audit log write failed:'), true);
  assert.equal(events[1].component, 'discord');
  assert.equal(events[1].surface, 'audit_log');
  assert.equal(events[1].reason, 'audit_write_failed');
  assert.equal(events[1].gate_id, 'gate:review');
  assert.equal(events[1].gate_type, 'review');
  assert.equal(events[1].gateway_label, 'reviewfix-review-01-1-1712876400000');
  assert.equal(events[1].session_key, 'agent:echo:review-discord-audit');
  assert.equal(events[1].attempt, 1);
  assert.equal(events[1].dispatch_id, 'dispatch-review-01-1');
  assert.equal(events[1].detail, 'discord audit log writes restored');
  assert.equal(typeof events[1].restored_after_ms, 'number');
  assert.equal(runScopedEntry.gate_id, 'gate:review');
  assert.equal(runScopedEntry.gate_type, 'review');
  assert.equal(runScopedEntry.gateway_label, 'reviewfix-review-01-1-1712876400000');
  assert.equal(runScopedEntry.session_key, 'agent:echo:review-discord-audit');
  assert.equal(runScopedEntry.dispatch_id, 'dispatch-review-01-1');
});

await record('Buster gate-owned Discord artifacts preserve canonical gate correlation', async () => {
  const { runtimeRoot: sandboxDiscordRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  const busterDiscordMod = await importRuntimeModule(sandboxDiscordRoot, '/app/skills/pipeline/services/discord.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-gate-discord-'));
  const logDir = path.join(root, '.swarm', 'logs', 'gates', 'gate-review');

  const payload = busterDiscordMod.sendDiscord({
    title: 'Gate review blocked',
    fields: [
      { name: 'Issue', value: 'Tests still failing', inline: false },
    ],
  }, {
    project: 'behavior-buster-discord',
    runId: 'run-buster-gate-discord-1',
    gateId: 'gate:review',
    attempt: 2,
    dispatchId: 'dispatch-gate-review-1',
    sessionKey: 'agent:main:acp:gate-review',
    logDir,
  });

  const entry = JSON.parse(fs.readFileSync(path.join(logDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const fieldNames = (payload.embeds?.[0]?.fields || []).map((field) => field.name);
  const busterSource = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.js');

  assert.equal(entry.project, 'behavior-buster-discord');
  assert.equal(entry.run_id, 'run-buster-gate-discord-1');
  assert.equal(entry.gate_id, 'gate:review');
  assert.equal(entry.attempt, 2);
  assert.equal(entry.dispatch_id, 'dispatch-gate-review-1');
  assert.equal(entry.session_key, 'agent:main:acp:gate-review');
  assert.equal(fieldNames.includes('Gate'), true);
  assert.equal(fieldNames.includes('Dispatch'), true);
  assert.equal(fieldNames.includes('Session'), true);
  assert.equal(busterSource.includes('gateId: extra.gateId ?? gateId,'), true);
});

await record('observability docs use the current dotted telemetry event names', async () => {
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'observability-reference.md'), 'utf8');

  assert.equal(observabilityDoc.includes('`pipeline.started`'), true);
  assert.equal(observabilityDoc.includes('`module.status_changed`'), true);
  assert.equal(observabilityDoc.includes('`gate.verdict`'), true);
  assert.equal(observabilityDoc.includes('| `gate.verdict` | Gate returns GO or NO-GO |'), true);
  assert.equal(observabilityDoc.includes('| `gate.verdict` | Gate passes, fails, or blocks |'), false);
  assert.equal(observabilityDoc.includes('| `agent.spawned` | Session-backed agent work (Forge, Echo, subagent-backed fixes) spawned |'), true);
  assert.equal(observabilityDoc.includes('| `agent.spawned` | Agent (Forge, Echo, Buster) spawned |'), false);
  assert.equal(observabilityDoc.includes('| `agent.killed` | Session-backed agent work terminated |'), true);
  assert.equal(observabilityDoc.includes('`agent.killed`'), true);
  assert.equal(observabilityDoc.includes('`retry.scheduled`'), true);
  assert.equal(observabilityDoc.includes('`approval.requested`'), true);
  assert.equal(observabilityDoc.includes('`observability.degraded`'), true);
  assert.equal(observabilityDoc.includes('same module, gate, session, gateway-label, attempt, and dispatch correlation when known'), true);
  assert.equal(observabilityDoc.includes('If writing `.swarm/logs/pipeline/discord.jsonl` or the run-scoped `discord.jsonl` mirror fails, Nova emits `observability.degraded` on the `audit_log` surface and later emits `observability.restored` once Discord audit writes resume for that run.'), true);
  assert.equal(observabilityDoc.includes('`pipeline_started`'), false);
  assert.equal(observabilityDoc.includes('`agent_killed`'), false);
  assert.equal(observabilityDoc.includes('`retry_scheduled`'), false);
  assert.equal(observabilityDoc.includes('`approval_requested`'), false);
});

await record('observability docs use the canonical pipeline.jsonl envelope', async () => {
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'observability-reference.md'), 'utf8');

  assert.equal(observabilityDoc.includes('"type": "<event_type>"'), true);
  assert.equal(observabilityDoc.includes('"ts": "2026-04-02T12:00:00.000Z"'), true);
  assert.equal(observabilityDoc.includes('"source": "pipeline"'), true);
  assert.equal(observabilityDoc.includes('"emitter": "nova/pipeline/services/observability"'), true);
  assert.equal(observabilityDoc.includes("select(.type == \"module.status_changed\" and .new_status == \"FAIL\")"), true);
  assert.equal(observabilityDoc.includes("select(.type | startswith(\"budget.\"))"), true);
  assert.equal(observabilityDoc.includes('"event": "<event_type>"'), false);
  assert.equal(observabilityDoc.includes('"timestamp": "2026-04-02T12:00:00.000Z"'), false);
  assert.equal(observabilityDoc.includes("select(.event == \"module.status_changed\" and .new_status == \"FAIL\")"), false);
});

await record('observability docs use the current budget artifact event names and fields', async () => {
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'observability-reference.md'), 'utf8');

  assert.equal(observabilityDoc.includes('"type": "budget.warning"'), true);
  assert.equal(observabilityDoc.includes('"current_cost_usd": 1.24'), true);
  assert.equal(observabilityDoc.includes('"budget_usd": 1.00'), true);
  assert.equal(observabilityDoc.includes('"percent_used": 124'), true);
  assert.equal(observabilityDoc.includes('Event types: `budget.warning`, `budget.exceeded`.'), true);
  assert.equal(observabilityDoc.includes('| `warn_cost_usd` | Emit `budget.warning` once estimated cost reaches this amount |'), true);
  assert.equal(observabilityDoc.includes('"type": "cost_warning"'), false);
  assert.equal(observabilityDoc.includes('Event types: `cost_warning`, `cost_exceeded`, `token_warning`.'), false);
  assert.equal(observabilityDoc.includes('| `hard_limit_cost_usd` | Emit `cost_exceeded`; `isBudgetExceeded()` returns `true` |'), false);
});

await record('observability runtime budget artifacts use canonical budget event types and normalized fields', async () => {
  const observabilityMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/observability.js');
  const costDirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-budget-'));
  const config = {
    _logDir: costDirRoot,
    _runId: 'run-budget-artifact-1',
    run_id: 'run-budget-artifact-1',
    project: 'behavior-budget-artifact',
    observability: {
      budget: {
        warn_cost_usd: 1,
        hard_limit_cost_usd: 5,
        warn_tokens: 100,
      },
    },
  };

  const warnings = observabilityMod.checkBudgetThresholds({
    run: {
      input_tokens: 70,
      output_tokens: 50,
      estimated_cost_usd: 1.24,
      partial: false,
    },
  }, config.observability.budget);

  assert.equal(warnings.some((warning) => warning.type === 'budget.warning' && warning.threshold === 'warn_cost_usd' && warning.unit === 'usd' && warning.current_cost_usd === 1.24 && warning.budget_usd === 1), true);
  assert.equal(warnings.some((warning) => warning.type === 'budget.warning' && warning.threshold === 'warn_tokens' && warning.unit === 'tokens' && warning.current === 120 && warning.limit === 100), true);
  assert.equal(warnings.some((warning) => warning.type === 'cost_warning' || warning.type === 'cost_exceeded' || warning.type === 'token_warning'), false);

  observabilityMod.emitBudgetWarnings(config, [warnings[0]]);
  const budgetEventsPath = path.join(costDirRoot, 'cost', 'budget-events.jsonl');
  const emitted = JSON.parse(fs.readFileSync(budgetEventsPath, 'utf8').trim().split('\n')[0]);
  assert.equal(emitted.type, 'budget.warning');
  assert.equal(emitted.threshold, 'warn_cost_usd');
  assert.equal(emitted.current, 1.24);
  assert.equal(emitted.limit, 1);
  assert.equal(emitted.unit, 'usd');
  assert.equal(emitted.current_cost_usd, 1.24);
  assert.equal(emitted.budget_usd, 1);
  assert.equal(emitted.percent_used, 124);

  fs.writeFileSync(path.join(costDirRoot, 'cost', 'usage-snapshots.jsonl'), `${JSON.stringify({ input_tokens: 0, output_tokens: 0, estimated_cost_usd: 5.12 })}\n`);
  assert.equal(observabilityMod.isBudgetExceeded(config), true);
});
}
