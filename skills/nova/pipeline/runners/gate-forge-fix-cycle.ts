import { startGateForgeFixCycleScaffold, finishGateForgeFixCycleScaffold } from '../services/gate-fix-scaffold.ts';
import { createGateForgeFixContext, updateGateForgeFixCorrelation } from './gate-forge-fix-context.ts';
import {
  handleGateFixNoChanges,
  handleGateFixRateLimit,
  handleGateFixStartFailure,
  handleGateFixSuccess,
} from './gate-forge-fix-outcomes.ts';

async function startFix(ctx: any) {
  const result = await startGateForgeFixCycleScaffold({
    config: ctx.config,
    progress: ctx.progress,
    deps: ctx.deps,
    gateId: ctx.gateId,
    gate: ctx.gate,
    cycle: ctx.cycle,
    fixPrompt: ctx.fixPrompt,
    fixLabelPrefix: ctx.fixLabelPrefix,
    policyScope: ctx.policyScope,
    initialCorrelation: ctx.initialCorrelation,
    clearActiveSessionBeforeSpawn: ctx.clearActiveSessionBeforeSpawn,
    buildActiveSessionExtra: ctx.buildActiveSessionExtra,
  });
  updateGateForgeFixCorrelation(ctx, result.correlation);
  return result;
}

async function finishFix(ctx: any, start: any) {
  return finishGateForgeFixCycleScaffold({
    config: ctx.config,
    deps: ctx.deps,
    gateId: ctx.gateId,
    gate: ctx.gate,
    cycle: ctx.cycle,
    fixLabel: start.fixLabel,
    fixAcpLabel: start.fixAcpLabel,
    timeoutMinutes: ctx.timeoutMinutes,
    artifactLogLabel: ctx.artifactLogLabel,
  });
}

async function nextControlResult(ctx: any, fixLabel: string, sessionResult: any) {
  return ctx.buildNextControlResult({ ...ctx, fixLabel, sessionResult, correlation: ctx.snapshot() });
}

export async function runGateForgeFixCycle(input: any = {}) {
  if (typeof input.deps?.gitCommitAndPush !== 'function') {
    throw new Error('gate Forge fix-cycle requires canonical gitCommitAndPush dependency');
  }
  const ctx = createGateForgeFixContext(input);
  await ctx.send(ctx.msg('startLevel'), 'startTitle', 'startDescription');
  const start = await startFix(ctx);
  const startFailure = await handleGateFixStartFailure(ctx, start);
  if (startFailure) return startFailure;
  await ctx.send('INFO', 'workingTitle', 'workingDescription');
  const { sessionResult } = await finishFix(ctx, start);
  const nextResult = await nextControlResult(ctx, start.fixLabel, sessionResult);
  const rateLimit = await handleGateFixRateLimit(ctx, start.fixLabel, sessionResult);
  if (rateLimit) return rateLimit;
  ctx.fixHistory.push({ attempt: ctx.cycle, hasChanges: sessionResult.hasChanges, issues: ctx.issues });
  const noChanges = await handleGateFixNoChanges(ctx, start.fixLabel, sessionResult, nextResult);
  if (noChanges) return noChanges;
  return handleGateFixSuccess(ctx, start.fixLabel, sessionResult, nextResult);
}
