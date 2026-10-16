import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadCoreRuntimePolicy,captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {loadPlatformConfig} from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {runPipelineV2,resumePipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {selectedStageConfiguration} from '../../../skills/nova/core/execution/stage-configuration.ts';
import {getReviewPolicyProfile,REVIEW_POLICY_PROFILES} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import {resolveReviewPolicy,isVerifiedReviewPolicy} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
const owner=JSON.parse(fs.readFileSync('config/plugins/kubeclaw.review/profiles/standard.config.json','utf8'));
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-owned-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'owners'));const author=path.join(root,'owners','review.json'),core=path.join(root,'core.json');
 const publish=n=>{const value=structuredClone(owner);value.profiles.standard.settings.profiles.gate.limits.maxInstancesPerCluster=n;fs.writeFileSync(author,JSON.stringify(value));};publish(1);
 const policy={...TEST_CORE_POLICY,reviewPolicySelection:{schemaVersion:'review-policy-selection.v1',file:'owners/review.json',profile:'standard'}};
 fs.writeFileSync(core,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{standard:{settings:policy}}}));
 return {root,author,core,policy,publish,load:()=>loadCoreRuntimePolicy({file:core,profile:'standard'})};
}
test('sole selected review owner resolves relative to canonical Core author, captures A/B and rejects malformed siblings/duplicate and partial authors',t=>{
 const f=fixture(t),a=f.load();f.publish(2);const b=f.load();fs.unlinkSync(f.author);
 assert.equal(a.reviewPolicyCapture.settings.profiles.gate.limits.maxInstancesPerCluster,1);
 assert.equal(b.reviewPolicyCapture.settings.profiles.gate.limits.maxInstancesPerCluster,2);
 assert.equal(getReviewPolicyProfile('gate',captureCoreRuntimePolicy(JSON.parse(JSON.stringify(a))).reviewPolicyCapture.settings).limits.maxInstancesPerCluster,1);
 assert(Object.isFrozen(a.reviewPolicyCapture.settings.profiles.gate.limits));
 for(const kind of ['kubeclaw.decision.review','kubeclaw.audit.repository-review','kubeclaw.audit.repository-review-revalidation']){
  const selected=selectedStageConfiguration(kind,{agent:'echo'},undefined,undefined,a.reviewPolicyCapture);
  assert.equal(selected.ownedPolicyProfiles.profiles.gate.limits.maxInstancesPerCluster,1);
  for(const bad of [{agent:'echo',policy:REVIEW_POLICY_PROFILES.gate},{agent:'echo',ownedPolicyProfiles:a.reviewPolicyCapture.settings}])assert.throws(()=>selectedStageConfiguration(kind,bad,undefined,undefined,a.reviewPolicyCapture),/COMPETING_AUTHOR/);
 }
 assert.equal(Object.hasOwn(selectedStageConfiguration('kubeclaw.decision.review',{agent:'echo'}),'ownedPolicyProfiles'),false);
 const selected=resolveReviewPolicy({selectedFile:getReviewPolicyProfile('gate',a.reviewPolicyCapture.settings)});
 assert.equal(selected.selectedSource,'settings_file');assert.equal(selected.sources.length,1);assert(isVerifiedReviewPolicy(selected));
 assert.throws(()=>resolveReviewPolicy({selectedFile:REVIEW_POLICY_PROFILES.gate,builtIn:REVIEW_POLICY_PROFILES.gate}),/COMPETING_AUTHOR/);
 for(const key of ['reviewPolicySelection','reviewPolicyCapture']){const partial=structuredClone(a);delete partial[key];assert.throws(()=>captureCoreRuntimePolicy(partial),/CORE_RUNTIME_POLICY_INVALID/);}
 const mismatch=structuredClone(a);mismatch.reviewPolicyCapture.source.profile='other';assert.throws(()=>captureCoreRuntimePolicy(mismatch),/SELECTION_MISMATCH/);
 f.publish(1);const malformed=JSON.parse(fs.readFileSync(f.author,'utf8'));malformed.profiles.other={settings:{}};fs.writeFileSync(f.author,JSON.stringify(malformed));assert.throws(f.load,/PROFILE_INVALID/);
 fs.writeFileSync(f.core,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{standard:{settings:a}}}));assert.throws(f.load,/CAPTURE_COMPETING_AUTHOR/);
});
test('actual Core executor receives selected profiles and original snapshot A resumes with both current authors deleted',async t=>{
 const f=fixture(t),plugin=path.join(f.root,'plugins','probe'),output=path.join(f.root,'observed.jsonl');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`import fs from 'node:fs';export function execute(input,context){fs.appendFileSync(context.contract.config.output,JSON.stringify({run:context.contract.lease.attempt.runId,limit:context.contract.config.ownedPolicyProfiles.profiles.gate.limits.maxInstancesPerCluster})+'\\n');if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.wait',message:'Wait'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:review',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};}`);
 for(const [name,schema] of Object.entries({config:{type:'object',additionalProperties:false,required:['output','ownedPolicyProfiles'],properties:{output:{type:'string'},ownedPolicyProfiles:{type:'object'}}},input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}}))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(schema));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.review-owned',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',adapters:[],observers:[],stages:[{id:'probe',type:'kubeclaw.decision.review',module:'entry.mjs',export:'execute',requiredCapabilities:[],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const platformFile=path.join(f.root,'platform.json');fs.writeFileSync(platformFile,JSON.stringify({schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:'core.json',profile:'standard'},installationRoots:['plugins'],trustedBuiltinRoots:['plugins'],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{},grants:{},adapters:{},activeAdapters:[],observers:{},storageRoot:'state',shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]}));
 const platform=loadPlatformConfig(platformFile),definition={schemaVersion:'pipeline-definition.v2',id:'owned-policy',maxConcurrency:1,stages:[{id:'review',type:'kubeclaw.decision.review',dependsOn:[],config:{output},input:{},execution:{maxAttempts:3,maxRemediationCycles:0,timeoutMs:1000}}]};
 const a=await runPipelineV2(platform,definition,'run:A');assert.equal(a.status,'waiting');const stored=readRunSnapshot(runRoot(platform.storageRoot,'run:A'));assert.equal(stored.registry.configuration.corePolicy.reviewPolicyCapture.settings.profiles.gate.limits.maxInstancesPerCluster,1);
 f.publish(2);assert.equal((await runPipelineV2(platform,definition,'run:B')).status,'waiting');fs.unlinkSync(f.core);fs.unlinkSync(f.author);
 const wait=a.stages.get('review').wait;assert.equal((await resumePipelineV2(platform,definition,'run:A',{schemaVersion:'resume-signal.v2',signalId:'signal:review',idempotencyKey:'key:review',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}})).status,'succeeded');
 const observations=fs.readFileSync(output,'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(observations.filter(x=>x.run==='run:A').map(x=>x.limit),[1,1]);assert.deepEqual(observations.filter(x=>x.run==='run:B').map(x=>x.limit),[2]);
 assert.deepEqual(readRunSnapshot(runRoot(platform.storageRoot,'run:A')),stored);
});
test('central standard profiles preserve every original policy value and legacy resolver behavior',()=>{
 const profiles=owner.profiles.standard.settings;
 for(const name of ['gate','lean','audit'])assert.deepEqual(getReviewPolicyProfile(name,profiles),getReviewPolicyProfile(name));
});
test('normal image author layout resolves the same review-owned values without repository paths',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-image-layout-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const etc=path.join(root,'etc','kubeclaw');fs.mkdirSync(path.join(etc,'nova'),{recursive:true});fs.mkdirSync(path.join(etc,'plugins'),{recursive:true});
 fs.copyFileSync('config/nova/core.config.json',path.join(etc,'nova','core.config.json'));fs.cpSync('config/plugins/kubeclaw.review',path.join(etc,'plugins','kubeclaw.review'),{recursive:true});
 const received=loadCoreRuntimePolicy({file:path.join(etc,'nova','core.config.json'),profile:'standard'});
 assert.deepEqual(received.reviewPolicyCapture.settings,owner.profiles.standard.settings);
 for(const file of ['docker/Dockerfile.nova','docker/Dockerfile.buster-runtime'])assert.match(fs.readFileSync(file,'utf8'),/COPY config\/plugins\/kubeclaw.review \/etc\/kubeclaw\/plugins\/kubeclaw.review/);
});
