export async function registerFoundationsArea({
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
  registryMod,
  contextMod,
  coreRuntimeMod,
  pipelineRunnerMod,
  orchestrationMod,
  pipelineRedisMod,
  runtimeMod,
  gatewayMod,
  discordMod,
  lifecycleMod,
  lifecycleStateMod,
  statusStoreMod,
  rateLimitMod,
  monitorMod,
  redisLogMod,
  artifactBundleMod,
  correlationMod,
  pathsMod,
  busterPipelineMod,
}) {
await record('packaged helper runtime surface is owned by canonical common implementations', async () => {
  const helperPaths = [
    'pipeline/agents/runtime.js',
    'pipeline/integrations/gateway.js',
    'pipeline/agents/lifecycle.js',
    'pipeline/agents/acp-monitor.js',
    'pipeline/lifecycle-state.js',
  ];

  for (const relPath of helperPaths) {
    const commonText = readOverlayText(sourceRoot, overlayRoot, `skills/common/${relPath}`);
    const generalRuntimeText = fs.readFileSync(path.join(runtimeRoot, 'app', 'skills', relPath), 'utf8');
    const sandboxRuntimeText = fs.readFileSync(path.join(sandboxRuntimeRoot, 'app', 'skills', relPath), 'utf8');

    assert.equal(generalRuntimeText, commonText, `general image should materialize common ${relPath}`);
    assert.equal(sandboxRuntimeText, commonText, `sandbox image should materialize common ${relPath}`);
    assert.equal(fs.existsSync(path.join(sourceRoot, 'skills/nova', relPath)), false, `Nova should not keep a same-name repo facade for ${relPath}`);
    assert.equal(fs.existsSync(path.join(sourceRoot, 'skills/buster', relPath)), false, `Buster should not keep a same-name repo facade for ${relPath}`);
  }
});

await record('shared lifecycle helper stays backend-oriented while Buster owns its crash-recovery state path', async () => {
  const commonLifecycleText = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/agents/lifecycle.js');
  const busterPipelineHelpersText = fs.readFileSync(path.join(sourceRoot, 'skills/buster/buster-pipeline-helpers.js'), 'utf8');

  assert.equal(commonLifecycleText.includes(".swarm', 'logs', 'buster', 'active-session.json"), false);
  assert.equal(commonLifecycleText.includes('.swarm/logs/buster/active-session.json'), false);
  assert(busterPipelineHelpersText.includes(".swarm', 'logs', 'buster', 'active-session.json"), 'Buster helper surface should own its active-session recovery path');
  assert(busterPipelineHelpersText.includes('resolveBusterActiveSessionPath'), 'Buster helper surface should resolve its recovery path explicitly');
});

await record('packaged pipeline entrypoints load cleanly', async () => {
  assert.equal(typeof pipelineEntryMod.default, 'function');
  assert.equal(typeof pipelineIndexMod.runPipeline, 'function');
  assert.equal(typeof pipelineIndexMod.emitCostUpdate, 'function');
  assert.equal(typeof pipelineRunnerMod.acquirePipelineRunLock, 'function');
  assert.equal(typeof pipelineRunnerMod.releasePipelineRunLock, 'function');
  assert.equal(typeof lifecycleStateMod.transitionModuleStatus, 'function');
  assert.equal(typeof lifecycleStateMod.finalizeTerminalModuleState, 'function');
  assert.equal(typeof lifecycleStateMod.markModuleBlocked, 'function');
  assert.equal(typeof lifecycleStateMod.setModuleActiveAgent, 'function');
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gatewayInvoke'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'resolveGatewayBaseUrl'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'resolveGatewayInvokeUrl'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'resolveGatewayHealthUrl'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'resolveGatewayToken'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'discord'), false);
  for (const key of ['modulePath', 'statusPath', 'swarmRoot', 'projectSrcPath', 'relPath', 'completionStreamKey', 'gateStatusPath', 'moduleLogDir', 'moduleTestLogDir', 'moduleLintLogDir', 'gateLogDir', 'gateTestLogDir', 'gateLintLogDir', 'validateSafePath', 'costLogDir', 'redisLogDir', 'archValidatorLogDir']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['buildForgePrompt', 'buildBusterModulePrompt', 'buildBusterGatePrompt', 'buildGateFixPrompt', 'buildReviewerPrompt']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['loadStatus', 'saveStatus', 'initStatus', 'writeCostReport', 'runArchValidator']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['FAIL_PATTERNS', 'extractAgentFailReason', 'extractPreTestFailReason', 'getFailedSuiteNames', 'handleFail', 'injectNeedsNova']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['modelToHarness', 'isSubagentModel', 'resolveRuntime', 'acpLabel', 'spawnAcpAgent', 'killAcpAgent', 'spawnAgent', 'killAgent', 'steerAgent', 'verifyAgentAlive', 'dispatchRedisTask', 'buildBusterPayload', 'spawnReviewerAgent', 'killReviewerAgent']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['RUN_ID', '_runStats', 'createRunId', 'createRunStats', 'setRunState', 'bindRunContext', 'resolveRunContext', 'getRunState', 'getRunId', 'getRunStats', 'output', 'loadProgress']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['getRepoRoot', 'gitExec', 'headHash', 'invalidateHeadHash', 'setRepoRoot']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['sleep', 'pollGeneric', 'pollForFile', 'pollStatus', 'pollForSessionEnd', 'pollDual', 'pollWithRateLimitRecovery', 'pollDualWithRateLimitRecovery']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'GATEWAY_URL'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'GATEWAY_TOKEN'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'DEFAULT_GATEWAY_BASE_URL'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'DEFAULT_GATEWAY_INVOKE_URL'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gatewayHeaders'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'invokeGatewayTool'), false);
});

await record('correlation helpers preserve field provenance while keeping canonical identity values stable', async () => {
  const statusCorrelation = correlationMod.resolveStatusCorrelation({
    gateway_label: 'forge-01-dispatch',
    active_agent: {
      dispatch_id: 'forge-01-dispatch',
      session_key: 'agent:main:acp:forge-01',
    },
  }, {
    dispatch_id: 'dispatch-fallback',
    gateway_label: 'label-fallback',
    session_key: 'session-fallback',
  });

  assert.equal(statusCorrelation.dispatch_id, 'forge-01-dispatch');
  assert.equal(statusCorrelation.gateway_label, 'forge-01-dispatch');
  assert.equal(statusCorrelation.session_key, 'agent:main:acp:forge-01');
  assert.equal(statusCorrelation.source_family, 'mixed');
  assert.deepEqual(statusCorrelation.source_families, ['status.active_agent', 'status']);
  assert.deepEqual(statusCorrelation.provenance.dispatch_id, {
    family: 'status.active_agent',
    path: 'status.active_agent.dispatch_id',
    via: 'dispatch_id',
  });
  assert.deepEqual(statusCorrelation.provenance.gateway_label, {
    family: 'status',
    path: 'status.gateway_label',
    via: 'gateway_label',
  });
  assert.deepEqual(statusCorrelation.provenance.session_key, {
    family: 'status.active_agent',
    path: 'status.active_agent.session_key',
    via: 'session_key',
  });

  const resultCorrelation = correlationMod.resolveResultCorrelation({
    rate_limit_status: {
      attempt: 4,
      dispatch_id: 'review-dispatch-04',
      gateway_label: 'review-dispatch-04',
    },
    module_status: {
      session_key: 'agent:main:acp:review-04',
      gate_type: 'review',
    },
  }, {
    attempt: 9,
    dispatch_id: 'dispatch-fallback',
    gateway_label: 'label-fallback',
    session_key: 'session-fallback',
    gate_type: 'fallback-gate',
  });

  assert.equal(resultCorrelation.attempt, 4);
  assert.equal(resultCorrelation.dispatch_id, 'review-dispatch-04');
  assert.equal(resultCorrelation.gateway_label, 'review-dispatch-04');
  assert.equal(resultCorrelation.session_key, 'agent:main:acp:review-04');
  assert.equal(resultCorrelation.gate_type, 'review');
  assert.equal(resultCorrelation.source_family, 'mixed');
  assert.deepEqual(resultCorrelation.source_families, ['rate_limit_status', 'module_status']);
  assert.deepEqual(resultCorrelation.provenance.attempt, {
    family: 'rate_limit_status',
    path: 'result.rate_limit_status.attempt',
    via: 'attempt',
  });
  assert.deepEqual(resultCorrelation.provenance.dispatch_id, {
    family: 'rate_limit_status',
    path: 'result.rate_limit_status.dispatch_id',
    via: 'dispatch_id',
  });
  assert.deepEqual(resultCorrelation.provenance.gateway_label, {
    family: 'rate_limit_status',
    path: 'result.rate_limit_status.gateway_label',
    via: 'gateway_label',
  });
  assert.deepEqual(resultCorrelation.provenance.session_key, {
    family: 'module_status',
    path: 'result.module_status.session_key',
    via: 'session_key',
  });
  assert.deepEqual(resultCorrelation.provenance.gate_type, {
    family: 'module_status',
    path: 'result.module_status.gate_type',
    via: 'gate_type',
  });

  const fallbackCorrelation = correlationMod.resolveStatusCorrelation({}, {
    dispatch_id: 'dispatch-fallback',
    gateway_label: 'label-fallback',
    session_key: 'session-fallback',
  });
  assert.equal(fallbackCorrelation.source_family, 'fallback');
  assert.deepEqual(fallbackCorrelation.source_families, ['fallback']);
  assert.deepEqual(fallbackCorrelation.provenance.dispatch_id, {
    family: 'fallback',
    path: 'fallback.dispatch_id',
    via: 'dispatch_id',
  });
  assert.deepEqual(fallbackCorrelation.provenance.gateway_label, {
    family: 'fallback',
    path: 'fallback.gateway_label',
    via: 'gateway_label',
  });
  assert.deepEqual(fallbackCorrelation.provenance.session_key, {
    family: 'fallback',
    path: 'fallback.session_key',
    via: 'session_key',
  });
});

await record('shared failure semantics keep monitor, stale-recovery, and broad failure classes reusable', async () => {
  const failureSemanticsMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/failure-semantics.js');
  const commonMonitorMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/acp-monitor.js');

  assert.equal(commonMonitorMod.ACP_MONITOR_REASONS.RATE_LIMITED, 'rate_limited');
  assert.equal(commonMonitorMod.isStoppedSessionState('closed'), true);
  assert.equal(commonMonitorMod.isStoppedSessionState('idle'), true);
  assert.equal(commonMonitorMod.isStoppedSessionState('done'), true);
  assert.equal(commonMonitorMod.parseSessionState({ status: 'done' }).state, 'done');
  assert.equal(commonMonitorMod.isStoppedSessionState('unreachable'), false);

  assert.equal(failureSemanticsMod.normalizeFailureClass('forge', 'error TS2304 cannot find name'), 'forge_error');
  assert.equal(failureSemanticsMod.normalizeFailureClass('pre_check', 'delivery lint failed on generated files'), 'validation_error');
  assert.equal(failureSemanticsMod.normalizeFailureClass('buster', 'suite api-smoke failed'), 'test_failure');
  assert.equal(failureSemanticsMod.normalizeFailureClass('buster', 'Gateway session_status failed: 503 Service Unavailable'), 'infra_error');
  assert.equal(failureSemanticsMod.normalizeFailureClass('forge', 'child session went stale', {
    monitorReason: commonMonitorMod.ACP_MONITOR_REASONS.UNKNOWN_STALE_TIMEOUT,
  }), 'timeout');

  const monitorFact = failureSemanticsMod.classifyMonitorFailureFact({
    reason: commonMonitorMod.ACP_MONITOR_REASONS.UNKNOWN_STALE_TIMEOUT,
    sessionState: 'unreachable',
    gatewayUnreachable: true,
    transcriptStalePolls: 10,
    unknownPolls: 10,
  }, {
    moduleId: '01',
    stageId: 'worker.execute',
  });
  assert.equal(monitorFact.layer, 'invocation');
  assert.equal(monitorFact.code, 'BACKEND_TIMEOUT');
  assert.equal(monitorFact.retryable, true);

  assert.equal(failureSemanticsMod.isDefinitivelyStoppedMonitorState({ sessionState: 'closed' }), true);
  assert.equal(failureSemanticsMod.isDefinitivelyStoppedMonitorState({ sessionState: 'running' }), false);
  assert.equal(
    failureSemanticsMod.describeStaleRecovery('forge', failureSemanticsMod.STALE_RECOVERY_ACTIONS.KILLED_ORPHAN, { sessionKey: 'agent:main:acp:forge-01' }),
    'Recovered stale forge state after killing orphaned child session: agent:main:acp:forge-01',
  );
});

await record('startup plugin registry assembles built-ins deterministically and rejects bad registry inputs', async () => {
  assert.equal(typeof registryMod.buildPluginRegistry, 'function');
  assert.equal(typeof registryMod.resolveStageOwner, 'function');
  assert.equal(typeof registryMod.resolveStageHandler, 'function');

  const { normalizedConfig, registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  assert.equal(normalizedConfig.enabled, true);
  assert.equal(registry.summary.discoveredModules >= 9, true);
  assert.equal(registry.stageOwners['worker.execute']['worker:module_forge'].manifest.moduleId, 'builtin.worker.module_forge');
  assert.equal(registry.stageOwners['worker.execute']['worker:module_buster'].manifest.moduleId, 'builtin.worker.module_buster');
  assert.equal(registry.stageOwners['gate.execute']['gate:review'].manifest.moduleId, 'builtin.gate.review');
  assert.equal(registry.stageOwners['validator.run']['validator:architecture'].manifest.moduleId, 'builtin.validator.architecture');
  assert.equal(typeof registryMod.resolveStageHandler({ _pluginRegistry: registry }, 'worker.execute', 'worker:module_forge', 'execute'), 'function');
  assert.equal(typeof registryMod.resolveStageHandler({ _pluginRegistry: registry }, 'worker.execute', 'worker:module_buster', 'execute'), 'function');
  assert.equal(typeof registryMod.resolveStageHandler({ _pluginRegistry: registry }, 'gate.execute', 'gate:approval', 'execute'), 'function');

  assert.throws(
    () => registryMod.buildPluginRegistry({ stageOwners: { 'gate:review': 'missing.module' } }),
    /REGISTRY_STAGE_OWNER_UNKNOWN/
  );
  assert.throws(
    () => registryMod.buildPluginRegistry({ restrictedCapabilityAllowlist: { 'builtin.gate.review': ['capability.does_not_exist'] } }),
    /CAPABILITY_UNKNOWN/
  );
  assert.throws(
    () => registryMod.buildPluginRegistry({}, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.invalid.contract',
          contractVersion: 'pipeline-plugin-v0',
          kind: 'gate',
          hookFamily: 'gate.execute',
          stageIds: ['gate:review'],
          capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
          configSchema: { type: 'object', additionalProperties: true },
          sourceType: 'builtin',
          trustTier: 'trusted',
        },
        implementation: {
          execute: async () => null,
        },
      }],
    }),
    /REGISTRY_CONTRACT_VERSION_UNSUPPORTED/
  );
});

await record('plugin context scaffold exposes mediated context, shared correlation, and artifact lane surfaces', async () => {
  assert.equal(typeof contextMod.createPluginContext, 'function');
  assert.equal(typeof coreRuntimeMod.createEffectReceipt, 'function');
  assert.equal(typeof artifactBundleMod.createPluginArtifactsApi, 'function');
  assert.equal(typeof correlationMod.buildInvocationSnapshot, 'function');
  assert.equal(typeof correlationMod.resolveStatusCorrelation, 'function');
  assert.equal(typeof correlationMod.resolveResultCorrelation, 'function');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-plugin-context-'));
  const logDir = path.join(repoRoot, '.swarm', 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);

  const config = {
    project: 'behavior-demo',
    repo_root: repoRoot,
    _logDir: logDir,
    _runId: 'run-plugin-context',
    _pluginRegistry: registry,
    feature_flags: {
      plugin_context: {
        readonly_config: false,
      },
    },
    retry_limits: [1, 2],
    _testOverrides: {
      registryProbe: async () => 'live',
    },
  };

  const progress = {
    modules: {
      '01': { dir: '01-scaffold', stages: ['forge', 'buster'] },
    },
  };

  const approvalStreamCalls = [];
  const approvalCtx = contextMod.createPluginContext({
    config,
    progress,
    hookFamily: 'gate.execute',
    stageId: 'gate:approval',
    invocation: {
      gateId: 'approval',
      attempt: 2,
      dispatchId: 'dispatch-approval-2',
      sessionKey: 'agent:main:acp:gate-approval',
      gatewayLabel: 'approval-gate-attempt-2',
    },
    stateSnapshot: () => ({ gate_status: 'WAITING' }),
    effects: {
      stream: {
        emit: async ({ request }) => {
          approvalStreamCalls.push(request);
          return coreRuntimeMod.createEffectReceipt();
        },
      },
      waits: {
        create: async ({ request }) => ({
          ...coreRuntimeMod.createEffectReceipt(),
          waitRef: 'wait:approval-gate-2',
          waitKind: request.waitKind,
          deadlineAt: '2026-04-20T17:00:00.000Z',
        }),
      },
      signals: {
        issue: async ({ request }) => ({
          ...coreRuntimeMod.createEffectReceipt(),
          signalRef: 'signal:approval-gate-2',
          signalKind: request.signalKind,
        }),
      },
      notify: {
        operator: async () => coreRuntimeMod.createEffectReceipt(),
      },
    },
  });

  assert.equal(approvalCtx.schemaVersion, 'v1');
  assert.equal(approvalCtx.moduleId, 'builtin.gate.approval');
  assert.equal(Boolean(approvalCtx.read), true);
  assert.equal(Boolean(approvalCtx.stream), true);
  assert.equal(Boolean(approvalCtx.waits), true);
  assert.equal(Boolean(approvalCtx.signals), true);
  assert.equal(Boolean(approvalCtx.notify), true);
  assert.equal(Boolean(approvalCtx.workerBackend), false);
  assert.equal(Object.prototype.hasOwnProperty.call(approvalCtx, 'config'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(approvalCtx, 'registry'), false);

  const approvalInvocation = await approvalCtx.read.invocation();
  assert.equal(approvalInvocation.correlation.runId, 'run-plugin-context');
  assert.equal(approvalInvocation.correlation.primaryRef, 'gate:approval');
  assert.equal(approvalInvocation.correlation.dispatchId, 'dispatch-approval-2');
  assert.equal(approvalInvocation.refs.gate_ref, 'gate:approval');
  assert.equal(approvalInvocation.refs.session_ref, 'session:agent:main:acp:gate-approval');

  const approvalEnvironment = await approvalCtx.read.environment();
  assert.equal(approvalEnvironment.project, 'behavior-demo');
  assert.equal(approvalEnvironment.runtime, 'pipeline');
  assert.equal(approvalEnvironment.trustTier, 'trusted');
  assert.equal(approvalEnvironment.sourceType, 'builtin');

  const approvalConfig = await approvalCtx.read.config();
  assert.notStrictEqual(approvalConfig, config);
  assert.strictEqual(await approvalCtx.read.config(), approvalConfig);
  assert.equal(Object.isFrozen(approvalConfig), true);
  assert.equal(Object.isFrozen(approvalConfig.feature_flags), true);
  assert.equal(Object.isFrozen(approvalConfig.feature_flags.plugin_context), true);
  assert.equal(Object.isFrozen(approvalConfig.retry_limits), true);
  assert.equal(approvalConfig.feature_flags.plugin_context.readonly_config, false);
  assert.deepEqual(approvalConfig.retry_limits, [1, 2]);
  assert.equal(typeof approvalConfig._testOverrides?.registryProbe, 'undefined');
  assert.throws(() => {
    approvalConfig.project = 'mutated-project';
  }, /read only|not extensible|Cannot assign/i);
  assert.throws(() => {
    approvalConfig.feature_flags.plugin_context.readonly_config = true;
  }, /read only|not extensible|Cannot assign/i);
  assert.throws(() => {
    approvalConfig.retry_limits.push(3);
  }, /read only|not extensible|Cannot add property/i);
  assert.equal(config.project, 'behavior-demo');
  assert.equal(config.feature_flags.plugin_context.readonly_config, false);
  assert.deepEqual(config.retry_limits, [1, 2]);

  const approvalState = await approvalCtx.read.stateSnapshot();
  assert.deepEqual(approvalState, { gate_status: 'WAITING' });

  const streamReceipt = await approvalCtx.stream.emit({ streamType: 'log', message: 'approval requested' });
  assert.equal(streamReceipt.accepted, true);
  assert.equal(approvalStreamCalls.length, 1);
  assert.equal(approvalStreamCalls[0].message, 'approval requested');

  const waitReceipt = await approvalCtx.waits.create({ waitKind: 'approval', reason: 'manual approval', timeoutMs: 60000 });
  assert.equal(waitReceipt.waitRef, 'wait:approval-gate-2');
  assert.equal(waitReceipt.waitKind, 'approval');

  const signalReceipt = await approvalCtx.signals.issue({ signalKind: 'approval_request', waitRef: waitReceipt.waitRef });
  assert.equal(signalReceipt.signalRef, 'signal:approval-gate-2');
  assert.equal(signalReceipt.signalKind, 'approval_request');

  const generatorCtx = contextMod.createPluginContext({
    config,
    progress,
    hookFamily: 'generator.run',
    stageId: 'generator:project_summary',
    invocation: {
      moduleId: '01',
      attempt: 1,
      causationRef: 'event:summary-start',
    },
    stateSnapshot: async () => ({ modules_total: 1, modules_completed: 0 }),
    effects: {
      telemetry: {
        emit: async () => coreRuntimeMod.createEffectReceipt(),
      },
    },
  });

  assert.equal(generatorCtx.moduleId, 'builtin.generator.project_summary');
  assert.equal(Boolean(generatorCtx.artifacts), true);
  assert.equal(Boolean(generatorCtx.telemetry), true);
  assert.equal(Boolean(generatorCtx.waits), false);
  assert.equal(Boolean(generatorCtx.signals), false);
  assert.equal(Boolean(generatorCtx.notify), true);

  const generatorSnapshot = await generatorCtx.read.invocation();
  assert.equal(generatorSnapshot.refs.module_ref, 'module:01');
  assert.equal(generatorSnapshot.correlation.primaryRef, 'module:01');
  assert.equal(generatorSnapshot.correlation.causationRef, 'event:summary-start');

  const persistedArtifact = await generatorCtx.artifacts.persist({
    type: 'project_summary',
    role: 'output',
    label: 'summary',
    format: 'json',
    content: { ok: true },
  });
  assert.equal(persistedArtifact.accepted, true);
  assert.equal(persistedArtifact.artifact.type, 'project_summary');
  assert.equal(persistedArtifact.artifact.role, 'output');
  assert.equal(persistedArtifact.artifact.label, 'summary');

  const fetchedArtifact = await generatorCtx.artifacts.get(persistedArtifact.artifact.path);
  assert.deepEqual(fetchedArtifact, persistedArtifact.artifact);

  const foundArtifacts = await generatorCtx.artifacts.find({ type: 'project_summary', role: 'output', limit: 5 });
  assert.equal(foundArtifacts.length, 1);
  assert.deepEqual(foundArtifacts[0], persistedArtifact.artifact);

  const artifactBundle = artifactBundleMod.getPluginArtifactBundle(config, {
    hookFamily: 'generator.run',
    stageId: 'generator:project_summary',
    moduleId: generatorCtx.moduleId,
  });
  assert.equal(artifactBundle.run_id, 'run-plugin-context');
  assert.equal(fs.existsSync(artifactBundle.lane_index_path), true);

  const workerCtx = contextMod.createPluginContext({
    config,
    progress,
    hookFamily: 'worker.execute',
    stageId: 'worker:module_forge',
    invocation: {
      moduleId: '01',
      attempt: 1,
      dispatchId: 'dispatch-forge-01-attempt-1',
      sessionKey: 'agent:main:acp:forge-01',
      gatewayLabel: 'forge-01-attempt-1',
    },
    stateSnapshot: async () => ({ status: 'IN_PROGRESS', current_phase: 'forge' }),
    effects: {
      workerBackend: {
        dispatch: async ({ request }) => ({
          ...coreRuntimeMod.createEffectReceipt(),
          backendKind: 'session',
          accepted: true,
          request,
        }),
      },
      stream: {
        emit: async () => coreRuntimeMod.createEffectReceipt(),
      },
      telemetry: {
        emit: async () => coreRuntimeMod.createEffectReceipt(),
      },
    },
  });

  assert.equal(workerCtx.moduleId, 'builtin.worker.module_forge');
  assert.equal(Boolean(workerCtx.workerBackend), true);
  const workerSnapshot = await workerCtx.read.invocation();
  assert.equal(workerSnapshot.refs.dispatch_ref, 'dispatch:dispatch-forge-01-attempt-1');
  assert.equal(workerSnapshot.correlation.primaryRef, 'dispatch:dispatch-forge-01-attempt-1');
  const workerDispatch = await workerCtx.workerBackend.dispatch({ backendKind: 'session', action: 'spawn' });
  assert.equal(workerDispatch.backendKind, 'session');
  assert.equal(workerDispatch.request.action, 'spawn');
});

await record('invalid generator success payloads are rejected and surfaced as failed generator results', async () => {
  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);

  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'generator.run': {
        ...registry.stageOwners['generator.run'],
        'generator:project_summary': {
          ...registry.stageOwners['generator.run']['generator:project_summary'],
          implementation: {
            run: async () => ({
              schemaVersion: 'v1',
              producerKind: 'generator',
              producerType: 'project_summary',
              outputs: {},
            }),
          },
        },
      },
    },
  };

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-generator-invalid-contract-'));
  const logRoot = path.join(repoRoot, '.swarm', 'logs', 'runs', 'run-generator-invalid-contract-1');
  fs.mkdirSync(logRoot, { recursive: true });

  const config = {
    project: 'behavior-generator-invalid-contract',
    repo_root: repoRoot,
    paths: {
      swarm_dir: path.join(repoRoot, '.swarm'),
      modules_dir: path.join(repoRoot, 'modules'),
    },
    telemetry: { enabled: false },
    _pluginRegistry: testRegistry,
    _logDir: path.join(repoRoot, '.swarm', 'logs'),
    _runLogDir: logRoot,
    _runId: 'run-generator-invalid-contract-1',
    run_id: 'run-generator-invalid-contract-1',
    _runStats: coreRuntimeMod.createRunStats('2026-04-21T00:00:00.000Z'),
  };

  const progress = {
    execution_order: [],
    modules: {},
    gates: {},
  };

  const result = await pipelineRunnerMod.runScheduledGenerator(config, progress, 'generator:project_summary', {
    scheduleReason: 'pipeline_complete',
    mode: 'full',
    exitCode: 0,
    exitReason: 'PIPELINE_COMPLETE',
    orderIndex: 1,
    causationRef: 'event:pipeline_run.completed',
  });

  assert.equal(result.schemaVersion, 'v1');
  assert.equal(result.producerKind, 'generator');
  assert.equal(result.producerType, 'project_summary');
  assert.equal(result.outputs.status, 'failed');
  assert.equal(result.outputs.reason, "Generator 'generator:project_summary' returned invalid result: outputs.status must be a non-empty string");
  assert.equal(result.diagnostics.error, "Generator 'generator:project_summary' returned invalid result: outputs.status must be a non-empty string");
  assert.equal(result.diagnostics.contract_invalid, true);
});

await record('canonical lifecycle append boundary updates downstream read models while compatibility status files remain projections', async () => {
  assert.equal(typeof statusStoreMod.appendPipelineLifecycleEvent, 'function');
  assert.equal(typeof statusStoreMod.appendLifecycleEvent, 'function');
  assert.equal(typeof statusStoreMod.loadLifecycleReadModels, 'function');
  assert.equal(typeof statusStoreMod.getAuthoritativeModuleState, 'function');
  assert.equal(typeof statusStoreMod.readLifecycleEvents, 'function');
  assert.equal(typeof lifecycleStateMod.consumePendingLifecycleMutation, 'function');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-lifecycle-canonical-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'modules'));

  const config = {
    project: 'behavior-canonical-lifecycle',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _logDir: logDir,
    _runId: 'run-canonical-lifecycle',
  };
  config._runLogDir = path.join(logDir, 'pipeline', 'runs', config._runId);
  ensureDir(config._runLogDir);
  config._progress = {
    execution_order: ['01'],
    modules: {
      '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge', 'buster'] },
    },
    gates: {},
  };

  statusStoreMod.appendPipelineLifecycleEvent(config, 'pipeline_run.started', {
    progress: config._progress,
    opts: { resume: false },
  });

  const status = statusStoreMod.initStatus('01', { title: 'Scaffold' });
  lifecycleStateMod.startModulePhase(status, 'forge', 'Forge started', { now: '2026-04-20T17:10:00.000Z' });
  statusStoreMod.saveStatus(config, '01-scaffold', status);

  lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Forge complete',
    now: '2026-04-20T17:12:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status);

  lifecycleStateMod.transitionModuleStatus(status, 'TESTING', {
    note: 'Buster started',
    now: '2026-04-20T17:13:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status);

  status.active_agent = {
    attempt: 1,
    dispatch_id: 'dispatch-module-01-attempt-1',
    gateway_label: 'module-01-attempt-1',
    session_key: 'agent:main:acp:module-01',
    runtime: 'acp',
    model: 'forge-model',
  };

  lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
    note: 'Module passed',
    now: '2026-04-20T17:20:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status);

  statusStoreMod.appendPipelineLifecycleEvent(config, 'pipeline_run.completed', {
    progress: config._progress,
    result: { exit: 0, reason: 'PIPELINE_COMPLETE' },
  });

  const events = statusStoreMod.readLifecycleEvents(config);
  assert.deepEqual(
    events.map((entry) => entry.type),
    [
      'pipeline_run.started',
      'module_attempt.started',
      'module_attempt.ready_for_testing',
      'module_attempt.testing_started',
      'module_attempt.passed',
      'pipeline_run.completed',
    ],
  );

  const readModels = statusStoreMod.loadLifecycleReadModels(config);
  assert.equal(readModels.pipeline.status, 'COMPLETED');
  assert.equal(readModels.pipeline.run_id, 'run-canonical-lifecycle');
  assert.equal(readModels.progression.modules_total, 1);
  assert.equal(readModels.progression.modules_passed, 1);
  assert.equal(readModels.modules['01'].status, 'PASS');
  assert.equal(readModels.modules['01'].current_attempt, 1);
  assert.equal(readModels.modules['01'].module_attempt_ref, 'module_attempt:run-canonical-lifecycle:01:1');
  assert.equal(readModels.modules['01'].compatibility_status_path.endsWith(path.join('modules', '01-scaffold', 'status.json')), true);
  assert.equal(readModels.modules['01'].latest_event_type, 'module_attempt.passed');
  assert.equal(readModels.modules['01'].projection_source, 'canonical-events');

  const compatibilityOnlyStatus = statusStoreMod.loadStatus(config, '01-scaffold');
  compatibilityOnlyStatus.cost.total_duration_seconds = 90;
  statusStoreMod.saveStatus(config, '01-scaffold', compatibilityOnlyStatus);

  const readModelsAfterCompatibilitySave = statusStoreMod.loadLifecycleReadModels(config);
  assert.equal(readModelsAfterCompatibilitySave.modules['01'].status, 'PASS');
  assert.equal(readModelsAfterCompatibilitySave.modules['01'].projection_source, 'canonical-events');
  assert.equal(readModelsAfterCompatibilitySave.modules['01'].compatibility_projection_source, 'status.json');
  assert.equal(readModelsAfterCompatibilitySave.modules['01'].cost.total_duration_seconds, 90);

  const authoritativeState = statusStoreMod.getAuthoritativeModuleState(config, '01', {
    dir: '01-scaffold',
    status: compatibilityOnlyStatus,
  });
  assert.equal(authoritativeState.status, 'PASS');
  assert.equal(authoritativeState.projection_source, 'canonical-events');

  const persistedStatus = statusStoreMod.loadStatus(config, '01-scaffold');
  assert.equal(persistedStatus.status, 'PASS');

  const startedDuplicate = statusStoreMod.appendPipelineLifecycleEvent(config, 'pipeline_run.started', {
    progress: config._progress,
    opts: { resume: false },
  });
  assert.equal(startedDuplicate.deduped, true);
});

await record('authoritative module state only bootstraps from compatibility status during explicit migration opt-in', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-authoritative-module-state-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'modules'));
  ensureDir(path.join(repoRoot, 'modules', '01-scaffold'));

  const config = {
    project: 'behavior-authoritative-module-state',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _logDir: logDir,
    _runId: 'run-authoritative-module-state',
  };
  config._runLogDir = path.join(logDir, 'pipeline', 'runs', config._runId);
  ensureDir(config._runLogDir);
  config._progress = {
    execution_order: ['01'],
    modules: {
      '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge', 'buster'] },
    },
    gates: {},
  };

  statusStoreMod.appendPipelineLifecycleEvent(config, 'pipeline_run.started', {
    progress: config._progress,
    opts: { resume: false },
  });

  fs.writeFileSync(path.join(repoRoot, 'modules', '01-scaffold', 'status.json'), JSON.stringify({
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    fail_count: 0,
  }, null, 2));

  assert.equal(statusStoreMod.getLifecycleModuleState(config, '01'), null);

  const compatibilityOnly = statusStoreMod.loadStatus(config, '01-scaffold');
  assert.equal(statusStoreMod.getAuthoritativeModuleState(config, '01', {
    dir: '01-scaffold',
    status: compatibilityOnly,
  }), null);
  assert.equal(statusStoreMod.getLifecycleModuleState(config, '01'), null);

  assert.throws(() => {
    const staleStatus = statusStoreMod.loadStatus(config, '01-scaffold');
    lifecycleStateMod.transitionModuleStatus(staleStatus, 'TESTING', {
      note: 'Buster started without canonical bootstrap',
      now: '2026-04-22T17:39:00.000Z',
    });
    statusStoreMod.saveStatus(config, '01-scaffold', staleStatus);
  }, /has no open attempt for module_attempt\.testing_started/);

  config.compatibility = {
    legacy_module_status_bootstrap_mode: 'migration_only',
  };

  const bootstrapped = statusStoreMod.getAuthoritativeModuleState(config, '01', {
    dir: '01-scaffold',
    status: statusStoreMod.loadStatus(config, '01-scaffold'),
  });
  assert.equal(bootstrapped.status, 'READY_FOR_TESTING');
  assert.equal(bootstrapped.projection_source, 'status.json:migration');

  const status = statusStoreMod.loadStatus(config, '01-scaffold');
  lifecycleStateMod.transitionModuleStatus(status, 'TESTING', {
    note: 'Buster started',
    now: '2026-04-22T17:40:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status);

  fs.writeFileSync(path.join(repoRoot, 'modules', '01-scaffold', 'status.json'), JSON.stringify({
    module_id: '01',
    title: 'Scaffold',
    status: 'PENDING',
    fail_count: 0,
    note: 'stale compatibility write',
  }, null, 2));

  const canonical = statusStoreMod.getAuthoritativeModuleState(config, '01', {
    dir: '01-scaffold',
    status: statusStoreMod.loadStatus(config, '01-scaffold'),
  });
  assert.equal(canonical.status, 'TESTING');
  assert.equal(canonical.projection_source, 'canonical-events');
});

await record('shared approval wait substrate dedupes replay, collapses conflicting late signals, and lets scheduler skip consumed gates', async () => {
  assert.equal(typeof statusStoreMod.syncApprovalWaitState, 'function');
  assert.equal(typeof statusStoreMod.getLifecycleGateState, 'function');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-lifecycle-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'gates'));

  const config = {
    project: 'behavior-approval-lifecycle',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _logDir: logDir,
    _runId: 'run-approval-lifecycle',
  };
  config._runLogDir = path.join(logDir, 'pipeline', 'runs', config._runId);
  ensureDir(config._runLogDir);

  const gate = { type: 'approval', title: 'Release Approval' };
  const progress = {
    execution_order: ['gate:release-approval', '01'],
    modules: {
      '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge'] },
    },
    gates: {
      'release-approval': gate,
    },
  };

  const pendingState = {
    gate_id: 'release-approval',
    gate_type: 'approval',
    status: 'PENDING_APPROVAL',
    run_id: config._runId,
    project: config.project,
    requested_at: '2026-04-20T17:00:00.000Z',
    deadline: '2026-04-20T18:00:00.000Z',
    timeout_minutes: 60,
    timeout_policy: 'BLOCK',
    request_message_ref: 'discord:approval-request-1',
  };

  const pendingProjection = statusStoreMod.syncApprovalWaitState(config, 'release-approval', gate, pendingState);
  assert.equal(pendingProjection.status, 'PENDING_APPROVAL');
  assert.deepEqual(statusStoreMod.readLifecycleEvents(config).map((event) => event.type), ['wait.opened']);

  statusStoreMod.syncApprovalWaitState(config, 'release-approval', gate, pendingState);
  assert.deepEqual(statusStoreMod.readLifecycleEvents(config).map((event) => event.type), ['wait.opened']);

  const approvedState = {
    ...pendingProjection,
    status: 'APPROVED',
    resolved_at: '2026-04-20T17:10:00.000Z',
    decision_by: 'Raven',
    decision_via: 'openclaw',
    reason: 'Ship it',
    continued: false,
  };

  const approvedProjection = statusStoreMod.syncApprovalWaitState(config, 'release-approval', gate, approvedState);
  assert.equal(approvedProjection.status, 'APPROVED');

  const gateLifecycle = statusStoreMod.getLifecycleGateState(config, 'release-approval');
  assert.equal(gateLifecycle.status, 'APPROVED');
  assert.equal(gateLifecycle.scheduler_consumed, true);
  assert.equal(gateLifecycle.last_signal_kind, 'approve');

  assert.deepEqual(
    statusStoreMod.readLifecycleEvents(config).map((event) => event.type),
    ['wait.opened', 'resume_signal.received', 'wait.closed'],
  );

  const lateReject = statusStoreMod.syncApprovalWaitState(config, 'release-approval', gate, {
    ...approvedState,
    status: 'REJECTED',
    reason: 'Too late',
  });
  assert.equal(lateReject.status, 'APPROVED');
  assert.deepEqual(
    statusStoreMod.readLifecycleEvents(config).map((event) => event.type),
    ['wait.opened', 'resume_signal.received', 'wait.closed'],
  );

  const waitEntry = statusStoreMod.loadLifecycleReadModels(config).waits.by_ref[gateLifecycle.wait_ref];
  assert.equal(waitEntry.state, 'CLOSED');
  assert.equal(waitEntry.resume_signal_ref, gateLifecycle.last_signal_ref);

  const next = pipelineRunnerMod.findNextStep(config, progress);
  assert.deepEqual(next, { type: 'module', id: '01' });
});

await record('buster gate scheduler treats gate-status.json as diagnostic only when canonical output_file completion is missing', async () => {
  assert.equal(typeof statusStoreMod.readBusterGateCompletion, 'function');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-gate-fallback-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));

  const config = {
    project: 'behavior-buster-gate-fallback',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _logDir: logDir,
    _runId: 'run-buster-gate-fallback',
  };

  const progress = {
    execution_order: ['gate:gate:buster', '01'],
    modules: {
      '01': { title: 'After Gate', dir: '01-after-gate', stages: ['forge'] },
    },
    gates: {
      'gate:buster': {
        type: 'buster',
        title: 'Buster Gate',
        output_file: 'gates/gate-buster-output.json',
      },
    },
  };

  ensureDir(path.join(swarmDir, 'gates'));
  fs.writeFileSync(
    path.join(swarmDir, 'gates', 'gate-buster-output.json'),
    JSON.stringify({ status: 'FAIL', reason: 'stale failure' }, null, 2),
  );
  fs.writeFileSync(
    path.join(swarmDir, 'gate:buster-gate-status.json'),
    JSON.stringify({ status: 'PASS', source: 'gate-status-fallback' }, null, 2),
  );

  const reconciled = statusStoreMod.readBusterGateCompletion(config, 'gate:buster', progress.gates['gate:buster']);
  assert.equal(reconciled.isPass, false);
  assert.equal(reconciled.source, null);
  assert.equal(reconciled.output.data.status, 'FAIL');
  assert.equal(reconciled.gateStatus.data.status, 'PASS');

  const next = pipelineRunnerMod.findNextStep(config, progress);
  assert.deepEqual(next, { type: 'gate', id: 'gate:buster' });

  const projectedGate = statusStoreMod.loadLifecycleReadModels(config).gates['gate:buster'];
  assert.equal(projectedGate.status, 'PENDING');
  assert.equal(projectedGate.completion_source, null);
  assert.equal(projectedGate.projection_source, 'compat:pending');
  assert.equal(projectedGate.compatibility_output_status, 'FAIL');
  assert.equal(projectedGate.compatibility_gate_status, 'PASS');
});

await record('durable cooldown replay survives restart-sensitive module recovery before the next step reruns', async () => {
  assert.equal(typeof statusStoreMod.appendCooldownLifecycleEvent, 'function');
  assert.equal(typeof statusStoreMod.getLifecycleCooldown, 'function');
  assert.equal(typeof rateLimitMod.resumeDurableCooldownForStep, 'function');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-cooldown-replay-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'modules'));

  const config = {
    project: 'behavior-cooldown-replay',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _logDir: logDir,
    _runId: 'run-cooldown-replay',
  };
  config._runLogDir = path.join(logDir, 'pipeline', 'runs', config._runId);
  ensureDir(config._runLogDir);

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge', 'buster'] },
    },
    gates: {},
  };

  const status = statusStoreMod.initStatus('01', { title: 'Scaffold' });
  lifecycleStateMod.startModulePhase(status, 'forge', 'Forge started', { now: '2026-04-20T16:55:00.000Z' });
  statusStoreMod.saveStatus(config, '01-scaffold', status);
  lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Forge complete',
    now: '2026-04-20T16:58:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status);
  lifecycleStateMod.startModulePhase(status, 'buster', 'Buster started', { now: '2026-04-20T17:00:00.000Z' });
  lifecycleStateMod.transitionModuleStatus(status, 'RATE_LIMITED', {
    note: 'Paused for provider cooldown',
    phase: 'buster',
    now: '2026-04-20T17:01:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status);

  const resumeAt = new Date(Date.now() + 25).toISOString();
  statusStoreMod.appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_started', {
    moduleId: '01',
    attempt: 1,
    pauseCount: 1,
    maxPauses: 2,
    cooldownHours: 0,
    resumeAt,
    detail: 'provider requested cooldown',
    agentType: 'buster',
    dispatchId: 'dispatch-module-01-attempt-1',
    gatewayLabel: 'module-01-attempt-1',
    sessionKey: 'agent:main:acp:module-01',
  });

  const sleepCalls = [];
  const replay = await rateLimitMod.resumeDurableCooldownForStep(config, progress, { type: 'module', id: '01' }, {
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    },
  });

  assert.equal(replay.resumed, true);
  assert.equal(sleepCalls.length, 1);
  assert.equal(sleepCalls[0] > 0, true);

  const cooldown = statusStoreMod.getLifecycleCooldown(config, { stepType: 'module', stepId: '01' });
  assert.equal(cooldown.open, false);
  assert.equal(cooldown.pause_count, 1);

  const resumedStatus = statusStoreMod.loadStatus(config, '01-scaffold');
  assert.equal(resumedStatus.status, 'TESTING');
  assert.equal(resumedStatus.current_phase, 'buster');

  assert.deepEqual(
    statusStoreMod.readLifecycleEvents(config).map((event) => event.type),
    [
      'module_attempt.started',
      'module_attempt.ready_for_testing',
      'module_attempt.testing_started',
      'rate_limit.cooldown_started',
      'rate_limit.cooldown_completed',
    ],
  );
});

await record('durable cooldown replay also clears persisted gate cooldowns before the next gate reruns', async () => {
  assert.equal(typeof statusStoreMod.appendCooldownLifecycleEvent, 'function');
  assert.equal(typeof statusStoreMod.getLifecycleCooldown, 'function');
  assert.equal(typeof rateLimitMod.resumeDurableCooldownForStep, 'function');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-cooldown-replay-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'gates'));

  const config = {
    project: 'behavior-gate-cooldown-replay',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _logDir: logDir,
    _runId: 'run-gate-cooldown-replay',
  };
  config._runLogDir = path.join(logDir, 'pipeline', 'runs', config._runId);
  ensureDir(config._runLogDir);

  const progress = {
    execution_order: [],
    modules: {},
    gates: {
      'gate:review': {
        type: 'review',
        title: 'Review Gate',
        output_file: 'review-output.json',
      },
    },
  };

  const resumeAt = new Date(Date.now() + 25).toISOString();
  statusStoreMod.appendCooldownLifecycleEvent(config, 'rate_limit.cooldown_started', {
    gateId: 'gate:review',
    gateType: 'review',
    attempt: 1,
    pauseCount: 1,
    maxPauses: 2,
    cooldownHours: 0,
    resumeAt,
    detail: 'reviewer provider cooldown',
    agentType: 'echo-quality',
    gatewayLabel: 'gate-review-attempt-1',
    sessionKey: 'agent:main:acp:gate-review',
  });

  const sleepCalls = [];
  const replay = await rateLimitMod.resumeDurableCooldownForStep(config, progress, { type: 'gate', id: 'gate:review' }, {
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    },
  });

  assert.equal(replay.resumed, true);
  assert.equal(sleepCalls.length, 1);
  assert.equal(sleepCalls[0] > 0, true);

  const cooldown = statusStoreMod.getLifecycleCooldown(config, { stepType: 'gate', stepId: 'gate:review' });
  assert.equal(cooldown.open, false);
  assert.equal(cooldown.pause_count, 1);
  assert.equal(cooldown.gate_id, 'gate:review');
  assert.equal(cooldown.gate_type, 'review');

  assert.deepEqual(
    statusStoreMod.readLifecycleEvents(config).map((event) => event.type),
    ['rate_limit.cooldown_started', 'rate_limit.cooldown_completed'],
  );
});

await record('shared helper ownership stays direct/common and the public pipeline index stays narrow', async () => {
  const commonGatewayText = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/integrations/gateway.js');
  const novaOrchestrationText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/agents/orchestration.js');
  const novaModuleRunnerText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/module-runner.js');
  const novaPollingText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/polling.js');
  const busterPipelineText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.js');
  const busterPipelineHelpersText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline-helpers.js');
  const busterRateLimitText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/rate-limit.js');
  const acpMonitorText = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/agents/acp-monitor.js');
  assert.equal(commonGatewayText.includes('export function gatewayHeaders'), false);
  assert.equal(commonGatewayText.includes('export async function invokeGatewayTool'), false);
  for (const relPath of [
    'skills/nova/pipeline/agents/runtime.js',
    'skills/nova/pipeline/agents/lifecycle.js',
    'skills/nova/pipeline/agents/acp-monitor.js',
    'skills/nova/pipeline/integrations/gateway.js',
    'skills/nova/pipeline/lifecycle-state.js',
    'skills/buster/pipeline/agents/runtime.js',
    'skills/buster/pipeline/agents/lifecycle.js',
    'skills/buster/pipeline/agents/acp-monitor.js',
    'skills/buster/pipeline/integrations/gateway.js',
    'skills/buster/pipeline/lifecycle-state.js',
  ]) {
    assert.equal(fs.existsSync(path.join(sourceRoot, relPath)), false, `${relPath} should not remain as a same-name repo facade`);
  }
  assert(novaOrchestrationText.includes("../../../common/pipeline/integrations/gateway.js"));
  assert(novaModuleRunnerText.includes("../../../common/pipeline/agents/runtime.js"));
  assert(novaModuleRunnerText.includes("../../../common/pipeline/agents/lifecycle.js"));
  assert(novaModuleRunnerText.includes("../../../common/pipeline/lifecycle-state.js"));
  assert(novaPollingText.includes("../../../common/pipeline/agents/acp-monitor.js"));
  assert(novaPollingText.includes("../../../common/pipeline/integrations/gateway.js"));
  assert(busterPipelineText.includes("../common/pipeline/agents/acp-monitor.js"));
  assert(busterPipelineText.includes("../common/pipeline/agents/lifecycle.js"));
  assert(busterPipelineText.includes("../common/pipeline/integrations/gateway.js"));
  assert(busterPipelineHelpersText.includes("../common/pipeline/lifecycle-state.js"));
  assert(busterRateLimitText.includes("../../../common/pipeline/agents/acp-monitor.js"));
  assert(acpMonitorText.includes("import { gatewayInvoke, resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.js';"));
  assert(acpMonitorText.includes("const lifecycleUrl = new URL('./lifecycle.js', import.meta.url);"));
  assert.equal(acpMonitorText.includes("new URL('./shutdown.js', import.meta.url)"), false);
  assert.equal(acpMonitorText.includes('invokeGatewayTool('), false);
  assert(acpMonitorText.includes("gatewayInvoke('session_status', { sessionKey }, 10000, {"));
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gatewayKillSync'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'acpxCleanupSync'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'acpxCleanup'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'reaperAfterKill'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'reaperAfterKillSync'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'trackAgent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'untrackAgent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'setShutdownContext'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'clearShutdownContext'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'getTrackedAgent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'getTrackedAgentCount'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'spawnSession'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'killSession'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'parseSessionState'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'readAcpTranscriptState'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'getAcpMonitorState'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'isSessionTerminal'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'waitForSessionIdle'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'classifyTranscriptText'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'getAcpMonitorConfig'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'publishTranscriptDelta'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'transcriptShowsProgress'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'logRedisExchange'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'logRedisSent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'logRedisReceived'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'closeRedisLog'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'captureSessionSnapshot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'writeUsageArtifact'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'checkBudgetThresholds'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'accumulateTokens'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'appendStructuredEvent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'recordUsageSnapshot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'aggregateUsage'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'isBudgetExceeded'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'emitBudgetWarnings'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'writePipelineReviewInstructions'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'pipelineReviewOutputPath'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'pipelineReviewJsonPath'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'pipelineReviewInstructionsPath'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'pipelineReviewDispatchMode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'pipelineReviewAgentId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'caseStudyOutputPath'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'caseStudyInstructionsPath'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'caseStudyDispatchMode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'caseStudyAgentId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'writeSummary'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'savePrompt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'saveStreamLog'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'archiveGateOutputIfPresent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gateArchiveDir'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'initLogDir'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'readGateOutput'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gateOutputExists'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'readGateStatusJson'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'makePromptResult'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'buildGitSyncSection'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'buildAvailableToolsSection'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'buildTestWorkspaceSection'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'buildBusterCompletionProtocol'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'buildBusterGateCompletionProtocol'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'buildMarkdownSummary'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'isBlocking'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'buildValidatorPrompt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'SEVERITY'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'SCOPE'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'FINDING_CODES'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'buildNovaEscalation'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'resolveAutoRetryThreshold'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'pollResult'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'archiveModuleCompletions'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'readCompletionFromRedis'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'generateLintReport'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'formatLintReportForReviewer'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'runPreCheck'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'checkDependencies'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'createPipelineContext'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'createTempManager'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'createLogger'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'setActiveContext'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'clearActiveContext'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'initContextLogging'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'releaseGateFiles'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'syncControlFiles'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'readBusterInstructions'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'readForgeInstructions'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'readGateInstructions'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'findNextStep'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'printStatus'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'dryRun'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gitPullForPolling'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gitPullBeforePush'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gitPushWithRetry'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gitCommitAndPush'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'gitSyncBeforeBuster'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'withRateLimitRecovery'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'handleRateLimit'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'listBlueprints'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'releaseBlueprint'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'generateProjectSummary'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'generatePipelineReview'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'generateCaseStudy'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'runModule'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'runGate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'GATE_RUNNERS'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'runBusterGate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'runReviewGate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'log'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'getActiveContext'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'validateConfig'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'validateBusterConfig'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'resolveModel'), false);
});

await record('deprecated telemetry no-op helpers stay off the public pipeline index surface', async () => {
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'onRedisMessage'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'emitBusterResult'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'emitMemoryRecalled'), false);
});

await record('deprecated telemetry shim exports are removed from Nova telemetry runtime', async () => {
  const telemetryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/telemetry.js');
  assert.equal(Object.prototype.hasOwnProperty.call(telemetryMod, 'onRedisMessage'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(telemetryMod, 'emitBusterResult'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(telemetryMod, 'emitMemoryRecalled'), false);
});

await record('shared lifecycle-state helper enforces canonical history, phase, and active-agent semantics', async () => {
  const status = {
    module_id: '01',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    history: [],
    completed_at: '2026-04-09T19:55:00.000Z',
    completion_summary: 'Old buster result',
    active_agent: { session_key: 'agent:main:acp:1' },
  };

  lifecycleStateMod.startModulePhase(status, 'buster', 'Buster started', { now: '2026-04-09T20:00:00.000Z' });
  assert.equal(status.status, 'TESTING');
  assert.equal(status.current_phase, 'buster');
  assert.equal(status.phase_started_at, '2026-04-09T20:00:00.000Z');
  assert.equal(status.completed_at, null);
  assert.equal(status.completion_summary, null);
  assert.equal(status.history.at(-1).from, 'READY_FOR_TESTING');
  assert.equal(status.history.at(-1).to, 'TESTING');

  lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Recovered for retry',
    clearActiveAgent: true,
    now: '2026-04-09T20:05:00.000Z',
  });
  assert.equal(status.current_phase, null);
  assert.equal(status.phase_started_at, null);
  assert.equal(status.completed_at, null);
  assert.equal(status.completion_summary, null);
  assert.equal(status.active_agent, null);
  assert.equal(status.history.at(-1).from, 'TESTING');
  assert.equal(status.history.at(-1).to, 'READY_FOR_TESTING');

  lifecycleStateMod.markModuleBlocked(status, 'buster', 'Max retries exceeded', {
    reason: 'max_fails_reached',
    failCount: 3,
    now: '2026-04-09T20:06:00.000Z',
  });
  assert.equal(status.status, 'BLOCKED');
  assert.equal(status.current_phase, null);
  assert.equal(status.completed_at, null);
  assert.equal(status.blockedPhase, 'buster');
  assert.equal(status.blockedReason, 'max_fails_reached');
  assert.equal(status.blockedFailCount, 3);

  const forgeRetryStatus = {
    module_id: '02',
    status: 'FAIL',
    current_phase: null,
    history: [],
    completion_summary: 'Prior buster failure',
  };
  lifecycleStateMod.startModulePhase(forgeRetryStatus, 'forge', 'Forge retry', { now: '2026-04-09T20:09:00.000Z' });
  assert.equal(forgeRetryStatus.status, 'IN_PROGRESS');
  assert.equal(forgeRetryStatus.current_phase, 'forge');
  assert.equal(forgeRetryStatus.completion_summary, null);

  const passStatus = {
    module_id: '03',
    status: 'PASS',
    current_phase: 'buster',
    phase_started_at: '2026-04-09T20:10:00.000Z',
    completed_at: null,
  };
  lifecycleStateMod.finalizeTerminalModuleState(passStatus, {
    completedAt: '2026-04-09T20:11:00.000Z',
  });
  assert.equal(passStatus.current_phase, null);
  assert.equal(passStatus.phase_started_at, null);
  assert.equal(passStatus.completed_at, '2026-04-09T20:11:00.000Z');

  const trustedRedisFailStatus = {
    module_id: '04',
    status: 'TESTING',
    current_phase: 'buster',
    history: [],
    completion_summary: null,
  };
  lifecycleStateMod.transitionModuleStatus(trustedRedisFailStatus, 'FAIL', {
    note: 'Trusted terminal status from Redis completion (redis)',
    now: '2026-04-09T20:12:00.000Z',
    completionSummary: 'Redis failure summary',
  });
  assert.equal(trustedRedisFailStatus.status, 'FAIL');
  assert.equal(trustedRedisFailStatus.current_phase, null);
  assert.equal(trustedRedisFailStatus.completion_summary, 'Redis failure summary');
  assert.equal(trustedRedisFailStatus.history.at(-1).to, 'FAIL');

  const normalizedRetryStatus = lifecycleStateMod.normalizeLifecycleStatus({
    status: 'IN_PROGRESS',
    completed_at: '2026-04-09T20:12:00.000Z',
    completion_summary: 'stale summary',
  });
  assert.equal(normalizedRetryStatus.completed_at, null);
  assert.equal(normalizedRetryStatus.completion_summary, null);

  const normalizedFailStatus = lifecycleStateMod.normalizeLifecycleStatus({
    status: 'FAIL',
    completed_at: '2026-04-09T20:13:00.000Z',
    completion_summary: 'Fresh failure detail',
  });
  assert.equal(normalizedFailStatus.completed_at, null);
  assert.equal(normalizedFailStatus.completion_summary, 'Fresh failure detail');
});

await record('pipeline run lock rejects concurrent local runs and reclaims stale locks', async () => {
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-swarm-'));
  const config = {
    project: 'behavior-demo',
    repo_root: '/tmp/behavior-repo',
    _runId: 'run-123',
    paths: { swarm_dir: swarmDir },
  };

  const firstLock = pipelineRunnerMod.acquirePipelineRunLock(config, { module: '01' });
  const lockPath = path.join(swarmDir, 'logs', 'pipeline', 'active-run.lock.json');
  assert(fs.existsSync(lockPath));

  assert.throws(
    () => pipelineRunnerMod.acquirePipelineRunLock(config, { module: '02' }),
    /already active/,
  );

  pipelineRunnerMod.releasePipelineRunLock(firstLock);
  assert.equal(fs.existsSync(lockPath), false);

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: 999999,
    hostname: os.hostname(),
    project: config.project,
    run_id: 'stale-run',
  }, null, 2));

  const reclaimedLock = pipelineRunnerMod.acquirePipelineRunLock(config, { resume: true });
  assert(fs.existsSync(lockPath));
  const persisted = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(persisted.run_id, 'run-123');
  assert.equal(persisted.resume, true);
  pipelineRunnerMod.releasePipelineRunLock(reclaimedLock);
  assert.equal(fs.existsSync(lockPath), false);
});

await record('Buster monitor enforces hard wall-clock timeouts with explicit kill confirmation', async () => {
  const killCalls = [];
  const result = await busterPipelineMod.monitorSession(
    'agent:main:acp:timeout',
    null,
    {
      module_id: '01',
      dispatch_id: 'buster-module-01-attempt-1',
      session: {
        runtime: 'acp',
        model: 'anthropic/claude-sonnet-4-6',
        agentId: 'claude',
        label: 'buster-module-01-attempt-1',
      },
    },
    null,
    {
      moduleId: '01',
      spawnedAt: 1,
      timeoutSeconds: 1,
      killGraceMs: 1,
      logger: { info() {}, warn() {}, error() {}, step() {}, flush() {} },
      testHooks: {
        now: () => 5000,
        sleep: async () => {},
        killSession: async (sessionKey, opts) => {
          killCalls.push({ sessionKey, opts });
          return { requested: true, confirmed: true };
        },
        getAcpMonitorState: async () => ({
          sessionState: 'closed',
          sessionActive: false,
          terminal: true,
          transcript: { eventCount: 0, lastActivityPoll: 0 },
        }),
      },
    },
  );

  assert.equal(killCalls.length, 1);
  assert.equal(killCalls[0].sessionKey, 'agent:main:acp:timeout');
  assert.equal(killCalls[0].opts.label, 'buster-module-01-attempt-1');
  assert.equal(result.reason, 'session_timeout_kill_confirmed');
  assert.equal(result.killIssued, true);
  assert.equal(result.killConfirmed, true);
});

await record('Buster consumer reclaims pending tasks before reading new deliveries', async () => {
  const reclaimCalls = [];
  let xreadgroupCalls = 0;
  const reclaimed = await busterPipelineMod.readNextTaskEntry({
    call: async (...args) => {
      reclaimCalls.push(args);
      return ['0-0', [[
        '1712345678901-0',
        [
          'type', 'module_test',
          'sender', 'nova',
          'payload', JSON.stringify({ module_id: '01', dispatch_id: 'dispatch-reclaimed' }),
        ],
      ]], []];
    },
    xreadgroup: async () => {
      xreadgroupCalls += 1;
      return null;
    },
  });

  assert.equal(reclaimCalls.length, 1);
  assert.equal(reclaimCalls[0][0], 'XAUTOCLAIM');
  assert(/^[\w:-]+:tasks$/.test(reclaimCalls[0][1]));
  assert(/[\w-]+-group$/.test(reclaimCalls[0][2]));
  assert.equal(reclaimed.reclaimed, true);
  assert.equal(reclaimed.id, '1712345678901-0');
  assert.equal(reclaimed.data.type, 'module_test');
  assert.equal(xreadgroupCalls, 0);
});
}
