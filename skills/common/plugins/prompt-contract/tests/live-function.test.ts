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

console.log(JSON.stringify({ ok: true, library: '@kubeclaw/prompt-contract', suite: 'live-function' }));
