import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
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
assert.equal(terminationSource.includes('SESSION_TERMINATION_POLICY_DEFAULTS'), true, 'termination timing defaults must be policy-scoped');
assert.equal(terminationSource.includes('maxGraceMs: 10000'), true, 'termination controller must hard-cap grace period at 10 seconds');
assert.equal(terminationSource.includes('resolveSessionTerminationPolicy'), true, 'termination controller must resolve timing through the policy helper');
assert.equal(terminationSource.includes('terminationGraceMs'), false, 'termination controller must not accept legacy grace aliases');
assert.equal(terminationSource.includes('opts.confirmTimeoutMs'), false, 'termination controller must not accept confirmTimeoutMs as a grace alias');
assert.equal(terminationSource.includes('return SESSION_TERMINATION_POLICY_DEFAULTS'), false, 'invalid termination policy values must not silently fall back to defaults');
assert.equal(terminationSource.includes('Promise.race'), true, 'termination controller must race teardown against its isolated grace budget');
assert.equal(terminationSource.includes('assertValidSessionTerminationResult(result)'), true, 'termination controller must validate canonical result before returning');
const terminationMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/common/pipeline/agents/session-termination.ts')).href);
assert.throws(() => terminationMod.resolveSessionTerminationPolicy({ graceMs: -1 }), /graceMs must be a finite number >= 0/);
assert.throws(() => terminationMod.resolveSessionTerminationPolicy({ confirmPollMs: 0 }), /confirmPollMs must be a finite number >= 1/);

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

const trackedAgentsMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/common/pipeline/agents/tracked-agents.ts')).href);
assert.throws(() => trackedAgentsMod.trackAgent({}, '', 'session', 'agent', 'gateway'), /trackAgent requires explicit tracked agent label/);
assert.throws(() => trackedAgentsMod.untrackAgent(null), /untrackAgent requires explicit tracked agent label/);
assert.throws(() => trackedAgentsMod.getTrackedAgent(undefined), /getTrackedAgent requires explicit tracked agent label/);

const sourceMarkers = [
  ['skills/common/pipeline/agents/acp-monitor.ts', 'assertValidAcpMonitorState({'],
  ['skills/common/pipeline/agents/acp-monitor.ts', 'assertValidAcpTranscriptState(state)'],
  ['skills/common/pipeline/agents/acp-monitor.ts', 'assertValidAcpSessionStateEventPayload({'],
  ['skills/common/pipeline/agents/acp-monitor.ts', 'assertValidAcpTranscriptDeltaEventPayload({'],
  ['skills/common/pipeline/agents/lifecycle.ts', 'assertValidSessionLifecycleRecord({'],
  ['skills/common/pipeline/agents/lifecycle.ts', 'assertValidKillSessionResult({'],
  ['skills/common/pipeline/agents/session-termination.ts', 'assertValidSessionTerminationResult(result)'],
  ['skills/common/pipeline/integrations/gateway.ts', 'normalizeGatewayInvokeResult(parsed)'],
  ['skills/common/pipeline/integrations/gateway.ts', 'buildGatewayInvokeHttpError(tool, response.status, response.statusText, text)'],
];
for (const [relPath, marker] of sourceMarkers) {
  const text = fs.readFileSync(path.join(sourceRoot, relPath), 'utf8');
  assert.equal(text.includes(marker), true, `${relPath} should use contract owner marker: ${marker}`);
}

console.log(JSON.stringify({ ok: true, checked: 39 + sourceMarkers.length }));
