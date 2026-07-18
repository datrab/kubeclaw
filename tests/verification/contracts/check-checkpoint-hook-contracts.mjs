import assert from 'assert';
import fs from 'fs';
import path from 'path';

import {
  CHECKPOINT_AGENT_PHASES,
  CHECKPOINT_FAULT_SURFACES,
  CHECKPOINT_FIXTURE_FAMILIES,
  CHECKPOINT_NAMES,
  checkpointHookContract,
  checkpointPlanForScenario,
  validateScenarioCheckpointContract,
} from '../e2e/checkpoints.mjs';
import {
  checkpointContractForScenario,
  failureMatrixScenarioDecision,
  listFailureMatrixSuiteIds,
  listFailureMatrixSuiteScenarioIds,
  listRealE2EScenarioIds,
  resolveFailureMatrixSuite,
  scenarioMutationContractForScenario,
  assertScenarioMutationChannel,
} from '../e2e/failure-scenarios.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source-root') args.sourceRoot = path.resolve(argv[index + 1]);
  }
  return args;
}

function read(sourceRoot, relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

function faultSurfaceAllowed(surface, allowedSurfaces) {
  return allowedSurfaces.some((allowed) => {
    if (allowed === surface) return true;
    if (allowed.endsWith('.*')) return surface.startsWith(allowed.slice(0, -1));
    return false;
  });
}

const { sourceRoot } = parseArgs();
const knownMutationChannels = new Set([
  'buster-simulator',
  'cleanup-blocker',
  'config',
  'crash-controller',
  'env',
  'file',
  'fixture-contract',
  'git-shim',
  'malformed-output',
  'operator-controller',
  'progress',
  'signal-controller',
  'workspace-file',
]);

assert.deepEqual(
  CHECKPOINT_NAMES,
  [
    'fresh',
    'pre-forge',
    'post-forge',
    'pre-module-buster',
    'during-module-buster-wait',
    'pre-module-review',
    'post-module-review',
    'post-approval',
    'pre-final-buster',
    'pre-final-review',
    'post-final-review',
    'pre-terminal-delivery',
    'during-cleanup',
  ],
  'checkpoint hook names must stay explicit and phase-owned',
);
assert.deepEqual(
  CHECKPOINT_FIXTURE_FAMILIES,
  ['standard-4-module', 'linear-2-module', 'single-module'],
  'fixture families must stay explicit',
);

for (const hookName of CHECKPOINT_NAMES) {
  const hook = checkpointHookContract(hookName);
  assert.equal(hook.name, hookName, `${hookName} hook must be self-identifying`);
  assert.equal(hook.phase_boundary, hookName, `${hookName} hook must expose its exact phase boundary`);
  assert.equal(hook.required_state.swarm_paths.includes('progress.json'), true, `${hookName} must require progress.json`);
  assert.equal(hook.fixture_families.length > 0, true, `${hookName} must declare compatible fixture families`);
  for (const fixtureFamily of hook.fixture_families) {
    assert.equal(CHECKPOINT_FIXTURE_FAMILIES.includes(fixtureFamily), true, `${hookName} references unknown fixture family ${fixtureFamily}`);
  }
  for (const surface of hook.allowed_fault_surfaces) {
    assert.equal(CHECKPOINT_FAULT_SURFACES.includes(surface), true, `${hookName} references unknown fault surface ${surface}`);
  }
  const expectedRemaining = CHECKPOINT_AGENT_PHASES.filter((phase) => !hook.skipped_agent_phases.includes(phase));
  assert.deepEqual(hook.remaining_phases, expectedRemaining, `${hookName} remaining phases must derive from skipped phases`);
}

const matrixSuites = listFailureMatrixSuiteIds();
const matrixScenarios = listFailureMatrixSuiteScenarioIds();
const allScenarios = new Set(listRealE2EScenarioIds());
const manualScenarios = [...allScenarios]
  .filter((scenarioId) => !matrixScenarios.includes(scenarioId));
assert.deepEqual(matrixSuites, [
  'full-pipeline-smoke',
  'module-failure-retry',
  'human-gates',
  'final-deployment-buster',
  'git-authority',
  'infrastructure-observability',
  'module-graph',
  'crash-resume',
], 'failure matrix must expose exactly eight canonical top-level suites');
assert.equal(matrixScenarios.length > 0, true, 'failure matrix suites must declare cases');
assert.deepEqual(manualScenarios, [], 'all real E2E scenarios must be covered by a canonical suite');

const suiteCaseCounts = new Map();
for (const suiteId of matrixSuites) {
  const suite = resolveFailureMatrixSuite(suiteId);
  assert.equal(suite.id, suiteId, `${suiteId} suite must be self-identifying`);
  assert.equal(suite.scenarios.length > 0, true, `${suiteId} suite must own at least one case`);
  for (const scenarioId of suite.scenarios) {
    suiteCaseCounts.set(scenarioId, (suiteCaseCounts.get(scenarioId) || 0) + 1);
  }
}
for (const scenarioId of matrixScenarios) {
  assert.equal(suiteCaseCounts.get(scenarioId), 1, `${scenarioId} must be owned by exactly one suite`);
}

for (const scenarioId of matrixScenarios) {
  assert.equal(allScenarios.has(scenarioId), true, `${scenarioId} must exist in the scenario registry`);

  const contract = checkpointContractForScenario(scenarioId);
  assert.notEqual(contract.required_hook, 'fresh', `${scenarioId} must not use fresh/full-lifecycle as a checkpoint fallback`);
  assert.equal(CHECKPOINT_NAMES.includes(contract.required_hook), true, `${scenarioId} references unknown hook ${contract.required_hook}`);
  assert.equal(CHECKPOINT_FIXTURE_FAMILIES.includes(contract.fixture_family), true, `${scenarioId} references unknown fixture family ${contract.fixture_family}`);
  assert.equal(typeof contract.expected_terminal_authority, 'string', true, `${scenarioId} must declare expected terminal authority`);
  assert.equal(contract.expected_terminal_authority.length > 0, true, `${scenarioId} terminal authority cannot be empty`);

  const hook = checkpointHookContract(contract.required_hook);
  assert.equal(hook.fixture_families.includes(contract.fixture_family), true, `${scenarioId} fixture family must be accepted by ${contract.required_hook}`);
  assert.equal(
    faultSurfaceAllowed(contract.fault_injection_surface, hook.allowed_fault_surfaces),
    true,
    `${scenarioId} fault surface ${contract.fault_injection_surface} is not allowed by ${contract.required_hook}`,
  );

  const scenarioValidation = validateScenarioCheckpointContract({
    scenarioId,
    checkpoint: contract.required_hook,
    manifest: {
      fixture_family: contract.fixture_family,
      hook_contract: hook,
    },
  });
  assert.deepEqual(scenarioValidation.failures, [], `${scenarioId} checkpoint contract must validate`);

  const mutationContract = scenarioMutationContractForScenario(scenarioId);
  assert.equal(mutationContract.scenario_id, scenarioId, `${scenarioId} mutation contract must be scenario-owned`);
  assert.equal(mutationContract.fault_injection_surface, contract.fault_injection_surface, `${scenarioId} mutation surface must match checkpoint surface`);
  assert.deepEqual(contract.mutation_contract, mutationContract, `${scenarioId} checkpoint contract must carry the mutation contract`);
  assert.equal(mutationContract.allowed_mutation_channels.length > 0, true, `${scenarioId} must declare at least one mutation channel`);
  for (const channel of mutationContract.allowed_mutation_channels) {
    assert.equal(knownMutationChannels.has(channel), true, `${scenarioId} uses unknown mutation channel ${channel}`);
    assert.equal(assertScenarioMutationChannel(scenarioId, channel), true, `${scenarioId} must allow its declared mutation channel ${channel}`);
  }
  assert.throws(
    () => assertScenarioMutationChannel(scenarioId, 'not-a-real-channel'),
    /cannot mutate channel 'not-a-real-channel'/,
    `${scenarioId} must reject undeclared mutation channels`,
  );

  const plan = checkpointPlanForScenario(scenarioId);
  assert.equal(plan.checkpoint, contract.required_hook, `${scenarioId} plan must start from required hook`);
  assert.equal(plan.start_from, contract.required_hook, `${scenarioId} plan start_from must be required hook`);
  assert.equal(Object.hasOwn(plan, 'full_lifecycle'), false, `${scenarioId} plan must not expose legacy full_lifecycle`);
  assert.equal(Object.hasOwn(plan, 'sentinel'), false, `${scenarioId} plan must not expose legacy sentinel`);
  assert.equal(Object.hasOwn(plan, 'full_lifecycle_reason'), false, `${scenarioId} plan must not expose legacy full_lifecycle_reason`);

  assert.deepEqual(failureMatrixScenarioDecision(scenarioId), {
    scenario_id: scenarioId,
    decision: 'suite-case',
    replacement_scenario: [...matrixSuites]
      .map((suiteId) => resolveFailureMatrixSuite(suiteId))
      .find((suite) => suite.scenarios.includes(scenarioId)).id,
    coverage: 'failure-matrix-suite',
    reason: 'covered by canonical failure matrix suite',
  }, `${scenarioId} must resolve as a canonical suite case`);
}

const checkpointsSource = read(sourceRoot, 'tests/verification/e2e/checkpoints.mjs');
const matrixSource = read(sourceRoot, 'tests/verification/e2e/run-real-pipeline-failure-matrix.mjs');
const scenarioSource = read(sourceRoot, 'tests/verification/e2e/failure-scenarios.mjs');
const boundedOutputSource = read(sourceRoot, 'tests/verification/e2e/bounded-output-capture.mjs');
const combinedHarnessSource = `${checkpointsSource}\n${matrixSource}\n${scenarioSource}`;
for (const staleToken of [
  'checkpointFullLifecycleReason',
  'isFullLifecycleSentinelScenario',
  'isExplicitFullLifecycleScenario',
  'FULL_LIFECYCLE_SENTINELS',
  'EXPLICIT_FULL_LIFECYCLE_SCENARIOS',
  'plan.full_lifecycle',
  'filter((plan) => !plan.full_lifecycle',
  ['PRUNED_FAILURE_MATRIX', 'SCENARIOS'].join('_'),
  ['listPrunedFailureMatrix', 'Scenarios'].join(''),
  'matrix_discord_delivery })}\\n`)',
  'results: publicResults',
]) {
  assert.equal(combinedHarnessSource.includes(staleToken), false, `stale harness token must stay deleted: ${staleToken}`);
}

for (const requiredToken of [
  'formatMatrixSuiteCliLine',
  'formatMatrixSummaryCliLine',
  'mirrorOutput: false',
  'stdoutLogPath: childOutputLogs.stdout',
  'stderrLogPath: childOutputLogs.stderr',
]) {
  assert.equal(matrixSource.includes(requiredToken), true, `failure matrix must keep compact CLI/file-log contract token: ${requiredToken}`);
}
for (const requiredToken of [
  'mirrorOutput = true',
  'stdoutLogPath = null',
  'stderrLogPath = null',
  'stdout_log_path',
  'stderr_log_path',
]) {
  assert.equal(boundedOutputSource.includes(requiredToken), true, `bounded output capture must support file-backed full logs: ${requiredToken}`);
}

const packageJson = JSON.parse(read(sourceRoot, 'package.json'));
assert.equal(
  packageJson.scripts['verify:contracts'].includes('check-checkpoint-hook-contracts.mjs'),
  true,
  'root verify:contracts must enforce checkpoint hook contracts',
);

const redesignDoc = read(sourceRoot, 'docs/pipeline/checkpoint-hook-contracts-redesign.md');
for (const marker of [
  'scenario mutation contract',
  'Contract Verification',
  'Pruned and merged scenarios are not active matrix children',
  'No legacy full-lifecycle fallback remains',
  'The executable checkpoint matrix is suite-owned.',
  'Use `--suite <id>` or `--suites a,b` for aggregate execution.',
  'Use `--scenario <id>` for a focused case and `--from-scenario <id>` to resume a suite',
  'Do not restore an uncontracted per-scenario execution path',
]) {
  assert.equal(redesignDoc.includes(marker), true, `checkpoint redesign doc must document: ${marker}`);
}

console.log(JSON.stringify({
  ok: true,
  registered_scenarios: allScenarios.size,
  matrix_suites: matrixSuites.length,
  matrix_scenarios: matrixScenarios.length,
  manual_scenarios: manualScenarios,
  hooks: CHECKPOINT_NAMES.length,
  fixture_families: CHECKPOINT_FIXTURE_FAMILIES,
}));
