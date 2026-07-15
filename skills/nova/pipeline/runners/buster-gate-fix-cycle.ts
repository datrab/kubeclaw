import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/buster-gate-fix-cycle.js — Buster gate Forge fix-cycle adapter
// Owns Buster-specific prompt/correlation/cleanup policy; shared Forge cycle mechanics live in gate-forge-fix-cycle.js.

import fs from 'fs';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { relPath, gateOutputPath, gateStatusPath } from '../core/paths.ts';
import { DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { readGateRemediationSpec } from '../services/remediation-handoff.ts';
import { cloneSerializable } from '../services/contracts/gate-control-result.ts';
import { runGateForgeFixCycle } from './gate-forge-fix-cycle.ts';
import { getPipelineDefaultsConfig } from '../services/runtime-defaults.ts';
const BUSTER_GATE_FIRST_FIX_CYCLE = 1;
const BUSTER_GATE_NO_ISSUE_DETAILS = 'No details available';
const BUSTER_GATE_MISSING_ISSUE_TITLE = 'missing_issue_title';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function patchBusterRemediationControlResult(controlResult, updates = {}) {
  const cloned = cloneSerializable(controlResult);
  if (!cloned?.diagnostics?.typed?.remediation) return cloned;

  const remediation = cloned.diagnostics.typed.remediation;
  remediation.correlation = {
    ...objectRecord(remediation.correlation),
    ...objectRecord(cloneSerializable(updates.correlation)),
  };
  remediation.diagnostics = {
    ...objectRecord(remediation.diagnostics),
    ...objectRecord(cloneSerializable(updates.diagnostics)),
  };
  cloned.diagnostics.metadata = {
    ...objectRecord(cloned.diagnostics.metadata),
    ...objectRecord(cloneSerializable(updates.metadata)),
  };
  return cloned;
}

function issueBullets(issues, limit = 5) {
  return selectPresentValue(issues.slice(0, limit).map(i => `• ${i.title}`).join('\n'), BUSTER_GATE_NO_ISSUE_DETAILS);
}

function busterGateMaxFixCyclesAuthority(remediation, gate, pipelineDefaults) {
  const value = selectPresentValue(remediation?.policy?.maxFixCycles, gate?.max_fix_cycles, pipelineDefaults?.max_fails);
  const maxFixCycles = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(maxFixCycles)), () => (maxFixCycles < 1))) {
    throw new Error('Buster gate fix cycle requires positive maxFixCycles authority');
  }
  return maxFixCycles;
}

function gateStartedAtAuthority(opts, remediation) {
  if (Number.isFinite(opts?.gateStartedAt)) return opts.gateStartedAt;
  if (remediation?.startedAt) {
    const startedAt = new Date(remediation.startedAt).getTime();
    if (Number.isFinite(startedAt)) return startedAt;
    throw new Error('Buster gate remediation startedAt is invalid');
  }
  return Date.now();
}

export async function performBusterGateFixAttempt({ config, progress, gateId, controlResult, opts = {}, deps, gate, callbacks = {} }) {
  if (!gate) throw new Error(`Gate '${gateId}' not found`);
  const {
    getGateStats,
    emitBusterGateFixCycleFail,
    buildBusterGateControlResult,
    telemetryCtx,
  } = callbacks;

  const remediation = objectRecord(readGateRemediationSpec(controlResult));
  const cycle = Number(selectPresentValue(opts.cycle, remediation?.policy?.nextFixCycle, BUSTER_GATE_FIRST_FIX_CYCLE));
  const pipelineDefaults = getPipelineDefaultsConfig(config);
  const maxFixCycles = busterGateMaxFixCyclesAuthority(remediation, gate, pipelineDefaults);
  const gateStartedAt = gateStartedAtAuthority(opts, remediation);
  const issues = arrayValue(remediation?.diagnostics?.issues);
  const fixHistory = arrayValue(opts.fixHistory);

  const gateDispatchId = selectTruthyValue(() => (remediation?.correlation?.dispatch_id), () => (null));
  const gateGatewayLabel = selectTruthyValue(() => (remediation?.correlation?.gateway_label), () => (null));
  const gateSessionKey = selectTruthyValue(() => (remediation?.correlation?.session_key), () => (null));

  log('STEP', `Gate '${gateId}' fix cycle ${cycle}/${maxFixCycles}`);

  const fixPromptResult = deps.buildGateFixPrompt(config, gate, issues, cycle, maxFixCycles, fixHistory);

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
    issues,
    fixHistory,
    fixPrompt: fixPromptResult.prompt,
    fixLabelPrefix: 'gatefix',
    policyScope: 'gate_forge_fix',
    initialCorrelation: {
      sessionKey: gateSessionKey,
      gatewayLabel: gateGatewayLabel,
      dispatchId: gateDispatchId,
    },
    clearActiveSessionBeforeSpawn: true,
    buildActiveSessionExtra: ({ correlation }) => ({
      phase: 'buster_gate_fix',
      gate_type: gate.type,
      attempt: cycle,
      dispatch_id: selectTruthyValue(() => (correlation.dispatchId), () => (null)),
    }),
    discordIdentitySurface: DISCORD_IDENTITY_SURFACES.GATE_SESSION,
    messages: {
      startLevel: 'WARN',
      startTitle: `Gate '${gateId}' FAIL — Auto-Fix`,
      startDescription: () => `Attempt ${cycle}/${maxFixCycles}. Spawning Forge to fix ${issues.length} issue(s).\n\n**Issues:**\n${issueBullets(issues)}`,
      spawnFailedLog: ({ error }) => `Forge spawn for gate fix failed: ${error.message}`,
      spawnFailedTitle: 'Gate Fix: Forge Spawn Failed',
      spawnFailedDescription: ({ error }) => `Attempt ${cycle}/${maxFixCycles}. Error: ${error.message}`,
      spawnFailedReason: ({ error }) => `Gate fix Forge spawn failed: ${error.message}`,
      healthFailedLog: 'Forge health check failed for gate fix — skipping to next attempt',
      healthFailedTitle: 'Gate Fix: Forge Not Responding',
      healthFailedDescription: () => `Attempt ${cycle}/${maxFixCycles}. Forge spawned but health check failed. Retrying.`,
      healthFailedReason: 'Gate fix Forge health check failed',
      workingTitle: 'Gate Fix: Forge Working',
      workingDescription: () => `Attempt ${cycle}/${maxFixCycles}. Forge is fixing ${issues.length} issue(s).\n\n**Fixing:**\n${issueBullets(issues)}`,
      rateLimitReason: ({ fixLabel }) => `Gate fix '${fixLabel}' exceeded max rate limit pauses`,
      rateLimitTitle: `Gate Fix Rate Limit Exhausted: ${gateId}`,
      rateLimitDescription: ({ exitResult }) => `Fix attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
      rateLimitLogMessage: ({ fixLabel }) => `Gate fix '${fixLabel}' rate limit pauses exhausted`,
      rateLimitLogLevel: 'ERROR',
      noChangesLog: ({ fixLabel, reason }) => `Gate fix '${fixLabel}' ${reason}. Skipping retest.`,
      noChangesTitle: ({ reason }) => `Gate Fix ${reason}: ${gateId}`,
      noChangesDescription: () => `Fix attempt ${cycle}/${maxFixCycles} produced no usable output.`,
      noChangesReason: ({ reason }) => `Gate fix produced no usable output (${reason})`,
      successTitle: 'Gate Fix: Retesting with Buster',
      successDescription: ({ gitPersistenceDegraded }) => {
        const action = gitPersistenceDegraded
          ? 'produced typed file-change evidence, but Git persistence is degraded. Running Buster gate against the local worktree'
          : 'committed. Running Buster gate again';
        return `Forge fix attempt ${cycle}/${maxFixCycles} ${action}...\n\n**Previous failures:**\n${selectPresentValue(issues.slice(0, 3).map(i => `• ${i.title}`).join('\n'), BUSTER_GATE_MISSING_ISSUE_TITLE)}`;
      },
    },
    phase: 'buster_gate_fix',
    timeoutMinutes: gate.timeout_minutes,
    artifactLogLabel: 'Gate fix',
    emitFixCycleFail: emitBusterGateFixCycleFail,
    getGateStats,
    telemetryCtx,
    buildNextControlResult: ({ correlation }) => patchBusterRemediationControlResult(controlResult, {
      diagnostics: {
        last_fix_cycle: {
          dispatch_id: correlation.dispatch_id,
          gateway_label: correlation.gateway_label,
          session_key: correlation.session_key,
        },
      },
      metadata: {
        last_fix_cycle: {
          dispatch_id: correlation.dispatch_id,
          gateway_label: correlation.gateway_label,
          session_key: correlation.session_key,
        },
      },
    }),
    buildRateLimitControlResult: (gateFixRateLimitExit) => buildBusterGateControlResult(config, gateId, gate, {
      ...gateFixRateLimitExit,
      failure_class: 'rate_limit_exhausted',
    }),
    commitMessage: `[pipeline] Gate fix: ${gateId} attempt ${cycle}`,
    onBeforeSuccessDiscord: async () => {
      if (gate.output_file) {
        const outPath = gateOutputPath(config, gate);
        try {
          const archived = deps.archiveGateOutputIfPresent(config, gateId, outPath, { attempt: cycle });
          if (archived) log('INFO', `Archived previous gate output: ${relPath(config, archived)}`);
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        } catch (_error) { /* ok */ }
      }
      const gateStatusFile = gateStatusPath(config, gateId);
      try {
        const archivedStatus = deps.archiveGateOutputIfPresent(config, gateId, gateStatusFile, { attempt: cycle, label: 'gate-status' });
        if (archivedStatus) log('INFO', `Archived previous gate status: ${relPath(config, archivedStatus)}`);
        if (fs.existsSync(gateStatusFile)) fs.unlinkSync(gateStatusFile);
      } catch (_error) { /* ok */ }
    },
  });
}
