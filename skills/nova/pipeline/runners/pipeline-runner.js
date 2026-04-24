import fs from 'fs';
import path from 'path';
import { log, getActiveContext } from '../core/logger.js';
import {
  loadStatus,
  appendPipelineLifecycleEvent,
  readBusterGateCompletion,
  readGateOutput,
  readGateStatusJson,
} from '../services/status-store.js';
import { pipelineRunLogDir } from '../core/paths.js';
import { injectNeedsNova } from '../services/failures.js';
import { STATUS, EXIT_OK, EXIT_BLOCKED, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from '../core/constants.js';
import { discord } from '../integrations/discord.js';
import { getRunId, output } from '../core/runtime.js';
import { runModule } from './module-runner.js';
import { runGate } from './gate-runner.js';
import { extractArchValidatorReport } from '../services/arch-validator.js';
import { releaseGateFiles, syncControlFiles } from '../services/blueprint.js';
import {
  writeSummary,
  generateProjectSummary,
  generatePipelineReview,
  generateCaseStudy,
} from '../services/summary.js';
import {
  onPipelineStarted,
  onPipelineCompleted,
  onPipelineHalted,
  onModuleStatusChanged,
  onSummaryStarted,
  onSummaryCompleted,
  onEscalated,
  emitOperatorAlert,
} from '../services/telemetry.js';
import { writeCostReport } from '../services/cost.js';
import { initGovernanceCtx, recordArchValidatorResult } from '../services/governance-context.js';
import {
  resolveResultAttempt,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveResultDispatchId,
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
  resolveStatusDispatchId,
} from '../services/correlation.js';
import { resumeDurableCooldownForStep } from '../services/rate-limit.js';
import {
  buildEscalationPayload,
  buildPipelineHaltPayload,
  buildPipelineDiscordFields,
  buildBlockedModuleResult,
  buildResultWithStepCorrelation,
  getModuleAttempt,
  loadAuthoritativeModuleState,
  loadModuleStatus,
  hasAnyStartedModules,
  projectPipelineGateState,
  resolvePipelineGateType,
} from './pipeline-runner-shared.js';
import {
  runScheduledValidator as runScheduledValidatorImpl,
  runScheduledGenerator as runScheduledGeneratorImpl,
  validateGeneratorExecutionResult as validateGeneratorExecutionResultImpl,
  findNextStep as findNextStepImpl,
  preparePipeline,
} from './pipeline-runner-scheduling.js';
import {
  PIPELINE_RUN_CONCURRENCY_LIMIT,
  acquirePipelineRunLock,
  releasePipelineRunLock,
  reconcileStaleModuleState,
  reconcileStaleGateSessions,
} from './pipeline-runner-recovery.js';

function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

function emitPipelineSummaryLifecycle(config, ctx, exitCode, exitReason, progress, writeSummaryFn) {
  const baseData = {
    output_dir: config?._logDir ? path.join(config._logDir, 'pipeline') : null,
    exit_code: exitCode ?? null,
    exit_reason: exitReason || null,
  };
  onSummaryStarted(ctx, 'pipeline', baseData);
  const summaryResult = writeSummaryFn(config, exitCode, exitReason, ctx, progress) || {};
  const completionData = {
    ...baseData,
    ...summaryResult,
    status: summaryResult.failed ? 'failed' : (exitCode === EXIT_OK ? 'ok' : 'failed'),
  };
  if (summaryResult.failed && !completionData.reason) {
    completionData.reason = 'Failed to write pipeline summary';
  }
  onSummaryCompleted(ctx, 'pipeline', completionData);
  return summaryResult;
}

export { PIPELINE_RUN_CONCURRENCY_LIMIT, acquirePipelineRunLock, releasePipelineRunLock } from './pipeline-runner-recovery.js';
export function validateGeneratorExecutionResult(result, stageId = 'generator:unknown') {
  return validateGeneratorExecutionResultImpl(result, stageId);
}

export async function runScheduledGenerator(config, progress, stageId, opts = {}) {
  return runScheduledGeneratorImpl(config, progress, stageId, opts, getDeps(config));
}

export function findNextStep(config, progress) {
  return findNextStepImpl(config, progress, getDeps(config));
}

const DEFAULT_DEPS = {
  loadStatus,
  injectNeedsNova,
  discord,
  output,
  runModule,
  runGate,
  readBusterGateCompletion,
  readGateOutput,
  readGateStatusJson,
  releaseGateFiles,
  syncControlFiles,
  writeSummary,
  generateProjectSummary,
  generatePipelineReview,
  generateCaseStudy,
};

function getDeps(config) {
  return { ...DEFAULT_DEPS, ...(config?._testOverrides?.pipelineRunner || {}) };
}

async function completePipeline(config, progress) {
  const deps = getDeps(config);
  const ctx = _telemetryCtx(config);
  const completionFields = buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown' });
  appendPipelineLifecycleEvent(config, 'pipeline_run.completed', {
    progress,
    result: { exit: EXIT_OK, reason: 'PIPELINE_COMPLETE' },
  });
  log('OK', '🎉 Pipeline complete — all modules and gates PASS');
  deps.output({ exit: EXIT_OK, status: 'PIPELINE_COMPLETE' });
  await onPipelineCompleted(ctx, EXIT_OK, undefined, {}, {
    presentation: {
      discord: {
        level: 'OK',
        title: `Pipeline Complete: ${config.project}`,
        description: 'All modules passed!',
        fields: completionFields,
      },
    },
  });
  emitPipelineSummaryLifecycle(config, ctx, EXIT_OK, 'PIPELINE_COMPLETE', progress, deps.writeSummary);
  try { writeCostReport(config); } catch { /* non-critical */ }
  await runScheduledGenerator(config, progress, 'generator:project_summary', {
    scheduleReason: 'pipeline_complete',
    mode: 'full',
    exitCode: EXIT_OK,
    exitReason: 'PIPELINE_COMPLETE',
    orderIndex: 1,
    causationRef: 'event:pipeline_run.completed',
  });
  await runScheduledGenerator(config, progress, 'generator:pipeline_review', {
    scheduleReason: 'pipeline_complete',
    mode: 'full',
    exitCode: EXIT_OK,
    exitReason: 'PIPELINE_COMPLETE',
    orderIndex: 2,
    causationRef: 'event:pipeline_run.completed',
  });
  await runScheduledGenerator(config, progress, 'generator:case_study', {
    scheduleReason: 'pipeline_complete',
    mode: 'full',
    exitCode: EXIT_OK,
    exitReason: 'PIPELINE_COMPLETE',
    orderIndex: 3,
    causationRef: 'event:pipeline_run.completed',
  });
  return EXIT_OK;
}

async function haltPipeline(config, progress, next, result, opts = {}) {
  const deps = getDeps(config);
  const ctx = _telemetryCtx(config);
  if (next.type === 'blocked') {
    const blockedResult = buildBlockedModuleResult(config, progress, next.id, deps);
    appendPipelineLifecycleEvent(config, 'pipeline_run.halted', {
      progress,
      result: blockedResult,
      stepType: 'module',
      stepId: next.id,
      haltReason: 'blocked',
    });
    log('ERROR', `Module ${next.id} is BLOCKED — pipeline halted`);
    await emitOperatorAlert(ctx, 'pipeline.operator_alert', {
      module_id: next.id,
      step_type: next.type,
      attempt: resolveResultAttempt(blockedResult),
      dispatch_id: resolveResultDispatchId(blockedResult),
      gateway_label: resolveResultGatewayLabel(blockedResult),
      session_key: resolveResultSessionKey(blockedResult),
      exit_code: EXIT_BLOCKED,
      reason: blockedResult?.reason || 'BLOCKED',
    }, {
      hookId: 'pipeline.completed',
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Pipeline halted: ${config.project}`,
          description: `Module ${next.id} is BLOCKED. Human intervention needed.`,
          fields: [
            ...buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown', module_id: next.id, step_type: next.type, attempt: resolveResultAttempt(blockedResult), dispatch_id: resolveResultDispatchId(blockedResult), gateway_label: resolveResultGatewayLabel(blockedResult), session_key: resolveResultSessionKey(blockedResult) }),
            { name: 'Blocked At', value: next.id },
            { name: 'Action', value: 'Fix manually, then --resume' },
          ],
        },
      },
    });
    deps.output(blockedResult);
    onPipelineHalted(ctx, buildPipelineHaltPayload('module', next.id, blockedResult, 'BLOCKED'));
    onEscalated(ctx, 'module', next.id, buildEscalationPayload('module', next.id, blockedResult, 'BLOCKED'), EXIT_BLOCKED);
    emitPipelineSummaryLifecycle(config, ctx, EXIT_BLOCKED, `BLOCKED:${next.id}`, progress, deps.writeSummary);
    try { writeCostReport(config); } catch { /* non-critical */ }
    await runScheduledGenerator(config, progress, 'generator:project_summary', {
      scheduleReason: 'blocked_terminal_halt',
      mode: 'full',
      moduleId: next.id,
      exitCode: EXIT_BLOCKED,
      exitReason: `BLOCKED:${next.id}`,
      orderIndex: 1,
      causationRef: 'event:pipeline_run.halted',
    });
    return EXIT_BLOCKED;
  }

  const exitLabels = {
    [EXIT_ERROR]: 'ERROR',
    [EXIT_NEEDS_NOVA]: 'NEEDS_NOVA',
    [EXIT_BLOCKED]: 'BLOCKED',
    [EXIT_TIMEOUT]: 'TIMEOUT',
    [EXIT_RATE_LIMITED]: 'RATE_LIMITED',
  };
  const correlatedResult = buildResultWithStepCorrelation(config, progress, next.type, next.id, result, deps);
  const gateType = resolvePipelineGateType(progress, next.type, next.id, correlatedResult);
  appendPipelineLifecycleEvent(config, 'pipeline_run.halted', {
    progress,
    result: correlatedResult,
    stepType: next.type,
    stepId: next.id,
    haltReason: (exitLabels[result.exit] || 'UNKNOWN').toLowerCase(),
  });
  await emitOperatorAlert(ctx, 'pipeline.operator_alert', {
    module_id: next.type === 'module' ? next.id : null,
    gate_id: next.type === 'gate' ? next.id : null,
    gate_type: gateType,
    step_type: next.type,
    attempt: resolveResultAttempt(correlatedResult),
    dispatch_id: resolveResultDispatchId(correlatedResult),
    gateway_label: resolveResultGatewayLabel(correlatedResult),
    session_key: resolveResultSessionKey(correlatedResult),
    exit_code: result.exit,
    reason: result.reason || 'see previous alert',
  }, {
    hookId: 'pipeline.completed',
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Pipeline halted: ${config.project}`,
        description: `Pipeline stopped at ${next.type} '${next.id}'. Exit: ${exitLabels[result.exit] || result.exit}.`,
        fields: [
          ...buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown', module_id: next.type === 'module' ? next.id : null, gate_id: next.type === 'gate' ? next.id : null, gate_type: gateType, step_type: next.type, attempt: resolveResultAttempt(correlatedResult), dispatch_id: resolveResultDispatchId(correlatedResult), gateway_label: resolveResultGatewayLabel(correlatedResult), session_key: resolveResultSessionKey(correlatedResult) }),
          { name: 'Stopped At', value: `${next.type}:${next.id}` },
          { name: 'Exit Code', value: `${result.exit} (${exitLabels[result.exit] || 'UNKNOWN'})` },
          { name: 'Reason', value: (result.reason || 'see previous alert').slice(0, 200) },
        ],
      },
    },
  });
  if (result.exit === EXIT_NEEDS_NOVA || result.exit === EXIT_TIMEOUT) {
    await deps.injectNeedsNova(config, correlatedResult, opts.novaChannel, next.type, next.id);
    onEscalated(ctx, next.type, next.id, buildEscalationPayload(next.type, next.id, correlatedResult, exitLabels[result.exit], gateType), result.exit);
  }
  deps.output(correlatedResult);
  onPipelineHalted(ctx, buildPipelineHaltPayload(next.type, next.id, correlatedResult, exitLabels[result.exit] || 'UNKNOWN', gateType));
  emitPipelineSummaryLifecycle(config, ctx, result.exit, `${exitLabels[result.exit] || 'UNKNOWN'}:${next.id}`, progress, deps.writeSummary);
  try { writeCostReport(config); } catch { /* non-critical */ }
  return result.exit;
}

export async function runPipeline(config, progress, opts = {}) {
  const deps = getDeps(config);
  const ctx = _telemetryCtx(config);
  config._progress = progress;

  // Ensure run-scoped log directory exists. initLogDir() sets this during normal CLI startup,
  // but we guard here for direct calls (tests, programmatic use).
  if (!config._logDir && config?.paths?.swarm_dir) {
    config._logDir = path.join(config.paths.swarm_dir, 'logs');
  }
  if (config._logDir && !config._runLogDir) {
    config._runLogDir = pipelineRunLogDir(config);
    fs.mkdirSync(config._runLogDir, { recursive: true });
  }

  // Write config-validation snapshot at pipeline start for post-mortem analysis.
  if (config._runLogDir) {
    try {
      const snapshot = {
        ts: new Date().toISOString(),
        project: config.project,
        run_id: config._runId || config.run_id || null,
        models: config.models || null,
        config_validation_issues: config._runStats?.config_validation_issues || [],
      };
      fs.writeFileSync(path.join(config._runLogDir, 'config-validation.json'), JSON.stringify(snapshot, null, 2));
    } catch { /* non-critical */ }
  }

  const runLock = acquirePipelineRunLock(config, opts);
  try {
    await reconcileStaleModuleState(config, progress);
    await reconcileStaleGateSessions(config, progress);

    log('STEP', `╔═══════════════════════════════════════════════════╗`);
    log('STEP', `║  PIPELINE: ${config.project.toUpperCase().padEnd(38)}║`);
    log('STEP', `╚═══════════════════════════════════════════════════╝`);
    appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress, opts });

    let startDescription;
    if (opts.module) {
      startDescription = `Single module: ${opts.module}`;
    } else {
      const pendingModules = progress.execution_order.filter(s => {
        if (s.startsWith('gate:')) return false;
        const mod = progress.modules[s];
        if (!mod) return false;
        const authoritative = loadAuthoritativeModuleState(config, progress, s, {
          loadStatusFn: deps.loadStatus,
        });
        return !authoritative || authoritative.status !== STATUS.PASS;
      }).length;
      const totalModules = progress.execution_order.filter(s => !s.startsWith('gate:')).length;
      const totalGates = progress.execution_order.filter(s => s.startsWith('gate:')).length;
      startDescription = `Full pipeline: ${pendingModules}/${totalModules} modules pending, ${totalGates} gate(s)`;
    }

    await onPipelineStarted(ctx, progress, {
      presentation: {
        discord: {
          level: 'INFO',
          title: `Pipeline started: ${config.project}`,
          description: startDescription,
          fields: buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown' }),
        },
      },
    });

    if (opts.module) {
      await resumeDurableCooldownForStep(config, progress, { type: 'module', id: opts.module });
      const result = await deps.runModule(config, progress, opts.module, { novaPrompt: opts.novaPrompt });
      const singleModuleStatus = loadModuleStatus(config, progress, opts.module, deps);
      const singleModuleAttempt = resolveResultAttempt(result) ?? getModuleAttempt(singleModuleStatus);
      const singleModuleDispatchId = resolveResultDispatchId(result) ?? resolveStatusDispatchId(singleModuleStatus);
      const singleModuleGatewayLabel = resolveResultGatewayLabel(result) || resolveStatusGatewayLabel(singleModuleStatus);
      const singleModuleSessionKey = resolveResultSessionKey(result) || resolveStatusSessionKey(singleModuleStatus);
      const resultWithStatusCorrelation = buildResultWithStepCorrelation(config, progress, 'module', opts.module, {
        ...result,
        attempt: singleModuleAttempt,
        dispatch_id: singleModuleDispatchId,
        gateway_label: singleModuleGatewayLabel,
        session_key: singleModuleSessionKey,
      }, deps);
      appendPipelineLifecycleEvent(config, 'pipeline_run.halted', {
        progress,
        result: {
          exit: result.exit,
          reason: result.exit === EXIT_OK ? 'single_module_complete' : (result.reason || 'single_module_halt'),
          attempt: singleModuleAttempt,
          dispatch_id: singleModuleDispatchId,
          gateway_label: singleModuleGatewayLabel,
          session_key: singleModuleSessionKey,
          fail_count: result.fail_count ?? null,
        },
        stepType: 'module',
        stepId: opts.module,
        haltReason: result.exit === EXIT_OK ? 'single_module_complete' : (result.exit === EXIT_NEEDS_NOVA ? 'needs_nova' : result.exit === EXIT_TIMEOUT ? 'timeout' : result.exit === EXIT_BLOCKED ? 'blocked' : 'single_module_halt'),
      });
      deps.output(resultWithStatusCorrelation);
      if (result.exit === EXIT_OK) {
        await deps.discord(config, 'OK', 'Pipeline: single module done', `Module ${opts.module} completed successfully.`,
          buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown', module_id: opts.module, step_type: 'module', attempt: singleModuleAttempt, dispatch_id: singleModuleDispatchId, gateway_label: singleModuleGatewayLabel, session_key: singleModuleSessionKey })
        );
      } else {
        const exitLabels = {
          [EXIT_ERROR]: 'ERROR',
          [EXIT_NEEDS_NOVA]: 'NEEDS_NOVA',
          [EXIT_BLOCKED]: 'BLOCKED',
          [EXIT_TIMEOUT]: 'TIMEOUT',
          [EXIT_RATE_LIMITED]: 'RATE_LIMITED',
        };
        await emitOperatorAlert(ctx, 'pipeline.operator_alert', {
          module_id: opts.module,
          step_type: 'module',
          attempt: singleModuleAttempt,
          dispatch_id: singleModuleDispatchId,
          gateway_label: singleModuleGatewayLabel,
          session_key: singleModuleSessionKey,
          exit_code: result.exit,
          reason: result.reason || 'unknown (no error detail available)',
        }, {
          hookId: 'pipeline.completed',
          presentation: {
            discord: {
              level: 'CRITICAL',
              title: `Pipeline halted: ${config.project}`,
              description: `Single module run ended with exit code ${result.exit}.`,
              fields: [
                ...buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown', module_id: opts.module, step_type: 'module', attempt: singleModuleAttempt, dispatch_id: singleModuleDispatchId, gateway_label: singleModuleGatewayLabel, session_key: singleModuleSessionKey }),
                { name: 'Module', value: opts.module },
                { name: 'Reason', value: (result.reason || 'unknown (no error detail available)').slice(0, 200) },
                { name: 'Exit Code', value: String(result.exit) },
              ],
            },
          },
        });
        if (result.exit === EXIT_NEEDS_NOVA || result.exit === EXIT_TIMEOUT) {
          await deps.injectNeedsNova(config, resultWithStatusCorrelation, opts.novaChannel, 'module', opts.module);
        }
        if (result.exit === EXIT_NEEDS_NOVA || result.exit === EXIT_TIMEOUT || result.exit === EXIT_BLOCKED) {
          onEscalated(ctx, 'module', opts.module, buildEscalationPayload('module', opts.module, resultWithStatusCorrelation, exitLabels[result.exit]), result.exit);
        }
        onPipelineHalted(ctx, buildPipelineHaltPayload('module', opts.module, resultWithStatusCorrelation, exitLabels[result.exit] || 'UNKNOWN'));
      }
      emitPipelineSummaryLifecycle(config, ctx, result.exit, `single_module:${opts.module}`, progress, deps.writeSummary);
      return result.exit;
    }

    initGovernanceCtx(config);
    await preparePipeline(config, progress, deps);

    // Pre-pipeline architecture validation — runs on fresh starts and on
    // resume only if no module work has started yet.
    // Overridable via progress.json arch_validation.enabled (takes priority over swarm.config)
    const archEnabled = progress.arch_validation?.enabled ?? config.arch_validation?.enabled ?? true;
    const hasStartedModules = hasAnyStartedModules(config, progress, deps);
    const shouldRunArchValidation = archEnabled
      && !opts.skipArchValidation
      && (!opts.resume || !hasStartedModules);
    if (shouldRunArchValidation) {
      // Allow progress.json to override arch_validator model/thinking
      const archOverride = progress.arch_validation || {};
      if (archOverride.model && !config.models?.arch_validator) {
        config.models = config.models || {};
        config.models.arch_validator = archOverride.model;
      }
      if (archOverride.thinking_level) {
        config.agents = config.agents || {};
        config.agents.arch_validator = config.agents.arch_validator || {};
        if (!config.agents.arch_validator.thinking_level) {
          config.agents.arch_validator.thinking_level = archOverride.thinking_level;
        }
      }
      const archResult = await runScheduledValidatorImpl(config, progress, 'validator:architecture', {
        resume: opts.resume === true,
        hasStartedModules,
        archEnabled,
      }, deps);
      const archReport = extractArchValidatorReport(archResult, config);
      recordArchValidatorResult(config, archResult);

      if (archResult.nextAction === 'block') {
        const isExecutionError = archReport.execution_failed === true;
        const blockingFindings = archReport.findings.filter((finding) => finding?.severity === 'blocking');
        const summary = blockingFindings.map((finding) => `[${finding.id}] ${finding.explanation}`).join('; ')
          || archResult?.diagnostics?.summary
          || archReport.error
          || 'Architecture validation failed before module execution';

        if (isExecutionError) {
          await emitOperatorAlert(ctx, 'pipeline.operator_alert', {
            step_type: 'arch_validation',
            exit_code: EXIT_ERROR,
            reason: summary,
          }, {
            hookId: 'pipeline.completed',
            presentation: {
              discord: {
                level: 'CRITICAL',
                title: `Pipeline halted: ${config.project}`,
                description: 'Architecture validator execution failed before module execution.',
                fields: [
                  ...buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown', step_type: 'arch_validation' }),
                  { name: 'Reason', value: summary.slice(0, 1000) },
                  { name: 'Action', value: 'Fix validator configuration/runtime and rerun' },
                ],
              },
            },
          });
          deps.output({ exit: EXIT_ERROR, reason: 'ARCH_VALIDATION_ERROR', error: summary });
          onEscalated(ctx, 'step', 'arch-validation', {
            action: 'ERROR',
            last_failure: summary,
            step_type: 'arch_validation',
            step_id: 'arch-validation',
          }, EXIT_ERROR);
          onPipelineHalted(ctx, {
            step_type: 'arch_validation',
            step_id: 'arch-validation',
            exit_code: EXIT_ERROR,
            reason: 'ARCH_VALIDATION_ERROR',
          });
          emitPipelineSummaryLifecycle(config, ctx, EXIT_ERROR, 'ARCH_VALIDATION_ERROR', progress, deps.writeSummary);
          try { writeCostReport(config); } catch { /* non-critical */ }
          return EXIT_ERROR;
        }

        await emitOperatorAlert(ctx, 'pipeline.operator_alert', {
          step_type: 'arch_validation',
          exit_code: EXIT_BLOCKED,
          reason: summary,
        }, {
          hookId: 'pipeline.completed',
          presentation: {
            discord: {
              level: 'CRITICAL',
              title: `Pipeline blocked: ${config.project}`,
              description: `Architecture validation failed before module execution. ${blockingFindings.length} blocking finding(s).`,
              fields: [
                ...buildPipelineDiscordFields({ run_id: config._runId || config.run_id || 'unknown', step_type: 'arch_validation' }),
                { name: 'Blocking Findings', value: summary.slice(0, 1000) },
                { name: 'Action', value: 'Fix architecture issues, then --resume' },
              ],
            },
          },
        });
        deps.output({ exit: EXIT_BLOCKED, reason: 'ARCH_VALIDATION_BLOCKED', findings: blockingFindings.length });
        onEscalated(ctx, 'step', 'arch-validation', {
          action: 'BLOCKED',
          last_failure: 'Architecture validation failed before module execution',
          step_type: 'arch_validation',
          step_id: 'arch-validation',
        }, EXIT_BLOCKED);
        onPipelineHalted(ctx, {
          step_type: 'arch_validation',
          step_id: 'arch-validation',
          exit_code: EXIT_BLOCKED,
          reason: 'ARCH_VALIDATION_BLOCKED',
        });
        emitPipelineSummaryLifecycle(config, ctx, EXIT_BLOCKED, 'ARCH_VALIDATION_BLOCKED', progress, deps.writeSummary);
        try { writeCostReport(config); } catch { /* non-critical */ }
        return EXIT_BLOCKED;
      }
    }

    while (true) {
      const next = findNextStep(config, progress);
      if (next.type === 'done') return completePipeline(config, progress);
      if (next.type === 'blocked') return haltPipeline(config, progress, next, null, opts);
      await resumeDurableCooldownForStep(config, progress, next);
      const result = next.type === 'gate'
        ? await deps.runGate(config, progress, next.id, { novaPrompt: opts.novaPrompt })
        : await deps.runModule(config, progress, next.id, { novaPrompt: opts.novaPrompt });
      if (result.exit !== EXIT_OK) return haltPipeline(config, progress, next, result, opts);
    }
  } finally {
    releasePipelineRunLock(runLock);
  }
}

export function printStatus(config, progress) {
  const deps = getDeps(config);
  const overview = { project: config.project, timestamp: new Date().toISOString(), modules: {}, gates: {} };
  for (const [id, mod] of Object.entries(progress.modules)) {
    const projected = loadAuthoritativeModuleState(config, progress, id, {
      loadStatusFn: deps.loadStatus,
    });
    overview.modules[id] = {
      title: mod.title,
      status: projected?.status || 'NOT_INITIALIZED',
      fail_count: projected?.fail_count || 0,
      current_phase: projected?.current_phase || null,
      duration_min: projected?.cost?.total_duration_seconds ? Math.round(projected.cost.total_duration_seconds / 60) : 0,
    };
  }
  for (const [id, gate] of Object.entries(progress.gates)) {
    const gateProjection = projectPipelineGateState(config, id, gate, deps);
    overview.gates[id] = { title: gate.title, completed: gateProjection?.completed === true };
  }
  output(overview);
}

export function dryRun(config, progress) {
  const deps = getDeps(config);
  log('INFO', 'DRY RUN — no agents will be spawned\n');
  for (const stepId of progress.execution_order) {
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = progress.gates[gateId];
      const gateProjection = projectPipelineGateState(config, gateId, gate, deps);
      log('STEP', `[GATE] ${gate.title} | type=${gate.type} model=${gate.model} | ${gateProjection?.completed ? 'DONE' : 'PENDING'}`);
    } else {
      const mod = progress.modules[stepId];
      if (!mod) continue;
      const projected = loadAuthoritativeModuleState(config, progress, stepId, {
        loadStatusFn: deps.loadStatus,
      });
      log('STEP', `[${stepId}] ${mod.title} | ${projected?.status || 'PENDING'} | model=${mod.forge_model ?? progress.models?.forge ?? config.models?.forge ?? '?'}`);
    }
  }
}

export default runPipeline;
