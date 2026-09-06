// Real exported serializer, ordinary JavaScript inputs; no substitute.
import assert from 'node:assert/strict';
import { stablePromptJson } from '../../../skills/common/plugins/prompt-contract/src/index.ts';
let calls = 0;
const value = { get evidence() { calls++; return calls; } };
const first = stablePromptJson(value), second = stablePromptJson(value);
assert.notEqual(first, second);
const sparse = new Array(1); sparse.extra = 'lost';
assert.equal(stablePromptJson(sparse), '[null]');
assert.equal(stablePromptJson({ [Symbol('evidence')]: 'lost' }), '{}');
console.log(JSON.stringify({finding:'PCR-PROMPT-001', reproduced:true, first, second, sparse:'[null]', symbol:'{}'}));
