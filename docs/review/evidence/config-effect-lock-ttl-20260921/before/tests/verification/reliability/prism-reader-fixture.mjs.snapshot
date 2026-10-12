// Actual registered stages/Core/Git/ArtifactStore; no fabricated invocation context.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { runPipelineV2 } from '../../../skills/nova/core/src/index.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { verifiedArchitectureValue } from '../../../skills/nova/plugins/prism-design/src/architecture.ts';
import { replayOriginalRead } from './prism-reader-replay.mjs';
import { FileEffectJournal } from '../../../skills/nova/core/effects/journal.ts';
import { FileDurableBlobStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { canonicalJson, portableJson, PORTABLE_JSON_ENCODING, reviewIdentityDigest, sha256Text } from '@kubeclaw/plugin-sdk';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const self = fileURLToPath(import.meta.url);
async function scenario(mixed, legacy, original) {
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
  const platform={schemaVersion:'pipeline-platform.v2',installationRoots:[installed],trustedBuiltinRoots:[installed],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},
    providers:{'artifacts.read':'kubeclaw.artifact-store:artifact-store','artifacts.write':'kubeclaw.artifact-store:artifact-store','signal.wait':'kubeclaw.wait-store:waits','operator.request':'kubeclaw.operator-messaging:operator','network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets','runtime.dispatch':'kubeclaw.runtime-dispatch:runtime','git.repository.read':'kubeclaw.repository-adapter:repository'},
    grants:{'kubeclaw.preflight-contract:source':{'git.repository.read':{allowedPrefixes:['.']},'artifacts.write':namespaces},'kubeclaw.prism-design:design':{'runtime.dispatch':{allowedAgents:['prism']},'artifacts.read':namespaces,'artifacts.write':namespaces,'operator.request':{allowedTargets:['operators']},'signal.wait':{allowedSignalTypes:['prism.approval.resolved'],allowedIssuerIds:['operator:test']}},'kubeclaw.runtime-dispatch:runtime':{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['token']}},'kubeclaw.operator-messaging:operator':{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['token']}}},
    adapters:{'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(directory,'artifacts')},'kubeclaw.wait-store:waits':{root:path.join(directory,'waits')},'kubeclaw.operator-messaging:operator':{deliveryRoot:path.join(directory,'deliveries'),targets:{operators:{endpoint:`${origin}/operator`,tokenSecret:'token'}}},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']},'kubeclaw.secret-resolver:secrets':{environment:{token:secretName}},'kubeclaw.runtime-dispatch:runtime':{targets:{prism:{endpoint:`${origin}/prism`,tokenSecret:'token'}}},'kubeclaw.repository-adapter:repository':{repositoryRoot:repository}},activeAdapters:[],observers:{},storageRoot:path.join(directory,'state'),shutdownTimeoutMs:5000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
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
  try {
    const result=await runPipelineV2(platform,definition,runId);
    const states=new Map(result.stages),sourceState=states.get('source'),design=states.get('design');
    assert.equal(sourceState.status,'succeeded',JSON.stringify(sourceState));
    const runDirectory=runRoot(platform.storageRoot,runId);
    const events=fs.readFileSync(path.join(runDirectory,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);
    const sourceResult=events.find(event=>event.type==='attempt.completed'&&event.identity.stageId==='source').payload.result;
    const designResult=events.find(event=>event.type==='attempt.completed'&&event.identity.stageId==='design').payload.result;
    const ref=sourceResult.artifacts[0];assert.equal(ref.encoding,legacy?undefined:PORTABLE_JSON_ENCODING);assert.equal(ref.digest,digest);
    const stored=await new FileDurableBlobStore(path.join(directory,'artifacts'),16*1024*1024,256*1024*1024).get(ref.digest);
    assert.equal(stored.toString('utf8'),bytes);assert.equal(ref.sizeBytes,stored.byteLength);
    const effectsFile=path.join(runDirectory,'effects.jsonl');
    const journal=new FileEffectJournal(effectsFile);
    const rows=fs.readFileSync(effectsFile,'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);
    const read=rows.find(row=>row.type==='requested'&&row.request.capability==='artifacts.read'&&row.request.attempt.stageId==='design');
    assert(read); const completed=rows.find(row=>row.type==='completed'&&row.receipt.effectId===read.request.effectId);
    assert(completed);assert.deepEqual(completed.receipt.result.artifact,ref);assert.deepEqual(completed.receipt.result.value,expected);
    const reason=designResult.reason?.message;
    assert.equal(result.status,'blocked');
    if(original&&mixed&&!legacy){assert.equal(reason,'PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID');assert.equal(requests.length,0);assert.notEqual(sha256Text(canonicalJson(expected)),digest);}
    else {assert.match(reason,/EFFECT_OUTCOME_UNRESOLVED:.*HTTP_503:/);assert.equal(requests.length,1);}
    assert.deepEqual(verifiedArchitectureValue(completed.receipt.result,ref),expected);
    if(original)await replayOriginalRead({platform,definition,runId,directory,runDirectory,ref,expected,bytes,read:read.request,effectsFile});
    assert.equal(requests.filter(item=>item.url==='/operator').length,0);
    console.log(JSON.stringify({mixed,legacy,original,locale:new Intl.Collator().resolvedOptions().locale,status:result.status,sourceState,design,sourceResult,designResult,artifactReference:ref,exactOriginalArtifactBytes:bytes,legacyReaderDigest:sha256Text(canonicalJson(expected)),artifactReadRequest:read,artifactReadReceipt:completed,httpRequests:requests,effectJournalDigest:sha256Text(fs.readFileSync(effectsFile)),effectJournalReopened:!!journal,registeredStages:true,fullPrismService:false,downstreamServiceIdCompatible:false}));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(beforeSecret===undefined)delete process.env[secretName];else process.env[secretName]=beforeSecret;fs.rmSync(directory,{recursive:true});}
}
if(process.argv[2]==='child')await scenario(process.argv[3]==='mixed',process.argv[4]==='legacy',process.argv[5]==='original');
else for(const locale of ['en_US.UTF-8','sv_SE.UTF-8'])for(const original of ['original','current'])for(const codec of ['portable','legacy'])for(const kind of ['fixed','mixed']) {
  const r=spawnSync(process.execPath,[self,'child',kind,codec,original],{cwd:checkout,env:{...process.env,LANG:locale,LC_ALL:locale},encoding:'utf8',maxBuffer:8*1024*1024});
  process.stdout.write(r.stdout);process.stderr.write(r.stderr);assert.equal(r.status,0,r.stderr);
}
