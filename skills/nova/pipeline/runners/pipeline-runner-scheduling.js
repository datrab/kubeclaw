import path from 'path';

import { log } from '../core/logger.js';
import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.js';
import { STATUS } from '../core/constants.js';
import { getRunId } from '../core/runtime.js';
import { requireStageHandler } from '../core/registry.js';
import {
  buildArchitectureValidatorControlResult,
  coerceArchitectureValidatorControlResult,
} from '../services/arch-validator.js';
import { releaseGateFiles, syncControlFiles } from '../services/blueprint.js';
import {
  loadAuthoritativeModuleState,
  hasAnyStartedModules,
  projectPipelineGateState,
} from './pipeline-runner-shared.js';
import {
  buildStagePluginInvocation,
  buildStageRefs,
  collectExistingArtifactRefs,
} from './stage-envelope-primitives.js';

function countByStatus(values = []) {
  return values.reduce((acc, value) => {
    const key = String(value || 'UNKNOWN');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildGeneratorArtifactRefs(config) {
  const pipelineDir = config?._logDir ? path.join(config._logDir, 'pipeline') : null;
  const runLogDir = config?._runLogDir || pipelineDir;
  if (!pipelineDir) return [];

  return collectExistingArtifactRefs([
    {
    type: 'pipeline_summary',
    role: 'output',
    label: 'run-summary',
    format: 'json',
    path: runLogDir ? path.join(runLogDir, 'summary.json') : null,
    },
    {
    type: 'pipeline_summary',
    role: 'latest',
    label: 'pipeline-summary',
    format: 'json',
    path: path.join(pipelineDir, 'summary.json'),
    },
    {
    type: 'pipeline_summary',
    role: 'latest_pointer',
    label: 'latest-pointer',
    format: 'json',
    path: path.join(pipelineDir, 'latest.json'),
    },
  ]);
}

function buildGeneratorStateSnapshot(config, progress, opts = {}, deps = {}) {
  const moduleStatuses = Object.entries(progress?.modules || {}).map(([moduleId, mod = {}]) => {
    const status = mod?.dir && typeof deps.loadStatus === 'function'
      ? deps.loadStatus(config, mod.dir)
      : undefined;
    const authoritative = loadAuthoritativeModuleState(config, progress, moduleId, {
      status,
      loadStatusFn: deps.loadStatus,
    });
    return authoritative?.status || STATUS.PENDING;
  });
  const gateStatuses = Object.keys(progress?.gates || {}).map((gateId) => {
    const gate = progress.gates[gateId] || null;
    const gateProjection = projectPipelineGateState(config, gateId, gate, deps);
    return gateProjection?.status || 'PENDING';
  });

  return {
    pipeline: {
      project: config?.project || null,
      run_id: getRunId(config),
      exit_code: opts.exitCode ?? null,
      exit_reason: opts.exitReason || null,
      schedule_reason: opts.scheduleReason || null,
      mode: opts.mode || 'full',
    },
    modules: {
      total: Object.keys(progress?.modules || {}).length,
      status_counts: countByStatus(moduleStatuses),
    },
    gates: {
      total: Object.keys(progress?.gates || {}).length,
      status_counts: countByStatus(gateStatuses),
    },
  };
}

function buildGeneratorRunInput(config, progress, stageId, opts = {}, deps = {}) {
  const runId = getRunId(config);
  const generatorType = String(stageId || '').split(':')[1] || stageId || 'unknown';
  const refs = buildStageRefs({
    runRef: { prefix: 'run', parts: [runId] },
    moduleRef: opts.moduleId ? { prefix: 'module', parts: [opts.moduleId] } : null,
    gateRef: opts.gateId ? { prefix: 'gate', parts: [opts.gateId] } : null,
  });

  return {
    refs,
    ids: {
      runId,
      generatorType,
      stageId,
      ...(opts.moduleId ? { moduleId: opts.moduleId } : {}),
      ...(opts.gateId ? { gateId: opts.gateId } : {}),
    },
    generator: {
      config: {
        ...(config?.[generatorType] && typeof config[generatorType] === 'object' ? config[generatorType] : {}),
        ...(progress?.[generatorType] && typeof progress[generatorType] === 'object' ? progress[generatorType] : {}),
      },
    },
    artifacts: buildGeneratorArtifactRefs(config),
    summaries: buildGeneratorArtifactRefs(config),
    stateSnapshot: buildGeneratorStateSnapshot(config, progress, opts, deps),
    executionContext: {
      scheduleReason: opts.scheduleReason || null,
      mode: opts.mode || 'full',
      exitCode: opts.exitCode ?? null,
      exitReason: opts.exitReason || null,
      orderIndex: opts.orderIndex ?? null,
    },
  };
}

function buildGeneratorPluginInvocation(stageId, opts = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId: opts.moduleId || null,
    gateId: opts.gateId || null,
    causationRef: opts.causationRef || null,
  });
}

function buildValidatorStateSnapshot(config, progress, opts = {}, deps = {}) {
  return {
    pipeline: {
      project: config?.project || null,
      run_id: getRunId(config),
      resume: opts.resume === true,
      arch_validation_enabled: opts.archEnabled !== false,
      has_started_modules: opts.hasStartedModules === true,
    },
    modules: {
      total: Object.keys(progress?.modules || {}).length,
      started: hasAnyStartedModules(config, progress, deps),
    },
    gates: {
      total: Object.keys(progress?.gates || {}).length,
    },
  };
}

function buildValidatorRunInput(config, progress, stageId, opts = {}, deps = {}) {
  const runId = getRunId(config);
  const validatorName = String(stageId || '').split(':')[1] || stageId || 'unknown';

  return {
    refs: buildStageRefs({
      runRef: { prefix: 'run', parts: [runId] },
      validatorResultRef: { prefix: 'validator_result', parts: [runId, validatorName] },
    }),
    ids: {
      runId,
      validatorName,
      scope: 'run',
      stageId,
    },
    validator: {
      config: {
        ...(config?.arch_validation && typeof config.arch_validation === 'object' ? config.arch_validation : {}),
        ...(progress?.arch_validation && typeof progress.arch_validation === 'object' ? progress.arch_validation : {}),
      },
    },
    artifacts: [],
    stateSnapshot: buildValidatorStateSnapshot(config, progress, opts, deps),
    executionContext: {
      resume: opts.resume === true,
      hasStartedModules: opts.hasStartedModules === true,
      archEnabled: opts.archEnabled !== false,
    },
  };
}

function buildValidatorPluginInvocation(stageId, opts = {}) {
  return buildStagePluginInvocation(stageId, {
    resume: opts.resume === true,
  });
}

function validateArchitectureValidatorControlResult(result, stageId = 'validator:architecture') {
  const errors = [];
  if (!result || typeof result !== 'object') {
    errors.push('result must be an object');
    return errors;
  }
  if (result.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (result.producerKind !== 'validator') errors.push("producerKind must be 'validator'");
  if (result.producerType !== 'architecture') errors.push("producerType must be 'architecture'");
  if (!['pass', 'block'].includes(result.nextAction)) {
    errors.push("nextAction must be 'pass' or 'block' for validator:architecture");
  }
  if (typeof stageId === 'string' && stageId === 'validator:architecture') {
    const metadata = result?.diagnostics?.metadata || result?.diagnostics?.typed?.validator?.metadata || {};
    if (metadata?.blocked === true && result.nextAction !== 'block') {
      errors.push('blocked validator metadata must map to nextAction=block');
    }
  }
  return errors;
}

function normalizeArchitectureValidatorResult(config, rawResult, opts = {}) {
  const controlResult = coerceArchitectureValidatorControlResult(config, rawResult, opts);
  const errors = validateArchitectureValidatorControlResult(controlResult, opts.stageId);
  if (errors.length > 0) {
    throw new Error(`Architecture validator returned invalid control result: ${errors.join('; ')}`);
  }
  return controlResult;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateGeneratorExecutionResult(result, stageId = 'generator:unknown') {
  const errors = [];
  const expectedProducerType = String(stageId || '').split(':')[1] || stageId || 'unknown';

  if (!isPlainObject(result)) {
    errors.push('result must be an object');
    return errors;
  }

  if (result.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (result.producerKind !== 'generator') errors.push("producerKind must be 'generator'");
  if (result.producerType !== expectedProducerType) errors.push(`producerType must be '${expectedProducerType}'`);
  if (!isPlainObject(result.outputs)) {
    errors.push('outputs must be an object');
  } else if (typeof result.outputs.status !== 'string' || !result.outputs.status.trim()) {
    errors.push('outputs.status must be a non-empty string');
  }
  if (result.artifacts !== undefined && !Array.isArray(result.artifacts)) errors.push('artifacts must be an array when provided');
  if (result.diagnostics !== undefined && !isPlainObject(result.diagnostics)) errors.push('diagnostics must be an object when provided');

  return errors;
}

function normalizeGeneratorExecutionResult(rawResult, stageId = 'generator:unknown') {
  const errors = validateGeneratorExecutionResult(rawResult, stageId);
  if (errors.length > 0) {
    throw new Error(`Generator '${stageId}' returned invalid result: ${errors.join('; ')}`);
  }
  return rawResult;
}

export async function runScheduledValidator(config, progress, stageId, opts = {}, deps = {}) {
  const validatorInput = buildValidatorRunInput(config, progress, stageId, opts, deps);

  let executeValidator;
  let record;
  try {
    ({ handler: executeValidator, record } = requireStageHandler(config, 'validator.run', stageId, 'run'));
  } catch (error) {
    log('ERROR', `[validator] ${stageId} registry resolution failed: ${error.message}`);
    return buildArchitectureValidatorControlResult(config, { blocked: true, findings: [] }, {
      ...opts,
      input: validatorInput,
      stageId,
      executionFailed: true,
      error: error?.message || 'unknown validator registry resolution error',
    });
  }

  const pluginContext = createPluginContext({
    config,
    progress,
    hookFamily: 'validator.run',
    stageId,
    record,
    invocation: buildValidatorPluginInvocation(stageId, opts),
    stateSnapshot: async () => validatorInput.stateSnapshot,
    environmentMetadata: {
      resume: opts.resume === true,
      hasStartedModules: opts.hasStartedModules === true,
      archEnabled: opts.archEnabled !== false,
    },
  });

  try {
    const rawResult = await executeValidator(
      buildPluginInvocationEnvelope(validatorInput, pluginContext),
      pluginContext,
    );
    return normalizeArchitectureValidatorResult(config, rawResult, { ...opts, input: validatorInput, stageId });
  } catch (error) {
    log('ERROR', `[validator] ${stageId} execution failed: ${error.message}`);
    return buildArchitectureValidatorControlResult(config, { blocked: true, findings: [] }, {
      ...opts,
      input: validatorInput,
      stageId,
      executionFailed: true,
      contractInvalid: /invalid control result/i.test(String(error?.message || '')),
      error: error?.message || 'unknown validator execution error',
    });
  }
}

export async function runScheduledGenerator(config, progress, stageId, opts = {}, deps = {}) {
  let executeGenerator;
  let record;
  try {
    ({ handler: executeGenerator, record } = requireStageHandler(config, 'generator.run', stageId, 'run'));
  } catch (error) {
    log('WARN', `[generator] ${stageId} registry resolution failed: ${error.message}`);
    return {
      schemaVersion: 'v1',
      producerKind: 'generator',
      producerType: String(stageId || '').split(':')[1] || stageId || 'unknown',
      outputs: {
        status: 'failed',
      },
      diagnostics: {
        error: error?.message || 'unknown generator registry resolution error',
      },
    };
  }

  const generatorInput = buildGeneratorRunInput(config, progress, stageId, opts, deps);
  const pluginContext = createPluginContext({
    config,
    progress,
    hookFamily: 'generator.run',
    stageId,
    record,
    invocation: buildGeneratorPluginInvocation(stageId, opts),
    stateSnapshot: async () => generatorInput.stateSnapshot,
    environmentMetadata: {
      scheduleReason: opts.scheduleReason || null,
      mode: opts.mode || 'full',
      exitCode: opts.exitCode ?? null,
      exitReason: opts.exitReason || null,
    },
  });

  try {
    const rawResult = await executeGenerator(
      buildPluginInvocationEnvelope(generatorInput, pluginContext),
      pluginContext,
    );
    return normalizeGeneratorExecutionResult(rawResult, stageId);
  } catch (error) {
    log('WARN', `[generator] ${stageId} degraded: ${error.message}`);
    const errorMessage = error?.message || 'unknown';
    const contractInvalid = /returned invalid result/i.test(errorMessage);
    return {
      schemaVersion: 'v1',
      producerKind: 'generator',
      producerType: generatorInput.ids.generatorType,
      outputs: {
        status: 'failed',
        reason: errorMessage,
      },
      diagnostics: {
        error: errorMessage,
        ...(contractInvalid ? { contract_invalid: true } : {}),
      },
    };
  }
}

export function findNextStep(config, progress, deps = {}) {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const gates = progress?.gates || null;
  for (const stepId of executionOrder) {
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = gates?.[gateId];
      const gateProjection = projectPipelineGateState(config, gateId, gate, deps);

      if (gateProjection?.scheduler_consumed === true || gateProjection?.completed === true) {
        if (gate?.type === 'approval') {
          log('INFO', `Gate '${gateId}' already consumed via canonical approval lifecycle (${gateProjection.status}) — skipping`);
        } else if (gateProjection?.completion_source === 'gate_status') {
          log('INFO', `Gate '${gateId}' completed via gate-status.json fallback — skipping`);
        } else if (gateProjection?.completion_source === 'output_file') {
          if (gate?.type === 'approval') {
            log('INFO', `Gate '${gateId}' completed via gate-status.json (output_file missing) — skipping`);
          } else {
            log('INFO', `Gate '${gateId}' completed via output_file — skipping`);
          }
        } else if (gateProjection?.status === 'TIMED_OUT' && gateProjection?.continued === true) {
          log('INFO', `Gate '${gateId}' already consumed via approval timeout-continue compatibility state — skipping`);
        }
        continue;
      }

      return { type: 'gate', id: gateId };
    }

    const mod = progress.modules[stepId];
    if (!mod) continue;
    const lifecycleModule = loadAuthoritativeModuleState(config, progress, stepId, {
      loadStatusFn: deps.loadStatus,
    });
    if (lifecycleModule?.status === STATUS.PASS) continue;
    if (lifecycleModule?.status === STATUS.BLOCKED) return { type: 'blocked', id: stepId };
    if (lifecycleModule?.status === STATUS.FAIL) log('INFO', `Module ${stepId} is FAIL (${lifecycleModule.fail_count || 0} attempts) — will retry`);
    else if (lifecycleModule?.status && lifecycleModule.status !== STATUS.PENDING) log('INFO', `Module ${stepId} resuming from ${lifecycleModule.status}`);
    return { type: 'module', id: stepId };
  }
  return { type: 'done' };
}

export async function preparePipeline(config, progress, deps = {}) {
  const releaseGateFilesFn = deps.releaseGateFiles || releaseGateFiles;
  const syncControlFilesFn = deps.syncControlFiles || syncControlFiles;

  try { await releaseGateFilesFn(config, progress); }
  catch (e) { log('WARN', `Gate files release failed (non-critical): ${e.message}`); }

  try { await syncControlFilesFn(config, progress); }
  catch (e) { log('WARN', `Control file sync failed (non-critical): ${e.message}`); }
}
