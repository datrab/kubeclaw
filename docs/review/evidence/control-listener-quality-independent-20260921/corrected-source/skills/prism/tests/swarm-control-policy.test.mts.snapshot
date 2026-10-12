import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadControlServerConfig } from '../server/control-config.ts';
import { loadPrismSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import { controlPolicyFixture, writeControlPolicy } from './fixtures/control-policy.mts';

const credentials = { PRISM_SESSION_SECRET:'test', PRISM_INGRESS_SECRET:'test', PRISM_INGESTION_SECRET:'test',
  PRISM_DISPATCH_SECRET:'test', PRISM_WORKER_SECRET:'test' };
const invalid = {
  pipelinePreferenceSubject: [undefined, '', 'operator:test', 'user-abc', 1, false],
  artifactRoot: [undefined, null, '', '/', 'relative', '/tmp/../artifacts', '/tmp/artifacts/', '/tmp//artifacts', '/tmp/\u0000artifacts', 1],
  studioPublicUrl: [undefined, null, '', 'relative', 'file:///tmp', 'https://', 'https://user:pass@studio', 'https://studio?query=1', 'https://studio#fragment', 'https://bad host', 1],
};
for (const [key, values] of Object.entries(invalid)) for (const value of values) {
  test(`CC1 Control ${key} rejects ${JSON.stringify(value)}`, t => {
    const env = controlPolicyFixture(t, {[key]:value});
    assert.throws(() => loadControlServerConfig({...credentials,...env}), /SWARM_CONFIG_INVALID/);
  });
}
for (const value of [undefined, null, {}, {unknown:1}]) test('CC1 strict Control object', t => {
  const env = controlPolicyFixture(t, {}), config = JSON.parse(fs.readFileSync(env.SWARM_CONFIG,'utf8'));
  config.operator.prism.control = value; fs.writeFileSync(env.SWARM_CONFIG,JSON.stringify(config));
  assert.throws(() => loadPrismSettings(env), /SWARM_CONFIG_INVALID/);
});
for (const key of ['PRISM_PIPELINE_PREFERENCE_SUBJECT','ARTIFACT_ROOT','PRISM_STUDIO_PUBLIC_URL']) {
  test(`CC2 retired ${key} rejects even empty`, t => {
    const env = {...credentials,...controlPolicyFixture(t,{})};
    for (const value of ['', 'old']) assert.throws(() => loadControlServerConfig({...env,[key]:value}), /SWARM_CONFIG_LEGACY_OVERRIDE/);
  });
}
test('CC2 authored Control snapshot survives file mutation', t => {
  const env = controlPolicyFixture(t, {pipelinePreferenceSubject:`user-${'a'.repeat(24)}`,studioPublicUrl:'https://selected.example.test'});
  const settings = loadPrismSettings(env), service = loadControlServerConfig({...credentials,...env});
  assert.ok(Object.isFrozen(settings.control)); assert.ok(Object.isFrozen(service));
  writeControlPolicy(env.root, {pipelinePreferenceSubject:null,studioPublicUrl:'https://changed.example.test'});
  assert.equal(service.pipelinePreferenceSubject,`user-${'a'.repeat(24)}`);
  assert.equal(service.studioPublicUrl,'https://selected.example.test');
  assert.equal(settings.control.studioPublicUrl,'https://selected.example.test');
});
