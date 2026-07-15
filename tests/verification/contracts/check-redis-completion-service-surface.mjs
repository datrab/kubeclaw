import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-redis-completion-service-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { expandSwarmConfig } from '../../../skills/nova/pipeline/core/platform-config.ts';
import { resolveRedisCompletionPolicy } from '../../../skills/nova/pipeline/services/redis-completion-policy.ts';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const compactSwarmConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'charts/kubeclaw/files/config/swarm.config.json'), 'utf8'));
const redisCompletionPolicy = resolveRedisCompletionPolicy(expandSwarmConfig(compactSwarmConfig));
const redisToolPath = path.join(sourceRoot, 'skills/nova/pipeline/tools/redis.ts');
const completionServicePath = path.join(sourceRoot, 'skills/nova/pipeline/services/redis-completion.ts');
const commonRedisContractPath = path.join(sourceRoot, 'skills/common/pipeline/services/redis-message-contract.ts');
const commonTaskTransportContractPath = path.join(sourceRoot, 'skills/common/pipeline/services/task-transport-contract.ts');
const novaRedisContractShimPath = path.join(sourceRoot, 'skills/nova/pipeline/services/redis-message-contract.ts');
const busterRedisContractShimPath = path.join(sourceRoot, 'skills/buster/pipeline/services/redis-message-contract.ts');
const novaTaskTransportShimPath = path.join(sourceRoot, 'skills/nova/pipeline/services/task-transport-contract.ts');
const busterTaskTransportShimPath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-transport-contract.ts');
const busterRedisToolPath = path.join(sourceRoot, 'skills/buster/pipeline/tools/redis.ts');
const completionAdjudicatorPath = path.join(sourceRoot, 'skills/nova/pipeline/services/completion-adjudicator.ts');

const redisToolSource = fs.readFileSync(redisToolPath, 'utf8');
const completionServiceSource = fs.readFileSync(completionServicePath, 'utf8');
const commonRedisContractSource = fs.readFileSync(commonRedisContractPath, 'utf8');
const commonTaskTransportContractSource = fs.readFileSync(commonTaskTransportContractPath, 'utf8');
const novaRedisContractShimSource = fs.readFileSync(novaRedisContractShimPath, 'utf8');
const busterRedisContractShimSource = fs.readFileSync(busterRedisContractShimPath, 'utf8');
const novaTaskTransportShimSource = fs.readFileSync(novaTaskTransportShimPath, 'utf8');
const busterTaskTransportShimSource = fs.readFileSync(busterTaskTransportShimPath, 'utf8');
const busterRedisToolSource = fs.readFileSync(busterRedisToolPath, 'utf8');
const completionAdjudicatorSource = fs.readFileSync(completionAdjudicatorPath, 'utf8');

assert.equal(commonRedisContractSource.includes('export function validateRedisPipelineEnvelope('), true, 'common Redis contract must own the normalized pipeline envelope validator');
assert.equal(commonRedisContractSource.includes('export function validateRedisCompletionEntry('), true, 'common Redis contract must own the completion payload validator');
assert.equal(commonTaskTransportContractSource.includes('export function createRedisTaskQueue('), true, 'common transport contract must own the Redis TaskQueue adapter factory');
assert.equal(commonTaskTransportContractSource.includes('export function createRedisEventBus('), true, 'common transport contract must own the Redis EventBus adapter factory');
assert.equal(commonTaskTransportContractSource.includes('export function assertTaskQueueAdapter('), true, 'common transport contract must validate TaskQueue adapter shape');
assert.equal(commonTaskTransportContractSource.includes('export function assertEventBusAdapter('), true, 'common transport contract must validate EventBus adapter shape');
assert.equal(commonRedisContractSource.includes('REDIS_PIPELINE_TARGET_KINDS'), true, 'Redis contract must normalize target kind across module/gate/pipeline work');
assert.equal(commonRedisContractSource.includes("'module', 'gate', 'pipeline'"), true, 'Redis contract must include module/gate/pipeline target kinds');
assert.equal(commonRedisContractSource.includes('REDIS_TASK_TYPES'), true, 'Redis contract must normalize task/work item types');
assert.equal(commonRedisContractSource.includes("'module_test', 'gate_test'"), true, 'Redis contract must include canonical task/work item types');
assert.equal(novaRedisContractShimSource.includes("../../../common/pipeline/services/redis-message-contract.ts"), true, 'Nova Redis contract shim must point at the common Redis pipeline contract');
assert.equal(busterRedisContractShimSource.includes("../../../common/pipeline/services/redis-message-contract.ts"), true, 'Buster Redis contract shim must point at the common Redis pipeline contract');
assert.equal(novaTaskTransportShimSource.includes("../../../common/pipeline/services/task-transport-contract.ts"), true, 'Nova transport contract shim must point at the common transport contract');
assert.equal(busterTaskTransportShimSource.includes("../../../common/pipeline/services/task-transport-contract.ts"), true, 'Buster transport contract shim must point at the common transport contract');

assert.equal(completionServiceSource.includes('export function normalizeExpectedCompletionIdentity('), true, 'redis-completion service must own identity normalization');
assert.equal(completionServiceSource.includes('export async function scanLatestCompletionFromTail('), true, 'redis-completion service must own tail scanning');
assert.equal(completionServiceSource.includes('export async function archiveCompletionsChunked('), true, 'redis-completion service must own chunked archival');
assert.equal(completionServiceSource.includes('function decodeStreamEntry('), true, 'redis-completion service must own stream entry decoding');
assert.equal(completionServiceSource.includes('validateRedisCompletionEntry(entry)'), true, 'redis-completion service must validate decoded completion entries before selection/adjudication');
assert.equal(completionAdjudicatorSource.includes("redisOutcome === 'COMPLETION_INVALID'"), true, 'completion adjudicator must fail closed on invalid completion diagnostics');
assert.equal(busterRedisToolSource.includes('REDIS_TASK_TYPES'), false, 'Buster Redis sender must not keep a legacy non-pipeline task branch');
assert.equal(busterRedisToolSource.includes("'payload', JSON.stringify(payload)"), false, 'Buster Redis sender must not keep legacy raw payload XADD fields');
assert.equal(busterRedisToolSource.includes('buildRedisTaskStreamEntry({ type, sender, source, payload, iteration })'), true, 'Buster Redis sender must always build the canonical task envelope with explicit typed identity');
assert.equal(busterRedisToolSource.includes("from '../services/task-transport-contract.ts'"), true, 'Buster Redis sender must publish tasks through the TaskQueue boundary');
assert.equal(busterRedisToolSource.includes('async publishTask('), true, 'Buster Redis sender should expose the TaskQueue publish method');
assert.equal(busterRedisToolSource.includes('async sendTask('), false, 'Buster Redis sender must not keep the legacy task dispatch alias');

for (const forbidden of [
  'export function buildCompletionConflictEntry(',
  'export function normalizeExpectedCompletionIdentity(',
  'export function selectLatestCompletion(',
  'export async function scanLatestCompletionFromTail(',
  'export async function archiveCompletionsChunked(',
  'function decodeStreamEntry(',
]) {
  assert.equal(redisToolSource.includes(forbidden), false, `tools/redis.ts should not define completion helper: ${forbidden}`);
}

assert.equal(redisToolSource.includes("from '../services/redis-completion.ts'"), true, 'tools/redis.ts should import/re-export completion service helpers');
assert.equal(redisToolSource.includes("from '../services/task-transport-contract.ts'"), true, 'tools/redis.ts should publish tasks through the TaskQueue boundary');
assert.equal(redisToolSource.includes('async publishTask('), true, 'tools/redis.ts should expose the TaskQueue publish method for orchestrators');
assert.equal(redisToolSource.includes('async sendTask('), false, 'tools/redis.ts must not keep the legacy task dispatch alias');
assert.equal(redisToolSource.includes('async readCompletion('), true, 'tools/redis.ts should keep the adapter method for callers');
assert.equal(redisToolSource.includes('async archiveCompletions('), true, 'tools/redis.ts should keep the adapter method for callers');

const redisToolMod = await import(pathToFileURL(redisToolPath).href);
const completionServiceMod = await import(pathToFileURL(completionServicePath).href);
const commonRedisContractMod = await import(pathToFileURL(commonRedisContractPath).href);
const commonTaskTransportContractMod = await import(pathToFileURL(commonTaskTransportContractPath).href);
const completionAdjudicatorMod = await import(pathToFileURL(completionAdjudicatorPath).href);

for (const exportName of [
  'normalizeExpectedCompletionIdentity',
  'selectLatestCompletion',
  'scanLatestCompletionFromTail',
  'archiveCompletionsChunked',
  'validateRedisCompletionEntry',
  'validateRedisPipelineEnvelope',
  'validateRedisTaskEntry',
  'assertRedisCompletionEntry',
  'assertRedisTaskEntry',
  'normalizeRedisPipelineEnvelope',
  'buildRedisTaskStreamEntry',
]) {
  assert.equal(typeof completionServiceMod[exportName], 'function', `service should export ${exportName}`);
  assert.equal(redisToolMod[exportName], completionServiceMod[exportName], `tools/redis.ts should re-export ${exportName} for compatibility`);
}
assert.equal(completionServiceMod.validateRedisCompletionEntry, commonRedisContractMod.validateRedisCompletionEntry, 'completion service should re-export the common completion validator');
assert.equal(completionServiceMod.validateRedisPipelineEnvelope, commonRedisContractMod.validateRedisPipelineEnvelope, 'completion service should re-export the common envelope validator');
assert.equal(completionServiceMod.validateRedisTaskEntry, commonRedisContractMod.validateRedisTaskEntry, 'completion service should re-export the common task validator');

const validGateCompletion = {
  _id: '1-0',
  schema_version: 'v1',
  type: 'completion',
  stream_role: 'completion',
  project: 'proj',
  run_id: 'run-1',
  target_kind: 'gate',
  target_id: 'security-review',
  gate_id: 'security-review',
  gate_type: 'pen_test',
  module: 'gate:security-review',
  status: 'PASS',
  outcome: 'PASS',
  source: 'buster-pipeline',
  attempt: '2',
  dispatch_id: 'dispatch-2',
  session_key: 'agent:echo:session-1',
  summary: 'gate passed',
  timestamp: '2026-05-09T00:00:00.000Z',
};
assert.deepEqual(commonRedisContractMod.validateRedisCompletionEntry(validGateCompletion), [], 'completion validation should require canonical envelope by default');
assert.deepEqual(commonRedisContractMod.validateRedisCompletionEntry(validGateCompletion, { requireCanonicalEnvelope: true, expectedStreamRole: 'completion' }), []);
assert.deepEqual(commonRedisContractMod.normalizeRedisPipelineEnvelope(validGateCompletion), {
  schema_version: 'v1',
  type: 'completion',
  stream_role: 'completion',
  project: 'proj',
  run_id: 'run-1',
  target_kind: 'gate',
  target_id: 'security-review',
  module: 'gate:security-review',
  gate_id: 'security-review',
  gate_type: 'pen_test',
  attempt: '2',
  dispatch_id: 'dispatch-2',
  session_key: 'agent:echo:session-1',
  source: 'buster-pipeline',
  timestamp: '2026-05-09T00:00:00.000Z',
});
assert.equal(commonRedisContractMod.inferRedisPipelineTargetKind({ target_id: 'gate:design-review' }), 'gate');
assert.equal(commonRedisContractMod.inferRedisPipelineTargetKind({ target_id: '01' }), 'module');
assert.equal(commonRedisContractMod.inferRedisPipelineTargetKind({ module: 'gate:design-review' }), null);

const moduleTaskEntry = commonRedisContractMod.buildRedisTaskStreamEntry({
  type: 'module_test',
  sender: 'nova',
  source: 'nova',
  iteration: 2,
  timestamp: '2026-05-09T00:00:00.000Z',
  payload: {
    task_type: 'module_test',
    module_id: '01',
    project: 'proj',
    run_id: 'run-task',
    attempt: 4,
    dispatch_id: 'dispatch-task',
    completion_stream: 'pipeline:proj:completions',
  },
});
assert.deepEqual(commonRedisContractMod.validateRedisTaskEntry(moduleTaskEntry, { requireStreamId: false }), []);
assert.equal(moduleTaskEntry.schema_version, 'v1');
assert.equal(moduleTaskEntry.stream_role, 'task');
assert.equal(moduleTaskEntry.target_kind, 'module');
assert.equal(moduleTaskEntry.target_id, '01');

const gateTaskEntry = commonRedisContractMod.buildRedisTaskStreamEntry({
  type: 'gate_test',
  sender: 'nova',
  source: 'nova',
  iteration: 1,
  timestamp: '2026-05-09T00:00:00.000Z',
  payload: {
    task_type: 'gate_test',
    module_id: 'security-review',
    gate_id: 'security-review',
    gate_type: 'pen_test',
    project: 'proj',
    run_id: 'run-gate-task',
    attempt: 1,
    dispatch_id: 'dispatch-gate-task',
    completion_stream: 'pipeline:proj:completions',
  },
});
assert.deepEqual(commonRedisContractMod.validateRedisTaskEntry(gateTaskEntry, { requireStreamId: false }), []);
assert.equal(gateTaskEntry.target_kind, 'gate');
assert.equal(gateTaskEntry.target_id, 'security-review');
assert.equal(gateTaskEntry.gate_type, 'pen_test');
assert.deepEqual(
  commonRedisContractMod.validateRedisTaskEntry({ ...moduleTaskEntry, target_kind: 'gate' }, { requireStreamId: false }),
  ["target_kind must be 'module' for module_test"],
);
assert.throws(
  () => commonRedisContractMod.assertRedisTaskEntry({ ...gateTaskEntry, schema_version: null }, { requireStreamId: false }),
  (error) => error?.name === 'RedisPipelineMessageInvalidError'
    && error?.code === 'REDIS_PIPELINE_MESSAGE_INVALID'
    && error?.validationErrors?.includes("schema_version must be 'v1'"),
  'assertRedisTaskEntry should throw structured diagnostics for invalid task entries',
);

assert.deepEqual(
  commonRedisContractMod.validateRedisCompletionEntry({ ...validGateCompletion, run_id: '' }),
  ['run_id must be a non-empty string'],
  'completion entries must carry strong run identity by default',
);
assert.deepEqual(
  commonRedisContractMod.validateRedisCompletionEntry({ ...validGateCompletion, schema_version: null }),
  ["schema_version must be 'v1'"],
  'active completion validation must reject legacy non-canonical envelopes by default',
);
assert.deepEqual(
  commonRedisContractMod.validateRedisCompletionEntry({ ...validGateCompletion, stream_role: null }),
  ["stream_role must be 'completion'"],
  'active completion validation must require completion stream role by default',
);
assert.deepEqual(
  commonRedisContractMod.validateRedisCompletionEntry({ ...validGateCompletion, status: 'DONE' }, { requireCanonicalEnvelope: true, expectedStreamRole: 'completion' }),
  ['status must be one of: PASS, FAIL, BLOCKED, RATE_LIMITED, ISSUES_FOUND'],
  'completion statuses must stay in the normalized enum',
);
assert.deepEqual(
  commonRedisContractMod.validateRedisCompletionEntry({ ...validGateCompletion, outcome: 'PARTIAL' }, { requireCanonicalEnvelope: true, expectedStreamRole: 'completion' }),
  ['outcome must be one of: PASS, FAIL, BLOCKED, ISSUES_FOUND, TIMEOUT, RATE_LIMITED, COMPLETION_CONFLICT, COMPLETION_INVALID'],
  'completion outcomes must stay in the normalized enum',
);
assert.deepEqual(
  commonRedisContractMod.validateRedisCompletionEntry({ ...validGateCompletion, source: 'unknown-producer' }, { requireCanonicalEnvelope: true, expectedStreamRole: 'completion' }),
  ['source must be one of: buster-pipeline, buster-pipeline-task-queue, completion-conflict, completion-invalid, agent'],
  'completion sources must stay in the normalized enum',
);
assert.throws(
  () => commonRedisContractMod.assertRedisCompletionEntry({ ...validGateCompletion, dispatch_id: null }, { requireCanonicalEnvelope: true, expectedStreamRole: 'completion' }),
  (error) => error?.name === 'RedisPipelineMessageInvalidError'
    && error?.code === 'REDIS_PIPELINE_MESSAGE_INVALID'
    && error?.validationErrors?.includes('dispatch_id must be a non-empty string'),
  'assertRedisCompletionEntry should throw structured diagnostics for invalid entries',
);

const normalizedGateCompletionEntries = [
  ['9-0', [
    'schema_version', 'v1',
    'type', 'completion',
    'stream_role', 'completion',
    'project', 'proj',
    'target_kind', 'gate',
    'target_id', 'security-review',
    'gate_id', 'security-review',
    'gate_type', 'pen_test',
    'module', 'gate:security-review',
    'status', 'PASS',
    'outcome', 'PASS',
    'source', 'buster-pipeline',
    'run_id', 'run-gate',
    'attempt', '3',
    'dispatch_id', 'dispatch-gate',
    'session_key', 'agent:echo:gate-session',
    'timestamp', '2026-05-09T00:00:00.000Z',
  ]],
];
const selectedGateById = completionServiceMod.selectLatestCompletion(normalizedGateCompletionEntries, 'security-review', {
  run_id: 'run-gate',
  attempt: 3,
  dispatch_id: 'dispatch-gate',
});
assert.equal(selectedGateById?._id, '9-0');
assert.equal(selectedGateById.target_kind, 'gate');
assert.equal(selectedGateById.target_id, 'security-review');
const selectedGateByPrefixedId = completionServiceMod.selectLatestCompletion(normalizedGateCompletionEntries, 'gate:security-review', {
  run_id: 'run-gate',
  attempt: 3,
  dispatch_id: 'dispatch-gate',
});
assert.equal(selectedGateByPrefixedId?._id, '9-0');

const invalidCurrentIdentityEntries = [
  ['8-0', ['type', 'completion', 'module', '01', 'status', 'DONE', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current']],
  ['7-0', ['type', 'completion', 'module', '01', 'status', 'PASS', 'source', 'buster-pipeline', 'run_id', 'run-current', 'attempt', '2', 'dispatch_id', 'dispatch-current']],
];
const selectedInvalid = completionServiceMod.selectLatestCompletion(invalidCurrentIdentityEntries, '01', {
  run_id: 'run-current',
  attempt: 2,
  dispatch_id: 'dispatch-current',
});
assert.equal(selectedInvalid.source, 'completion-invalid');
assert.equal(selectedInvalid.status, 'FAIL');
assert.equal(selectedInvalid.outcome, 'COMPLETION_INVALID');
assert.equal(selectedInvalid.reason, 'invalid_completion_entry_schema');
assert.match(selectedInvalid.invalid_completion_errors, /status must be one of/);

const fakeRedis = {
  async xrevrange() {
    return invalidCurrentIdentityEntries;
  },
};
const scanInvalid = await completionServiceMod.scanLatestCompletionFromTail(fakeRedis, 'stream:test', '01', {
  run_id: 'run-current',
  attempt: 2,
  dispatch_id: 'dispatch-current',
}, {
  batchSize: redisCompletionPolicy.tailScanBatchSize,
  scanLimit: redisCompletionPolicy.tailScanLimit,
});
assert.equal(scanInvalid.match.source, 'completion-invalid');
assert.equal(scanInvalid.conflict.source, 'completion-invalid');

const invalidAdjudication = completionAdjudicatorMod.adjudicateCompletionEvidence({
  targetKind: 'module',
  targetId: '01',
  expectedStatuses: ['PASS', 'FAIL', 'BLOCKED'],
  expectedIdentity: { run_id: 'run-current', attempt: '2', dispatch_id: 'dispatch-current' },
  redisEntry: scanInvalid.match,
  preferRedis: true,
});
assert.equal(invalidAdjudication.completion_conflict, true);
assert.equal(invalidAdjudication.authority_policy.code, 'redis_completion_entry_invalid');
assert.equal(invalidAdjudication.authority_policy.allow_redis_authority, false);

const transportCalls = [];
const fakeRedisTransport = {
  async xadd(...args) {
    transportCalls.push({ op: 'xadd', args });
    return '9-0';
  },
  async xgroup(...args) {
    transportCalls.push({ op: 'xgroup', args });
    return 'OK';
  },
  async call(...args) {
    transportCalls.push({ op: 'call', args });
    return ['0-0', []];
  },
  async xreadgroup(...args) {
    transportCalls.push({ op: 'xreadgroup', args });
    return null;
  },
  async xack(...args) {
    transportCalls.push({ op: 'xack', args });
    return 1;
  },
  async xtrim(...args) {
    transportCalls.push({ op: 'xtrim', args });
    return 1;
  },
};
const taskQueue = commonTaskTransportContractMod.createRedisTaskQueue(fakeRedisTransport, {
  streamKey: 'swarm:buster:tasks',
  groupName: 'buster-group',
  consumerName: 'buster-consumer',
  pollInterval: 1,
  reclaimIdleMs: 2,
  maxLen: 3,
});
assert.equal(commonTaskTransportContractMod.assertTaskQueueAdapter(taskQueue), taskQueue);
assert.equal(commonTaskTransportContractMod.assertEventBusAdapter(commonTaskTransportContractMod.createRedisEventBus(fakeRedisTransport)).publish instanceof Function, true);
assert.deepEqual(await taskQueue.ensureConsumerGroup(), { ok: true, created: true, stream: 'swarm:buster:tasks', group: 'buster-group' });
assert.deepEqual(await taskQueue.publishTask('swarm:buster:tasks', { type: 'module_test', payload: '{}' }), { ok: true, id: '9-0', stream: 'swarm:buster:tasks' });
assert.throws(
  () => commonTaskTransportContractMod.flattenTransportFields(['type', 'module_test']),
  /transport fields must be an object/,
  'typed transport input should reject raw Redis field arrays outside decoder internals',
);
assert.equal(await taskQueue.readNext(), null);
assert.deepEqual(await taskQueue.ack('9-0'), { ok: true, stream: 'swarm:buster:tasks', group: 'buster-group', id: '9-0' });
assert.deepEqual(await taskQueue.trim(), { ok: true, stream: 'swarm:buster:tasks', max_len: 3 });
assert.deepEqual(
  transportCalls.map((entry) => entry.op),
  ['xgroup', 'xadd', 'call', 'xreadgroup', 'xack', 'xtrim'],
  'TaskQueue/EventBus contract should own Redis stream operations',
);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 109 }));
