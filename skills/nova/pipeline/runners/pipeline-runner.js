import { log, getActiveContext } from '../core/logger.js';
import { loadStatus } from '../services/status-store.js';
import { injectNeedsNova } from '../services/failures.js';
import { STATUS, EXIT_OK, EXIT_BLOCKED, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from '../core/constants.js';
import { discord } from '../integrations/discord.js';
import { output } from '../core/runtime.js';
import { runModule } from './module-runner.js';
import { runGate } from './gate-runner.js';
import { runArchValidator } from '../services/arch-validator.js';
import {
  readGateOutput,
  readGateStatusJson,
} from '../services/status-store.js';
import { releaseGateFiles, syncControlFiles } from '../services/blueprint.js';
import {
  writeSummary,
  generateProjectSummary,
  generatePipelineReview,
} from '../services/summary.js';
import {
  onPipelineStarted,
  onPipelineCompleted,
  onPipelineHalted,
  onSummaryStarted,
  onSummaryCompleted,
  onEscalated,
} from '../services/telemetry.js';
import { writeCostReport } from '../services/cost.js';
import { initGovernanceCtx, recordArchValidatorResult } from '../services/governance-context.js';

function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

const DEFAULT_DEPS = {
  loadStatus,
  injectNeedsNova,
  discord,
  output,
  runModule,
  runGate,
  readGateOutput,
  readGateStatusJson,
  releaseGateFiles,
  syncControlFiles,
  writeSummary,
  generateProjectSummary,
  generatePipelineReview,
  runArchValidator,
};

function getDeps(config) {
  return { ...DEFAULT_DEPS, ...(config?._testOverrides?.pipelineRunner || {}) };
}

export function findNextStep(config, progress) {
  const deps = getDeps(config);
  for (const stepId of progress.execution_order) {
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = progress.gates[gateId];

      const gateOutput = deps.readGateOutput(config, gate);
      if (gateOutput.isPass) continue;

      if (gate?.type === 'buster' || gate?.type === 'approval') {
        const gateStatus = deps.readGateStatusJson(config, gateId);
        if (gateStatus.isPass) {
          log('INFO', `Gate '${gateId}' completed via gate-status.json (output_file missing) — skipping`);
          continue;
        }
      }

      return { type: 'gate', id: gateId };
    }

    const mod = progress.modules[stepId];
    if (!mod) continue;
    const status = deps.loadStatus(config, mod.dir);
    if (status?.status === STATUS.PASS) continue;
    if (status?.status === STATUS.BLOCKED) return { type: 'blocked', id: stepId };
    if (status?.status === STATUS.FAIL) log('INFO', `Module ${stepId} is FAIL (${status.fail_count} attempts) — will retry`);
    else if (status) log('INFO', `Module ${stepId} resuming from ${status.status}`);
    return { type: 'module', id: stepId };
  }
  return { type: 'done' };
}

async function preparePipeline(config, progress) {
  const deps = getDeps(config);
  try { await deps.releaseGateFiles(config, progress); }
  catch (e) { log('WARN', `Gate files release failed (non-critical): ${e.message}`); }

  try { await deps.syncControlFiles(config, progress); }
  catch (e) { log('WARN', `Control file sync failed (non-critical): ${e.message}`); }
}

async function completePipeline(config) {
  const deps = getDeps(config);
  const ctx = _telemetryCtx(config);
  log('OK', '🎉 Pipeline complete — all modules and gates PASS');
  await deps.discord(config, 'OK', `Pipeline Complete: ${config.project}`, 'All modules passed!');
  deps.output({ exit: EXIT_OK, status: 'PIPELINE_COMPLETE' });
  onPipelineCompleted(ctx, EXIT_OK);
  onSummaryStarted(ctx, 'pipeline');
  deps.writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE', ctx);
  onSummaryCompleted(ctx, 'pipeline');
  try { writeCostReport(config); } catch { /* non-critical */ }
  await deps.generateProjectSummary(config);
  await deps.generatePipelineReview(config);
  return EXIT_OK;
}

async function haltPipeline(config, next, result, opts = {}) {
  const deps = getDeps(config);
  const ctx = _telemetryCtx(config);
  if (next.type === 'blocked') {
    log('ERROR', `Module ${next.id} is BLOCKED — pipeline halted`);
    await deps.discord(config, 'CRITICAL', `Pipeline halted: ${config.project}`, `Module ${next.id} is BLOCKED. Human intervention needed.`, [
      { name: 'Blocked At', value: next.id },
      { name: 'Action', value: 'Fix manually, then --resume' },
    ]);
    deps.output({ exit: EXIT_BLOCKED, module: next.id, reason: 'BLOCKED' });
    onPipelineHalted(ctx, next.id, EXIT_BLOCKED, 'BLOCKED');
    onEscalated(ctx, 'module', next.id, 'Module is BLOCKED', EXIT_BLOCKED);
    deps.writeSummary(config, EXIT_BLOCKED, `BLOCKED:${next.id}`, ctx);
    try { writeCostReport(config); } catch { /* non-critical */ }
    await deps.generateProjectSummary(config);
    return EXIT_BLOCKED;
  }

  const exitLabels = {
    [EXIT_ERROR]: 'ERROR',
    [EXIT_NEEDS_NOVA]: 'NEEDS_NOVA',
    [EXIT_BLOCKED]: 'BLOCKED',
    [EXIT_TIMEOUT]: 'TIMEOUT',
    [EXIT_RATE_LIMITED]: 'RATE_LIMITED',
  };
  await deps.discord(config, 'CRITICAL', `Pipeline halted: ${config.project}`, `Pipeline stopped at ${next.type} '${next.id}'. Exit: ${exitLabels[result.exit] || result.exit}.`, [
    { name: 'Stopped At', value: `${next.type}:${next.id}` },
    { name: 'Exit Code', value: `${result.exit} (${exitLabels[result.exit] || 'UNKNOWN'})` },
    { name: 'Reason', value: (result.reason || 'see previous alert').slice(0, 200) },
  ]);
  if (result.exit === EXIT_NEEDS_NOVA || result.exit === EXIT_TIMEOUT) {
    await deps.injectNeedsNova(config, result, opts.novaChannel, next.type, next.id);
    onEscalated(ctx, next.type, next.id, result.reason || exitLabels[result.exit], result.exit);
  }
  deps.output(result);
  onPipelineHalted(ctx, next.id, result.exit, exitLabels[result.exit] || 'UNKNOWN');
  deps.writeSummary(config, result.exit, `${exitLabels[result.exit] || 'UNKNOWN'}:${next.id}`, ctx);
  try { writeCostReport(config); } catch { /* non-critical */ }
  return result.exit;
}

export async function runPipeline(config, progress, opts = {}) {
  const deps = getDeps(config);
  const ctx = _telemetryCtx(config);
  log('STEP', `╔═══════════════════════════════════════════════════╗`);
  log('STEP', `║  PIPELINE: ${config.project.toUpperCase().padEnd(38)}║`);
  log('STEP', `╚═══════════════════════════════════════════════════╝`);
  onPipelineStarted(ctx, config.project);

  let startDescription;
  if (opts.module) {
    startDescription = `Single module: ${opts.module}`;
  } else {
    const pendingModules = progress.execution_order.filter(s => {
      if (s.startsWith('gate:')) return false;
      const mod = progress.modules[s];
      if (!mod) return false;
      const st = deps.loadStatus(config, mod.dir);
      return !st || st.status !== STATUS.PASS;
    }).length;
    const totalModules = progress.execution_order.filter(s => !s.startsWith('gate:')).length;
    const totalGates = progress.execution_order.filter(s => s.startsWith('gate:')).length;
    startDescription = `Full pipeline: ${pendingModules}/${totalModules} modules pending, ${totalGates} gate(s)`;
  }

  await deps.discord(config, 'INFO', `Pipeline started: ${config.project}`, startDescription);

  if (opts.module) {
    const result = await deps.runModule(config, progress, opts.module, { novaPrompt: opts.novaPrompt });
    deps.output(result);
    if (result.exit === EXIT_OK) {
      await deps.discord(config, 'OK', 'Pipeline: single module done', `Module ${opts.module} completed successfully.`);
    } else {
      await deps.discord(config, 'CRITICAL', `Pipeline halted: ${config.project}`, `Single module run ended with exit code ${result.exit}.`, [
        { name: 'Module', value: opts.module },
        { name: 'Reason', value: (result.reason || 'unknown').slice(0, 200) },
        { name: 'Exit Code', value: String(result.exit) },
      ]);
      if (result.exit === EXIT_NEEDS_NOVA || result.exit === EXIT_TIMEOUT) {
        await deps.injectNeedsNova(config, result, opts.novaChannel, 'module', opts.module);
      }
    }
    deps.writeSummary(config, result.exit, `single_module:${opts.module}`);
    return result.exit;
  }

  initGovernanceCtx(config);
  await preparePipeline(config, progress);

  // Pre-pipeline architecture validation — runs before any module starts
  if (config.arch_validation?.enabled !== false && !opts.skipArchValidation) {
    const archResult = await deps.runArchValidator(config, progress);
    recordArchValidatorResult(config, archResult);
    if (archResult.blocked) {
      const blockingFindings = archResult.findings.filter(f => f.severity === 'blocking');
      const summary = blockingFindings.map(f => `[${f.id}] ${f.explanation}`).join('; ');
      await deps.discord(config, 'CRITICAL', `Pipeline blocked: ${config.project}`, `Architecture validation failed before module execution. ${blockingFindings.length} blocking finding(s).`, [
        { name: 'Blocking Findings', value: summary.slice(0, 1000) },
        { name: 'Action', value: 'Fix architecture issues, then --resume' },
      ]);
      deps.output({ exit: EXIT_BLOCKED, reason: 'ARCH_VALIDATION_BLOCKED', findings: blockingFindings.length });
      onPipelineHalted(ctx, 'arch-validation', EXIT_BLOCKED, 'ARCH_VALIDATION_BLOCKED');
      deps.writeSummary(config, EXIT_BLOCKED, 'ARCH_VALIDATION_BLOCKED', ctx);
      try { writeCostReport(config); } catch { /* non-critical */ }
      return EXIT_BLOCKED;
    }
  }

  while (true) {
    const next = findNextStep(config, progress);
    if (next.type === 'done') return completePipeline(config);
    if (next.type === 'blocked') return haltPipeline(config, next, null, opts);
    const result = next.type === 'gate'
      ? await deps.runGate(config, progress, next.id, { novaPrompt: opts.novaPrompt })
      : await deps.runModule(config, progress, next.id, { novaPrompt: opts.novaPrompt });
    if (result.exit !== EXIT_OK) return haltPipeline(config, next, result, opts);
  }
}

export function printStatus(config, progress) {
  const overview = { project: config.project, timestamp: new Date().toISOString(), modules: {}, gates: {} };
  for (const [id, mod] of Object.entries(progress.modules)) {
    const s = loadStatus(config, mod.dir);
    overview.modules[id] = {
      title: mod.title,
      status: s?.status || 'NOT_INITIALIZED',
      fail_count: s?.fail_count || 0,
      current_phase: s?.current_phase || null,
      duration_min: s?.cost?.total_duration_seconds ? Math.round(s.cost.total_duration_seconds / 60) : 0,
    };
  }
  for (const [id, gate] of Object.entries(progress.gates)) {
    const gateOutput = readGateOutput(config, gate);
    overview.gates[id] = { title: gate.title, completed: gateOutput.exists };
  }
  output(overview);
}

export function dryRun(config, progress) {
  log('INFO', 'DRY RUN — no agents will be spawned\n');
  for (const stepId of progress.execution_order) {
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = progress.gates[gateId];
      const gateOutput = readGateOutput(config, gate);
      log('STEP', `[GATE] ${gate.title} | type=${gate.type} model=${gate.model} | ${gateOutput.exists ? 'DONE' : 'PENDING'}`);
    } else {
      const mod = progress.modules[stepId];
      if (!mod) continue;
      const status = loadStatus(config, mod.dir);
      log('STEP', `[${stepId}] ${mod.title} | ${status?.status || 'PENDING'} | model=${mod.forge_model ?? progress.models?.forge ?? config.models?.forge ?? '?'}`);
    }
  }
}

export default runPipeline;
