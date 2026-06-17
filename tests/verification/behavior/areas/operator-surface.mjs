import {
  buildBuiltInRegistry,
} from './helpers.mjs';

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
    paths: { swarm_dir: path.join(root, '.swarm') },
  }, 'INFO', 'Module 01 started', 'Testing Discord correlation', [
    { name: 'Session', value: 'agent:forge:mod-01' },
    { name: 'Attempt', value: '2/3' },
    { name: 'Module', value: '01' },
  ], {
    correlation: {
      session_key: 'agent:forge:mod-01',
      attempt: 2,
      module_id: '01',
    },
  });

  const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const discordSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'integrations', 'discord.ts'), 'utf8');

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
    paths: { swarm_dir: path.join(root, '.swarm') },
  }, 'CRITICAL', 'Pipeline halted: gate review', 'Testing gate type correlation', [
    { name: 'Gate', value: 'review' },
    { name: 'Gate Type', value: 'review' },
    { name: 'Session', value: 'agent:echo:review-1' },
  ], {
    correlation: {
      gate_id: 'review',
      gate_type: 'review',
      session_key: 'agent:echo:review-1',
    },
  });

  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const discordSource = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'integrations', 'discord.ts'), 'utf8');

  assert.equal(runScopedEntry.gate_id, 'review');
  assert.equal(runScopedEntry.gate_type, 'review');
  assert.equal(runScopedEntry.session_key, 'agent:echo:review-1');
  assert.equal(discordSource.includes("else if ((name === 'gate type' || name === 'gate_type') && !correlation.gate_type) correlation.gate_type = value;"), false);
});

await record('approval gate Discord audit artifacts preserve canonical gate_type reporting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-approval-gate-type-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-approval-gate-type-1');
  fs.mkdirSync(runLogDir, { recursive: true });

  await discordMod.discord({
    project: 'behavior-approval-gate-type',
    _runId: 'run-approval-gate-type-1',
    paths: { swarm_dir: path.join(root, '.swarm') },
  }, 'WARN', '⏸️ Approval Required: Production deploy', 'Testing approval gate type correlation', [
    { name: 'Run ID', value: 'run-approval-gate-type-1', inline: true },
    { name: 'Gate', value: 'gate:approval', inline: true },
    { name: 'Gate Type', value: 'approval', inline: true },
    { name: 'Approved by', value: 'operator', inline: false },
  ], {
    correlation: {
      run_id: 'run-approval-gate-type-1',
      gate_id: 'gate:approval',
      gate_type: 'approval',
    },
  });

  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const approvalGateRunner = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/approval-gate-runner.ts');

  assert.equal(runScopedEntry.run_id, 'run-approval-gate-type-1');
  assert.equal(runScopedEntry.gate_id, 'gate:approval');
  assert.equal(runScopedEntry.gate_type, 'approval');
  assert.equal(approvalGateRunner.includes('buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: gateState.run_id, gate_id: gateId, gate_type: gate.type }, embed.fields)'), true);
  assert.equal(approvalGateRunner.includes('fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: state.run_id, gate_id: gateId, gate_type: gate.type }, ['), true);
  assert.equal(approvalGateRunner.includes("buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: current.run_id || config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type }, ["), true);
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
      paths: { swarm_dir: path.join(root, '.swarm') },
      discord_webhook_url: 'https://example.invalid/webhook',
      discord_alerts: { info: true },
    }, 'INFO', 'Muted Discord', 'This should not hit curl.', [
      { name: 'Module', value: '01' },
    ]);

    const { runtimeRoot: sandboxDiscordRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
    const busterDiscordMod = await importRuntimeModule(sandboxDiscordRoot, '/app/skills/pipeline/services/discord.ts');
    busterDiscordMod.sendDiscord({
      title: 'Muted Buster Discord',
      description: 'This should not hit curl.',
    }, {
      project: 'behavior-discord-muted',
      run_id: 'run-discord-muted',
      gate_id: 'gate:muted',
      webhook_url: 'https://example.invalid/webhook',
      log_dir: busterLogDir,
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

  const discordRuntimeMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/integrations/discord.ts');
  const runtimeCoreMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(discordRuntimeRoot);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-webhook-fail-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runId = 'run-discord-webhook-fail-1';
  const runLogDir = path.join(logDir, 'pipeline', 'runs', runId);
  fs.mkdirSync(runLogDir, { recursive: true });
  const webhook = await startGatewayServer(async () => { throw new Error('discord rejected'); });

  const oldMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '';
  try {
    await discordRuntimeMod.discord({
      project: 'behavior-discord-webhook-fail',
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      paths: { swarm_dir: path.join(root, '.swarm') },
      _runStats: runtimeCoreMod.createRunStats('2026-04-12T00:00:00.000Z'),
      pluginRegistry: registry,
      discord_webhook_url: webhook.url,
      discord_alerts: { warn: true },
    }, 'WARN', 'Discord degraded', 'Testing webhook failure observability', [
      { name: 'Module', value: '01' },
      { name: 'Gateway Label', value: 'forge-01-1712876400000' },
      { name: 'Session', value: 'agent:forge:discord-fail' },
      { name: 'Attempt', value: '2' },
      { name: 'Dispatch', value: 'dispatch-mod-01-2' },
    ], {
      correlation: {
        module_id: '01',
        gateway_label: 'forge-01-1712876400000',
        session_key: 'agent:forge:discord-fail',
        attempt: 2,
        dispatch_id: 'dispatch-mod-01-2',
      },
    });
    await flushAsync();
  } finally {
    await webhook.close();
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
  assert.equal(events[0].detail, 'discord webhook delivery failed: HTTP 500 Internal Server Error');
});

await record('Discord webhook delivery recovery emits explicit restored observability telemetry after a later successful post', async () => {
  const { runtimeRoot: discordRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(discordRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const discordRuntimeMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/integrations/discord.ts');
  const runtimeCoreMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(discordRuntimeRoot);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-webhook-restore-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runId = 'run-discord-webhook-restore-1';
  const runLogDir = path.join(logDir, 'pipeline', 'runs', runId);
  fs.mkdirSync(runLogDir, { recursive: true });
  const failingWebhook = await startGatewayServer(async () => { throw new Error('discord rejected'); });
  const restoredWebhook = await startGatewayServer(async () => ({ ok: true }));

  const oldMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '';
  try {
    const config = {
      project: 'behavior-discord-webhook-restore',
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      paths: { swarm_dir: path.join(root, '.swarm') },
      _runStats: runtimeCoreMod.createRunStats('2026-04-12T00:00:00.000Z'),
      pluginRegistry: registry,
      discord_webhook_url: failingWebhook.url,
      discord_alerts: { warn: true, ok: true },
    };

    await discordRuntimeMod.discordEmbeds(config, [{
      title: 'Review gate stalled',
      description: 'Testing webhook recovery observability',
      fields: [
        { name: 'Gate', value: 'gate:review' },
        { name: 'Gate Type', value: 'review' },
        { name: 'Gateway Label', value: 'reviewfix-review-01-1-1712876400000' },
        { name: 'Session', value: 'agent:echo:review-discord' },
        { name: 'Attempt', value: '1' },
        { name: 'Dispatch', value: 'dispatch-review-01-1' },
      ],
    }], {
      level: 'WARN',
      correlation: {
        gate_id: 'gate:review',
        gate_type: 'review',
        gateway_label: 'reviewfix-review-01-1-1712876400000',
        session_key: 'agent:echo:review-discord',
        attempt: 1,
        dispatch_id: 'dispatch-review-01-1',
      },
    });
    await flushAsync();

    config.discord_webhook_url = restoredWebhook.url;

    await discordRuntimeMod.discordEmbeds(config, [{
      title: 'Review gate recovered',
      description: 'Testing webhook recovery observability',
      fields: [
        { name: 'Gate', value: 'gate:review' },
        { name: 'Gate Type', value: 'review' },
        { name: 'Gateway Label', value: 'reviewfix-review-01-1-1712876400000' },
        { name: 'Session', value: 'agent:echo:review-discord' },
        { name: 'Attempt', value: '1' },
        { name: 'Dispatch', value: 'dispatch-review-01-1' },
      ],
    }], {
      level: 'OK',
      correlation: {
        gate_id: 'gate:review',
        gate_type: 'review',
        gateway_label: 'reviewfix-review-01-1-1712876400000',
        session_key: 'agent:echo:review-discord',
        attempt: 1,
        dispatch_id: 'dispatch-review-01-1',
      },
    });
    await flushAsync();
  } finally {
    await failingWebhook.close();
    await restoredWebhook.close();
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
    const redisToolMod = await importRuntimeModule(redisRuntimeRoot, '/app/skills/pipeline/tools/redis.ts');
    await redisToolMod.default.publishTask('buster', 'module_test', {
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

  const discordRuntimeMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/integrations/discord.ts');
  const runtimeCoreMod = await importRuntimeModule(discordRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(discordRuntimeRoot);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-audit-restore-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runId = 'run-discord-audit-restore-1';
  const runLogDir = path.join(logDir, 'pipeline', 'runs', runId);
  fs.mkdirSync(path.dirname(runLogDir), { recursive: true });
  fs.writeFileSync(runLogDir, 'not-a-directory\n');

  const config = {
    project: 'behavior-discord-audit-restore',
    telemetry: { enabled: true },
    _runId: runId,
    run_id: runId,
    paths: { swarm_dir: path.join(root, '.swarm') },
    _runStats: runtimeCoreMod.createRunStats('2026-04-12T00:00:00.000Z'),
    pluginRegistry: registry,
    _disable_discord_webhooks: true,
    discord_webhook_url: 'https://example.invalid/webhook',
  };

  await discordRuntimeMod.discordEmbeds(config, [{
    title: 'Review gate degraded audit mirror',
    description: 'Testing discord.jsonl audit-log degradation',
    fields: [
      { name: 'Gate', value: 'gate:review' },
      { name: 'Gate Type', value: 'review' },
      { name: 'Gateway Label', value: 'reviewfix-review-01-1-1712876400000' },
      { name: 'Session', value: 'agent:echo:review-discord-audit' },
      { name: 'Attempt', value: '1' },
      { name: 'Dispatch', value: 'dispatch-review-01-1' },
    ],
  }], {
    level: 'WARN',
    correlation: {
      gate_id: 'gate:review',
      gate_type: 'review',
      gateway_label: 'reviewfix-review-01-1-1712876400000',
      session_key: 'agent:echo:review-discord-audit',
      attempt: 1,
      dispatch_id: 'dispatch-review-01-1',
    },
  });
  await flushAsync();

  const fixedRunLogDir = path.join(logDir, 'pipeline', 'runs', runId);
  fs.rmSync(fixedRunLogDir, { force: true });
  fs.mkdirSync(fixedRunLogDir, { recursive: true });

  await discordRuntimeMod.discordEmbeds(config, [{
    title: 'Review gate restored audit mirror',
    description: 'Testing discord.jsonl audit-log recovery',
    fields: [
      { name: 'Gate', value: 'gate:review' },
      { name: 'Gate Type', value: 'review' },
      { name: 'Gateway Label', value: 'reviewfix-review-01-1-1712876400000' },
      { name: 'Session', value: 'agent:echo:review-discord-audit' },
      { name: 'Attempt', value: '1' },
      { name: 'Dispatch', value: 'dispatch-review-01-1' },
    ],
  }], {
    level: 'OK',
    correlation: {
      gate_id: 'gate:review',
      gate_type: 'review',
      gateway_label: 'reviewfix-review-01-1-1712876400000',
      session_key: 'agent:echo:review-discord-audit',
      attempt: 1,
      dispatch_id: 'dispatch-review-01-1',
    },
  });
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
  const busterDiscordMod = await importRuntimeModule(sandboxDiscordRoot, '/app/skills/pipeline/services/discord.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-gate-discord-'));
  const logDir = path.join(root, '.swarm', 'logs', 'gates', 'gate-review');

  const payload = busterDiscordMod.sendDiscord({
    title: 'Gate review blocked',
    fields: [
      { name: 'Issue', value: 'Tests still failing', inline: false },
    ],
  }, {
    project: 'behavior-buster-discord',
    run_id: 'run-buster-gate-discord-1',
    gate_id: 'gate:review',
    gate_type: 'review',
    attempt: 2,
    dispatch_id: 'dispatch-gate-review-1',
    session_key: 'agent:main:acp:gate-review',
    log_dir: logDir,
    actionability: {
      impact: 'Gate review is blocked until Buster evidence is inspected.',
      action: 'Inspect the run-scoped Discord artifact and decide whether to retry.',
      evidence: 'run discord: synthetic-run-discord.jsonl',
    },
  });

  const entry = JSON.parse(fs.readFileSync(path.join(logDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const fieldNames = (payload.embeds?.[0]?.fields || []).map((field) => field.name);
  const busterSource = `${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/pipeline-helpers.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/task-lifecycle.ts')}`;
  const rateLimitSource = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/rate-limit.ts');

  assert.equal(entry.project, 'behavior-buster-discord');
  assert.equal(entry.run_id, 'run-buster-gate-discord-1');
  assert.equal(entry.gate_id, 'gate:review');
  assert.equal(entry.gate_type, 'review');
  assert.equal(entry.attempt, 2);
  assert.equal(entry.dispatch_id, 'dispatch-gate-review-1');
  assert.equal(entry.session_key, 'agent:main:acp:gate-review');
  assert.equal(entry.actionability.impact, 'Gate review is blocked until Buster evidence is inspected.');
  assert.equal(entry.actionability.action, 'Inspect the run-scoped Discord artifact and decide whether to retry.');
  assert.equal(entry.actionability.evidence, 'run discord: synthetic-run-discord.jsonl');
  assert.equal(fieldNames.includes('Impact'), true);
  assert.equal(fieldNames.includes('Action'), true);
  assert.equal(fieldNames.includes('Evidence'), true);
  assert.equal(fieldNames.includes('Gate'), true);
  assert.equal(fieldNames.includes('Gate Type'), true);
  assert.equal(fieldNames.includes('Dispatch'), true);
  assert.equal(fieldNames.includes('Session'), true);
  assert.equal(busterSource.includes('gate_id: extra.gate_id ?? gateId,'), true);
  assert.equal(busterSource.includes('gate_type: extra.gate_type ?? payload?.gate_type ?? payload?.gateType,'), true);
  assert.equal(rateLimitSource.includes('    gate_type: gateType,'), true);
});

await record('Buster Discord alerts add default operator impact/action/evidence fields', async () => {
  const { runtimeRoot: sandboxDiscordRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  const busterDiscordMod = await importRuntimeModule(sandboxDiscordRoot, '/app/skills/pipeline/services/discord.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-discord-actionability-'));
  const logRoot = path.join(root, '.swarm', 'logs');
  const pipelineRunLogPath = path.join(logRoot, 'pipeline', 'runs', 'run-buster-actionability-1', 'pipeline.jsonl');
  const busterLogDir = path.join(logRoot, 'buster', '01', 'attempt-1');

  const payload = busterDiscordMod.sendDiscord({
    title: 'Buster actionability default',
    description: 'Should add operator actionability fields.',
  }, {
    project: 'behavior-buster-actionability',
    run_id: 'run-buster-actionability-1',
    module_id: '01',
    gate_id: 'gate:buster-actionability',
    gate_type: 'buster',
    attempt: 1,
    dispatch_id: 'dispatch-buster-actionability-1',
    session_key: 'agent:buster:actionability',
    log_dir: busterLogDir,
    pipeline_run_log_path: pipelineRunLogPath,
  });

  const fields = payload.embeds[0].fields;
  const fieldByName = Object.fromEntries(fields.map((field) => [field.name, field.value]));
  const entry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'runs', 'run-buster-actionability-1', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));

  assert.match(fieldByName.Impact, /gate gate:buster-actionability/);
  assert.match(fieldByName.Action, /latest\.json/);
  assert.match(fieldByName.Evidence, /run discord:/);
  assert.match(fieldByName.Evidence, /buster diagnostic:/);
  assert.equal(entry.actionability.impact, fieldByName.Impact);
  assert.equal(entry.actionability.action, fieldByName.Action);
  assert.equal(entry.actionability.evidence, fieldByName.Evidence);
  assert.equal(entry.gate_type, 'buster');
});

await record('Buster Discord mirrors task-local audit entries into canonical run Discord artifacts', async () => {
  const { runtimeRoot: sandboxDiscordRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  const busterDiscordMod = await importRuntimeModule(sandboxDiscordRoot, '/app/skills/pipeline/services/discord.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-discord-run-mirror-'));
  const logRoot = path.join(root, '.swarm', 'logs');
  const pipelineLogPath = path.join(logRoot, 'pipeline', 'pipeline.jsonl');
  const pipelineRunLogPath = path.join(logRoot, 'pipeline', 'runs', 'run-buster-discord-mirror-1', 'pipeline.jsonl');
  const busterLogDir = path.join(logRoot, 'buster', '01', 'attempt-1');

  busterDiscordMod.sendDiscord({
    title: 'Buster mirrored Discord',
    description: 'Task-local and run-scoped audit should both exist.',
  }, {
    project: 'behavior-buster-discord-mirror',
    run_id: 'run-buster-discord-mirror-1',
    module_id: '01',
    gate_id: 'gate:buster-smoke',
    gate_type: 'buster',
    attempt: 1,
    dispatch_id: 'dispatch-buster-discord-mirror-1',
    session_key: 'agent:buster:discord-mirror',
    log_dir: busterLogDir,
    pipeline_log_path: pipelineLogPath,
    pipeline_run_log_path: pipelineRunLogPath,
  });

  const taskLocalEntry = JSON.parse(fs.readFileSync(path.join(busterLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const topLevelEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));
  const runScopedEntry = JSON.parse(fs.readFileSync(path.join(logRoot, 'pipeline', 'runs', 'run-buster-discord-mirror-1', 'discord.jsonl'), 'utf8').trim().split('\n').at(-1));

  assert.equal(taskLocalEntry.source, 'buster');
  assert.equal(topLevelEntry.source, 'buster');
  assert.equal(runScopedEntry.source, 'buster');
  assert.equal(runScopedEntry.project, 'behavior-buster-discord-mirror');
  assert.equal(runScopedEntry.run_id, 'run-buster-discord-mirror-1');
  assert.equal(runScopedEntry.module_id, '01');
  assert.equal(runScopedEntry.gate_id, 'gate:buster-smoke');
  assert.equal(runScopedEntry.gate_type, 'buster');
  assert.equal(runScopedEntry.dispatch_id, 'dispatch-buster-discord-mirror-1');
  assert.equal(runScopedEntry.session_key, 'agent:buster:discord-mirror');
});

await record('Buster Discord webhook failures emit canonical degraded telemetry', async () => {
  const { runtimeRoot: sandboxDiscordRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(sandboxDiscordRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const busterDiscordMod = await importRuntimeModule(sandboxDiscordRoot, '/app/skills/pipeline/services/discord.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-discord-webhook-fail-'));
  const logRoot = path.join(root, '.swarm', 'logs');
  const webhook = await startGatewayServer(async () => { throw new Error('discord rejected'); });

  const oldMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '';
  try {
    busterDiscordMod.sendDiscord({
      title: 'Buster Discord webhook failure',
      description: 'Should emit degraded telemetry.',
    }, {
      project: 'behavior-buster-discord-webhook-fail',
      run_id: 'run-buster-discord-webhook-fail-1',
      module_id: '01',
      gate_id: 'gate:buster-webhook-fail',
      gate_type: 'buster',
      attempt: 1,
      dispatch_id: 'dispatch-buster-discord-webhook-fail-1',
      session_key: 'agent:buster:discord-webhook-fail',
      log_dir: path.join(logRoot, 'buster', '01', 'attempt-1'),
      pipeline_log_path: path.join(logRoot, 'pipeline', 'pipeline.jsonl'),
      pipeline_run_log_path: path.join(logRoot, 'pipeline', 'runs', 'run-buster-discord-webhook-fail-1', 'pipeline.jsonl'),
      telemetry_enabled: true,
      webhook_url: webhook.url,
    });
    await flushAsync();
    await flushAsync();

    const events = xaddEvents('pipeline:telemetry:behavior-buster-discord-webhook-fail:run-buster-discord-webhook-fail-1');
    const degraded = events.find((event) => event.type === 'observability.degraded' && event.component === 'buster_discord');
    assert(degraded);
    assert.equal(degraded.surface, 'webhook');
    assert.equal(degraded.reason, 'webhook_delivery_failed');
    assert.equal(degraded.module_id, '01');
    assert.equal(degraded.gate_id, 'gate:buster-webhook-fail');
    assert.equal(degraded.gate_type, 'buster');
    assert.equal(degraded.dispatch_id, 'dispatch-buster-discord-webhook-fail-1');
    assert.equal(degraded.session_key, 'agent:buster:discord-webhook-fail');
  } finally {
    await webhook.close();
    if (oldMute === undefined) delete process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
    else process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = oldMute;
  }
});

await record('Buster visual-reg Discord helpers route HTTP delivery through shared degraded telemetry', async () => {
  const { runtimeRoot: sandboxVisualRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(sandboxVisualRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const visualDiscordMod = await importRuntimeModule(sandboxVisualRoot, '/app/skills/pipeline/suites/visual-reg-discord.ts');
  const visualRegMod = await importRuntimeModule(sandboxVisualRoot, '/app/skills/pipeline/suites/visual-reg.ts');
  const busterTelemetryMod = await importRuntimeModule(sandboxVisualRoot, '/app/skills/pipeline/services/telemetry.ts');
  const webhook = await startGatewayServer(async () => { throw new Error('discord rejected'); });
  const logs = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-visual-reg-discord-http-fail-'));
  const actualPath = path.join(root, 'actual.png');
  fs.writeFileSync(actualPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const tctx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-visual-reg-discord-shared',
    module: '01',
    run_id: 'run-visual-reg-discord-shared-1',
    enabled: true,
    attempt: 1,
    dispatch_id: 'dispatch-visual-reg-discord-shared-1',
    session_key: 'agent:buster:visual-reg-discord-shared',
  });
  const deliveryContext = {
    project: 'behavior-visual-reg-discord-shared',
    run_id: 'run-visual-reg-discord-shared-1',
    module_id: '01',
    attempt: 1,
    dispatch_id: 'dispatch-visual-reg-discord-shared-1',
    session_key: 'agent:buster:visual-reg-discord-shared',
    telemetry_context: tctx,
  };
  const oldMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '';

  let summaryFailure;
  let singleFailure;
  let summaryRestored;
  const { createServer } = await import('node:http');
  const successServer = createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain multipart body */ }
    res.writeHead(204);
    res.end();
  });
  await new Promise((resolve) => successServer.listen(0, '127.0.0.1', resolve));
  const successAddress = successServer.address();
  const successWebhook = {
    url: `http://127.0.0.1:${successAddress.port}`,
    close: () => new Promise((resolve, reject) => successServer.close((err) => (err ? reject(err) : resolve()))),
  };
  try {
    summaryFailure = await visualDiscordMod.discordSummary('01', [{ name: 'home', status: 'PASS', diffPercent: 0 }], 'PASS', true, {
      webhookUrl: webhook.url,
      log: (line) => logs.push(line),
      deliveryContext,
    });
    singleFailure = await visualDiscordMod.discordSingle('01', 'home', actualPath, null, 0, 'PASS', {
      webhookUrl: webhook.url,
      log: (line) => logs.push(line),
      deliveryContext,
    });
    await flushAsync();
    await flushAsync();
    summaryRestored = await visualDiscordMod.discordSummary('01', [{ name: 'home', status: 'PASS', diffPercent: 0 }], 'PASS', true, {
      webhookUrl: successWebhook.url,
      log: (line) => logs.push(line),
      deliveryContext,
    });
    await flushAsync();
    await flushAsync();
  } finally {
    await webhook.close();
    await successWebhook.close();
    await busterTelemetryMod.closeTelemetry(tctx);
    if (oldMute === undefined) delete process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
    else process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = oldMute;
    fs.rmSync(root, { recursive: true, force: true });
  }

  assert.equal(summaryFailure.status, 'failed_noncritical');
  assert.equal(summaryFailure.sent, false);
  assert.match(summaryFailure.error, /HTTP 500|webhook/i);
  assert.equal(singleFailure.status, 'failed_noncritical');
  assert.equal(singleFailure.sent, false);
  assert.match(singleFailure.error, /HTTP 500|webhook/i);
  assert.equal(summaryRestored.status, 'sent');
  assert.equal(summaryRestored.sent, true);
  assert.equal(visualRegMod.summarizeDiscordDelivery([summaryFailure, singleFailure]).discord_sent, false);
  assert.equal(visualRegMod.summarizeDiscordDelivery([summaryFailure, singleFailure]).discord_status, 'failed_noncritical');

  const telemetryEvents = xaddEvents('pipeline:telemetry:behavior-visual-reg-discord-shared:run-visual-reg-discord-shared-1')
    .filter((event) => event.type === 'observability.degraded' || event.type === 'observability.restored');
  assert.deepEqual(telemetryEvents.map((event) => event.type), ['observability.degraded', 'observability.restored']);
  assert.equal(telemetryEvents[0].component, 'buster_discord');
  assert.equal(telemetryEvents[0].surface, 'webhook');
  assert.equal(telemetryEvents[0].reason, 'webhook_delivery_failed');
  assert.equal(telemetryEvents[0].module_id, '01');
  assert.equal(telemetryEvents[0].dispatch_id, 'dispatch-visual-reg-discord-shared-1');
  assert.equal(telemetryEvents[1].component, 'buster_discord');
  assert.equal(telemetryEvents[1].surface, 'webhook');
});

await record('Nova git soft-fail callers emit degraded telemetry outside git retry helper', async () => {
  const { runtimeRoot: gitSoftFailRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(gitSoftFailRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const reviewTaskMod = await importRuntimeModule(gitSoftFailRoot, '/app/skills/pipeline/runners/review-gate-task.ts');
  const sourceGitWorktree = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'integrations', 'git-worktree.ts'), 'utf8');
  const registry = await buildBuiltInRegistry(gitSoftFailRoot);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-git-soft-fail-observability-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-git-soft-fail-observability-1');
  fs.mkdirSync(runLogDir, { recursive: true });
  const config = {
    project: 'behavior-git-soft-fail-observability',
    repo_root: root,
    _runId: 'run-git-soft-fail-observability-1',
    run_id: 'run-git-soft-fail-observability-1',
    pluginRegistry: registry,
    telemetry: { enabled: true },
    rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
    paths: { swarm_dir: path.join(root, '.swarm') },
    _runStats: {
      total_echo_reviews: 0,
      modules_completed: [],
      modules_failed: [],
      modules_blocked: [],
      gates_completed: [],
      gates_failed: [],
    },
  };

  try {
    const gate = {
      type: 'review',
      title: 'Soft fail review',
      review_name: 'quality',
      output_file: 'review-output.json',
    };
    const reviewer = { label: 'echo-quality', model: 'echo-model' };
    await reviewTaskMod.runReviewGateOnce({
      config,
      progress: { modules: {}, gates: { 'gate:review': gate } },
      gateId: 'gate:review',
      gate,
      reviewConfig: {
        reviewers: [reviewer],
        primaryReviewer: reviewer,
        timeout: 1,
        lintTier: 'full',
        lintRequired: false,
      },
      deps: {
        generateLintReport: () => ({ report: null, error: 'optional lint disabled in soft-fail test' }),
        formatLintReportForReviewer: () => 'lint block',
        readGateInstructions: () => 'Review the code',
        buildReviewerPrompt: () => ({ prompt: 'Return strict JSON' }),
        archiveGateOutputIfPresent: () => null,
        resolvePolicy: () => ({ model: 'echo-model', model_source: 'test', thinking: null }),
        logEffectivePolicy: () => {},
        spawnReviewerAgent: async () => ({}),
        getTrackedAgent: () => ({ sessionKey: 'agent:echo:soft-fail-review', gatewayLabel: 'echo-quality', streamLogPath: null }),
        pollForFile: async (_config, outputPath) => {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, JSON.stringify({ status: 'GO' }, null, 2));
          return { ok: true, status: { session_key: 'agent:echo:soft-fail-review' } };
        },
        killReviewerAgent: async () => true,
        sleep: async () => {},
        discord: async () => {},
        gitCommitAndPush: async () => ({ committed: false, error: 'synthetic soft git failure' }),
      },
    });
    await flushAsync();
    await flushAsync();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  const degraded = xaddEvents('pipeline:telemetry:behavior-git-soft-fail-observability:run-git-soft-fail-observability-1')
    .find((event) => event.type === 'observability.degraded' && event.reason === 'git_commit_push_soft_failed');
  assert(degraded, 'missing git soft-fail observability.degraded event');
  assert.equal(degraded.component, 'git_worktree');
  assert.equal(degraded.surface, 'commit_push');
  assert.equal(degraded.gate_id, 'gate:review');
  assert.equal(degraded.gate_type, 'review');
  assert.equal(degraded.attempt, 1);
  assert.equal(degraded.detail, 'synthetic soft git failure');
  assert.equal(sourceGitWorktree.includes('emitObservabilityDegraded'), false, 'git retry helper must not emit degraded telemetry for transient retries');
});

await record('model-policy audit append failures emit Redis-oriented system.io_warning', async () => {
  const { runtimeRoot: policyWarningRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(policyWarningRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const policyMod = await importRuntimeModule(policyWarningRoot, '/app/skills/pipeline/core/policy.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-policy-io-warning-'));
  const logDir = path.join(root, '.swarm', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'pipeline'), 'not a directory');

  try {
    policyMod.logEffectivePolicy({
      project: 'behavior-policy-io-warning',
      _runId: 'run-policy-io-warning-1',
      run_id: 'run-policy-io-warning-1',
      paths: { swarm_dir: path.join(root, '.swarm') },
      telemetry: { enabled: true },
    }, {
      scope: 'module_forge',
      agent: 'forge',
      moduleId: '01',
      attempt: 2,
      model: 'test-model',
      model_source: 'project_default',
      thinking: null,
      thinking_source: 'none',
    });
    await flushAsync();
    await flushAsync();

    const warning = xaddEvents('pipeline:telemetry:behavior-policy-io-warning:run-policy-io-warning-1')
      .find((event) => event.type === 'system.io_warning');
    assert(warning, 'missing system.io_warning event');
    assert.equal(warning.component, 'model_policy');
    assert.equal(warning.surface, 'audit_log');
    assert.equal(warning.reason, 'policy_audit_append_failed');
    assert.equal(warning.operation, 'append');
    assert.equal(warning.path_role, 'model_policy_jsonl');
    assert.equal(warning.module_id, '01');
    assert.equal(warning.attempt, 2);
    assert.equal(warning.path.endsWith('/pipeline/model-policy.jsonl'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await record('pipeline JSONL append failures emit Redis-oriented system.io_warning', async () => {
  const { runtimeRoot: loggerWarningRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(loggerWarningRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const loggerMod = await importRuntimeModule(loggerWarningRoot, '/app/skills/pipeline/core/logger.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-log-io-warning-'));
  const blockedDir = path.join(root, 'not-a-dir');
  fs.writeFileSync(blockedDir, 'file blocks mkdir');

  try {
    const ctx = {
      runId: 'run-pipeline-log-io-warning-1',
      config: {
        project: 'behavior-pipeline-log-io-warning',
        _runId: 'run-pipeline-log-io-warning-1',
        run_id: 'run-pipeline-log-io-warning-1',
        telemetry: { enabled: true },
      },
      stats: { errors: [] },
      _pipelineLogPath: path.join(blockedDir, 'pipeline.jsonl'),
      _runPipelineLogPath: null,
      _logModule: '01',
    };
    loggerMod.createLogger(ctx).log('INFO', 'force structural logger append failure');
    await flushAsync();
    await flushAsync();

    const warning = xaddEvents('pipeline:telemetry:behavior-pipeline-log-io-warning:run-pipeline-log-io-warning-1')
      .find((event) => event.type === 'system.io_warning');
    assert(warning, 'missing system.io_warning event');
    assert.equal(warning.component, 'pipeline_logger');
    assert.equal(warning.surface, 'pipeline_jsonl');
    assert.equal(warning.reason, 'pipeline_jsonl_append_failed');
    assert.equal(warning.path_role, 'pipeline_jsonl');
    assert.equal(warning.module_id, '01');
    assert.equal(warning.path.endsWith('/not-a-dir/pipeline.jsonl'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await record('prompt artifact write failures emit Redis-oriented system.io_warning', async () => {
  const { runtimeRoot: promptWarningRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(promptWarningRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const statusStoreMod = await importRuntimeModule(promptWarningRoot, '/app/skills/pipeline/services/status-store.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-prompt-io-warning-'));
  const logDir = path.join(root, '.swarm', 'logs');
  fs.mkdirSync(path.join(logDir, 'modules'), { recursive: true });
  fs.writeFileSync(path.join(logDir, 'modules', '01'), 'file blocks prompt dir');

  try {
    statusStoreMod.savePrompt({
      project: 'behavior-prompt-io-warning',
      _runId: 'run-prompt-io-warning-1',
      run_id: 'run-prompt-io-warning-1',
      paths: { swarm_dir: path.join(root, '.swarm') },
      telemetry: { enabled: true },
      _progress: { modules: { '01': { dir: '01' } } },
    }, '01', 'forge', 3, 'test prompt');
    await flushAsync();
    await flushAsync();

    const warning = xaddEvents('pipeline:telemetry:behavior-prompt-io-warning:run-prompt-io-warning-1')
      .find((event) => event.type === 'system.io_warning');
    assert(warning, 'missing system.io_warning event');
    assert.equal(warning.component, 'prompt_artifact');
    assert.equal(warning.surface, 'redacted_prompt_artifact');
    assert.equal(warning.reason, 'prompt_artifact_write_failed');
    assert.equal(warning.path_role, 'redacted_prompt_artifact');
    assert.equal(warning.module_id, '01');
    assert.equal(warning.attempt, 3);
    assert.equal(warning.path.endsWith('/modules/01/forge-prompt-attempt-3.md'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await record('Buster visual-audit removes temp media when Discord upload throws', async () => {
  const { runtimeRoot: sandboxVisualRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  const playwrightStubDir = path.join(sandboxVisualRoot, 'node_modules', 'playwright');
  fs.mkdirSync(playwrightStubDir, { recursive: true });
  fs.writeFileSync(path.join(playwrightStubDir, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(playwrightStubDir, 'index.js'), 'export const chromium = { launch: async () => { throw new Error("test must inject chromiumImpl"); } };\n');

  const visualAuditMod = await importRuntimeModule(sandboxVisualRoot, '/app/skills/pipeline/tools/visual-audit.ts');
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-visual-audit-cleanup-'));

  const fakeChromium = {
    launch: async () => ({
      isConnected: () => true,
      close: async () => {},
      newContext: async () => ({
        close: async () => {},
        newPage: async () => ({
          goto: async () => {},
          screenshot: async ({ path: screenshotPath }) => {
            fs.writeFileSync(screenshotPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
          },
        }),
      }),
    }),
  };

  try {
    await assert.rejects(
      () => visualAuditMod.default('https://example.invalid', 'channel-1', 'token-1', 'image', {
        chromiumImpl: fakeChromium,
        fetchImpl: async () => { throw new Error('synthetic Discord upload failure'); },
        outputRoot,
        capabilities: ['browser_automation', 'discord_media'],
      }),
      /synthetic Discord upload failure/
    );

    const leakedAuditDirs = fs.readdirSync(outputRoot).filter((entry) => entry.startsWith('audit-'));
    assert.deepEqual(leakedAuditDirs, []);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

await record('Buster visual-reg Discord delivery results project truthful telemetry fields', async () => {
  const { createServer } = await import('node:http');
  const { runtimeRoot: sandboxVisualRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  const visualDiscordMod = await importRuntimeModule(sandboxVisualRoot, '/app/skills/pipeline/suites/visual-reg-discord.ts');
  const visualRegMod = await importRuntimeModule(sandboxVisualRoot, '/app/skills/pipeline/suites/visual-reg.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-visual-reg-discord-delivery-'));
  const actualPath = path.join(root, 'actual.png');
  fs.writeFileSync(actualPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, bytes: Buffer.concat(chunks).length });
    res.writeHead(204);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const webhookUrl = `http://127.0.0.1:${address.port}`;
  const oldMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '';

  try {
    const skipped = await visualDiscordMod.discordSummary('01', [], 'PASS', false, { webhookUrl: '' });
    const sent = await visualDiscordMod.discordSingle('01', 'home', actualPath, null, 0, 'PASS', { webhookUrl });
    const skippedTelemetry = visualRegMod.summarizeDiscordDelivery([skipped]);
    const sentTelemetry = visualRegMod.summarizeDiscordDelivery([sent]);
    const partialTelemetry = visualRegMod.summarizeDiscordDelivery([sent, skipped]);

    assert.equal(requests.length, 1);
    assert.equal(skipped.status, 'skipped_no_webhook');
    assert.equal(skipped.sent, false);
    assert.equal(sent.status, 'sent');
    assert.equal(sent.sent, true);
    assert.deepEqual(skippedTelemetry, {
      discord_sent: false,
      discord_status: 'skipped_no_webhook',
      discord_attempts: 1,
      discord_successes: 0,
      discord_failures: 0,
      discord_skipped: 1,
      discord_skipped_capability: 0,
    });
    assert.deepEqual(sentTelemetry, {
      discord_sent: true,
      discord_status: 'sent',
      discord_attempts: 1,
      discord_successes: 1,
      discord_failures: 0,
      discord_skipped: 0,
      discord_skipped_capability: 0,
    });
    assert.equal(partialTelemetry.discord_sent, true);
    assert.equal(partialTelemetry.discord_status, 'partial');
  } finally {
    if (oldMute === undefined) delete process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
    else process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = oldMute;
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await record('Buster logger append failures emit canonical degraded telemetry', async () => {
  const { runtimeRoot: loggerRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
  installFakeRedis(loggerRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const busterLoggerMod = await importRuntimeModule(loggerRuntimeRoot, '/app/skills/pipeline/services/logger.ts');
  const busterTelemetryMod = await importRuntimeModule(loggerRuntimeRoot, '/app/skills/pipeline/services/telemetry.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-logger-degraded-'));
  const logDir = path.join(root, '.swarm', 'logs', 'buster', '01', 'attempt-1');
  const blockedParent = path.join(root, 'blocked-parent');
  fs.writeFileSync(blockedParent, 'not a directory');

  const tctx = busterTelemetryMod.createTelemetryContext({
    project: 'behavior-buster-logger-degraded',
    module: '01',
    run_id: 'run-buster-logger-degraded-1',
    enabled: true,
    log_dir: logDir,
    attempt: 1,
    dispatch_id: 'dispatch-buster-logger-degraded-1',
    session_key: 'agent:buster:logger-degraded',
  });

  const logger = busterLoggerMod.createLogger({
    logPath: path.join(blockedParent, 'buster-pipeline.jsonl'),
    module: '01',
    taskType: 'module_test',
    attempt: 1,
    dispatchId: 'dispatch-buster-logger-degraded-1',
    sessionKey: 'agent:buster:logger-degraded',
    emitTelemetry: (type, data) => busterTelemetryMod.emitEvent(tctx, type, data),
  });
  logger.info('TASK', 'this append should fail');
  await flushAsync();
  await busterTelemetryMod.closeTelemetry(tctx);

  const events = xaddEvents('pipeline:telemetry:behavior-buster-logger-degraded:run-buster-logger-degraded-1');
  const degraded = events.find((event) => event.type === 'observability.degraded' && event.component === 'buster_logger');
  assert(degraded);
  assert.equal(degraded.surface, 'jsonl_file');
  assert.match(degraded.reason, /^log_(directory_create|file_append)_failed$/);
  assert.equal(degraded.module_id, '01');
  assert.equal(degraded.dispatch_id, 'dispatch-buster-logger-degraded-1');
  assert.equal(degraded.session_key, 'agent:buster:logger-degraded');
});

await record('observability docs use the current dotted telemetry event names', async () => {
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'observability-reference.md'), 'utf8');

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
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'observability-reference.md'), 'utf8');

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
  const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'observability-reference.md'), 'utf8');

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
  const observabilityMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/observability.ts');
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-budget-'));
  const costDirRoot = path.join(swarmDir, 'logs');
  const config = {
    paths: { swarm_dir: swarmDir },
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
