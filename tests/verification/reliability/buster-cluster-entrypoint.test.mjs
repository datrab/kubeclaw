import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
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
 const f=fixture(t),environment={...process.env};for(const key of ['SWARM_CONFIG','BUSTER_LEASE_API_GROUP','BUSTER_LEASE_API_VERSION','BUSTER_ALLOWED_SOURCE_SECRETS'])delete environment[key];
 const result=spawnSync(process.execPath,[f.translated],{env:environment,encoding:'utf8',timeout:10000});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert(!fs.existsSync(f.log));
});
