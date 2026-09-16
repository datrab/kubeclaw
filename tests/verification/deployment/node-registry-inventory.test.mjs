import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectNodeRegistry} from '../../../scripts/inspect-node-registry.mjs';

test('projects transport facts without credentials, headers, paths or URL tokens', () => {
  const secret = 'never-print-this';
  const result = inspectNodeRegistry({
    mirrors: {'registry.internal:30051': {endpoint: [`https://user:${secret}@registry.internal:30051/${secret}?token=${secret}`],
      rewrite: {[secret]: secret}, header: {Authorization: secret}}},
    configs: {'registry.internal:30051': {auth: {password: secret}, tls: {ca_file: secret, cert_file: secret, key_file: secret, insecure_skip_verify: true}}},
  });
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.deepEqual(result.mirrors[0].endpoints, [{scheme: 'https', host: 'registry.internal', port: '30051'}]);
  assert.equal(result.settings[0].authConfigured, true);
  assert.equal(result.settings[0].insecureSkipVerify, true);
});

test('invalid endpoint diagnostics cannot echo the input', () => {
  const result = inspectNodeRegistry({mirrors: {registry: {endpoint: ['invalid secret value']}}});
  assert.deepEqual(result.mirrors[0].endpoints, [{invalid: true}]);
  assert.ok(!JSON.stringify(result).includes('invalid secret value'));
  assert.throws(() => inspectNodeRegistry([]), /mapping/);
});
