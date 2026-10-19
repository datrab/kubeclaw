import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
const sourcePublicKey=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
import {spawnSync} from 'node:child_process';
import {buildBusterImageBundle} from '../../../scripts/build-buster-image-bundle.mjs';
import {captureSwarmSettings} from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import {materializePipelineGeneration,declaredPipelineServices} from '../../../scripts/updates/pipeline-generation.mjs';
let suiteRoot,image;
test.before(async()=>{suiteRoot=fs.mkdtempSync(path.join(os.tmpdir(),'buster-entrypoint-'));image=await buildBusterImageBundle({repository:process.cwd(),output:path.join(suiteRoot,'image'),revision:'a'.repeat(40),builtAt:'2026-10-15T00:00:00Z'});});
test.after(()=>fs.rmSync(suiteRoot,{recursive:true,force:true}));
const helper='/opt/buster-image-tools/scripts/buster-cluster-preflight.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(suiteRoot,'case-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const system=path.join(root,'system'),delivery=path.join(root,'delivery');fs.cpSync(image.systemRoot,system,{recursive:true});fs.cpSync(image.deliveryRoot,delivery,{recursive:true,verbatimSymlinks:true});
 // Translate only fixed installed roots to physical fixture roots. The real
 // verifier, projection validator and preflight body execute without mocks.
 const foundation=path.join(image.packageRoot,'skills/packages/plugin-foundation/config');
 let source=fs.readFileSync('scripts/buster-cluster-preflight.mjs','utf8').replace("import {verifyPipelineBootReceipt} from '/app/skills/packages/plugin-foundation/config/pipeline-boot.mjs';",`import {capturePipelineBootReceipts} from ${JSON.stringify(pathToFileURL(path.join(foundation,'pipeline-boot.mjs')).href)};\nconst verifyPipelineBootReceipt=(_mount,caller)=>capturePipelineBootReceipts(${JSON.stringify(delivery)},${JSON.stringify(system)},caller,${JSON.stringify(image.packageRoot)},'/app/skills');`);
 source=source.replaceAll('/app/skills/packages/plugin-foundation/config/',pathToFileURL(foundation).href+'/');
 source=source.replaceAll('/app/skills/packages/buster-engine/',pathToFileURL(path.join(image.packageRoot,'skills/packages/buster-engine')).href+'/');
 const translated=path.join(root,'preflight.mjs');fs.writeFileSync(translated,source);
 const bin=path.join(root,'bin');fs.mkdirSync(bin);const log=path.join(root,'commands');
 const quote=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
 fs.writeFileSync(path.join(bin,'node'),'#!/bin/sh\nprintf "%s\\n" "$*" >> '+quote(log)+'\nif [ "$1" = '+quote(helper)+' ]; then exec '+quote(process.execPath)+' '+quote(translated)+'; fi\nexit 91\n',{mode:0o700});
 return {root,system,delivery,translated,bin,log};
}
for(const scenario of ['missing','invalid','security-missing','security-invalid','group-empty','group-equal','version-empty','version-equal','secrets-empty','secrets-equal']){
 test(`actual entrypoint rejects ${scenario} before first runtime effect`,{timeout:15000},t=>{
  const f=fixture(t),environment={...process.env,PATH:`${f.bin}:${process.env.PATH}`};
  for(const key of ['SWARM_CONFIG','BUSTER_LEASE_API_GROUP','BUSTER_LEASE_API_VERSION','BUSTER_ALLOWED_SOURCE_SECRETS'])delete environment[key];
  const file=path.join(f.system,'components/buster-engine.config.json'),document=JSON.parse(fs.readFileSync(file)),settings=document.profiles.runtime.settings;
  if(scenario==='missing')delete settings.clusterInvokers;
  if(scenario==='invalid')settings.clusterInvokers.kubernetesFixture.pollIntervalMs=0;
  if(scenario==='security-missing')delete settings.clusterInvokers.runtimeSecurity;
  if(scenario==='security-invalid')settings.clusterInvokers.runtimeSecurity.maximumExecutionMs=0;
  if(scenario.startsWith('group'))environment.BUSTER_LEASE_API_GROUP=scenario.endsWith('empty')?'':'kubeclaw.forgestack.ai';
  if(scenario.startsWith('version'))environment.BUSTER_LEASE_API_VERSION=scenario.endsWith('empty')?'':'v1alpha1';
  if(scenario.startsWith('secrets'))environment.BUSTER_ALLOWED_SOURCE_SECRETS=scenario.endsWith('empty')?'':'kubeclaw-fixture-preflight,prism-test-provider,prism-test-runtime,prism-test-postgresql-auth,prism-test-ghcr';
  fs.chmodSync(file,0o644);fs.writeFileSync(file,JSON.stringify(document));fs.chmodSync(file,0o444);
  const result=spawnSync('/bin/sh',[path.resolve('docker/buster-runtime-entrypoint.sh')],{env:environment,encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,1,result.stderr);
  const legacy=scenario.startsWith('group')?'BUSTER_LEASE_API_GROUP':scenario.startsWith('version')?'BUSTER_LEASE_API_VERSION':'BUSTER_ALLOWED_SOURCE_SECRETS';
  assert.match(result.stderr,scenario==='missing'||scenario==='invalid'||scenario.startsWith('security-')?/SWARM_CONFIG|PIPELINE_/:new RegExp('SWARM_CONFIG_LEGACY_OVERRIDE:'+legacy));
  assert.deepEqual(fs.readFileSync(f.log,'utf8').trim().split('\n'),[helper]);
 });
}
test('relative executable uses the captured physical generation; component aliases reject',async t=>{
 const f=fixture(t),author=path.join(f.root,'author');fs.cpSync('config',author,{recursive:true});
 const file=path.join(author,'components/buster-engine.config.json'),doc=JSON.parse(fs.readFileSync(file));doc.profiles.runtime.settings.clusterInvokers.shared.kubectlExecutable='./bin/kubectl';fs.writeFileSync(file,JSON.stringify(doc));
 const [selection]=declaredPipelineServices(author,{role:'buster',namespace:'kubeclaw',releaseName:'agent-buster'}),entry=path.join(author,'pipeline.config.json');
 const alias=path.join(f.root,'current.json');fs.symlinkSync(entry,alias);assert.throws(()=>captureSwarmSettings(alias,selection),/SWARM_CONFIG_SYMLINK/);const capture=captureSwarmSettings(entry,selection);
 const generation=path.join(f.root,'relative-generation');
 await materializePipelineGeneration({authorRoot:author,packageRoot:image.packageRoot,output:generation,services:declaredPipelineServices(author,{role:'buster',namespace:'kubeclaw',releaseName:'agent-buster'}),publisher:path.join(suiteRoot,'image/publish')});
 const expected=path.join(f.root,'relative-delivery');fs.mkdirSync(expected);fs.cpSync(path.join(generation,'expected/buster-preparation'),path.join(expected,'version'),{recursive:true});fs.symlinkSync('version',path.join(expected,'..data'));
 const foundation=path.join(image.packageRoot,'skills/packages/plugin-foundation/config');
 const boot=await import(pathToFileURL(path.join(foundation,'pipeline-boot.mjs')).href),projection=await import(pathToFileURL(path.join(foundation,'pipeline-composition.ts')).href);
 const retained=boot.capturePipelineBootReceipts(expected,path.join(generation,'system'),'buster-preparation',image.packageRoot,'/app/skills');
 assert.equal(projection.projectBusterSettings(retained,'buster-preparation').clusterInvokers.shared.kubectlExecutable,path.join(generation,'system/bin/kubectl'));
 const moved=path.join(f.root,'elsewhere.json');fs.renameSync(file,moved);fs.symlinkSync(moved,file);assert.throws(()=>captureSwarmSettings(entry,selection),/ELOOP|SWARM_CONFIG/);
 assert.equal(projection.projectBusterSettings(retained,'buster-preparation').clusterInvokers.shared.kubectlExecutable,path.join(generation,'system/bin/kubectl'));
});
test('actual read-only preflight accepts an explicit complete generation',t=>{
 const f=fixture(t),environment={...process.env,BUSTER_V2_TOKEN:'fixture-token-00000000000000000000',BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY:sourcePublicKey};for(const key of ['SWARM_CONFIG','BUSTER_LEASE_API_GROUP','BUSTER_LEASE_API_VERSION','BUSTER_ALLOWED_SOURCE_SECRETS'])delete environment[key];
 const result=spawnSync(process.execPath,[f.translated],{env:environment,encoding:'utf8',timeout:10000});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert(!fs.existsSync(f.log));
});

for(const scenario of ['missing-key','malformed-key','wrong-key-type','wrong-state','wrong-runtime','old-state','old-runtime','blank-authority']){
 test(`actual entrypoint rejects ${scenario} source binding before lifetime/runtime writes`,t=>{
  const f=fixture(t),environment={...process.env,PATH:`${f.bin}:${process.env.PATH}`,BUSTER_V2_TOKEN:'fixture-token-00000000000000000000',BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY:sourcePublicKey};
  for(const key of ['SWARM_CONFIG','BUSTER_LEASE_API_GROUP','BUSTER_LEASE_API_VERSION','BUSTER_ALLOWED_SOURCE_SECRETS','BUSTER_V2_STATE_DIR','BUSTER_V2_RUN_DIR','BUSTER_PLAN_STATE_DIR','BUSTER_PLAN_RUN_DIR','BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY'])delete environment[key];
  if(scenario==='missing-key')delete environment.BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY;
  if(scenario==='malformed-key')environment.BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY='invalid';
  if(scenario==='wrong-key-type')environment.BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'}).toString();
  if(scenario==='wrong-state')environment.BUSTER_PLAN_STATE_DIR='/tmp/other';
  if(scenario==='wrong-runtime')environment.BUSTER_PLAN_RUN_DIR='/tmp/other';
  if(scenario==='old-state')environment.BUSTER_V2_STATE_DIR='/var/lib/buster-v2/plan-jobs';
  if(scenario==='old-runtime')environment.BUSTER_V2_RUN_DIR='/var/lib/buster-v2/runs';
  if(scenario==='blank-authority')environment.BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY=' ';
  const result=spawnSync('/bin/sh',[path.resolve('docker/buster-runtime-entrypoint.sh')],{env:environment,encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,/BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID|BUSTER_NATIVE_STATE_ROOT_INVALID|BUSTER_NATIVE_LEGACY_STATE_ROOT_REJECTED/);
  assert.deepEqual(fs.readFileSync(f.log,'utf8').trim().split('\n'),[helper]);
 });
}

test('actual runtime producer and parent source receiver preserve explicit A/B bindings without host authority',async t=>{
 const f=fixture(t),sourceModule=path.join(image.packageRoot,'skills/packages/buster-engine/test-gates/preparation-runtime-source.ts');
 const {readBusterPreparationRuntimeSource}=await import(pathToFileURL(sourceModule).href);
 const entrypoint=fs.readFileSync('docker/buster-runtime-entrypoint.sh','utf8');
 const match=entrypoint.match(/node <<'NODE'\n([\s\S]*?)\nNODE/u);assert(match,'original runtime producer exists');
 const producer=match[1].replace('/app/skills/packages/buster-engine/test-gates/preparation-runtime-source.ts',sourceModule)
  .replace('/app/skills/node_modules/playwright',createRequire(import.meta.url).resolve('playwright'));
 const registry=path.join(f.root,'registry.json');fs.writeFileSync(registry,JSON.stringify({registryReference:'registry.example'}));
 for(const authority of ['nova:source-A','nova:source-B']){
  const output=path.join(f.root,authority.slice(5));fs.mkdirSync(output);
  const key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
  const environment={...process.env,RUNTIME_CONFIG_ROOT:output,REGISTRY_REFERENCE:'registry.example',REGISTRY_CLIENT_RUNTIME:registry,
   BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY:authority,BUSTER_V2_TOKEN:'fixture-token-00000000000000000000',BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY:key};
  for(const name of ['BUSTER_V2_STATE_DIR','BUSTER_V2_RUN_DIR','BUSTER_PLAN_STATE_DIR','BUSTER_PLAN_RUN_DIR'])delete environment[name];
  // Exercise the real entrypoint's retained-token/unset boundary, not just a
  // Node producer launched with the original environment still intact.
  const tokenCapture=entrypoint.match(/^worker_token=.*$/mu)?.[0];
  const producerInvocation=entrypoint.match(/^  BUSTER_V2_TOKEN=.*node <<'NODE'$/mu)?.[0];
  assert(tokenCapture);assert(producerInvocation);
  const script=`set -eu\n${tokenCapture}\nunset BUSTER_V2_TOKEN\n${producerInvocation}\n${producer}\nNODE\n`;
  const result=spawnSync('/bin/sh',['-s'],{input:script,env:environment,encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  const runtime=JSON.parse(fs.readFileSync(path.join(output,'runtime.json'),'utf8'));
  const received=readBusterPreparationRuntimeSource(runtime,environment);
  const {tokenEnvironmentVariable,...publicRuntime}=runtime;
  const unreadableAuth=new Proxy({}, {get(){assert.fail('invalid authentication metadata must reject before source carrier read');}});
  for(const invalid of [publicRuntime,{...runtime,trustedPeerSpiffeIds:['spiffe://fixture/buster']},
   {...runtime,trustedPeerSpiffeIds:undefined}]){
   assert.throws(()=>readBusterPreparationRuntimeSource(invalid,unreadableAuth),/AUTHORITY_XOR_REQUIRED/);
  }
  for(const tokenEnvironmentVariable of [undefined,null,'bad-name',[],1]){
   assert.throws(()=>readBusterPreparationRuntimeSource({...runtime,tokenEnvironmentVariable},unreadableAuth),/TOKEN_ENV_INVALID/);
  }
  for(const trustedPeerSpiffeIds of [undefined,null,[],[''],[1],Array(33).fill('spiffe://fixture/buster')]){
   assert.throws(()=>readBusterPreparationRuntimeSource({...publicRuntime,trustedPeerSpiffeIds},unreadableAuth),/CONFIG_INVALID:trustedPeerSpiffeIds/);
  }
  const peerRuntime={...publicRuntime,trustedPeerSpiffeIds:['spiffe://fixture/buster']};
  assert.deepEqual(readBusterPreparationRuntimeSource(peerRuntime,environment),received);

  assert.deepEqual(received,{sourceAttestationPublicKey:key,trustedSourceAuthority:authority,stateRoot:'/var/lib/buster-v2/plan-jobs',tarExecutable:'/usr/bin/tar',serviceShutdownTimeoutMs:15000});
  assert.equal(runtime.runtimeRoot,'/var/lib/buster-v2/runs');assert(Object.isFrozen(received));
  assert.equal(runtime.tokenEnvironmentVariable,'BUSTER_V2_TOKEN');
  const peerOutput=path.join(output,'peer');fs.mkdirSync(peerOutput);
  const peerEnvironment={...environment,RUNTIME_CONFIG_ROOT:peerOutput,BUSTER_TRUSTED_PEER_SPIFFE_ID:'spiffe://fixture/buster'};
  const peerResult=spawnSync(process.execPath,['-'],{input:producer,env:peerEnvironment,encoding:'utf8',timeout:10000});
  assert.equal(peerResult.error,undefined);assert.equal(peerResult.status,0,peerResult.stderr);
  const producedPeer=JSON.parse(fs.readFileSync(path.join(peerOutput,'runtime.json'),'utf8'));
  assert.deepEqual(producedPeer.trustedPeerSpiffeIds,['spiffe://fixture/buster']);
  assert.equal(Object.hasOwn(producedPeer,'tokenEnvironmentVariable'),false);
  assert.deepEqual(readBusterPreparationRuntimeSource(producedPeer,peerEnvironment),received);

  for(const tarExecutable of [undefined,null,'tar','/bin/tar','/tmp/tar',{},['/usr/bin/tar']]){
   const unreadable=new Proxy({}, {get(){throw new Error('carrier read before tool rejection');}});
   assert.throws(()=>readBusterPreparationRuntimeSource({...runtime,tarExecutable},unreadable),/BUSTER_NATIVE_TAR_LOCATOR_INVALID/);
  }
  assert.deepEqual(readBusterPreparationRuntimeSource(runtime,environment),received,'restored original locator retains exact A/B binding');
  for(const schemaVersion of [undefined,null,'buster-remote-plan-runtime.v2','pipeline-component.v3',1]){
   const conflicting={...runtime,schemaVersion};
   Object.defineProperty(conflicting,'sourceAttestationPublicKeyEnvironmentVariable',{get(){throw new Error('source carrier must not be read');}});
   assert.throws(()=>readBusterPreparationRuntimeSource(conflicting,environment),/BUSTER_REMOTE_CONFIG_VERSION_INVALID/);
  }
  for(const author of ['runtimeService','remotePlanService']){
   for(const value of [undefined,{}, {shutdownTimeoutMs:runtime.shutdownTimeoutMs}]){
    assert.throws(()=>readBusterPreparationRuntimeSource({...runtime,[author]:value},environment),/BUSTER_SERVICE_POLICY_COMPETING_AUTHOR/);
   }
  }
  for(const shutdownTimeoutMs of [0,-1,1.5,2147483648,'15000',undefined]){
   assert.throws(()=>readBusterPreparationRuntimeSource({...runtime,shutdownTimeoutMs},environment),/BUSTER_SERVICE_SHUTDOWN_TIMEOUT_REQUIRED/);
  }
  for(const [field,value] of [['stateRoot','/tmp/state'],['runtimeRoot','/tmp/runs'],['sourceAttestationPublicKeyEnvironmentVariable','missing'],['trustedSourceAuthority',' ']]){
   assert.throws(()=>readBusterPreparationRuntimeSource({...runtime,[field]:value},environment),/BUSTER_NATIVE_STATE_ROOT_INVALID|BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID/);
  }
  for(const [field,value,error] of [
   ['stateRoot','/tmp/state',/BUSTER_NATIVE_STATE_ROOT_INVALID/],
   ['runtimeRoot','/tmp/runs',/BUSTER_NATIVE_STATE_ROOT_INVALID/],
   ...[0,-1,1.5,2147483648,'15000',undefined].map(value=>['shutdownTimeoutMs',value,/BUSTER_SERVICE_SHUTDOWN_TIMEOUT_REQUIRED/]),
  ]){
   let reads=0;
   const unreadable=new Proxy({}, {get(){reads++;throw new Error('source carrier read before complete metadata rejection');}});
   assert.throws(()=>readBusterPreparationRuntimeSource({...runtime,[field]:value},unreadable),error);
   assert.equal(reads,0,'unsupported storage/timer metadata must not resolve the source carrier');
  }
  // Parent and child must agree on the existing distinct source/token carrier
  // contract before either receives a key. Even a valid PEM in the token
  // carrier must not make the privileged parent accept what the child denies.
  for(const tokenEnvironmentVariable of [runtime.sourceAttestationPublicKeyEnvironmentVariable]){
   let reads=0;
   const unreadable=new Proxy(environment,{get(){reads++;throw new Error('aliased token carrier must not be read');}});
   assert.throws(()=>readBusterPreparationRuntimeSource({...runtime,tokenEnvironmentVariable},unreadable),/BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID/);
   assert.equal(reads,0,'parent rejects the same source/token alias as the production child');
  }
  const reads=[];
  const restoredCarrier=new Proxy(environment,{get(target,name){reads.push(name);return target[name];}});
  assert.deepEqual(readBusterPreparationRuntimeSource(runtime,restoredCarrier),received);
  assert.equal(reads.filter(name=>name===runtime.sourceAttestationPublicKeyEnvironmentVariable).length,1,'restored original A/B binding resolves its original public key once');
  assert.deepEqual(reads,[runtime.tokenEnvironmentVariable,runtime.sourceAttestationPublicKeyEnvironmentVariable],'token and public key each read once, in admission order');
  const invalidOutput=path.join(output,'invalid');fs.mkdirSync(invalidOutput);
  const invalid=spawnSync(process.execPath,['-'],{input:producer,env:{...environment,RUNTIME_CONFIG_ROOT:invalidOutput,BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY:'invalid'},encoding:'utf8',timeout:10000});
  assert.equal(invalid.status,1);assert.match(invalid.stderr,/BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID/);
  assert.deepEqual(fs.readdirSync(invalidOutput),[],'source validation precedes both platform and runtime writes');
 }
});

for (const token of [undefined, '', 'x'.repeat(31)]) {
 test(`actual entrypoint rejects invalid token length ${token?.length ?? 'missing'} before first effect`, t => {
  const f=fixture(t),environment={...process.env,PATH:`${f.bin}:${process.env.PATH}`,BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY:sourcePublicKey};
  for(const name of ['SWARM_CONFIG','BUSTER_TRUSTED_PEER_SPIFFE_ID','BUSTER_V2_TOKEN'])delete environment[name];
  if(token !== undefined)environment.BUSTER_V2_TOKEN=token;
  const result=spawnSync('/bin/sh',[path.resolve('docker/buster-runtime-entrypoint.sh')],{env:environment,encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,token ? /BUSTER_REMOTE_TOKEN_INVALID/ : /BUSTER_REMOTE_CONFIG_TOKEN_MISSING/);
  assert.deepEqual(fs.readFileSync(f.log,'utf8').trim().split('\n'),[helper]);
 });
}
