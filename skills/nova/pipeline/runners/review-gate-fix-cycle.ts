// runners/review-gate-fix-cycle.ts — Review gate Forge fix-cycle adapter
// Owns review-specific prompt/correlation/cleanup policy; shared Forge cycle mechanics live in gate-forge-fix-cycle.js.

import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { truncateForDiscord } from '../services/failures/presentation.ts';
import { readGateRemediationSpec } from '../services/remediation-handoff.ts';
import { buildReviewFixPrompt } from '../prompts/review.ts';
import { formatOperatorRemediationDirective } from '../services/prompt-ingress.ts';
import { runGateForgeFixCycle } from './gate-forge-fix-cycle.ts';

export async function performReviewGateFixAttempt({ config, progress, gateId, controlResult, opts = {}, deps, gate, reviewConfig, callbacks = {} }) {
  if (!gate) throw new Error(`Review gate '${gateId}' not found`);

  const {
    buildReviewGateControlResult,
    buildReviewRemediationExhaustedControlResult,
    cleanupReviewFiles,
    emitReviewGateFixCycleFail,
    getGateStats,
    telemetryCtx,
  } = callbacks;

  const remediation = readGateRemediationSpec(controlResult) || {};
  const cycle = Number(opts.cycle || remediation?.policy?.nextFixCycle || 1);
  const maxFixCycles = Number(remediation?.policy?.maxFixCycles || reviewConfig.maxFixCycles);
  if (!Number.isFinite(maxFixCycles) || maxFixCycles < 1) throw new Error(`Review gate '${gateId}' fix cycle requires typed maxFixCycles policy`);
  const gateStartedAt = opts.gateStartedAt ?? (remediation?.startedAt ? new Date(remediation.startedAt).getTime() : Date.now());
  const currentIssues = remediation?.diagnostics?.issues || [];
  const fixHistory = opts.fixHistory || [];

  log('STEP', `Review fix cycle ${cycle}/${maxFixCycles} (request_fix)`);
  if (currentIssues.length === 0) {
    log('WARN', 'NO-GO but no extractable issues — escalating');
    return {
      mode: 'terminal',
      controlResult: await buildReviewRemediationExhaustedControlResult(config, gateId, gate, controlResult, { gateStartedAt }),
    };
  }

  let fixPrompt = buildReviewFixPrompt(config, gate, currentIssues, cycle, maxFixCycles, fixHistory);
  if (opts.novaPrompt && cycle === 1) {
    fixPrompt = `${formatOperatorRemediationDirective(opts.novaPrompt)}\n${fixPrompt}`;
    log('INFO', `Operator remediation directive injected into Forge fix prompt (cycle 1, ${opts.novaPrompt.length} chars)`);
  }

  return runGateForgeFixCycle({
    config,
    progress,
    deps,
    gateId,
    gate,
    cycle,
    maxFixCycles,
    gateStartedAt,
    controlResult,
    issues: currentIssues,
    fixHistory,
    fixPrompt,
    fixLabelPrefix: 'reviewfix',
    policyScope: 'review_gate_forge_fix',
    initialCorrelation: {
      sessionKey: remediation?.correlation?.session_key || null,
      gatewayLabel: remediation?.correlation?.gateway_label || null,
    },
    buildActiveSessionExtra: () => ({
      phase: 'review_fix',
      reviewer: reviewConfig.primaryReviewer?.label || null,
      gate_type: gate.type,
      cycle,
    }),
    discordIdentitySurface: DISCORD_IDENTITY_SURFACES.GATE_SESSION,
    messages: {
      startLevel: 'WARN',
      startTitle: 'Review Fix: Auto-Fix',
      startDescription: () => `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. Spawning Forge to fix ${currentIssues.length} issue(s).`,
      spawnFailedLog: ({ error }) => `Forge spawn failed for review fix: ${error.message}`,
      spawnFailedTitle: 'Review Fix: Forge Spawn Failed',
      spawnFailedDescription: ({ error }) => `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. Error: ${error.message}`,
      spawnFailedReason: ({ error }) => `Review fix Forge spawn failed: ${error.message}`,
      healthFailedLog: 'Forge health check failed for review fix — skipping to next attempt',
      healthFailedTitle: 'Review Fix: Forge Not Responding',
      healthFailedDescription: () => `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. Health check failed. Retrying.`,
      healthFailedReason: 'Review fix Forge health check failed',
      workingTitle: 'Review Fix: Forge Working',
      workingDescription: () => {
        const topIssueTitle = currentIssues[0]?.description || 'issue';
        const moreCount = currentIssues.length - 1;
        const fixingDesc = moreCount > 0
          ? `Fixing: ${truncateForDiscord(topIssueTitle, 120)} (+ ${moreCount} more)`
          : `Fixing: ${truncateForDiscord(topIssueTitle, 150)}`;
        return `Cycle ${cycle}/${maxFixCycles} for ${gate.title}. ${fixingDesc}`;
      },
      rateLimitReason: ({ fixLabel }) => `Review fix '${fixLabel}' exceeded max rate limit pauses`,
      rateLimitTitle: `Review Fix Rate Limit Exhausted: ${gate.title}`,
      rateLimitDescription: ({ exitResult }) => `Fix attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
      rateLimitLogMessage: ({ fixLabel }) => `Review fix '${fixLabel}' rate limit pauses exhausted`,
      rateLimitLogLevel: 'ERROR',
      noChangesLog: ({ fixLabel, reason }) => `Review fix '${fixLabel}' ${reason}`,
      noChangesTitle: ({ reason }) => `Review Fix ${reason}: ${gateId}`,
      noChangesDescription: () => `Fix cycle ${cycle}/${maxFixCycles} produced no usable output.`,
      noChangesReason: ({ reason }) => `Review fix produced no usable output (${reason})`,
      successTitle: 'Review Fix: Re-Reviewing with Echo',
      successDescription: ({ gitPersistenceDegraded }) => gitPersistenceDegraded
        ? `Forge fix cycle ${cycle}/${maxFixCycles} produced typed file-change evidence, but Git persistence is degraded. Running Echo review against the local worktree...`
        : `Forge fix cycle ${cycle}/${maxFixCycles} committed. Running Echo review again...`,
    },
    phase: 'review_gate_fix',
    timeoutMinutes: reviewConfig.timeout,
    artifactLogLabel: 'Review fix',
    emitFixCycleFail: emitReviewGateFixCycleFail,
    getGateStats,
    telemetryCtx,
    buildRateLimitControlResult: (reviewFixRateLimitExit) => buildReviewGateControlResult(config, gateId, gate, {
      ...reviewFixRateLimitExit,
      failure_class: 'rate_limit_exhausted',
    }),
    commitMessage: `[pipeline] Review fix: ${gateId} cycle ${cycle}`,
    includeControlResultOnSuccess: false,
    onSuccess: async () => {
      await cleanupReviewFiles(config, gate, reviewConfig.reviewers);
    },
  });
}
