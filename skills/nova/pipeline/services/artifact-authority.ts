import { isPlainObject } from './validation.ts';

export const PIPELINE_ARTIFACT_AUTHORITY_ROLES = Object.freeze({
  RUN_SCOPED_REPLAY: 'run_scoped_replay',
  LATEST_POINTER: 'latest_pointer',
  OPERATOR_MIRROR: 'operator_mirror',
  QUARANTINED_EVIDENCE: 'quarantined_evidence',
  SUMMARY_OPERATOR_VIEW: 'summary_operator_view',
  PLUGIN_ARTIFACT_REFERENCE: 'plugin_artifact_reference',
});

export const PIPELINE_ARTIFACT_SURFACES = Object.freeze({
  RUN_PIPELINE_JSONL: 'run_pipeline_jsonl',
  RUN_DISCORD_JSONL: 'run_discord_jsonl',
  RUN_SUMMARY_JSON: 'run_summary_json',
  LATEST_JSON: 'latest_json',
  GLOBAL_PIPELINE_JSONL: 'global_pipeline_jsonl',
  GLOBAL_DISCORD_JSONL: 'global_discord_jsonl',
  PIPELINE_SUMMARY_JSON: 'pipeline_summary_json',
  BUSTER_DIAGNOSTIC: 'buster_diagnostic',
  QUARANTINE: 'quarantine',
  PLUGIN_ARTIFACT_INDEX: 'plugin_artifact_index',
});

const RUN_SCOPED_REPLAY_SURFACES = new Set<string>([
  PIPELINE_ARTIFACT_SURFACES.RUN_PIPELINE_JSONL,
  PIPELINE_ARTIFACT_SURFACES.RUN_DISCORD_JSONL,
  PIPELINE_ARTIFACT_SURFACES.RUN_SUMMARY_JSON,
]);
const OPERATOR_MIRROR_SURFACES = new Set<string>([
  PIPELINE_ARTIFACT_SURFACES.GLOBAL_PIPELINE_JSONL,
  PIPELINE_ARTIFACT_SURFACES.GLOBAL_DISCORD_JSONL,
  PIPELINE_ARTIFACT_SURFACES.PIPELINE_SUMMARY_JSON,
]);
const QUARANTINED_EVIDENCE_SURFACES = new Set<string>([
  PIPELINE_ARTIFACT_SURFACES.BUSTER_DIAGNOSTIC,
  PIPELINE_ARTIFACT_SURFACES.QUARANTINE,
]);

function assertCanonicalArtifactIdentity(artifact: any = {}) {
  if (!isPlainObject(artifact)) return;
  const removedAliases: Array<[string, string]> = [
    ['runId', 'run_id'],
    ['sessionKey', 'session_key'],
    ['dispatchId', 'dispatch_id'],
  ];
  for (const [removedAlias, canonicalField] of removedAliases) {
    if (Object.prototype.hasOwnProperty.call(artifact, removedAlias)) {
      throw new Error(
        `Artifact identity must use canonical '${canonicalField}' field; removed alias '${removedAlias}' is not accepted`
      );
    }
  }
}

export function classifyPipelineArtifactSurface(
  surface: any = null,
  artifact: any = {}
) {
  const normalized = surface ? String(surface).trim() : '';
  if (normalized === PIPELINE_ARTIFACT_SURFACES.LATEST_JSON) {
    return PIPELINE_ARTIFACT_AUTHORITY_ROLES.LATEST_POINTER;
  }
  if (normalized === PIPELINE_ARTIFACT_SURFACES.PLUGIN_ARTIFACT_INDEX) {
    return PIPELINE_ARTIFACT_AUTHORITY_ROLES.PLUGIN_ARTIFACT_REFERENCE;
  }
  if (RUN_SCOPED_REPLAY_SURFACES.has(normalized)) {
    return PIPELINE_ARTIFACT_AUTHORITY_ROLES.RUN_SCOPED_REPLAY;
  }
  if (OPERATOR_MIRROR_SURFACES.has(normalized)) {
    return PIPELINE_ARTIFACT_AUTHORITY_ROLES.OPERATOR_MIRROR;
  }
  if (QUARANTINED_EVIDENCE_SURFACES.has(normalized)) {
    return PIPELINE_ARTIFACT_AUTHORITY_ROLES.QUARANTINED_EVIDENCE;
  }
  if (artifact?.schema_version === 'quarantined_payload.v1') {
    return PIPELINE_ARTIFACT_AUTHORITY_ROLES.QUARANTINED_EVIDENCE;
  }
  return PIPELINE_ARTIFACT_AUTHORITY_ROLES.OPERATOR_MIRROR;
}

function identityMatch(expected: any, observed: any) {
  return !expected || !observed || String(expected) === String(observed);
}

function artifactIdentity(input: any) {
  return {
    runId: input.artifact?.run_id ?? null,
    sessionKey: input.artifact?.session_key ?? null,
    dispatchId: input.artifact?.dispatch_id ?? null,
  };
}

function identityComparison(input: any, identity: any) {
  const runIdMatches = identityMatch(input.expectedRunId, identity.runId);
  const sessionKeyMatches = identityMatch(
    input.expectedSessionKey,
    identity.sessionKey
  );
  const dispatchIdMatches = identityMatch(
    input.expectedDispatchId,
    identity.dispatchId
  );
  return {
    runIdMatches,
    sessionKeyMatches,
    dispatchIdMatches,
    identityDrift: [
      input.expectedRunId && identity.runId && !runIdMatches,
      input.expectedSessionKey && identity.sessionKey && !sessionKeyMatches,
      input.expectedDispatchId && identity.dispatchId && !dispatchIdMatches,
    ].some(Boolean),
  };
}

export function buildPipelineArtifactAuthorityPolicy(input: any = {}) {
  const {
    surface = null,
    artifact = {},
    expectedRunId = null,
    expectedSessionKey = null,
    expectedDispatchId = null,
  } = input;
  assertCanonicalArtifactIdentity(artifact);
  const role = classifyPipelineArtifactSurface(surface, artifact);
  const identity = artifactIdentity({ artifact });
  const comparison = identityComparison({
    expectedRunId,
    expectedSessionKey,
    expectedDispatchId,
  }, identity);
  const quarantined = role
    === PIPELINE_ARTIFACT_AUTHORITY_ROLES.QUARANTINED_EVIDENCE;
  return {
    code: comparison.identityDrift
      ? 'artifact_identity_drift'
      : `${role}_evidence`,
    role,
    surface: surface ?? null,
    artifact_run_id: identity.runId,
    expected_run_id: expectedRunId ?? null,
    run_id_matches: comparison.runIdMatches,
    artifact_session_key: identity.sessionKey,
    expected_session_key: expectedSessionKey ?? null,
    session_key_matches: comparison.sessionKeyMatches,
    artifact_dispatch_id: identity.dispatchId,
    expected_dispatch_id: expectedDispatchId ?? null,
    dispatch_id_matches: comparison.dispatchIdMatches,
    quarantined_evidence: quarantined,
    identity_drift: comparison.identityDrift,
    stale_pointer: role === PIPELINE_ARTIFACT_AUTHORITY_ROLES.LATEST_POINTER
      && comparison.identityDrift,
    allow_lifecycle_authority: false,
    allow_session_authority: false,
    allow_scheduler_authority: false,
    allow_completion_authority: false,
    allow_ordering_authority: false,
    operator_replay_authority:
      role === PIPELINE_ARTIFACT_AUTHORITY_ROLES.RUN_SCOPED_REPLAY
      && comparison.runIdMatches
      && !quarantined,
    operator_pointer_only:
      role === PIPELINE_ARTIFACT_AUTHORITY_ROLES.LATEST_POINTER,
    diagnostic_evidence_only: quarantined,
  };
}

export function projectPipelineArtifactEvidence(input: any = {}) {
  const {
    surface = null,
    path: artifactPath = null,
    artifact = {},
    expectedRunId = null,
    expectedSessionKey = null,
    expectedDispatchId = null,
  } = input;
  assertCanonicalArtifactIdentity(artifact);
  const authority = buildPipelineArtifactAuthorityPolicy({
    surface,
    artifact,
    expectedRunId,
    expectedSessionKey,
    expectedDispatchId,
  });
  return {
    surface: surface ?? null,
    path: artifactPath ?? null,
    run_id: artifact?.run_id ?? null,
    role: authority.role,
    authority,
  };
}
