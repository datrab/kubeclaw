import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256Text} from '../../../skills/common/plugin-runtime/sdk/src/index.ts';
import {generatedDemoCredentials} from '../../../skills/buster/engine/test-gates/generated-demo-credentials.ts';

// Explicit API response vectors complement the controller's real HTTP/store generation test.
test('original fixture credential reader requires exact generated Secret and lease provenance',()=>{
 const expected={leaseName:'lease-one',namespace:'test-one',secretName:'demo-login',immutableImage:`registry.example/app@sha256:${'a'.repeat(64)}`,manifestDigest:`sha256:${'b'.repeat(64)}`};
 const values={username:'preview',password:'pipeline-generated-example'};
 const source={schemaVersion:'generated-demo-credential-source.v1',leaseUID:'lease-uid',secretUID:'secret-uid',secretResourceVersion:'1',namespace:expected.namespace,secretName:expected.secretName,credentialDigest:sha256Text(canonicalJson(values))};
 const lease={metadata:{name:expected.leaseName,uid:source.leaseUID},spec:{verifiedImage:expected.immutableImage,manifestDigest:expected.manifestDigest,testCredentials:{mode:'generate',secretName:expected.secretName}},status:{namespaceName:expected.namespace,credentialsAvailable:true,generatedCredentials:source}};
 const secret={immutable:true,metadata:{name:expected.secretName,namespace:expected.namespace,uid:source.secretUID,resourceVersion:'1',annotations:{'kubeclaw.forgestack.ai/generated-demo-credentials':'v1','kubeclaw.forgestack.ai/credential-lease-uid':source.leaseUID},labels:{'kubeclaw/buster-lease-uid':source.leaseUID,'kubeclaw/managed-by':'buster-namespace-controller'}},data:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Buffer.from(value).toString('base64')]))};
 assert.deepEqual(generatedDemoCredentials(lease,secret,expected).values,values);
 for(const mutate of [value=>value.metadata.uid='replaced',value=>value.metadata.resourceVersion='2',value=>delete value.metadata.annotations,value=>value.immutable=false,value=>value.data.password=Buffer.from('changed').toString('base64'),value=>value.data.platform_token='c2VjcmV0']){
  const changed=structuredClone(secret);mutate(changed);assert.throws(()=>generatedDemoCredentials(lease,changed,expected),/DEMO_CREDENTIAL/);
 }
 const foreign=structuredClone(lease);foreign.metadata.uid='other-lease';assert.throws(()=>generatedDemoCredentials(foreign,secret,expected),/DEMO_CREDENTIAL/);
 const existing=structuredClone(lease);existing.spec.testCredentials.mode='existing';assert.throws(()=>generatedDemoCredentials(existing,secret,expected),/DEMO_CREDENTIAL/);
});
