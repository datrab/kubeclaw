import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipelineV2, recoverPipelineV2, resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { recoverStageStates } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-orchestrator-window-'));
try {
 const fixtureRoot=path.resolve('tests/fixtures/plugin-system-v2');
 const platform={schemaVersion:'pipeline-platform.v2',installationRoots:[fixtureRoot],trustedBuiltinRoots:[fixtureRoot],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{},grants:{},adapters:{},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:5000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const definition={schemaVersion:'pipeline-definition.v2',id:'test:window',maxConcurrency:1,stages:[{id:'review',type:'test.resume',dependsOn:[],config:{},input:{},execution:{maxAttempts:3,maxRemediationCycles:0,timeoutMs:5000}}]};
 const runId='run:window';assert.equal((await runPipelineV2(platform,definition,runId)).status,'waiting');
 const file=path.join(runRoot(platform.storageRoot,runId),'events.jsonl');
 const lines=fs.readFileSync(file,'utf8').trim().split('\n');
 const index=lines.findIndex(line=>JSON.parse(line).entry.type==='attempt.completed');assert.ok(index>=0);
 // Valid original committed prefix: model death before the next journal append.
 fs.writeFileSync(file,lines.slice(0,index+1).join('\n')+'\n');
 const states=recoverStageStates(definition,new FileJournal(file).records(),runId,'nova');
 const wait=states.get('review').wait;assert.ok(wait);
 await assert.rejects(()=>recoverPipelineV2(platform,definition,runId),/RECOVERY_SIGNAL_REQUIRED/);
 await assert.rejects(()=>resumePipelineV2(platform,definition,runId,{schemaVersion:'resume-signal.v2',signalId:'signal:window',idempotencyKey:'signal-key:window',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}}),/WAIT_CREATION_RECORD_MISSING/);
 console.log('Original journal prefix: recovery requires reconstructed orchestrator signal; resume rejects it because no top-level wait creation exists');
} finally {fs.rmSync(root,{recursive:true,force:true});}
