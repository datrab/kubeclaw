import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import { captureCoreRuntimePolicy, loadCoreRuntimePolicy } from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import { selectedAdapterConfigurations } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { activate } from '../../../skills/common/plugins/command-runner/src/adapter.ts';
import { CommandRunner } from '../../../skills/common/plugins/command-runner/src/runner.ts';
const id = 'kubeclaw.command-runner:command';
const executable = fs.realpathSync(process.execPath);
const base = { allowedExecutables: [executable], allowedWorkingRoots: [os.tmpdir()], maxOutputBytes: 4096, maxExecutionMs: 5000, terminationGraceMs: 25 };
function invoke(adapter) {
 return adapter.invoke({confidential:true,signal:new AbortController().signal,request:{capability:'command.execute',operation:'run',resource:{type:'command.executable',canonicalId:executable},payload:{workingDirectory:os.tmpdir(),args:['-e',`process.stdout.write('a');setTimeout(()=>process.stderr.write('b'),100);setTimeout(()=>process.stdout.write('c'),200);`]}}});
}
test('selected command monitoring A/B controls actual output records and survives current author removal', async t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'command-monitor-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'core.json');
 const publish=(maximumOutputRecords,sampleIntervalMs)=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,commandRunnerMonitoring:{maximumOutputRecords,sampleIntervalMs}}}}}));
 const select=()=>selectedAdapterConfigurations({[id]:base},loadCoreRuntimePolicy({file,profile:'selected'}))[id];
 publish(1,7);const a=activate({config:select()});publish(4,13);const b=activate({config:select()});
 t.after(async()=>{await a.shutdown();await b.shutdown();});
 const intervals=[];const original=setInterval;
 const timer=t.mock.method(globalThis,'setInterval',(fn,ms,...args)=>{intervals.push(ms);return original(fn,ms,...args);});
 await assert.rejects(invoke(a),/COMMAND_OUTPUT_RECORD_LIMIT_EXCEEDED/);
 const positive=await invoke(b);assert.equal(positive.stdout,'ac');assert.equal(positive.stderr,'b');assert.equal(positive.records.length,3);
 fs.unlinkSync(file);await assert.rejects(invoke(a),/COMMAND_OUTPUT_RECORD_LIMIT_EXCEEDED/);
 assert.deepEqual(intervals,[7,13,7]);timer.mock.restore();assert.throws(select,/ENOENT/);
});
test('missing invalid and competing monitoring authors reject; raw callers retain their legacy contract',async()=>{
 const selected=selectedAdapterConfigurations({[id]:base},TEST_CORE_POLICY)[id];assert.equal(selected.maximumOutputRecords,4096);assert.equal(selected.sampleIntervalMs,25);
 for(const field of ['maximumOutputRecords','sampleIntervalMs']){
  for(const value of [undefined,null,0,-1,1.5,'4']){
   assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,commandRunnerMonitoring:{...TEST_CORE_POLICY.commandRunnerMonitoring,[field]:value}}),/INVALID/);
   assert.throws(()=>activate({config:{...selected,[field]:value}}),/positive integer/);
  }
  assert.throws(()=>selectedAdapterConfigurations({[id]:{...base,[field]:25}},TEST_CORE_POLICY),/COMMAND_MONITORING_POLICY_COMPETING_AUTHOR/);
 }
 assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,commandRunnerMonitoring:undefined}),/INVALID/);
 assert.throws(()=>new CommandRunner({...base,monitoring:{maximumOutputRecords:1,sampleIntervalMs:2147483648}}),/COMMAND_MONITORING_INVALID/);
 const raw=new CommandRunner(base);try{const result=await raw.run(executable,['-e','process.stdout.write("legacy")'],os.tmpdir(),new AbortController().signal);assert.equal(result.stdout,'legacy');}finally{await raw.shutdown();}
});

test('installed command monitoring redispatch keeps A after current policy removal',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'command-retained-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {loadPlatformConfig}=await import('../../../skills/common/plugin-runtime/foundation/config/platform.ts');
 const {runPipelineV2,resumePipelineV2,recoverPipelineV2}=await import('../../../skills/nova/core/execution/engine.ts');
 const {runRoot}=await import('../../../skills/nova/core/execution/run-root.ts');
 const {readRunSnapshot,retainedCoreRuntimePolicy}=await import('../../../skills/nova/core/execution/engine-snapshots.ts');
 const plugins=path.join(root,'plugins'),plugin=path.join(plugins,'probe'),output=path.join(root,'observed.jsonl');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`import fs from 'node:fs';
 export async function execute(input,context){
  let message;try{await context.invoke('command.execute',{operation:'run',resource:{type:'command.executable',canonicalId:context.contract.config.repository},payload:{workingDirectory:context.contract.config.cwd,args:['-e',"process.stdout.write('a');setTimeout(()=>process.stderr.write('b'),100);setTimeout(()=>process.stdout.write('c'),200);"]}});message='passed';}catch(error){message=error.message;}
  fs.appendFileSync(context.contract.config.output,JSON.stringify({run:context.contract.lease.attempt.runId,message})+'\\n');
  if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
  return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.command_wait',message:'Await redispatch'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:command-policy',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};
 }`);
 const config={type:'object',additionalProperties:false,required:['repository','output','cwd'],properties:{repository:{type:'string'},output:{type:'string'},cwd:{type:'string'}}};
 for(const [name,schema]of Object.entries({config,input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}}))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(schema));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.command-monitor-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',adapters:[],observers:[],stages:[{id:'probe',type:'test.command-monitor-policy',module:'entry.mjs',export:'execute',requiredCapabilities:['command.execute'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const common=path.resolve('skills/common/plugins'),file=path.join(root,'core.json'),platformFile=path.join(root,'platform.json'),repository=path.join(root,'repository'),workspace=path.join(root,'workspaces');fs.mkdirSync(repository);fs.mkdirSync(workspace);
 const publish=n=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,commandCatalog:{maximumEntries:n===1?1:2},commandProcessCleanup:{cleanupPollIntervalMs:n===1?3:7,exitAcknowledgementMs:n===1?1300:1700,sandboxMinimumGraceMs:n===1?250:350},commandRunnerMonitoring:{maximumOutputRecords:n,sampleIntervalMs:7}}}}}));
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file,profile:'selected'},installationRoots:[plugins,common],trustedBuiltinRoots:[plugins,common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'command.execute':id},grants:{'test.command-monitor-policy:probe':{'command.execute':{allowedExecutables:[executable],allowedWorkingRoots:[root]}}},adapters:{[id]:{executableCatalog:{node:executable},allowedExecutables:[executable],allowedWorkingRoots:[root],maxExecutionMs:3000,maxOutputBytes:65536,terminationGraceMs:25}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 fs.writeFileSync(platformFile,JSON.stringify(source));const platform=()=>loadPlatformConfig(platformFile);
 const definition={schemaVersion:'pipeline-definition.v2',id:'git-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.command-monitor-policy',dependsOn:[],config:{repository:executable,output,cwd:root},input:{},execution:{maxAttempts:3,maxRemediationCycles:0,timeoutMs:10000}}]};
 publish(1);const first=await runPipelineV2(platform(),definition,'git:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const originalRoot=runRoot(source.storageRoot,'git:A'),snapshot=readRunSnapshot(originalRoot);assert.equal(retainedCoreRuntimePolicy(originalRoot).commandCatalog.maximumEntries,1);assert.equal(snapshot.registry.configuration.adapters[id].maximumCatalogEntries,1);assert.equal(retainedCoreRuntimePolicy(originalRoot).commandRunnerMonitoring.maximumOutputRecords,1);assert.deepEqual(retainedCoreRuntimePolicy(originalRoot).commandProcessCleanup,{cleanupPollIntervalMs:3,exitAcknowledgementMs:1300,sandboxMinimumGraceMs:250});
 publish(4);assert.equal((await runPipelineV2(platform(),definition,'git:B')).status,'waiting');fs.unlinkSync(file);
 await assert.rejects(recoverPipelineV2(platform(),definition,'git:A'),/RECOVERY_SIGNAL_REQUIRED/);
 const wait=first.stages.get('probe').wait;
 const resumed=await resumePipelineV2(platform(),definition,'git:A',{schemaVersion:'resume-signal.v2',signalId:'signal:git-A',idempotencyKey:'signal-key:git-A',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});
 assert.equal(resumed.status,'succeeded',JSON.stringify([...resumed.stages]));assert.deepEqual(readRunSnapshot(originalRoot),snapshot);
 const rows=fs.readFileSync(output,'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,3);
 for(const row of rows){if(row.run==='git:A')assert.match(row.message,/COMMAND_OUTPUT_RECORD_LIMIT_EXCEEDED/);else assert.equal(row.message,'passed');}
 assert.equal(rows.filter(row=>row.run==='git:A').length,2);
 await assert.rejects(runPipelineV2(platform(),definition,'git:C'),/ENOENT/);assert(!fs.existsSync(runRoot(source.storageRoot,'git:C')));
});
