import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureBootstrapProfile, validateBootstrapManifest } from '../../../skills/buster/engine/test-gates/kubernetes-fixture-bootstrap.ts';
import { testContract } from '../../../skills/buster/plugins/kubernetes-fixture/src/provider.js';

const image = 'registry.local/app@sha256:' + 'a'.repeat(64);
const profile = { profile: 'familyclaw.v1', release: 'familyclaw' };
const payload = { familyclawBootstrap: profile, fullStack: true, namespacePrefix: 'test',
  retentionSeconds: 300, secretReferences: [], serviceName: 'familyclaw-core', servicePort: 8080 };
const values = { ...payload, retention: { seconds: 300 }, image: { reference: image, digest: 'sha256:' + 'a'.repeat(64) },
  verifiedImages: [image] };
const invocation: any = { runId:'run',nodeId:'fixture',attemptId:'attempt',moduleId:null,timeoutMs:30000,
  configuration:{ values },inputs:[] };
const names = ['familyclaw-database-bootstrap', 'familyclaw-database-owner', 'familyclaw-database-tls',
  'familyclaw-runtime', 'familyclaw-openclaw', 'familyclaw-firefly'];
const documents = [{envFrom:names.map(name => ({secretRef:{name}}))}];

test('provider forwards exact profile to capability, runtime requires explicit opt-in', () => {
  const config = testContract.configuration(invocation);
  const request = testContract.capabilityRequest(invocation, config,
    {file:'/checked.yaml',artifact:{contentDigest:'sha256:'+'b'.repeat(64)}});
  assert.deepEqual(request.payload.familyclawBootstrap, profile);
  assert.deepEqual(fixtureBootstrapProfile(request.payload, true), profile);
  assert.throws(() => fixtureBootstrapProfile(request.payload, false), /BOOTSTRAP_DISABLED/);
  assert.equal(fixtureBootstrapProfile({}, false), undefined);
  assert.equal(JSON.stringify(request.payload).includes('stringData'), false);
});
test('provider and runtime reject profile escalation, private values and mismatched bindings', () => {
  for (const change of [
    {familyclawBootstrap:{...profile,profile:'arbitrary'}},
    {familyclawBootstrap:{...profile,data:'private-value'}},
    {familyclawBootstrap:{...profile,release:'../foreign'}},
    {fullStack:undefined,verifiedImages:undefined},
    {namespacePrefix:'other'},
    {serviceName:'foreign-core'},
    {servicePort:80},
    {testCredentials:{mode:'generate',secretName:'demo'}},
    {secretReferences:['prism-test-runtime']},
    {retention:{seconds:3601},retentionSeconds:3601},
  ]) {
    const candidate:any={...values,...change};
    assert.throws(() => testContract.configuration({...invocation,configuration:{values:candidate}}));
    const runtime:any={...payload,...change};
    assert.throws(() => fixtureBootstrapProfile(runtime,true));
  }
});
test('manifest admits exactly role references, never private journal or foreign/image-pull refs', () => {
  validateBootstrapManifest(documents);
  for (const bad of [
    [...documents,{volumes:[{secret:{secretName:'familyclaw-bootstrap-journal-abcdef'}}]}],
    [...documents,{env:[{valueFrom:{secretKeyRef:{name:'prism-test-runtime',key:'token'}}}]}],
    [...documents,{projected:{sources:[{secret:{name:'foreign'}}]}}],
    [...documents,{imagePullSecrets:[{name:'foreign'}]}],
    [...documents,{csi:{driver:'foreign',nodePublishSecretRef:{name:'foreign'}}}],
    [...documents,{flexVolume:{driver:'foreign',secretRef:{name:'foreign'}}}],
    [{envFrom:names.slice(1).map(name=>({secretRef:{name}}))}],
  ]) assert.throws(() => validateBootstrapManifest(bad), /BOOTSTRAP_SECRET/);
});
