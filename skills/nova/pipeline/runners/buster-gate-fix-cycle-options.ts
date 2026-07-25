import fs from 'fs';
import { selectTruthyValue } from '../optional-absence.ts';
import { log } from '../core/logger.ts';
import { relPath, gateOutputPath, gateStatusPath } from '../core/paths.ts';
import { DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { selectPresent as selectPresentValue } from '../value-boundary.ts';

const NO_ISSUE_DETAILS = 'No details available';
const MISSING_ISSUE_TITLE = 'missing_issue_title';

function issueBullets(issues: any[], limit = 5) {
  return selectPresentValue(issues.slice(0, limit).map((issue: any) => `• ${issue.title}`).join('\n'), NO_ISSUE_DETAILS);
}

function messages(ctx: any) {
  const { gateId, cycle, maxFixCycles, issues } = ctx;
  return {
    startLevel: 'WARN',
    startTitle: `Gate '${gateId}' FAIL — Auto-Fix`,
    startDescription: () => `Attempt ${cycle}/${maxFixCycles}. Spawning Forge to fix ${issues.length} issue(s).\n\n**Issues:**\n${issueBullets(issues)}`,
    spawnFailedLog: ({ error }: any) => `Forge spawn for gate fix failed: ${error.message}`,
    spawnFailedTitle: 'Gate Fix: Forge Spawn Failed',
    spawnFailedDescription: ({ error }: any) => `Attempt ${cycle}/${maxFixCycles}. Error: ${error.message}`,
    spawnFailedReason: ({ error }: any) => `Gate fix Forge spawn failed: ${error.message}`,
    healthFailedLog: 'Forge health check failed for gate fix — skipping to next attempt',
    healthFailedTitle: 'Gate Fix: Forge Not Responding',
    healthFailedDescription: () => `Attempt ${cycle}/${maxFixCycles}. Forge spawned but health check failed. Retrying.`,
    healthFailedReason: 'Gate fix Forge health check failed',
    workingTitle: 'Gate Fix: Forge Working',
    workingDescription: () => `Attempt ${cycle}/${maxFixCycles}. Forge is fixing ${issues.length} issue(s).\n\n**Fixing:**\n${issueBullets(issues)}`,
    rateLimitReason: ({ fixLabel }: any) => `Gate fix '${fixLabel}' exceeded max rate limit pauses`,
    rateLimitTitle: `Gate Fix Rate Limit Exhausted: ${gateId}`,
    rateLimitDescription: ({ exitResult }: any) => `Fix attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
    rateLimitLogMessage: ({ fixLabel }: any) => `Gate fix '${fixLabel}' rate limit pauses exhausted`,
    rateLimitLogLevel: 'ERROR',
    noChangesLog: ({ fixLabel, reason }: any) => `Gate fix '${fixLabel}' ${reason}. Skipping retest.`,
    noChangesTitle: ({ reason }: any) => `Gate Fix ${reason}: ${gateId}`,
    noChangesDescription: () => `Fix attempt ${cycle}/${maxFixCycles} produced no usable output.`,
    noChangesReason: ({ reason }: any) => `Gate fix produced no usable output (${reason})`,
    successTitle: 'Gate Fix: Retesting with Buster',
    successDescription: ({ gitPersistenceDegraded }: any) => successDescription(ctx, gitPersistenceDegraded),
  };
}

function successDescription(ctx: any, gitPersistenceDegraded: boolean) {
  const action = gitPersistenceDegraded
    ? 'produced typed file-change evidence, but Git persistence is degraded. Running Buster gate against the local worktree'
    : 'committed. Running Buster gate again';
  const failures = selectPresentValue(ctx.issues.slice(0, 3).map((issue: any) => `• ${issue.title}`).join('\n'), MISSING_ISSUE_TITLE);
  return `Forge fix attempt ${ctx.cycle}/${ctx.maxFixCycles} ${action}...\n\n**Previous failures:**\n${failures}`;
}

function archivePreviousGateResult(ctx: any) {
  return async () => {
    const { config, gateId, gate, cycle, deps } = ctx;
    if (gate.output_file) {
      const outputPath = gateOutputPath(config, gate);
      if (!outputPath) throw new Error(`Gate '${gateId}' requires a canonical output path`);
      try {
        const archived = deps.archiveGateOutputIfPresent(config, gateId, outputPath, { attempt: cycle });
        if (archived) log('INFO', `Archived previous gate output: ${relPath(config, archived)}`);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): archival is diagnostic and does not own the fix result. */ }
    }
    const statusPath = gateStatusPath(config, gateId);
    try {
      const archived = deps.archiveGateOutputIfPresent(config, gateId, statusPath, { attempt: cycle, label: 'gate-status' });
      if (archived) log('INFO', `Archived previous gate status: ${relPath(config, archived)}`);
      if (fs.existsSync(statusPath)) fs.unlinkSync(statusPath);
    } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): archival is diagnostic and does not own the fix result. */ }
  };
}

function correlationOptions(ctx: any) {
  return {
    initialCorrelation: { sessionKey: ctx.gateSessionKey, gatewayLabel: ctx.gateGatewayLabel, dispatchId: ctx.gateDispatchId },
    buildActiveSessionExtra: ({ correlation }: any) => ({
      phase: 'buster_gate_fix', gate_type: ctx.gate.type, attempt: ctx.cycle,
      dispatch_id: selectTruthyValue(() => correlation.dispatchId, () => null),
    }),
    buildNextControlResult: ({ correlation }: any) => ctx.patchControlResult(ctx.controlResult, {
      diagnostics: { last_fix_cycle: { dispatch_id: correlation.dispatch_id, gateway_label: correlation.gateway_label, session_key: correlation.session_key } },
      metadata: { last_fix_cycle: { dispatch_id: correlation.dispatch_id, gateway_label: correlation.gateway_label, session_key: correlation.session_key } },
    }),
  };
}

export function buildBusterGateFixCycleOptions(ctx: any) {
  return {
    ...ctx,
    fixPrompt: ctx.fixPromptResult.prompt,
    fixLabelPrefix: 'gatefix',
    policyScope: 'gate_forge_fix',
    ...correlationOptions(ctx),
    clearActiveSessionBeforeSpawn: true,
    discordIdentitySurface: DISCORD_IDENTITY_SURFACES.GATE_SESSION,
    messages: messages(ctx),
    phase: 'buster_gate_fix',
    timeoutMinutes: ctx.gate.timeout_minutes,
    artifactLogLabel: 'Gate fix',
    emitFixCycleFail: ctx.callbacks.emitBusterGateFixCycleFail,
    getGateStats: ctx.callbacks.getGateStats,
    telemetryCtx: ctx.callbacks.telemetryCtx,
    buildRateLimitControlResult: (exit: any) => ctx.callbacks.buildBusterGateControlResult(ctx.config, ctx.gateId, ctx.gate, { ...exit, failure_class: 'rate_limit_exhausted' }),
    commitMessage: `[pipeline] Gate fix: ${ctx.gateId} attempt ${ctx.cycle}`,
    onBeforeSuccessDiscord: archivePreviousGateResult(ctx),
  };
}
