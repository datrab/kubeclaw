import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  evidenceSchemaTestHooks,
  expectedFailureContractForScenario,
  verifyExpectedFailureEvidence,
} from './real-run-evidence.mjs';
import {
  listRealE2EScenarioIds,
  resolveRealE2EScenario,
} from './failure-scenarios.mjs';
import { malformedOutputScenarioConfig } from './malformed-output-publisher.mjs';

let eventCounter = 0;

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function passEchoReview(workspace, gateId, overrides = {}) {
  return {
    status: 'PASS',
    project: workspace.projectName,
    run_id: workspace.runId,
    gate_id: gateId,
    gate_type: 'review',
    critical_issues: [],
    deferred_issues: [],
    checked_contracts: ['.swarm/contracts/module-review.json'],
    opened_artifacts: ['.swarm/logs/modules/01-nginx/buster-output.json'],
    failed_commands: [],
    unverified_requirements: [],
    summary: 'approved',
    ...overrides,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function appendJsonl(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`);
}

function writeDotted(target, dottedPath, value) {
  const keys = dottedPath.split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function expectedFailUnitCommand(message) {
  return ['node', '-e', `console.error(${JSON.stringify(String(message))}); process.exit(1)`];
}

function assertFailOnceUnitCommand(command, scenarioId) {
  assert.equal(Array.isArray(command), true, scenarioId);
  assert.equal(command[0], 'node', scenarioId);
  assert.equal(command[1], '-e', scenarioId);
  assert.match(command[2], /real-e2e-retry-marker\.txt/, scenarioId);
  assert.match(command[2], /REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE/, scenarioId);
  assert.match(command[2], /REAL_E2E_RETRY_RECOVERED/, scenarioId);
}

function pipelineRunIdFor(workspace) {
  return workspace.pipelineRunId || workspace.runId;
}

function createWorkspace(scenario, { progressFields = {}, configFields = {}, events = [], pipelineRunId = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-evidence-'));
  const projectSrc = path.join(root, 'project', 'src');
  const swarmDir = path.join(projectSrc, '.swarm');
  const runConfigPath = path.join(root, 'swarm.config.json');
  const workspace = {
    runId: 'real-e2e-run-1',
    pipelineRunId: pipelineRunId || 'real-e2e-run-1',
    projectName: 'real-e2e-project',
    projectSrc,
    swarmDir,
    runConfigPath,
  };
  const progress = {
    real_e2e: {
      scenario_id: scenario.id,
      expected_pipeline_exit: scenario.expectedPipelineExit,
      expected_evidence: scenario.expectedEvidence,
    },
  };
  const config = {};
  for (const [field, value] of Object.entries(progressFields)) writeDotted(progress, field, value);
  for (const [field, value] of Object.entries(configFields)) writeDotted(config, field, value);
  writeJson(path.join(swarmDir, 'progress.json'), progress);
  writeJson(runConfigPath, config);
  for (const event of events) {
    const filePath = event.type === 'pipeline_run.halted'
      ? path.join(swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'lifecycle', 'canonical-events.jsonl')
      : path.join(swarmDir, 'logs', 'pipeline', 'pipeline.jsonl');
    appendJsonl(filePath, event);
  }
  return workspace;
}

function writeLifecycleReadModels(workspace, moduleState, extraModules = {}) {
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', pipelineRunIdFor(workspace), 'lifecycle', 'read-models.json'), {
    schema_version: 'pipeline_lifecycle_read_models.v1',
    run_id: pipelineRunIdFor(workspace),
    modules: {
      '01-nginx': moduleState,
      ...extraModules,
    },
  });
}

function writeRetryForgePrompt(workspace, attempt, failSummaries) {
  const text = [
    '# Forge retry prompt',
    `attempt: ${attempt}`,
    'previous failure evidence:',
    ...failSummaries.map((entry) => `- attempt ${entry.attempt}: ${entry.summary}`),
    '',
  ].join('\n');
  const filePath = path.join(workspace.swarmDir, 'logs', 'modules', '01-nginx', `forge-prompt-attempt-${attempt}.md`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function writeRetryProjectSummary(workspace, { moduleStatus, attempts = 2, failCount, failSummaries }) {
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'project-summary.json'), {
    pipeline: {
      moduleStats: [{
        id: '01-nginx',
        status: moduleStatus,
        attempts,
        failCount,
        failSummaries,
      }],
    },
  });
}

function moduleAttemptEvent(workspace, type, attempt, data = {}) {
  return moduleAttemptEventFor(workspace, '01-nginx', type, attempt, data);
}

function moduleAttemptEventFor(workspace, moduleId, type, attempt, data = {}) {
  const runId = pipelineRunIdFor(workspace);
  return {
    event_id: `evt-${++eventCounter}`,
    type,
    refs: {
      run_id: runId,
      project: workspace.projectName,
      module_id: moduleId,
      attempt,
      module_attempt_ref: `module_attempt:${runId}:${moduleId}:${attempt}`,
    },
    data: {
      ...(type === 'module_attempt.started' ? { fail_count_before: Math.max(0, attempt - 1) } : {}),
      ...data,
    },
  };
}

function writeRetryLifecycle(workspace, {
  passedAttempt = 2,
  failedAttempts = [1],
  failedAttemptsWithTesting = [1],
  earlyPass = false,
  skippedStartedAttempts = [],
} = {}) {
  const filePath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', pipelineRunIdFor(workspace), 'lifecycle', 'canonical-events.jsonl');
  const skippedStarts = new Set(skippedStartedAttempts.map((attempt) => Number(attempt)));
  const events = [
    ...(earlyPass ? [moduleAttemptEvent(workspace, 'module_attempt.passed', 1)] : []),
    ...failedAttempts.flatMap((attempt) => [
      ...(skippedStarts.has(Number(attempt)) ? [] : [moduleAttemptEvent(workspace, 'module_attempt.started', attempt)]),
      ...(failedAttemptsWithTesting.includes(attempt) ? [moduleAttemptEvent(workspace, 'module_attempt.testing_started', attempt)] : []),
      moduleAttemptEvent(workspace, 'module_attempt.failed', attempt, { failure_class: attempt === 1 ? 'pretest_code' : 'invalid_forge_completion' }),
    ]),
    ...(passedAttempt == null ? [] : [
      ...(skippedStarts.has(Number(passedAttempt)) ? [] : [moduleAttemptEvent(workspace, 'module_attempt.started', passedAttempt)]),
      moduleAttemptEvent(workspace, 'module_attempt.testing_started', passedAttempt),
      moduleAttemptEvent(workspace, 'module_attempt.passed', passedAttempt),
    ]),
  ];
  for (const event of events) appendJsonl(filePath, event);
}

function busterTask(workspace, { type = 'module_test', attempt = 1, moduleId = '01-nginx' } = {}) {
  const isGate = type === 'gate_test';
  const runId = pipelineRunIdFor(workspace);
  const payload = {
    task_type: type,
    project: workspace.projectName,
    run_id: runId,
    seed_run_id: workspace.runId,
    attempt,
    module_id: isGate ? 'final-buster' : moduleId,
    module: isGate ? 'final-buster' : moduleId,
    ...(isGate ? { gate_id: 'final-buster', gate_type: 'buster' } : {}),
    output_file: isGate ? 'buster-test/FINAL-BUSTER-RESULT.json' : `modules/${moduleId}/buster-output.json`,
  };
  return {
    entry: {
      _id: `task-${type}-${moduleId}-${attempt}`,
      schema_version: 'v1',
      stream_role: 'task',
      type,
      project: workspace.projectName,
      run_id: runId,
      seed_run_id: workspace.runId,
      target_kind: isGate ? 'gate' : 'module',
      target_id: isGate ? 'final-buster' : moduleId,
      module: payload.module,
      module_id: payload.module_id,
      ...(isGate ? { gate_id: 'final-buster', gate_type: 'buster' } : {}),
    },
    payload,
  };
}

function createRetryWorkspace({
  scenarioId = 'forge-retry-then-success',
  pipelineRunId = null,
  moduleStatus = 'PASS',
  attempts = 2,
  failCount = 1,
  currentAttempt = 2,
  passedAttempt = 2,
  failedAttempts = [1],
  failedAttemptsWithTesting = [1],
  taskAttempts = [1, 2],
  includeFinalGateTask = true,
  failSummaries = null,
  earlyPass = false,
  skippedStartedAttempts = [],
} = {}) {
  const scenario = resolveRealE2EScenario(scenarioId);
  const workspace = createWorkspace(scenario, { pipelineRunId });
  if (pipelineRunId) {
    const runDir = `runs/${pipelineRunId}`;
    writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'latest.json'), {
      run_id: pipelineRunId,
      project: workspace.projectName,
      run_dir: runDir,
    });
    writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'summary.json'), {
      run_id: pipelineRunId,
      project: workspace.projectName,
      terminal_status: 'succeeded',
    });
  }
  try {
    const contract = expectedFailureContractForScenario(scenario);
    if (contract.setup?.progress) {
      const progressPath = path.join(workspace.swarmDir, 'progress.json');
      const progress = readJson(progressPath);
      for (const [field, value] of Object.entries(contract.setup.progress)) writeDotted(progress, field, value);
      writeJson(progressPath, progress);
    }
  } catch (error) {
    if (scenario.expectedPipelineExit === 'nonzero') throw error;
    // Success scenarios do not have failure contracts.
  }
  writeRetryLifecycle(workspace, { passedAttempt, failedAttempts, failedAttemptsWithTesting, earlyPass, skippedStartedAttempts });
  const resolvedFailSummaries = failSummaries || [{
    attempt: 1,
    phase: 'buster',
    failure_class: 'pretest_code',
    summary: 'NO_SUBAGENT: unit: FAIL - REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE',
  }];
  writeLifecycleReadModels(workspace, {
    status: moduleStatus,
    fail_count: failCount,
    current_attempt: currentAttempt,
    fail_summaries: resolvedFailSummaries,
  });
  for (let attempt = 2; attempt <= (passedAttempt ?? currentAttempt); attempt += 1) {
    writeRetryForgePrompt(workspace, attempt, resolvedFailSummaries.filter((entry) => Number(entry.attempt) < attempt));
  }
  writeRetryProjectSummary(workspace, { moduleStatus, attempts, failCount, failSummaries: resolvedFailSummaries });
  workspace.__testDecodedBusterTasks = [
    ...taskAttempts.map((attempt) => busterTask(workspace, { attempt })),
    ...(includeFinalGateTask ? [busterTask(workspace, { type: 'gate_test', attempt: 1 })] : []),
  ];
  return { scenario, workspace };
}

function writeMultiModuleProjectSummary(workspace, moduleStats) {
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'project-summary.json'), {
    pipeline: { moduleStats },
  });
}

function writeModuleBusterOutput(workspace, moduleId, status = 'PASS') {
  writeJson(path.join(workspace.swarmDir, 'modules', moduleId, 'buster-output.json'), {
    artifact_type: 'buster_output',
    status,
    run_id: workspace.runId,
    project: workspace.projectName,
    module_id: moduleId,
    module: moduleId,
    results: [{ suite: 'unit', status }],
  });
}

function createMultiModuleWorkspace({
  scenarioId = 'multi-module-independent-success',
  dependency = false,
  retry = false,
  finalGateFailure = false,
  omitSecondTask = false,
  startSecondAfterFirstPass = false,
  includeSecondStart = true,
} = {}) {
  const scenario = resolveRealE2EScenario(scenarioId);
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'modules.01-nginx.depends_on': [],
      'modules.02-nginx.depends_on': dependency ? ['01-nginx'] : [],
      'real_e2e.multi_module.modules': ['01-nginx', '02-nginx'],
    },
  });
  const lifecyclePath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'lifecycle', 'canonical-events.jsonl');
  const events = retry
    ? [
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.started', 1),
      ...(includeSecondStart && !dependency && !startSecondAfterFirstPass ? [moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.started', 1)] : []),
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.testing_started', 1),
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.failed', 1),
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.started', 2),
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.testing_started', 2),
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.passed', 2),
      ...(includeSecondStart && (dependency || startSecondAfterFirstPass) ? [moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.started', 1)] : []),
      ...(includeSecondStart ? [
        moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.testing_started', 1),
        moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.passed', 1),
      ] : []),
    ]
    : [
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.started', 1),
      ...(includeSecondStart && !dependency && !startSecondAfterFirstPass ? [moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.started', 1)] : []),
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.testing_started', 1),
      moduleAttemptEventFor(workspace, '01-nginx', 'module_attempt.passed', 1),
      ...(includeSecondStart && (dependency || startSecondAfterFirstPass) ? [moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.started', 1)] : []),
      ...(includeSecondStart ? [
        moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.testing_started', 1),
        moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.passed', 1),
      ] : []),
    ];
  for (const event of events) appendJsonl(lifecyclePath, event);
  writeLifecycleReadModels(
    workspace,
    { status: 'PASS', fail_count: retry ? 1 : 0, current_attempt: retry ? 2 : 1 },
    { '02-nginx': { status: 'PASS', fail_count: 0, current_attempt: 1 } },
  );
  writeMultiModuleProjectSummary(workspace, [
    { id: '01-nginx', status: 'PASS', attempts: retry ? 2 : 1, failCount: retry ? 1 : 0 },
    { id: '02-nginx', status: 'PASS', attempts: 1, failCount: 0 },
  ]);
  writeModuleBusterOutput(workspace, '01-nginx');
  writeModuleBusterOutput(workspace, '02-nginx');
  workspace.__testDecodedBusterTasks = [
    busterTask(workspace, { moduleId: '01-nginx', attempt: 1 }),
    ...(retry ? [busterTask(workspace, { moduleId: '01-nginx', attempt: 2 })] : []),
    ...(omitSecondTask ? [] : [busterTask(workspace, { moduleId: '02-nginx', attempt: 1 })]),
    busterTask(workspace, { type: 'gate_test', attempt: 1 }),
  ];
  if (finalGateFailure) {
    writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
      code: 'multi_module_final_gate_one_module_failure',
      moduleId: 'final-buster',
      gateId: 'final-buster',
      marker: 'REAL_E2E_EXPECTED_MULTI_MODULE_FINAL_GATE_MODULE_02_FAILURE',
    }));
  }
  return { scenario, workspace };
}

function pipelineRunStarted(workspace) {
  return {
    event_id: `evt-${++eventCounter}`,
    type: 'pipeline_run.started',
    refs: { run_id: workspace.runId, project: workspace.projectName },
    data: {
      modules: [{ module_id: '01-nginx' }],
      gates: [
        { gate_id: 'module-review', gate_type: 'review' },
        { gate_id: 'operator-approval', gate_type: 'approval' },
        { gate_id: 'final-buster', gate_type: 'buster' },
        { gate_id: 'final-review', gate_type: 'review' },
      ],
    },
  };
}

function pipelineRunCompleted(workspace) {
  return {
    event_id: `evt-${++eventCounter}`,
    type: 'pipeline_run.completed',
    refs: { run_id: workspace.runId, project: workspace.projectName },
    data: {
      terminal_status: 'succeeded',
      reason: 'PIPELINE_COMPLETE',
    },
  };
}

function crashInjectedEvent(workspace, scenario) {
  return {
    event_id: `evt-${++eventCounter}`,
    type: 'real_e2e.crash_injected',
    refs: {
      run_id: workspace.runId,
      project: workspace.projectName,
      module_id: '01-nginx',
    },
    data: {
      point: scenario.crashPoint,
      crash_exit_code: 86,
      scenario: scenario.id,
      step_type: 'module',
      step_id: '01-nginx',
      attempt: 1,
    },
  };
}

function pipelineCheckpointEvent(workspace, scenario) {
  return {
    event_id: `evt-${++eventCounter}`,
    type: 'pipeline.checkpoint',
    refs: {
      run_id: workspace.runId,
      project: workspace.projectName,
      module_id: '01-nginx',
    },
    data: {
      point: scenario.crashPoint,
      details: { module_id: '01-nginx', attempt: 1 },
    },
  };
}

function writeCrashMarker(workspace, scenario, overrides = {}) {
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'real-e2e-crash-injection', `${scenario.crashPoint}.json`), {
    schema_version: 'real_e2e_crash_injection.v1',
    artifact_type: 'real_e2e_crash_injection',
    point: scenario.crashPoint,
    requested_point: scenario.crashPoint,
    run_id: workspace.runId,
    project: workspace.projectName,
    scenario: scenario.id,
    crashed_at: '2026-06-28T00:00:00.000Z',
    exit_code: 86,
    details: { module_id: '01-nginx', attempt: 1 },
    ...overrides,
  });
}

function writeCrashSummaryArtifacts(workspace, overrides = {}) {
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'summary.json'), {
    run_id: workspace.runId,
    project: workspace.projectName,
    terminal_status: 'succeeded',
    governance: {},
    telemetry_stream_key: `pipeline:telemetry:${workspace.projectName}:${workspace.runId}`,
    ...overrides.summary,
  });
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'latest.json'), {
    run_id: workspace.runId,
    status: 'completed',
    terminal_status: 'succeeded',
    telemetry_stream_key: `pipeline:telemetry:${workspace.projectName}:${workspace.runId}`,
    run_dir: `runs/${workspace.runId}`,
    path: `runs/${workspace.runId}`,
    pipeline_jsonl: `runs/${workspace.runId}/pipeline.jsonl`,
    summary_json: `runs/${workspace.runId}/summary.json`,
    authority: { source: 'test' },
    ...overrides.latest,
  });
}

function createCrashResumeWorkspace({
  scenarioId = 'crash-before-buster-handoff',
  retry = false,
  duplicateCompleted = false,
  markerOverrides = {},
  omitFinalGateTask = false,
  omitCheckpoint = false,
  latestOverrides = {},
} = {}) {
  const scenario = resolveRealE2EScenario(scenarioId);
  const workspace = createWorkspace(scenario);
  const lifecyclePath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'lifecycle', 'canonical-events.jsonl');
  appendJsonl(lifecyclePath, pipelineRunStarted(workspace));
  if (!omitCheckpoint) appendJsonl(lifecyclePath, pipelineCheckpointEvent(workspace, scenario));
  appendJsonl(lifecyclePath, crashInjectedEvent(workspace, scenario));
  writeRetryLifecycle(workspace, {
    passedAttempt: retry ? 2 : 1,
    failedAttempts: retry ? [1] : [],
    failedAttemptsWithTesting: retry ? [1] : [],
  });
  appendJsonl(lifecyclePath, pipelineRunCompleted(workspace));
  if (duplicateCompleted) appendJsonl(lifecyclePath, pipelineRunCompleted(workspace));
  const failSummaries = retry ? [{
    attempt: 1,
    phase: 'buster',
    failure_class: 'pretest_code',
    summary: 'NO_SUBAGENT: unit: FAIL - REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE',
  }] : [];
  writeLifecycleReadModels(workspace, {
    status: 'PASS',
    fail_count: retry ? 1 : 0,
    current_attempt: retry ? 2 : 1,
    fail_summaries: failSummaries,
  });
  if (retry) {
    writeRetryForgePrompt(workspace, 2, failSummaries);
    writeRetryProjectSummary(workspace, {
      moduleStatus: 'PASS',
      attempts: 2,
      failCount: 1,
      failSummaries,
    });
  }
  writeCrashMarker(workspace, scenario, markerOverrides);
  writeCrashSummaryArtifacts(workspace, { latest: latestOverrides });
  workspace.__testDecodedBusterTasks = [
    ...(retry ? [busterTask(workspace, { attempt: 1 }), busterTask(workspace, { attempt: 2 })] : [busterTask(workspace, { attempt: 1 })]),
    ...(omitFinalGateTask ? [] : [busterTask(workspace, { type: 'gate_test', attempt: 1 })]),
  ];
  return { scenario, workspace };
}

function applyContractSetupFixtures(workspace, contract) {
  for (const [relativePath, expectedLine] of Object.entries(contract.setup?.file_exact_line || {})) {
    const filePath = path.join(workspace.projectSrc, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${expectedLine}\n`);
  }
}

function contractTerminalEvent(workspace, contract, overrides = {}) {
  const terminal = contract.terminal;
  const data = {
    step_type: terminal.step_type,
    step_id: terminal.step_id,
    terminal_status: terminal.terminal_status,
    ...(terminal.reason ? { reason: terminal.reason } : {}),
    ...(!terminal.reason && terminal.reason_contains ? { halt_reason: terminal.reason_contains } : {}),
    failure_class: terminal.failure_class,
    ...overrides,
  };
  return terminal.event_type === 'pipeline.halted'
    ? pipelineHalted(workspace, data)
    : pipelineRunHalted(workspace, data);
}

function appendContractTerminalEvent(workspace, scenario, overrides = {}) {
  const contract = expectedFailureContractForScenario(scenario);
  const terminalPath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'lifecycle', 'canonical-events.jsonl');
  appendJsonl(terminalPath, contractTerminalEvent(workspace, contract, overrides));
  return contract;
}

function createFailureContractWorkspace(scenario, { terminalOverrides = {} } = {}) {
  const contract = expectedFailureContractForScenario(scenario);
  const workspace = createWorkspace(scenario, {
    progressFields: {
      ...(contract.setup?.progress || {}),
      ...(contract.setup?.progress_path_suffix
        ? Object.fromEntries(Object.entries(contract.setup.progress_path_suffix).map(([field, suffix]) => [field, `/tmp/generated${suffix}`]))
        : {}),
    },
    configFields: {
      ...(contract.setup?.config || {}),
      ...(contract.setup?.config_path_suffix
        ? Object.fromEntries(Object.entries(contract.setup.config_path_suffix).map(([field, suffix]) => [field, `/tmp/generated${suffix}`]))
        : {}),
    },
  });
  applyContractSetupFixtures(workspace, contract);
  appendJsonl(
    contract.terminal.event_type === 'pipeline.halted'
      ? path.join(workspace.swarmDir, 'logs', 'pipeline', 'pipeline.jsonl')
      : path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'lifecycle', 'canonical-events.jsonl'),
    contractTerminalEvent(workspace, contract, terminalOverrides),
  );
  return workspace;
}

function pipelineRunHalted(workspace, data) {
  return {
    event_id: `evt-${++eventCounter}`,
    type: 'pipeline_run.halted',
    refs: { run_id: workspace.runId, project: workspace.projectName },
    data,
  };
}

function pipelineHalted(workspace, data) {
  return {
    event_id: `evt-${++eventCounter}`,
    v: 1,
    type: 'pipeline.halted',
    run_id: workspace.runId,
    project: workspace.projectName,
    source: 'pipeline',
    ...data,
  };
}

function writeMalformedPublication(workspace, scenario, { target = null, raw = null, manifestOverrides = {} } = {}) {
  const config = malformedOutputScenarioConfig(scenario.id);
  const actualTarget = target || config.target;
  const actualRaw = raw ?? config.raw;
  const targetPath = path.join(workspace.swarmDir, actualTarget);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, actualRaw);

  const manifestPath = path.join(workspace.swarmDir, 'logs', 'real-e2e', `malformed-output-publisher-${scenario.id}.json`);
  const manifest = {
    artifact_type: 'real_e2e_malformed_output_publication',
    scenario: scenario.id,
    run_id: workspace.runId,
    project: workspace.projectName,
    trigger: config.trigger,
    target: config.target,
    target_artifact_type: config.artifactType,
    raw_base64: Buffer.from(config.raw).toString('base64'),
    raw_sha256: crypto.createHash('sha256').update(config.raw).digest('hex'),
    raw_bytes: Buffer.byteLength(config.raw, 'utf8'),
    published_at: '2026-06-28T00:00:00.000Z',
    ...manifestOverrides,
  };
  writeJson(manifestPath, manifest);
  return { config, manifestPath, targetPath };
}

function busterFailureArtifact(workspace, {
  code = 'buster_module_failure',
  moduleId = '01-nginx',
  gateId = null,
  suite = 'unit',
  failedCheck = null,
  marker = 'REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE',
  reasonPrefix = 'NO_SUBAGENT:',
} = {}) {
  const findingMessage = failedCheck
    ? `${failedCheck} failed: ${marker}`
    : marker;
  return {
    artifact_type: 'buster_output',
    status: 'FAIL',
    run_id: workspace.runId,
    project: workspace.projectName,
    module_id: moduleId,
    ...(gateId ? { gate_id: gateId } : {}),
    reason: `${reasonPrefix} ${suite}: FAIL - ${findingMessage}`,
    summary: `${suite}: FAIL - ${findingMessage}`,
    completed_at: '2026-06-28T00:00:00.000Z',
    suites: {
      [suite]: {
        suite,
        status: 'FAIL',
        critical: true,
        checks_total: failedCheck ? 1 : 0,
        checks_passed: 0,
        checks_failed: failedCheck ? 1 : 0,
        findings: [{ severity: 'critical', message: findingMessage, rule: failedCheck, element: null, file: null, line: null }],
        metadata: failedCheck ? {
          checks: [{ name: failedCheck, passed: false, detail: findingMessage }],
          top_finding: findingMessage,
        } : {},
      },
    },
    real_e2e_expected_evidence: code,
  };
}

function createMalformedWorkspace(scenarioId) {
  const scenario = resolveRealE2EScenario(scenarioId);
  if (scenario.id === 'forge-malformed-output') {
    return {
      scenario,
      workspace: createWorkspace(scenario, {
        progressFields: {
          'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_FORGE_MALFORMED_TIMEOUT_MINUTES || 15),
        },
        events: [
          pipelineRunHalted({
            runId: 'real-e2e-run-1',
            projectName: 'real-e2e-project',
          }, {
            step_type: 'module',
            step_id: '01-nginx',
            terminal_status: 'failed',
            terminal_decision: { reasonCode: 'invalid_contract' },
          }),
        ],
      }),
    };
  }
  if (scenario.id === 'echo-malformed-output') {
    return {
      scenario,
      workspace: createWorkspace(scenario, {
        progressFields: {
          'gates.module-review.timeout_minutes': Number(process.env.REAL_E2E_ECHO_MALFORMED_TIMEOUT_MINUTES || 0.1),
        },
        events: [
          pipelineRunHalted({
            runId: 'real-e2e-run-1',
            projectName: 'real-e2e-project',
          }, {
            step_type: 'gate',
            step_id: 'module-review',
            terminal_status: 'failed',
            terminal_decision: { reasonCode: 'invalid_contract' },
          }),
        ],
      }),
    };
  }
  throw new Error(`unsupported test malformed scenario: ${scenarioId}`);
}

test('every expected nonzero scenario has an explicit failure contract', () => {
  const missing = listRealE2EScenarioIds()
    .map((id) => resolveRealE2EScenario(id))
    .filter((scenario) => scenario.expectedPipelineExit === 'nonzero')
    .filter((scenario) => {
      try {
        const contract = expectedFailureContractForScenario(scenario);
        return !contract?.terminal?.event_type;
      } catch {
        return true;
      }
    })
    .map((scenario) => scenario.id);

  assert.deepEqual(missing, []);
});

test('Buster module failure setup requires the exact configured failing command', async () => {
  const scenario = resolveRealE2EScenario('buster-module-failure');
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'modules.01-nginx.test_config.unit.test_cmd': 'echo REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE',
    },
    events: [
      pipelineRunHalted({
        runId: 'real-e2e-run-1',
        projectName: 'real-e2e-project',
      }, {
        step_type: 'module',
        step_id: '01-nginx',
        terminal_status: 'failed',
        halt_reason: 'failed',
      }),
    ],
  });
  writeJson(path.join(workspace.swarmDir, 'modules', '01-nginx', 'buster-output.json'), busterFailureArtifact(workspace));

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  const setup = evidence.failures.find((failure) => failure.code === 'expected_failure_setup_contract');
  assert.equal(setup.reason, 'REAL_E2E_FAILURE_SETUP_CONTRACT_MISMATCH');
  assert.deepEqual(setup.field_failures, [{
    field: 'modules.01-nginx.test_config.unit.test_cmd',
    expected: expectedFailUnitCommand('REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE'),
    actual: 'echo REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE',
  }]);
});

test('Buster final gate failure setup requires the exact configured failing command', async () => {
  const scenario = resolveRealE2EScenario('buster-gate-failure');
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'gates.final-buster.test_config.unit.test_cmd': 'echo REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE',
    },
    events: [
      pipelineRunHalted({
        runId: 'real-e2e-run-1',
        projectName: 'real-e2e-project',
      }, {
        step_type: 'gate',
        step_id: 'final-buster',
        terminal_status: 'action_required',
        halt_reason: 'verdict_fail',
      }),
    ],
  });
  writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
    code: 'buster_gate_failure',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    marker: 'REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE',
  }));

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  const setup = evidence.failures.find((failure) => failure.code === 'expected_failure_setup_contract');
  assert.equal(setup.reason, 'REAL_E2E_FAILURE_SETUP_CONTRACT_MISMATCH');
  assert.deepEqual(setup.field_failures, [{
    field: 'gates.final-buster.test_config.unit.test_cmd',
    expected: expectedFailUnitCommand('REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE'),
    actual: 'echo REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE',
  }]);
});

test('Buster final gate failure accepts expected marker in unit finding', () => {
  const scenario = resolveRealE2EScenario('buster-gate-failure');
  const workspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
    code: 'buster_gate_failure',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    marker: 'REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE',
  }));

  const evidence = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    workspace,
    'buster-test/FINAL-BUSTER-RESULT.json',
    'buster_gate_failure',
    { module_id: 'final-buster', gate_id: 'final-buster' },
  );

  assert.equal(evidence.ok, true);
});

test('failure evidence accepts needs-Nova handoff only with Gateway session delivery receipt', async () => {
  const scenario = resolveRealE2EScenario('needs-nova-code-failure');
  const workspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(workspace.swarmDir, 'modules', '01-nginx', 'buster-output.json'), busterFailureArtifact(workspace, {
    code: 'needs_nova_code_failure',
    marker: 'REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE',
  }));
  appendJsonl(path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'nova-injections.jsonl'), {
    run_id: workspace.runId,
    status: 'ok',
    delivery_surface: 'gateway_sessions_send',
    delivery_status: 'gateway_sessions_send_delivered',
    delivery_content_known: true,
    delivery_acknowledged: true,
    session_key: 'agent:main:discord:channel:channel-1',
    delivery_session_key: 'agent:main:discord:channel:channel-1',
    turn_id: 'turn-1',
    step_type: 'module',
    step_id: '01-nginx',
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
  const ack = evidence.checks.find((check) => check.code === 'nova_handoff_delivery_ack');
  assert.equal(ack.session_key, 'agent:main:discord:channel:channel-1');
  assert.equal(ack.turn_id, 'turn-1');
  assert.match(ack.receipt_path, /nova-injections\.jsonl$/);
});

test('failure evidence rejects needs-Nova handoff without Gateway session delivery receipt', async () => {
  const scenario = resolveRealE2EScenario('needs-nova-code-failure');
  const workspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(workspace.swarmDir, 'modules', '01-nginx', 'buster-output.json'), busterFailureArtifact(workspace, {
    code: 'needs_nova_code_failure',
    marker: 'REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE',
  }));
  appendJsonl(path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'nova-injections.jsonl'), {
    run_id: workspace.runId,
    status: 'failed',
    delivery_surface: 'gateway_sessions_send',
    delivery_status: 'gateway_sessions_send_failed',
    delivery_content_known: true,
    delivery_acknowledged: false,
    step_type: 'module',
    step_id: '01-nginx',
    error: 'Gateway sessions_send delivery receipt missing',
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  const ack = evidence.failures.find((failure) => failure.code === 'nova_handoff_delivery_ack');
  assert.equal(ack.reason, 'REAL_E2E_NOVA_HANDOFF_DELIVERY_UNACKNOWLEDGED');
});

test('Buster infra setup accepts typed Buster infra evidence', async () => {
  const scenario = resolveRealE2EScenario('buster-module-infra-failure');
  const workspace = createWorkspace(scenario, {
    events: [
      pipelineRunHalted({
        runId: 'real-e2e-run-1',
        projectName: 'real-e2e-project',
      }, {
        step_type: 'module',
        step_id: '01-nginx',
        terminal_status: 'blocked',
        halt_reason: 'infra_error',
      }),
      moduleAttemptEventFor({
        runId: 'real-e2e-run-1',
        projectName: 'real-e2e-project',
      }, '01-nginx', 'module_attempt.blocked', 1, {
        blocked_phase: 'buster',
        reason: 'Buster infrastructure issue — Forge output preserved',
        completion: {
          phase: 'buster',
          status: 'BLOCKED',
          metadata: {
            failure_class: 'infra_error',
            reason: 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE',
          },
        },
      }),
    ],
  });
  writeLifecycleReadModels(workspace, {
    status: 'BLOCKED',
    current_attempt: 1,
    fail_count: 1,
    blocked_phase: 'buster',
    validation: {
      attempt: 1,
      delivery_lint_passed: true,
      pre_check_passed: false,
    },
    fail_summaries: [{
      attempt: 1,
      phase: 'buster',
      failure_class: 'infra_error',
      summary: 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE',
    }],
  });
  writeJson(path.join(workspace.swarmDir, 'modules', '01-nginx', 'buster-output.json'), busterFailureArtifact(workspace, {
    code: 'buster_module_infra_failure',
    suite: 'infra',
    marker: 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE',
    reasonPrefix: 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE',
  }));

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
});

test('Buster failure artifact validator rejects missing and stale artifacts', () => {
  const scenario = resolveRealE2EScenario('buster-module-failure');
  const missingWorkspace = createFailureContractWorkspace(scenario);

  const missing = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    missingWorkspace,
    'modules/01-nginx/buster-output.json',
    'buster_module_failure',
    { module_id: '01-nginx' },
  );

  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'REAL_E2E_MISSING_ARTIFACT');

  const staleWorkspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(staleWorkspace.swarmDir, 'modules', '01-nginx', 'buster-output.json'), {
    ...busterFailureArtifact(staleWorkspace),
    run_id: 'stale-run',
  });

  const stale = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    staleWorkspace,
    'modules/01-nginx/buster-output.json',
    'buster_module_failure',
    { module_id: '01-nginx' },
  );

  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'REAL_E2E_BUSTER_FAILURE_ARTIFACT_FIELD_MISMATCH');
  assert.deepEqual(stale.field_failures, [{
    field: 'run_id',
    expected: staleWorkspace.runId,
    actual: 'stale-run',
  }]);
});

test('Buster failure artifact validator requires exact scenario reason contract', () => {
  const unreachableScenario = resolveRealE2EScenario('tailscale-preview-url-unreachable');
  const unreachableWorkspace = createFailureContractWorkspace(unreachableScenario);
  writeJson(path.join(unreachableWorkspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(unreachableWorkspace, {
    code: 'tailscale_preview_url_unreachable',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    suite: 'tailscale-preview',
    failedCheck: 'preview-health-check',
    marker: 'preview-health-check failed',
  }));

  const unreachable = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    unreachableWorkspace,
    'buster-test/FINAL-BUSTER-RESULT.json',
    'tailscale_preview_url_unreachable',
    { module_id: 'final-buster', gate_id: 'final-buster' },
  );

  assert.equal(unreachable.ok, true);
  assert.equal(unreachable.reason_contract.failed_check, 'preview-health-check');

  const scenario = resolveRealE2EScenario('tailscale-preview-wrong-deployment');
  const workspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
    code: 'tailscale_preview_wrong_deployment',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    suite: 'k8s',
    failedCheck: 'health-check',
    marker: 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER',
  }));

  const exact = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    workspace,
    'buster-test/FINAL-BUSTER-RESULT.json',
    'tailscale_preview_wrong_deployment',
    { module_id: 'final-buster', gate_id: 'final-buster' },
  );

  assert.equal(exact.ok, true);
  assert.equal(exact.reason_contract.failed_check, 'health-check');

  writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
    code: 'tailscale_preview_wrong_deployment',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    suite: 'k8s',
    failedCheck: 'preview-url',
    marker: 'real-e2e-missing-operator',
  }));

  const wrongRootCause = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    workspace,
    'buster-test/FINAL-BUSTER-RESULT.json',
    'tailscale_preview_wrong_deployment',
    { module_id: 'final-buster', gate_id: 'final-buster' },
  );

  assert.equal(wrongRootCause.ok, false);
  assert.equal(wrongRootCause.reason, 'REAL_E2E_BUSTER_FAILURE_CHECK_MISMATCH');
  assert.deepEqual(wrongRootCause.actual_failed_checks, ['preview-url']);
});

test('Buster failure artifact validator requires explicit missing tailnet evidence', () => {
  const scenario = resolveRealE2EScenario('tailscale-preview-url-unreachable');
  const workspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
    code: 'tailscale_unavailable',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    suite: 'tailscale-preview',
    failedCheck: 'dns-resolve',
    marker: 'real-e2e-missing-operator.invalid',
  }));

  const exact = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    workspace,
    'buster-test/FINAL-BUSTER-RESULT.json',
    'tailscale_unavailable',
    { module_id: 'final-buster', gate_id: 'final-buster' },
  );

  assert.equal(exact.ok, true);

  writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
    code: 'tailscale_unavailable',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    suite: 'k8s',
    failedCheck: 'preview-url',
    marker: 'real-e2e-missing-operator',
  }));

  const staleRootCause = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    workspace,
    'buster-test/FINAL-BUSTER-RESULT.json',
    'tailscale_unavailable',
    { module_id: 'final-buster', gate_id: 'final-buster' },
  );

  assert.equal(staleRootCause.ok, false);
  assert.equal(staleRootCause.reason, 'REAL_E2E_BUSTER_FAILURE_SUITE_MISSING');
  assert.equal(staleRootCause.expected_suite, 'tailscale-preview');
});

test('Buster failure artifact validator rejects generic final gate failure for registry scenario', () => {
  const scenario = resolveRealE2EScenario('registry-pull-failure');
  const workspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
    code: 'registry_pull_failure',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    suite: 'unit',
    marker: 'REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE',
  }));

  const evidence = evidenceSchemaTestHooks.requireBusterFailureArtifact(
    workspace,
    'buster-test/FINAL-BUSTER-RESULT.json',
    'registry_pull_failure',
    { module_id: 'final-buster', gate_id: 'final-buster' },
  );

  assert.equal(evidence.ok, false);
  assert.equal(evidence.reason, 'REAL_E2E_BUSTER_FAILURE_SUITE_MISSING');
  assert.equal(evidence.expected_suite, 'k8s');
});

test('phase 5 Buster config failure scenarios require exact suite root causes', () => {
  const cases = [
    {
      scenarioId: 'registry-pull-failure',
      code: 'registry_credentials_missing',
      suite: 'manifest',
      marker: 'Container uses private registry (registry.example.invalid/private) but imagePullSecrets is not defined',
    },
    {
      scenarioId: 'tailscale-preview-url-unreachable',
      code: 'tailscale_preview_credentials_missing',
      suite: 'k8s',
      failedCheck: 'namespace-lease',
      marker: 'real-e2e-missing-tailscale-preview-credentials',
    },
    {
      scenarioId: 'registry-pull-failure',
      code: 'required_env_missing',
      suite: 'manifest',
      marker: 'Required env var "REAL_E2E_REQUIRED_CONFIG_TOKEN" not found in container spec (env or envFrom)',
    },
  ];

  for (const item of cases) {
    const scenario = resolveRealE2EScenario(item.scenarioId);
    const workspace = createFailureContractWorkspace(scenario);
    writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
      code: item.code,
      moduleId: 'final-buster',
      gateId: 'final-buster',
      suite: item.suite,
      failedCheck: item.failedCheck || null,
      marker: item.marker,
    }));

    const exact = evidenceSchemaTestHooks.requireBusterFailureArtifact(
      workspace,
      'buster-test/FINAL-BUSTER-RESULT.json',
      item.code,
      { module_id: 'final-buster', gate_id: 'final-buster' },
    );
    assert.equal(exact.ok, true, item.scenarioId);

    writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
      code: item.code,
      moduleId: 'final-buster',
      gateId: 'final-buster',
      suite: 'unit',
      marker: 'REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE',
    }));

    const wrongRootCause = evidenceSchemaTestHooks.requireBusterFailureArtifact(
      workspace,
      'buster-test/FINAL-BUSTER-RESULT.json',
      item.code,
      { module_id: 'final-buster', gate_id: 'final-buster' },
    );
    assert.equal(wrongRootCause.ok, false, item.scenarioId);
  }
});

test('fatal config scenarios fail if clean downstream success artifacts appear', async () => {
  const scenario = resolveRealE2EScenario('k8s-context-invalid');
  const workspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'), busterFailureArtifact(workspace, {
    code: 'required_env_missing',
    moduleId: 'final-buster',
    gateId: 'final-buster',
    suite: 'manifest',
    marker: 'Required env var "REAL_E2E_REQUIRED_CONFIG_TOKEN" not found in container spec (env or envFrom)',
  }));
  writeJson(path.join(workspace.swarmDir, 'logs', 'echo-review', 'FINAL-REVIEW.json'), {
    ...passEchoReview(workspace, 'final-review'),
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  const downstreamFailure = evidence.failures.find((failure) => failure.code === 'fatal_config_no_clean_success');
  assert.equal(downstreamFailure.reason, 'REAL_E2E_FATAL_CONFIG_DOWNSTREAM_SUCCESS_OBSERVED');
});

test('discord config failures require exact observability degraded contract', async () => {
  const scenario = resolveRealE2EScenario('discord-unavailable');
  const workspace = createWorkspace(scenario);
  appendJsonl(path.join(workspace.swarmDir, 'logs', 'pipeline', 'pipeline.jsonl'), {
    event_id: 'evt-discord-missing',
    v: 1,
    type: 'observability.degraded',
    run_id: workspace.runId,
    project: workspace.projectName,
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_url_missing',
  });

  const exact = evidenceSchemaTestHooks.requireObservabilityDegradedEvidence(workspace, scenario, {
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_url_missing',
  });
  assert.equal(exact.ok, true);

  const missingWorkspace = createWorkspace(scenario);
  const missing = evidenceSchemaTestHooks.requireObservabilityDegradedEvidence(missingWorkspace, scenario, {
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_url_missing',
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'REAL_E2E_OBSERVABILITY_DEGRADED_CONTRACT_MISSING');
});

test('retry fix-cycle evidence requires ordered failed attempt, retry attempt, task attempts, and final gate', async () => {
  const { workspace } = createRetryWorkspace();

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.code, 'success_after_retry');
  const taskStream = evidence.checks.find((check) => check.code === 'retry_buster_task_stream');
  assert.deepEqual(taskStream.ordered_tasks.map((task) => task.name), [
    'module_test:01-nginx:attempt-1',
    'module_test:01-nginx:attempt-2',
    'gate_test:final-buster:after-retry',
  ]);
});

test('retry fix-cycle Buster task order uses pipeline run id, not seed workspace id', async () => {
  const { workspace } = createRetryWorkspace({ pipelineRunId: 'run-product-1' });

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, true);
  const taskStream = evidence.checks.find((check) => check.code === 'retry_buster_task_stream');
  assert.equal(taskStream.pipeline_run_id, 'run-product-1');
  assert.equal(taskStream.seed_run_id, workspace.runId);
  assert.deepEqual(taskStream.ordered_tasks.map((task) => task.name), [
    'module_test:01-nginx:attempt-1',
    'module_test:01-nginx:attempt-2',
    'gate_test:final-buster:after-retry',
  ]);
});

test('retry fix-cycle Buster task order prefers payload run id over restored stream envelope id', async () => {
  const { workspace } = createRetryWorkspace({ pipelineRunId: 'run-product-1' });
  for (const record of workspace.__testDecodedBusterTasks) {
    record.entry.run_id = workspace.runId;
  }

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, true);
  const taskStream = evidence.checks.find((check) => check.code === 'retry_buster_task_stream');
  assert.equal(taskStream.pipeline_run_id, 'run-product-1');
  assert.equal(taskStream.seed_run_id, workspace.runId);
});

test('multi-retry success evidence requires two failed attempts before third attempt passes', async () => {
  const failureMarkers = [
    'REAL_E2E_EXPECTED_MULTI_RETRY_FORGE_CODE_FAILURE_ATTEMPT_1',
    'REAL_E2E_EXPECTED_MULTI_RETRY_FORGE_CODE_FAILURE_ATTEMPT_2',
  ];
  const { workspace } = createRetryWorkspace({
    scenarioId: 'forge-retry-then-success',
    attempts: 3,
    failCount: 2,
    currentAttempt: 3,
    failedAttempts: [1, 2],
    failedAttemptsWithTesting: [1, 2],
    passedAttempt: 3,
    taskAttempts: [1, 2, 3],
    failSummaries: failureMarkers.map((marker, index) => ({
      attempt: index + 1,
      phase: 'buster',
      failure_class: 'pretest_code',
      summary: `NO_SUBAGENT: unit: FAIL - ${marker}`,
    })),
  });

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_multi_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 2,
    expectedAttempts: 3,
    expectedCurrentAttempt: 3,
    expectedFailedAttempts: [1, 2],
    failedAttemptsWithTesting: [1, 2],
    passedAttempt: 3,
    expectedModuleTaskAttempts: [1, 2, 3],
    expectFinalGateTask: true,
    expectProjectSummary: true,
    requiredFailureMarkers: failureMarkers,
    promptContracts: [
      { attempt: 2, requiredFailureMarkers: [failureMarkers[0]] },
      { attempt: 3, requiredFailureMarkers: failureMarkers },
    ],
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.code, 'success_after_multi_retry');
  const taskStream = evidence.checks.find((check) => check.code === 'retry_buster_task_stream');
  assert.deepEqual(taskStream.ordered_tasks.map((task) => task.name), [
    'module_test:01-nginx:attempt-1',
    'module_test:01-nginx:attempt-2',
    'module_test:01-nginx:attempt-3',
    'gate_test:final-buster:after-retry',
  ]);
});

test('multi-retry success evidence rejects missing third Buster attempt', async () => {
  const failureMarkers = [
    'REAL_E2E_EXPECTED_MULTI_RETRY_FORGE_CODE_FAILURE_ATTEMPT_1',
    'REAL_E2E_EXPECTED_MULTI_RETRY_FORGE_CODE_FAILURE_ATTEMPT_2',
  ];
  const { workspace } = createRetryWorkspace({
    scenarioId: 'forge-retry-then-success',
    attempts: 3,
    failCount: 2,
    currentAttempt: 3,
    failedAttempts: [1, 2],
    failedAttemptsWithTesting: [1, 2],
    passedAttempt: 3,
    taskAttempts: [1, 2],
    failSummaries: failureMarkers.map((marker, index) => ({
      attempt: index + 1,
      phase: 'buster',
      failure_class: 'pretest_code',
      summary: `NO_SUBAGENT: unit: FAIL - ${marker}`,
    })),
  });

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_multi_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 2,
    expectedAttempts: 3,
    expectedCurrentAttempt: 3,
    expectedFailedAttempts: [1, 2],
    failedAttemptsWithTesting: [1, 2],
    passedAttempt: 3,
    expectedModuleTaskAttempts: [1, 2, 3],
    expectFinalGateTask: true,
    expectProjectSummary: true,
    requiredFailureMarkers: failureMarkers,
    promptContracts: [
      { attempt: 2, requiredFailureMarkers: [failureMarkers[0]] },
      { attempt: 3, requiredFailureMarkers: failureMarkers },
    ],
  });

  assert.equal(evidence.ok, false);
  const taskFailure = evidence.failures.find((failure) => failure.code === 'retry_buster_task_stream');
  assert.equal(taskFailure.reason, 'REAL_E2E_RETRY_BUSTER_TASK_ORDER_MISMATCH');
  assert.equal(taskFailure.task_order_contract.missing_contract, 'module_test:01-nginx:attempt-3');
});

test('multi-retry success evidence rejects final fix prompt missing second failure context', async () => {
  const failureMarkers = [
    'REAL_E2E_EXPECTED_MULTI_RETRY_FORGE_CODE_FAILURE_ATTEMPT_1',
    'REAL_E2E_EXPECTED_MULTI_RETRY_FORGE_CODE_FAILURE_ATTEMPT_2',
  ];
  const { workspace } = createRetryWorkspace({
    scenarioId: 'forge-retry-then-success',
    attempts: 3,
    failCount: 2,
    currentAttempt: 3,
    failedAttempts: [1, 2],
    failedAttemptsWithTesting: [1, 2],
    passedAttempt: 3,
    taskAttempts: [1, 2, 3],
    failSummaries: failureMarkers.map((marker, index) => ({
      attempt: index + 1,
      phase: 'buster',
      failure_class: 'pretest_code',
      summary: `NO_SUBAGENT: unit: FAIL - ${marker}`,
    })),
  });
  fs.writeFileSync(
    path.join(workspace.swarmDir, 'logs', 'modules', '01-nginx', 'forge-prompt-attempt-3.md'),
    `attempt: 3\n${failureMarkers[0]}\n`,
  );

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_multi_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 2,
    expectedAttempts: 3,
    expectedCurrentAttempt: 3,
    expectedFailedAttempts: [1, 2],
    failedAttemptsWithTesting: [1, 2],
    passedAttempt: 3,
    expectedModuleTaskAttempts: [1, 2, 3],
    expectFinalGateTask: true,
    expectProjectSummary: true,
    requiredFailureMarkers: failureMarkers,
    promptContracts: [
      { attempt: 2, requiredFailureMarkers: [failureMarkers[0]] },
      { attempt: 3, requiredFailureMarkers: failureMarkers },
    ],
  });

  assert.equal(evidence.ok, false);
  const promptFailure = evidence.failures.find((failure) => failure.code === 'retry_forge_fix_prompt');
  assert.equal(promptFailure.reason, 'REAL_E2E_RETRY_FORGE_FIX_PROMPT_MISSING_FAILURE_EVIDENCE');
  assert.deepEqual(promptFailure.missing_failure_markers, [failureMarkers[1]]);
});

test('multi-module evidence accepts independent modules with shared final gate', async () => {
  const { scenario, workspace } = createMultiModuleWorkspace({ scenarioId: 'multi-module-independent-success' });

  const evidence = await evidenceSchemaTestHooks.requireMultiModuleEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
  assert.equal(evidence.code, 'multi_module_success');
  assert.equal(evidence.checks.find((check) => check.code === 'multi_module_parallel_start')?.ok, true);
  assert.equal(evidence.checks.find((check) => check.code === 'multi_module_project_summary')?.module_ids.length, 2);
});

test('multi-module evidence accepts dependency ordering and retry unlock', async () => {
  const dependency = createMultiModuleWorkspace({
    scenarioId: 'multi-module-dependent-success',
    dependency: true,
  });
  const retryUnlock = createMultiModuleWorkspace({
    scenarioId: 'multi-module-dependent-success',
    dependency: true,
    retry: true,
  });

  const dependencyEvidence = await evidenceSchemaTestHooks.requireMultiModuleEvidence(dependency.workspace, dependency.scenario, { dependency: true });
  const retryEvidence = await evidenceSchemaTestHooks.requireMultiModuleEvidence(retryUnlock.workspace, retryUnlock.scenario, {
    dependency: true,
    retryUnlock: true,
  });

  assert.equal(dependencyEvidence.ok, true);
  assert.equal(dependencyEvidence.checks.find((check) => check.code === 'multi_module_dependency_order')?.ok, true);
  assert.equal(retryEvidence.ok, true);
  assert.deepEqual(
    retryEvidence.checks.find((check) => check.code === 'module_lifecycle:01-nginx')?.failed_attempts,
    [1],
  );
});

test('multi-module evidence rejects missing second module Buster task', async () => {
  const { scenario, workspace } = createMultiModuleWorkspace({
    scenarioId: 'multi-module-independent-success',
    omitSecondTask: true,
  });

  const evidence = await evidenceSchemaTestHooks.requireMultiModuleEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  const taskFailure = evidence.failures.find((failure) => failure.code === 'multi_module_buster_task_stream');
  assert.equal(taskFailure.reason, 'REAL_E2E_MULTI_MODULE_BUSTER_TASK_ORDER_MISMATCH');
  assert.equal(taskFailure.task_order_contract.missing_contract, 'module_test:02-nginx:attempt-1');
});

test('multi-module dependency evidence rejects dependent module starting before dependency passes', async () => {
  const { scenario, workspace } = createMultiModuleWorkspace({ scenarioId: 'multi-module-dependent-success' });

  const evidence = await evidenceSchemaTestHooks.requireMultiModuleEvidence(workspace, scenario, { dependency: true });

  assert.equal(evidence.ok, false);
  const orderFailure = evidence.failures.find((failure) => failure.code === 'multi_module_dependency_order');
  assert.equal(orderFailure.reason, 'REAL_E2E_MULTI_MODULE_DEPENDENCY_ORDER_MISMATCH');
});

test('multi-module dependency-blocked evidence rejects downstream module start', async () => {
  const scenario = resolveRealE2EScenario('multi-module-dependency-blocked');
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'modules.01-nginx.depends_on': [],
      'modules.02-nginx.depends_on': ['01-nginx'],
      'real_e2e.multi_module.modules': ['01-nginx', '02-nginx'],
    },
  });
  writeJson(path.join(workspace.swarmDir, 'modules', '01-nginx', 'buster-output.json'), busterFailureArtifact(workspace, {
    code: 'multi_module_dependency_blocked',
    marker: 'REAL_E2E_EXPECTED_MULTI_MODULE_DEPENDENCY_BLOCKED',
  }));

  const accepted = await evidenceSchemaTestHooks.requireMultiModuleDependencyBlockedEvidence(workspace, scenario);
  assert.equal(accepted.ok, true);

  const lifecyclePath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', workspace.runId, 'lifecycle', 'canonical-events.jsonl');
  appendJsonl(lifecyclePath, moduleAttemptEventFor(workspace, '02-nginx', 'module_attempt.started', 1));
  const rejected = await evidenceSchemaTestHooks.requireMultiModuleDependencyBlockedEvidence(workspace, scenario);

  assert.equal(rejected.ok, false);
  assert.equal(
    rejected.failures.find((failure) => failure.code === 'module_not_started:02-nginx')?.reason,
    'REAL_E2E_UNEXPECTED_DOWNSTREAM_MODULE_STARTED',
  );
});

test('retry fix-cycle evidence rejects missing second Buster task', async () => {
  const { workspace } = createRetryWorkspace({ taskAttempts: [1] });

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, false);
  const taskFailure = evidence.failures.find((failure) => failure.code === 'retry_buster_task_stream');
  assert.equal(taskFailure.reason, 'REAL_E2E_RETRY_BUSTER_TASK_ORDER_MISMATCH');
  assert.equal(taskFailure.task_order_contract.missing_contract, 'module_test:01-nginx:attempt-2');
});

test('retry fix-cycle evidence rejects stale retry read model', async () => {
  const { workspace } = createRetryWorkspace({ currentAttempt: 1 });

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, false);
  const readModelFailure = evidence.failures.find((failure) => failure.code === 'retry_lifecycle_read_model');
  assert.equal(readModelFailure.reason, 'REAL_E2E_RETRY_MODULE_READ_MODEL_MISMATCH');
  assert.deepEqual(readModelFailure.field_failures, [{ field: 'current_attempt', expected: 2, actual: 1 }]);
});

test('retry fix-cycle evidence rejects success before failed attempt is recorded', async () => {
  const { workspace } = createRetryWorkspace({ earlyPass: true });

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, false);
  const lifecycleFailure = evidence.failures.find((failure) => failure.code === 'retry_lifecycle_order');
  assert.equal(lifecycleFailure.reason, 'REAL_E2E_RETRY_SUCCESS_BEFORE_FAILED_ATTEMPT_RECORDED');
});

test('retry fix-cycle evidence accepts post-Forge checkpoint boundary for skipped initial start event', async () => {
  const { workspace } = createRetryWorkspace({ skippedStartedAttempts: [1] });
  workspace.restoredCheckpoint = { checkpoint: 'post-forge' };

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, true);
});

test('retry fix-cycle evidence still rejects missing live initial start event without checkpoint authority', async () => {
  const { workspace } = createRetryWorkspace({ skippedStartedAttempts: [1] });

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, false);
  const lifecycleFailure = evidence.failures.find((failure) => failure.code === 'retry_lifecycle_order');
  assert.equal(lifecycleFailure.reason, 'REAL_E2E_RETRY_LIFECYCLE_ORDER_MISMATCH');
  assert.equal(lifecycleFailure.order_contract.missing_contract, 'module_attempt.started:1');
});

test('retry fix-cycle evidence rejects retry prompt without failed-attempt evidence', async () => {
  const { workspace } = createRetryWorkspace();
  fs.writeFileSync(path.join(workspace.swarmDir, 'logs', 'modules', '01-nginx', 'forge-prompt-attempt-2.md'), 'attempt: 2\n');

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
  });

  assert.equal(evidence.ok, false);
  const promptFailure = evidence.failures.find((failure) => failure.code === 'retry_forge_fix_prompt');
  assert.equal(promptFailure.reason, 'REAL_E2E_RETRY_FORGE_FIX_PROMPT_MISSING_FAILURE_EVIDENCE');
});

test('retry fix-cycle evidence rejects stale project summary when final retry summary is required', async () => {
  const { workspace } = createRetryWorkspace();
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'project-summary.json'), {
    pipeline: {
      moduleStats: [{
        id: '01-nginx',
        status: 'PASS',
        attempts: 1,
        failCount: 0,
        failSummaries: [],
      }],
    },
  });

  const evidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'success_after_retry',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: true,
    expectProjectSummary: true,
  });

  assert.equal(evidence.ok, false);
  const summaryFailure = evidence.failures.find((failure) => failure.code === 'retry_project_summary');
  assert.equal(summaryFailure.reason, 'REAL_E2E_RETRY_PROJECT_SUMMARY_MISMATCH');
});

test('retry budget exhausted evidence requires second failed attempt and exact failure marker', async () => {
  const { scenario, workspace } = createRetryWorkspace({
    scenarioId: 'retry-budget-exhausted',
    moduleStatus: 'BLOCKED',
    failCount: 2,
    passedAttempt: null,
    failedAttempts: [1, 2],
    failedAttemptsWithTesting: [1, 2],
    includeFinalGateTask: false,
    failSummaries: [
      {
        attempt: 1,
        phase: 'buster',
        failure_class: 'pretest_code',
        summary: 'NO_SUBAGENT: unit: FAIL - REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED',
      },
      {
        attempt: 2,
        phase: 'buster',
        failure_class: 'pretest_code',
        summary: 'NO_SUBAGENT: unit: FAIL - REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED',
      },
    ],
  });
  appendContractTerminalEvent(workspace, scenario);
  writeJson(path.join(workspace.swarmDir, 'modules', '01-nginx', 'buster-output.json'), busterFailureArtifact(workspace, {
    code: 'retry_budget_exhausted',
    marker: 'REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED',
  }));

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
  assert.equal(evidence.checks.some((check) => check.code === 'retry_budget_exhausted_cycle'), true);
});

test('retry fix malformed output evidence requires deterministic retry artifact normalization', async () => {
  const { scenario, workspace } = createRetryWorkspace({
    scenarioId: 'retry-fix-malformed-output',
    moduleStatus: 'PASS',
    failCount: 1,
    passedAttempt: 2,
    failedAttempts: [1],
    failedAttemptsWithTesting: [1],
    taskAttempts: [1, 2],
    includeFinalGateTask: false,
  });
  const { config } = writeMalformedPublication(workspace, scenario);
  writeJson(path.join(workspace.swarmDir, config.target), {
    artifact_type: 'forge_completion',
    run_id: workspace.runId,
    module_id: '01-nginx',
    attempt: 2,
    status: 'READY_FOR_TESTING',
    summary: 'retry output has a repairable missing envelope',
    evidence: {
      inspected_files: ['Projects/real-pipeline-e2e/src/index.html'],
      consulted_contracts: ['.swarm/contracts/module-outputs/01-nginx.json'],
      implementation_notes: 'the retry output is intentionally missing only canonical envelope identity fields',
    },
    completed_at: '2026-07-15T00:00:00Z',
    normalized: true,
    normalized_fields: ['artifact_type', 'run_id', 'module_id', 'attempt'],
  });

  const retryEvidence = await evidenceSchemaTestHooks.requireRetryFixCycleEvidence(workspace, {
    code: 'retry_fix_malformed_cycle',
    expectedModuleStatus: 'PASS',
    expectedFailCount: 1,
    expectFinalGateTask: false,
  });
  const malformed = evidenceSchemaTestHooks.requireDeterministicMalformedOutputEvidence(workspace, scenario);
  const normalized = evidenceSchemaTestHooks.requireNormalizedForgeCompletionEvidence(workspace, scenario);

  assert.equal(retryEvidence.ok, true);
  assert.equal(malformed.ok, true);
  assert.equal(malformed.payload_kind, 'valid_json_contract_violation');
  assert.equal(malformed.target, config.target);
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.normalized_fields, ['artifact_type', 'run_id', 'module_id', 'attempt']);
});

test('retry bad-output setup contracts require the first unit pass to fail', () => {
  for (const scenarioId of ['retry-fix-malformed-output', 'retry-buster-pass-echo-rejects']) {
    const scenario = resolveRealE2EScenario(scenarioId);
    const contract = expectedFailureContractForScenario(scenario);
    const progress = contract.setup.progress;

    assert.equal(scenario.approvalDecision, 'approve', scenarioId);
    assert.equal(progress['modules.01-nginx.max_fails'], scenarioId === 'retry-fix-malformed-output' ? 3 : 2, scenarioId);
    assert.equal(progress['modules.01-nginx.auto_retry_threshold'], 1, scenarioId);
    assertFailOnceUnitCommand(progress['modules.01-nginx.test_config.unit.test_cmd'], scenarioId);
  }
});

test('retry bad Forge output at the wrong path does not satisfy stale artifact evidence', async () => {
  const { scenario, workspace } = createRetryWorkspace({
    scenarioId: 'retry-fix-malformed-output',
    moduleStatus: 'PASS',
    failCount: 1,
    passedAttempt: 2,
    failedAttempts: [1],
    failedAttemptsWithTesting: [1],
    taskAttempts: [1, 2],
    includeFinalGateTask: false,
  });
  writeMalformedPublication(workspace, scenario, { target: 'modules/01-nginx/stale-forge-completion.json' });

  const evidence = evidenceSchemaTestHooks.requireDeterministicMalformedOutputEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  assert.equal(
    evidence.reason,
    'REAL_E2E_MALFORMED_OUTPUT_RAW_PAYLOAD_MISMATCH',
  );
});

test('retry Buster pass followed by Echo rejection requires retry success before gate terminal', async () => {
  const { scenario, workspace } = createRetryWorkspace({
    scenarioId: 'retry-buster-pass-echo-rejects',
    moduleStatus: 'PASS',
    failCount: 1,
    taskAttempts: [1, 2],
    includeFinalGateTask: false,
  });
  appendContractTerminalEvent(workspace, scenario);

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
  assert.equal(evidence.checks.find((check) => check.code === 'retry_buster_pass_echo_rejects_cycle')?.ok, true);
  assert.equal(evidence.checks.find((check) => check.code === 'expected_failure_terminal_contract')?.step_id, 'module-review');
});

test('multi-module evidence rejects stale module artifacts from another run', async () => {
  const { scenario, workspace } = createMultiModuleWorkspace({ scenarioId: 'multi-module-independent-success' });
  const outputPath = path.join(workspace.swarmDir, 'modules', '02-nginx', 'buster-output.json');
  const output = readJson(outputPath);
  output.run_id = 'stale-run-id';
  writeJson(outputPath, output);

  const evidence = await evidenceSchemaTestHooks.requireMultiModuleEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  assert.equal(
    evidence.failures.find((failure) => failure.code === 'module_buster_output:02-nginx')?.reason,
    'REAL_E2E_MODULE_BUSTER_OUTPUT_RUN_ID_MISMATCH',
  );
});

test('crash resume evidence accepts exact one-shot crash, resume lifecycle, queue, and latest contracts', async () => {
  const { scenario, workspace } = createCrashResumeWorkspace();

  const evidence = await evidenceSchemaTestHooks.requireCrashResumeEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
  assert.equal(evidence.checks.find((check) => check.code === 'crash_checkpoint')?.point, scenario.crashPoint);
  assert.equal(evidence.checks.find((check) => check.code === 'crash_injection_marker')?.point, scenario.crashPoint);
  assert.deepEqual(evidence.checks.find((check) => check.code === 'crash_resume_lifecycle')?.passed_attempts, [1]);
  assert.deepEqual(evidence.checks.find((check) => check.code === 'crash_resume_buster_queue')?.gate_task_attempts, [1]);
});

test('crash resume evidence rejects crash marker when production checkpoint was not reached', async () => {
  const { scenario, workspace } = createCrashResumeWorkspace({ omitCheckpoint: true });

  const evidence = await evidenceSchemaTestHooks.requireCrashResumeEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  assert.equal(
    evidence.failures.find((failure) => failure.code === 'crash_checkpoint')?.reason,
    'REAL_E2E_CRASH_CHECKPOINT_NOT_REACHED',
  );
});

test('crash resume retry evidence requires failed attempt history and retry success after resume', async () => {
  const { scenario, workspace } = createCrashResumeWorkspace({
    scenarioId: 'crash-after-failed-gate-before-retry',
    retry: true,
  });

  const evidence = await evidenceSchemaTestHooks.requireCrashResumeEvidence(workspace, scenario, { retry: true });

  assert.equal(evidence.ok, true);
  assert.deepEqual(evidence.checks.find((check) => check.code === 'crash_resume_lifecycle')?.failed_attempts, [1]);
  assert.equal(evidence.checks.find((check) => check.code === 'crash_resume_retry_cycle')?.ok, true);
});

test('crash resume evidence rejects resume from the wrong run id', async () => {
  const { scenario, workspace } = createCrashResumeWorkspace({
    markerOverrides: { run_id: 'wrong-run-id' },
  });

  const evidence = await evidenceSchemaTestHooks.requireCrashResumeEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  assert.equal(
    evidence.failures.find((failure) => failure.code === 'crash_injection_marker')?.reason,
    'REAL_E2E_CRASH_MARKER_FIELD_MISMATCH',
  );
});

test('crash resume evidence rejects duplicated terminal completion', async () => {
  const { scenario, workspace } = createCrashResumeWorkspace({ duplicateCompleted: true });

  const evidence = await evidenceSchemaTestHooks.requireCrashResumeEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  const lifecycle = evidence.failures.find((failure) => failure.code === 'crash_resume_lifecycle');
  assert.equal(lifecycle.reason, 'REAL_E2E_CRASH_RESUME_LIFECYCLE_CONTRACT_MISMATCH');
  assert.equal(lifecycle.field_failures.some((failure) => failure.field === 'pipeline_run.completed.count'), true);
});

test('crash resume evidence rejects skipped final Buster gate task', async () => {
  const { scenario, workspace } = createCrashResumeWorkspace({ omitFinalGateTask: true });

  const evidence = await evidenceSchemaTestHooks.requireCrashResumeEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  const queue = evidence.failures.find((failure) => failure.code === 'crash_resume_buster_queue');
  assert.equal(queue.reason, 'REAL_E2E_CRASH_RESUME_BUSTER_QUEUE_CONTRACT_MISMATCH');
  assert.equal(queue.field_failures.some((failure) => failure.field === 'gate_test.task_attempts'), true);
});

test('crash resume evidence rejects stale latest pointer', async () => {
  const { scenario, workspace } = createCrashResumeWorkspace({
    latestOverrides: { run_id: 'stale-run-id' },
  });

  const evidence = await evidenceSchemaTestHooks.requireCrashResumeEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  assert.equal(
    evidence.failures.find((failure) => failure.code === 'crash_resume_latest_pointer')?.reason,
    'REAL_E2E_LATEST_POINTER_FIELD_MISMATCH',
  );
});

test('every nonzero scenario contract requires a typed owner, failure class, status, and event id', () => {
  const incomplete = listRealE2EScenarioIds()
    .map((id) => resolveRealE2EScenario(id))
    .filter((scenario) => scenario.expectedPipelineExit === 'nonzero')
    .filter((scenario) => {
      const terminal = expectedFailureContractForScenario(scenario).terminal;
      return !terminal.component || !terminal.terminal_status || !terminal.failure_class || terminal.require_event_id !== true;
    })
    .map((scenario) => scenario.id);

  assert.deepEqual(incomplete, []);
});

test('each nonzero scenario terminal failure contract accepts only its exact typed event', () => {
  for (const scenario of listRealE2EScenarioIds()
    .map((id) => resolveRealE2EScenario(id))
    .filter((entry) => entry.expectedPipelineExit === 'nonzero')) {
    const workspace = createFailureContractWorkspace(scenario);
    const expected = expectedFailureContractForScenario(scenario).terminal;

    const contract = evidenceSchemaTestHooks.requireScenarioFailureContract(workspace, scenario);

    assert.equal(contract.ok, true, scenario.id);
    assert.equal(contract.scenario, scenario.id, scenario.id);
    assert.equal(contract.event_type, expected.event_type, scenario.id);
    assert.equal(contract.component, expected.component, scenario.id);
    assert.equal(contract.failure_class, expected.failure_class, scenario.id);
  }
});

test('each nonzero scenario setup validator accepts its exact setup contract', () => {
  for (const scenario of listRealE2EScenarioIds()
    .map((id) => resolveRealE2EScenario(id))
    .filter((entry) => entry.expectedPipelineExit === 'nonzero')) {
    const workspace = createFailureContractWorkspace(scenario);

    const setup = evidenceSchemaTestHooks.requireScenarioSetupContract(workspace, scenario);

    assert.equal(setup.ok, true, scenario.id);
  }
});

test('terminal failure contracts reject the right broad step with the wrong failure class', () => {
  for (const scenario of listRealE2EScenarioIds()
    .map((id) => resolveRealE2EScenario(id))
    .filter((entry) => entry.expectedPipelineExit === 'nonzero')) {
    const workspace = createFailureContractWorkspace(scenario, {
      terminalOverrides: { failure_class: 'REAL_E2E_WRONG_FAILURE_CLASS' },
    });

    const contract = evidenceSchemaTestHooks.requireScenarioFailureContract(workspace, scenario);

    assert.equal(contract.ok, false, scenario.id);
    assert.equal(contract.reason, 'REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH', scenario.id);
    assert.equal(
      contract.field_failures.some((failure) => failure.field === 'failure_class'),
      true,
      scenario.id,
    );
  }
});

test('Git failure contracts reject generic Git sync failures without exact root cause', () => {
  for (const scenarioId of ['git-credential-failure', 'git-non-fast-forward', 'git-merge-conflict', 'git-commit-failure']) {
    const scenario = resolveRealE2EScenario(scenarioId);
    const workspace = createFailureContractWorkspace(scenario, {
      terminalOverrides: { halt_reason: '[GIT_SYNC_FAILED] Git sync failed before Buster handoff: generic git failure' },
    });

    const contract = evidenceSchemaTestHooks.requireScenarioFailureContract(workspace, scenario);

    assert.equal(contract.ok, false, scenarioId);
    assert.equal(contract.reason, 'REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH', scenarioId);
    assert.equal(typeof contract.reason_contains, 'string', scenarioId);
  }
});

test('failure contract rejects missing terminal event id', async () => {
  const scenario = resolveRealE2EScenario('forge-malformed-output');
  const event = pipelineRunHalted({
    runId: 'real-e2e-run-1',
    projectName: 'real-e2e-project',
  }, {
    step_type: 'module',
    step_id: '01-nginx',
    terminal_status: 'failed',
    halt_reason: 'failed',
  });
  delete event.event_id;
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_FORGE_MALFORMED_TIMEOUT_MINUTES || 15),
    },
    events: [event],
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  assert.deepEqual(
    evidence.failures.find((failure) => failure.code === 'expected_failure_terminal_contract')?.missing_required_fields,
    ['event_id'],
  );
});

test('failure contract rejects wrong responsible component even with matching status', async () => {
  const scenario = resolveRealE2EScenario('echo-malformed-output');
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'defaults.reviewers.length': 0,
      'gates.module-review.reviewers.length': 0,
    },
    events: [
      pipelineRunHalted({
        runId: 'real-e2e-run-1',
        projectName: 'real-e2e-project',
      }, {
        step_type: 'gate',
        step_id: 'final-review',
        terminal_status: 'action_required',
        terminal_decision: { reasonCode: 'needs_nova' },
      }),
    ],
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  assert.equal(
    evidence.failures.find((failure) => failure.code === 'expected_failure_terminal_contract')?.reason,
    'REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH',
  );
});

test('failure lifecycle evidence rejects stale summary run context', () => {
  const scenario = resolveRealE2EScenario('buster-module-failure');
  const workspace = createFailureContractWorkspace(scenario);
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'summary.json'), {
    run_id: 'stale-run',
    project: workspace.projectName,
    terminal_status: 'failed',
  });

  const lifecycle = evidenceSchemaTestHooks.requirePipelineLifecycleFailureEvidence(workspace, scenario);

  assert.equal(lifecycle.ok, false);
  assert.equal(lifecycle.reason, 'REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE');
  assert.equal(lifecycle.summary_run_matches, false);
});

test('failure evidence accepts file-backed production run id instead of generated e2e wrapper id', async () => {
  const scenario = resolveRealE2EScenario('git-merge-conflict');
  const contract = expectedFailureContractForScenario(scenario);
  const workspace = createWorkspace(scenario, {
    progressFields: {
      ...(contract.setup?.progress || {}),
      ...(contract.setup?.progress_path_suffix
        ? Object.fromEntries(Object.entries(contract.setup.progress_path_suffix).map(([field, suffix]) => [field, `/tmp/generated${suffix}`]))
        : {}),
    },
    configFields: contract.setup?.config || {},
  });
  applyContractSetupFixtures(workspace, contract);
  const productionRunWorkspace = { ...workspace, runId: 'run-production-1' };
  appendJsonl(
    path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', productionRunWorkspace.runId, 'lifecycle', 'canonical-events.jsonl'),
    contractTerminalEvent(productionRunWorkspace, contract),
  );
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'summary.json'), {
    run_id: productionRunWorkspace.runId,
    project: workspace.projectName,
    terminal_status: 'failed',
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
});

test('architecture validator block requires the exact production halted event shape', async () => {
  const scenario = resolveRealE2EScenario('architecture-validator-block');
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'execution_order.0': 'REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE',
    },
    events: [
      pipelineHalted({
        runId: 'real-e2e-run-1',
        projectName: 'real-e2e-project',
      }, {
        step_type: 'arch_validation',
        step_id: 'arch-validation',
        terminal_status: 'blocked',
        reason: 'ARCH_VALIDATION_BLOCKED',
      }),
    ],
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
});

test('architecture validator block rejects the old loose validator terminal shape', async () => {
  const scenario = resolveRealE2EScenario('architecture-validator-block');
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'execution_order.0': 'REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE',
    },
    events: [
      pipelineRunHalted({
        runId: 'real-e2e-run-1',
        projectName: 'real-e2e-project',
      }, {
        step_type: 'validator',
        step_id: 'REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE',
        terminal_status: 'blocked',
        halt_reason: 'ARCH_VALIDATION_BLOCKED',
      }),
    ],
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  assert.equal(evidence.failures.find((failure) => failure.code === 'expected_failure_terminal_contract')?.reason, 'REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH');
});

test('central pipeline schema helper requires ordered typed lifecycle events', () => {
  const records = [
    {
      event_id: 'evt-completed',
      type: 'pipeline_run.completed',
      refs: { run_id: 'run-1' },
      data: { terminal_status: 'succeeded' },
    },
    {
      event_id: 'evt-started',
      type: 'pipeline_run.started',
      refs: { run_id: 'run-1' },
      data: {},
    },
  ];

  const result = evidenceSchemaTestHooks.assertOrderedContracts(records, [
    evidenceSchemaTestHooks.pipelineEventContract('pipeline_run.started', { event_type: 'pipeline_run.started', run_id: 'run-1' }),
    evidenceSchemaTestHooks.pipelineEventContract('pipeline_run.completed', { event_type: 'pipeline_run.completed', run_id: 'run-1', terminal_status: 'succeeded' }),
  ], 'ORDER_MISMATCH');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ORDER_MISMATCH');
  assert.equal(result.missing_contract, 'pipeline_run.completed');
});

test('central Redis schema helper maps exact envelope payload correlation fields', () => {
  const fields = evidenceSchemaTestHooks.redisRecordSchemaFields({
    entry: {
      _id: '1-0',
      schema_version: 'v1',
      stream_role: 'task',
      type: 'module_test',
      project: 'project-1',
      run_id: 'run-1',
      target_kind: 'module',
      target_id: '01-nginx',
      module: '01-nginx',
    },
    payload: {
      task_type: 'module_test',
      module_id: '01-nginx',
      output_file: 'modules/01-nginx/buster-output.json',
    },
  });

  assert.deepEqual(fields, {
    redis_id: '1-0',
    schema_version: 'v1',
    stream_role: 'task',
    type: 'module_test',
    project: 'project-1',
    run_id: 'run-1',
    target_kind: 'module',
    target_id: '01-nginx',
    module: '01-nginx',
    module_id: '01-nginx',
    gate_id: null,
    gate_type: null,
    attempt: null,
    task_type: 'module_test',
    output_file: 'modules/01-nginx/buster-output.json',
    source: null,
    terminal_status: null,
    version: null,
  });
});

test('success artifact schemas reject present but stale or malformed artifacts', () => {
  const workspace = createWorkspace(resolveRealE2EScenario('success'));

  const forgeOk = evidenceSchemaTestHooks.validateForgeCompletionForWorkspace(workspace)({
    artifact_type: 'forge_completion',
    status: 'READY_FOR_TESTING',
    summary: 'module ready',
    evidence: {
      inspected_files: ['nginx/default.conf'],
      consulted_contracts: ['.swarm/contracts/module-outputs/01-foundation.json'],
      implementation_notes: 'owned files are compliant',
    },
    completed_at: '2026-06-28T00:00:00.000Z',
  });
  assert.equal(forgeOk.ok, undefined);
  const forgeBad = evidenceSchemaTestHooks.validateForgeCompletionForWorkspace(workspace)({
    artifact_type: 'forge_completion',
    status: 'PASS',
    summary: 'module ready',
    evidence: {
      inspected_files: ['nginx/default.conf'],
      consulted_contracts: ['.swarm/contracts/module-outputs/01-foundation.json'],
      implementation_notes: 'owned files are compliant',
    },
    completed_at: '2026-06-28T00:00:00.000Z',
  });
  assert.equal(forgeBad.ok, false);
  assert.equal(forgeBad.reason, 'REAL_E2E_FORGE_COMPLETION_FIELD_MISMATCH');

  const archBad = evidenceSchemaTestHooks.validateArchitectureResultsForWorkspace(workspace)({
    project: 'stale-project',
    blocked: false,
    timestamp: '2026-06-28T00:00:00.000Z',
    findings: [],
  });
  assert.equal(archBad.ok, false);
  assert.equal(archBad.reason, 'REAL_E2E_ARCH_RESULTS_PROJECT_MISMATCH');

  const reviewBad = evidenceSchemaTestHooks.validateEchoReviewForWorkspace(workspace, { gateId: 'module-review' })({
    status: 'PASS',
    run_id: 'stale-run',
    project: workspace.projectName,
    gate_id: 'module-review',
    critical_issues: [],
    deferred_issues: [],
    summary: 'approved',
  });
  assert.equal(reviewBad.ok, false);
  assert.equal(reviewBad.reason, 'REAL_E2E_ECHO_REVIEW_RUN_ID_MISMATCH');

  const pipelineReviewBad = evidenceSchemaTestHooks.validatePipelineReviewForWorkspace(workspace)({
    status: 'REVIEWED',
    project: workspace.projectName,
    run_id: workspace.runId,
    architecture_observations: [],
    agent_performance: { modules_with_retries: [] },
    prompt_effectiveness: [],
    test_quality: [],
    config_recommendations: [],
    improvements_next_run: [],
  });
  assert.equal(pipelineReviewBad.ok, false);
  assert.equal(pipelineReviewBad.reason, 'REAL_E2E_PIPELINE_REVIEW_AGENT_PERFORMANCE_ARRAY_INVALID');

  const latestBad = evidenceSchemaTestHooks.validateLatestPointerForWorkspace(workspace)({
    run_id: workspace.runId,
    status: 'succeeded',
    terminal_status: 'succeeded',
    telemetry_stream_key: `pipeline:telemetry:${workspace.projectName}:stale-run`,
    run_dir: `runs/${workspace.runId}`,
    path: `runs/${workspace.runId}`,
    pipeline_jsonl: `runs/${workspace.runId}/pipeline.jsonl`,
    summary_json: `runs/${workspace.runId}/summary.json`,
    authority: {},
  });
  assert.equal(latestBad.ok, false);
  assert.equal(latestBad.reason, 'REAL_E2E_LATEST_POINTER_FIELD_MISMATCH');
});

test('success artifact schemas accept exact production-shaped run contracts', () => {
  const workspace = createWorkspace(resolveRealE2EScenario('success'));

  assert.equal(evidenceSchemaTestHooks.validateArchitectureResultsForWorkspace(workspace)({
    project: workspace.projectName,
    run_id: workspace.runId,
    blocked: false,
    timestamp: '2026-06-28T00:00:00.000Z',
    findings: [],
  }).ok, undefined);

  assert.equal(evidenceSchemaTestHooks.validateEchoReviewForWorkspace(workspace, { gateId: 'final-review' })({
    ...passEchoReview(workspace, 'final-review'),
  }).ok, undefined);

  assert.equal(evidenceSchemaTestHooks.validatePipelineReviewForWorkspace(workspace)({
    status: 'REVIEWED',
    project: workspace.projectName,
    run_id: workspace.runId,
    architecture_observations: [],
    agent_performance: { modules_with_retries: [], common_failure_modes: [] },
    prompt_effectiveness: [],
    test_quality: [],
    config_recommendations: [],
    improvements_next_run: [],
  }).ok, undefined);

  assert.equal(evidenceSchemaTestHooks.validateLatestPointerForWorkspace(workspace)({
    run_id: workspace.runId,
    status: 'completed',
    terminal_status: 'succeeded',
    telemetry_stream_key: `pipeline:telemetry:${workspace.projectName}:${workspace.runId}`,
    run_dir: `runs/${workspace.runId}`,
    path: `runs/${workspace.runId}`,
    pipeline_jsonl: `runs/${workspace.runId}/pipeline.jsonl`,
    summary_json: `runs/${workspace.runId}/summary.json`,
    authority: {},
  }).ok, undefined);
});

test('final Buster evidence requires the promoted module source image', () => {
  const scenario = resolveRealE2EScenario('success');
  const workspace = createWorkspace(scenario, {
    progressFields: {
      'gates.final-buster.test_config.k8s.source_image': 'localhost/real-pipeline-e2e-nginx:module',
    },
  });
  writeJson(path.join(workspace.swarmDir, 'contracts', 'runtime-config.json'), {
    static_serving: {
      surfaces: [
        {
          served_as: '/content/branch-a.html',
          expected_marker: 'REAL_E2E_BRANCH_A_CONTENT',
        },
        {
          served_as: '/assets/branch-b.css',
          expected_marker: '#real-e2e-content-branch',
        },
      ],
    },
  });
  const busterOutput = {
    status: 'PASS',
    project: workspace.projectName,
    results: [
      {
        suite: 'k8s',
        status: 'PASS',
        metadata: {
          purpose: 'final-preview',
          preview_exposure_provider: 'tailscale-ingress',
          preview_url: 'https://real-e2e.example.ts.net',
          preview_expected_text: 'REAL_E2E_NGINX_OK',
          internal_body_bytes: 42,
          test_namespace: 'test-real-e2e',
          source_image: 'localhost/real-pipeline-e2e-nginx:module',
          source_image_id: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          registry_image: 'registry-local.kubeclaw.svc.cluster.local:5001/real-pipeline-e2e-nginx:run-1',
          registry_image_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          image_promotion: {
            source_image: 'localhost/real-pipeline-e2e-nginx:module',
            source_image_id: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            registry_image: 'registry-local.kubeclaw.svc.cluster.local:5001/real-pipeline-e2e-nginx:run-1',
            registry_image_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
          checks: [
            { name: 'namespace-lease', passed: true },
            { name: 'pods-ready', passed: true },
            { name: 'health-check', passed: true },
            { name: 'preview-url', passed: true },
          ],
        },
      },
      {
        suite: 'tailscale-preview',
        status: 'PASS',
        metadata: {
          preview_url: 'https://real-e2e.example.ts.net',
          expected_text: 'REAL_E2E_NGINX_OK',
          source_suite: 'k8s',
          static_surface_checks: [
            {
              path: '/content/branch-a.html',
              url: 'https://real-e2e.example.ts.net/content/branch-a.html',
              status: 200,
              body_bytes: 28,
              expected_text: 'REAL_E2E_BRANCH_A_CONTENT',
              passed: true,
            },
            {
              path: '/assets/branch-b.css',
              url: 'https://real-e2e.example.ts.net/assets/branch-b.css',
              status: 200,
              body_bytes: 30,
              expected_text: '#real-e2e-content-branch',
              passed: true,
            },
          ],
        },
      },
    ],
  };

  assert.equal(evidenceSchemaTestHooks.validateBusterOutputForWorkspace(workspace)(busterOutput).ok, undefined);

  const mismatched = structuredClone(busterOutput);
  mismatched.results[0].metadata.source_image = 'localhost/real-pipeline-e2e-nginx:final';
  assert.equal(
    evidenceSchemaTestHooks.validateBusterOutputForWorkspace(workspace)(mismatched).reason,
    'REAL_E2E_BUSTER_OUTPUT_K8S_SOURCE_IMAGE_MISMATCH',
  );

  const missingPromotion = structuredClone(busterOutput);
  delete missingPromotion.results[0].metadata.image_promotion;
  assert.equal(
    evidenceSchemaTestHooks.validateBusterOutputForWorkspace(workspace)(missingPromotion).reason,
    'REAL_E2E_BUSTER_OUTPUT_K8S_IMAGE_PROMOTION_MISSING',
  );

  const missingDigest = structuredClone(busterOutput);
  delete missingDigest.results[0].metadata.registry_image_digest;
  delete missingDigest.results[0].metadata.image_promotion.registry_image_digest;
  assert.equal(
    evidenceSchemaTestHooks.validateBusterOutputForWorkspace(workspace)(missingDigest).reason,
    'REAL_E2E_BUSTER_OUTPUT_K8S_REGISTRY_IMAGE_DIGEST_MISSING',
  );

  const missingStaticSurface = structuredClone(busterOutput);
  missingStaticSurface.results[1].metadata.static_surface_checks.pop();
  assert.equal(
    evidenceSchemaTestHooks.validateBusterOutputForWorkspace(workspace)(missingStaticSurface).reason,
    'REAL_E2E_BUSTER_OUTPUT_STATIC_SURFACE_PREVIEW_MISSING',
  );
});

test('agent observability success evidence uses promoted pipeline events, not raw Redis streams', () => {
  const scenario = resolveRealE2EScenario('success');
  const workspace = createWorkspace(scenario);
  const eventsPath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'pipeline.jsonl');
  for (const event of [
    { type: 'agent.spawned', label: 'forge-01-nginx-1', session_key: 'agent:forge' },
    { type: 'agent.session.started', session_key: 'agent:forge' },
    { type: 'agent.tool.started', tool_name: 'bash' },
    { type: 'agent.tool.finished', tool_name: 'bash', outcome: 'completed' },
    { type: 'agent.ended', session_key: 'agent:forge' },
    { type: 'agent.spawned', label: 'echo-echo-codex-module-review-1', session_key: 'agent:review' },
    { type: 'agent.spawned', label: 'case-study-1', session_key: 'agent:case-study' },
    { type: 'agent.spawned', label: 'pipeline-review-1', session_key: 'agent:pipeline-review' },
  ]) {
    appendJsonl(eventsPath, {
      v: 1,
      event_id: `event-${++eventCounter}`,
      ts: '2026-07-11T00:00:00.000Z',
      project: workspace.projectName,
      source: 'pipeline',
      emitter: 'nova/pipeline/services/agent-observability-ingester',
      ...event,
    });
  }

  const evidence = evidenceSchemaTestHooks.requireAgentObservabilityTelemetryEvidence(workspace);

  assert.equal(evidence.ok, true);
  assert.equal(evidence.code, 'agent_observability_pipeline_events');
  assert.equal(evidence.types.includes('agent.spawned'), true);
});

test('discord receipt evidence accepts deterministic Buster queued and suite result cards', () => {
  const workspace = createWorkspace(resolveRealE2EScenario('success'));
  const receiptPath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'discord-deliveries.jsonl');
  const base = {
    run_id: workspace.runId,
    project: workspace.projectName,
    ok: true,
    channel_id: 'channel-1',
    webhook_message_returned: true,
  };
  appendJsonl(receiptPath, { ...base, title: 'ℹ️ Module 01-nginx — Buster queued', message_id: 'msg-1' });
  appendJsonl(receiptPath, { ...base, title: '✅ Suite Results: PASS — 01-nginx', message_id: 'msg-2' });
  appendJsonl(receiptPath, { ...base, title: '✅ Pipeline Complete: real-e2e-project', message_id: 'msg-3' });

  const evidence = evidenceSchemaTestHooks.requireDiscordDeliveryReceipt(workspace);

  assert.equal(evidence.ok, true);
  assert.deepEqual(evidence.buster_progress_titles, [
    'ℹ️ Module 01-nginx — Buster queued',
    '✅ Suite Results: PASS — 01-nginx',
  ]);
});

test('discord receipt evidence rejects missing deterministic Buster progress cards', () => {
  const workspace = createWorkspace(resolveRealE2EScenario('success'));
  const receiptPath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'discord-deliveries.jsonl');
  appendJsonl(receiptPath, {
    run_id: workspace.runId,
    project: workspace.projectName,
    ok: true,
    channel_id: 'channel-1',
    webhook_message_returned: true,
    title: '✅ Pipeline Complete: real-e2e-project',
    message_id: 'msg-1',
  });

  const evidence = evidenceSchemaTestHooks.requireDiscordDeliveryReceipt(workspace);

  assert.equal(evidence.ok, false);
  assert.equal(evidence.reason, 'REAL_E2E_DISCORD_DELIVERY_RECEIPT_MISSING_BUSTER_PROGRESS');
  assert.deepEqual(evidence.missing_title_patterns, [
    '/Module 01-nginx.+Buster queued/',
    '/Suite Results: PASS.+01-nginx/',
  ]);
});

test('forge malformed output requires exact payload hash length production rejection and no downstream success', async () => {
  const { scenario, workspace } = createMalformedWorkspace('forge-malformed-output');
  const { config } = writeMalformedPublication(workspace, scenario);

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
  const malformed = evidence.checks.find((check) => check.code === 'deterministic_malformed_output');
  assert.equal(malformed.target, config.target);
  assert.equal(malformed.raw_sha256, crypto.createHash('sha256').update(config.raw).digest('hex'));
  assert.equal(malformed.raw_bytes, Buffer.byteLength(config.raw, 'utf8'));
  const rejection = evidence.checks.find((check) => check.code === 'malformed_output_production_rejection');
  assert.deepEqual({
    component: rejection.component,
    error_code: rejection.error_code,
    artifact_path: rejection.artifact_path,
  }, {
    component: 'module:01-nginx',
    error_code: 'invalid_contract',
    artifact_path: config.target,
  });
  assert.equal(evidence.checks.find((check) => check.code === 'malformed_output_no_downstream_success')?.ok, true);
});

test('malformed output evidence fails when deterministic manifest and payload are absent', async () => {
  for (const scenarioId of ['forge-malformed-output', 'echo-malformed-output']) {
    const { scenario, workspace } = createMalformedWorkspace(scenarioId);

    const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

    assert.equal(evidence.ok, false, scenarioId);
    assert.equal(
      evidence.failures.find((failure) => failure.code === 'deterministic_malformed_output')?.reason,
      'REAL_E2E_MISSING_ARTIFACT',
      scenarioId,
    );
  }
});

test('malformed output payload at the wrong path does not satisfy evidence', async () => {
  for (const scenarioId of ['forge-malformed-output', 'echo-malformed-output']) {
    const { scenario, workspace } = createMalformedWorkspace(scenarioId);
    const wrongTarget = scenario.id === 'forge-malformed-output'
      ? 'modules/01-nginx/wrong-forge-completion.json'
      : 'logs/echo-review/wrong-echo-review.json';
    writeMalformedPublication(workspace, scenario, { target: wrongTarget });

    const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

    assert.equal(evidence.ok, false, scenarioId);
    const malformed = evidence.failures.find((failure) => failure.code === 'deterministic_malformed_output');
    assert.equal(malformed.reason, 'REAL_E2E_MALFORMED_OUTPUT_RAW_PAYLOAD_MISMATCH', scenarioId);
    assert.equal(malformed.actual_sha256, null, scenarioId);
    assert.equal(malformed.actual_bytes, null, scenarioId);
  }
});

test('echo malformed output rejects invalid contract and fails if downstream review succeeds', async () => {
  const { scenario, workspace } = createMalformedWorkspace('echo-malformed-output');
  const { config } = writeMalformedPublication(workspace, scenario);
  writeJson(path.join(workspace.swarmDir, 'logs', 'echo-review', 'MODULE-REVIEW.json'), {
    status: 'PASS',
  });

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, false);
  const rejection = evidence.checks.find((check) => check.code === 'malformed_output_production_rejection');
  assert.deepEqual({
    component: rejection.component,
    error_code: rejection.error_code,
    artifact_path: rejection.artifact_path,
  }, {
    component: 'gate:module-review',
    error_code: 'invalid_contract',
    artifact_path: config.target,
  });
  const downstream = evidence.failures.find((failure) => failure.code === 'malformed_output_no_downstream_success');
  assert.equal(downstream.reason, 'REAL_E2E_MALFORMED_OUTPUT_DOWNSTREAM_SUCCESS_OBSERVED');
  assert.deepEqual(downstream.unexpected_artifacts, [
    {
      artifact: 'module_echo_review',
      path: path.join('.swarm', 'logs', 'echo-review', 'MODULE-REVIEW.json'),
    },
  ]);
});

test('echo malformed output passes only with invalid-contract terminal and no downstream success', async () => {
  const { scenario, workspace } = createMalformedWorkspace('echo-malformed-output');
  const { config } = writeMalformedPublication(workspace, scenario);

  const evidence = await verifyExpectedFailureEvidence(workspace, scenario);

  assert.equal(evidence.ok, true);
  const rejection = evidence.checks.find((check) => check.code === 'malformed_output_production_rejection');
  assert.deepEqual({
    component: rejection.component,
    error_code: rejection.error_code,
    artifact_path: rejection.artifact_path,
  }, {
    component: 'gate:module-review',
    error_code: 'invalid_contract',
    artifact_path: config.target,
  });
  assert.equal(evidence.checks.find((check) => check.code === 'malformed_output_no_downstream_success')?.ok, true);
});

test('restored success evidence does not require skipped module buster stream task', async () => {
  const scenario = resolveRealE2EScenario('approval-deny');
  const workspace = createWorkspace(scenario);
  workspace.worktreePath = path.dirname(workspace.projectSrc);
  workspace.restoredCheckpoint = { checkpoint: 'post-module-review' };
  workspace.__testDecodedBusterTasks = [{
    entry: {
      _id: 'task-gate-final-buster',
      schema_version: 'v1',
      stream_role: 'task',
      type: 'gate_test',
      project: workspace.projectName,
      run_id: workspace.runId,
      target_kind: 'gate',
      target_id: 'final-buster',
      module: 'final-buster',
      module_id: 'final-buster',
      gate_id: 'final-buster',
    },
    payload: {
      task_type: 'gate_test',
      project: workspace.projectName,
      run_id: workspace.runId,
      module_id: 'final-buster',
      module: 'final-buster',
      gate_id: 'final-buster',
      output_file: 'src/.swarm/buster-test/FINAL-BUSTER-RESULT.json',
      suites: ['k8s'],
      test_config: { k8s: { purpose: 'final-preview', preview: { expected_text: 'REAL_E2E_NGINX_OK' } } },
    },
  }];

  const restored = await evidenceSchemaTestHooks.requireBusterStreamEvidence(workspace, { requireModuleTask: false });
  const full = await evidenceSchemaTestHooks.requireBusterStreamEvidence(workspace, { requireModuleTask: true });

  assert.equal(restored.ok, true);
  assert.equal(restored.module_task_id, null);
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'REAL_E2E_BUSTER_STREAM_MISSING_REQUIRED_TASKS');
});

test('restored telemetry evidence requires only remaining current-run events', async () => {
  const scenario = resolveRealE2EScenario('approval-deny');
  const workspace = createWorkspace(scenario);
  workspace.restoredCheckpoint = { checkpoint: 'post-module-review' };
  writeJson(path.join(workspace.swarmDir, 'logs', 'pipeline', 'summary.json'), {
    run_id: workspace.runId,
    project: workspace.projectName,
    terminal_status: 'succeeded',
    governance: {},
    telemetry_stream_key: `pipeline:telemetry:${workspace.projectName}:${workspace.runId}`,
  });
  workspace.__testTelemetryEvents = [
    { v: 1, source: 'pipeline', type: 'gate.started', run_id: workspace.runId, project: workspace.projectName, gate_id: 'final-buster' },
    { v: 1, source: 'pipeline', type: 'pipeline.completed', run_id: workspace.runId, project: workspace.projectName, terminal_status: 'succeeded' },
  ];

  const restored = await evidenceSchemaTestHooks.requirePipelineTelemetryStreamEvidence(workspace);
  delete workspace.restoredCheckpoint;
  const full = await evidenceSchemaTestHooks.requirePipelineTelemetryStreamEvidence(workspace);

  assert.equal(restored.ok, true);
  assert.equal(restored.restored_checkpoint, 'post-module-review');
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'REAL_E2E_TELEMETRY_STREAM_MISSING_RUN_EVENTS');
});
