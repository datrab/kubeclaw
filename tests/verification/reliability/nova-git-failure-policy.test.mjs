import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {captureCoreRuntimePolicy,loadCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {GitRunner} from '../../../skills/common/plugins/git-workspace/src/runner.ts';
const id='kubeclaw.git-workspace:git';
test('selected Git failure policy controls actual child stderr, captures A and restores positive',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'git-failure-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'core.json'),publish=n=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,gitWorkspaceFailure:{errorExcerptCharacters:n}}}}}));
 const select=()=>selectedAdapterConfigurations({[id]:{}},loadCoreRuntimePolicy({file,profile:'selected'}))[id];
 publish(8);const a=select();publish(16);const b=select();assert.equal(a.errorExcerptCharacters,8);assert.equal(b.errorExcerptCharacters,16);
 const options={executable:fs.realpathSync('/usr/bin/git'),authorName:'Test',authorEmail:'test@example.invalid',maxExecutionMs:3000,maxOutputBytes:65536,terminationGraceMs:25,errorExcerptCharacters:a.errorExcerptCharacters};
 const first=new GitRunner(options);options.errorExcerptCharacters=1;const second=new GitRunner({...options,errorExcerptCharacters:b.errorExcerptCharacters});t.after(async()=>{await first.shutdown();await second.shutdown();});
 const failure=async runner=>{try{await runner.run(root,['not-a-real-git-subcommand'],new AbortController().signal);assert.fail('must reject');}catch(error){assert.match(error.message,/^GIT_COMMAND_FAILED:1:null:/);return error.message.slice('GIT_COMMAND_FAILED:1:null:'.length);}};
 assert.equal((await failure(first)).length,8);assert.equal((await failure(second)).length,16);fs.unlinkSync(file);assert.equal((await failure(first)).length,8);
 assert.equal((await first.run(root,['--version'],new AbortController().signal)).exitCode,0);
 assert.throws(select,/ENOENT/);
});
test('Git policy missing/invalid/competing authors reject before child execution',()=>{
 assert.equal(selectedAdapterConfigurations({[id]:{}},TEST_CORE_POLICY)[id].errorExcerptCharacters,4096);
 for(const value of [undefined,null,0,-1,1.5,'8',16777217]){
  assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,gitWorkspaceFailure:{errorExcerptCharacters:value}}),/INVALID/);
  assert.throws(()=>new GitRunner({errorExcerptCharacters:value}),/GIT_CONFIG_INVALID/);
 }
 for(const value of [8,null])assert.throws(()=>selectedAdapterConfigurations({[id]:{errorExcerptCharacters:value}},TEST_CORE_POLICY),/GIT_WORKSPACE_FAILURE_POLICY_COMPETING_AUTHOR/);
 assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,gitWorkspaceFailure:undefined}),/INVALID/);
});


test('installed Git retained original run redispatch keeps A after current policy removal',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'git-retained-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {loadPlatformConfig}=await import('../../../skills/common/plugin-runtime/foundation/config/platform.ts');
 const {runPipelineV2,resumePipelineV2,recoverPipelineV2}=await import('../../../skills/nova/core/execution/engine.ts');
 const {runRoot}=await import('../../../skills/nova/core/execution/run-root.ts');
 const {readRunSnapshot,retainedCoreRuntimePolicy,retainedRuntimePolicies}=await import('../../../skills/nova/core/execution/engine-snapshots.ts');
 const plugins=path.join(root,'plugins'),plugin=path.join(plugins,'probe'),output=path.join(root,'observed.jsonl');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`import fs from 'node:fs';
 export async function execute(input,context){
  let message;try{await context.invoke('git.sync',{operation:'rebase',resource:{type:'git.repository',canonicalId:context.contract.config.repository},payload:{upstreamRef:'missing'}});}catch(error){message=error.message;}
  fs.appendFileSync(context.contract.config.output,JSON.stringify({run:context.contract.lease.attempt.runId,message})+'\\n');
  if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
  return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.git_wait',message:'Await redispatch'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:git-policy',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};
 }`);
 const config={type:'object',additionalProperties:false,required:['repository','output'],properties:{repository:{type:'string'},output:{type:'string'}}};
 for(const [name,schema]of Object.entries({config,input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}}))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(schema));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.git-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',adapters:[],observers:[],stages:[{id:'probe',type:'test.git-policy',module:'entry.mjs',export:'execute',requiredCapabilities:['git.sync'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const common=path.resolve('skills/common/plugins'),file=path.join(root,'core.json'),platformFile=path.join(root,'platform.json'),repository=path.join(root,'repository'),workspace=path.join(root,'workspaces');fs.mkdirSync(repository);fs.mkdirSync(workspace);
 const publish=n=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,gitWorkspaceFailure:{errorExcerptCharacters:n}}}}}));
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file,profile:'selected'},installationRoots:[plugins,common],trustedBuiltinRoots:[plugins,common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'git.sync':id},grants:{'test.git-policy:probe':{'git.sync':{allowedRoots:[repository]}}},adapters:{[id]:{allowedRepositoryRoots:[repository],workspaceRoot:workspace,gitExecutable:fs.realpathSync('/usr/bin/git'),authorName:'Test',authorEmail:'test@example.invalid',maxExecutionMs:3000,maxOutputBytes:65536,terminationGraceMs:25}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 fs.writeFileSync(platformFile,JSON.stringify(source));const platform=()=>loadPlatformConfig(platformFile);
 const definition={schemaVersion:'pipeline-definition.v2',id:'git-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.git-policy',dependsOn:[],config:{repository,output},input:{},execution:{maxAttempts:3,maxRemediationCycles:0,timeoutMs:10000}}]};
 publish(8);const first=await runPipelineV2(platform(),definition,'git:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const originalRoot=runRoot(source.storageRoot,'git:A'),snapshot=readRunSnapshot(originalRoot);assert.equal(retainedCoreRuntimePolicy(originalRoot).gitWorkspaceFailure.errorExcerptCharacters,8);
 const original=structuredClone(source.adapters[id]);
 const retained=retainedRuntimePolicies(originalRoot);assert.deepEqual(retained.gitBindings[id],original);assert(Object.isFrozen(retained.gitBindings[id].allowedRepositoryRoots));
 const otherRepository=path.join(root,'other-repository'),otherWorkspace=path.join(root,'other-workspace');fs.mkdirSync(otherRepository);fs.mkdirSync(otherWorkspace);
 source.adapters[id]={allowedRepositoryRoots:[otherRepository],workspaceRoot:otherWorkspace,gitExecutable:fs.realpathSync('/usr/bin/git'),authorName:'Current',authorEmail:'current@example.invalid',maxExecutionMs:2000,maxOutputBytes:32768,terminationGraceMs:50};
 fs.writeFileSync(platformFile,JSON.stringify(source));
 publish(16);assert.equal((await runPipelineV2(platform(),definition,'git:B')).status,'waiting');
 assert.deepEqual(readRunSnapshot(runRoot(source.storageRoot,'git:B')).registry.configuration.adapters[id].allowedRepositoryRoots,[otherRepository]);
 // Grant drift must still reject before any original child dispatch.
 source.grants['test.git-policy:probe']['git.sync'].allowedRoots=[otherRepository];fs.writeFileSync(platformFile,JSON.stringify(source));
 await assert.rejects(recoverPipelineV2(platform(),definition,'git:A'),/RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);
 source.grants['test.git-policy:probe']['git.sync'].allowedRoots=[repository];fs.writeFileSync(platformFile,JSON.stringify(source));fs.unlinkSync(file);
 await assert.rejects(recoverPipelineV2(platform(),definition,'git:A'),/RECOVERY_SIGNAL_REQUIRED/);
 const wait=first.stages.get('probe').wait;
 const resumed=await resumePipelineV2(platform(),definition,'git:A',{schemaVersion:'resume-signal.v2',signalId:'signal:git-A',idempotencyKey:'signal-key:git-A',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});
 assert.equal(resumed.status,'succeeded',JSON.stringify([...resumed.stages]));assert.deepEqual(readRunSnapshot(originalRoot),snapshot);
 const rows=fs.readFileSync(output,'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,3);
 for(const row of rows.filter(row=>row.run==='git:A')){assert.match(row.message,/^EFFECT_OUTCOME_UNRESOLVED:effect:json-utf16-v1:[a-f0-9]{64}:GIT_COMMAND_FAILED:128:null:/);assert.equal(row.message.split('GIT_COMMAND_FAILED:128:null:')[1].length,row.run==='git:A'?8:16);}
 assert.equal(rows.filter(row=>row.run==='git:A').length,2);
 assert.match(rows.find(row=>row.run==='git:B').message,/GIT_PATH_DENIED/);
 await assert.rejects(runPipelineV2(platform(),definition,'git:C'),/ENOENT/);assert(!fs.existsSync(runRoot(source.storageRoot,'git:C')));
});


test('complete Git retained binding is private/frozen and rejects absent, mixed and incomplete registrations', async()=>{
 const {captureGitRuntimeBindings:capture,restoreGitRuntimeBindings:restore}=await import('../../../skills/nova/core/execution/git-runtime-binding.ts');
 const raw={allowedRepositoryRoots:['/original/repository'],workspaceRoot:'/original/workspaces',gitExecutable:'/usr/bin/git',authorName:'Original',authorEmail:'original@example.invalid',maxExecutionMs:3000,maxOutputBytes:65536,terminationGraceMs:25};
 const effective=selectedAdapterConfigurations({[id]:raw},TEST_CORE_POLICY);
 const retained=capture(effective,TEST_CORE_POLICY);assert.deepEqual(retained[id],raw);
 effective[id].allowedRepositoryRoots[0]='/mutated';assert.equal(retained[id].allowedRepositoryRoots[0],'/original/repository');
 assert(Object.isFrozen(retained));assert(Object.isFrozen(retained[id]));assert(Object.isFrozen(retained[id].allowedRepositoryRoots));
 const valid=selectedAdapterConfigurations({[id]:raw},TEST_CORE_POLICY)[id];
 for(const key of Object.keys(valid)){const invalid=structuredClone(valid);delete invalid[key];assert.throws(()=>capture({[id]:invalid},TEST_CORE_POLICY),/RECOVERY_GIT_/);}
 for(const invalid of [{...valid,extra:true},{...valid,errorExcerptCharacters:1},{...valid,maxExecutionMs:0},{...valid,allowedRepositoryRoots:[]},{...valid,allowedRepositoryRoots:['/a','/a']}])assert.throws(()=>capture({[id]:invalid},TEST_CORE_POLICY),/RECOVERY_GIT_/);
 assert.throws(()=>restore({},retained),/REGISTRATION_MISMATCH/);assert.throws(()=>restore({[id]:raw},{}),/REGISTRATION_MISMATCH/);assert.throws(()=>restore({},{foreign:raw}),/CONFIGURATION_INVALID/);
 const restored=restore({[id]:{current:true}},retained);assert.deepEqual(restored[id],raw);restored[id].allowedRepositoryRoots.push('/new');assert.equal(retained[id].allowedRepositoryRoots.length,1);
 assert.deepEqual(restore({},capture({},TEST_CORE_POLICY)),{});
});
