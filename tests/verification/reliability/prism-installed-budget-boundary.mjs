import { TEST_CORE_POLICY, TEST_CORE_POLICY_SELECTION } from '../../fixtures/core-runtime-policy.mjs';
// Actual registered stages/Core/Git/ArtifactStore; no fabricated invocation context.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { runPipelineV2, recoverPipelineV2 } from '../../../skills/nova/core/src/index.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { verifiedArchitectureValue } from '../../../skills/nova/plugins/prism-design/src/architecture.ts';
import { readRunSnapshot, retainedCoreRuntimePolicy } from '../../../skills/nova/core/execution/engine-snapshots.ts';


import { canonicalJson, portableJson, PORTABLE_JSON_ENCODING, reviewIdentityDigest, sha256Text } from '@kubeclaw/plugin-sdk';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const self = fileURLToPath(import.meta.url);
async function scenario(reject) {
  const mixed=false,legacy=false,original=false;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-original-reader-'));
  const repository = path.join(directory, 'repository'), installed = path.join(directory, 'installed');
  fs.mkdirSync(repository); fs.mkdirSync(installed);
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], {encoding:'utf8'}).trim();
  git('init','-q','-b','main');git('config','user.name','Probe');git('config','user.email','probe@example.invalid');
  fs.mkdirSync(path.join(repository,'modules/api'), {recursive:true});
  fs.writeFileSync(path.join(repository,'architecture.md'),'One explicitly reviewed API module.\n');
  fs.writeFileSync(path.join(repository,'modules/api/FORGE.md'),'```kubeclaw-deliverables\n'+JSON.stringify({schemaVersion:'forge-deliverables.v1',moduleId:'api',substep:null,deliverables:['api.mjs']})+'\n```\n');
  git('add','.');git('commit','-qm','Original architecture input'); const revision=git('rev-parse','HEAD');
  for(const source of [...['prism-design','preflight-contract','repository-adapter'].map(name=>`skills/nova/plugins/${name}`),...['artifact-store','wait-store','operator-messaging','network-http','secret-resolver','runtime-dispatch'].map(name=>`skills/common/plugins/${name}`)]) {
    fs.cpSync(path.join(checkout,source),path.join(installed,path.basename(source)),{recursive:true,filter:file=>path.basename(file)!=='node_modules'});
  }
  if(original){const fixture=new URL('./fixtures/prism-reader-stage-original.ts.txt',import.meta.url);assert.equal(sha256Text(fs.readFileSync(fixture)), 'sha256:8720b7e3d5e1a7726d76fe9b37a3f58f71566b193b35d6a5f017fbae0b243483');fs.copyFileSync(fixture,path.join(installed,'prism-design/src/stage.ts'));}
  fs.symlinkSync(path.join(checkout,'node_modules'),path.join(directory,'node_modules'),'dir');
  const requests=[];
  const server=http.createServer((request,response)=>{const chunks=[];request.on('data',c=>chunks.push(c));request.on('end',()=>{requests.push({url:request.url,body:Buffer.concat(chunks).toString('utf8')});response.writeHead(503,{'content-type':'text/plain'});response.end('Diagnostic receiver refuses work; no Prism service, approval, or rendering is simulated.');});});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const secretName='KUBECLAW_PRISM_READER_PROBE_TOKEN',beforeSecret=process.env[secretName];process.env[secretName]='local-probe-only';
  const namespaces={allowedNamespaces:['kubeclaw.preflight-contract','kubeclaw.prism']};
  const platform={corePolicySelection: TEST_CORE_POLICY_SELECTION,schemaVersion:'pipeline-platform.v2', effectLockTtlMs: 300_000,installationRoots:[installed],trustedBuiltinRoots:[installed],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},
    providers:{'artifacts.read':'kubeclaw.artifact-store:artifact-store','artifacts.write':'kubeclaw.artifact-store:artifact-store','signal.wait':'kubeclaw.wait-store:waits','operator.request':'kubeclaw.operator-messaging:operator','network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets','runtime.dispatch':'kubeclaw.runtime-dispatch:runtime','git.repository.read':'kubeclaw.repository-adapter:repository'},
    grants:{'kubeclaw.preflight-contract:source':{'git.repository.read':{allowedPrefixes:['.']},'artifacts.write':namespaces},'kubeclaw.prism-design:design':{'runtime.dispatch':{allowedAgents:['prism']},'artifacts.read':namespaces,'artifacts.write':namespaces,'operator.request':{allowedTargets:['operators']},'signal.wait':{allowedSignalTypes:['prism.approval.resolved'],allowedIssuerIds:['operator:test']}},'kubeclaw.runtime-dispatch:runtime':{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['token']}},'kubeclaw.operator-messaging:operator':{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['token']}}},
    adapters:{'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(directory,'artifacts')},'kubeclaw.wait-store:waits':{root:path.join(directory,'waits')},'kubeclaw.operator-messaging:operator':{deliveryRoot:path.join(directory,'deliveries'),targets:{operators:{payloadProfile:'standard',endpoint:`${origin}/operator`,tokenSecret:'token'}}},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']},'kubeclaw.secret-resolver:secrets':{environment:{token:secretName}},'kubeclaw.runtime-dispatch:runtime':{targets:{prism:{byteProfile:'standard',endpoint:`${origin}/prism`,tokenSecret:'token'}}},'kubeclaw.repository-adapter:repository':{repositoryRoot:repository}},activeAdapters:[],observers:{},storageRoot:path.join(directory,'state'),shutdownTimeoutMs:5000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
  const runId='run:prism-reader-'+(mixed?'mixed':'fixed');
  const source={...(legacy?{}:{identityEncoding:PORTABLE_JSON_ENCODING}),projectId:'project',repositoryRoot:repository,architectureRef:'main',paths:['architecture.md','modules/api/FORGE.md']};
  const contract={projectId:'project',baseRevision:revision,requiredFiles:['architecture.md'],modules:[{moduleId:'api',modulePath:'modules/api',ownedPaths:['api.mjs'],serveDockerfile:'api.mjs',apiSpecFile:null}],policy:mixed?{I:1,i:2,å:3,z:4}:{}};
  // Predict only the caller's immutable content digest from real Git source and original digest helper.
  // Actual ArtifactRef/attempt/lease/checkpoint context is produced exclusively by original Core.
  const files=source.paths.map(file=>{const content=fs.readFileSync(path.join(repository,file),'utf8');return{path:file,mode:'100644',content,digest:sha256Text(content),sizeBytes:Buffer.byteLength(content)};});
  const unsigned={...source,runId,sourceRevision:revision,architectureRevision:revision,inputDigest:reviewIdentityDigest(contract,source),files};
  const subject={...unsigned,digest:reviewIdentityDigest(unsigned,source)};
  const expected={schemaVersion:'source-preflight.v1',outcome:'passed',contract,subject};
  const bytes=(legacy?canonicalJson:portableJson)(expected),digest=sha256Text(bytes);
  const execution={maxAttempts:1,maxRemediationCycles:0,timeoutMs:15000};
  const definition={schemaVersion:'pipeline-definition.v2',id:'probe:prism-reader',maxConcurrency:1,stages:[
    {id:'source',type:'kubeclaw.validate.source-preflight',dependsOn:[],config:{},execution,input:{source,contract}},
    {id:'design',type:'kubeclaw.design.prism',dependsOn:['source'],config:{agent:'prism',target:'operators',issuerId:'operator:test',timeoutMinutes:5},execution,input:{runId,projectId:'project',architectureArtifact:{artifactId:'source-preflight',contentDigest:digest,revision:1},requiresDesign:true}},
  ]};
  const coreFile=path.join(directory,'core.json');
  const limit=Buffer.byteLength(bytes)-(reject?1:0);
  const publish=n=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,prismDesignBudgets:{...TEST_CORE_POLICY.prismDesignBudgets,maximumArchitectureBytes:n}}}}}));
  platform.corePolicySelection={file:coreFile,profile:'selected'};publish(limit);
  try {
    // Installed engine must reject a second graph budget author, even when equal.
    let duplicateAuthorsRejected=0;
    for(const mode of ['equal','different']) {
      const duplicate=structuredClone(definition);
      duplicate.stages[1].config.budgets={...TEST_CORE_POLICY.prismDesignBudgets,maximumArchitectureBytes:limit+(mode==='different'?1:0)};
      const duplicateRun=runId+':duplicate:'+mode;
      const beforeRequests=requests.length;
      await assert.rejects(runPipelineV2(platform,duplicate,duplicateRun),/CORE_PRISM_BUDGET_DUPLICATE_AUTHOR/);
      assert(!fs.existsSync(runRoot(platform.storageRoot,duplicateRun)));
      assert.equal(requests.length,beforeRequests);
      duplicateAuthorsRejected++;
    }
    const result=await runPipelineV2(platform,definition,runId);
    assert.equal(result.stages.get('source').status,'succeeded');assert.equal(result.status,'blocked');
    const runDirectory=runRoot(platform.storageRoot,runId);
    const events=fs.readFileSync(path.join(runDirectory,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);
    const outcome=events.find(e=>e.type==='attempt.completed'&&e.identity.stageId==='design').payload.result;
    if(reject){assert.equal(outcome.reason.message,'PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID');assert.equal(requests.length,0);}
    else {assert.match(outcome.reason.message,/EFFECT_OUTCOME_UNRESOLVED:.*HTTP_503:/);assert.equal(requests.length,1);}
    const snapshot=readRunSnapshot(runDirectory);
    assert.equal(retainedCoreRuntimePolicy(runDirectory).prismDesignBudgets.maximumArchitectureBytes,limit);
    publish(1);assert.equal(retainedCoreRuntimePolicy(runDirectory).prismDesignBudgets.maximumArchitectureBytes,limit);
    fs.unlinkSync(coreFile);
    // Terminal blocked runs must remain terminal; this is not redispatch acceptance.
    await assert.rejects(recoverPipelineV2(platform,definition,runId),/RECOVERY_RUN_TERMINAL/);
    assert.deepEqual(readRunSnapshot(runDirectory),snapshot);
    assert.equal(requests.length,reject?0:1);
    const newRun=runId+':missing';await assert.rejects(runPipelineV2(platform,definition,newRun),/ENOENT/);
    assert(!fs.existsSync(runRoot(platform.storageRoot,newRun)));
    // Real new-start loading must reject every absent/invalid selected budget leaf before creating a run.
    let rejectedPolicies=0;
    for(const leaf of Object.keys(TEST_CORE_POLICY.prismDesignBudgets)) {
      for(const mode of ['missing','zero','negative','fractional','string','null','unsafe','boolean']) {
        const budgets={...TEST_CORE_POLICY.prismDesignBudgets,maximumArchitectureBytes:limit};
        if(mode==='missing')delete budgets[leaf];else budgets[leaf]=({zero:0,negative:-1,fractional:1.5,string:'1',null:null,unsafe:Number.MAX_SAFE_INTEGER+1,boolean:true})[mode];
        fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,prismDesignBudgets:budgets}}}}));
        const invalidRun=runId+':'+leaf+':'+mode;
        await assert.rejects(runPipelineV2(platform,definition,invalidRun),/CORE_RUNTIME_POLICY_INVALID/);
        assert(!fs.existsSync(runRoot(platform.storageRoot,invalidRun)));
        assert.deepEqual(readRunSnapshot(runDirectory),snapshot);
        assert.equal(requests.length,reject?0:1);
        rejectedPolicies++;
      }
    }
    assert.equal(rejectedPolicies,24);
    publish(limit);const restored=await runPipelineV2(platform,definition,runId+':restored');assert.equal(restored.stages.get('source').status,'succeeded');
    // The explicit task digest belongs to original run and must not be rewritten for a new run.
    assert.equal(restored.status,'blocked');assert.equal(requests.length,reject?0:1);
    // Reuse unchanged original task/digest identities in an isolated fresh store.
    // This verifies restored selection behavior, not recovery/redispatch of the terminal run.
    const restoredPlatform={...platform,storageRoot:path.join(directory,'restored-state'),adapters:{...platform.adapters,
      'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(directory,'restored-artifacts')},
      'kubeclaw.wait-store:waits':{root:path.join(directory,'restored-waits')},
      'kubeclaw.operator-messaging:operator':{...platform.adapters['kubeclaw.operator-messaging:operator'],deliveryRoot:path.join(directory,'restored-deliveries')},
    }};
    const restoredOriginal=await runPipelineV2(restoredPlatform,definition,runId);
    assert.equal(restoredOriginal.stages.get('source').status,'succeeded');
    assert.equal(restoredOriginal.status,'blocked');
    const restoredDirectory=runRoot(restoredPlatform.storageRoot,runId);
    const restoredEvents=fs.readFileSync(path.join(restoredDirectory,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);
    const restoredOutcome=restoredEvents.find(e=>e.type==='attempt.completed'&&e.identity.stageId==='design').payload.result;
    if(reject){assert.equal(restoredOutcome.reason.message,'PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID');assert.equal(requests.length,0);}
    else{assert.match(restoredOutcome.reason.message,/EFFECT_OUTCOME_UNRESOLVED:.*HTTP_503:/);assert.equal(requests.length,2);}
    assert.equal(retainedCoreRuntimePolicy(restoredDirectory).prismDesignBudgets.maximumArchitectureBytes,limit);
    assert.deepEqual(readRunSnapshot(runDirectory),snapshot);
    console.log(JSON.stringify({selectedLimit:limit,artifactBytes:Buffer.byteLength(bytes),reject,realRegisteredEngine:true,originalSnapshotUnchanged:true,currentFileMissingNewStartDenied:true,terminalRecoveryDenied:true,invalidSelectedPoliciesRejected:rejectedPolicies,duplicateAuthorsRejected,restoredOriginalIdentityBehaviorVerified:true,fullRedispatchVerified:false}));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(beforeSecret===undefined)delete process.env[secretName];else process.env[secretName]=beforeSecret;fs.rmSync(directory,{recursive:true});}
}
await scenario(false);await scenario(true);
