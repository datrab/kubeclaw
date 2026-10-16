import { ContentAddressedArtifactStore } from '../../../skills/prism/storage/artifacts.ts';
import { assembleBaselineArchive, BASELINE_V2 } from '../../../contracts/prism/v1/src/baseline-archive.ts';
import { baselineInput } from '../integration/fixtures/prism-baseline-input.mts';
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
import { runPipelineV2, recoverPipelineV2, resumePipelineV2 } from '../../../skills/nova/core/src/index.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { verifiedArchitectureValue } from '../../../skills/nova/plugins/prism-design/src/architecture.ts';
import { readRunSnapshot, retainedCoreRuntimePolicy } from '../../../skills/nova/core/execution/engine-snapshots.ts';


import { canonicalJson, portableJson, PORTABLE_JSON_ENCODING, reviewIdentityDigest, sha256Text } from '@kubeclaw/plugin-sdk';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const self = fileURLToPath(import.meta.url);
async function scenario(mode) {
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
  const cas=new ContentAddressedArtifactStore(path.join(directory,'baseline-cas'));
  const assembled=assembleBaselineArchive({...await baselineInput(cas),profile:BASELINE_V2});
  const stored=await cas.put(assembled.bytes);
  const archiveResponse={artifactId:stored.artifactId,bundleDigest:assembled.bundleDigest,archiveBase64:Buffer.from(await cas.get(stored.artifactId)).toString('base64')};
  const requests=[];
  const server=http.createServer((request,response)=>{const chunks=[];request.on('data',c=>chunks.push(c));request.on('end',()=>{requests.push({url:request.url,body:Buffer.concat(chunks).toString('utf8')});response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(request.url==='/operator'?{messageId:'published'}:{result:archiveResponse}));});});
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
  const execution={maxAttempts:2,maxRemediationCycles:0,timeoutMs:15000};
  const definition={schemaVersion:'pipeline-definition.v2',id:'probe:prism-reader',maxConcurrency:1,stages:[
    {id:'source',type:'kubeclaw.validate.source-preflight',dependsOn:[],config:{},execution,input:{source,contract}},
    {id:'design',type:'kubeclaw.design.prism',dependsOn:['source'],config:{agent:'prism',target:'operators',issuerId:'operator:test',timeoutMinutes:5},execution,input:{runId,projectId:'project',architectureArtifact:{artifactId:'source-preflight',contentDigest:digest,revision:1},requiresDesign:true}},
  ]};
  const coreFile=path.join(directory,'core.json');
  const limit=Buffer.byteLength(bytes);
  const publish=n=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,prismDesignBudgets:{...TEST_CORE_POLICY.prismDesignBudgets,maximumArchitectureBytes:n,maximumArchiveBytes:assembled.bytes.length,maximumArchiveFiles:Object.keys(assembled.archive.textFiles).length+Object.keys(assembled.archive.binaryFiles).length}}}}}));
  platform.corePolicySelection={file:coreFile,profile:'selected'};publish(limit);
  try {
    const result=await runPipelineV2(platform,definition,runId);
    assert.equal(result.stages.get('source').status,'succeeded');
    assert.equal(result.status,'waiting',fs.readFileSync(path.join(runRoot(platform.storageRoot,runId),'events.jsonl'),'utf8'));
    const runDirectory=runRoot(platform.storageRoot,runId),snapshot=readRunSnapshot(runDirectory);
    const retained=retainedCoreRuntimePolicy(runDirectory).prismDesignBudgets;
    assert.equal(retained.maximumArchitectureBytes,limit);
    assert.equal(retained.maximumArchiveBytes,assembled.bytes.length);
    assert.equal(requests.filter(r=>r.url==='/prism').length,1);
    assert.equal(requests.filter(r=>r.url==='/operator').length,1);
    assert.equal(JSON.parse(requests.find(r=>r.url==='/operator').body).architectureDigest,digest,'approval message preserves exact architecture identity');
    if(mode==='changed') {
      fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,prismDesignBudgets:{maximumArchitectureBytes:1,maximumArchiveBytes:1,maximumArchiveFiles:1}}}}}));
    } else fs.unlinkSync(coreFile);
    await assert.rejects(recoverPipelineV2(platform,definition,runId),/RECOVERY_SIGNAL_REQUIRED/);
    const wait=result.stages.get('design').wait;
    const resumed=await resumePipelineV2(platform,definition,runId,{schemaVersion:'resume-signal.v2',signalId:'signal:prism-approval',idempotencyKey:'signal-key:prism-approval',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{decision:'approved',issuer:wait.authorizedIssuer,approvalId:'approval:baseline',architectureDigest:digest,bundleDigest:assembled.bundleDigest}});
    assert.equal(resumed.status,'succeeded',JSON.stringify([...resumed.stages]));
    assert.equal(requests.filter(r=>r.url==='/prism').length,2,'genuine approved dispatch executes');
    assert.equal(requests.filter(r=>r.url==='/operator').length,1,'original approval not republished');
    const approvedRequest=JSON.parse(requests.filter(r=>r.url==='/prism')[1].body);
    assert.equal(approvedRequest.request.approvalId,'approval:baseline');
    assert.equal(approvedRequest.request.architecture.contentDigest,digest);
    assert.deepEqual(readRunSnapshot(runDirectory),snapshot);
    assert.deepEqual(retainedCoreRuntimePolicy(runDirectory).prismDesignBudgets,retained);
    const events=fs.readFileSync(path.join(runDirectory,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);
    const completed=events.filter(e=>e.type==='attempt.completed'&&e.identity.stageId==='design');
    assert.equal(completed.length,2);
    const artifact=completed[1].payload.result.artifacts[0];
    assert.equal(artifact.producer.runId,runId);
    assert.equal(artifact.namespace,'kubeclaw.prism');
    assert.equal(completed[1].payload.result.outcome,'passed');
    console.log(JSON.stringify({mode,realRegisteredEngine:true,realGitAndCas:true,approvedRedispatchVerified:true,retainedThreeBudgetLeaves:true,snapshotUnchanged:true,archiveArtifactPublished:true,fullPrismServiceOrRendering:false}));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(beforeSecret===undefined)delete process.env[secretName];else process.env[secretName]=beforeSecret;fs.rmSync(directory,{recursive:true});}
}
await scenario('changed');await scenario('missing');
