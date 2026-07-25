import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-session-authority-slice-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';


const { sourceRoot } = parseSourceRootArgs();
const sessionAuthorityPath = path.join(sourceRoot, 'skills/nova/pipeline/services/session-authority.ts');
const correlationPath = path.join(sourceRoot, 'skills/nova/pipeline/services/correlation.ts');
const statusStorePath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store.ts');
const statusCompatPath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-read-models.ts');
const statusCompatModulePath = path.join(sourceRoot, 'skills/nova/pipeline/services/status-store-read-models/module-projection.ts');
const lifecyclePath = path.join(sourceRoot, 'skills/common/pipeline/agents/lifecycle.ts');
const busterPipelinePath = path.join(sourceRoot, 'skills/buster/buster-pipeline.ts');
const busterRecoveryPath = path.join(sourceRoot, 'skills/buster/pipeline/services/orphan-recovery.ts');

const sessionAuthoritySource = fs.readFileSync(sessionAuthorityPath, 'utf8');
const correlationSource = fs.readFileSync(correlationPath, 'utf8');
const statusStoreSource = fs.readFileSync(statusStorePath, 'utf8');
const statusCompatSource = `${fs.readFileSync(statusCompatPath, 'utf8')}\n${fs.readFileSync(statusCompatModulePath, 'utf8')}`;
const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
const busterSource = `${fs.readFileSync(busterPipelinePath, 'utf8')}\n${fs.readFileSync(busterRecoveryPath, 'utf8')}`;

for (const marker of [
  'export const STRONG_ACTIVE_SESSION_IDENTITY_FIELDS',
  'export function normalizeActiveSessionIdentity(',
  'export function getMissingActiveSessionIdentityFields(',
  'export function hasStrongActiveSessionIdentity(',
  'export function buildActiveSessionConfirmation(',
  'export function buildActiveSessionAuthorityPolicy(',
  "active_session_authority_source: lifecycleAuthoritative ? 'lifecycle_read_model' : null",
  'allow_status_active_agent_authority: false',
  'allow_active_session_file_authority: false',
  'allow_tracked_agent_authority: false',
  'allow_evidence_hydration: false',
]) {
  assert.equal(sessionAuthoritySource.includes(marker), true, `session authority helper should expose ${marker}`);
}

assert.equal(lifecycleSource.includes('export function recoverActiveSession('), false, 'common lifecycle must not hydrate active session authority from persisted JSON');
assert.equal(busterSource.includes('recoverActiveSession'), false, 'Buster startup must not use persisted active-session JSON to hydrate process state');
assert.equal(busterSource.includes('killSession('), false, 'Buster startup recovery must not kill from file-only active-session evidence');
assert.equal(busterSource.includes('active_session_file_diagnostic_only'), true, 'Buster startup must classify persisted active-session files as diagnostic only');
assert.equal(busterSource.includes('allow_evidence_hydration: false'), true, 'Buster startup diagnostic policy must prohibit hydration');
assert.equal(sessionAuthoritySource.includes('lifecycle_active_session_identity_incomplete'), false, 'module lifecycle weak-evidence guard should be deleted after removing weak producers');
assert.equal(statusStoreSource.includes('const activeStatusSessionKey = activeAgent?.session_key'), false, 'status-store must not produce lifecycle active-session read models from session-only evidence');
assert.equal(statusStoreSource.includes('readModels.active_sessions.modules[moduleId] = activeSessionProjection'), true, 'status-store should keep module active-session read-model projection explicit');
assert.equal(statusStoreSource.includes('buildStrongModuleActiveSessionProjection'), true, 'status-store should centralize lifecycle active-session projection hardening');
assert.equal(statusStoreSource.includes('hasStrongActiveSessionIdentity(identity)'), true, 'module active-session read models must only be emitted with complete identity');
assert.equal(
  statusStoreSource.includes('session_key: selectTruthyValue(() => (activeAgent?.session_key), () => (null))'),
  true,
  'module active-session identity must read session_key from typed active_agent evidence',
);
assert.equal(
  statusStoreSource.includes('session_key: selectTruthyValue(() => (status?.session_key), () => (null))'),
  false,
  'module active-session projection must not promote status-level session_key evidence',
);

assert.equal(
  statusCompatSource.includes('status.active_agent.gateway_label || status.active_agent.label'),
  false,
  'status active_agent.label must stay diagnostic and must not become gateway authority',
);
assert.equal(
  correlationSource.includes("{ family: 'status.active_agent', path: 'status.active_agent.gateway_label'"),
  true,
  'correlation provenance may preserve status.active_agent gateway evidence',
);
assert.equal(
  correlationSource.includes("{ family: 'status.active_agent', path: 'status.active_agent.label'"),
  false,
  'correlation provenance must not promote status.active_agent.label into gateway/session authority',
);

const authorityMod = await import(pathToFileURL(sessionAuthorityPath).href);

assert.deepEqual(authorityMod.STRONG_ACTIVE_SESSION_IDENTITY_FIELDS, [
  'run_id',
  'attempt',
  'dispatch_id',
  'session_key',
]);
assert.equal(authorityMod.hasStrongActiveSessionIdentity({
  run_id: 'run-1',
  attempt: '1',
  dispatch_id: 'dispatch-1',
  session_key: 'agent:main:subagent:module-1',
}), true);
assert.equal(authorityMod.hasStrongActiveSessionIdentity({
  run_id: 'run-1',
  attempt: 1,
  dispatch_id: 'dispatch-1',
  session_key: 'agent:main:subagent:module-1',
}), true, 'numeric attempts are normalized before authority checks');
assert.equal(authorityMod.hasStrongActiveSessionIdentity({
  attempt: '1',
  dispatch_id: 'dispatch-1',
  session_key: 'agent:main:subagent:module-1',
}), false, 'run_id is required for strong active-session authority identity');

const confirmed = authorityMod.buildActiveSessionAuthorityPolicy({
  lifecycleActiveSession: {
    run_id: 'run-1',
    attempt: '2',
    dispatch_id: 'dispatch-2',
    session_key: 'agent:main:subagent:module-2',
    gateway_label: 'module-2',
  },
  evidenceActiveSession: {
    run_id: 'run-1',
    attempt: '2',
    dispatch_id: 'dispatch-2',
    session_key: 'agent:main:subagent:module-2',
    gateway_label: 'module-2',
    label: 'operator display only',
  },
});
assert.equal(confirmed.code, 'lifecycle_active_session_authoritative');
assert.equal(confirmed.confirmed, true);
assert.equal(confirmed.identity_confirmed, true);
assert.equal(confirmed.active_session_authority_source, 'lifecycle_read_model');
assert.equal(confirmed.allow_status_active_agent_authority, false, 'status.active_agent never becomes standalone authority');
assert.equal(confirmed.allow_active_session_file_authority, false, 'active-session JSON never becomes authority');
assert.equal(confirmed.allow_tracked_agent_authority, false, 'tracked agent map never becomes authority');
assert.equal(confirmed.allow_evidence_hydration, false, 'diagnostic evidence must not rehydrate lifecycle authority');
assert.equal(confirmed.lifecycle_active_session_role, 'lifecycle_read_model_authority');
assert.equal(confirmed.diagnostic_active_session_role, 'confirmed_diagnostic_evidence');
assert.deepEqual(confirmed.evidence_identity_confirmation.mismatched_fields, []);

const missingLifecycle = authorityMod.buildActiveSessionAuthorityPolicy({
  evidenceActiveSession: {
    run_id: 'run-1',
    attempt: '1',
    dispatch_id: 'dispatch-1',
    session_key: 'agent:main:subagent:module-1',
  },
});
assert.equal(missingLifecycle.code, 'no_lifecycle_active_session');
assert.equal(missingLifecycle.confirmed, false);
assert.equal(missingLifecycle.active_session_authority_source, null);
assert.equal(missingLifecycle.allow_evidence_hydration, false);
assert.equal(missingLifecycle.diagnostic_active_session_role, 'diagnostic_evidence');

const weakLifecycle = authorityMod.buildActiveSessionAuthorityPolicy({
  lifecycleActiveSession: {
    attempt: '1',
    dispatch_id: 'dispatch-1',
    label: 'display-only',
  },
});
assert.equal(weakLifecycle.code, 'no_lifecycle_active_session');
assert.equal(weakLifecycle.confirmed, false);
assert.deepEqual(weakLifecycle.missing_lifecycle_fields, ['run_id', 'session_key']);
assert.equal(weakLifecycle.lifecycle_active_session_role, 'absent');

const mismatchedEvidence = authorityMod.buildActiveSessionAuthorityPolicy({
  lifecycleActiveSession: {
    run_id: 'run-1',
    attempt: '1',
    dispatch_id: 'dispatch-1',
    session_key: 'agent:main:subagent:module-1',
    gateway_label: 'module-1',
  },
  evidenceActiveSession: {
    run_id: 'run-1',
    attempt: '2',
    dispatch_id: 'dispatch-1',
    session_key: 'agent:main:subagent:module-1',
    gateway_label: 'other-module',
  },
});
assert.equal(mismatchedEvidence.code, 'diagnostic_active_session_identity_mismatch');
assert.deepEqual(mismatchedEvidence.evidence_identity_confirmation.mismatched_fields, ['attempt']);
assert.deepEqual(mismatchedEvidence.evidence_identity_confirmation.optional_mismatched_fields, ['gateway_label']);
assert.equal(mismatchedEvidence.confirmed, true, 'diagnostic mismatch must not demote lifecycle authority');
assert.equal(mismatchedEvidence.diagnostic_active_session_role, 'diagnostic_evidence');

const needsGateway = authorityMod.buildActiveSessionAuthorityPolicy({
  lifecycleActiveSession: {
    run_id: 'run-1',
    attempt: '1',
    dispatch_id: 'dispatch-1',
    session_key: 'agent:main:subagent:module-1',
  },
  requireGatewayConfirmation: true,
});
assert.equal(needsGateway.code, 'lifecycle_active_session_requires_gateway_confirmation');
assert.equal(needsGateway.identity_confirmed, true);
assert.equal(needsGateway.confirmed, false);
assert.equal(needsGateway.gateway_confirmed, false);

const gatewayConfirmed = authorityMod.buildActiveSessionAuthorityPolicy({
  lifecycleActiveSession: {
    run_id: 'run-1',
    attempt: '1',
    dispatch_id: 'dispatch-1',
    session_key: 'agent:main:subagent:module-1',
  },
  gatewayEvidence: { confirmed: true, state: 'stopped' },
  requireGatewayConfirmation: true,
});
assert.equal(gatewayConfirmed.code, 'lifecycle_active_session_authoritative');
assert.equal(gatewayConfirmed.confirmed, true);
assert.equal(gatewayConfirmed.gateway_confirmed, true);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 53 }));
