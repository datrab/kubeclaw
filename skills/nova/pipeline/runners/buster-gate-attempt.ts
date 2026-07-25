import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { gateLogDir } from '../core/paths.ts';
import { writePromptArtifact } from '../egress.ts';
import { persistGateActiveSession, clearGateActiveSession } from '../services/gate-active-session.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import {
  applyTrackedBusterGateIdentity, buildBusterGateActiveSessionMetadata,
  buildBusterGateActiveCompletionIdentity, buildBusterGateArchiveIdentity,
  buildBusterGateArchiveTarget, buildBusterGateRateLimitStatusOptions,
  buildBusterGateSpawnOptions, createBusterGateCompletionIdentity,
  syncBusterGateRateLimitStatusOptions,
} from './buster-gate-task.ts';

function getGateStats(config: any) { return getRunStats(config); }

export async function runBusterGateOnce({ deps, config, progress, gateId, gate, model, timeout, instructions, attempt, busterGatePolicy = {} }: any) {
  getGateStats(config).total_buster_attempts++;
  const rawCommitHash = deps.headHash(config);
  const commitHash = typeof rawCommitHash === 'string' ? rawCommitHash.trim() : '';
  if (!commitHash) {
    return deps.pollResult(false, 'commit_hash_missing', {
      error: `Gate '${gateId}' Buster dispatch requires current HEAD commit_hash`,
      run_id: getRunId(config),
      attempt,
      gate_id: gateId,
      gate_type: gate.type,
    });
  }
  const completionIdentity: any = createBusterGateCompletionIdentity({
    runId: getRunId(config),
    gateId,
    attempt,
  });
  completionIdentity.commitHash = commitHash;
  completionIdentity.model = model ? model : null;
  completionIdentity.model_source = busterGatePolicy.model_source ? busterGatePolicy.model_source : null;
  completionIdentity.reasoning_level = busterGatePolicy.thinking_supported === false ? 'not supported' : (busterGatePolicy.thinking ? busterGatePolicy.thinking : 'default');
  completionIdentity.thinking_source = busterGatePolicy.thinking_source ? busterGatePolicy.thinking_source : null;
  completionIdentity.runtime = 'session';
  const gateRateLimitStatusOptions = buildBusterGateRateLimitStatusOptions({ gateId, gate, completionIdentity });
  const busterPromptResult = deps.buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt, completionIdentity);
  const busterPrompt = busterPromptResult.prompt;
  if (selectTruthyValue(() => typeof busterPrompt !== 'string', () => !busterPrompt)) {
    return deps.pollResult(false, 'instructions_read_failed', {
      error: `Gate '${gateId}' produced no Buster prompt`,
      run_id: completionIdentity.runId,
      attempt,
    });
  }

  writeBusterGatePrompt(config, gateId, attempt, busterPrompt);
  const context = { deps, config, progress, gateId, gate, model, timeout, attempt, busterGatePolicy, completionIdentity, gateRateLimitStatusOptions, busterPrompt };
  const configFailure = await validateFirstBusterGateAttempt(context);
  if (configFailure) return configFailure;
  const archiveFailure = await archivePriorBusterGateCompletions(context);
  if (archiveFailure) return archiveFailure;
  const spawnFailure = await spawnBusterGateAgent(context);
  if (spawnFailure) return spawnFailure;
  return waitForBusterGateAttempt(context);
}

function writeBusterGatePrompt(config: any, gateId: any, attempt: any, prompt: string) {
  try {
    const logDir = gateLogDir(config, gateId);
    if (!logDir) throw new Error(`Gate '${gateId}' requires a canonical log directory`);
    fs.mkdirSync(logDir, { recursive: true });
    writePromptArtifact(path.join(logDir, `buster-prompt-attempt-${attempt}.md`), prompt, { gate_id: gateId, attempt, agent_type: 'buster' });
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): prompt persistence is diagnostic. */ }
}

async function validateFirstBusterGateAttempt(context: any) {
  if (context.attempt !== 1) return null;
  const { deps, config, gateId, gate, completionIdentity } = context;
  try {
    deps.validateBusterConfig(config);
    return null;
  } catch (error: any) {
    const reason = `Gate '${gateId}' config validation failed: ${error.message}`;
    const correlation = { run_id: completionIdentity.runId, gate_id: gateId, gate_type: gate.type, attempt: context.attempt, dispatch_id: completionIdentity.dispatchId, gateway_label: completionIdentity.gateway_label, session_key: completionIdentity.sessionKey };
    log('ERROR', reason);
    await deps.discord(config, 'CRITICAL', `Gate '${gateId}' — Config Invalid`, 'Pre-dispatch validation caught config issues. Fix before retrying.', buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, correlation, [{ name: 'Issue', value: error.message.slice(0, 200) }]), { correlation });
    return deps.pollResult(false, 'config_invalid', { error: reason, errors: [error.message], run_id: completionIdentity.runId, attempt: completionIdentity.attempt, dispatch_id: completionIdentity.dispatchId, gateway_label: completionIdentity.gateway_label });
  }
}

async function archivePriorBusterGateCompletions(context: any) {
  const { deps, config, gateId, gate, completionIdentity } = context;
  const result = await deps.archiveModuleCompletions(config, gateId, buildBusterGateArchiveIdentity(completionIdentity), { ...buildBusterGateArchiveTarget(gateId, gate), deps: deps._explicitDeps });
  if (!result?.failed) return null;
  const reason = `Gate '${gateId}' completion archive failed before Buster dispatch: ${selectTruthyValue(() => result.error, () => 'missing_archive_error')}`;
  log('ERROR', reason);
  return deps.pollResult(false, 'completion_archive_failed', { gate: gateId, status: STATUS.FAIL, reason, error: selectDefinedValue(() => result.error, () => null), source: 'completion_archive', run_id: completionIdentity.runId, attempt: completionIdentity.attempt, dispatch_id: completionIdentity.dispatchId, gateway_label: completionIdentity.gateway_label, _source: 'completion_archive', archive_failure: result });
}

async function spawnBusterGateAgent(context: any) {
  const { deps, config, progress, gateId, gate, model, busterPrompt, busterGatePolicy, completionIdentity, gateRateLimitStatusOptions } = context;
  try {
    await deps.spawnAgent(config, progress, 'buster', gateId, model, busterPrompt, { ...buildBusterGateSpawnOptions(gate, completionIdentity), model_source: completionIdentity.model_source, reasoning_level: completionIdentity.reasoning_level, thinking: selectTruthyValue(() => busterGatePolicy.thinking, () => null), thinking_source: completionIdentity.thinking_source, thinking_supported: busterGatePolicy.thinking_supported ?? null, runtime_kind: completionIdentity.runtime, deps: deps._explicitDeps });
    const gateLabel = deps.acpLabel('buster', gateId);
    const trackedGate = deps.getTrackedAgent(gateLabel);
    applyTrackedBusterGateIdentity(completionIdentity, trackedGate);
    syncBusterGateRateLimitStatusOptions(gateRateLimitStatusOptions, completionIdentity);
    if (completionIdentity.sessionKey) persistGateActiveSession(config, gateId, gateLabel, trackedGate, buildBusterGateActiveSessionMetadata(completionIdentity));
    return null;
  } catch (error: any) {
    return deps.pollResult(false, 'spawn_failed', { error: error.message, run_id: completionIdentity.runId, attempt: completionIdentity.attempt, dispatch_id: completionIdentity.dispatchId, gateway_label: completionIdentity.gateway_label });
  }
}

async function waitForBusterGateAttempt(context: any) {
  const { deps, config, gateId, gate, completionIdentity, gateRateLimitStatusOptions, timeout } = context;
  let result;
  try {
    result = await deps.waitBusterGateCompletionEvidence({ deps, config, gateId, gate, completionIdentity, gateRateLimitStatusOptions, timeoutMinutes: timeout });
    return result;
  } finally {
    await deps.killAgent(config, 'buster', gateId, result?.ok === true);
    if (completionIdentity.sessionKey) clearGateActiveSession(config, gateId, buildBusterGateActiveCompletionIdentity(completionIdentity));
  }
}
