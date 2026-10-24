import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

test('lease CRD types immutable bounded profile and proof-only persistence', () => {
  // Rendered production CRD is verified separately; isolate the structural spec
  // here by replacing the chart's existing scalar parameters only.
  const source = fs.readFileSync('charts/kubeclaw/templates/buster-namespace-lease-crd.yaml', 'utf8');
  const selected = source.slice(source.indexOf('              properties:\n                familyclawBootstrap:'),
    source.indexOf('                namespaceName:', source.indexOf('              properties:\n                familyclawBootstrap:')));
  const profile = yaml.load(selected).properties.familyclawBootstrap;
  assert.deepEqual(profile.properties.profile.enum, ['familyclaw.v1']);
  assert.deepEqual(profile.required, ['profile', 'release']);
  assert.match(source, /familyclawBootstrap is immutable/);
  assert.match(source, /self\.ttlSeconds <= 3600/);
  assert.match(source, /!has\(self\.testCredentials\)/);
  const begin = source.indexOf('                familyclawBootstrapIntent:');
  const end = source.indexOf('                podReplacement:', begin);
  const proof = yaml.load(source.slice(begin, end));
  assert.equal(proof.familyclawBootstrapSecrets.maxProperties, 6);
  assert.deepEqual(Object.keys(proof.familyclawBootstrapSource.properties), ['name', 'uid', 'digest']);
  assert.deepEqual(Object.keys(proof.familyclawBootstrapSecrets.additionalProperties.properties), ['uid', 'digest']);
  assert.equal(JSON.stringify(proof).includes('stringData'), false);
});
