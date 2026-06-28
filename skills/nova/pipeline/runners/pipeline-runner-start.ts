// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
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
import { writeCostReport } from '../services/observability.ts';
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

type AnyRecord = Record<string, any>;

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
      run_id: config._runId ?? config.run_id ?? null,
      fallback_model: config.fallback_model,
      config_validation_issues: config._runStats?.config_validation_issues ?? [],
    };
    fs.writeFileSync(path.join(runLogDir, 'config-validation.json'), JSON.stringify(snapshot, null, 2));
  } catch (_error) { /* non-critical */ }
}

function buildStartDescription(config: AnyRecord, progress: AnyRecord, opts: AnyRecord, deps: AnyRecord): string {
  if (opts.module) return `Single module: ${opts.module}`;

  const pendingModules = progress.execution_order.filter((s: string) => {
    if (s.startsWith('gate:') || s.startsWith('validator:')) return false;
    const moduleId = s.startsWith('module:') ? s.slice('module:'.length) : s;
    const mod = progress.modules[moduleId];
    if (!mod) return false;
    const authoritative = loadAuthoritativeModuleState(config, progress, moduleId);
    return !authoritative || authoritative.status !== STATUS.PASS;
  }).length;
  const totalModules = progress.execution_order.filter((s: string) => {
    if (s.startsWith('gate:') || s.startsWith('validator:')) return false;
    const moduleId = s.startsWith('module:') ? s.slice('module:'.length) : s;
    return Boolean(progress.modules?.[moduleId]);
  }).length;
  const totalGates = progress.execution_order.filter((s: string) => s.startsWith('gate:')).length;
  return `Full pipeline: ${pendingModules}/${totalModules} modules pending, ${totalGates} gate(s)`;
}

export async function startPipelineRun(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<void> {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx = _telemetryCtx(config);
  config._progress = progress;

  ensureRunScopedLogDir(config);
  writeConfigValidationSnapshot(config);

  log('STEP', `╔═══════════════════════════════════════════════════╗`);
  log('STEP', `║  PIPELINE: ${config.project.toUpperCase().padEnd(38)}║`);
  log('STEP', `╚═══════════════════════════════════════════════════╝`);
  const existingPipelineState = loadLifecycleReadModels(config)?.pipeline || null;
  const runId = config._runId ?? config.run_id ?? null;
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
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: config._runId ?? config.run_id ?? 'unknown' }),
      },
    },
  });
}

export async function runSingleModulePipeline(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<any> {
  if (!opts.module) return null;

  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx = _telemetryCtx(config);
  await resumeDurableCooldownForStep(config, progress, { type: 'module', id: opts.module }, {
    budget: opts.budget || null,
  });
  const result = await deps.runModule(config, progress, opts.module, { novaPrompt: opts.novaPrompt, deps: opts.deps, budget: opts.budget || null, signal: opts.signal || null });
  const normalizedResult = normalizeStepResultForPipeline(result, { stepType: 'module', stepId: opts.module });
  const stepResult = normalizedResult.stepResult;
  const terminalStatus = normalizedResult.terminalStatus || 'failed';
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

  const resultWithStatusCorrelation = buildResultWithStepCorrelation(config, progress, 'module', opts.module, {
    terminal_status: terminalStatus,
    terminal_decision: normalizedResult.terminalDecision || null,
    reason: stepResult?.diagnostics?.summary || 'single_module_complete',
    ...(stepResult?.correlation || {}),
  }, deps);
  const singleModuleAttempt = resolveResultAttempt(resultWithStatusCorrelation);
  const singleModuleDispatchId = resolveResultDispatchId(resultWithStatusCorrelation);
  const singleModuleGatewayLabel = resolveResultGatewayLabel(resultWithStatusCorrelation);
  const singleModuleSessionKey = resolveResultSessionKey(resultWithStatusCorrelation);
  appendPipelineLifecycleEvent(config, 'pipeline_run.halted', {
    progress,
    result: {
      terminal_status: terminalStatus,
      terminal_decision: normalizedResult.terminalDecision || null,
      reason: 'single_module_complete',
      attempt: singleModuleAttempt,
      dispatch_id: singleModuleDispatchId,
      gateway_label: singleModuleGatewayLabel,
      session_key: singleModuleSessionKey,
      fail_count: stepResult?.diagnostics?.metadata?.fail_count ?? null,
    },
    stepType: 'module',
    stepId: opts.module,
    haltReason: 'single_module_complete',
  });
  deps.output({ exit: singleModuleExitCode, ...resultWithStatusCorrelation });
  const singleModuleDiscordCorrelation = {
    run_id: config._runId ?? config.run_id ?? null,
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
  emitPipelineSummaryLifecycle(config, ctx, terminalStatus, `single_module:${opts.module}`, progress, deps.writeSummary, normalizedResult.terminalDecision || null);
  return singleModuleExitCode;
}

async function maybeRunArchitectureValidation(config: AnyRecord, progress: AnyRecord, opts: AnyRecord, deps: AnyRecord, ctx: AnyRecord): Promise<any> {
  // Pre-pipeline architecture validation — runs on fresh starts and on resume
  // only if no module work has started yet. progress.json overrides swarm.config.
  const archConfig = getArchValidationConfig(config);
  const archEnabled = progress.arch_validation?.enabled ?? archConfig.enabled;
  const hasStartedModules = hasAnyStartedModules(config, progress, deps);
  const shouldRunArchValidation = archEnabled
    && !opts.skipArchValidation
    && (!opts.resume || !hasStartedModules);
  if (!shouldRunArchValidation) return null;

  const archResult = await runScheduledValidatorImpl(config, progress, 'validator:architecture', {
    resume: opts.resume === true,
    hasStartedModules,
    archEnabled,
  }, deps);
  const archReport = extractArchValidatorReport(archResult, config);
  recordArchValidatorResult(config, archResult);

  if (archResult.nextAction !== 'block') return null;

  const isExecutionError = archReport.execution_failed === true;
  const blockingFindings = archReport.findings.filter((finding: AnyRecord) => finding?.severity === 'blocking');
  const summary = blockingFindings.map((finding: AnyRecord) => `[${finding.id}] ${finding.explanation}`).join('; ')
    || archResult?.diagnostics?.summary
    || archReport.error
    || 'Architecture validation failed before module execution';

  if (isExecutionError) {
    const terminalStatus = 'failed';
    const terminalExitCode = processExitCodeForTerminalStatus(terminalStatus);
    await emitOperatorAlert(ctx, 'pipeline.operator_alert', {
      step_type: 'arch_validation',
      terminal_status: terminalStatus,
      reason: summary,
    }, {
      hookId: 'pipeline.completed',
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Pipeline halted: ${config.project}`,
          description: 'Architecture validator execution failed before module execution.',
          fields: [
            ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: config._runId || config.run_id || 'unknown', step_type: 'arch_validation' }),
            { name: 'Reason', value: summary.slice(0, 1000) },
            { name: 'Action', value: 'Fix validator configuration/runtime and rerun' },
          ],
        },
      },
    });
    deps.output({ exit: terminalExitCode, terminal_status: terminalStatus, reason: 'ARCH_VALIDATION_ERROR', error: summary });
    onEscalated(ctx, 'step', 'arch-validation', {
      action: 'ERROR',
      last_failure: summary,
      step_type: 'arch_validation',
      step_id: 'arch-validation',
      terminal_status: terminalStatus,
    });
    onPipelineHalted(ctx, {
      step_type: 'arch_validation',
      step_id: 'arch-validation',
      terminal_status: terminalStatus,
      reason: 'ARCH_VALIDATION_ERROR',
    });
    emitPipelineSummaryLifecycle(config, ctx, terminalStatus, 'ARCH_VALIDATION_ERROR', progress, deps.writeSummary);
    try { writeCostReport(config); } catch (_error) { /* non-critical */ }
    return terminalExitCode;
  }

  const terminalStatus = 'blocked';
  const terminalExitCode = processExitCodeForTerminalStatus(terminalStatus);
  await emitOperatorAlert(ctx, 'pipeline.operator_alert', {
    step_type: 'arch_validation',
    terminal_status: terminalStatus,
    reason: summary,
  }, {
    hookId: 'pipeline.completed',
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Pipeline blocked: ${config.project}`,
        description: `Architecture validation failed before module execution. ${blockingFindings.length} blocking finding(s).`,
        fields: [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: config._runId || config.run_id || 'unknown', step_type: 'arch_validation' }),
          { name: 'Blocking Findings', value: summary.slice(0, 1000) },
          { name: 'Action', value: 'Fix architecture issues, then --resume' },
        ],
      },
    },
  });
  deps.output({ exit: terminalExitCode, terminal_status: terminalStatus, reason: 'ARCH_VALIDATION_BLOCKED', findings: blockingFindings.length });
  onEscalated(ctx, 'step', 'arch-validation', {
    action: 'BLOCKED',
    last_failure: 'Architecture validation failed before module execution',
    step_type: 'arch_validation',
    step_id: 'arch-validation',
    terminal_status: terminalStatus,
  });
  onPipelineHalted(ctx, {
    step_type: 'arch_validation',
    step_id: 'arch-validation',
    terminal_status: terminalStatus,
    reason: 'ARCH_VALIDATION_BLOCKED',
  });
  emitPipelineSummaryLifecycle(config, ctx, terminalStatus, 'ARCH_VALIDATION_BLOCKED', progress, deps.writeSummary);
  try { writeCostReport(config); } catch (_error) { /* non-critical */ }
  return terminalExitCode;
}

export async function preparePipelineStart(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<any> {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx = { ..._telemetryCtx(config), deps: opts.deps || null };

  initGovernanceCtx(config);
  await preparePipeline(config, progress, deps);
  return maybeRunArchitectureValidation(config, progress, opts, deps, ctx);
}
