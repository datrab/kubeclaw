import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(
  path.resolve('skills/nova/core/src/index.ts'),
).href);
const { verifyPinnedPackages } = await import(pathToFileURL(
  path.resolve('skills/nova/core/execution/engine-snapshots.ts'),
).href);
const { runRoot: resolveRunRoot } = await import(pathToFileURL(
  path.resolve('skills/nova/core/execution/run-root.ts'),
).href);
const runnerSource = fs.readFileSync(
  'skills/nova/core/execution/runner.ts',
  'utf8',
);
assert.doesNotMatch(runnerSource, /\b(?:forge|buster|kubeclaw\.)\b/iu);
for (const file of [
  'skills/nova/core/execution/graph.ts',
  'skills/nova/core/execution/runner.ts',
  'skills/nova/core/lifecycle/reducer.ts',
  'skills/nova/core/lifecycle/recovery.ts',
]) {
  assert.doesNotMatch(
    fs.readFileSync(file, 'utf8'),
    /\b(?:needs_nova|action_required)\b/u,
    `v2 executable lifecycle surface must reject legacy control names: ${file}`,
  );
}
const phaseLedger = JSON.parse(fs.readFileSync(
  'docs/architecture/plugin-system-phase6-lifecycle.json',
  'utf8',
));
assert.equal(phaseLedger.status, 'complete-v2-preparation');
assert.equal(phaseLedger.productionAuthority, 'skills-role-bundles-v1');
assert.deepEqual(
  phaseLedger.lifecycle.rejectedV2Aliases,
  ['needs_nova', 'action_required'],
);

const stage = (id, dependsOn = [], overrides = {}) => ({
  id,
  type: 'test.generic',
  dependsOn,
  config: {},
  input: { mode: 'passed' },
  execution: {
    maxAttempts: 3,
    maxRemediationCycles: 1,
    timeoutMs: 5_000,
  },
  ...overrides,
});

const graphDefinition = {
  schemaVersion: 'pipeline-definition.v2',
  id: 'pipeline:phase6',
  maxConcurrency: 2,
  stages: [
    stage('seed'),
    stage('left', ['seed']),
    stage('right', ['seed']),
    stage('join', ['left', 'right']),
    stage('review', ['join'], {
      input: { mode: 'request_fix_then_pass' },
      on: { request_fix: 'fix' },
    }),
    stage('fix', ['review']),
  ],
};
const graph = core.ExecutionGraph.fromDefinition(graphDefinition);
const snapshot = graph.snapshot(graphDefinition.id, graphDefinition.maxConcurrency);
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(snapshot.nodes), true);
assert.equal(Object.isFrozen(snapshot.nodes[0].execution), true);
assert.equal(Object.isFrozen(snapshot.ordinaryEdges), true);
assert.equal(Object.isFrozen(snapshot.remediationEdges), true);
assert.match(snapshot.digest, /^sha256:[a-f0-9]{64}$/);
assert.deepEqual(
  snapshot.ordinaryEdges.map(({ from, to }) => `${from}->${to}`),
  ['join->review', 'left->join', 'review->fix', 'right->join', 'seed->left', 'seed->right'],
);
assert.deepEqual(
  snapshot.remediationEdges.map(({ from, to }) => `${from}->${to}`),
  ['review->fix'],
);
assert.deepEqual(graph.ready(new Set(['seed']), new Set()).map(({ id }) => id), ['left', 'right']);
assert.deepEqual(
  graph.ready(new Set(['seed', 'left', 'right', 'join', 'review']), new Set())
    .map(({ id }) => id),
  [],
  'downstream remediation-only targets do not run on the ordinary success path',
);
assert.throws(() => snapshot.nodes[0].dependsOn.push('escape'));
assert.throws(() => new core.ExecutionGraph([
  stage('a', ['b']),
  stage('b', ['a']),
]), /GRAPH_CYCLE/);
assert.throws(() => new core.ExecutionGraph([
  stage('self', [], { on: { request_fix: 'self' } }),
]), /GRAPH_SELF_REMEDIATION/);
assert.throws(() => new core.ExecutionGraph([
  stage('left', [], { on: { request_fix: 'fix' } }),
  stage('right', [], { on: { request_fix: 'fix' } }),
  stage('fix', ['left', 'right']),
]), /GRAPH_SHARED_REMEDIATION_TARGET/);
assert.throws(() => new core.ExecutionGraph([
  stage('review', [], { on: { request_fix: 'fix' } }),
  stage('fix'),
]), /GRAPH_REMEDIATION_TARGET_UNORDERED/);
assert.throws(() => new core.ExecutionGraph([
  stage('review', [], { on: { request_fix: 'fix' } }),
  stage('post-review', ['review']),
  stage('fix', ['review', 'post-review']),
]), /GRAPH_REMEDIATION_PREREQUISITE_DEADLOCK/);
assert.throws(() => new core.ExecutionGraph([
  stage('review', [], { on: { request_fix: 'fix' } }),
  stage('fix', ['review']),
  stage('post-fix', ['fix']),
]), /GRAPH_REMEDIATION_TARGET_NOT_LEAF/);
assert.throws(() => new core.ExecutionGraph([
  stage('bad', [], {
    execution: {
      maxAttempts: 2,
      maxRemediationCycles: 0,
      orchestratorAfterAttempt: 2,
      timeoutMs: 1,
    },
  }),
]), /GRAPH_ORCHESTRATOR_THRESHOLD_INVALID/);
assert.throws(() => new core.ExecutionGraph([
  stage('conditional', [], {
    activation: {
      sourceStage: 'missing',
      fact: 'test.review',
      equals: 'required',
    },
  }),
]), /GRAPH_ACTIVATION_SOURCE_MISSING/);
assert.throws(() => new core.ExecutionGraph([
  stage('source'),
  stage('conditional', [], {
    activation: {
      sourceStage: 'source',
      fact: 'test.review',
      equals: 'required',
    },
  }),
]), /GRAPH_ACTIVATION_SOURCE_NOT_ANCESTOR/);
assert.throws(() => new core.ExecutionGraph([
  stage('review', [], { on: { request_fix: 'fix' } }),
  stage('fix', ['review'], {
    activation: {
      sourceStage: 'review',
      fact: 'test.review',
      equals: 'required',
    },
  }),
]), /GRAPH_ACTIVATION_ON_REMEDIATION_TARGET/);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-phase6-'));
try {
  const fixtureRoot = path.resolve('tests/fixtures/plugin-system-v2');
  const observerJournal = path.join(temporary, 'observer.jsonl');
  const platform = {
    schemaVersion: 'pipeline-platform.v2',
    installationRoots: [fixtureRoot],
    trustedBuiltinRoots: [fixtureRoot],
    externalTrust: {
      allowedSourceDigests: {},
      verifiedAttestations: {},
    },
    providers: {},
    grants: {},
    adapters: {},
    activeAdapters: [],
    observers: {
      'test.graph-plugin:lifecycle-recorder': { journalPath: observerJournal },
    },
    storageRoot: path.join(temporary, 'state'),
    shutdownTimeoutMs: 5_000,
    orchestratorIssuerId: 'nova',
    administrativeDecisionIssuers: [
      { type: 'administrator', id: 'admin:test' },
    ],
  };
  const authenticateAdministrativeDecision = async (decision) => decision.actor;
  const conditionalDefinition = (review) => ({
    schemaVersion: 'pipeline-definition.v2',
    id: `pipeline:conditional:${review}`,
    maxConcurrency: 1,
    stages: [
      stage('architecture', [], {
        input: {
          mode: 'passed',
          facts: { 'architecture.review': review },
        },
      }),
      stage('architecture-approval', ['architecture'], {
        activation: {
          sourceStage: 'architecture',
          fact: 'architecture.review',
          equals: 'approval_required',
        },
      }),
      stage('forge', ['architecture-approval']),
    ],
  });
  const cleanConditional = conditionalDefinition('clean');
  const cleanConditionalResult = await core.runPipelineV2(
    platform,
    cleanConditional,
    'run:conditional-clean',
  );
  assert.equal(cleanConditionalResult.status, 'succeeded');
  assert.equal(cleanConditionalResult.stages.get('architecture').facts['architecture.review'], 'clean');
  assert.equal(cleanConditionalResult.stages.get('architecture-approval').status, 'skipped');
  assert.equal(cleanConditionalResult.stages.get('architecture-approval').attemptsUsed, 0);
  assert.equal(cleanConditionalResult.stages.get('forge').status, 'succeeded');
  const cleanConditionalRoot = resolveRunRoot(platform.storageRoot, 'run:conditional-clean');
  const cleanConditionalLines = fs.readFileSync(
    path.join(cleanConditionalRoot, 'events.jsonl'),
    'utf8',
  ).trim().split('\n');
  const cleanConditionalEvents = cleanConditionalLines.map((line) => JSON.parse(line).entry);
  assert.equal(
    cleanConditionalEvents.some((event) =>
      event.type === 'stage.skipped'
      && event.identity.stageId === 'architecture-approval'),
    true,
  );
  assert.equal(
    cleanConditionalEvents.some((event) =>
      event.type === 'stage.started'
      && event.identity.stageId === 'architecture-approval'),
    false,
    'a false activation condition must not create an attempt or invoke the plugin',
  );
  assert.deepEqual(
    [...core.recoverStageStates(
      cleanConditional,
      new core.FileJournal(path.join(cleanConditionalRoot, 'events.jsonl')).records(),
      'run:conditional-clean',
      'nova',
    )],
    [...cleanConditionalResult.stages],
  );

  const approvalConditional = conditionalDefinition('approval_required');
  const approvalConditionalResult = await core.runPipelineV2(
    platform,
    approvalConditional,
    'run:conditional-approval',
  );
  assert.equal(approvalConditionalResult.status, 'succeeded');
  assert.equal(approvalConditionalResult.stages.get('architecture-approval').status, 'succeeded');
  assert.equal(approvalConditionalResult.stages.get('architecture-approval').attemptsUsed, 1);

  const recoveryPlatformForActivation = {
    ...platform,
    storageRoot: path.join(temporary, 'activation-recovery-state'),
  };
  await core.runPipelineV2(
    recoveryPlatformForActivation,
    cleanConditional,
    'run:conditional-recovery',
  );
  const activationRecoveryRoot = resolveRunRoot(
    recoveryPlatformForActivation.storageRoot,
    'run:conditional-recovery',
  );
  const activationRecoveryEventsFile = path.join(activationRecoveryRoot, 'events.jsonl');
  const activationRecoveryLines = fs.readFileSync(
    activationRecoveryEventsFile,
    'utf8',
  ).trim().split('\n');
  const skippedLine = activationRecoveryLines.findIndex((line) => {
    const event = JSON.parse(line).entry;
    return event.type === 'stage.skipped'
      && event.identity.stageId === 'architecture-approval';
  });
  assert(skippedLine >= 0);
  fs.writeFileSync(
    activationRecoveryEventsFile,
    `${activationRecoveryLines.slice(0, skippedLine + 1).join('\n')}\n`,
  );
  fs.writeFileSync(path.join(activationRecoveryRoot, 'observer-checkpoints.jsonl'), '');
  fs.writeFileSync(path.join(activationRecoveryRoot, 'observer-deliveries.jsonl'), '');
  const conditionalRecovery = await core.recoverPipelineV2(
    recoveryPlatformForActivation,
    cleanConditional,
    'run:conditional-recovery',
  );
  assert.equal(conditionalRecovery.status, 'succeeded');
  assert.equal(conditionalRecovery.stages.get('architecture-approval').status, 'skipped');
  assert.equal(conditionalRecovery.stages.get('architecture-approval').attemptsUsed, 0);
  assert.equal(conditionalRecovery.stages.get('forge').status, 'succeeded');

  const definition = structuredClone(graphDefinition);
  definition.stages.find(({ id }) => id === 'left').input.delayMs = 200;
  definition.stages.find(({ id }) => id === 'right').input.delayMs = 200;
  let runSettled = false;
  const runPromise = core.runPipelineV2(platform, definition, 'run:phase6')
    .finally(() => {
      runSettled = true;
    });
  const observerDeadline = Date.now() + 2_000;
  while (
    Date.now() < observerDeadline
    && (!fs.existsSync(observerJournal)
      || !fs.readFileSync(observerJournal, 'utf8').includes('"type":"stage.started"'))
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(
    fs.readFileSync(observerJournal, 'utf8').includes('"type":"stage.started"'),
    true,
    'observers receive lifecycle events while the run is active',
  );
  assert.equal(runSettled, false, 'incremental observer delivery precedes terminal execution');
  const result = await runPromise;
  assert.equal(result.status, 'succeeded');
  assert.equal(Object.isFrozen(result), true);
  assert.equal('set' in result.stages, false);
  for (const state of result.stages.values()) assert.equal(Object.isFrozen(state), true);
  assert.equal(result.stages.get('review').attemptsUsed, 2);
  assert.equal(result.stages.get('review').attemptNumber, 2);
  assert.equal(result.stages.get('review').remediationCyclesUsed, 1);
  assert.equal(result.stages.get('fix').attemptsUsed, 1);
  assert.equal(result.identity.graphDigest, core.ExecutionGraph.fromDefinition(definition).snapshot(
    definition.id,
    definition.maxConcurrency,
  ).digest);

  const runRoot = resolveRunRoot(platform.storageRoot, 'run:phase6');
  const storedGraph = JSON.parse(fs.readFileSync(path.join(runRoot, 'run-snapshot.json'), 'utf8')).graph;
  assert.equal(storedGraph.digest, result.identity.graphDigest);
  const registrySnapshotFile = path.join(runRoot, 'run-snapshot.json');
  const registrySnapshot = fs.readFileSync(registrySnapshotFile, 'utf8');
  const incompleteRegistrySnapshot = JSON.parse(registrySnapshot);
  incompleteRegistrySnapshot.registry.packages = [];
  fs.writeFileSync(
    registrySnapshotFile,
    `${JSON.stringify(incompleteRegistrySnapshot, null, 2)}\n`,
  );
  await assert.rejects(
    () => core.recoverPipelineV2(platform, definition, 'run:phase6'),
    /RUN_SNAPSHOT_INTEGRITY_INVALID/,
    'recovery rejects an incomplete pinned package set',
  );
  fs.writeFileSync(registrySnapshotFile, registrySnapshot);
  await assert.rejects(() => core.recoverPipelineV2({ ...platform, observers: { 'test.graph-plugin:lifecycle-recorder': { journalPath: observerJournal + '.changed' } } }, definition, 'run:phase6'), /RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);
  const events = fs.readFileSync(path.join(runRoot, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).entry);
  const indexOf = (type, stageId, occurrence = 0) => {
    const matches = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === type && event.identity.stageId === stageId);
    return matches[occurrence]?.index ?? -1;
  };
  assert(indexOf('stage.started', 'right') < indexOf('attempt.completed', 'left'));
  assert(indexOf('stage.started', 'fix') > indexOf('stage.waiting', 'review'));
  assert(indexOf('stage.started', 'review', 1) > indexOf('stage.succeeded', 'fix'));
  assert.deepEqual(
    events
      .filter(({ type, identity }) => type === 'attempt.created' && identity.stageId === 'review')
      .map(({ payload }) => payload.attemptNumber),
    [1, 2],
  );

  const runRecords = new core.FileJournal(path.join(runRoot, 'events.jsonl')).records();
  const recovered = core.recoverStageStates(definition, runRecords, 'run:phase6', 'nova');
  assert.deepEqual([...recovered], [...result.stages]);
  const requestFixTerminalIndex = runRecords.findIndex(({ entry }) =>
    entry.type === 'attempt.completed'
    && entry.identity.stageId === 'review'
    && entry.payload.outcome === 'request_fix');
  const recoveredTerminalCrashWindow = core.recoverStageStates(
    definition,
    runRecords.slice(0, requestFixTerminalIndex + 1),
    'run:phase6',
    'nova',
  );
  assert.equal(recoveredTerminalCrashWindow.get('review').status, 'waiting');
  assert.equal(recoveredTerminalCrashWindow.get('review').remediationTarget, 'fix');
  assert.equal(recoveredTerminalCrashWindow.get('review').attemptNumber, 1);

  const recoveryPlatform = {
    ...platform,
    storageRoot: path.join(temporary, 'recovery-state'),
  };
  await core.runPipelineV2(recoveryPlatform, definition, 'run:phase6-recovery');
  const recoveryEventsFile = path.join(
    resolveRunRoot(recoveryPlatform.storageRoot, 'run:phase6-recovery'),
    'events.jsonl',
  );
  const recoveryLines = fs.readFileSync(recoveryEventsFile, 'utf8').trim().split('\n');
  const recoveryTerminalLine = recoveryLines.findIndex((line) => {
    const event = JSON.parse(line).entry;
    return event.type === 'attempt.completed'
      && event.identity.stageId === 'review'
      && event.payload.outcome === 'request_fix';
  });
  fs.writeFileSync(
    recoveryEventsFile,
    `${recoveryLines.slice(0, recoveryTerminalLine + 1).join('\n')}\n`,
  );
  fs.writeFileSync(path.join(path.dirname(recoveryEventsFile), 'observer-checkpoints.jsonl'), '');
  fs.writeFileSync(path.join(path.dirname(recoveryEventsFile), 'observer-deliveries.jsonl'), '');
  const recoveredExecution = await core.recoverPipelineV2(
    recoveryPlatform,
    definition,
    'run:phase6-recovery',
  );
  assert.equal(recoveredExecution.status, 'succeeded');
  assert.equal(recoveredExecution.stages.get('review').attemptNumber, 2);
  assert.equal(
    events.filter(({ type }) => type === 'attempt.created').length,
    events.filter(({ type }) =>
      ['attempt.completed', 'attempt.timed_out', 'attempt.cancelled'].includes(type)).length,
    'every immutable attempt identity has exactly one terminal event',
  );

  const blockedDefinition = {
    schemaVersion: 'pipeline-definition.v2',
    id: 'pipeline:administrative-reopen',
    maxConcurrency: 1,
    stages: [stage('approval', [], {
      input: { mode: 'blocked_then_pass', delayMs: 50 },
      execution: {
        maxAttempts: 1,
        maxRemediationCycles: 0,
        timeoutMs: 5_000,
      },
    })],
  };
  const blocked = await core.runPipelineV2(
    platform,
    blockedDefinition,
    'run:administrative-reopen',
  );
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.stages.get('approval').attemptsUsed, 1);
  const administrativeDecision = {
    schemaVersion: 'administrative-reopen.v2',
    decisionId: 'decision:administrative-retry',
    idempotencyKey: 'decision-key:administrative-retry',
    runId: 'run:administrative-reopen',
    stageId: 'approval',
    actor: { type: 'administrator', id: 'admin:test' },
    reason: { code: 'test.retry_authorized' },
    continuation: 'retry',
    decidedAt: new Date().toISOString(),
  };
  await assert.rejects(
    core.reopenBlockedPipelineV2(platform, blockedDefinition, {
      ...administrativeDecision,
      actor: { type: 'administrator', id: 'admin:untrusted' },
    }, authenticateAdministrativeDecision),
    /ADMIN_REOPEN_ISSUER_DENIED/,
  );
  const concurrentReopens = await Promise.allSettled([
    core.reopenBlockedPipelineV2(
      platform,
      blockedDefinition,
      administrativeDecision,
      authenticateAdministrativeDecision,
    ),
    core.reopenBlockedPipelineV2(
      platform,
      blockedDefinition,
      administrativeDecision,
      authenticateAdministrativeDecision,
    ),
  ]);
  const reopened = concurrentReopens.find(({ status }) => status === 'fulfilled')?.value;
  assert(reopened, 'one serialized administrative reopen must complete');
  assert.equal(reopened.status, 'succeeded');
  assert.equal(
    reopened.stages.get('approval').attemptsUsed,
    2,
    'administrative reopening authorizes one attempt without resetting the consumed budget',
  );
  const administrativeRunRoot = resolveRunRoot(
    platform.storageRoot,
    'run:administrative-reopen',
  );
  const administrativeRecords = new core.FileJournal(
    path.join(administrativeRunRoot, 'administrative-decisions.jsonl'),
  ).records();
  assert.equal(administrativeRecords.length, 1);
  assert.equal(administrativeRecords[0].entry.actor.id, 'admin:test');
  assert.equal(
    new core.FileJournal(
      path.join(administrativeRunRoot, 'events.jsonl'),
    ).records().filter(({ entry }) => entry.type === 'attempt.created').length,
    2,
    'concurrent idempotent calls authorize only one additional attempt',
  );

  const crashWindowRunId = 'run:administrative-crash-window';
  await core.runPipelineV2(platform, blockedDefinition, crashWindowRunId);
  const crashWindowDecision = {
    ...administrativeDecision,
    decisionId: 'decision:administrative-crash-window',
    idempotencyKey: 'decision-key:administrative-crash-window',
    runId: crashWindowRunId,
  };
  const crashWindowRoot = resolveRunRoot(platform.storageRoot, crashWindowRunId);
  new core.FileJournal(
    path.join(crashWindowRoot, 'administrative-decisions.jsonl'),
  ).append(crashWindowDecision);
  const recoveredAdministrativeIntent = await core.reopenBlockedPipelineV2(
    platform,
    blockedDefinition,
    Object.fromEntries(Object.entries(crashWindowDecision).reverse()),
    authenticateAdministrativeDecision,
  );
  assert.equal(recoveredAdministrativeIntent.status, 'succeeded');
  assert.equal(
    new core.FileJournal(
      path.join(crashWindowRoot, 'administrative-decisions.jsonl'),
    ).records().length,
    1,
    'an exact recorded-but-unapplied administrative decision resumes idempotently',
  );

  const crashWindowEventsFile = path.join(crashWindowRoot, 'events.jsonl');
  const eventCountBeforeCompletedReplay = new core.FileJournal(
    crashWindowEventsFile,
  ).records().length;
  const repeatedAdministrativeResult = await core.reopenBlockedPipelineV2(
    platform,
    blockedDefinition,
    Object.fromEntries(Object.entries(crashWindowDecision).reverse()),
    authenticateAdministrativeDecision,
  );
  assert.equal(repeatedAdministrativeResult.status, 'succeeded');
  assert.equal(
    repeatedAdministrativeResult.stages.get('approval').attemptsUsed,
    2,
    'replaying a completed administrative decision does not execute another attempt',
  );
  assert.equal(
    new core.FileJournal(crashWindowEventsFile).records().length,
    eventCountBeforeCompletedReplay,
    'replaying a completed administrative decision is lifecycle-journal idempotent',
  );
  assert.equal(
    new core.FileJournal(crashWindowEventsFile).records()
      .filter(({ entry }) => entry.type === 'run.created').length,
    1,
  );

  const remediationDefinition = {
    schemaVersion: 'pipeline-definition.v2',
    id: 'pipeline:administrative-remediation',
    maxConcurrency: 1,
    stages: [
      stage('approval', [], {
        input: { mode: 'blocked_then_pass' },
        execution: {
          maxAttempts: 2,
          maxRemediationCycles: 1,
          timeoutMs: 5_000,
        },
        on: { request_fix: 'fix' },
      }),
      stage('fix', ['approval']),
    ],
  };
  await core.runPipelineV2(
    platform,
    remediationDefinition,
    'run:administrative-remediation',
  );
  const remediated = await core.reopenBlockedPipelineV2(
    platform,
    remediationDefinition,
    {
      schemaVersion: 'administrative-reopen.v2',
      decisionId: 'decision:administrative-remediation',
      idempotencyKey: 'decision-key:administrative-remediation',
      runId: 'run:administrative-remediation',
      stageId: 'approval',
      actor: { type: 'administrator', id: 'admin:test' },
      reason: { code: 'test.remediation_authorized' },
      continuation: 'remediation',
      remediationStageId: 'fix',
      decidedAt: new Date().toISOString(),
    },
    authenticateAdministrativeDecision,
  );
  assert.equal(remediated.status, 'succeeded');
  assert.equal(remediated.stages.get('approval').remediationCyclesUsed, 1);

  const cancellationDefinition = {
    schemaVersion: 'pipeline-definition.v2',
    id: 'pipeline:cancellation',
    maxConcurrency: 2,
    stages: [
      stage('slow-left', [], { input: { mode: 'passed', delayMs: 1_000 } }),
      stage('slow-right', [], { input: { mode: 'passed', delayMs: 1_000 } }),
    ],
  };
  const cancellation = new AbortController();
  const cancellationStartedAt = Date.now();
  const cancelledRun = core.runPipelineV2(
    platform,
    cancellationDefinition,
    'run:cancellation',
    cancellation.signal,
  );
  setTimeout(() => cancellation.abort(new Error('test cancellation')), 10);
  const cancelled = await cancelledRun;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.stages.get('slow-left').attemptsUsed, 1);
  assert.equal(cancelled.stages.get('slow-right').attemptsUsed, 1);
  assert.equal(cancelled.stages.get('slow-left').status, 'cancelled');
  assert.equal(cancelled.stages.get('slow-right').status, 'cancelled');
  assert(
    Date.now() - cancellationStartedAt < 500,
    'core cancellation must not wait for a plugin that ignores its abort signal',
  );
  const cancellationEvents = fs.readFileSync(
    path.join(resolveRunRoot(platform.storageRoot, 'run:cancellation'), 'events.jsonl'),
    'utf8',
  );
  assert.equal(
    cancellationEvents.match(/"type":"attempt.cancelled"/g)?.length,
    2,
  );
  assert.equal(
    cancellationEvents.match(/"type":"stage.cancelled"/g)?.length,
    2,
  );

  const upgradeRoot = path.join(temporary, 'package-upgrade-contract');
  fs.mkdirSync(upgradeRoot, { recursive: true });
  const oldIdentity = { pluginId: 'kubeclaw.review', apiVersion: 'pipeline-plugin-v2',
    packageVersion: '2.0.0', contentDigest: `sha256:${'1'.repeat(64)}` };
  const newIdentity = { ...oldIdentity, packageVersion: '2.0.1', contentDigest: `sha256:${'2'.repeat(64)}` };
  const { writeRunSnapshots, graphSnapshot } = await import('../../../skills/nova/core/execution/engine-snapshots.ts');
  writeRunSnapshots(upgradeRoot, graphSnapshot(definition), { configuration: {}, packages: [['kubeclaw.review', { package: oldIdentity }]] });
  const upgradedRuntime = { configuration: {}, snapshot: { packages: new Map([['kubeclaw.review', {
    provenance: { package: newIdentity },
  }]]) } };
  assert.throws(() => verifyPinnedPackages(upgradeRoot, upgradedRuntime), /RECOVERY_PINNED_PACKAGE_VERSION_MISMATCH/u);
  assert.doesNotThrow(() => verifyPinnedPackages(upgradeRoot, upgradedRuntime,
    [{ pluginId: 'kubeclaw.review', from: oldIdentity, to: newIdentity }]));
  assert.throws(() => verifyPinnedPackages(upgradeRoot, upgradedRuntime,
    [{ pluginId: 'kubeclaw.review', from: { ...oldIdentity, contentDigest: `sha256:${'3'.repeat(64)}` }, to: newIdentity }]),
  /RECOVERY_PACKAGE_UPGRADE_MISMATCH/u);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-phase6' }));
