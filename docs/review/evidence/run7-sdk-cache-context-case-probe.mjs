import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {canonicalJson, sha256Text} from '@kubeclaw/plugin-sdk';
import {parseEchoReviewOutput} from '../../../skills/nova/plugins/review/src/echo-review-parser.ts';
import {ECHO_REVIEW_SCHEMA_VERSION} from '../../../skills/nova/plugins/review/src/echo-review-contract.ts';
import {reusableReviewResult} from '../../../skills/nova/plugins/review/src/review-completion.ts';
import {assertEchoContextRequestRequirements} from '../../../skills/nova/plugins/review/src/echo-context-request-parser.ts';
import {parseReviewRuntimeAttestation, assertReviewRuntimeIdentity} from '../../../skills/nova/plugins/review/src/review-runtime-attestation.ts';
import {buildReviewGraph} from '../../../skills/nova/plugins/review/src/review-graph.ts';
import {buildScalableReviewPlan} from '../../../skills/nova/plugins/review/src/review-scale-slicing.ts';
import {parseReviewSnapshotInventory} from '../../../skills/nova/plugins/review/src/review-snapshot-inventory.ts';
import {buildScalableReviewJobs} from '../../../skills/nova/plugins/review/src/scalable-review-jobs.ts';
import {buildReviewCacheRecord, parseReviewCacheRecord} from '../../../skills/nova/plugins/review/src/review-content-cache.ts';
import {RepositoryAuditArtifactCache} from '../../../skills/nova/plugins/review/src/repository-audit-cache.ts';
import {activate as artifactStore} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {EffectCoordinator} from '../../../skills/nova/core/effects/coordinator.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {FileResourceLockManager} from '../../../skills/nova/core/effects/locks.ts';

const self=fileURLToPath(import.meta.url), d=c=>`sha256:${c.repeat(64)}`;
if(process.argv[2]==='--child'){
  const [root,mode]=process.argv.slice(3), snapshotFile=path.join(root,'probe.json');
  let original=fs.existsSync(snapshotFile)?JSON.parse(fs.readFileSync(snapshotFile,'utf8')):undefined;
  const documents=[{path:'a.ts',content:'export const a = 1;\n'}];
  const files=documents.map(x=>({path:x.path,objectId:'1'.repeat(40),mode:'100644',sizeBytes:Buffer.byteLength(x.content)}));
  const snapshot=parseReviewSnapshotInventory({head:'a'.repeat(40),files,inventoryDigest:sha256Text(canonicalJson(files))});
  const graph=buildReviewGraph(snapshot,[]),tokenCounts=new Map([['a.ts',10]]),budget={maxFiles:1,maxBytes:1000,maxTokens:1000};
  const plan=buildScalableReviewPlan(snapshot,graph,tokenCounts,budget);
  const job=buildScalableReviewJobs({plan,graph,documents,tokenCounts,budget}).find(x=>x.kind==='component');
  const evidence={kind:'reviewed-source',digest:job.source[0].digest};
  const unverified={assessment:'unverified',explanation:'The requested supporting file is needed.',evidence:[]};
  const output={schemaVersion:ECHO_REVIEW_SCHEMA_VERSION,summary:'Request supporting context.',inspectedEvidence:[evidence],
    requirementAssessments:{...Object.fromEntries(job.requirements.map(x=>[x.id,unverified])),I:unverified,i:unverified},
    proposedFindings:[],contextRequest:{paths:['support.ts'],requirementIds:[job.requirements[0].id],reason:'Inspect supporting source.'}};
  // The actual stage uses this original parser, not Foundation Ajv for model output.
  // The separately preserved extra schema-compilation diagnostic did not pass.
  const parsed=parseEchoReviewOutput(output);assert.equal(parsed.ok,true);
  assertEchoContextRequestRequirements(parsed.value.contextRequest,job.requirements.map(x=>x.id));
  const runtimeIdentity={targetId:'echo',runtime:'subagent',agentId:'codex',model:'declared/model',thinking:'high'};
  const runtime={schemaVersion:'runtime-agent-attestation.v1',...runtimeIdentity,identityDigest:sha256Text(canonicalJson(runtimeIdentity))};
  assertReviewRuntimeIdentity(parseReviewRuntimeAttestation(runtime),runtimeIdentity);
  const value={jobId:job.id,jobDigest:job.digest,parsed,runtime};
  assert.equal(reusableReviewResult(job,value,true),true,'Actual context-request cache admission accepts this parsed result');
  const identity={policyDigest:d('b'),reviewerProtocol:'review.v1',reviewerModel:runtime.model,
    reviewerRuntimeIdentityDigest:runtime.identityDigest,evidenceVersion:'repository-review-evidence.v2'};
  const attempt={runId:'run:cache-context',stageId:'review',attemptId:`attempt:${mode}`,attemptNumber:mode==='write'?1:2};
  const owner={pluginId:'kubeclaw.artifact-store',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',contentDigest:d('c')};
  const adapter=artifactStore({config:{artifactRoot:path.join(root,'artifacts')}});
  const coordinator=new EffectCoordinator(new FileEffectJournal(path.join(root,`${mode}-effects.jsonl`)),undefined,undefined,
    new FileResourceLockManager(path.join(root,`${mode}-locks`)));
  let sequence=0;
  const context={contract:{lease:{attempt},artifacts:original?.artifacts??[]},invoke:async(capability,request)=>{
    const receipt=await coordinator.invoke(adapter,owner,{...request,attempt,capability,idempotencyKey:`cache:${mode}:${++sequence}`},new AbortController().signal);
    assert.equal(receipt.status,'completed',JSON.stringify(receipt));return receipt.result;
  }};
  const cache=new RepositoryAuditArtifactCache(context);
  try{
    if(mode==='write'){
      const record=buildReviewCacheRecord(job,identity,value);
      await cache.write(record);const artifacts=cache.artifacts();assert.equal(artifacts.length,1);
      original={job,identity,artifacts,record};fs.writeFileSync(snapshotFile,JSON.stringify(original));
      console.log(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,
        parserAccepted:true,actualReusableCacheGate:true,artifactWritten:artifacts[0].digest,assessmentKeys:Object.keys(parsed.value.requirementAssessments)}));
    }else{
      let error;
      try{const record=await cache.read(original.record.cacheKey);parseReviewCacheRecord(record,original.job,original.identity);}
      catch(e){error=e.message;}
      console.log(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,error:error??null}));
    }
  }finally{await adapter.shutdown();}
}else{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-cache-context-case-'));
  try{
    for(const[mode,locale]of[['write','en_US.UTF-8'],['read','en_US.UTF-8'],['read','tr_TR.UTF-8']]){
      process.stdout.write(execFileSync(process.execPath,[self,'--child',root,mode],{encoding:'utf8',env:{...process.env,LANG:locale,LC_ALL:locale}}));
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
