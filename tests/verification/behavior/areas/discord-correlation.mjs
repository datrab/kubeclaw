export async function registerDiscordCorrelationArea({
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
await record('Shared Discord identity builder preserves canonical field ordering and aliases for active operator surfaces', async () => {
  const { runtimeRoot: discordFieldsRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const discordFieldsMod = await importRuntimeModule(discordFieldsRuntimeRoot, '/app/skills/pipeline/services/discord-fields.ts');
  const { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } = discordFieldsMod;

  const moduleFields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
    run_id: 'run-module-1',
    module_id: '05',
    attempt: 2,
    dispatch_id: 'dispatch-buster-05-attempt-2',
    gateway_label: 'dispatch-buster-05-attempt-2',
    session_key: 'agent:main:acp:buster-05-attempt-2',
  });

  assert.deepEqual(moduleFields, [
    { name: 'Run ID', value: 'run-module-1', inline: true },
    { name: 'Module', value: '05', inline: true },
    { name: 'Attempt', value: '2', inline: true },
    { name: 'Dispatch', value: 'dispatch-buster-05-attempt-2', inline: false },
    { name: 'Gateway Label', value: 'dispatch-buster-05-attempt-2', inline: false },
    { name: 'Session', value: 'agent:main:acp:buster-05-attempt-2', inline: false },
  ]);

  const gateFields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
    runId: 'run-gate-1',
    gateId: 'review',
    gate_type: 'review',
    attempt: 1,
    dispatchId: 'review-dispatch-1',
    label: 'echo-review',
    sessionKey: 'agent:main:acp:echo-review-1',
  });

  assert.deepEqual(gateFields, [
    { name: 'Run ID', value: 'run-gate-1', inline: true },
    { name: 'Gate', value: 'review', inline: true },
    { name: 'Gate Type', value: 'review', inline: true },
    { name: 'Attempt', value: '1', inline: true },
    { name: 'Dispatch', value: 'review-dispatch-1', inline: false },
    { name: 'Session', value: 'agent:main:acp:echo-review-1', inline: false },
  ]);
});

await record('Shared Discord identity builder supports pipeline, failure, and rate-limit identity joins', async () => {
  const { runtimeRoot: discordFieldsRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const discordFieldsMod = await importRuntimeModule(discordFieldsRuntimeRoot, '/app/skills/pipeline/services/discord-fields.ts');
  const { buildDiscordIdentityFields, buildDiscordIdentitySurfaceFields, DISCORD_FIELD_SPECS, DISCORD_IDENTITY_SURFACES } = discordFieldsMod;

  const pipelineFields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, {
    run_id: 'run-pipeline-1',
    gate_id: 'review',
    gateType: 'review',
    step_type: 'gate',
    attempt: 3,
    dispatch_id: 'review-dispatch-3',
    gatewayLabel: 'review-dispatch-3',
    session_key: 'agent:main:acp:echo-review-3',
  });
  assert.equal(pipelineFields.at(2)?.value, 'review');
  assert.equal(pipelineFields.at(3)?.value, 'gate');
  assert.equal(pipelineFields.at(5)?.value, 'review-dispatch-3');

  const failureFields = buildDiscordIdentityFields({
    runId: 'run-fail-1',
    module_id: '06',
    gate_id: 'review',
    gate_type: 'review',
    phase: 'buster',
    attempt: 2,
    dispatchId: 'dispatch-fail-1',
    gateway_label: 'echo-review',
    sessionKey: 'agent:main:acp:echo-review-1',
    step_type: 'gate',
    step_id: 'review',
  }, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.PHASE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
    DISCORD_FIELD_SPECS.STEP_TYPE,
    DISCORD_FIELD_SPECS.STEP_ID,
  ]);
  assert.equal(failureFields.find((field) => field.name === 'Phase')?.value, 'buster');
  assert.equal(failureFields.find((field) => field.name === 'Step Type')?.value, 'gate');
  assert.equal(failureFields.find((field) => field.name === 'Step ID')?.value, 'review');

  const rateLimitFields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.RATE_LIMIT_SESSION, {
    run_id: 'run-rate-limit-1',
    gate_id: 'review',
    gate_type: 'review',
    agent_type: 'review',
    attempt: 4,
    dispatch_id: 'review-dispatch-4',
    label: 'echo-review',
    session_key: 'agent:main:acp:echo-review-4',
  });
  assert.equal(rateLimitFields.find((field) => field.name === 'Phase')?.value, 'review');
  assert.equal(rateLimitFields.find((field) => field.name === 'Gateway Label')?.value, undefined);
});

await record('Discord audit uses structured correlation instead of rendered field parsing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-discord-display-label-'));
  const logDir = path.join(root, '.swarm', 'logs');
  const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-discord-display-label-1');

  const config = {
    project: 'behavior-discord-display-label',
    _runId: 'run-discord-display-label-1',
    run_id: 'run-discord-display-label-1',
    paths: { swarm_dir: path.join(root, '.swarm') },
    _disable_discord_webhooks: true,
  };

  await discordMod.discord(config, 'INFO', 'Display label only', 'Testing structured correlation', [
    { name: 'Run ID', value: 'run-discord-display-label-1' },
    { name: 'Dispatch', value: 'dispatch-canonical-1' },
    { name: 'Label', value: 'human-readable-display-label' },
    { name: 'Session', value: 'agent:main:acp:canonical-session-1' },
  ], {
    correlation: {
      run_id: 'run-discord-display-label-1',
      dispatch_id: 'dispatch-canonical-1',
      session_key: 'agent:main:acp:canonical-session-1',
    },
  });

  await discordMod.discord(config, 'INFO', 'Explicit gateway label', 'Testing trusted gateway label metadata', [
    { name: 'Run ID', value: 'run-discord-display-label-1' },
    { name: 'Dispatch', value: 'dispatch-canonical-2' },
    { name: 'Gateway Label', value: 'trusted-gateway-label-2' },
    { name: 'Session', value: 'agent:main:acp:canonical-session-2' },
  ], {
    correlation: {
      run_id: 'run-discord-display-label-1',
      dispatch_id: 'dispatch-canonical-2',
      gateway_label: 'trusted-gateway-label-2',
      session_key: 'agent:main:acp:canonical-session-2',
    },
  });

  await discordMod.discord(config, 'INFO', 'Rendered-only labels', 'Testing rendered fields are not authoritative', [
    { name: 'Run ID', value: 'rendered-run-id-only' },
    { name: 'Dispatch', value: 'rendered-dispatch-only' },
    { name: 'Gateway Label', value: 'rendered-gateway-only' },
    { name: 'Session', value: 'rendered-session-only' },
  ]);

  const runScopedEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const displayLabelEntry = runScopedEntries.find((entry) => entry.title === 'Display label only');
  const gatewayLabelEntry = runScopedEntries.find((entry) => entry.title === 'Explicit gateway label');
  const renderedOnlyEntry = runScopedEntries.find((entry) => entry.title === 'Rendered-only labels');
  const discordSource = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/integrations/discord.ts');

  assert(displayLabelEntry, 'missing display label audit entry');
  assert.equal(displayLabelEntry.dispatch_id, 'dispatch-canonical-1');
  assert.equal(displayLabelEntry.session_key, 'agent:main:acp:canonical-session-1');
  assert.equal(displayLabelEntry.gateway_label, null);
  assert.equal(displayLabelEntry.fields.some((field) => field.name === 'Label' && field.value === 'human-readable-display-label'), true);

  assert(gatewayLabelEntry, 'missing explicit gateway label audit entry');
  assert.equal(gatewayLabelEntry.dispatch_id, 'dispatch-canonical-2');
  assert.equal(gatewayLabelEntry.session_key, 'agent:main:acp:canonical-session-2');
  assert.equal(gatewayLabelEntry.gateway_label, 'trusted-gateway-label-2');
  assert(renderedOnlyEntry, 'missing rendered-only audit entry');
  assert.equal(renderedOnlyEntry.dispatch_id, null);
  assert.equal(renderedOnlyEntry.session_key, null);
  assert.equal(renderedOnlyEntry.gateway_label, null);
  assert.equal(discordSource.includes("name === 'label'"), false);
  assert.equal(discordSource.includes("name === 'gateway label' || name === 'gateway_label'"), false);
  assert.equal(discordSource.includes('correlation_key'), true);
});

await record('Core operator-surface modules share the canonical Discord identity builder', async () => {
  const moduleRunner = [
    'skills/nova/pipeline/runners/module-runner-forge.ts',
    'skills/nova/pipeline/runners/module-runner-prebuster.ts',
    'skills/nova/pipeline/runners/module-runner/preflight.ts',
    'skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts',
    'skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts',
    'skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts',
    'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts',
    'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts',
    'skills/nova/pipeline/runners/module-runner-shared.ts',
  ].map((file) => readOverlayText(sourceRoot, overlayRoot, file)).join('\n');
  const busterGateRunner = `${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/buster-gate-runner.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/buster-gate-terminal.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/buster-gate-fix-cycle.ts')}`;
  const reviewGateRunner = `${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/review-gate-runner.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/review-gate-task.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/review-gate-fix-cycle.ts')}`;
  const pipelineRunner = `${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/pipeline-runner-start.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/pipeline-runner-recovery.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/pipeline-runner-terminal.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/pipeline-runner-shared.ts')}`;
  const gateRunner = `${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/gate-runner.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/gate-forge-fix-cycle.ts')}`;
  const approvalGateRunner = `${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/approval-gate-runner.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/approval-gate-state.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/approval-gate-shared.ts')}`;
  const orchestrationText = `${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/agents/orchestration.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/agents/reviewer-lifecycle.ts')}\n${readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/agents/orchestration-lifecycle-events.ts')}`;
  const failurePresentation = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/failures/presentation.ts');
  const rateLimitService = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/rate-limit.ts');
  const rateLimitBuilders = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/rate-limit-builders.ts');

  for (const source of [moduleRunner, busterGateRunner, reviewGateRunner, pipelineRunner, gateRunner, approvalGateRunner, orchestrationText]) {
    assert.equal(source.includes('buildDiscordIdentitySurfaceFields'), true, 'operator surface should use canonical Discord identity surface builder');
  }
  assert.equal(moduleRunner.includes('DISCORD_IDENTITY_SURFACES.MODULE_SESSION'), true);
  assert.equal(busterGateRunner.includes('DISCORD_IDENTITY_SURFACES.GATE_SESSION'), true);
  assert.equal(reviewGateRunner.includes('DISCORD_IDENTITY_SURFACES.GATE_SESSION'), true);
  assert.equal(pipelineRunner.includes('DISCORD_IDENTITY_SURFACES.PIPELINE'), true);
  assert.equal(gateRunner.includes('DISCORD_IDENTITY_SURFACES.GATE_DISPATCH'), true);
  assert.equal(approvalGateRunner.includes('DISCORD_IDENTITY_SURFACES.APPROVAL_GATE'), true);
  assert.equal(orchestrationText.includes('DISCORD_IDENTITY_SURFACES.LIFECYCLE'), true);
  for (const legacyHelper of [
    'buildLifecycleDiscordFields',
    'buildSpawnDiscordFields',
    'buildSpawnFailureDiscordFields',
    'buildReviewGateDiscordFields',
    'buildBusterGateDiscordFields',
    'buildApprovalGateDiscordFields',
    'buildModuleDiscordFields',
    'buildBusterDiscordFields',
    'buildGateDispatchDiscordFields',
    'buildPipelineDiscordFields',
  ]) {
    assert.equal(`${moduleRunner}
${busterGateRunner}
${reviewGateRunner}
${pipelineRunner}
${gateRunner}
${approvalGateRunner}
${orchestrationText}`.includes(legacyHelper), false, `${legacyHelper} should not remain`);
  }
  assert.equal(failurePresentation.includes("from '../discord-fields.ts';"), true);
  assert.equal(rateLimitService.includes("from './rate-limit-builders.ts';"), true);
  assert.equal(rateLimitBuilders.includes("from './discord-fields.ts';"), true);
});

await record('Nova injection Discord alerts preserve session correlation', async () => {
  const { runtimeRoot: failuresRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const failuresMod = await importRuntimeModule(failuresRuntimeRoot, '/app/skills/pipeline/services/failures/presentation.ts');

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    return { result: { details: { ok: true } } };
  });

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-nova-inject-'));
  const logDir = path.join(repoRoot, '.swarm', 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const sessionKey = 'agent:main:acp:nova-inject-01';
  const config = {
    project: 'behavior-nova-inject',
    _runId: 'run-nova-inject-1',
    run_id: 'run-nova-inject-1',
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _disable_discord_webhooks: true,
  };

  try {
    await failuresMod.injectNeedsNova(config, {
      exit: 10,
      module: '01',
      session_key: sessionKey,
      dispatch_id: 'dispatch-buster-fail-01',
      gateway_label: 'dispatch-buster-fail-01',
      reason: 'Forge fix needs Nova guidance',
      attempt: 3,
      fail_count: 3,
      max_fails: 3,
      remaining_attempts: 0,
      resume_command: 'node pipeline.ts --project behavior-nova-inject --resume --prompt "YOUR_NEW_APPROACH_HERE"',
    }, '1491459259647524965', 'module', '01');

    const sendRequest = requests.find((req) => req?.tool === 'sessions_send');
    assert(sendRequest, 'missing Nova injection sessions_send request');
    assert.equal(sendRequest.args.sessionKey, 'agent:main:discord:channel:1491459259647524965');
    assert.equal(sendRequest.args.message.includes('Run ID: run-nova-inject-1'), true);
    assert.equal(sendRequest.args.message.includes('Dispatch: dispatch-buster-fail-01'), true);
    assert.equal(sendRequest.args.message.includes(`Session: ${sessionKey}`), true);
    assert.equal(sendRequest.args.message.includes('Attempts: 3/3'), true);

    const injectionLogPath = path.join(logDir, 'pipeline', 'nova-injections.jsonl');
    const injectionEntries = fs.readFileSync(injectionLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const injectionEntry = injectionEntries.find((entry) => entry.step_id === '01' && entry.status === 'ok');
    assert(injectionEntry, 'missing Nova injection audit entry');
    assert.equal(injectionEntry.attempt, 3);
    assert.equal(injectionEntry.dispatch_id, 'dispatch-buster-fail-01');
    assert.equal(injectionEntry.gateway_label, 'dispatch-buster-fail-01');
    assert.equal(injectionEntry.session_key, sessionKey);

    const runInjectionLogPath = path.join(logDir, 'pipeline', 'runs', 'run-nova-inject-1', 'nova-injections.jsonl');
    const runInjectionEntries = fs.readFileSync(runInjectionLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const runInjectionEntry = runInjectionEntries.find((entry) => entry.step_id === '01' && entry.status === 'ok');
    assert(runInjectionEntry, 'missing run-scoped Nova injection audit entry');
    assert.equal(runInjectionEntry.dispatch_id, 'dispatch-buster-fail-01');
    assert.equal(runInjectionEntry.session_key, sessionKey);

    const discordAuditPath = path.join(logDir, 'pipeline', 'discord.jsonl');
    const discordEntries = fs.readFileSync(discordAuditPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const injectionAlert = discordEntries.find((entry) => entry.title === 'Nova injection sent: 01');
    assert(injectionAlert, 'missing Nova injection Discord audit alert');
    assert.equal(injectionAlert.attempt, 3);
    assert.equal(injectionAlert.session_key, sessionKey);
    assert.equal(injectionAlert.fields.some((field) => field.name === 'Attempt' && field.value === '3'), true);
    assert.equal(injectionAlert.fields.some((field) => field.name === 'Session' && field.value === sessionKey), true);
  } finally {
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('Gate-owned Nova injections preserve gate_type across message, audit, and Discord fields', async () => {
  const { runtimeRoot: failuresRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  const failuresMod = await importRuntimeModule(failuresRuntimeRoot, '/app/skills/pipeline/services/failures/presentation.ts');

  const requests = [];
  const gateway = await startGatewayServer(async ({ body }) => {
    requests.push(body);
    return { ok: true };
  });

  const prevGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.OPENCLAW_GATEWAY_URL = gateway.url;

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-nova-inject-gate-'));
  const logDir = path.join(repoRoot, '.swarm', 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const sessionKey = 'agent:main:acp:nova-inject-gate-review';
  const config = {
    project: 'behavior-nova-inject-gate',
    _runId: 'run-nova-inject-gate-1',
    run_id: 'run-nova-inject-gate-1',
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _disable_discord_webhooks: true,
  };

  try {
    await failuresMod.injectNeedsNova(config, {
      exit: 10,
      gate_id: 'review',
      gate_type: 'review',
      session_key: sessionKey,
      dispatch_id: 'review-dispatch-2',
      gateway_label: 'review-dispatch-2',
      attempt: 2,
      reason: 'Review gate needs Nova guidance',
      fail_count: 2,
      max_fails: 3,
      remaining_attempts: 1,
    }, '1491459259647524965', 'gate', 'review');

    const sendRequest = requests.find((req) => req?.tool === 'sessions_send');
    assert(sendRequest, 'missing gate Nova injection sessions_send request');
    assert.equal(sendRequest.args.message.includes('Run ID: run-nova-inject-gate-1'), true);
    assert.equal(sendRequest.args.message.includes('Gate Type: review'), true);
    assert.equal(sendRequest.args.message.includes('Dispatch: review-dispatch-2'), true);
    assert.equal(sendRequest.args.message.includes(`Session: ${sessionKey}`), true);
    assert.equal(sendRequest.args.message.includes('Attempts: 2/3'), true);

    const injectionLogPath = path.join(logDir, 'pipeline', 'nova-injections.jsonl');
    const injectionEntries = fs.readFileSync(injectionLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const injectionEntry = injectionEntries.find((entry) => entry.step_type === 'gate' && entry.step_id === 'review' && entry.status === 'ok');
    assert(injectionEntry, 'missing gate Nova injection audit entry');
    assert.equal(injectionEntry.gate_id, 'review');
    assert.equal(injectionEntry.gate_type, 'review');
    assert.equal(injectionEntry.attempt, 2);
    assert.equal(injectionEntry.dispatch_id, 'review-dispatch-2');
    assert.equal(injectionEntry.session_key, sessionKey);

    const runInjectionLogPath = path.join(logDir, 'pipeline', 'runs', 'run-nova-inject-gate-1', 'nova-injections.jsonl');
    const runInjectionEntries = fs.readFileSync(runInjectionLogPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const runInjectionEntry = runInjectionEntries.find((entry) => entry.step_type === 'gate' && entry.step_id === 'review' && entry.status === 'ok');
    assert(runInjectionEntry, 'missing run-scoped gate Nova injection audit entry');
    assert.equal(runInjectionEntry.gate_type, 'review');
    assert.equal(runInjectionEntry.session_key, sessionKey);

    const discordAuditPath = path.join(logDir, 'pipeline', 'discord.jsonl');
    const discordEntries = fs.readFileSync(discordAuditPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const injectionAlert = discordEntries.find((entry) => entry.title === 'Nova injection sent: review');
    assert(injectionAlert, 'missing gate Nova injection Discord audit alert');
    assert.equal(injectionAlert.gate_id, 'review');
    assert.equal(injectionAlert.gate_type, 'review');
    assert.equal(injectionAlert.fields.some((field) => field.name === 'Gate' && field.value === 'review'), true);
    assert.equal(injectionAlert.fields.some((field) => field.name === 'Gate Type' && field.value === 'review'), true);
  } finally {
    if (prevGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = prevGatewayUrl;
    await gateway.close();
  }
});

await record('Failure-service Discord alerts expose canonical escalation label correlation', async () => {
  const failurePresentation = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/failures/presentation.ts');
  const correlationService = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/correlation.ts');

  assert.equal(failurePresentation.includes('function buildFailureDiscordFields(identity = {}, extra = []) {'), true);
  assert.equal(failurePresentation.includes("from '../discord-fields.ts';"), true);
  assert.equal(failurePresentation.includes('DISCORD_FIELD_SPECS.GATE_ID'), true);
  assert.equal(failurePresentation.includes('DISCORD_FIELD_SPECS.GATE_TYPE'), true);
  assert.equal(failurePresentation.includes('DISCORD_FIELD_SPECS.DISPATCH_ID'), true);
  assert.equal(failurePresentation.includes('DISCORD_FIELD_SPECS.GATEWAY_LABEL'), true);
  assert.equal(failurePresentation.includes('function resolveFailureDispatchId(status, fallback = null) {'), false);
  assert.equal(failurePresentation.includes('function resolveFailureGatewayLabel(status, fallback = null) {'), false);
  assert.equal(failurePresentation.includes('function resolveResultDispatchId(result, fallback = null) {'), false);
  assert.equal(failurePresentation.includes('function resolveResultGatewayLabel(result, fallback = null) {'), false);
  assert.equal(failurePresentation.includes('function resolveResultGateType(result, fallback = null) {'), false);
  assert.equal(failurePresentation.includes('return resolveStatusDispatchId(status, fallback);'), false);
  assert.equal(failurePresentation.includes('return resolveStatusGatewayLabel(status, fallback);'), false);
  assert.equal(failurePresentation.includes('return resolveCanonicalResultDispatchId(result, fallback);'), false);
  assert.equal(failurePresentation.includes('return resolveCanonicalResultGatewayLabel(result, fallback);'), false);
  assert.equal(failurePresentation.includes('return resolveCanonicalResultGateType(result, fallback);'), false);
  assert.equal(correlationService.includes('export function resolveStatusCorrelation(status) {'), true);
  assert.equal(correlationService.includes('export function resolveStatusCorrelationWithDiagnosticFallback(status, fallback = {}) {'), true);
  assert.equal(correlationService.includes('export function resolveResultCorrelation(result) {'), true);
  assert.equal(correlationService.includes('export function resolveResultCorrelationWithDiagnosticFallback(result, fallback = {}) {'), true);
  assert.equal(correlationService.includes('export function resolveResultReadModelCorrelation(result) {'), true);
  assert.equal(correlationService.includes('export function resolveResultReadModelCorrelationWithDiagnosticFallback(result, fallback = {}) {'), true);
  assert.equal(correlationService.includes('export function resolveResultReadModelCorrelationProvenance(result) {'), true);
  assert.equal(correlationService.includes('export function resolveResultReadModelCorrelationProvenanceWithDiagnosticFallback(result, fallback = {}) {'), true);
  assert.equal(correlationService.includes('export function resolveResultCorrelationWithReadModelFallback(result, fallback = {}) {'), false);
  assert.equal(correlationService.includes('source_family: sourceFamilies.length === 0 ? null : (sourceFamilies.length === 1 ? sourceFamilies[0] : \'mixed\')'), true);
  assert.equal(correlationService.includes('provenance,'), true);
  assert.equal(correlationService.includes('export function resolveStatusDispatchId(status) {'), true);
  assert.equal(correlationService.includes('export function resolveResultDispatchId(result) {'), true);
  assert.equal(correlationService.includes('export function resolveResultGatewayLabel(result) {'), true);
  assert.equal(correlationService.includes('export function resolveResultGateType(result) {'), true);
  assert.equal(correlationService.includes('resolveStatusCorrelationWithDiagnosticFallback(status, { dispatch_id: fallback })'), false);
  assert.equal(correlationService.includes('resolveResultCorrelationWithDiagnosticFallback(result, { dispatch_id: fallback })'), false);
  assert.equal(failurePresentation.includes('dispatch_id: resolveStatusDispatchId(status, opts.dispatch_id),'), false);
  assert.equal(failurePresentation.includes('gateway_label: resolveStatusGatewayLabel(status, opts.gateway_label),'), false);
  assert.equal(failurePresentation.includes('const runId = config?._runId || config?.run_id || getRunId(config);'), true);
  assert.equal(failurePresentation.includes('const injectionCorrelation = resolveResultCorrelation(result);'), true);
  assert.equal(failurePresentation.includes('const injectionCorrelationProvenance = resolveResultReadModelCorrelationProvenance(result);'), true);
  assert.equal(failurePresentation.includes('const attempt = injectionCorrelation.attempt;'), true);
  assert.equal(failurePresentation.includes('const dispatchId = injectionCorrelation.dispatch_id;'), true);
  assert.equal(failurePresentation.includes('const gatewayLabel = injectionCorrelation.gateway_label;'), true);
  assert.equal(failurePresentation.includes('const childSessionKey = injectionCorrelation.session_key;'), true);
  assert.equal(failurePresentation.includes("const gateId = stepType === 'gate' ? result?.gate_id || targetId : null;"), true);
  assert.equal(failurePresentation.includes("const gateType = stepType === 'gate' ? injectionCorrelation.gate_type : null;"), true);
  assert.equal(failurePresentation.includes('attempt,'), true);
  assert.equal(failurePresentation.includes('dispatch_id: dispatchId,'), true);
  assert.equal(failurePresentation.includes('gateway_label: gatewayLabel,'), true);
  assert.equal(failurePresentation.includes('session_key: childSessionKey,'), true);
  assert.equal(failurePresentation.includes("gate_id: stepType === 'gate' ? gateId : undefined,"), true);
  assert.equal(failurePresentation.includes("gate_type: stepType === 'gate' ? gateType : undefined,"), true);
  assert.equal(failurePresentation.includes("gate_id: gateId, gate_type: gateType, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: childSessionKey"), true);
  assert.equal(failurePresentation.includes('if (runId) messageLines.push(`Run ID: ${runId}`);'), true);
  assert.equal(failurePresentation.includes("if (stepType === 'gate' && gateType) messageLines.push(`Gate Type: ${gateType}`);"), true);
  assert.equal(failurePresentation.includes("if (dispatchId) messageLines.push(`Dispatch: ${dispatchId}`);"), true);
  assert.equal(failurePresentation.includes("if (gatewayLabel && gatewayLabel !== dispatchId) messageLines.push(`Label: ${gatewayLabel}`);"), true);
  assert.equal(failurePresentation.includes("if (childSessionKey) messageLines.push(`Session: ${childSessionKey}`);"), true);
  assert.equal(failurePresentation.includes("} else if (attempt != null) {"), true);
  assert.equal(failurePresentation.includes("messageLines.push(`Attempt: ${attempt}`);"), true);
  assert.equal(failurePresentation.includes("} else if (result?.fail_count != null) {"), true);
  assert.equal(failurePresentation.includes("messageLines.push(`Attempt: ${result.fail_count}`);"), true);
});

await record('Blueprint Discord alerts expose canonical reporting correlation', async () => {
  const blueprintService = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/blueprint.ts');

  assert.equal(blueprintService.includes('function buildBlueprintDiscordFields(identity: AnyRecord = {}, extra: AnyRecord[] = []) {'), true);
  assert.equal(blueprintService.includes("...buildBlueprintDiscordFields({ run_id: getRunId(config) }),"), true);
});
}
