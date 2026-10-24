import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

test('bootstrap schema compiles under registry strict mode and preserves bounded opt-in', () => {
  const schema = JSON.parse(fs.readFileSync('skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json', 'utf8'));
  const validate = new Ajv2020({strict: true, allErrors: true}).compile(schema);
  const basic = {serviceName: 'familyclaw-core', servicePort: 8080};
  assert.equal(validate(basic), true);
  const configured = {...basic, fullStack: true, verifiedImages: ['registry.test/app@sha256:' + 'a'.repeat(64)], familyclawBootstrap: {profile: 'familyclaw.v1', release: 'familyclaw'}, namespacePrefix: 'test', retention: {seconds: 60}};
  assert.equal(validate(configured), true, JSON.stringify(validate.errors));
  for (const patch of [{fullStack: undefined}, {namespacePrefix: 'foreign'}, {retention: {seconds: 3601}}, {testCredentials: {mode: 'generate', secretName: 'foreign'}}, {secretReferences: ['foreign']}]) {
    assert.equal(validate({...configured, ...patch}), false, JSON.stringify(patch));
  }
});
