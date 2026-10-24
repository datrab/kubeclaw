import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { testContract } from '../../../skills/buster/plugins/kubernetes-fixture/src/provider.js';

test('fixture schema and provider reject removed project-specific configuration', () => {
  const schema = JSON.parse(fs.readFileSync('skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json', 'utf8'));
  const validate = new Ajv2020({strict: true, allErrors: true}).compile(schema);
  const basic = {serviceName: 'app', servicePort: 8080,
    image: {reference: 'registry.test/app@sha256:' + 'a'.repeat(64), digest: 'sha256:' + 'a'.repeat(64)}};
  assert.equal(validate(basic), true);
  assert.equal(testContract.configuration({configuration: {values: basic}, inputs: []}).serviceName, 'app');
  for (const obsolete of [{profile: 'familyclaw.v1', release: 'familyclaw'}, null, {}]) {
    const values = {...basic, familyclawBootstrap: obsolete};
    assert.equal(validate(values), false);
    assert.throws(() => testContract.configuration({configuration: {values}, inputs: []}), /CONFIG_UNKNOWN/u);
  }
});
