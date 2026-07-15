import { selectDefinedValue } from '../../optional-absence.ts';

type AnyRecord = Record<string, any>;

function forgeArtifactAuthority() {
  return {
    kind: 'artifact',
    path: 'forge-completion.json',
  };
}

function observedSession(sessionKey: string | null, gatewayLabel: string | null) {
  return {
    session_key: selectDefinedValue(() => (sessionKey), () => (null)),
    gateway_label: selectDefinedValue(() => (gatewayLabel), () => (null)),
  };
}

export function applyForgeReadyCompletion({
  deps,
  config,
  dir,
  status,
  moduleId,
  attempt,
  summary,
  sessionKey,
  gatewayLabel,
}: AnyRecord = {}) {
  return deps.applyModuleCompletion(config, dir, status, {
    target_kind: 'module',
    target_id: moduleId,
    phase: 'forge',
    attempt,
    status: 'PASS',
    authority: forgeArtifactAuthority(),
    summary: `Forge completion evidence: ${summary}`,
    observed: observedSession(sessionKey, gatewayLabel),
  });
}

export function applyForgeBlockedCompletion({
  deps,
  config,
  dir,
  status,
  moduleId,
  attempt,
  summary,
  sessionKey,
  gatewayLabel,
}: AnyRecord = {}) {
  return deps.applyModuleCompletion(config, dir, status, {
    target_kind: 'module',
    target_id: moduleId,
    phase: 'forge',
    attempt,
    status: 'BLOCKED',
    authority: forgeArtifactAuthority(),
    reason_code: 'forge_blocked',
    summary,
    observed: observedSession(sessionKey, gatewayLabel),
  });
}

export function applyForgeOnlyPassCompletion({
  deps,
  config,
  dir,
  status,
  moduleId,
  attempt,
  occurredAt,
  sessionKey,
  gatewayLabel,
}: AnyRecord = {}) {
  return deps.applyModuleCompletion(config, dir, status, {
    target_kind: 'module',
    target_id: moduleId,
    phase: 'forge',
    attempt,
    status: 'PASS',
    authority: forgeArtifactAuthority(),
    summary: 'Forge-only module - no Buster phase',
    occurred_at: occurredAt,
    observed: observedSession(sessionKey, gatewayLabel),
    metadata: {
      terminal_module: true,
    },
  });
}
