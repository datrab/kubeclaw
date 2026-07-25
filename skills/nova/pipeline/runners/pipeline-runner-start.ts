import fs from 'fs';
import path from 'path';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { log } from '../core/logger.ts';
import { appendPipelineLifecycleEvent } from '../services/status-store.ts';
import { ensurePipelineRunLogDir } from '../core/paths.ts';
import { STATUS } from '../core/constants.ts';
import { extractArchValidatorReport } from '../services/arch-validator.ts';
import { loadLifecycleReadModels } from '../services/status-store-lifecycle.ts';
import {
  onPipelineStarted,
  onPipelineHalted,
  onEscalated,
  emitOperatorAlert,
} from '../services/telemetry.ts';
import { initGovernanceCtx, recordArchValidatorResult } from '../services/governance-context.ts';
import {
  resolveResultAttempt,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveResultDispatchId,
} from '../services/correlation.ts';
import { resumeDurableCooldownForStep } from '../services/rate-limit.ts';
import {
  _telemetryCtx,
  buildResultWithStepCorrelation,
  hasAnyStartedModules,
  loadAuthoritativeModuleState,
} from './pipeline-runner-shared.ts';
import {
  preparePipeline,
  runScheduledValidator as runScheduledValidatorImpl,
} from './pipeline-runner-scheduling.ts';
import {
  emitPipelineSummaryLifecycle,
  finalizeTerminalHalt,
  processExitCodeForTerminalStatus,
  normalizeStepResultForPipeline,
} from './pipeline-runner-terminal.ts';
import { getPipelineRunnerDeps } from './pipeline-runner-deps.ts';
import { getArchValidationConfig } from '../services/runtime-defaults.ts';
import {
  architectureBlockingFindings,
  architectureValidationBlockSummary,
  architectureValidationEnabled,
  architectureValidatorDiscordFields,
  installArchitectureApprovalGate,
} from './pipeline-runner-architecture.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

const SINGLE_MODULE_COMPLETE_REASON = 'single_module_complete';
const SINGLE_MODULE_DEFAULT_TERMINAL_STATUS = 'failed';

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function ensureRunScopedLogDir(config: AnyRecord): void {
  // initLogDir() sets these during normal CLI startup, but direct calls from
  // tests/programmatic users still need a run-scoped directory.
  ensurePipelineRunLogDir(config);
}

function writeConfigValidationSnapshot(config: AnyRecord): void {
  const runLogDir = ensurePipelineRunLogDir(config);
  if (!runLogDir) return;
  try {
    const snapshot = {
      ts: new Date().toISOString(),
      project: config.project,
      run_id: selectDefinedValue(() => (selectDefinedValue(() => (config._runId), () => (config.run_id))), () => (null)),
      fallback_model: config.fallback_model,
      config_validation_issues: listValue(config._runStats?.config_validation_issues),
    };
    fs.writeFileSync(path.join(runLogDir, 'config-validation.json'), JSON.stringify(snapshot, null, 2));
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): this side effect is noncritical and the owning operation remains authoritative. */ /* non-critical */ }
}

function buildStartDescription(config: AnyRecord, progress: AnyRecord, opts: AnyRecord, deps: AnyRecord): string {
  if (opts.module) return `Single module: ${opts.module}`;

  const pendingModules = progress.execution_order.filter((s: string) => {
    if (selectTruthyValue(() => (s.startsWith('gate:')), () => (s.startsWith('validator:')))) return false;
    const moduleId = s.startsWith('module:') ? s.slice('module:'.length) : s;
    const mod = progress.modules[moduleId];
    if (!mod) return false;
    const authoritative = loadAuthoritativeModuleState(config, progress, moduleId);
    return selectTruthyValue(() => (!authoritative), () => (authoritative.status !== STATUS.PASS));
  }).length;
  const totalModules = progress.execution_order.filter((s: string) => {
    if (selectTruthyValue(() => (s.startsWith('gate:')), () => (s.startsWith('validator:')))) return false;
    const moduleId = s.startsWith('module:') ? s.slice('module:'.length) : s;
    return Boolean(progress.modules?.[moduleId]);
  }).length;
  const totalGates = progress.execution_order.filter((s: string) => s.startsWith('gate:')).length;
  return `Full pipeline: ${pendingModules}/${totalModules} modules pending, ${totalGates} gate(s)`;
}

export async function startPipelineRun(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<void> {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx: AnyRecord = _telemetryCtx(config) ?? { config, runId: config._runId ?? config.run_id };
  config._progress = progress;

  ensureRunScopedLogDir(config);
  writeConfigValidationSnapshot(config);

  log('STEP', `╔═══════════════════════════════════════════════════╗`);
  log('STEP', `║  PIPELINE: ${config.project.toUpperCase().padEnd(38)}║`);
  log('STEP', `╚═══════════════════════════════════════════════════╝`);
  const existingPipelineState = selectTruthyValue(() => (loadLifecycleReadModels(config)?.pipeline), () => (null));
  const runId = selectDefinedValue(() => (config._runId), () => (null));
  const resumeExistingRun = opts.resume === true
    && existingPipelineState?.run_id === runId
    && existingPipelineState?.status;
  if (!resumeExistingRun) {
    appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress, opts });
  }

  if (resumeExistingRun) return;

  await onPipelineStarted(ctx, progress, {
    presentation: {
      discord: {
        level: 'INFO',
        title: `Pipeline started: ${config.project}`,
        description: buildStartDescription(config, progress, opts, deps),
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: config._runId }),
      },
    },
  });
}

export async function runSingleModulePipeline(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<any> {
  if (!opts.module) return null;

  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx: AnyRecord = _telemetryCtx(config) ?? { config, runId: config._runId ?? config.run_id };
  await resumeDurableCooldownForStep(config, progress, { type: 'module', id: opts.module }, {
    budget: selectTruthyValue(() => (opts.budget), () => (null)),
  });
  const result = await deps.runModule(config, progress, opts.module, { novaPrompt: opts.novaPrompt, deps: opts.deps, budget: selectTruthyValue(() => (opts.budget), () => (null)), signal: selectTruthyValue(() => (opts.signal), () => (null)) });
  const normalizedResult = normalizeStepResultForPipeline(result, { stepType: 'module', stepId: opts.module });
  const stepResult = normalizedResult.stepResult;
  const terminalStatus = selectDefinedValue(() => (normalizedResult.terminalStatus), () => (SINGLE_MODULE_DEFAULT_TERMINAL_STATUS));
  const singleModuleExitCode = processExitCodeForTerminalStatus(terminalStatus);
  if (terminalStatus !== 'succeeded') {
    return finalizeTerminalHalt(config, progress, {
      stepType: 'module',
      stepId: opts.module,
      result,
      opts,
      summaryReason: terminalStatus === 'rate_limited' ? `rate_limited:${opts.module}` : `single_module:${opts.module}`,
      scheduleProjectSummaryOnBlocked: false,
    });
  }

  return finalizeSingleModuleSuccess({ config, progress, opts, deps, ctx, normalizedResult, stepResult, terminalStatus, singleModuleExitCode });
}

async function finalizeSingleModuleSuccess(input: AnyRecord) {
  const { config, progress, opts, deps, ctx, normalizedResult, stepResult, terminalStatus, singleModuleExitCode } = input;
  const resultWithStatusCorrelation = buildResultWithStepCorrelation(config, progress, 'module', opts.module, {
    terminal_status: terminalStatus,
    terminal_decision: selectTruthyValue(() => (normalizedResult.terminalDecision), () => (null)),
    reason: selectDefinedValue(() => (stepResult?.diagnostics?.summary), () => (SINGLE_MODULE_COMPLETE_REASON)),
    ...objectValue(stepResult?.correlation),
  }, deps);
  const singleModuleAttempt = resolveResultAttempt(resultWithStatusCorrelation);
  const singleModuleDispatchId = resolveResultDispatchId(resultWithStatusCorrelation);
  const singleModuleGatewayLabel = resolveResultGatewayLabel(resultWithStatusCorrelation);
  const singleModuleSessionKey = resolveResultSessionKey(resultWithStatusCorrelation);
  appendPipelineLifecycleEvent(config, 'pipeline_run.halted', {
    progress,
    result: {
      terminal_status: terminalStatus,
      terminal_decision: selectTruthyValue(() => (normalizedResult.terminalDecision), () => (null)),
      reason: 'single_module_complete',
      attempt: singleModuleAttempt,
      dispatch_id: singleModuleDispatchId,
      gateway_label: singleModuleGatewayLabel,
      session_key: singleModuleSessionKey,
      fail_count: selectDefinedValue(() => (stepResult?.diagnostics?.metadata?.fail_count), () => (null)),
    },
    stepType: 'module',
    stepId: opts.module,
    haltReason: 'single_module_complete',
  });
  deps.output({ exit: singleModuleExitCode, ...resultWithStatusCorrelation });
  const singleModuleDiscordCorrelation = {
    run_id: selectDefinedValue(() => (selectDefinedValue(() => (config._runId), () => (config.run_id))), () => (null)),
    module_id: opts.module,
    step_type: 'module',
    attempt: singleModuleAttempt,
    dispatch_id: singleModuleDispatchId,
    gateway_label: singleModuleGatewayLabel,
    session_key: singleModuleSessionKey,
  };
  await deps.discord(config, 'OK', 'Pipeline: single module done', `Module ${opts.module} completed successfully.`,
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, singleModuleDiscordCorrelation),
    { deps: opts.deps, correlation: singleModuleDiscordCorrelation }
  );
  emitPipelineSummaryLifecycle(config, ctx, terminalStatus, `single_module:${opts.module}`, progress, deps.writeSummary, selectTruthyValue(() => (normalizedResult.terminalDecision), () => (null)));
  return singleModuleExitCode;
}

async function maybeRunArchitectureValidation(config: AnyRecord, progress: AnyRecord, opts: AnyRecord, deps: AnyRecord, ctx: AnyRecord): Promise<any> {
  // Pre-pipeline architecture validation — runs on fresh starts and on resume
  // only if no module work has started yet. progress.json overrides swarm.config.
  const archConfig = getArchValidationConfig(config);
  const archEnabled = architectureValidationEnabled(progress, archConfig);
  const hasStartedModules = hasAnyStartedModules(config, progress, deps);
  const shouldRunArchValidation = archEnabled
    && !opts.skipArchValidation
    && (selectTruthyValue(() => (!opts.resume), () => (!hasStartedModules)));
  if (!shouldRunArchValidation) return null;

  const archCorrelation = {
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (config._runId), () => (config.run_id))), () => ('missing_run_id')),
    step_type: 'arch_validation',
    step_id: 'validator:architecture',
  };
  const archModel = selectTruthyValue(
    () => (progress?.arch_validation?.model),
    () => (selectTruthyValue(() => (archConfig.model), () => ('configured default'))),
  );
  await deps.discord(config, 'INFO', 'Architecture Validator started',
    'Pre-pipeline architecture validation is running before module work begins.',
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, archCorrelation, [
      { name: 'Model', value: String(archModel), inline: true },
      { name: 'Next', value: 'Module Forge starts after the validator passes.', inline: false },
    ]),
    { deps: opts.deps, correlation: archCorrelation },
  );

  const archResult = await runScheduledValidatorImpl(config, progress, 'validator:architecture', {
    resume: opts.resume === true,
    hasStartedModules,
    archEnabled,
  }, deps);
  const archReport = extractArchValidatorReport(archResult, config);
  recordArchValidatorResult(config, archResult);

  if (archResult.nextAction !== 'block') {
    return handlePassingArchitectureValidation({ config, progress, opts, deps, archConfig, archReport, archCorrelation });
  }

  const isExecutionError = archReport.execution_failed === true;
  const blockingFindings = architectureBlockingFindings(archReport.findings);
  const summary = architectureValidationBlockSummary(archResult, archReport, blockingFindings);

  return finalizeArchitectureValidationBlock({ config, progress, deps, ctx, isExecutionError, blockingFindings, summary });
}

async function finalizeArchitectureValidationBlock(input: AnyRecord) {
  const { config, progress, deps, ctx, isExecutionError, blockingFindings, summary } = input;
  const status = isExecutionError ? 'failed' : 'blocked';
  const reason = isExecutionError ? 'ARCH_VALIDATION_ERROR' : 'ARCH_VALIDATION_BLOCKED';
  const exit = processExitCodeForTerminalStatus(status);
  const description = isExecutionError ? 'Architecture validator execution failed before module execution.' : `Architecture validation failed before module execution. ${blockingFindings.length} blocking/error finding(s).`;
  const action = isExecutionError ? 'Fix validator configuration/runtime and rerun' : 'Fix architecture issues, then --resume';
  await emitOperatorAlert(ctx, 'pipeline.operator_alert', { step_type: 'arch_validation', terminal_status: status, reason: summary }, {
    hookId: 'pipeline.completed', presentation: { discord: { level: 'CRITICAL', title: `Pipeline ${isExecutionError ? 'halted' : 'blocked'}: ${config.project}`, description,
      fields: [...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: selectDefinedValue(() => (config._runId), () => (selectDefinedValue(() => (config.run_id), () => ('missing_run_id')))), step_type: 'arch_validation' }), { name: isExecutionError ? 'Reason' : 'Blocking/Error Findings', value: summary.slice(0, 1000) }, { name: 'Action', value: action }] } },
  });
  deps.output({ exit, terminal_status: status, reason, ...(isExecutionError ? { error: summary } : { findings: blockingFindings.length }) });
  onEscalated(ctx, 'step', 'arch-validation', { action: isExecutionError ? 'ERROR' : 'BLOCKED', last_failure: isExecutionError ? summary : 'Architecture validation failed before module execution', step_type: 'arch_validation', step_id: 'arch-validation', terminal_status: status });
  onPipelineHalted(ctx, { step_type: 'arch_validation', step_id: 'arch-validation', terminal_status: status, reason });
  emitPipelineSummaryLifecycle(config, ctx, status, reason, progress, deps.writeSummary);
  return exit;
}

async function handlePassingArchitectureValidation(input: AnyRecord) {
  const { config, progress, opts, deps, archConfig, archReport, archCorrelation } = input;
  const findingCount = Array.isArray(archReport?.findings) ? archReport.findings.length : 0;
  if (findingCount === 0) {
    await deps.discord(config, 'OK', 'Architecture Validator passed', 'Pre-pipeline architecture validation passed; module execution can continue.', architectureValidatorDiscordFields(archCorrelation, archReport), { deps: opts.deps, correlation: archCorrelation });
    return null;
  }
  const approvalGateId = installArchitectureApprovalGate(progress, archConfig, archReport);
  const approvalResult = await deps.runGate(config, progress, approvalGateId, { deps: opts.deps, attempt: 1, budget: opts.budget ?? null, signal: opts.signal ?? null });
  const normalized = normalizeStepResultForPipeline(approvalResult, { stepType: 'gate', stepId: approvalGateId });
  if (normalized.shouldContinue) return null;
  return finalizeTerminalHalt(config, progress, { stepType: 'gate', stepId: approvalGateId, result: approvalResult, opts, summaryReason: 'architecture_findings_approval', scheduleProjectSummaryOnBlocked: false });
}

export async function preparePipelineStart(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<any> {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx = { ..._telemetryCtx(config), deps: selectTruthyValue(() => (opts.deps), () => (null)) };

  initGovernanceCtx(config);
  await preparePipeline(config, progress, deps);
  return maybeRunArchitectureValidation(config, progress, opts, deps, ctx);
}
