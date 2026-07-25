import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-gate-active-session-surface' });
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';


const { sourceRoot } = parseSourceRootArgs();
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/gate-active-session.ts');
const reviewPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.ts');
const reviewTaskPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-task.ts');
const busterPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.ts');
const gateFixScaffoldPath = path.join(sourceRoot, 'skills/nova/pipeline/services/gate-fix-scaffold.ts');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const reviewSource = fs.readFileSync(reviewPath, 'utf8');
const reviewTaskSource = fs.readFileSync(reviewTaskPath, 'utf8');
const busterSource = fs.readFileSync(busterPath, 'utf8');
const gateFixScaffoldSource = fs.readFileSync(gateFixScaffoldPath, 'utf8');

assert.equal(helperSource.includes('export function persistGateActiveSession('), true, 'shared gate active-session helper should export persistGateActiveSession');
assert.equal(helperSource.includes('export function clearGateActiveSession('), true, 'shared gate active-session helper should export clearGateActiveSession');
assert.equal(helperSource.includes('export function buildGateActiveSessionRecoveryPolicy('), true, 'shared gate active-session helper should export recovery authority policy');
assert.equal(helperSource.includes('export function resolveGateActiveSessionRecoveryEvidence('), true, 'shared gate active-session helper should export recovery evidence resolver');
assert.equal(helperSource.includes('allow_gate_active_session_file_authority: false'), true, 'gate active-session files must stay recovery evidence, not standalone authority');
assert.equal(helperSource.includes('allow_evidence_hydration: false'), true, 'gate active-session evidence must never hydrate lifecycle authority');
assert.equal(helperSource.includes("active_session_authority_source: hasLifecycleAuthority ? 'lifecycle_read_model' : null"), true, 'lifecycle read model should be the only gate active-session authority source');
assert.equal(helperSource.includes('gateActiveSessionPath'), true, 'shared gate active-session helper should own gateActiveSessionPath usage');

assert.equal(reviewSource.includes("from './review-gate-task.ts'"), true, 'review gate runner should delegate review task execution to the extracted task helper');
assert.equal(reviewTaskSource.includes("from '../services/gate-active-session.ts'"), true, 'review gate task helper should import the shared gate active-session helper');
assert.equal(busterSource.includes("from '../services/gate-active-session.ts'"), true, 'buster gate runner should import the shared gate active-session helper');
assert.equal(gateFixScaffoldSource.includes("from './gate-active-session.ts'"), true, 'gate fix scaffold should import the shared gate active-session helper');
assert.equal(reviewTaskSource.includes('persistGateActiveSession(config, gateId'), true, 'review gate task remains a live gate active-session evidence producer');
assert.equal(busterSource.includes('persistGateActiveSession(config, gateId'), true, 'Buster gate runner remains a live gate active-session evidence producer');
assert.equal(gateFixScaffoldSource.includes('persistGateActiveSession(config, gateId'), true, 'gate fix scaffold remains a live gate active-session evidence producer');
assert.equal(helperSource.includes('lifecycle_active_session_identity_incomplete'), false, 'gate lifecycle weak-evidence branch should be deleted after producer audit');
assert.equal(helperSource.includes('requireStrong: true'), true, 'gate active-session recovery policy should ignore incomplete identities');
assert.equal(helperSource.includes('if (!hasStrongActiveSessionIdentity(identity))'), true, 'gate active-session file producer must reject incomplete identity before writing');
assert.equal(helperSource.includes('Skipping weak gate active-session evidence'), true, 'gate active-session file producer should make skipped weak emissions visible in debug logs');
assert.equal(reviewSource.includes('function persistGateActiveSession('), false, 'review gate runner must not keep a local persistGateActiveSession helper');
assert.equal(reviewSource.includes('function clearGateActiveSession('), false, 'review gate runner must not keep a local clearGateActiveSession helper');
assert.equal(busterSource.includes('function persistGateActiveSession('), false, 'buster gate runner must not keep a local persistGateActiveSession helper');
assert.equal(busterSource.includes('function clearGateActiveSession('), false, 'buster gate runner must not keep a local clearGateActiveSession helper');
assert.equal(reviewSource.includes('function writeJsonAtomic('), false, 'review gate runner must not keep a local writeJsonAtomic helper for gate active-session persistence');
assert.equal(busterSource.includes('function writeJsonAtomic('), false, 'buster gate runner must not keep a local writeJsonAtomic helper for gate active-session persistence');

const helperMod = await import(pathToFileURL(helperPath).href);
assert.equal(typeof helperMod.persistGateActiveSession, 'function', 'shared gate active-session helper should expose persistGateActiveSession');
assert.equal(typeof helperMod.clearGateActiveSession, 'function', 'shared gate active-session helper should expose clearGateActiveSession');
assert.equal(typeof helperMod.buildGateActiveSessionRecoveryPolicy, 'function', 'shared gate active-session helper should expose recovery authority policy');
assert.equal(typeof helperMod.resolveGateActiveSessionRecoveryEvidence, 'function', 'shared gate active-session helper should expose recovery evidence resolver');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-active-session-authority-'));
const config = {
  _runId: 'run-gate-active-session-authority',
  paths: { swarm_dir: path.join(tempRoot, '.swarm') },
};
const projectLogDir = path.join(config.paths.swarm_dir, 'logs');
const gateId = 'gate:review';
const lifecycleIdentity = {
  gate_id: gateId,
  run_id: config._runId,
  attempt: '2',
  dispatch_id: 'lifecycle-dispatch',
  session_key: 'agent:parent:subagent:lifecycle',
  gateway_label: 'lifecycle-gateway',
};
const staleFileIdentity = {
  gate_id: gateId,
  run_id: config._runId,
  attempt: '1',
  dispatch_id: 'stale-dispatch',
  session_key: 'agent:parent:subagent:stale-file',
  gateway_label: 'stale-gateway',
};
const readModelsPath = path.join(projectLogDir, 'pipeline', 'runs', config._runId, 'lifecycle', 'read-models.json');
fs.mkdirSync(path.dirname(readModelsPath), { recursive: true });
fs.writeFileSync(readModelsPath, JSON.stringify({
  schemaVersion: 'v1',
  run_id: config._runId,
  active_sessions: { modules: {}, gates: { [gateId]: lifecycleIdentity } },
}, null, 2) + '\n');
const activeSessionPath = path.join(projectLogDir, 'gates', gateId, 'active-session.json');
fs.mkdirSync(path.dirname(activeSessionPath), { recursive: true });
fs.writeFileSync(activeSessionPath, JSON.stringify(staleFileIdentity, null, 2) + '\n');

const recoveryEvidence = helperMod.resolveGateActiveSessionRecoveryEvidence(config, gateId);
assert.equal(recoveryEvidence.policy.code, 'lifecycle_active_session_overrides_conflicting_gate_file', 'lifecycle active-session authority should override conflicting gate file evidence');
assert.equal(recoveryEvidence.policy.active_session_authority_source, 'lifecycle_read_model');
assert.equal(recoveryEvidence.policy.allow_status_active_agent_authority, false);
assert.equal(recoveryEvidence.policy.allow_gate_active_session_file_authority, false);
assert.equal(recoveryEvidence.policy.allow_tracked_agent_authority, false);
assert.equal(recoveryEvidence.policy.allow_evidence_hydration, false);
assert.equal(recoveryEvidence.policy.gate_active_session_file_role, 'gate_active_session_recovery_evidence');
assert.equal(recoveryEvidence.policy.lifecycle_active_session_role, 'lifecycle_read_model_authority');
assert.equal(recoveryEvidence.policy.gate_active_session_file_conflicts_with_lifecycle, true);
assert.equal(recoveryEvidence.active.session_key, lifecycleIdentity.session_key, 'recovery should use lifecycle identity, not stale gate active-session file');
assert.equal(recoveryEvidence.policy.gate_active_session_file.session_key, staleFileIdentity.session_key, 'stale file should remain visible as recovery evidence');

fs.writeFileSync(readModelsPath, JSON.stringify({
  schemaVersion: 'v1',
  run_id: config._runId,
  active_sessions: { modules: {}, gates: {} },
}, null, 2) + '\n');
const fileOnlyRecoveryEvidence = helperMod.resolveGateActiveSessionRecoveryEvidence(config, gateId);
assert.equal(fileOnlyRecoveryEvidence.policy.code, 'gate_active_session_file_diagnostic_only', 'file-only gate active-session evidence must not become recovery authority');
assert.equal(fileOnlyRecoveryEvidence.policy.allow_gate_active_session_file_authority, false);
assert.equal(fileOnlyRecoveryEvidence.policy.allow_evidence_hydration, false);
assert.equal(fileOnlyRecoveryEvidence.active, null, 'file-only active-session evidence must not provide a recovery identity');
assert.equal(fileOnlyRecoveryEvidence.policy.gate_active_session_file.session_key, staleFileIdentity.session_key, 'file-only evidence remains inspectable');

fs.unlinkSync(activeSessionPath);
const weakPersisted = helperMod.persistGateActiveSession(config, gateId, 'weak-gate-label', { sessionKey: 'agent:parent:subagent:weak-gate' });
assert.equal(weakPersisted, false, 'weak gate active-session evidence must not be persisted');
const weakFileRecoveryEvidence = helperMod.resolveGateActiveSessionRecoveryEvidence(config, gateId);
assert.equal(weakFileRecoveryEvidence.file_exists, false, 'weak gate active-session writer must not create active-session files');
assert.equal(weakFileRecoveryEvidence.policy.code, 'no_gate_active_session_evidence', 'weak file-only gate active-session evidence must not enter recovery policy');
assert.equal(weakFileRecoveryEvidence.policy.allow_gate_active_session_file_authority, false);
assert.equal(weakFileRecoveryEvidence.policy.allow_evidence_hydration, false);
assert.equal(weakFileRecoveryEvidence.active, null, 'weak file-only gate active-session evidence must not become recovery identity');
assert.equal(weakFileRecoveryEvidence.policy.gate_active_session_file, null, 'weak file evidence must not remain inspectable as recovery evidence');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 47 }));
