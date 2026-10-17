import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {loadSwarmSettings} from '../../../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import {prismNativeAttempt} from '../../../../../skills/prism/engine/worker-envelope.ts';
import {agentAttempt} from '../../../../../skills/prism/server/agent-attempt.ts';
import {preparationEnvelope,preparationProfile} from '../../../../../skills/buster/engine/test-gates/preparation-envelope.ts';
import {createRunnerEnvelope} from '../../../../../skills/buster/engine/test-gates/runner-attempt-envelope.ts';
import {prismAttemptResourceLimits} from '../../../../../skills/prism/config/resource-policy.ts';
import {interruptedNativeWorkerResult} from '../../../../../skills/worker/core/worker/native-result.ts';
import {unsupportedWorkerBudget} from '../../../../../skills/worker/core/worker/resource-accounting.ts';
import {checkWorkerNativeResultBinding,workerAttemptResultDigest,checkPipelineWorkerCoreContract,checkWorkerResourceContractV2,checkWorkerResourceContractV3,workerAttemptSpecDigest,workerProfileDigest} from '@kubeclaw/pipeline-worker-core-contract';
const ownerRoot='charts/kubeclaw/files/config/';
const selected=loadSwarmSettings({SWARM_CONFIG:process.cwd()+'/'+ownerRoot+'swarm.config.json'});
const prep=JSON.parse(fs.readFileSync(ownerRoot+'buster-engine.config.json')).settings.preparation;
const execution=JSON.parse(fs.readFileSync(ownerRoot+'buster-engine.config.json')).settings.execution;
const artifact={artifactId:'input:definition',type:'prism-engine-input',mediaType:'application/json',contentDigest:'sha256:'+'a'.repeat(64),sizeBytes:128,storageUrl:'http://prism-control:8080/v1/internal/artifacts/sha256:'+'a'.repeat(64)};
const now=new Date();
const prism=prismNativeAttempt('render',artifact,'definition',selected.prism.native.resourcePolicy);
const agent=await agentAttempt({id:'definition-job',fence:'definition-fence',expires_at:new Date(now.getTime()+960000),request_digest:'sha256:'+'a'.repeat(64),request:{purpose:'C0 definition-only'}},'definition-runner');
const preparation=preparationEnvelope('a'.repeat(32),preparationProfile('sha256:'+'b'.repeat(64)),prep,now,1003,{kind:'stage'});
const node={id:'node-definition',executionId:'execution-definition',timeoutMs:60000,limits:{cpuMillis:1000,memoryBytes:134217728,processes:8,logBytes:1048576,artifactBytes:1048576,artifactFiles:8},provider:{packageId:'definition-provider',packageVersion:'1.0.0',contentDigest:'sha256:'+'c'.repeat(64)}};
const buster=createRunnerEnvelope({options:{registry:{snapshotDigest:'sha256:'+'d'.repeat(64)},executionPolicy:execution,plan:{runId:'run-definition',planId:'plan-definition',scope:{moduleId:null,gateId:null}}},node,attemptId:'attempt-definition',attemptNumber:1,granted:[],cleanupTimeoutMs:execution.provider.cleanupTimeoutMs,providerResultLimit:1024,invocation:{schemaVersion:'definition-only'},operation:{},issuedAt:now});
const controls={prism,agent,preparation,buster};
const results=[];
const check=e=>e.schemaVersion.endsWith('v3')?checkWorkerResourceContractV3('workerAttemptEnvelope',e):e.schemaVersion.endsWith('v2')?checkWorkerResourceContractV2('workerAttemptEnvelope',e):checkPipelineWorkerCoreContract('workerAttemptEnvelope',e);
function record(id,fn){try{const observed=fn();results.push({id,result:'passed',observed});}catch(error){results.push({id,result:'failed',error:error.stack});}}
for(const [role,e] of Object.entries(controls)){
 record('CMP-C0-SCHEMA-'+role+'-POSITIVE',()=>{const checked=check(e);assert.equal(checked.ok,true,JSON.stringify(checked.errors));return {schemaVersion:e.schemaVersion,claim:e.claim,limits:e.limits,resourceBudgets:e.resourceBudgets,profileDigest:e.profile.profileDigest,attemptSpecDigest:e.attemptSpecDigest};});
 record('CMP-C0-SCHEMA-'+role+'-CLAIM',()=>{const changed=structuredClone(e);changed.claim.attemptId='wrong-attempt';changed.attemptSpecDigest=workerAttemptSpecDigest(changed);const checked=check(changed);assert.equal(checked.ok,false);assert(checked.errors.some(s=>s.includes('/claim/attemptId must match /attemptId')));return checked;});
 record('CMP-C0-SCHEMA-'+role+'-GRANT',()=>{const changed=structuredClone(e);changed.grantedCapabilities=['not.supported'];changed.attemptSpecDigest=workerAttemptSpecDigest(changed);const checked=check(changed);assert.equal(checked.ok,false);assert(checked.errors.some(s=>s.includes('/grantedCapabilities must be supported')));return checked;});
 record('CMP-C0-SCHEMA-'+role+'-DIGEST',()=>{const changed=structuredClone(e);changed.limits.timeoutMs+=1;const checked=check(changed);assert.equal(checked.ok,false);assert(checked.errors.some(s=>s.includes('/attemptSpecDigest does not match')));return checked;});
}
record('CMP-C0-SCHEMA-PRISM-NEW-BUDGET',()=>{const policy={cpuTimeMs:1,memoryBytes:1,tasks:1};assert.throws(()=>prismAttemptResourceLimits(prism,policy,false),/PRISM_NATIVE_BUDGET_NOT_ACCEPTED:cpuTimeMs/);return 'new attempt above selected policy rejected';});
record('CMP-C0-SCHEMA-PRISM-RECOVERED-BUDGET',()=>{const limits=prismAttemptResourceLimits(prism,{cpuTimeMs:1,memoryBytes:1,tasks:1},true);assert.equal(limits.cpuTimeMs,prism.resourceBudgets.cpuTimeMs.limit);return limits;});
record('CMP-C0-SCHEMA-AGENT-UNAVAILABLE',()=>{assert.equal(unsupportedWorkerBudget(agent),undefined);const changed=structuredClone(agent);changed.resourceBudgets.cpuTimeMs={state:'requested',limit:1};changed.attemptSpecDigest=workerAttemptSpecDigest(changed);assert.equal(check(changed).ok,true);assert.equal(unsupportedWorkerBudget(changed),'cpuTimeMs');return 'schema permits requested budget; actual executor prelaunch unavailable-measurement predicate rejects it, not fake zero';});
for(const [role,envelope] of [['prism',prism],['preparation',preparation]]){
 const result=interruptedNativeWorkerResult(envelope,new Date(envelope.claim.claimedAt),'C0_DEFINITION_NOT_LAUNCHED',null,true);
 record('CMP-C0-SCHEMA-'+role+'-RESULT',()=>{const checked=checkWorkerNativeResultBinding(envelope,result);assert.equal(checked.ok,true,JSON.stringify(checked.errors));assert.equal(result.cleanup.state,'not_required');assert.equal(result.resources.cpuTimeMs,undefined);return {checked,resourceAccounting:result.resourceAccounting};});
 record('CMP-C0-SCHEMA-'+role+'-RESULT-POLICY',()=>{const changed=structuredClone(result);changed.resourceAccounting.budgets.cpuTimeMs.limit+=1;changed.resultDigest=workerAttemptResultDigest(changed);const checked=checkWorkerNativeResultBinding(envelope,changed);assert.equal(checked.ok,false);assert(checked.errors.includes('native result policy does not match accepted attempt'));return checked;});
 record('CMP-C0-SCHEMA-'+role+'-RESULT-CLAIM',()=>{const changed=structuredClone(result);changed.claimGeneration+=1;changed.resultDigest=workerAttemptResultDigest(changed);const checked=checkWorkerNativeResultBinding(envelope,changed);assert.equal(checked.ok,false);assert(checked.errors.includes('native result identity does not match accepted attempt'));return checked;});
}
const sourceFiles=['skills/worker/core/worker/native-result.ts','skills/prism/engine/worker-envelope.ts','skills/prism/server/agent-attempt.ts','skills/buster/engine/test-gates/preparation-envelope.ts','skills/buster/engine/test-gates/runner-attempt-envelope.ts','skills/buster/engine/test-gates/runner-worker-profile.ts','skills/prism/config/resource-policy.ts','skills/worker/core/worker/resource-accounting.ts',...['validation.ts','resource-validation-v2.ts','resource-validation-v3.ts','digest.ts'].map(f=>'contracts/pipeline-worker-core/v1/src/'+f),...['v1','v2','v3'].map(v=>'contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.'+v+'.schema.json')];
const testFiles=['docs/review/evidence/config-acceptance/components/validate-schema-definitions.mjs'];
const files=[...sourceFiles,...testFiles,'package-lock.json','node_modules/ajv/package.json','node_modules/ajv-formats/package.json',...fs.readdirSync(ownerRoot).filter(n=>n.endsWith('.config.json')).map(n=>ownerRoot+n)];
const digests=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
console.log(JSON.stringify({command:'PRISM_ENGINE_CONTENT_DIGEST=<recorded synthetic definition identity> node docs/review/evidence/config-acceptance/components/validate-schema-definitions.mjs',scope:'C0 actual producer/contract/policy-predicate definition checks; synthetic task inputs only, NO dispatch/kernel/database/runtime EFFECT or CONFIG binding acceptance',identities:{head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),node:process.version,environment:{PRISM_ENGINE_CONTENT_DIGEST:process.env.PRISM_ENGINE_CONTENT_DIGEST,NODE_ENV:process.env.NODE_ENV},sourceDigests:Object.fromEntries(sourceFiles.map(f=>[f,digests[f]])),testDigests:Object.fromEntries(testFiles.map(f=>[f,digests[f]])),files:digests,config:selected.identity},results,passed:results.filter(r=>r.result==='passed').length,failed:results.filter(r=>r.result==='failed').length},null,2));
if(results.some(r=>r.result==='failed'))process.exitCode=1;
