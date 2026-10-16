import {ProviderProcessSession} from '../../../skills/buster/engine/test-gates/provider-process-session.ts';
import {prepareRunnerAttempt} from '../../../skills/buster/engine/test-gates/runner-attempt-preparation.ts';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildRegistry,discoverPackages,resolveTestPlan} from '../../../skills/nova/core/src/index.ts';
import {resolveTestProviderConfiguration,validateRetainedProviderConfiguration} from '../../../skills/common/plugin-runtime/foundation/registry/configuration.ts';
import {QUALITY_TASK_SCHEMA_DIGEST,QUALITY_OWNER_SCHEMA_DIGESTS,remotePlanDigest,validatePipelineTestGateContract} from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import {provider as coverage} from '../../../skills/buster/plugins/coverage-budget/src/provider.js';
import {provider as size} from '../../../skills/buster/plugins/size-budget/src/provider.js';
import {RegisteredTestProviderLoader} from '../../../skills/buster/engine/test-gates/provider-loader.ts';
const root=path.resolve(import.meta.dirname,'../../..');
const pluginRoot=path.join(root,'skills/buster/plugins');
const registry=buildRegistry(discoverPackages({installationRoots:[pluginRoot],trustPolicy:{trustedBuiltinRoots:[pluginRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'quality-v2-test'}}));
const definitions=path.join(root,'docs/review/evidence/config-acceptance/c0-completion-20261013/quality-budget-contracts-01');
const digest=`sha256:${'a'.repeat(64)}`;
function selection(name='coverage',profile='A'):any {
 const owner=JSON.parse(fs.readFileSync(path.join(definitions,`stand/config/plugins/kubeclaw.${name}-budget.config.json`),'utf8'));
 const policy=owner.profiles[profile],entry=registry.testProviderContracts.get(`kubeclaw.${name}-budget@1`)!;
 return {schemaVersion:'selected-registration-policy.v1',processing:structuredClone(policy.processing),declarations:structuredClone(policy.declarations),binding:{kind:'test-provider',packageId:entry.registration.package.packageId,registrationId:owner.registrationId,instanceId:owner.instanceId,profileId:profile,serviceInstanceId:'fixture.buster',rootDigest:digest,ownerDigest:remotePlanDigest(owner),profileDigest:remotePlanDigest(policy),packageVersion:entry.registration.package.packageVersion,packageContentDigest:entry.registration.package.contentDigest,ownerSchemaDigest:QUALITY_OWNER_SCHEMA_DIGESTS[entry.registration.contractId],taskSchemaDigest:QUALITY_TASK_SCHEMA_DIGEST,readerVersion:'source-transport-test/no-activation',c3RuntimeSchemaDigest:digest,c3ReferenceContractDigest:digest}};
}
function repin(policy:any){policy.binding.profileDigest=remotePlanDigest({processing:policy.processing,declarations:policy.declarations});return policy;}
function resolve(policy:any,name='coverage',values:any={}):any{return resolveTestProviderConfiguration(registry,`kubeclaw.${name}-budget@1`,values,policy);}
function ref(name='coverage'){const registration=registry.testProviderContracts.get(`kubeclaw.${name}-budget@1`)!.registration;return {...registration.package,registrationId:registration.registrationId,contractId:registration.contractId};}
const exampleRoot=path.join(root,'contracts/pipeline-test-gate/v1');
const suites=fs.readdirSync(path.join(exampleRoot,'suites')).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync(path.join(exampleRoot,'suites',x),'utf8')));
const limits={cpuMillis:900000,memoryBytes:4294967296,logBytes:16777216,artifactBytes:268435456,artifactFiles:256,processes:64};
function plan(policy:any,change?:(declaration:any)=>void,name='coverage',policies:ReadonlyMap<string,any>|null=new Map([[`kubeclaw.${name}-budget@1`,policy]])):any {
 const declaration=JSON.parse(fs.readFileSync(path.join(exampleRoot,'examples',name==='coverage'?'unit-suite-with-coverage.json':'size-budget-tar.json'),'utf8'));
 const node=name==='coverage'?declaration.suites.unit.add.coverage:declaration.suites['size-budget'].add['web-assets'];node.config={};node.mode='blocking';
 change?.(declaration);
 return resolveTestPlan({planId:'plan:quality',runId:'run:quality',project:'quality',scope:{moduleId:'module',gateId:null},createdAt:'2026-10-16T18:00:00Z',declaration,suiteTemplates:suites,registry,facts:{changedPaths:[],moduleType:null,pipelineStage:null},...(policies===null?{}:{selectedProviderPolicies:policies}),policy:{defaultTimeoutMs:30000,maximumTimeoutMs:900000,defaultLimits:limits,maximumLimits:limits,maximumRetryCount:3,maximumMatrixSize:16,maximumNodes:100,defaultConcurrencyLimit:4,maximumConcurrencyLimits:{unit:8,'size-budget':8}}});
}
const qualityNode=(p:any,name='coverage')=>p.nodes.find((n:any)=>n.provider.contractId===`kubeclaw.${name}-budget@1`);

test('v2 separates task values, deeply freezes original policy and retains v1 exactly',()=>{
 const policy=selection(),config=resolve(policy);validatePipelineTestGateContract('providerConfiguration',config);
 assert.deepEqual(config.values,{});assert.ok(Object.isFrozen(config.selectedPolicy.processing));
 policy.processing.minimumLinePercent=1;assert.equal(config.selectedPolicy.processing.minimumLinePercent,50);
 const old=resolveTestProviderConfiguration(registry,'kubeclaw.coverage-budget@1',{minimumLinePercent:80});assert.equal(old.schemaVersion,'provider-configuration.v1');assert.deepEqual(old.values,{minimumLinePercent:80});
});
for(const name of ['coverage','size'])test(`${name}: equal task-policy override and partial/unknown selected processing reject`,()=>{
 const policy=selection(name);const [key,value]=Object.entries(policy.processing)[0]!;
 assert.throws(()=>resolve(policy,name,{[key]:value}));
 const partial=structuredClone(policy);delete partial.processing[key];repin(partial);assert.throws(()=>resolve(partial,name));
 const unknown=structuredClone(policy);unknown.processing.shadow=1;repin(unknown);assert.throws(()=>resolve(unknown,name));
});
test('binding mismatches cannot pass even with a syntactically valid v2 envelope',()=>{
 for(const field of ['packageId','registrationId','packageVersion','packageContentDigest','taskSchemaDigest','ownerSchemaDigest','profileDigest']){
  const policy=selection();policy.binding[field]=field.endsWith('Digest')?`sha256:${'b'.repeat(64)}`:'wrong';assert.throws(()=>resolve(policy),field);
 }
});
test('duplicate rule IDs reject instead of acquiring a second budget author',()=>{
 const policy=selection('size');policy.processing.matchingFiles=[{id:'a',pattern:'*',maximumBytes:100,requireMatch:true},{id:'a',pattern:'**',maximumBytes:100,requireMatch:false}];repin(policy);assert.throws(()=>resolve(policy,'size'),/duplicate id/);
});
test('real resolver uses selected retry and evidence while retaining immutable manifest support',()=>{
 const policy=selection();policy.declarations.retrySafe=false;repin(policy);
 const resolved=plan(policy),node=qualityNode(resolved);assert.equal(node.retryCount,0);assert.deepEqual(node.evidence.onPass,['log']);assert.equal(node.configuration.schemaVersion,'provider-configuration.v2');
 assert.equal(registry.testProviderContracts.get('kubeclaw.coverage-budget@1')!.registration.retrySafe,true);
 assert.throws(()=>plan(policy,d=>{d.suites.unit.add.coverage.retries=1;}),/TEST_PLAN_RETRY_UNSAFE/);
 const restored=JSON.parse(JSON.stringify(resolved));validatePipelineTestGateContract('resolvedTestPlan',restored);assert.deepEqual(qualityNode(restored).configuration,node.configuration);
 const bad=structuredClone(restored);qualityNode(bad).configuration.selectedPolicy.binding.packageContentDigest=`sha256:${'c'.repeat(64)}`;assert.throws(()=>validatePipelineTestGateContract('resolvedTestPlan',bad),/original package mismatch/);
});
test('size mandatory evidence and no-limit blocking admission are enforced before execution',()=>{
 const policy=selection('size');policy.declarations.evidenceDefaults.onPass=[];repin(policy);assert.throws(()=>resolve(policy,'size'));
 const valid=selection('size');assert.throws(()=>plan(valid,d=>{d.suites['size-budget'].add['web-assets'].evidence={onFail:['log']};},'size'),/mandatory-size-evidence/);
 for(const key of ['maximumTotalBytes','maximumFileCount','maximumGrowthBytes','maximumGrowthPercent'])valid.processing[key]=null;
 valid.processing.matchingFiles=[];repin(valid);assert.throws(()=>plan(valid,undefined,'size'),/TEST_PLAN_SIZE_LIMIT_REQUIRED/);
});
test('retained original A never refills from B/current owner; changed registry fails',()=>{
 const a=resolve(selection()),b=resolve(selection('coverage','B'));assert.notDeepEqual(a.selectedPolicy.processing,b.selectedPolicy.processing);
 const retained=JSON.parse(JSON.stringify(a)),entry=registry.testProviderContracts.get(a.contractId)!;
 validateRetainedProviderConfiguration(entry,retained,ref(),retained.selectedPolicy.declarations.evidenceDefaults);assert.equal(retained.selectedPolicy.processing.minimumLinePercent,50);
 const changed={...entry,registration:{...entry.registration,package:{...entry.registration.package,contentDigest:`sha256:${'b'.repeat(64)}`}}};
 assert.throws(()=>validateRetainedProviderConfiguration(changed,retained,ref(),retained.selectedPolicy.declarations.evidenceDefaults),/original package mismatch/);
});
test('loader rejects original binding before snapshot or process effects',async()=>{
 // Invalid runtime policy is irrelevant: method rejects before it is ever consumed.
 const loader=Object.create(RegisteredTestProviderLoader.prototype),config=resolve(selection()),entry=registry.testProviderContracts.get(config.contractId)!;
 const altered=structuredClone(config);altered.selectedPolicy.binding.profileDigest=`sha256:${'b'.repeat(64)}`;
 await assert.rejects(loader.load(entry,{configuration:altered,provider:ref()},'/must-not-create',new AbortController().signal),/profileDigest mismatch/);
});
async function fixture(run:(directory:string)=>Promise<void>){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quality-v2-'));try{await run(directory);}finally{fs.rmSync(directory,{recursive:true,force:true});}}
function artifact(file:string,mediaType:string){const bytes=fs.readFileSync(file);return {artifactId:'build-output',type:'artifact',mediaType,contentDigest:`sha256:${createHash('sha256').update(bytes).digest('hex')}`,sizeBytes:bytes.length,storageUrl:pathToFileURL(file).href};}
test('real coverage A/B consume captured policy, not legacy task values or invented evidence',()=>fixture(async directory=>{
 const file=path.join(directory,'coverage.info');fs.writeFileSync(file,'SF:src/real.ts\nDA:1,1\nDA:2,1\nDA:3,0\nend_of_record\n');
 const input={testIdentity:'v2',inputs:[{name:'coverage-1',kind:'artifact',artifact:artifact(file,'text/lcov')}]};
 const a=await coverage().execute({...input,configuration:resolve(selection())});const b=await coverage().execute({...input,configuration:resolve(selection('coverage','B'))});assert.equal(a.outcome,'passed');assert.equal(b.outcome,'failed');assert.deepEqual(a.evidenceFiles,[]);assert.deepEqual(b.reports,[]);
 await assert.rejects(coverage().execute({...input,configuration:{...resolve(selection()),values:{minimumLinePercent:50}}}),/QUALITY_TASK_POLICY_OVERRIDE/);
}));
test('real size v2 omits inactive nulls, retains baseline on pass/fail and enforces A/B',()=>fixture(async directory=>{
 const file=path.join(directory,'build.bin');fs.writeFileSync(file,'abcd');
 for(const [label,maximum,outcome] of [['A',4,'passed'],['B',3,'failed']] as const){
  const policy=selection('size');Object.assign(policy.processing,{format:'file',maximumTotalBytes:maximum,maximumFileCount:null,maximumGrowthBytes:null,maximumGrowthPercent:null,matchingFiles:[],largestFiles:10});repin(policy);
  const evidence=`evidence-${label}`;fs.mkdirSync(path.join(directory,evidence));
  const result=await size().execute({testIdentity:'v2',attemptId:label,mode:'blocking',configuration:resolve(policy,'size'),inputs:[{name:'build-output',kind:'artifact',artifact:artifact(file,'application/octet-stream')}],workspace:{repository:'repository',scratch:'scratch',evidence},limits:{artifactFiles:4,artifactBytes:1048576}},{workspaceRoot:directory,signal:new AbortController().signal,log(){}});
  assert.equal(result.outcome,outcome);assert.ok(fs.existsSync(path.join(directory,evidence,'size-budget-baseline.json')));assert.equal(result.outputs.length,1);
 }
}));

test('actual child IPC preserves and freezes original v2 across initialize and execute',{timeout:5000},()=>fixture(async directory=>{
 const module=path.join(directory,'mutating-provider.mjs');fs.writeFileSync(module,`export function provider(invocation){let rejected=false;try{invocation.configuration.selectedPolicy.processing.minimumLinePercent=0;}catch{rejected=true;}return {async execute(value){return {factoryMutationRejected:rejected,minimum:value.configuration.selectedPolicy.processing.minimumLinePercent,deepFrozen:Object.isFrozen(value.configuration.selectedPolicy.binding)}}};}`);
 const childFile=path.join(root,'skills/buster/engine/test-gates/provider-child.mjs');
 const child=spawn(process.execPath,['--permission',`--allow-fs-read=${directory}`,`--allow-fs-read=${childFile}`,childFile],{stdio:['pipe','pipe','pipe']});
 const lines=readline.createInterface({input:child.stdout});const iterator=lines[Symbol.asyncIterator]();let stderr='';child.stderr.on('data',data=>stderr+=data);
 const exit=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(stderr)));});
 try{
  child.stdin.write(JSON.stringify({kind:'initialize',modulePath:module,exportName:'provider',invocation:{configuration:resolve(selection())},workspaceRoot:directory,observation:{resourceSampleIntervalMs:10}})+'\n');
  const init=JSON.parse((await iterator.next()).value!);assert.equal(init.kind,'initialized',JSON.stringify(init));
  child.stdin.write(JSON.stringify({kind:'execute'})+'\n');
  const result=JSON.parse((await iterator.next()).value!);assert.equal(result.kind,'result',JSON.stringify(result));assert.equal(result.value.factoryMutationRejected,true);assert.equal(result.value.minimum,50);assert.equal(result.value.deepFrozen,true);
  child.stdin.write(JSON.stringify({kind:'cleanup',schemaVersion:'provider-cleanup.v1',disposition:'incomplete'})+'\n');
  assert.equal(JSON.parse((await iterator.next()).value!).kind,'cleanup-result');await exit;
 }finally{lines.close();if(child.exitCode===null)child.kill('SIGKILL');await exit.catch(()=>undefined);}
}));

test('restored v2 size plan, invocation and direct runner boundary cannot drop mandatory error evidence',()=>{
 const accepted=JSON.parse(JSON.stringify(plan(selection('size'),undefined,'size'))),node=qualityNode(accepted,'size');node.evidence.onError=[];
 assert.throws(()=>validatePipelineTestGateContract('resolvedTestPlan',accepted),/mandatory-log-evidence|mandatory-size-evidence/);
 const entry=registry.testProviderContracts.get('kubeclaw.size-budget@1')!;
 assert.throws(()=>validateRetainedProviderConfiguration(entry,node.configuration,node.provider,node.evidence),/mandatory-size-evidence/);
 const example={schemaVersion:'provider-invocation.v1',planId:accepted.planId,runId:accepted.runId,moduleId:'module',gateId:null,suiteInstanceId:node.suiteInstanceId,nodeId:node.id,executionId:node.executionId,testIdentity:node.testIdentity,nodeKind:'test',attemptId:'attempt:restore',attemptNumber:1,provider:node.provider,configuration:node.configuration,evidence:node.evidence,inputs:[],grantedCapabilities:[],timeoutMs:1000,limits,workspace:{repository:'repository',scratch:'scratch',evidence:'evidence'}};
 assert.throws(()=>validatePipelineTestGateContract('providerInvocation',example),/mandatory-size-evidence/);
});
for(const name of ['coverage','size'])test(`${name} direct v2 incomplete processing rejects before artifact access`,async()=>{
 const captured=structuredClone(resolve(selection(name),name));captured.selectedPolicy.processing={};
 let touched=false;const invocation={configuration:captured,get inputs(){touched=true;throw new Error('INPUT_EFFECT');}};
 await assert.rejects((name==='coverage'?coverage():size()).execute(invocation,{}),/V2_PROCESSING_REQUIRED/);assert.equal(touched,false);
});

for(const name of ['coverage','size'])for(const outcome of ['onPass','onFail','onError'])test(`${name} ${outcome} log eligibility is mandatory in selection, overrides and restored plans`,()=>{
 const selected=selection(name);selected.declarations.evidenceDefaults[outcome]=name==='size'&&outcome!=='onError'?['size-budget-baseline']:[];repin(selected);assert.throws(()=>resolve(selected,name));
 const missing=name==='size'&&outcome!=='onError'?['size-budget-baseline']:[];
 assert.throws(()=>plan(selection(name),declaration=>{const node=name==='coverage'?declaration.suites.unit.add.coverage:declaration.suites['size-budget'].add['web-assets'];node.evidence={[outcome]:missing};},name),/mandatory-log-evidence/);
 const restored=JSON.parse(JSON.stringify(plan(selection(name),undefined,name)));qualityNode(restored,name).evidence[outcome]=missing;
 assert.throws(()=>validatePipelineTestGateContract('resolvedTestPlan',restored),/mandatory-log-evidence/);
});

test('restored advisory-only Size policy cannot become blocking before repository/attempt effects',()=>{
 const policy=selection('size');for(const key of ['maximumTotalBytes','maximumFileCount','maximumGrowthBytes','maximumGrowthPercent'])policy.processing[key]=null;policy.processing.matchingFiles=[];repin(policy);
 const advisory=plan(policy,d=>{d.suites['size-budget'].add['web-assets'].mode='advisory';},'size');validatePipelineTestGateContract('resolvedTestPlan',advisory);
 const restored=JSON.parse(JSON.stringify(advisory));const node=qualityNode(restored,'size');node.mode='blocking';
 assert.throws(()=>validatePipelineTestGateContract('resolvedTestPlan',restored),/blocking-size-limit-required/);
 assert.throws(()=>prepareRunnerAttempt({options:{registry},workspaceRoot:'/must-not-create',id:()=>{throw new Error('ATTEMPT_EFFECT');}} as any,node,1,new Map()),/blocking-size-limit-required/);
});

for(const name of ['coverage','size'])test(`${name}: explicit selected map cannot fall back to legacy task policy when original selection is missing`,()=>{
 const selected=selection(name);
 const legacy=(declaration:any)=>{const node=name==='coverage'?declaration.suites.unit.add.coverage:declaration.suites['size-budget'].add['web-assets'];node.config=name==='coverage'?{minimumLinePercent:50}:{maximumTotalBytes:100};};
 // Genuine old callers with NO selected-generation map keep their original v1 ABI.
 const original=plan(selected,legacy,name,null);assert.equal(qualityNode(original,name).configuration.schemaVersion,'provider-configuration.v1');
 const retained=JSON.parse(JSON.stringify(original));validatePipelineTestGateContract('resolvedTestPlan',retained);
 for(const map of [new Map(),new Map([[`kubeclaw.${name==='coverage'?'size':'coverage'}-budget@1`,selection(name==='coverage'?'size':'coverage')]])]){
  assert.throws(()=>plan(selected,legacy,name,map),/TEST_PLAN_SELECTED_POLICY_MISSING/);
  assert.throws(()=>plan(selected,d=>{const node=name==='coverage'?d.suites.unit.add.coverage:d.suites['size-budget'].add['web-assets'];node.mode='advisory';},name,map),/TEST_PLAN_SELECTED_POLICY_MISSING/);
 }
 assert.equal(qualityNode(plan(selected,undefined,name),name).configuration.schemaVersion,'provider-configuration.v2');
 assert.equal(qualityNode(retained,name).configuration.schemaVersion,'provider-configuration.v1');
});

// QB-R02 has no authenticated inputStore receiver on these production paths.
// Valid configuration/source metadata alone must not authorize mutable input IO.
for(const name of ['coverage','size'])test(`${name}: selected v2 cannot execute before original sealed inputStore admission`,async()=>{
 const node=qualityNode(plan(selection(name),undefined,name),name);
 const owner={options:{registry},workspaceRoot:'/must-not-create',id:()=>{throw new Error('ATTEMPT_EFFECT');}};
 assert.throws(()=>prepareRunnerAttempt(owner as any,node,1,new Map()),/^Error: BUDGET_SOURCE_RECEIPT_REQUIRED$/);
 const entry=registry.testProviderContracts.get(node.provider.contractId)!;
 const invocation={configuration:node.configuration,provider:node.provider,evidence:node.evidence,inputs:[]};
 // No initialized loader policy exists: denial must precede snapshot/child work.
 await assert.rejects(Object.create(RegisteredTestProviderLoader.prototype).load(entry,invocation,'/must-not-create',new AbortController().signal),/^Error: BUDGET_SOURCE_RECEIPT_REQUIRED$/);
 assert.throws(()=>new ProviderProcessSession(entry,invocation as any,'/must-not-create',undefined as any),/^Error: BUDGET_SOURCE_RECEIPT_REQUIRED$/);
 // JSON-shaped producer/source labels cannot manufacture store authentication.
 const fake={...invocation,budgetSourceSnapshot:{schemaVersion:'budget-source-snapshot.v1',producerRunId:'fake',storeVersion:'fake'}};
 await assert.rejects(Object.create(RegisteredTestProviderLoader.prototype).load(entry,fake,'/must-not-create',new AbortController().signal),/^Error: BUDGET_SOURCE_RECEIPT_REQUIRED$/);
});
for(const name of ['coverage','size'])test(`${name}: original v1 preparation still reaches its own unchanged attempt boundary`,()=>{
 const declaration=(d:any)=>{const n=name==='coverage'?d.suites.unit.add.coverage:d.suites['size-budget'].add['web-assets'];n.config=name==='coverage'?{minimumLinePercent:50}:{maximumTotalBytes:100};};
 const node=qualityNode(plan(selection(name),declaration,name,null),name);
 assert.equal(node.configuration.schemaVersion,'provider-configuration.v1');
 assert.throws(()=>prepareRunnerAttempt({options:{registry},workspaceRoot:'/must-not-create',id:()=>{throw new Error('LEGACY_ATTEMPT_BOUNDARY');}} as any,node,1,new Map()),/LEGACY_ATTEMPT_BOUNDARY/);
});
