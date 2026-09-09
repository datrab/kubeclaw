import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';
import * as core from '@kubeclaw/nova-core';
import {runRoot} from '../../../core/execution/run-root.ts';
import {prepareRuntime} from '../../../core/execution/engine-runtime.ts';
import {HttpRemotePlanTransport} from '../../../core/test-gates/remote-dispatch.ts';
import {gateCoverageDigest} from '@kubeclaw/pipeline-test-gate-contract';
import {demoImportVectors} from '../../remote-test-gate/tests/demo-import-fixture.ts';
import {demoStages} from '../../../project/demo.ts';
const repository=fileURLToPath(new URL('../../../../../',import.meta.url));
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

// Actual TLS authentication, delivery HTTP, original Nova stages/stores/importer,
// and original Go controller CAS. Remote build/deployment results and Kubernetes
// objects are explicitly contract vectors: this is NOT deployed Ready E2E.
test('original handoff pipeline and controller reconcile lost TLS response; source envelopes are contract vectors',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-demo-handoff-'));const tls=path.join(root,'tls');fs.mkdirSync(tls);
 let child:ReturnType<typeof spawn>|undefined;let childDone:Promise<unknown>|undefined;let runtime:core.AdapterRuntime|undefined;
 let server:http.Server|undefined;const secretName=`DEMO_HANDOFF_WEBHOOK_${process.pid}`;process.env[secretName]='local-discord-contract-secret';
 try {
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(tls,'key.pem'),'-out',path.join(tls,'cert.pem'),'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-days','1'],{stdio:'ignore'});
  const bundleFile=path.join(root,'auth.json');const environment={...process.env,KUBECLAW_DEMO_AUTH_TEST_TLS_ROOT:tls,NODE_EXTRA_CA_CERTS:path.join(tls,'cert.pem'),KUBECLAW_DEMO_AUTH_TEST_RESULT:bundleFile};delete environment.NODE_TEST_CONTEXT;
  execFileSync(process.execPath,['--test',path.join(repository,'skills/buster/plugins/demo-auth-smoke/tests/live-function.test.ts')],{cwd:repository,env:environment});
  const bundle=JSON.parse(fs.readFileSync(bundleFile,'utf8'));assert.match(bundle.result.outputs[0].value.url,/^https:\/\/127\.0\.0\.1:/);
  const descriptorFile=path.join(root,'controller.json');let diagnostics='';
  child=spawn('go',['test','-count=1','-run','^TestNovaDemoHandoffProducerInterop$','./cmd/buster-namespace-controller'],{cwd:repository,env:{...process.env,KUBECLAW_DEMO_HANDOFF_INTEROP_INPUT:bundleFile,KUBECLAW_DEMO_HANDOFF_INTEROP_OUTPUT:descriptorFile},stdio:['ignore','pipe','pipe']});
  child.stdout!.on('data',chunk=>{diagnostics+=chunk;});child.stderr!.on('data',chunk=>{diagnostics+=chunk;});childDone=once(child,'exit');
  const deadline=Date.now()+15000;while(!fs.existsSync(descriptorFile)&&Date.now()<deadline&&child.exitCode===null)await delay(20);
  assert(fs.existsSync(descriptorFile),diagnostics);const controller=JSON.parse(fs.readFileSync(descriptorFile,'utf8'));
  const pluginRoot=path.join(root,'plugins'),fixture=path.join(pluginRoot,'reports');fs.mkdirSync(fixture,{recursive:true});
  fs.writeFileSync(path.join(fixture,'plugin.json'),JSON.stringify({id:'test.report-vectors',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],adapters:[],stages:[{id:'reports',type:'test.report-vectors',module:'stage.mjs',export:'execute',requiredCapabilities:['artifacts.write'],configSchema:'config.json',inputSchema:'input.json',resultSchema:'result.json'}]}));
  fs.writeFileSync(path.join(fixture,'config.json'),JSON.stringify({type:'object',additionalProperties:false}));fs.writeFileSync(path.join(fixture,'input.json'),JSON.stringify({type:'object',properties:{records:{type:'array',items:{type:'object'}}},required:['records'],additionalProperties:false}));fs.writeFileSync(path.join(fixture,'result.json'),JSON.stringify({type:'object'}));
  fs.writeFileSync(path.join(fixture,'stage.mjs'),`export async function execute(input,context){const artifacts=[];for(const record of input.records){const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:record.id},payload:{namespace:record.namespace,mediaType:'application/json',value:record.value}});artifacts.push(stored.artifact);}return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts};}`);
  const roots=['common','nova','buster'].map(role=>path.join(repository,'skills',role,'plugins'));roots.push(pluginRoot);
  const registry=core.buildRegistry(core.discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:handoff-contract'}}));
  const {job,result,status,policy}=demoImportVectors(registry,bundle);const deliveries:string[]=[];
  server=http.createServer((request,response)=>{
   if(request.url?.includes('/results/')){response.end(JSON.stringify(result));return;}
   if(request.url?.includes('/evidence/')){response.end('local application manifest contract vector');return;}
   if(request.url?.startsWith('/discord')){assert.equal(new URL(request.url,'http://local').searchParams.get('wait'),'true');const chunks:Buffer[]=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{deliveries.push(Buffer.concat(chunks).toString('utf8'));response.writeHead(200,{'content-type':'application/json'});response.end('{"id":"123456789012345678"}');});return;}
   response.writeHead(404).end();
  });server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
  const transport=new HttpRemotePlanTransport({endpoint:origin,authentication:'spiffe-proxy',maximumResponseBytes:2*1024**2});
  const store=new core.FileNovaGateImportStore(path.join(root,'imports'),{recordLimits:{maximumRecords:100,maximumBytes:8*1024**2,maximumRecordBytes:2*1024**2},maximumEvidenceStoreBytes:2*1024**2});
  const decision=await new core.NovaRemoteGateImporter({store,evidence:transport,results:transport,maximumEvidenceBytes:2*1024**2,maximumResultBytes:2*1024**2}).import(job,status);
  const moduleBase={...policy,kind:'module' as const};delete moduleBase.policyDigest;const modulePolicy={...moduleBase,policyDigest:gateCoverageDigest(moduleBase)};
  const coverageBase={...decision.coverage,policy:modulePolicy,pipelineStageId:'test-app'};delete coverageBase.coverageDigest;
  const moduleUnsigned={...decision,coverage:{...coverageBase,coverageDigest:sha256Text(canonicalJson(coverageBase))}};delete moduleUnsigned.decisionDigest;
  const moduleDecision={...moduleUnsigned,decisionDigest:sha256Text(canonicalJson(moduleUnsigned))};
  const revision='a'.repeat(40),record=(id:string,namespace:string,value:unknown)=>({id,namespace,value});
  const quality=(id:string,gate:any)=>record(id,'kubeclaw.buster-quality-gate',{sourceRevision:revision,testAgent:{enabled:false},nativeOutcome:'passed',decisionDigest:gate.decisionDigest});
  const stage=(id:string,dependsOn:string[],records:unknown[])=>({id,type:'test.report-vectors',dependsOn,config:{},input:{records},execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:10000}});
  const definition:any={schemaVersion:'pipeline-definition.v2',id:'demo-contract',maxConcurrency:1,stages:[
   stage('forge',[],[record('implementation:app','kubeclaw.implementation-agent',{status:'ready_for_testing',sourceRevision:revision})]),
   stage('lint',['forge'],[record('lint:full:app','kubeclaw.lint',{sourceRevision:revision,summary:{tools_failed:0,total_blocking:0}})]),
   stage('test-app',['lint'],[record('module:decision:1','kubeclaw.buster-quality-gate',moduleDecision),quality('module:quality:1',moduleDecision)]),
   stage('final-test',['test-app'],[record('final:decision:1','kubeclaw.buster-quality-gate',decision),quality('final:quality:1',decision)]),
   {id:'project-summary',type:'kubeclaw.report.project-summary',dependsOn:['final-test'],config:{},input:{projectId:'demo',modules:[{moduleId:'app',sourceStageId:'forge',testStageId:'test-app',expectedCoverage:modulePolicy}],final:{sourceStageId:'forge',testStageId:'final-test',lintStageId:'lint',expectedCoverage:policy}},execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:10000}},
   ...demoStages({authNodeId:'auth',protocol:'json-session.v1',operatorTarget:'operators',retentionSeconds:1209600},job.plan)]};
  const namespaces=['kubeclaw.implementation-agent','kubeclaw.lint','kubeclaw.buster-quality-gate','kubeclaw.project-summary','kubeclaw.demo-handoff'];
  const artifact='kubeclaw.artifact-store:artifact-store',evidence='kubeclaw.remote-test-gate:evidence',handoff='kubeclaw.demo-handoff:handoff',operator='kubeclaw.operator-messaging:operator';
  const platform:any={schemaVersion:'pipeline-platform.v2',storageRoot:path.join(root,'pipeline'),installationRoots:roots,trustedBuiltinRoots:roots,externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},orchestratorIssuerId:'test:operator',administrativeDecisionIssuers:[],shutdownTimeoutMs:1000,activeAdapters:[],observers:{},
   providers:{'artifacts.write':artifact,'artifacts.read':artifact,'test.plan.evidence':evidence,'demo.handoff':handoff,'operator.request':operator,'operator.receipt':operator,'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets'},
   grants:{'test.report-vectors:reports':{'artifacts.write':{allowedNamespaces:namespaces}},'kubeclaw.project-summary:summary':{'artifacts.read':{allowedNamespaces:namespaces},'artifacts.write':{allowedNamespaces:['kubeclaw.project-summary']}},
    'kubeclaw.demo-handoff:candidate':{'test.plan.evidence':{allowedNamespaces:['kubeclaw.project-summary']},'artifacts.write':{allowedNamespaces:['kubeclaw.demo-handoff']}},
    'kubeclaw.demo-handoff:delivery':{'demo.handoff':{allowedNamespaces:['kubeclaw.demo-handoff']},'artifacts.write':{allowedNamespaces:['kubeclaw.demo-handoff']}},
    'kubeclaw.demo-handoff:ready':{'demo.handoff':{allowedNamespaces:['kubeclaw.demo-handoff']},'artifacts.write':{allowedNamespaces:['kubeclaw.demo-handoff']}},
    [evidence]:{'artifacts.read':{allowedNamespaces:namespaces}},[handoff]:{'artifacts.read':{allowedNamespaces:namespaces},'test.plan.evidence':{allowedNamespaces:['kubeclaw.project-summary']},'operator.request':{allowedTargets:['operators']},'operator.receipt':{allowedTargets:['operators']}},
    [operator]:{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['demo.webhook']}}},
   adapters:{[artifact]:{artifactRoot:path.join(root,'artifacts')},[evidence]:{stateRoot:root,manifestStageId:'project-summary',gateStageId:'final-test'},[handoff]:{...controller,candidateStageId:'demo-candidate',deliveryStageId:'demo-delivery',readyStageId:'demo-ready',manifestStageId:'project-summary',operatorTarget:'operators',stateRoot:path.join(root,'intents'),timeoutMs:15000},
    [operator]:{deliveryRoot:path.join(root,'deliveries'),targets:{operators:{endpoint:origin+'/discord',tokenSecret:'demo.webhook',format:'discord_webhook'}}},
    'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']},'kubeclaw.secret-resolver:secrets':{environment:{'demo.webhook':secretName}}}};
  const executed=await core.runPipelineV2(platform,definition,job.plan.runId);assert.equal(executed.status,'succeeded',JSON.stringify(new core.FileJournal<any>(path.join(runRoot(platform.storageRoot,job.plan.runId),'events.jsonl')).records().filter(record=>['stage.blocked','effect.failed'].includes(record.entry.type))));
  assert.equal(deliveries.length,1);const transmitted=JSON.parse(deliveries[0]!);const auth=bundle.result.outputs[0].value,credentials=bundle.invocation.inputs.find((input:any)=>input.name==='credentials').value.values;
  assert.equal(transmitted.embeds[0].description,auth.url);assert.deepEqual(transmitted.embeds[0].fields.map((field:any)=>field.value),[credentials.username,credentials.password]);
  const ready=executed.stages.get('demo-ready')!;assert.equal(ready.status,'succeeded');
  await assert.rejects(core.recoverPipelineV2(platform,definition,job.plan.runId),/RECOVERY_RUN_TERMINAL/,'completed runs cannot masquerade as newly ready through recovery');
  assert.equal(deliveries.length,1,'completed recovery must not redeliver credentials');
  const prepared=await prepareRuntime(platform,definition);runtime=new core.AdapterRuntime({granted:prepared.granted,activated:prepared.activated,configs:new Map(Object.entries(platform.adapters)),shutdownTimeoutMs:1000,async emitDomainEvent(){},effects:new core.EffectCoordinator(new core.FileEffectJournal(path.join(root,'reconcile-effects.jsonl')),undefined,undefined,new core.FileResourceLockManager(path.join(root,'reconcile-locks')))});await runtime.start();
  const stored=async(kind:string)=>runtime!.invoke('artifacts.read',{runId:job.plan.runId,stageId:'demo-ready',attemptId:`read:${kind}`,attemptNumber:2},`read:${kind}`,{operation:'get_latest_json',resource:{type:'artifact.object',canonicalId:`${kind}:${job.plan.runId}`},payload:{namespace:'kubeclaw.demo-handoff'}},new AbortController().signal);
  const candidateRecord=await stored('demo-candidate'),deliveryRecord=await stored('demo-delivery');
  const candidate=candidateRecord.artifact as any,delivery=deliveryRecord.artifact as any,initialReady=(await stored('demo-ready')).value;
  const invoke=(key:string,candidateRef=candidate,deliveryRef=delivery)=>runtime!.invoke('demo.handoff',{runId:job.plan.runId,stageId:'demo-ready',attemptId:key,attemptNumber:2},key,{operation:'commit',resource:{type:'demo.candidate',canonicalId:candidateRef.artifactId},payload:{namespace:'kubeclaw.demo-handoff',candidate:candidateRef,delivery:deliveryRef}},new AbortController().signal);
  const reconciled=await invoke('reconcile:ready');assert.deepEqual(reconciled,initialReady);assert.equal((reconciled.response as any).retentionSeconds,1209600);assert.equal(deliveries.length,1);
  const again=await invoke('reconcile:again');assert.deepEqual(again,reconciled,'status lookup never renews');assert.equal(deliveries.length,1);
  await assert.rejects(invoke('foreign:candidate',{...candidate,producer:{...candidate.producer,runId:'foreign'}}),/ARTIFACT_OWNER_INVALID/);
  await assert.rejects(invoke('changed:delivery',candidate,{...delivery,digest:sha256Text('changed')}),/ARTIFACT_CHANGED/);assert.equal(deliveries.length,1);
  const deliveryValue=deliveryRecord.value as any;
  const originalPayload={type:'demo.access',severity:'success',title:'Demo access for acceptance',summary:auth.url,fields:[{name:'Username',value:credentials.username,inline:false},{name:'Password',value:credentials.password,inline:false}]};
  const lookup=(key:string,runId=job.plan.runId,stageId='demo-delivery',payload=originalPayload)=>runtime!.invoke('operator.receipt',{runId,stageId:'demo-ready',attemptId:key,attemptNumber:2},key,{operation:'lookup',resource:{type:'operator.target',canonicalId:'operators'},payload:{deliveryId:deliveryValue.deliveryId,stageId,payload}},new AbortController().signal);
  assert.deepEqual(await lookup('receipt:original'),deliveryValue.receipt);
  await assert.rejects(lookup('receipt:foreign','foreign-run'),/OPERATOR_RECEIPT_REQUEST_UNBOUND/);
  await assert.rejects(lookup('receipt:stage',job.plan.runId,'foreign-stage'),/OPERATOR_RECEIPT_REQUEST_UNBOUND/);
  await assert.rejects(lookup('receipt:payload',job.plan.runId,'demo-delivery',{...originalPayload,summary:auth.url+'/changed'}),/OPERATOR_RECEIPT_REQUEST_UNBOUND/);
  const manifest=(candidateRecord.value as any).manifest;
  await runtime.invoke('artifacts.write',{runId:job.plan.runId,stageId:'project-summary',attemptId:'manifest:changed',attemptNumber:2},'manifest:changed',{operation:'put_json',resource:{type:'artifact.object',canonicalId:manifest.artifactId},payload:{namespace:manifest.namespace,mediaType:'application/json',value:{changed:true}}},new AbortController().signal);
  await assert.rejects(invoke('source:changed'),/DEMO_EVIDENCE_ARTIFACT_CHANGED|DEMO_EVIDENCE_MANIFEST|ARTIFACT/);assert.equal(deliveries.length,1);
  fs.writeFileSync(descriptorFile+'.done','done');const [code]=await childDone as [number];assert.equal(code,0,diagnostics);child=undefined;
 }finally{await runtime?.shutdown();if(child){child.kill('SIGTERM');await childDone;}if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}delete process.env[secretName];fs.rmSync(root,{recursive:true,force:true});}
});
