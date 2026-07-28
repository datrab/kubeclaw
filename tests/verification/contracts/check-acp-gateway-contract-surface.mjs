import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';


const { sourceRoot } = parseSourceRootArgs();
const contractPath = path.join(sourceRoot, 'skills/common/pipeline/services/acp-gateway-contract.ts');
const contractMod = await import(pathToFileURL(contractPath).href);

for (const name of [
  'validateAcpTranscriptState',
  'assertValidAcpTranscriptState',
  'validateAcpMonitorState',
  'assertValidAcpMonitorState',
  'validateAcpSessionStateEventPayload',
  'assertValidAcpSessionStateEventPayload',
  'validateAcpTranscriptDeltaEventPayload',
  'assertValidAcpTranscriptDeltaEventPayload',
  'validateSessionLifecycleRecord',
  'assertValidSessionLifecycleRecord',
  'validateKillSessionResult',
  'assertValidKillSessionResult',
  'normalizeGatewayInvokeResult',
  'validateGatewayInvokeResult',
  'assertValidGatewayInvokeResult',
  'buildGatewayInvokeHttpError',
  'validateGatewayInvokeError',
]) {
  assert.equal(typeof contractMod[name], 'function', `${name} should be exported by the common contract owner`);
}

const transcript = {
  offset: 1,
  byteOffset: 42,
  eventCount: 1,
  lastEventTs: '2026-05-10T13:49:00.000Z',
  lastActivityPoll: 0,
  hardError: false,
  rateLimited: false,
  terminal: false,
  lastDetail: '',
  partialLine: '',
  newLines: ['{"kind":"assistant","text":"ok"}'],
};
assert.deepEqual(contractMod.validateAcpTranscriptState(transcript), []);
assert.equal(contractMod.assertValidAcpTranscriptState(transcript), transcript);
assert.throws(
  () => contractMod.assertValidAcpTranscriptState({ ...transcript, newLines: [42] }),
  /ACP transcript state failed ACP\/gateway contract validation: newLines must be an array of strings/,
);

const monitor = {
  sessionKey: 'agent:main:acp:contract',
  sessionState: 'running',
  sessionActive: true,
  transcript,
  unknownPolls: 0,
  transcriptStalePolls: 0,
  gatewayUnreachable: false,
  gatewayDetail: null,
  terminal: false,
  rateLimited: false,
  reason: null,
  detail: 'running',
  lastDetail: 'running',
  lastSummary: 'running',
  failed: false,
  sessionTerminal: false,
  stopped: false,
};
assert.deepEqual(contractMod.validateAcpMonitorState(monitor), []);
assert.equal(contractMod.assertValidAcpMonitorState(monitor), monitor);
assert.throws(
  () => contractMod.assertValidAcpMonitorState({ ...monitor, sessionActive: 'yes' }),
  /sessionActive is invalid/,
);

assert.throws(
  () => contractMod.assertValidAcpMonitorState({ ...monitor, extra: true }),
  /monitor.extra is not allowed/,
);

const sessionStatePayload = {
  session_key: monitor.sessionKey,
  session_state: monitor.sessionState,
  session_active: monitor.sessionActive,
  gateway_unreachable: monitor.gatewayUnreachable,
  gateway_detail: monitor.gatewayDetail,
  terminal: monitor.terminal,
  rate_limited: monitor.rateLimited,
  reason: monitor.reason,
  detail: monitor.detail,
  monitor_state: monitor,
};
assert.deepEqual(contractMod.validateAcpSessionStateEventPayload(sessionStatePayload), []);
assert.equal(contractMod.assertValidAcpSessionStateEventPayload(sessionStatePayload), sessionStatePayload);
assert.throws(
  () => contractMod.assertValidAcpSessionStateEventPayload({ ...sessionStatePayload, session_active: 'true' }),
  /session_active is invalid/,
);

const transcriptDeltaPayload = {
  session_key: monitor.sessionKey,
  new_lines: transcript.newLines,
  line_count: transcript.newLines.length,
  transcript_offset: transcript.offset,
  byte_offset: transcript.byteOffset,
  transcript,
  monitor_state: monitor,
};
assert.deepEqual(contractMod.validateAcpTranscriptDeltaEventPayload(transcriptDeltaPayload), []);
assert.equal(contractMod.assertValidAcpTranscriptDeltaEventPayload(transcriptDeltaPayload), transcriptDeltaPayload);
assert.throws(
  () => contractMod.assertValidAcpTranscriptDeltaEventPayload({ ...transcriptDeltaPayload, offset: transcript.offset }),
  /offset is not allowed/,
);
assert.throws(
  () => contractMod.assertValidAcpTranscriptDeltaEventPayload({ ...transcriptDeltaPayload, line_count: '1' }),
  /line_count is invalid/,
);
assert.throws(
  () => contractMod.assertValidAcpTranscriptDeltaEventPayload({ ...transcriptDeltaPayload, line_count: 2 }),
  /line_count must equal new_lines.length/,
);

const sessionRecord = {
  childSessionKey: 'agent:main:subagent:abc',
  runId: 'run-1',
  label: 'contract-session',
  agentId: 'claude',
  model: 'claude-sonnet-4',
  streamLogPath: null,
  runtime: 'subagent',
  gatewayLabel: 'contract-session',
  cwd: sourceRoot,
  activeStatePath: null,
};
assert.deepEqual(contractMod.validateSessionLifecycleRecord(sessionRecord), []);
assert.throws(
  () => contractMod.assertValidSessionLifecycleRecord({ ...sessionRecord, childSessionKey: '' }),
  /childSessionKey is invalid/,
);

const killResult = { requested: true, confirmed: false, state: 'running', cleanupAttempted: false };
assert.deepEqual(contractMod.validateKillSessionResult(killResult), []);
assert.equal(contractMod.assertValidKillSessionResult(killResult), killResult);
assert.throws(
  () => contractMod.assertValidKillSessionResult({ ...killResult, confirmed: 'false' }),
  /confirmed is invalid/,
);

const terminationResult = {
  sessionKey: 'agent:main:subagent:abc',
  requested: true,
  confirmed: false,
  unconfirmed: true,
  terminal: false,
  state: 'running',
  cleanupAttempted: false,
  cleanupConfirmed: false,
  cleanupError: null,
  graceMs: 5000,
};
assert.deepEqual(contractMod.validateSessionTerminationResult(terminationResult), []);
assert.equal(contractMod.assertValidSessionTerminationResult(terminationResult), terminationResult);
assert.throws(
  () => contractMod.assertValidSessionTerminationResult({ ...terminationResult, unconfirmed: false }),
  /unconfirmed must be the inverse of confirmed/,
);
assert.throws(
  () => contractMod.assertValidSessionTerminationResult({ ...terminationResult, legacy: true }),
  /termination.legacy is not allowed/,
);

const gatewayObject = { result: { details: { status: 'accepted', childSessionKey: 'child' } } };
assert.equal(contractMod.normalizeGatewayInvokeResult(gatewayObject), gatewayObject);
assert.deepEqual(contractMod.normalizeGatewayInvokeResult(true), { raw: 'true' });
assert.deepEqual(contractMod.normalizeGatewayInvokeResult(['a']), { raw: '["a"]' });
assert.deepEqual(contractMod.validateGatewayInvokeResult({ raw: 'not json' }), []);
assert.throws(
  () => contractMod.assertValidGatewayInvokeResult('not-object'),
  /gateway invoke result failed ACP\/gateway contract validation/,
);

const httpErr = contractMod.buildGatewayInvokeHttpError('session_status', 503, 'Service Unavailable', '{"error":"down"}');
assert.equal(httpErr.message, 'Gateway session_status failed: 503 Service Unavailable');
assert.equal(httpErr.httpStatus, 503);
assert.equal(httpErr.httpBody, '{"error":"down"}');
assert.deepEqual(contractMod.validateGatewayInvokeError(httpErr), []);

const terminationSource = fs.readFileSync(path.join(sourceRoot, 'skills/common/pipeline/agents/session-termination.ts'), 'utf8');
assert.equal(terminationSource.includes('SESSION_TERMINATION_POLICY_DEFAULTS'), false, 'termination timing defaults must not live in code');
assert.equal(terminationSource.includes('maxGraceMs: 10000'), false, 'termination max grace must come from swarm.config.json policy');
assert.equal(terminationSource.includes('resolveSessionTerminationPolicy'), true, 'termination controller must resolve timing through the policy helper');
assert.equal(terminationSource.includes('terminationGraceMs'), false, 'termination controller must not accept legacy grace aliases');
assert.equal(terminationSource.includes('opts.confirmTimeoutMs'), false, 'termination controller must not accept confirmTimeoutMs as a grace alias');
assert.equal(terminationSource.includes('return SESSION_TERMINATION_POLICY_DEFAULTS'), false, 'invalid termination policy values must not silently fall back to defaults');
assert.equal(terminationSource.includes('Promise.race'), true, 'termination controller must race teardown against its isolated grace budget');
assert.equal(terminationSource.includes('assertValidSessionTerminationResult(result)'), true, 'termination controller must validate canonical result before returning');
const terminationMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/common/pipeline/agents/session-termination.ts')).href);
const explicitTerminationPolicy = {
  graceMs: 1,
  maxGraceMs: 10,
  confirmPollMs: 1,
  gatewayRequestMaxMs: 1,
  cleanupConfirmTimeoutMs: 0,
  statusTimeoutMs: 1,
  requestTimeoutMs: 1,
  stopRequestTimeoutMs: 1,
  listTimeoutMs: 1,
  acpxTimeoutMs: 1,
};
assert.throws(() => terminationMod.resolveSessionTerminationPolicy({ ...explicitTerminationPolicy, graceMs: -1 }), /graceMs must be a finite number >= 0/);
assert.throws(() => terminationMod.resolveSessionTerminationPolicy({ ...explicitTerminationPolicy, confirmPollMs: 0 }), /confirmPollMs must be a finite number >= 1/);

const lifecycleSource = fs.readFileSync(path.join(sourceRoot, 'skills/common/pipeline/agents/lifecycle.ts'), 'utf8');
assert.equal(lifecycleSource.includes('SESSION_SPAWN_POLICY_DEFAULTS'), false, 'session spawn timing/defaults must not live in code');
assert.equal(lifecycleSource.includes('SESSION_KILL_POLICY_DEFAULTS'), false, 'session kill timing/defaults must not live in code');
assert.equal(lifecycleSource.includes("'match_confirm_timeout'"), true, 'session kill cleanup confirmation policy must explicitly support match-confirm-timeout from swarm.config.json');
assert.equal(lifecycleSource.includes('function resolveCleanupConfirmTimeoutMs'), true, 'session kill cleanup confirmation sentinel must be resolved after option merging');
assert.equal(lifecycleSource.includes('opts.cleanupConfirmTimeoutMs ?? SESSION_KILL_POLICY_DEFAULTS.cleanupConfirmTimeoutMs'), false, 'session kill cleanup confirmation must not fall back to code defaults');
assert.equal(lifecycleSource.includes('opts.maxRetries ?? 3'), false, 'spawnSession must not use anonymous retry defaults');
assert.equal(lifecycleSource.includes('opts.retryDelayMs ?? 5000'), false, 'spawnSession must not use anonymous retry delay defaults');
assert.equal(lifecycleSource.includes("spawnGatewaySession, 'session spawn', spawnArgs, 30000"), false, 'spawnSession must not use anonymous gateway request timeout');
assert.equal(lifecycleSource.includes("opts.stopMessage || '/stop'"), false, 'killSession must not use anonymous stop-message defaults');
assert.equal(lifecycleSource.includes('opts.confirmTimeoutMs ?? (isSubagent ? 120000 : 15000)'), false, 'killSession confirm timeout must resolve through named policy');
assert.equal(lifecycleSource.includes('opts.cleanupConfirmTimeoutMs ?? confirmTimeoutMs'), false, 'killSession cleanup confirmation timeout must resolve through named policy');

const acpMonitorSource = [
  'acp-monitor.ts',
  'acp-monitor-events.ts',
  'acp-monitor-state.ts',
  'acp-monitor-transcript.ts',
  'acp-monitor-wait.ts',
].map((file) => fs.readFileSync(path.join(sourceRoot, 'skills/common/pipeline/agents', file), 'utf8')).join('\n');
assert.equal(acpMonitorSource.includes('SESSION_IDLE_POLICY_DEFAULTS'), false, 'session idle timing defaults must not live in code');
assert.equal(acpMonitorSource.includes('optsOrGraceMs'), false, 'waitForSessionIdle must not accept legacy positional grace arguments');
assert.equal(acpMonitorSource.includes('maybeTimeoutMs'), false, 'waitForSessionIdle must not accept legacy positional timeout arguments');
assert.equal(acpMonitorSource.includes('isNovaSignature'), false, 'ACP monitor must not keep legacy Nova positional signature detection');
assert.equal(acpMonitorSource.includes('export async function getAcpMonitorState(...args'), false, 'ACP monitor state must expose one object-shaped call surface');
assert.equal(acpMonitorSource.includes('maybeStreamLogPath'), false, 'ACP monitor must not keep legacy positional stream-log argument handling');
assert.equal(acpMonitorSource.includes('getState(childSessionKey, streamLogPath, previousState, monitorOpts)'), false, 'ACP monitor event adapter must not call monitor hooks with legacy positional arguments');
assert.equal(acpMonitorSource.includes('arguments.length !== 1'), true, 'ACP monitor must reject extra positional arguments');
assert.equal(acpMonitorSource.includes('if (request.trackedAgent !== undefined && request.trackedAgent !== null)'), true, 'ACP monitor object-shaped Nova path must branch on explicit tracked session presence');
assert.equal(acpMonitorSource.includes('return resolveTrackedAgent(sessionLabelOrKey);'), true, 'ACP monitor object-shaped Nova path must resolve tracked session data when absent from the request');
assert.equal(acpMonitorSource.includes('selectDefinedValue(() => (selectDefinedValue(() => (entry?.streamLogPath), () => (request.streamLogPath))), () => (null))'), true, 'ACP monitor Nova path must keep tracked transcript path precedence');
assert.equal(acpMonitorSource.includes('classifyTranscriptText(gatewayDetail)'), false, 'ACP monitor must not infer rate limits from unauthorised gateway detail text');

const novaSessionEndSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/polling-session-end.ts'), 'utf8');
assert.equal(novaSessionEndSource.includes('classifyTranscriptText'), false, 'Nova session-end monitor must rely on typed rate-limit monitor state, not raw text scanning');

const busterSessionMonitorSource = fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/services/session-monitor.ts'), 'utf8');
assert.equal(busterSessionMonitorSource.includes('classifyTranscriptText'), false, 'Buster session monitor must rely on typed rate-limit monitor state, not raw text scanning');

const lifecycleMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/common/pipeline/agents/lifecycle.ts')).href);
await assert.rejects(
  () => lifecycleMod.spawnSession({ session: { runtime: 'acp', agentId: 'claude', cwd: sourceRoot, label: 'missing-model' } }, 'prompt', null),
  /spawnSession requires explicit session\.model/,
  'spawnSession must not silently default missing model identity',
);
await assert.rejects(
  () => lifecycleMod.spawnSession({ session: { model: 'anthropic/claude-sonnet-4-6', agentId: 'claude', cwd: sourceRoot, label: 'missing-runtime' } }, 'prompt', null),
  /spawnSession requires explicit session\.runtime/,
  'spawnSession must not silently infer missing runtime identity',
);
await assert.rejects(
  () => lifecycleMod.spawnSession({ session: { runtime: 'acp', model: 'anthropic/claude-sonnet-4-6', cwd: sourceRoot, label: 'missing-agent' } }, 'prompt', null),
  /spawnSession requires explicit session\.agentId/,
  'spawnSession must not silently default missing agent identity',
);
await assert.rejects(
  () => lifecycleMod.spawnSession({ session: { runtime: 'acp', model: 'anthropic/claude-sonnet-4-6', agentId: 'claude', cwd: sourceRoot } }, 'prompt', null),
  /spawnSession requires explicit session\.label/,
  'spawnSession must not silently default missing label identity',
);
const acpMonitorMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/common/pipeline/agents/acp-monitor.ts')).href);
await assert.rejects(
  () => acpMonitorMod.getAcpMonitorState(),
  /getAcpMonitorState requires exactly one options object/,
  'getAcpMonitorState must reject missing monitor options',
);
await assert.rejects(
  () => acpMonitorMod.getAcpMonitorState('agent:main:acp:legacy-monitor'),
  /getAcpMonitorState requires a single options object/,
  'getAcpMonitorState must reject legacy positional monitor arguments',
);
await assert.rejects(
  () => acpMonitorMod.getAcpMonitorState({ acp_monitor: { poll_limit: 1 } }, 'legacy-label', {}),
  /getAcpMonitorState requires exactly one options object/,
  'getAcpMonitorState must reject legacy Nova positional monitor arguments',
);
await assert.rejects(
  () => acpMonitorMod.waitForSessionIdle('agent:main:acp:legacy-idle', 1000),
  /waitForSessionIdle requires an options object/,
  'waitForSessionIdle must reject legacy positional grace arguments',
);

const trackedAgentsMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/common/pipeline/agents/tracked-agents.ts')).href);
assert.throws(() => trackedAgentsMod.trackAgent({}, '', 'session', 'agent', 'gateway'), /trackAgent requires explicit tracked agent label/);
assert.throws(() => trackedAgentsMod.untrackAgent(null), /untrackAgent requires explicit tracked agent label/);
assert.throws(() => trackedAgentsMod.getTrackedAgent(undefined), /getTrackedAgent requires explicit tracked agent label/);

const sourceMarkers = [
  ['skills/common/pipeline/agents/acp-monitor-state.ts', 'assertValidAcpMonitorState({'],
  ['skills/common/pipeline/agents/acp-monitor-transcript.ts', 'assertValidAcpTranscriptState(state)'],
  ['skills/common/pipeline/agents/acp-monitor-events.ts', 'assertValidAcpSessionStateEventPayload({'],
  ['skills/common/pipeline/agents/acp-monitor-events.ts', 'assertValidAcpTranscriptDeltaEventPayload({'],
  ['skills/common/pipeline/agents/session-spawn.ts', 'assertValidSessionLifecycleRecord({'],
  ['skills/common/pipeline/agents/lifecycle.ts', 'assertValidKillSessionResult({'],
  ['skills/common/pipeline/agents/session-termination.ts', 'assertValidSessionTerminationResult(result)'],
  ['skills/common/pipeline/integrations/gateway.ts', 'assertValidGatewayInvokeResult(normalizeGatewayInvokeResult(JSON.parse(text)))'],
  ['skills/common/pipeline/integrations/gateway.ts', 'buildGatewayInvokeHttpError(tool, response.status, response.statusText, text)'],
];
for (const [relPath, marker] of sourceMarkers) {
  const text = fs.readFileSync(path.join(sourceRoot, relPath), 'utf8');
  assert.equal(text.includes(marker), true, `${relPath} should use contract owner marker: ${marker}`);
}

console.log(JSON.stringify({ ok: true, checked: 39 + sourceMarkers.length }));
