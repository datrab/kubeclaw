import assert from 'node:assert/strict';
import {
  createPromptEnvelope,
  PROMPT_CONTRACT_VERSION,
  serializePromptEnvelope,
  stablePromptJson,
} from '../src/index.ts';

const first = serializePromptEnvelope({
  task: 'Review the implementation.',
  evidence: { z: 2, a: [{ status: 'passed', id: 'check:1' }] },
  responseContract: { required: ['status'], type: 'object' },
  guidance: ['Use only supplied evidence.', 'Return one JSON object.'],
});
const second = serializePromptEnvelope({
  guidance: ['Use only supplied evidence.', 'Return one JSON object.'],
  responseContract: { type: 'object', required: ['status'] },
  evidence: { a: [{ id: 'check:1', status: 'passed' }], z: 2 },
  task: 'Review the implementation.',
});
assert.equal(first, second);
assert.equal(first, JSON.stringify({
  evidence: { a: [{ id: 'check:1', status: 'passed' }], z: 2 },
  guidance: ['Use only supplied evidence.', 'Return one JSON object.'],
  responseContract: { required: ['status'], type: 'object' },
  schemaVersion: PROMPT_CONTRACT_VERSION,
  task: 'Review the implementation.',
}));
assert.deepEqual(createPromptEnvelope({
  task: 'Execute tests.',
  evidence: [],
  responseContract: { status: ['PASS', 'FAIL'] },
}), {
  evidence: [],
  guidance: [],
  responseContract: { status: ['PASS', 'FAIL'] },
  schemaVersion: PROMPT_CONTRACT_VERSION,
  task: 'Execute tests.',
});

assert.throws(() => stablePromptJson({ value: Number.NaN }), /PROMPT_VALUE_NUMBER_INVALID/);
assert.throws(() => stablePromptJson({ value: undefined }), /PROMPT_VALUE_UNSUPPORTED/);
assert.throws(() => stablePromptJson(new Date()), /PROMPT_VALUE_PROTOTYPE_INVALID/);
assert.throws(() => stablePromptJson(new Array(2)), /PROMPT_VALUE_ARRAY_SPARSE/);
const cycle: Record<string, unknown> = {};
cycle.self = cycle;
assert.throws(() => stablePromptJson(cycle), /PROMPT_VALUE_CYCLE/);
const unsafe = Object.create(null) as Record<string, unknown>;
unsafe.__proto__ = 'unsafe';
assert.throws(() => stablePromptJson(unsafe), /PROMPT_VALUE_KEY_INVALID/);
assert.throws(
  () => serializePromptEnvelope({
    task: 'x',
    evidence: { payload: 'too large' },
    responseContract: {},
  }, { maxBytes: 16 }),
  /PROMPT_VALUE_SIZE_EXCEEDED/,
);
assert.throws(() => createPromptEnvelope({
  task: '',
  evidence: {},
  responseContract: {},
}), /PROMPT_TASK_INVALID/);
assert.equal(
  Object.keys(createPromptEnvelope({
    task: 'No authority.',
    evidence: {},
    responseContract: {},
  })).sort().join(','),
  'evidence,guidance,responseContract,schemaVersion,task',
);



let accessorCalls = 0;
const accessor = { get evidence() { accessorCalls++; return accessorCalls; } };
const sparseWithExtra = Object.assign(new Array(1), { extra: 'lost' });
for (const value of [accessor, sparseWithExtra, { [Symbol('evidence')]: 'lost' },
  Object.defineProperty({}, 'hidden', { value: 'lost' }),
  Object.assign([1], { extra: 'lost' }),
  Object.defineProperty([1], '0', { get() { accessorCalls++; return 1; } }),
  new Proxy({}, { ownKeys() { accessorCalls++; return []; } }),
]) assert.throws(() => stablePromptJson(value), /PROMPT_VALUE_/);
const validInput = { task: 'Review.', evidence: {}, responseContract: {} };
assert.throws(() => createPromptEnvelope({ ...validInput, get guidance() { accessorCalls++; return []; } }), /PROMPT_VALUE_/);
assert.throws(() => createPromptEnvelope({ ...validInput, [Symbol('extra')]: 'lost' }), /PROMPT_VALUE_/);
assert.throws(() => createPromptEnvelope({ ...validInput, guidance: Object.assign(['ok'], { extra: 'lost' }) }), /PROMPT_VALUE_/);
assert.equal(accessorCalls, 0);
assert.equal(stablePromptJson({ a: 1 }, { maxDepth: 1, maxEntries: 2 }), '{"a":1}');
assert.throws(() => stablePromptJson({ a: { b: 1 } }, { maxDepth: 1 }), /PROMPT_VALUE_DEPTH_EXCEEDED/);
assert.throws(() => stablePromptJson({ a: 1 }, { maxEntries: 1 }), /PROMPT_VALUE_ENTRIES_EXCEEDED/);
assert.throws(() => stablePromptJson('x'.repeat(262_144)), /PROMPT_VALUE_SIZE_EXCEEDED/);

console.log(JSON.stringify({ ok: true, library: '@kubeclaw/prompt-contract', suite: 'live-function' }));
