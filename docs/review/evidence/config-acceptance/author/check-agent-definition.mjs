// C0 definition observation only: no worker, child CLI, server or gateway dispatch.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {agentAttempt} from '../../../../../skills/prism/server/agent-attempt.ts';
import {workerAttemptSpecDigest,workerProfileDigest} from '@kubeclaw/worker-core';
import {checkWorkerResourceContractV2,checkPipelineWorkerCoreContract} from '@kubeclaw/pipeline-worker-core-contract';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const standPatchPath='docs/review/evidence/config-acceptance/author/agent-definition-stand.patch';
const standPatch=execFileSync('git',['diff','--binary','HEAD'],{maxBuffer:100*1024*1024});
await writeFile(standPatchPath,standPatch);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const untrackedInputs=await Promise.all(untracked.map(async path=>({path,sha256:digest(await readFile(path))})));
const files = [
  'docs/review/evidence/config-acceptance/author/check-agent-definition.mjs',
  'skills/prism/server/agent-attempt.ts', 'skills/prism/server/agent-process.ts',
  'skills/prism/server/agent-job-runner.mjs','skills/prism/server/agent-prompt.mjs',
  'skills/prism/server/preference-prompt.mjs','skills/prism/control/agent-jobs.ts',
  'package-lock.json',
];
console.log(JSON.stringify({kind:'identity',node:process.version,
  head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),
  dirtyStand:{patchPath:standPatchPath,patchSha256:digest(standPatch),untrackedInputs},
  sources:await Promise.all(files.map(async path=>({path,sha256:digest(await readFile(path))}))) }));
const job={id:'11111111-1111-4111-8111-111111111111',
  fence:'22222222-2222-4222-8222-222222222222',
  expires_at:'2099-01-01T00:00:00.000Z',request_digest:'sha256:'+digest(Buffer.from('{}')),request:{}};
const envelope=await agentAttempt(job,'c0-definition-reader');
const observations=[];
function observe(id, fn) {fn();observations.push({id,result:'passed'});}
observe('real-producer-v2-schema',()=>assert.equal(checkWorkerResourceContractV2('workerAttemptEnvelope',envelope).ok,true));
observe('not-native-v1',()=>assert.equal(checkPipelineWorkerCoreContract('workerAttemptEnvelope',envelope).ok,false));
observe('exact-six-local-limits',()=>assert.deepEqual(envelope.limits,{timeoutMs:900000,cleanupTimeoutMs:10000,logBytes:1048576,resultBytes:1048576,evidenceBytes:2097152,evidenceFiles:2}));
observe('claim-preserved-not-new-deadline',()=>assert.equal(envelope.claim.expiresAt,job.expires_at));
observe('queue-deadline-same-claim',()=>assert.equal(envelope.queueDeadline,job.expires_at));
observe('actual-profile-and-attempt-digests',()=>{assert.equal(envelope.profile.profileDigest,workerProfileDigest(envelope.profile));assert.equal(envelope.attemptSpecDigest,workerAttemptSpecDigest(envelope));});
for(const metric of ['cpuTimeMs','maximumMemoryBytes','maximumProcesses']) {
  observe('unavailable-not-fabricated-'+metric,()=>assert.equal(envelope.profile.resourceCapabilities[metric].measurement,'unavailable'));
  observe('unrequested-not-zero-budget-'+metric,()=>assert.equal(envelope.resourceBudgets[metric].state,'unrequested'));
}
const missing=structuredClone(envelope);delete missing.resourceBudgets.maximumProcesses;
observe('missing-explicit-budget-rejected',()=>assert.equal(checkWorkerResourceContractV2('workerAttemptEnvelope',missing).ok,false));
const wrongUnit=structuredClone(envelope);wrongUnit.profile.resourceCapabilities.maximumProcesses.unit='threads';
observe('wrong-process-unit-rejected',()=>assert.equal(checkWorkerResourceContractV2('workerAttemptEnvelope',wrongUnit).ok,false));
console.log(JSON.stringify({kind:'actual-definition',envelope,observations,
  limits:'C0 source/definition only; no configured alternative, process execution, effect, remote accounting or acceptance proved'}));
