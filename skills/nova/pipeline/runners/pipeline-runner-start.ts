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

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

const ARCH_VALIDATION_PRE_MODULE_FAILURE = 'Architecture validation failed before module execution';
const ARCHITECTURE_APPROVAL_GATE_ID = 'architecture-approval';
const SINGLE_MODULE_COMPLETE_REASON = 'single_module_complete';
const SINGLE_MODULE_DEFAULT_TERMINAL_STATUS = 'failed';

function architectureValidationEnabled(progress: AnyRecord, archConfig: AnyRecord): boolean {
  if (typeof progress?.arch_validation?.enabled === 'boolean') return progress.arch_validation.enabled;
  if (typeof archConfig?.enabled === 'boolean') return archConfig.enabled;
  throw new Error('Architecture validation requires typed enabled authority');
}

function architectureValidationBlockSummary(archResult: AnyRecord, archReport: AnyRecord, blockingFindings: AnyRecord[]): string {
  const findingsSummary = blockingFindings.map((finding: AnyRecord) => `[${finding.id}] ${finding.explanation}`).join('; ');
  if (findingsSummary) return findingsSummary;
  if (typeof archResult?.diagnostics?.summary === 'string' && archResult.diagnostics.summary.trim()) return archResult.diagnostics.summary.trim();
  if (typeof archReport?.error === 'string' && archReport.error.trim()) return archReport.error.trim();
  return ARCH_VALIDATION_PRE_MODULE_FAILURE;
}

function architectureBlockingFindings(findings: AnyRecord[] = []): AnyRecord[] {
  return findings.filter((finding: AnyRecord) => finding?.severity === 'blocking' || finding?.severity === 'error');
}

function architectureFindingLabel(finding: AnyRecord): string {
  const id = typeof finding?.id === 'string' && finding.id.trim() ? finding.id.trim() : 'finding_id_missing';
  const severity = typeof finding?.severity === 'string' && finding.severity.trim() ? finding.severity.trim() : 'severity_missing';
  const explanation = typeof finding?.explanation === 'string' && finding.explanation.trim()
    ? finding.explanation.trim()
    : 'explanation_missing';
  return `[${id}] ${severity}: ${explanation}`;
}

function architectureFindingDetails(findings: AnyRecord[], maxFindings = 6): string {
  const lines = findings.slice(0, maxFindings).map(architectureFindingLabel);
  if (findings.length > maxFindings) lines.push(`… ${findings.length - maxFindings} more finding(s)`);
  return lines.join('\n');
}

function architectureValidatorDiscordFields(archCorrelation: AnyRecord, archReport: AnyRecord, extra: AnyRecord[] = []): AnyRecord[] {
  const findings = Array.isArray(archReport?.findings) ? archReport.findings : [];
  const fields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, archCorrelation, [
    { name: 'Findings', value: String(findings.length), inline: true },
    ...extra,
  ]);
  if (findings.length) {
    fields.push({ name: 'Finding Details', value: architectureFindingDetails(findings).slice(0, 1024), inline: false });
  }
  return fields;
}

function requireArchitectureApprovalTimeout(progress: AnyRecord, archConfig: AnyRecord): number {
  const explicit = selectDefinedValue(
    () => (progress?.arch_validation?.approval_gate?.timeout_minutes),
    () => (archConfig?.approval_gate?.timeout_minutes),
  );
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  throw new Error('Architecture findings approval requires progress.arch_validation.approval_gate.timeout_minutes or config.arch_validation.approval_gate.timeout_minutes');
}

function installArchitectureApprovalGate(progress: AnyRecord, archConfig: AnyRecord, archReport: AnyRecord): string {
  const findings = Array.isArray(archReport?.findings) ? archReport.findings : [];
  progress.gates = objectValue(progress.gates);
  progress.gates[ARCHITECTURE_APPROVAL_GATE_ID] = {
    type: 'approval',
    title: 'Architecture findings approval',
    timeout_minutes: requireArchitectureApprovalTimeout(progress, archConfig),
    on_timeout: 'block',
    description: [
      'Architecture Validator passed with advisory findings. Approve to continue module work, or deny to send it back for changes.',
      '',
      architectureFindingDetails(findings, 12),
    ].join('\n').trim(),
  };
  progress.execution_order = Array.isArray(progress.execution_order) ? progress.execution_order : [];
  const step = `gate:${ARCHITECTURE_APPROVAL_GATE_ID}`;
  if (!progress.execution_order.includes(step)) progress.execution_order.unshift(step);
  return ARCHITECTURE_APPROVAL_GATE_ID;
}

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
  } catch (_error) { /* non-critical */ }
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
  const ctx = _telemetryCtx(config);
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
  const ctx = _telemetryCtx(config);
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
    const findingCount = Array.isArray(archReport?.findings) ? archReport.findings.length : 0;
    if (findingCount === 0) {
      await deps.discord(config, 'OK', 'Architecture Validator passed',
        'Pre-pipeline architecture validation passed; module execution can continue.',
        architectureValidatorDiscordFields(archCorrelation, archReport),
        { deps: opts.deps, correlation: archCorrelation },
      );
    }
    if (findingCount > 0) {
      const approvalGateId = installArchitectureApprovalGate(progress, archConfig, archReport);
      const approvalResult = await deps.runGate(config, progress, approvalGateId, {
        deps: opts.deps,
        attempt: 1,
        budget: selectTruthyValue(() => (opts.budget), () => (null)),
        signal: selectTruthyValue(() => (opts.signal), () => (null)),
      });
      const normalizedApproval = normalizeStepResultForPipeline(approvalResult, { stepType: 'gate', stepId: approvalGateId });
      if (!normalizedApproval.shouldContinue) {
        return finalizeTerminalHalt(config, progress, {
          stepType: 'gate',
          stepId: approvalGateId,
          result: approvalResult,
          opts,
          summaryReason: 'architecture_findings_approval',
          scheduleProjectSummaryOnBlocked: false,
        });
      }
    }
    return null;
  }

  const isExecutionError = archReport.execution_failed === true;
  const blockingFindings = architectureBlockingFindings(archReport.findings);
  const summary = architectureValidationBlockSummary(archResult, archReport, blockingFindings);

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
            ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: selectTruthyValue(() => (selectTruthyValue(() => (config._runId), () => (config.run_id))), () => ('missing_run_id')), step_type: 'arch_validation' }),
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
        description: `Architecture validation failed before module execution. ${blockingFindings.length} blocking/error finding(s).`,
        fields: [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: selectTruthyValue(() => (selectTruthyValue(() => (config._runId), () => (config.run_id))), () => ('missing_run_id')), step_type: 'arch_validation' }),
          { name: 'Blocking/Error Findings', value: summary.slice(0, 1000) },
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
  return terminalExitCode;
}

export async function preparePipelineStart(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<any> {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  const ctx = { ..._telemetryCtx(config), deps: selectTruthyValue(() => (opts.deps), () => (null)) };

  initGovernanceCtx(config);
  await preparePipeline(config, progress, deps);
  return maybeRunArchitectureValidation(config, progress, opts, deps, ctx);
}
