import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runPipelineV2,recoverPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-result-artifact-'));
try {
 const roots=[path.resolve('skills/common/plugins'),path.resolve('skills/nova/plugins')];
 const platform={schemaVersion:'pipeline-platform.v2',installationRoots:roots,trustedBuiltinRoots:roots,externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'git.repository.read':'kubeclaw.repository-adapter:repository','artifacts.write':'kubeclaw.artifact-store:artifact-store'},grants:{'kubeclaw.delivery-lint:delivery-lint':{'git.repository.read':{allowedPrefixes:['Dockerfile']},'artifacts.write':{allowedNamespaces:['kubeclaw.delivery-lint']}}},adapters:{'kubeclaw.repository-adapter:repository':{repositoryRoot:path.resolve('.')},'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(root,'artifacts')}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:5000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const definition={schemaVersion:'pipeline-definition.v2',id:'test:artifact-window',maxConcurrency:1,stages:[{id:'delivery',type:'kubeclaw.lint.delivery',dependsOn:[],config:{},input:{moduleId:'api',dockerfile:null,staticPath:null},execution:{maxAttempts:3,maxRemediationCycles:0,timeoutMs:5000}}]};
 const runId='run:artifact-window';assert.equal((await runPipelineV2(platform,definition,runId)).status,'succeeded');
 const file=path.join(runRoot(platform.storageRoot,runId),'events.jsonl');
 const lines=fs.readFileSync(file,'utf8').trim().split('\n');
 const index=lines.findIndex(line=>JSON.parse(line).entry.type==='attempt.completed');
 assert.equal(JSON.parse(lines[index]).entry.payload.result.artifacts.length,1);
 assert.equal(lines.filter(line=>JSON.parse(line).entry.type==='artifact.created').length,1);
 fs.writeFileSync(file,lines.slice(0,index+1).join('\n')+'\n');
 const recovered=await recoverPipelineV2(platform,definition,runId);
 assert.equal(recovered.status,'succeeded');assert.equal(recovered.stages.get('delivery').attemptsUsed,1);
 const records=fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);
 assert.equal(records.filter(e=>e.type==='artifact.created').length,0);
 console.log('Original Delivery-Lint + artifact-store: completed attempt contains report; recovery succeeds without restoring artifact.created, no second producer attempt');
}finally{fs.rmSync(root,{recursive:true,force:true});}
