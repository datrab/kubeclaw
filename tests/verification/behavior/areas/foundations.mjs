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
  busterSessionMonitorMod,
  busterTaskQueueMod,
}) {
const pipelineSchedulingMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/pipeline-runner-scheduling.ts');
const pipelineLockMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/pipeline-runner-lock.ts');
const busterRuntimePolicyMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/runtime-policy.ts');

const anyPluginConfigSchema = () => ({
  schemaType: 'json_schema',
  schemaVersion: 'draft-07',
  schema: { type: 'object', additionalProperties: true },
  defaults: {},
});

function captureThrows(fn, matcher = null) {
  let captured = null;
  assert.throws(() => {
    try {
      fn();
    } catch (error) {
      captured = error;
      throw error;
    }
  }, matcher || undefined);
  return captured;
}

await record('temp manager owns lazy scratch lifecycle and idempotent cleanup', async () => {
  const tempMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/temp.ts');
  assert.equal(typeof tempMod.createTempManager, 'function');

  const manager = tempMod.createTempManager();
  assert.equal(manager.dir, null, 'temp manager should create lazily');

  const firstFile = manager.file('artifact', '01', '.json');
  assert.equal(typeof manager.dir, 'string');
  assert.equal(fs.existsSync(manager.dir), true, 'lazy file allocation should create owned dir');
  assert.equal(path.basename(manager.dir).startsWith('swarm-pipeline-'), true);
  assert.equal(path.dirname(firstFile), manager.dir, 'generated file should live inside owned dir');
  assert.equal(firstFile.endsWith('.json'), true);

  fs.writeFileSync(firstFile, '{"ok":true}\n');
  assert.equal(fs.existsSync(firstFile), true);
  manager.cleanup();
  assert.equal(fs.existsSync(manager.dir), false, 'cleanup should remove owned dir recursively');

  assert.doesNotThrow(() => manager.cleanup(), 'cleanup should be safe when owned dir is already missing');
});

await record('packaged helper runtime surface is owned by canonical common implementations', async () => {
  const helperPaths = [
    'pipeline/agents/acp-monitor.ts',
    'pipeline/agents/lifecycle.ts',
    'pipeline/agents/runtime.ts',
    'pipeline/agents/session-semantics.ts',
    'pipeline/agents/session-termination.ts',
    'pipeline/integrations/gateway.ts',
    'pipeline/lifecycle-state.ts',
    'pipeline/noncritical-reporting.ts',
    'pipeline/redaction.ts',
    'pipeline/security.ts',
    'pipeline/services/discord-fields-contract.ts',
    'pipeline/services/observability-health.ts',
    'pipeline/services/rate-limit-contract.ts',
    'pipeline/telemetry.ts',
    'pipeline/timing.ts',
  ];

  for (const relPath of helperPaths) {
    const commonText = readOverlayText(sourceRoot, overlayRoot, `skills/common/${relPath}`);
    const generalRuntimeText = fs.readFileSync(path.join(runtimeRoot, 'app', 'skills', relPath), 'utf8');
    const sandboxRuntimeText = fs.readFileSync(path.join(sandboxRuntimeRoot, 'app', 'skills', relPath), 'utf8');

    assert.equal(generalRuntimeText, commonText, `general image should materialize common ${relPath}`);
    assert.equal(sandboxRuntimeText, commonText, `sandbox image should materialize common ${relPath}`);
    for (const area of ['nova', 'buster']) {
      const shimText = readOverlayText(sourceRoot, overlayRoot, `skills/${area}/${relPath}`);
      assert(shimText.includes('export * from'), `${area} should keep a repo-local common facade for ${relPath}`);
      assert(shimText.includes('common/pipeline'), `${area} facade should point to the common owner for ${relPath}`);
    }
  }
});

await record('shared lifecycle helper stays backend-oriented while Buster owns its crash-recovery state path', async () => {
  const commonLifecycleText = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/agents/lifecycle.ts');
  const busterPipelineHelpersText = fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/services/pipeline-helpers.ts'), 'utf8');

  assert.equal(commonLifecycleText.includes(".swarm', 'logs', 'buster', 'active-session.json"), false);
  assert.equal(commonLifecycleText.includes('.swarm/logs/buster/active-session.json'), false);
  assert(busterPipelineHelpersText.includes(".swarm', 'logs', 'buster', 'active-session.json"), 'Buster helper surface should own its active-session recovery path');
  assert(busterPipelineHelpersText.includes('resolveBusterActiveSessionPath'), 'Buster helper surface should resolve its recovery path explicitly');
});

await record('packaged pipeline entrypoints load cleanly', async () => {
  assert.equal(typeof pipelineEntryMod.default, 'function');
  assert.equal(typeof pipelineIndexMod.runPipeline, 'function');
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, 'emitCostUpdate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineRunnerMod, 'acquirePipelineRunLock'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pipelineRunnerMod, 'releasePipelineRunLock'), false);
  assert.equal(typeof pipelineLockMod.acquirePipelineRunLock, 'function');
  assert.equal(typeof pipelineLockMod.releasePipelineRunLock, 'function');
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
  for (const key of ['modulePath', 'statusPath', 'swarmRoot', 'projectSrcPath', 'relPath', 'completionStreamKey', 'gateStatusPath', 'moduleLogDir', 'moduleLintLogDir', 'gateLogDir', 'gateLintLogDir', 'validateSafePath', 'costLogDir', 'redisLogDir', 'archValidatorLogDir']) {
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
  for (const key of ['modelToHarness', 'isSubagentModel', 'resolveRuntime', 'acpLabel', 'spawnAcpAgent', 'killAcpAgent', 'spawnAgent', 'killAgent', 'steerAgent', 'verifyAgentAlive', 'buildBusterPayload', 'spawnReviewerAgent', 'killReviewerAgent']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['createRunId', 'createRunStats', 'bindRunContext', 'resolveRunContext', 'getRunState', 'getRunId', 'getRunStats', 'output', 'loadProgress']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['getRepoRoot', 'gitExec', 'headHash', 'invalidateHeadHash', 'setRepoRoot']) {
    assert.equal(Object.prototype.hasOwnProperty.call(pipelineIndexMod, key), false);
  }
  for (const key of ['sleep', 'pollGeneric', 'pollForFile', 'pollStatus', 'pollForgeCompletion', 'pollForSessionEnd', 'pollDual', 'pollWithRateLimitRecovery', 'pollForgeCompletionWithRateLimitRecovery', 'pollDualWithRateLimitRecovery']) {
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
  });

  assert.equal(statusCorrelation.dispatch_id, null);
  assert.equal(statusCorrelation.gateway_label, 'forge-01-dispatch');
  assert.equal(statusCorrelation.session_key, null);
  assert.equal(statusCorrelation.source_family, 'status');
  assert.deepEqual(statusCorrelation.source_families, ['status']);
  assert.equal(statusCorrelation.provenance.dispatch_id, null);
  assert.deepEqual(statusCorrelation.provenance.gateway_label, {
    family: 'status',
    path: 'status.gateway_label',
    via: 'gateway_label',
  });
  assert.equal(statusCorrelation.provenance.session_key, null);

  const statusCorrelationProvenance = correlationMod.resolveStatusCorrelationProvenance({
    gateway_label: 'forge-01-dispatch',
    active_agent: {
      dispatch_id: 'forge-01-dispatch',
      session_key: 'agent:main:acp:forge-01',
    },
  });
  assert.equal(statusCorrelationProvenance.dispatch_id, 'forge-01-dispatch');
  assert.equal(statusCorrelationProvenance.session_key, 'agent:main:acp:forge-01');
  assert.deepEqual(statusCorrelationProvenance.source_families, ['status.active_agent', 'status']);

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
  });

  assert.equal(resultCorrelation.attempt, 4);
  assert.equal(resultCorrelation.dispatch_id, 'review-dispatch-04');
  assert.equal(resultCorrelation.gateway_label, 'review-dispatch-04');
  assert.equal(resultCorrelation.session_key, null);
  assert.equal(resultCorrelation.gate_type, null);
  assert.equal(resultCorrelation.source_family, 'rate_limit_status');
  assert.deepEqual(resultCorrelation.source_families, ['rate_limit_status']);
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
  assert.equal(resultCorrelation.provenance.session_key, null);
  assert.equal(resultCorrelation.provenance.gate_type, null);

  const readModelResultCorrelation = correlationMod.resolveResultReadModelCorrelationProvenance({
    rate_limit_status: {
      attempt: 4,
      dispatch_id: 'review-dispatch-04',
      gateway_label: 'review-dispatch-04',
    },
    module_status: {
      session_key: 'agent:main:acp:review-04',
      gate_type: 'review',
    },
  });
  assert.equal(readModelResultCorrelation.dispatch_id, null);
  assert.equal(readModelResultCorrelation.gateway_label, null);
  assert.equal(readModelResultCorrelation.session_key, 'agent:main:acp:review-04');
  assert.equal(readModelResultCorrelation.gate_type, 'review');
  assert.deepEqual(readModelResultCorrelation.source_families, ['module_status']);
  assert.deepEqual(readModelResultCorrelation.provenance.session_key, {
    family: 'module_status',
    path: 'result.module_status.session_key',
    via: 'session_key',
  });
  assert.deepEqual(readModelResultCorrelation.provenance.gate_type, {
    family: 'module_status',
    path: 'result.module_status.gate_type',
    via: 'gate_type',
  });

  const dispatchOnlyCorrelation = correlationMod.resolveStatusCorrelation({
    dispatch_id: 'dispatch-only',
    active_agent: { dispatch_id: 'active-dispatch-only' },
  });
  assert.equal(dispatchOnlyCorrelation.dispatch_id, 'dispatch-only');
  assert.equal(dispatchOnlyCorrelation.gateway_label, null);
  assert.equal(dispatchOnlyCorrelation.provenance.gateway_label, null);

  const dispatchOnlyResultCorrelation = correlationMod.resolveResultCorrelation({
    dispatch_id: 'result-dispatch-only',
    module_status: { dispatch_id: 'module-dispatch-only' },
  });
  assert.equal(dispatchOnlyResultCorrelation.dispatch_id, 'result-dispatch-only');
  assert.equal(dispatchOnlyResultCorrelation.gateway_label, null);
  assert.equal(dispatchOnlyResultCorrelation.provenance.gateway_label, null);

  const diagnosticLabelOnlyCorrelation = correlationMod.resolveStatusCorrelation({
    active_agent: { label: 'diagnostic-label-only' },
  });
  assert.equal(diagnosticLabelOnlyCorrelation.gateway_label, null);
  assert.equal(diagnosticLabelOnlyCorrelation.provenance.gateway_label, null);

  const readModelDiagnosticLabelOnlyCorrelation = correlationMod.resolveResultReadModelCorrelationProvenance({
    module_status: { active_agent: { label: 'diagnostic-label-only' } },
  });
  assert.equal(readModelDiagnosticLabelOnlyCorrelation.gateway_label, null);
  assert.equal(readModelDiagnosticLabelOnlyCorrelation.provenance.gateway_label, null);

  assert.equal(correlationMod.resolveStatusDispatchId({}, 'dispatch-fallback'), null);
  assert.equal(correlationMod.resolveStatusGatewayLabel({}, 'gateway-fallback'), null);
  assert.equal(correlationMod.resolveStatusSessionKey({}, 'session-fallback'), null);
  assert.equal(correlationMod.resolveResultDispatchId({}, 'dispatch-fallback'), null);
  assert.equal(correlationMod.resolveResultGatewayLabel({}, 'gateway-fallback'), null);
  assert.equal(correlationMod.resolveResultSessionKey({}, 'session-fallback'), null);
  assert.equal(correlationMod.resolveResultAttempt({}, 7), null);
  assert.equal(correlationMod.resolveResultGateType({}, 'review'), null);
});

await record('shared failure semantics keep monitor, stale-recovery, and broad failure classes reusable', async () => {
  const failureSemanticsMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/failure-semantics.ts');
  const commonMonitorMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/acp-monitor.ts');

  assert.equal(commonMonitorMod.ACP_MONITOR_REASONS.RATE_LIMITED, 'rate_limited');
  assert.equal(commonMonitorMod.isStoppedSessionState('closed'), true);
  assert.equal(commonMonitorMod.isStoppedSessionState('idle'), true);
  assert.equal(commonMonitorMod.isStoppedSessionState('done'), true);
  assert.equal(commonMonitorMod.parseSessionState({ status: 'done' }).state, 'done');
  assert.deepEqual(commonMonitorMod.parseSessionState({ statusText: '📌 Tasks: 1 active · subagent · verify' }), { active: true, state: 'running' });
  assert.deepEqual(commonMonitorMod.parseSessionState({ statusText: '📌 Tasks: latest succeeded · subagent · verify' }), { active: false, state: 'completed' });
  assert.deepEqual(commonMonitorMod.parseSessionState({ statusText: '📌 Tasks: 1 recent failure · subagent · verify' }), { active: false, state: 'error' });
  assert.deepEqual(commonMonitorMod.parseSessionState({ statusText: '🪢 Queue: steer (depth 0)' }), { active: false, state: 'idle' });
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

await record('Buster pre-test classification prefers explicit config evidence over broad infra regexes', async () => {
  const failuresMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/failures/classification.ts');

  const configOwned = failuresMod.classifyPreTestFailure({
    reason: 'Buster pre-test failed before child spawn',
    verdict: {
      suites: {
        smoke: {
          status: 'ERROR',
          error: 'podman build failed: Dockerfile /workspace/Dockerfile not found for test_config.serve.dockerfile',
        },
      },
    },
  });
  assert.equal(configOwned.kind, 'config');
  assert.equal(configOwned.code, 'PROGRESS_CONFIG_INVALID');

  const infraOwned = failuresMod.classifyPreTestFailure({
    reason: 'Buster pre-test failed before child spawn',
    verdict: {
      suites: {
        smoke: {
          status: 'ERROR',
          error: 'podman build failed: error: pinging container registry: connection refused',
        },
      },
    },
  });
  assert.equal(infraOwned.kind, 'infra');
  assert.equal(infraOwned.code, 'REGISTRY_ACCESS_FAILED');
});

await record('delivery lint Dockerfile paths are repo-realpath jailed and fail closed', async () => {
  const validationMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/validation.ts');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-delivery-lint-repo-'));
  const projectSrc = path.join(repoRoot, 'Projects/demo/src');
  fs.mkdirSync(projectSrc, { recursive: true });
  const config = {
    repo_root: repoRoot,
    paths: {
      swarm_dir: path.join(projectSrc, '.swarm'),
      modules_dir: path.join(projectSrc, '.swarm', 'modules'),
    },
  };

  assert.equal(
    validationMod.runDeliveryLintValidation({ test_config: { serve: {} } }, '01-static-library', config).passed,
    true,
    'modules without a declared serve.dockerfile should remain contextual pass-through',
  );

  const dockerfileRel = 'Projects/demo/src/Dockerfile';
  fs.writeFileSync(path.join(repoRoot, dockerfileRel), 'FROM scratch\nCOPY dist public\n');
  assert.equal(
    validationMod.runDeliveryLintValidation({ test_config: { serve: { dockerfile: dockerfileRel, static_path: 'public' } } }, '02-container', config).passed,
    true,
    'repo-relative Dockerfile with matching relative static path should pass',
  );

  const absoluteResult = validationMod.runDeliveryLintValidation({ test_config: { serve: { dockerfile: path.join(repoRoot, dockerfileRel) } } }, '03-absolute', config);
  assert.equal(absoluteResult.passed, false);
  assert.equal(absoluteResult.failures[0].code, validationMod.VALIDATION_CODES.SERVE_DOCKERFILE_PATH_INVALID);

  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-delivery-lint-outside-'));
  const outsideDockerfile = path.join(outsideRoot, 'Dockerfile');
  fs.writeFileSync(outsideDockerfile, 'FROM scratch\n');
  fs.symlinkSync(outsideDockerfile, path.join(projectSrc, 'linked-Dockerfile'));
  const symlinkResult = validationMod.runDeliveryLintValidation({ test_config: { serve: { dockerfile: 'Projects/demo/src/linked-Dockerfile' } } }, '04-symlink', config);
  assert.equal(symlinkResult.passed, false);
  assert.equal(symlinkResult.failures[0].code, validationMod.VALIDATION_CODES.SERVE_DOCKERFILE_PATH_INVALID);
  assert.match(symlinkResult.failures[0].explanation, /outside repository root/);

  fs.mkdirSync(path.join(projectSrc, 'Dockerfile-dir'));
  const unreadableResult = validationMod.runDeliveryLintValidation({ test_config: { serve: { dockerfile: 'Projects/demo/src/Dockerfile-dir' } } }, '05-unreadable', config);
  assert.equal(unreadableResult.passed, false);
  assert.equal(unreadableResult.failures[0].code, validationMod.VALIDATION_CODES.SERVE_DOCKERFILE_READ_FAILED);

  const staticPathResult = validationMod.runDeliveryLintValidation({ test_config: { serve: { dockerfile: dockerfileRel, static_path: '/public' } } }, '06-static-path', config);
  assert.equal(staticPathResult.passed, false);
  assert.equal(staticPathResult.failures[0].code, validationMod.VALIDATION_CODES.STATIC_PATH_INVALID);

  const outsideStatic = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-delivery-lint-static-outside-'));
  fs.writeFileSync(path.join(repoRoot, dockerfileRel), 'FROM scratch\nCOPY dist linked-public\n');
  fs.symlinkSync(outsideStatic, path.join(repoRoot, 'linked-public'));
  const staticSymlinkResult = validationMod.runDeliveryLintValidation({ test_config: { serve: { dockerfile: dockerfileRel, static_path: 'linked-public' } } }, '07-static-symlink', config);
  assert.equal(staticSymlinkResult.passed, false);
  assert.equal(staticSymlinkResult.failures[0].code, validationMod.VALIDATION_CODES.STATIC_PATH_INVALID);
  assert.match(staticSymlinkResult.failures[0].explanation, /outside repository root/);
});

await record('Forge preflight requires explicit readable FORGE.md artifacts', async () => {
  const validationMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/validation.ts');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-preflight-forge-repo-'));
  const modulesDir = path.join(repoRoot, '.swarm', 'modules');
  fs.mkdirSync(path.join(modulesDir, '01-missing'), { recursive: true });
  fs.mkdirSync(path.join(modulesDir, '02-substeps', 'alpha'), { recursive: true });
  const config = {
    repo_root: repoRoot,
    paths: {
      swarm_dir: path.join(repoRoot, '.swarm'),
      modules_dir: modulesDir,
    },
  };

  const missingResult = validationMod.runPreflightValidation({}, '01-missing', config);
  assert.equal(missingResult.passed, false);
  assert.equal(missingResult.failures[0].code, validationMod.VALIDATION_CODES.FORGE_BLUEPRINT_MISSING);

  fs.writeFileSync(path.join(modulesDir, '02-substeps', 'alpha', 'FORGE.md'), 'Create api.yaml\n');
  const missingSubstepResult = validationMod.runPreflightValidation({ substeps: ['alpha', 'beta'] }, '02-substeps', config);
  assert.equal(missingSubstepResult.passed, false);
  assert.equal(missingSubstepResult.failures[0].code, validationMod.VALIDATION_CODES.FORGE_BLUEPRINT_MISSING);

  fs.mkdirSync(path.join(modulesDir, '02-substeps', 'beta'), { recursive: true });
  fs.writeFileSync(path.join(modulesDir, '02-substeps', 'beta', 'FORGE.md'), 'Create Dockerfile\n');
  const declaredResult = validationMod.runPreflightValidation({
    substeps: ['alpha', 'beta'],
    test_config: {
      serve: { dockerfile: 'Dockerfile' },
      api: { spec_file: 'api.yaml' },
    },
  }, '02-substeps', config);
  assert.equal(declaredResult.passed, true);
});

await record('startup plugin registry assembles built-ins deterministically and rejects bad registry inputs', async () => {
  assert.equal(typeof registryMod.buildPluginRegistry, 'function');
  assert.equal(typeof registryMod.resolveStageOwner, 'function');
  assert.equal(registryMod.resolveStageHandler, undefined);
  assert.equal(registryMod.resolveGateTypeOwner, undefined);
  assert.equal(typeof registryMod.requireStageHandler, 'function');
  assert.equal(typeof registryMod.requireGateTypeOwner, 'function');

  const explicitPlugins = { enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} };
  const { normalizedConfig, registry, errors } = registryMod.buildPluginRegistry(explicitPlugins, { throwOnError: false });
  assert.equal(errors.length, 0);
  assert.equal(normalizedConfig.enabled, true);
  assert.equal(registry.summary.discoveredModules >= 9, true);
  assert.equal(registry.summary.gateTypeCount, 3);
  assert.equal(registry.stageOwners['worker.execute']['worker:module_forge'].manifest.moduleId, 'builtin.worker.module_forge');
  assert.equal(registry.stageOwners['worker.execute']['worker:module_buster'].manifest.moduleId, 'builtin.worker.module_buster');
  assert.equal(registry.stageOwners['gate.execute']['gate:review'].manifest.moduleId, 'builtin.gate.review');
  assert.equal(registry.gateTypes.review.stageId, 'gate:review');
  assert.equal(registry.gateTypes.review.moduleId, 'builtin.gate.review');
  assert.equal(registry.gateTypes.approval.stageId, 'gate:approval');
  assert.equal(registry.gateTypes.buster.stageId, 'gate:buster');
  assert.equal(registry.stageOwners['validator.run']['validator:architecture'].manifest.moduleId, 'builtin.validator.architecture');
  assert.equal(typeof registryMod.requireStageHandler({ pluginRegistry: registry }, 'worker.execute', 'worker:module_forge', 'execute').handler, 'function');
  assert.equal(typeof registryMod.requireStageHandler({ pluginRegistry: registry }, 'worker.execute', 'worker:module_buster', 'execute').handler, 'function');
  assert.equal(typeof registryMod.requireStageHandler({ pluginRegistry: registry }, 'gate.execute', 'gate:approval', 'execute').handler, 'function');
  assert.equal(registryMod.requireGateTypeOwner({ pluginRegistry: registry }, 'buster').stageId, 'gate:buster');

  assert.throws(
    () => registryMod.buildPluginRegistry(undefined),
    /config\.plugins is required/
  );
  assert.throws(
    () => registryMod.buildPluginRegistry({}),
    /config\.plugins\.enabled must be a boolean/
  );
  assert.throws(
    () => registryMod.buildPluginRegistry({ ...explicitPlugins, stageOwners: { 'gate:review': 'missing.module' } }),
    /REGISTRY_STAGE_OWNER_UNKNOWN/
  );
  assert.throws(
    () => registryMod.buildPluginRegistry({ ...explicitPlugins, restrictedCapabilityAllowlist: { 'builtin.gate.review': ['capability.does_not_exist'] } }),
    /CAPABILITY_UNKNOWN/
  );

  const builtinModules = registryMod.getBuiltinPluginDefinitions();
  const duplicateReviewGate = {
    ...builtinModules.find((definition) => definition.manifest.moduleId === 'builtin.gate.review'),
    manifest: {
      ...builtinModules.find((definition) => definition.manifest.moduleId === 'builtin.gate.review').manifest,
      moduleId: 'test.duplicate.review.gate',
    },
    implementation: { execute: async () => null },
  };
  assert.throws(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { builtinModules: [...builtinModules, duplicateReviewGate] }),
    /REGISTRY_GATE_TYPE_OWNER_CONFLICT/
  );

  assert.throws(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.mismatched.gate.type',
          contractVersion: 'pipeline-plugin-v1',
          kind: 'gate',
          hookFamily: 'gate.execute',
          gateTypes: ['review'],
          stageIds: ['gate:buster'],
          capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
          configSchema: anyPluginConfigSchema(),
          sourceType: 'builtin',
          trustTier: 'trusted',
          defaultEnabled: true,
        },
        implementation: { execute: async () => null },
      }],
    }),
    /REGISTRY_GATE_TYPE_INVALID/
  );
  assert.throws(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.invalid.contract',
          contractVersion: 'v1',
          kind: 'gate',
          hookFamily: 'gate.execute',
          gateTypes: ['review'],
          stageIds: ['gate:review'],
          capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
          configSchema: anyPluginConfigSchema(),
          sourceType: 'builtin',
          trustTier: 'trusted',
          defaultEnabled: true,
        },
        implementation: {
          execute: async () => null,
        },
      }],
    }),
    /REGISTRY_CONTRACT_VERSION_UNSUPPORTED/
  );

  const malformedArrayFieldError = captureThrows(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.malformed.array.fields',
          contractVersion: 'pipeline-plugin-v1',
          kind: 'gate',
          hookFamily: 'gate.execute',
          gateTypes: ['review'],
          capabilities: 'read.state',
          configSchema: anyPluginConfigSchema(),
          sourceType: 'builtin',
          trustTier: 'trusted',
          defaultEnabled: true,
        },
        implementation: { execute: async () => null },
      }],
    })
  );
  assert.equal(malformedArrayFieldError instanceof TypeError, false);
  assert.match(malformedArrayFieldError.message, /REGISTRY_STAGE_ID_INVALID/);
  assert.match(malformedArrayFieldError.message, /REGISTRY_CAPABILITY_DECLARATION_INVALID/);
  assert.match(malformedArrayFieldError.message, /Plugin registry validation failed/);

  const unknownKindError = captureThrows(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.unknown.kind',
          contractVersion: 'pipeline-plugin-v1',
          kind: 'bogus',
          hookFamily: 'gate.execute',
          stageIds: ['gate:review'],
          capabilities: ['read.state'],
          configSchema: anyPluginConfigSchema(),
          sourceType: 'builtin',
          trustTier: 'trusted',
          defaultEnabled: true,
        },
        implementation: { execute: async () => null },
      }],
    })
  );
  assert.equal(unknownKindError instanceof TypeError, false);
  assert.match(unknownKindError.message, /Plugin registry validation failed/);
  assert.match(unknownKindError.message, /REGISTRY_MANIFEST_INVALID/);

  assert.throws(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.invalid.config.schema',
          contractVersion: 'pipeline-plugin-v1',
          kind: 'gate',
          hookFamily: 'gate.execute',
          gateTypes: ['review'],
          stageIds: ['gate:review'],
          capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
          configSchema: { type: 'object', additionalProperties: true },
          sourceType: 'builtin',
          trustTier: 'trusted',
          defaultEnabled: true,
        },
        implementation: { execute: async () => null },
      }],
    }),
    /REGISTRY_CONFIG_SCHEMA_INVALID/
  );

  const invalidSchemaInspection = registryMod.buildPluginRegistry({
    ...explicitPlugins,
    modules: {
      'test.invalid.config.schema': { config: { leakedLegacyRawConfig: true } },
    },
  }, {
    builtinModules: [{
      manifest: {
        moduleId: 'test.invalid.config.schema',
        contractVersion: 'pipeline-plugin-v1',
        kind: 'gate',
        hookFamily: 'gate.execute',
        gateTypes: ['review'],
        stageIds: ['gate:review'],
        capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
        configSchema: { type: 'object', additionalProperties: true },
        sourceType: 'builtin',
        trustTier: 'trusted',
        defaultEnabled: true,
      },
      implementation: { execute: async () => null },
    }],
    throwOnError: false,
  });
  assert(invalidSchemaInspection.errors.some((error) => error.code === 'REGISTRY_CONFIG_SCHEMA_INVALID'));
  assert(invalidSchemaInspection.errors.some((error) => /cannot validate config because its configSchema is invalid/.test(error.message)));
  assert.deepEqual(invalidSchemaInspection.registry.records['test.invalid.config.schema'].config, {});

  const customDiscoveryConfig = registryMod.buildPluginRegistry({
    ...explicitPlugins,
    allowCustomModules: true,
    extraModulePaths: ['/app/custom/plugin.js'],
  }, { throwOnError: false });
  assert.equal(customDiscoveryConfig.normalizedConfig.extraModulePaths.length, 0);
  assert(customDiscoveryConfig.errors.some((error) => /extraModulePaths is unsupported/.test(error.message)));

  const restrictedNotifyGate = {
    manifest: {
      moduleId: 'test.restricted.notify.gate',
      contractVersion: 'pipeline-plugin-v1',
      kind: 'gate',
      hookFamily: 'gate.execute',
      gateTypes: ['review'],
      stageIds: ['gate:review'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'notify.operator'],
      configSchema: anyPluginConfigSchema(),
      sourceType: 'local',
      trustTier: 'restricted',
      defaultEnabled: true,
    },
    implementation: { execute: async () => null },
  };
  assert.throws(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { builtinModules: [restrictedNotifyGate] }),
    /CAPABILITY_RESTRICTED_NOT_ALLOWLISTED/
  );
  const allowlistedRestrictedGate = registryMod.buildPluginRegistry({
    ...explicitPlugins,
    restrictedCapabilityAllowlist: {
      'test.restricted.notify.gate': ['notify.operator'],
    },
  }, { builtinModules: [restrictedNotifyGate], throwOnError: false });
  assert.equal(allowlistedRestrictedGate.errors.length, 0);
  assert.equal(allowlistedRestrictedGate.registry.records['test.restricted.notify.gate'].resolvedTrustTier, 'restricted');
  const restrictedCtx = contextMod.createPluginContext({
    config: { project: 'behavior-restricted-no-core-runtime', pluginRegistry: allowlistedRestrictedGate.registry },
    hookFamily: 'gate.execute',
    stageId: 'gate:review',
    record: allowlistedRestrictedGate.registry.records['test.restricted.notify.gate'],
    invocation: { gateId: 'review' },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(restrictedCtx, 'coreRuntime'), false);

  assert.throws(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.gate.backend.forbidden',
          contractVersion: 'pipeline-plugin-v1',
          kind: 'gate',
          hookFamily: 'gate.execute',
          gateTypes: ['review'],
          stageIds: ['gate:review'],
          capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'dispatch.worker_runtime'],
          configSchema: anyPluginConfigSchema(),
          sourceType: 'builtin',
          trustTier: 'trusted',
          defaultEnabled: true,
        },
        implementation: { execute: async () => null },
      }],
    }),
    /CAPABILITY_FORBIDDEN_FOR_KIND/
  );

  assert.throws(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.restricted.worker.backend',
          contractVersion: 'pipeline-plugin-v1',
          kind: 'worker',
          hookFamily: 'worker.execute',
          stageIds: ['worker:module_forge'],
          capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'dispatch.worker_runtime'],
          configSchema: anyPluginConfigSchema(),
          sourceType: 'local',
          trustTier: 'restricted',
          defaultEnabled: true,
        },
        implementation: { execute: async () => null },
      }],
    }),
    /CAPABILITY_FORBIDDEN_FOR_TRUST_TIER/
  );

  assert.throws(
    () => registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
      builtinModules: [{
        manifest: {
          moduleId: 'test.local.self.trusted',
          contractVersion: 'pipeline-plugin-v1',
          kind: 'gate',
          hookFamily: 'gate.execute',
          gateTypes: ['review'],
          stageIds: ['gate:review'],
          capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
          configSchema: anyPluginConfigSchema(),
          sourceType: 'local',
          trustTier: 'trusted',
          defaultEnabled: true,
        },
        implementation: { execute: async () => null },
      }],
    }),
    /REGISTRY_TRUST_OVERRIDE_INVALID/
  );

  const locallyElevatedGate = registryMod.buildPluginRegistry({
    ...explicitPlugins,
    modules: {
      'test.restricted.notify.gate': { trustOverride: 'trusted' },
    },
  }, { builtinModules: [restrictedNotifyGate], throwOnError: false });
  assert.equal(locallyElevatedGate.errors.length, 0);
  assert.equal(locallyElevatedGate.registry.records['test.restricted.notify.gate'].resolvedTrustTier, 'trusted');

  const configurableGate = {
    manifest: {
      moduleId: 'test.configurable.gate',
      contractVersion: 'pipeline-plugin-v1',
      kind: 'gate',
      hookFamily: 'gate.execute',
      gateTypes: ['review'],
      stageIds: ['gate:review'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
      configSchema: {
        schemaType: 'json_schema',
        schemaVersion: 'draft-07',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['mode'],
          properties: {
            mode: { type: 'string', enum: ['safe', 'fast'] },
            retries: { type: 'integer' },
            enabled: { type: 'boolean' },
          },
        },
        defaults: { mode: 'safe', retries: 2 },
      },
      sourceType: 'builtin',
      trustTier: 'trusted',
      defaultEnabled: true,
    },
    implementation: { execute: async () => null },
  };

  const configuredRegistryResult = registryMod.buildPluginRegistry({
    ...explicitPlugins,
    modules: {
      'test.configurable.gate': { config: { retries: 4, enabled: true } },
    },
  }, { builtinModules: [configurableGate], throwOnError: false });
  assert.equal(configuredRegistryResult.errors.length, 0);
  assert.deepEqual(configuredRegistryResult.registry.records['test.configurable.gate'].config, {
    mode: 'safe',
    retries: 4,
    enabled: true,
  });

  const configuredCtx = contextMod.createPluginContext({
    config: { project: 'behavior-plugin-config-defaults', pluginRegistry: configuredRegistryResult.registry },
    hookFamily: 'gate.execute',
    stageId: 'gate:review',
    invocation: { gateId: 'review', attempt: 1 },
  });
  assert.deepEqual(await configuredCtx.read.moduleConfig(), {
    mode: 'safe',
    retries: 4,
    enabled: true,
  });
  assert.equal(Object.isFrozen(await configuredCtx.read.moduleConfig()), true);
  const mutablePluginInput = { ids: { stageId: 'gate:review' }, nested: { mutable: true } };
  const mutableWorkerExtra = { worker: { backendConfig: { model: 'test-model' } } };
  const configuredEnvelope = contextMod.buildPluginInvocationEnvelope(mutablePluginInput, configuredCtx, { workerInput: mutableWorkerExtra });
  assert.deepEqual(configuredEnvelope.input.plugin.config, {
    mode: 'safe',
    retries: 4,
    enabled: true,
  });
  assert.equal(configuredEnvelope.input.plugin.moduleId, 'test.configurable.gate');
  assert.equal(Object.prototype.hasOwnProperty.call(configuredEnvelope, 'pluginContext'), false);
  assert.equal(Object.isFrozen(configuredEnvelope), true);
  assert.equal(Object.isFrozen(configuredEnvelope.input), true);
  assert.equal(Object.isFrozen(configuredEnvelope.input.ids), true);
  assert.equal(Object.isFrozen(configuredEnvelope.workerInput), true);
  assert.equal(Object.isFrozen(configuredEnvelope.workerInput.worker.backendConfig), true);
  mutablePluginInput.ids.stageId = 'mutated-stage';
  mutableWorkerExtra.worker.backendConfig.model = 'mutated-model';
  assert.equal(configuredEnvelope.input.ids.stageId, 'gate:review');
  assert.equal(configuredEnvelope.workerInput.worker.backendConfig.model, 'test-model');
  assert.throws(() => {
    configuredEnvelope.input.ids.stageId = 'mutated-again';
  }, /read only|not extensible|Cannot assign/i);
  assert.throws(() => {
    configuredEnvelope.workerInput.worker.backendConfig.model = 'mutated-again';
  }, /read only|not extensible|Cannot assign/i);

  assert.throws(
    () => registryMod.buildPluginRegistry({
      ...explicitPlugins,
      modules: {
        'test.configurable.gate': { config: { mode: 'unsafe', extra: true } },
      },
    }, { builtinModules: [configurableGate] }),
    /REGISTRY_MODULE_CONFIG_INVALID/
  );
});

await record('config validation derives accepted gate types from the startup plugin registry', async () => {
  const configMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/config.ts');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-type-registry-config-'));
  const swarmDir = path.join(repoRoot, '.swarm');

  const buildConfig = (pluginConfig = {}) => ({
    project: 'behavior-gate-type-registry-config',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      progress_file: path.join(swarmDir, 'progress.json'),
      modules_dir: path.join(swarmDir, 'modules'),
    },
    agents: {
      forge: { dispatch: 'acp', acp_agent_id: 'codex' },
      buster: { dispatch: 'acp', acp_agent_id: 'buster' },
      echo: { dispatch: 'acp', acp_agent_id: 'codex' },
    },
    fallback_model: 'test-fallback-model',
    poll_interval_seconds: 30,
    default_timeout_minutes: 45,
    default_max_fails: 3,
    auto_retry_threshold: 2,
    session_nudge_threshold: 0.75,
    rate_limit: { cooldown_hours: 2, max_pauses_per_module: 5, cooldown_buffer_ms: 5000 },
    buster: {
      suite_timeout_ms: 300000,
      max_crash_retries: 2,
      runtime: {
        heartbeat_path: '/tmp/kubeclaw-buster-heartbeat',
        heartbeat_interval_ms: 1000,
        task_poll_interval_ms: 2000,
        task_pending_reclaim_idle_ms: 60000,
        task_stream_max_len: 250,
      },
    },
    discord_alerts: { info: true, warn: true, critical: true, ok: true },
    pre_check: { enabled: true, lint_report_path: '/app/skills/pipeline/tools/lint-report.ts', timeout_seconds: 60 },
    review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
    acp_monitor: {
      unknown_poll_limit: 10,
      stale_poll_limit: 10,
      max_transcript_extensions: 3,
      transcript_grace_ms: 300000,
      monitor_poll_ms: 10000,
    },
    plugins: {
      enabled: true,
      allowCustomModules: false,
      extraModulePaths: [],
      modules: {},
      stageOwners: {},
      restrictedCapabilityAllowlist: {},
      ...pluginConfig,
    },
  });

  const validProgress = {
    project: 'behavior-gate-type-registry-config',
    execution_order: ['gate:quality'],
    modules: {},
    gates: {
      quality: { type: 'buster', title: 'Quality Gate' },
    },
  };

  const defaultConfig = buildConfig();
  const defaultRegistry = configMod.validateConfig(defaultConfig, validProgress);
  assert.equal(defaultRegistry.gateTypes.buster.moduleId, 'builtin.gate.buster');

  const missingApprovalTimeoutProgress = {
    ...validProgress,
    execution_order: ['gate:approval'],
    gates: {
      approval: { type: 'approval', title: 'Approval Gate' },
    },
  };
  assert.throws(
    () => configMod.validateConfig(buildConfig(), missingApprovalTimeoutProgress),
    /progress\.gates\.approval\.on_timeout: required for approval gates/
  );

  const unknownTopLevelConfig = buildConfig();
  unknownTopLevelConfig.legacy_shadow_field = true;
  assert.throws(
    () => configMod.validateConfig(unknownTopLevelConfig, validProgress),
    /config\.legacy_shadow_field: unknown top-level config field/
  );
  const currentPlatformConfig = buildConfig();
  currentPlatformConfig._doc = 'operator note';
  currentPlatformConfig.agent_observability = {
    plugin_control: {
      enabled: true,
      pluginId: 'kubeclaw-agent-observer',
      command: 'openclaw',
      timeoutMs: 10000,
      disableOnStop: true,
    },
    ingester: {
      enabled: true,
      redisNetworkIsolation: 'isolated',
      loopDelayMs: 250,
      healthCheckEvery: 10,
      redisCommandTimeoutMs: 1000,
    },
  };
  currentPlatformConfig.agent_observability_forge_completion_settle_ms = 0;
  assert.doesNotThrow(
    () => configMod.validateConfig(currentPlatformConfig, validProgress),
    'current platform observability config keys should pass strict top-level validation',
  );
  for (const mirrorField of ['_logDir', '_runLogDir']) {
    const runtimeMirrorConfig = buildConfig();
    runtimeMirrorConfig[mirrorField] = '/tmp/logs';
    assert.throws(
      () => configMod.validateConfig(runtimeMirrorConfig, validProgress),
      new RegExp(`config\\.${mirrorField}: unknown top-level config field`)
    );
  }

  const stringNumericConfig = buildConfig();
  stringNumericConfig.default_timeout_minutes = '45';
  assert.throws(
    () => configMod.validateConfig(stringNumericConfig, validProgress),
    /config\.default_timeout_minutes: must be a number > 0/
  );

  const deprecatedModelsConfig = buildConfig();
  deprecatedModelsConfig.models = { forge: 'legacy-forge' };
  assert.throws(
    () => configMod.validateConfig(deprecatedModelsConfig, validProgress),
    /config\.models: role-specific model defaults belong in progress\.json defaults\.models/
  );

  const deprecatedReviewersConfig = buildConfig();
  deprecatedReviewersConfig.review_defaults.reviewers = [{ label: 'codex', agent_id: 'codex' }];
  assert.throws(
    () => configMod.validateConfig(deprecatedReviewersConfig, validProgress),
    /config\.review_defaults\.reviewers: reviewer\/model defaults belong in progress\.json gates\/defaults/
  );

  const missingMonitorConfig = buildConfig();
  delete missingMonitorConfig.acp_monitor;
  assert.throws(
    () => configMod.validateConfig(missingMonitorConfig, validProgress),
    /config\.acp_monitor: required platform config object/
  );

  const incompleteMonitorConfig = buildConfig();
  delete incompleteMonitorConfig.acp_monitor.monitor_poll_ms;
  assert.throws(
    () => configMod.validateConfig(incompleteMonitorConfig, validProgress),
    /config\.acp_monitor\.monitor_poll_ms: required in swarm\.config\.json/
  );

  const missingTimeoutConfig = buildConfig();
  delete missingTimeoutConfig.default_timeout_minutes;
  assert.throws(
    () => configMod.validateConfig(missingTimeoutConfig, validProgress),
    /config\.default_timeout_minutes: required in swarm\.config\.json/
  );

  const missingBusterAgentId = buildConfig();
  delete missingBusterAgentId.agents.buster.acp_agent_id;
  assert.throws(
    () => configMod.validateConfig(missingBusterAgentId, validProgress),
    /Buster acp_agent_id missing/
  );

  const removedTelemetryStreamKeyConfig = buildConfig();
  removedTelemetryStreamKeyConfig.telemetry = { enabled: true, stream_key: 'legacy-enable-flag' };
  assert.throws(
    () => configMod.validateConfig(removedTelemetryStreamKeyConfig, validProgress),
    /config\.telemetry stream_key: removed; use config\.telemetry\.enabled and canonical run-scoped stream names/
  );

  const runtimeTestOverrideConfig = buildConfig();
  runtimeTestOverrideConfig._testOverrides = { pipelineRunner: { marker: true } };
  assert.throws(
    () => configMod.validateConfig(runtimeTestOverrideConfig, validProgress),
    /config\._testOverrides: forbidden in runtime config/
  );

  assert.throws(
    () => configMod.validateConfig(buildConfig({ modules: { 'builtin.gate.buster': { enabled: false } } }), validProgress),
    /progress\.gates\.quality\.type: 'buster' not registered in the startup plugin registry/
  );
});

await record('plugin capability policy narrows context surfaces, effects, and inputs', async () => {
  const narrowNotification = {
    manifest: {
      moduleId: 'test.notification.narrow',
      contractVersion: 'pipeline-plugin-v1',
      kind: 'notification',
      hookFamily: 'module.completed',
      stageIds: ['module.completed'],
      capabilities: ['read.state', 'emit.stream', 'write.artifacts'],
      configSchema: anyPluginConfigSchema(),
      sourceType: 'builtin',
      trustTier: 'trusted',
      defaultEnabled: true,
      priority: 10,
    },
    implementation: { observe: async () => null },
  };
  const broadNotification = {
    manifest: {
      ...narrowNotification.manifest,
      moduleId: 'test.notification.broad',
      capabilities: ['read.state', 'emit.stream', 'read.artifacts', 'write.artifacts', 'notify.operator'],
      priority: 20,
    },
    implementation: { observe: async () => null },
  };

  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, {
    builtinModules: [narrowNotification, broadNotification],
    throwOnError: false,
  });
  assert.equal(errors.length, 0);

  const config = {
    project: 'behavior-plugin-capabilities',
    pluginRegistry: registry,
  };
  const narrowCtx = contextMod.createPluginContext({
    config,
    hookFamily: 'module.completed',
    stageId: 'module.completed',
    record: registry.records['test.notification.narrow'],
    invocation: { hookId: 'module.completed' },
    stateSnapshot: { status: 'PASS' },
  });
  assert.equal(Boolean(narrowCtx.stream), true);
  assert.equal(Boolean(narrowCtx.artifacts), true);
  assert.equal(Boolean(narrowCtx.telemetry), false);
  assert.equal(Boolean(narrowCtx.notify), false);
  assert.equal(Boolean(narrowCtx.waits), false);
  assert.equal(Boolean(narrowCtx.signals), false);
  assert.equal(Boolean(narrowCtx.workerRuntime), false);
  await assert.rejects(
    () => narrowCtx.artifacts.get({ type: 'module_summary' }),
    /artifacts\.get/
  );

  const rawInput = {
    ids: { stageId: 'module.completed' },
    artifacts: [{ type: 'artifact', path: '/tmp/artifact.json' }],
    summaries: [{ type: 'summary' }],
    priorResults: [{ status: 'PASS' }],
    presentation: { discord: { title: 'Done' } },
    event: { type: 'module.completed', payload: {} },
  };
  const narrowEnvelope = contextMod.buildPluginInvocationEnvelope(rawInput, narrowCtx);
  assert.equal(narrowEnvelope.input.artifacts, undefined);
  assert.equal(narrowEnvelope.input.summaries, undefined);
  assert.equal(narrowEnvelope.input.priorResults, undefined);
  assert.equal(narrowEnvelope.input.presentation, undefined);

  const broadCtx = contextMod.createPluginContext({
    config,
    hookFamily: 'module.completed',
    stageId: 'module.completed',
    record: registry.records['test.notification.broad'],
    invocation: { hookId: 'module.completed' },
    stateSnapshot: { status: 'PASS' },
  });
  assert.equal(Boolean(broadCtx.notify), true);
  assert.equal(Boolean(broadCtx.artifacts), true);
  const broadEnvelope = contextMod.buildPluginInvocationEnvelope(rawInput, broadCtx);
  assert.deepEqual(broadEnvelope.input.artifacts, rawInput.artifacts);
  assert.deepEqual(broadEnvelope.input.presentation, rawInput.presentation);
});

await record('worker plugin boundary rejects legacy compatibility fallback', async () => {
  const workerControlMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/contracts/worker-control-result.ts');
  const legacyWorkerResult = {
    ok: true,
    legacy_metadata: { ok: true },
    status: { status: 'PASS' },
  };

  assert.throws(
    () => orchestrationMod.coerceModuleForgeWorkerControlResult(
      { project: 'behavior-worker-no-compat-fallback' },
      { ids: { stageId: 'worker:module_forge', moduleId: '01' } },
      legacyWorkerResult,
      { stageId: 'worker:module_forge' },
    ),
    /compatibility-shaped backend results are not accepted at the worker boundary/,
  );
  assert.throws(
    () => workerControlMod.normalizeTypedWorkerControlResult(legacyWorkerResult, {
      producerType: 'module_forge',
      label: 'Module Forge',
      stageId: 'worker:module_forge',
      coerce: (result) => orchestrationMod.coerceModuleForgeWorkerControlResult(
        { project: 'behavior-worker-no-compat-fallback' },
        { ids: { stageId: 'worker:module_forge', moduleId: '01' } },
        result,
        { stageId: 'worker:module_forge' },
      ),
    }),
    /compatibility-shaped backend results are not accepted at the worker boundary/,
  );

  assert.throws(
    () => orchestrationMod.coerceModuleForgeWorkerControlResult(
      { project: 'behavior-worker-no-compat-fallback' },
      { ids: { stageId: 'worker:module_forge', moduleId: '01' } },
      legacyWorkerResult,
      { stageId: 'worker:module_forge', allowCompatibilityCoercion: true },
    ),
    /compatibility-shaped backend results are not accepted at the worker boundary/,
    'stale allowCompatibilityCoercion must not restore worker compatibility fallback',
  );
});

await record('git runtime-state path classifier preserves .swarm and accepts Git-relative paths', async () => {
  const gitWorktreeMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/integrations/git-worktree.ts');
  assert.equal(typeof gitWorktreeMod.isRuntimeStatePath, 'function');

  for (const relPathName of [
    '.swarm/logs/pipeline.jsonl',
    '/.swarm/logs/pipeline.jsonl',
    'Projects/demo/src/.swarm/logs/pipeline.jsonl',
    '.swarm/review-gate-status.json',
    '/.swarm/review-gate-status.json',
    'Projects/demo/src/.swarm/review-gate-status.json',
    '.swarm/logs/pipeline/summary.md',
    '/.swarm/logs/pipeline/summary.json',
    'Projects/demo/src/.swarm/logs/pipeline/runs/run-1/project-summary.json',
    '.swarm/project-summary',
  ]) {
    assert.equal(gitWorktreeMod.isRuntimeStatePath(relPathName), true, `${relPathName} should be runtime state`);
  }

  for (const relPathName of [
    'src/app.js',
    '.swarmish/logs/pipeline.jsonl',
    '.swarm/modules/01/output.json',
    '.swarm/modules/01/status.json.bak',
    'Projects/demo/src/.swarm/modules/01/source.js',
  ]) {
    assert.equal(gitWorktreeMod.isRuntimeStatePath(relPathName), false, `${relPathName} should not be runtime state`);
  }
});

await record('pipeline context owns explicit runtime state without config log-dir mirrors', async () => {
  assert.equal(typeof contextMod.PipelineContext, 'function');
  assert.equal(typeof contextMod.createPipelineContext, 'function');
  assert.equal(typeof contextMod.isPipelineContext, 'function');

  const config = {
    project: 'behavior-pipeline-context',
    repo_root: '/tmp/behavior-pipeline-context',
  };
  const progress = { execution_order: [], modules: {}, gates: {} };
  const stats = coreRuntimeMod.createRunStats('2026-05-02T00:00:00.000Z');
  const ctx = contextMod.createPipelineContext({
    config,
    progress,
    runId: 'run-context-1',
    stats,
    novaChannel: '1497330547742081268',
    pluginRegistry: { summary: { enabledModules: 1 } },
    runtimeOverrides: { model: 'openai/test-model' },
  });

  assert.equal(contextMod.isPipelineContext(ctx), true);
  assert.equal(ctx.schemaVersion, 'pipeline-context-v1');
  assert.strictEqual(ctx.config, config);
  assert.strictEqual(ctx.progress, progress);
  assert.strictEqual(ctx.stats, stats);
  assert.equal(ctx.runId, 'run-context-1');
  assert.equal(config._runId, 'run-context-1');
  assert.equal(config.run_id, 'run-context-1');
  assert.strictEqual(config._runStats, stats);
  assert.deepEqual(ctx.runtimeOverrides, { model: 'openai/test-model' });
  assert.equal(Object.prototype.hasOwnProperty.call(config, '_runtimeOverrides'), false);
  assert.equal(Boolean(ctx.pluginRegistry), true);

  ctx.setLogDirs({ logDir: '/tmp/behavior-pipeline-context/logs', runLogDir: '/tmp/behavior-pipeline-context/logs/pipeline/runs/run-context-1' });
  assert.equal(ctx.logDir, '/tmp/behavior-pipeline-context/logs');
  assert.equal(ctx.runLogDir, '/tmp/behavior-pipeline-context/logs/pipeline/runs/run-context-1');
  assert.equal(Object.prototype.hasOwnProperty.call(config, '_logDir') || Object.prototype.hasOwnProperty.call(config, '_runLogDir'), false);

  const pipelineLogFd = { path: '/tmp/behavior-pipeline-context/logs/pipeline/pipeline.jsonl' };
  const runPipelineLogFd = { path: '/tmp/behavior-pipeline-context/logs/pipeline/runs/run-context-1/pipeline.jsonl' };
  ctx.setPipelineLogStreams({ pipelineLogFd, runPipelineLogFd });
  assert.strictEqual(ctx._pipelineLogFd, pipelineLogFd);
  assert.strictEqual(ctx._runPipelineLogFd, runPipelineLogFd);
  assert.equal(ctx._pipelineLogPath, pipelineLogFd.path);
  assert.equal(ctx._runPipelineLogPath, runPipelineLogFd.path);
  ctx.setTempDir('/tmp/behavior-pipeline-context/tmp');
  assert.equal(ctx._tmpDir, '/tmp/behavior-pipeline-context/tmp');

  const snapshot = ctx.runtimeStateSnapshot();
  assert.equal(snapshot.schemaVersion, 'pipeline-context-v1');
  assert.equal(snapshot.runId, 'run-context-1');
  assert.equal(snapshot.novaChannel, '1497330547742081268');
  assert.equal(snapshot.logDir, ctx.logDir);
  assert.equal(snapshot.runLogDir, ctx.runLogDir);
  assert.equal(snapshot.hasPluginRegistry, true);
  assert.equal(snapshot.hasRuntimeOverrides, true);
  assert.notStrictEqual(snapshot.stats, stats);
  assert.throws(() => { snapshot.runId = 'mutated'; }, /read only|Cannot assign|not extensible/i);
});

await record('plugin context scaffold exposes mediated context, shared correlation, and artifact lane surfaces', async () => {
  assert.equal(typeof contextMod.createPluginContext, 'function');
  assert.equal(typeof coreRuntimeMod.createEffectReceipt, 'function');
  assert.equal(typeof artifactBundleMod.createPluginArtifactsApi, 'function');
  assert.equal(typeof correlationMod.buildInvocationSnapshot, 'function');
  assert.equal(typeof correlationMod.resolveStatusCorrelation, 'function');
  assert.equal(correlationMod.resolveStatusCorrelationWithDiagnosticFallback, undefined);
  assert.equal(typeof correlationMod.resolveResultCorrelation, 'function');
  assert.equal(correlationMod.resolveResultCorrelationWithDiagnosticFallback, undefined);
  assert.equal(typeof correlationMod.resolveResultReadModelCorrelation, 'function');
  assert.equal(correlationMod.resolveResultReadModelCorrelationWithDiagnosticFallback, undefined);
  assert.equal(typeof correlationMod.resolveResultReadModelCorrelationProvenance, 'function');
  assert.equal(correlationMod.resolveResultReadModelCorrelationProvenanceWithDiagnosticFallback, undefined);
  assert.equal(correlationMod.resolveResultCorrelationWithReadModelFallback, undefined);

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-plugin-context-'));
  const logDir = path.join(repoRoot, '.swarm', 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);

  const config = {
    project: 'behavior-demo',
    repo_root: repoRoot,
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: 'run-plugin-context',
    pluginRegistry: registry,
    feature_flags: {
      plugin_context: {
        readonly_config: false,
      },
    },
    retry_limits: [1, 2],
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
  assert.equal(Boolean(approvalCtx.workerRuntime), false);
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

  assert.equal(typeof approvalCtx.read.config, 'undefined');
  assert.equal(typeof approvalCtx.read.progress, 'undefined');
  assert.equal(Object.prototype.propertyIsEnumerable.call(approvalCtx, 'coreRuntime'), false);
  assert.equal(typeof approvalCtx.coreRuntime?.readConfig, 'function');
  assert.equal(typeof approvalCtx.coreRuntime?.readProgress, 'function');
  assert.strictEqual(approvalCtx.coreRuntime.readConfig(), config);
  assert.strictEqual(approvalCtx.coreRuntime.readProgress(), progress);
  const approvalModuleConfig = await approvalCtx.read.moduleConfig();
  assert.deepEqual(approvalModuleConfig, {});
  assert.strictEqual(await approvalCtx.read.moduleConfig(), approvalModuleConfig);
  assert.equal(Object.isFrozen(approvalModuleConfig), true);
  assert.throws(() => {
    approvalModuleConfig.enabled = false;
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
      workerRuntime: {
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
  assert.equal(Boolean(workerCtx.workerRuntime), true);
  const workerSnapshot = await workerCtx.read.invocation();
  assert.equal(workerSnapshot.refs.dispatch_ref, 'dispatch:dispatch-forge-01-attempt-1');
  assert.equal(workerSnapshot.correlation.primaryRef, 'dispatch:dispatch-forge-01-attempt-1');
  const workerDispatch = await workerCtx.workerRuntime.dispatch({ backendKind: 'session', action: 'spawn' });
  assert.equal(workerDispatch.backendKind, 'session');
  assert.equal(workerDispatch.request.action, 'spawn');
});

await record('invalid generator success payloads are rejected and surfaced as failed generator results', async () => {
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
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

  const config = {
    project: 'behavior-generator-invalid-contract',
    repo_root: repoRoot,
    paths: {
      swarm_dir: path.join(repoRoot, '.swarm'),
      modules_dir: path.join(repoRoot, 'modules'),
    },
    telemetry: { enabled: false },
    pluginRegistry: testRegistry,
    _runId: 'run-generator-invalid-contract-1',
    run_id: 'run-generator-invalid-contract-1',
    _runStats: coreRuntimeMod.createRunStats('2026-04-21T00:00:00.000Z'),
  };

  const progress = {
    execution_order: [],
    modules: {},
    gates: {},
  };

  const result = await pipelineSchedulingMod.runScheduledGenerator(config, progress, 'generator:project_summary', {
    scheduleReason: 'pipeline_complete',
    mode: 'full',
    terminalStatus: 'succeeded',
    reasonCode: 'PIPELINE_COMPLETE',
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
  assert.equal(result.diagnostics.contract_diagnostic.diagnosticType, 'plugin_contract_invalid');
  assert.equal(result.diagnostics.contract_diagnostic.stageId, 'generator:project_summary');
  assert.deepEqual(result.diagnostics.contract_diagnostic.validationErrors, ['outputs.status must be a non-empty string']);
  assert.equal(result.diagnostics.contract_diagnostic.rawResultPreview, undefined);
  assert.equal(result.diagnostics.contract_diagnostic.coercedResultPreview, undefined);
  assert.equal(result.diagnostics.contract_diagnostic.rawResultSummary.redacted, true);
  assert.equal(result.diagnostics.contract_diagnostic.coercedResultSummary.redacted, true);
});

await record('canonical lifecycle append boundary updates downstream read models while compatibility status files remain projections', async () => {
  assert.equal(typeof statusStoreMod.appendPipelineLifecycleEvent, 'function');
  assert.equal(typeof statusStoreMod.appendLifecycleEvent, 'function');
  assert.equal(typeof statusStoreMod.loadLifecycleReadModels, 'function');
  assert.equal(typeof statusStoreMod.getAuthoritativeModuleState, 'function');
  assert.equal(typeof statusStoreMod.readLifecycleEvents, 'function');
  assert.equal(typeof lifecycleStateMod.consumePendingLifecycleMutation, 'undefined');

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
    _runId: 'run-canonical-lifecycle',
  };
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
  let lifecycleTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Forge started', { now: '2026-04-20T17:10:00.000Z' });
  statusStoreMod.saveStatus(config, '01-scaffold', status, lifecycleTransition);

  lifecycleTransition = lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Forge complete',
    now: '2026-04-20T17:12:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status, lifecycleTransition);

  lifecycleTransition = lifecycleStateMod.transitionModuleStatus(status, 'TESTING', {
    note: 'Buster started',
    now: '2026-04-20T17:13:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status, lifecycleTransition);

  status.active_agent = {
    attempt: 1,
    dispatch_id: 'dispatch-module-01-attempt-1',
    gateway_label: 'module-01-attempt-1',
    session_key: 'agent:main:acp:module-01',
    runtime: 'acp',
    model: 'forge-model',
  };

  lifecycleTransition = lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
    note: 'Module passed',
    now: '2026-04-20T17:20:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status, lifecycleTransition);

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
  assert.equal(readModels.modules['01'].latest_event_type, 'module_attempt.passed');
  assert.equal(readModels.modules['01'].projection_source, 'canonical-events');

  const compatibilityOnlyStatus = statusStoreMod.loadStatus(config, '01-scaffold');
  compatibilityOnlyStatus.cost = { total_duration_seconds: 90 };
  statusStoreMod.saveStatus(config, '01-scaffold', compatibilityOnlyStatus);

  const readModelsAfterCompatibilitySave = statusStoreMod.loadLifecycleReadModels(config);
  assert.equal(readModelsAfterCompatibilitySave.modules['01'].status, 'PASS');
  assert.equal(readModelsAfterCompatibilitySave.modules['01'].projection_source, 'canonical-events');
  assert.equal(readModelsAfterCompatibilitySave.modules['01'].cost?.total_duration_seconds, 90, 'runtime snapshot cost edits should synchronize into lifecycle read-model detail without changing terminal status authority');

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

await record('authoritative module state does not bootstrap without lifecycle module state', async () => {
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
    _runId: 'run-authoritative-module-state',
  };
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

  const legacyOnly = statusStoreMod.loadStatus(config, '01-scaffold');
  assert.equal(legacyOnly, null, 'loadStatus must not invent module state without lifecycle authority');
  assert.equal(statusStoreMod.getAuthoritativeModuleState(config, '01', {
    dir: '01-scaffold',
    status: legacyOnly,
  }), null);
  const legacyOnlyProjection = statusStoreMod.projectModuleSchedulerState(config, '01', config._progress.modules['01']);
  assert.equal(legacyOnlyProjection.status, 'PENDING');

  assert.equal(statusStoreMod.getAuthoritativeModuleState(config, '01', {
    dir: '01-scaffold',
    status: statusStoreMod.loadStatus(config, '01-scaffold'),
  }), null);

  const canonicalStatus = statusStoreMod.initStatus('01', { title: 'Scaffold' });
  let canonicalTransition = lifecycleStateMod.startModulePhase(canonicalStatus, 'forge', 'Forge started canonically', { now: '2026-04-22T17:40:00.000Z' });
  statusStoreMod.saveStatus(config, '01-scaffold', canonicalStatus, canonicalTransition);
  canonicalTransition = lifecycleStateMod.transitionModuleStatus(canonicalStatus, 'READY_FOR_TESTING', {
    note: 'Forge complete canonically',
    now: '2026-04-22T17:41:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', canonicalStatus, canonicalTransition);
  canonicalTransition = lifecycleStateMod.transitionModuleStatus(canonicalStatus, 'TESTING', {
    note: 'Buster started canonically',
    now: '2026-04-22T17:42:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', canonicalStatus, canonicalTransition);

  const canonical = statusStoreMod.getAuthoritativeModuleState(config, '01', {
    dir: '01-scaffold',
    status: statusStoreMod.loadStatus(config, '01-scaffold'),
  });
  assert.equal(canonical.status, 'TESTING');
  assert.equal(canonical.projection_source, 'canonical-events');
});

await record('saveStatus rejects guarded lifecycle field changes without lifecycle transition intent', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-status-save-guard-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'modules'));
  ensureDir(path.join(repoRoot, 'modules', '01-scaffold'));

  const config = {
    project: 'behavior-status-save-guard',
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _runId: 'run-status-save-guard',
  };

  const status = statusStoreMod.initStatus('01', { title: 'Scaffold' });
  statusStoreMod.saveStatus(config, '01-scaffold', status);

  status.note = 'metadata-only save is allowed';
  statusStoreMod.saveStatus(config, '01-scaffold', status);

  const directPass = statusStoreMod.loadStatus(config, '01-scaffold');
  directPass.status = 'PASS';
  assert.throws(() => statusStoreMod.saveStatus(config, '01-scaffold', directPass), (error) => {
    assert.equal(error.code, 'STATUS_LIFECYCLE_GUARD_VIOLATION');
    assert.equal(error.guarded_fields.includes('status'), true);
    return true;
  });

  const transitioned = statusStoreMod.loadStatus(config, '01-scaffold');
  const transitionedLifecycle = lifecycleStateMod.startModulePhase(transitioned, 'forge', 'Forge started canonically', { now: '2026-04-28T12:35:00.000Z' });
  statusStoreMod.saveStatus(config, '01-scaffold', transitioned, transitionedLifecycle);
  const persisted = statusStoreMod.loadStatus(config, '01-scaffold');
  assert.equal(persisted.status, 'IN_PROGRESS');

  const directTerminalOverwrite = statusStoreMod.loadStatus(config, '01-scaffold');
  directTerminalOverwrite.status = 'BLOCKED';
  directTerminalOverwrite.blockedReason = 'direct overwrite';
  assert.throws(() => statusStoreMod.saveStatus(config, '01-scaffold', directTerminalOverwrite), /guarded lifecycle fields changed/);
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
    _runId: 'run-approval-lifecycle',
  };

  const gate = { type: 'approval', title: 'Release Approval', on_timeout: 'block' };
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

  const next = pipelineSchedulingMod.findNextStep(config, progress);
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
  assert.equal(Object.prototype.hasOwnProperty.call(reconciled, 'gateStatus'), false);

  const next = pipelineSchedulingMod.findNextStep(config, progress);
  assert.deepEqual(next, { type: 'gate', id: 'gate:buster' });

  const projectedGate = statusStoreMod.loadLifecycleReadModels(config).gates['gate:buster'];
  assert.equal(projectedGate.status, 'FAIL');
  assert.equal(projectedGate.completion_source, 'output_file');
  assert.equal(projectedGate.projection_source, 'output_file');
  assert.equal(projectedGate.gate_output_status, 'FAIL');
  assert.equal(Object.prototype.hasOwnProperty.call(projectedGate, 'gate_status_diagnostic'), false);
  assert.equal(projectedGate.gate_status_authority.allow_gate_status_completion_authority, false);
  assert.equal(projectedGate.scheduler_drift_detected, false);
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
    _runId: 'run-cooldown-replay',
  };
  ensureDir(path.join(logDir, 'pipeline', 'runs', config._runId));

  const progress = {
    execution_order: ['01'],
    modules: {
      '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge', 'buster'] },
    },
    gates: {},
  };

  const status = statusStoreMod.initStatus('01', { title: 'Scaffold' });
  let lifecycleTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Forge started', { now: '2026-04-20T16:55:00.000Z' });
  statusStoreMod.saveStatus(config, '01-scaffold', status, lifecycleTransition);
  lifecycleTransition = lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: 'Forge complete',
    now: '2026-04-20T16:58:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status, lifecycleTransition);
  lifecycleTransition = lifecycleStateMod.startModulePhase(status, 'buster', 'Buster started', { now: '2026-04-20T17:00:00.000Z' });
  statusStoreMod.saveStatus(config, '01-scaffold', status, lifecycleTransition);
  lifecycleTransition = lifecycleStateMod.transitionModuleStatus(status, 'RATE_LIMITED', {
    note: 'Paused for provider cooldown',
    phase: 'buster',
    now: '2026-04-20T17:01:00.000Z',
  });
  statusStoreMod.saveStatus(config, '01-scaffold', status, lifecycleTransition);

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
    _runId: 'run-gate-cooldown-replay',
  };

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

await record('shared helper ownership stays local-shimmed and the public pipeline index stays narrow', async () => {
  const commonGatewayText = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/integrations/gateway.ts');
  const novaOrchestrationText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/agents/orchestration.ts');
  const novaModuleRunnerText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/module-runner.ts');
  const novaPollingText = [
    'polling.ts',
    'polling-session-end.ts',
  ].map((file) => readOverlayText(sourceRoot, overlayRoot, `skills/nova/pipeline/services/${file}`)).join('\n');
  const busterPipelineText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.ts');
  const busterRateLimitText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/services/rate-limit.ts');
  const acpMonitorText = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/agents/acp-monitor.ts');
  const lifecycleText = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/agents/lifecycle.ts');
  assert.equal(commonGatewayText.includes('export function gatewayHeaders'), false);
  assert.equal(commonGatewayText.includes('export async function invokeGatewayTool'), false);
  for (const relPath of [
    'skills/nova/pipeline/agents/runtime.ts',
    'skills/nova/pipeline/agents/lifecycle.ts',
    'skills/nova/pipeline/agents/acp-monitor.ts',
    'skills/nova/pipeline/agents/tracked-agents.ts',
    'skills/nova/pipeline/integrations/gateway.ts',
    'skills/nova/pipeline/lifecycle-state.ts',
    'skills/buster/pipeline/agents/runtime.ts',
    'skills/buster/pipeline/agents/lifecycle.ts',
    'skills/buster/pipeline/agents/acp-monitor.ts',
    'skills/buster/pipeline/agents/tracked-agents.ts',
    'skills/buster/pipeline/integrations/gateway.ts',
    'skills/buster/pipeline/lifecycle-state.ts',
  ]) {
    const shimText = readOverlayText(sourceRoot, overlayRoot, relPath);
    assert(shimText.includes('export * from'), `${relPath} should remain as a repo-local common facade`);
    assert(shimText.includes('common/pipeline'), `${relPath} facade should point to the common owner`);
  }
  assert(novaOrchestrationText.includes("../integrations/gateway.ts"));
  assert(novaModuleRunnerText.includes("./module-runner/attempt.ts"));
  assert(novaPollingText.includes("../agents/acp-monitor.ts"));
  assert(novaPollingText.includes("../integrations/gateway.ts"));
  assert(busterPipelineText.includes("./pipeline/agents/session-termination.ts"));
  assert(busterPipelineText.includes("./pipeline/integrations/gateway.ts"));
  assert(busterRateLimitText.includes("../agents/acp-monitor.ts"));
  assert(acpMonitorText.includes("import { getGatewaySessionStatus, resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.ts';"));
  assert(acpMonitorText.includes("import { getTrackedAgent } from './tracked-agents.ts';"));
  assert.equal(acpMonitorText.includes("new URL('./lifecycle.js', import.meta.url)"), false);
  assert.equal(acpMonitorText.includes('import('), false);
  assert(lifecycleText.includes("from './session-semantics.ts';"));
  assert(lifecycleText.includes("from './tracked-agents.ts';"));
  assert.equal(lifecycleText.includes("from './acp-monitor.ts'"), false);
  assert.equal(acpMonitorText.includes("new URL('./shutdown.js', import.meta.url)"), false);
  assert.equal(acpMonitorText.includes('invokeGatewayTool('), false);
  assert(acpMonitorText.includes('getGatewaySessionStatus(sessionKey, 10000, {'));
  assert.equal(acpMonitorText.includes('gatewayInvoke('), false);
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
  const telemetryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/telemetry.ts');
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

await record('pipeline runtime lock serializes shared-swarm runs and reclaims only expired leased locks', async () => {
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-swarm-'));
  const config = {
    project: 'behavior-demo',
    repo_root: '/tmp/behavior-repo',
    _runId: 'run-123',
    paths: { swarm_dir: swarmDir },
  };
  const otherProjectConfig = {
    ...config,
    project: 'other-behavior-demo',
    _runId: 'run-456',
  };

  const firstLock = pipelineLockMod.acquirePipelineRunLock(config, { module: '01' });
  const lockPath = path.join(swarmDir, 'logs', 'pipeline', 'active-run.lock.json');
  assert(fs.existsSync(lockPath));

  assert.throws(
    () => pipelineLockMod.acquirePipelineRunLock(config, { module: '02' }),
    /shared runtime\/swarm/,
  );
  assert.throws(
    () => pipelineLockMod.acquirePipelineRunLock(otherProjectConfig, { module: '01' }),
    /Concurrent pipeline runs are intentionally serialized per swarm_dir/,
  );

  pipelineLockMod.releasePipelineRunLock(firstLock);
  assert.equal(fs.existsSync(lockPath), false);

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, '{ not json');
  assert.throws(
    () => pipelineLockMod.acquirePipelineRunLock(config, { resume: true }),
    /malformed and cannot be safely reclaimed/,
  );
  assert.equal(fs.existsSync(lockPath), true);
  fs.unlinkSync(lockPath);

  fs.writeFileSync(lockPath, JSON.stringify({
    schema_version: 1,
    token: 'expired-token',
    pid: 999999,
    hostname: 'retired-host',
    project: config.project,
    run_id: 'stale-run',
    module: 'stale-module',
    resume: false,
    acquired_at: '2026-01-01T00:00:00.000Z',
    heartbeat_at: '2026-01-01T00:00:00.000Z',
    lease_expires_at: '2026-01-01T00:00:01.000Z',
    stale_at: '2026-01-01T00:00:01.000Z',
    lease_ms: 1000,
    heartbeat_ms: 500,
    repo_root: config.repo_root,
  }, null, 2));

  const reclaimedLock = pipelineLockMod.acquirePipelineRunLock(config, { resume: true });
  assert(fs.existsSync(lockPath));
  const persisted = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(persisted.run_id, 'run-123');
  assert.equal(persisted.resume, true);
  pipelineLockMod.releasePipelineRunLock(reclaimedLock);
  assert.equal(fs.existsSync(lockPath), false);
});

await record('Buster monitor enforces hard wall-clock timeouts with explicit kill confirmation', async () => {
  const killCalls = [];
  const result = await busterSessionMonitorMod.monitorSession(
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
      rate_limit: { max_pauses: 5, initial_cooldown_s: 7200, max_cooldown_s: 7200 },
      acp_monitor: {
        unknown_poll_limit: 10,
        stale_poll_limit: 10,
        max_transcript_extensions: 3,
        transcript_grace_ms: 300000,
        monitor_poll_ms: 10000,
      },
    },
    null,
    {
      moduleId: '01',
      spawnedAt: 1,
      timeoutSeconds: 1,
      killGraceMs: 1,
      gatewayUrl: 'http://127.0.0.1:1',
      gatewayToken: '',
      logger: { info() {}, warn() {}, error() {}, step() {}, flush() {} },
      testHooks: {
        now: () => 5000,
        sleep: async () => {},
        terminateSession: async (sessionKey, opts) => {
          killCalls.push({ sessionKey, opts });
          return {
            sessionKey,
            requested: true,
            confirmed: true,
            unconfirmed: false,
            terminal: true,
            state: 'closed',
            cleanupAttempted: false,
            cleanupConfirmed: false,
            cleanupError: null,
            graceMs: opts.graceMs,
          };
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
  assert.equal(result.termination.confirmed, true);
  assert.equal(result.termination.unconfirmed, false);
});

await record('Buster consumer reclaims pending tasks before reading new deliveries', async () => {
  const reclaimCalls = [];
  let xreadgroupCalls = 0;
  const previousSwarmConfig = process.env.SWARM_CONFIG;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-task-queue-'));
  const swarmConfigPath = path.join(root, 'swarm.config.json');
  fs.writeFileSync(swarmConfigPath, JSON.stringify({
    buster: {
      runtime: {
        heartbeat_path: path.join(root, 'heartbeat.json'),
        heartbeat_interval_ms: 1000,
        task_poll_interval_ms: 2000,
        task_pending_reclaim_idle_ms: 60000,
        task_stream_max_len: 250,
      },
    },
  }));
  try {
    process.env.SWARM_CONFIG = swarmConfigPath;
    busterRuntimePolicyMod.resetBusterRuntimePolicyForTests();
    const reclaimed = await busterTaskQueueMod.readNextTaskEntry({
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
  } finally {
    busterRuntimePolicyMod.resetBusterRuntimePolicyForTests();
    if (previousSwarmConfig === undefined) delete process.env.SWARM_CONFIG;
    else process.env.SWARM_CONFIG = previousSwarmConfig;
  }
});
}
