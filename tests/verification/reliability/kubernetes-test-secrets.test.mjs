import test from 'node:test';
import assert from 'node:assert/strict';
import { testSecretContract, validateTestSecretBindings } from '../../../skills/buster/plugins/kubernetes-fixture/src/test-secrets.js';
const contract = () => ({values:{password:{kind:'random',bytes:32,encoding:'hex'},server:{kind:'tls',host:'database'}},secrets:{database:{password:'${password}','tls.crt':'${server.cert}','tls.key':'${server.key}','ca.crt':'${server.ca}'},application:{connection:'postgresql://test:${password}@database:5432/test'}}});
const scope = {fullStack:true,namespacePrefix:'test',retentionSeconds:600};
test('existing fixture accepts declarative coupled random/TLS data with no secret values in request',()=>{
 const raw=contract(); const result=testSecretContract(raw); assert.deepEqual(result,raw); assert.notEqual(result,raw);
 validateTestSecretBindings(result,[{env:[{valueFrom:{secretKeyRef:{name:'database',key:'password'}}}]}],scope);
});
for (const [name,mutate] of [
 ['unknown generator',r=>{r.values.password.kind='command';}],
 ['weak randomness',r=>{r.values.password.bytes=1;}],
 ['unresolved reference',r=>{r.secrets.database.password='${missing}';}],
 ['TLS field missing',r=>{r.secrets.database['tls.key']='${server}';}],
 ['random field confusion',r=>{r.secrets.database.password='${password.key}';}],
 ['malformed reference',r=>{r.secrets.database.password='${password';}],
 ['command injection property',r=>{r.values.password.command='cat /token';}],
 ['journal name',r=>{r.secrets['buster-test-secrets-journal-forged']={key:'${password}'};}],
 ['external TLS identity',r=>{r.values.server.host='production.example.com';}],
 ['unknown root',r=>{r.script='evil';}],
]) test(`reject ${name}`,()=>{const raw=contract();mutate(raw);assert.throws(()=>testSecretContract(raw));});
for (const [name,documents,extra] of [
 ['journal mount',[{secret:{secretName:'buster-test-secrets-journal-other'}}],{}],
 ['foreign Secret',[{secretRef:{name:'provider-production'}}],{}],
 ['wrong key',[{secretKeyRef:{name:'database',key:'undeclared'}}],{}],
 ['copied collision',[],{secretReferences:['database']}],
 ['demo collision',[],{testCredentials:{secretName:'database'}}],
 ['wrong namespace',[],{namespacePrefix:'preview'}],
 ['long TTL',[],{retentionSeconds:3601}],
 ['old profile mixing',[],{familyclawBootstrap:{}}],
 ['CSI escape',[{csi:{driver:'external'}}],{}],
]) test(`bind rejects ${name}`,()=>assert.throws(()=>validateTestSecretBindings(testSecretContract(contract()),documents,{...scope,...extra})));
for (const key of ['.', '..', '..password']) test(`reject Kubernetes reserved key ${key}`,()=>{const raw=contract();raw.secrets.database[key]='${password}';assert.throws(()=>testSecretContract(raw));});
