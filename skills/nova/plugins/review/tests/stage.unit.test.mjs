import assert from 'node:assert/strict';
import fs from 'node:fs';

import { execute } from '../dist/stage.js';

const pass = JSON.parse(fs.readFileSync(
  new URL('./fixtures/pass.json', import.meta.url),
  'utf8',
));
const invocations = [];
const context = {
  contract: {
    config: { agent: 'reviewer:primary' },
    guidance: { helperPrompt: 'Inspect ownership boundaries.' },
  },
  async invoke(capability, request) {
    invocations.push({ capability, request });
    return { result: pass };
  },
};

const result = await execute({
  task: 'Review the plugin.',
  evidence: { artifact: 'lint-report' },
}, context);

assert.equal(result.outcome, 'passed');
assert.equal(invocations.length, 1);
assert.equal(invocations[0].capability, 'runtime.dispatch');
assert.equal(invocations[0].request.operation, 'dispatch');
assert.equal(
  invocations[0].request.resource.canonicalId,
  'reviewer:primary',
);
assert.equal(
  invocations[0].request.payload.protocol,
  'kubeclaw.review.v2',
);
assert.match(
  invocations[0].request.payload.task,
  /Inspect ownership boundaries/,
);

const invalid = await execute(
  { task: 'Review the plugin.' },
  {
    ...context,
    async invoke() {
      return {
        result: {
          schemaVersion: 'stage-result.v2',
          outcome: 'passed',
          artifacts: [],
        },
      };
    },
  },
);
assert.equal(invalid.outcome, 'blocked');
assert.equal(invalid.reason.code, 'kubeclaw.review.invalid_output');

await assert.rejects(
  execute(
    { task: 'Review the plugin.' },
    { ...context, contract: { config: {} } },
  ),
  /agent is not configured/,
);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.review',
  suite: 'stage-unit',
}));
