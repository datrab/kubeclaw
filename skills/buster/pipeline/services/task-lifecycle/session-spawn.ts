import { spawnSession } from '../../agents/lifecycle.ts';
import { resolveBusterActiveSessionPath, buildSessionSpawnEmbed } from '../pipeline-helpers.ts';
import { safeErrorMessage } from '../runtime-diagnostics.ts';

type AnyRecord = Record<string, any>;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

function runtime(value: unknown): 'acp' | 'subagent' | null {
  const normalized = text(value)?.toLowerCase();
  return normalized === 'acp' || normalized === 'subagent' ? normalized : null;
}

function thinking(payload: AnyRecord): string | null {
  const candidates = [payload.session?.thinking, payload.session?.thinking_level, payload.thinking, payload.thinking_level];
  for (const candidate of candidates) {
    const normalized = text(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function spawnIdentity(payload: AnyRecord) {
  const agentId = text(payload.session?.agentId) ?? text(payload.session?.agent_id);
  return {
    runtime: runtime(payload.session?.runtime), model: text(payload.session?.model), agentId,
    cwd: text(payload.session?.cwd), label: text(payload.session?.label), thinking: thinking(payload),
  };
}

function observabilityIdentity(payload: AnyRecord, moduleId: string, label: string | null): AnyRecord {
  const runId = payload.run_id ?? payload.session?.run_id;
  return {
    run_id: runId ?? null, project: payload.project ?? null,
    agent_type: 'buster', module_id: moduleId, gate_id: payload.gate_id ?? null,
    gate_type: payload.gate_type ?? null, attempt: payload.attempt ?? null,
    dispatch_id: payload.dispatch_id ?? label, gateway_label: label,
  };
}

async function spawn(request: AnyRecord, identity: AnyRecord): Promise<AnyRecord> {
  const spawnChild = request.testHooks?.spawnSession ?? spawnSession;
  return spawnChild({ ...request.payload, session: { ...request.payload.session, ...identity } }, request.prompt, request.timeoutSeconds, {
    ...identity, activeStatePath: resolveBusterActiveSessionPath(identity.cwd),
    spawnPolicy: request.sessionPolicies?.spawnPolicy, budget: request.budget ?? null,
    signal: request.signal ?? null,
    observabilityIdentity: observabilityIdentity(request.payload, request.moduleId, identity.label),
  });
}

function dispatchIdentity(explicit: unknown, sessionData: AnyRecord): string {
  const value = text(explicit) ?? text(sessionData.label);
  if (!value) throw new Error('Buster session dispatch identity is required');
  return value;
}

export async function spawnTaskSession(request: AnyRecord): Promise<AnyRecord> {
  const identity = spawnIdentity(request.payload);
  let sessionData: AnyRecord;
  try {
    sessionData = await spawn(request, identity);
  } catch (error) {
    const detail = safeErrorMessage(error);
    request.logger.error('SPAWN', `Spawn failed: ${detail}`, {
      error_name: error instanceof Error ? error.name : null,
      error_code: error && typeof error === 'object' && 'code' in error ? error.code : null,
    });
    return { ok: false, reason: `spawn_failed: ${detail}` };
  }
  request.logger.info('SPAWN', `Session spawned: ${sessionData.childSessionKey}`, { runtime: sessionData.runtime });
  const dispatchId = dispatchIdentity(request.dispatchIdForCompletion, sessionData);
  request.tctx.sessionKey = sessionData.childSessionKey;
  request.tctx.dispatchId = dispatchId;
  request.discord(buildSessionSpawnEmbed(request.moduleId, request.project, {
    ...sessionData, taskType: request.taskType, timeoutSeconds: request.timeoutSeconds,
  }), request.currentDiscordContext({ dispatch_id: dispatchId, session_key: sessionData.childSessionKey }));
  return { ok: true, sessionData, sessionKeyForCompletion: sessionData.childSessionKey, dispatchIdForCompletion: dispatchId };
}
