#!/usr/bin/env node
/** This maintained local Core CLI journey uses shipped packages and durable stores. It does not use a mock runner. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadPlatformConfig} from '../../../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {loadPipelineDefinition,validatePipelineRuntimeV2} from '../../../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../../../skills/nova/core/execution/run-root.ts';
import {parseJournalRecords} from '../../../../../skills/nova/core/state/journal.ts';
import {readRunEvidence} from '../../../../../skills/nova/core/state/read-run-evidence.ts';
import {FileDurableBlobStore,assertDurableRecordReplay} from '../../../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import {telemetryEnvelope} from '../../../../../skills/common/plugins/telemetry-observer/src/observer.ts';
import {telemetryProjection} from '../../../../../skills/common/plugins/telemetry-store/src/projection.ts';
import {canonicalJson,sha256Text,sha256Bytes} from '../../../../../skills/common/plugin-runtime/sdk/src/index.ts';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const [operation,destination]=process.argv.slice(2);
assert.equal(process.argv.length,4,'Usage: node docs/site/use/workflows/examples/local-core.mjs prepare|run|verify|cleanup NEW_ABSOLUTE_DIRECTORY');
assert(destination&&path.isAbsolute(destination)&&path.normalize(destination)===destination&&destination!=='/','Select one temporary directory with an absolute path. Its path must agree with the output of path.normalize for that path.');
const root=destination;
const markerFile=path.join(root,'owned-journey.json');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(path.join(root,file),`${JSON.stringify(value,null,2)}\n`,{flag:'wx',mode:0o600});
function pins(directory){let cursor=path.parse(directory).root;for(const part of directory.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);const s=fs.lstatSync(cursor);assert(s.isDirectory()&&!s.isSymbolicLink(),`Unsafe directory: ${cursor}`);}}
function owned(){pins(root);const marker=json(markerFile);assert.equal(marker.schemaVersion,'local-core-journey.v1');assert.equal(marker.root,root);assert.equal(marker.sourceRoot,sourceRoot);assert.equal(marker.uid,process.getuid?.()??null);const selected=json(path.join(root,'source.json')).sourceRevision;const current=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();assert.equal(current,selected,'The Source revision changed. Keep the fixture. Stop.');return marker;}
function records(file){const result=[];parseJournalRecords(fs.readFileSync(file),result,file);assert(result.length>0,'Empty journal');return result;}
function files(directory,prefix=''){return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{const relative=path.join(prefix,entry.name),file=path.join(directory,entry.name);assert(!entry.isSymbolicLink(),`Unexpected symlink: ${file}`);return entry.isDirectory()?files(file,relative).map(x=>({...x,file:path.join(entry.name,x.file)})):[{file:entry.name,bytes:fs.statSync(file).size,digest:sha256Bytes(fs.readFileSync(file))}];});}
function digestTree(directory){return files(directory);}
function command(args,name,expected){
 const result=spawnSync(process.execPath,args,{cwd:sourceRoot,encoding:'utf8',timeout:60000,maxBuffer:8*1024**2});
 fs.writeFileSync(path.join(root,`${name}.stdout`),result.stdout??'',{flag:'wx'});
 fs.writeFileSync(path.join(root,`${name}.stderr`),result.stderr??'',{flag:'wx'});
 write(`${name}.command.json`,{command:[process.execPath,...args],exitCode:result.status,signal:result.signal,error:result.error?.message??null});
 assert(!result.error&&!result.signal,`${name}: process failure. Inspect the retained output.`);assert.equal(result.status,expected,`${name}: unexpected exit. Inspect the retained stdout/stderr.`);return result;
}
const platformFile=path.join(root,'platform.json');
const cli=path.join(sourceRoot,'skills/nova/core/cli.ts');
const stageId='delivery';const registration='kubeclaw.delivery-lint:delivery-lint';
const successRun='run:local-core-success',blockedRun='run:local-core-blocked';
const artifactRoot=path.join(root,'artifacts');
const telemetryRoot=path.join(root,'telemetry');
const telemetryObserver='kubeclaw.telemetry-observer:telemetry';
const telemetryProvider='kubeclaw.telemetry-store:telemetry';
function graph(id,input){return {schemaVersion:'pipeline-definition.v2',id,maxConcurrency:1,stages:[{id:stageId,type:'kubeclaw.lint.delivery',dependsOn:[],config:{},input,execution:{maxAttempts:1,maxRemediationCycles:0,maxTechnicalRetries:0,timeoutMs:10000}}]};}
if(operation==='prepare'){
 assert(!fs.existsSync(root),'An item is at the destination. Do not use it again.');pins(path.dirname(root));
 assert.equal(process.versions.node.split('.')[0],'24','Use Node24');
 const flock=spawnSync('/usr/bin/flock',['--help'],{encoding:'utf8'});assert.equal(flock.status,0);assert((flock.stdout+flock.stderr).includes('--timeout'),'Absolute GNU flock with --timeout is necessary.');
 fs.mkdirSync(root,{mode:0o700});write('owned-journey.json',{schemaVersion:'local-core-journey.v1',root,sourceRoot,uid:process.getuid?.()??null,createdAt:new Date().toISOString()});
 const repositoryRoot=path.join(root,'repository');fs.mkdirSync(repositoryRoot);fs.writeFileSync(path.join(repositoryRoot,'Dockerfile'),'FROM scratch\nCOPY site/ /srv/site/\n');fs.mkdirSync(path.join(repositoryRoot,'site'));fs.writeFileSync(path.join(repositoryRoot,'site/index.html'),'<h1>Local delivery declaration</h1>\n');
 const git=(...args)=>execFileSync('git',['-C',repositoryRoot,...args],{encoding:'utf8'}).trim();git('init','-q');git('add','.');git('-c','user.name=Documentation Journey','-c','user.email=journey@example.invalid','commit','-qm','Local delivery fixture');
 const roots=['skills/nova/plugins','skills/common/plugins'].map(f=>path.join(sourceRoot,f));
 const platform={schemaVersion:'pipeline-platform.v2',storageRoot:path.join(root,'state'),installationRoots:roots,trustedBuiltinRoots:roots,externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'git.repository.read':'kubeclaw.repository-adapter:repository','artifacts.write':'kubeclaw.artifact-store:artifact-store'},grants:{[registration]:{'git.repository.read':{allowedPrefixes:['Dockerfile']},'artifacts.write':{allowedNamespaces:['kubeclaw.delivery-lint']}}},adapters:{'kubeclaw.repository-adapter:repository':{repositoryRoot,expectedHead:git('rev-parse','HEAD'),maxFileBytes:65536},'kubeclaw.artifact-store:artifact-store':{artifactRoot,maxArtifactBytes:65536,maximumRecords:100,maximumStoreBytes:1048576}},activeAdapters:[],observers:{},shutdownTimeoutMs:1000,orchestratorIssuerId:'local:operator',administrativeDecisionIssuers:[]};
 const telemetryManifest=json(path.join(sourceRoot,'skills/common/plugins/telemetry-observer/plugin.json'));
 const telemetrySubscription=telemetryManifest.observers.find(entry=>entry.id==='telemetry').subscriptions;
 platform.providers['telemetry.emit']=telemetryProvider;
 platform.grants[telemetryObserver]={'telemetry.emit':{allowedEventPrefixes:telemetrySubscription}};
 platform.adapters[telemetryProvider]={root:telemetryRoot,maxRecordBytes:65536,maximumRecords:256,maximumStoreBytes:4194304};
 platform.observers[telemetryObserver]={};
 write('platform.json',platform);write('success.pipeline.json',graph('pipeline:local-delivery',{moduleId:'site',dockerfile:'Dockerfile',staticPath:'/srv/site/'}));
 write('blocked.pipeline.json',graph('pipeline:local-invalid-path',{moduleId:'site',dockerfile:'../outside/Dockerfile',staticPath:'/srv/site/'}));
 const denied=structuredClone(platform);delete denied.grants[registration]['artifacts.write'];write('denied-platform.json',denied);
 write('source.json',{sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim(),fixtureRevision:git('rev-parse','HEAD'),packageRoots:roots});
 console.log(JSON.stringify({status:'prepared',execution:false,root,sourceRevision:json(path.join(root,'source.json')).sourceRevision,next:'run'}));
}else if(operation==='run'){
 owned();assert(!fs.existsSync(path.join(root,'verification.json')),'Execution already occurred. Use verify or a new destination.');
 const platform=loadPlatformConfig(platformFile),definition=loadPipelineDefinition(path.join(root,'success.pipeline.json'));
 const validated=await validatePipelineRuntimeV2(platform,definition);write('validation.json',validated);
 let rejected;try{await validatePipelineRuntimeV2(loadPlatformConfig(path.join(root,'denied-platform.json')),definition);}catch(error){rejected=error.message;}
 assert(rejected&&/GRANT|CAPABILITY/i.test(rejected),`Missing grant did not produce a related admission rejection: ${rejected}`);assert(!fs.existsSync(platform.storageRoot)&&!fs.existsSync(artifactRoot)&&!fs.existsSync(telemetryRoot),'Admission must not create run, artifact, or telemetry state.');write('denied-admission.json',{rejected:true,error:rejected,execution:false});
 command([cli,'--platform',platformFile,'--pipeline',path.join(root,'success.pipeline.json'),'--run-id',successRun],'success-run',0);
 command([cli,'--platform',platformFile,'--pipeline',path.join(root,'blocked.pipeline.json'),'--run-id',blockedRun],'blocked-run',1);
 // Each synchronous CLI child exits before the next step.
 // The engine waits for adapter shutdown.
 // No other writer has authority for this private fixture.
 // Before audit, keep the full run and artifact trees.
 // FileJournal can repair an incomplete tail when it opens a journal.
 const raw=path.join(root,'raw-before-audit');fs.mkdirSync(raw);fs.cpSync(platform.storageRoot,path.join(raw,'state'),{recursive:true});fs.cpSync(artifactRoot,path.join(raw,'artifacts'),{recursive:true});fs.cpSync(telemetryRoot,path.join(raw,'telemetry'),{recursive:true});
 write('raw-tree.json',digestTree(raw));
 for(const [id,name]of [[successRun,'success'],[blockedRun,'blocked']]){
  records(path.join(runRoot(path.join(raw,'state'),id),'events.jsonl'));records(path.join(runRoot(path.join(raw,'state'),id),'effects.jsonl'));records(path.join(runRoot(path.join(raw,'state'),id),'observer-deliveries.jsonl'));records(path.join(runRoot(path.join(raw,'state'),id),'observer-checkpoints.jsonl'));
  command([cli,'--platform',platformFile,'--audit',id],`${name}-audit`,0);
 }
 assertDurableRecordReplay(json(path.join(raw,'telemetry/records/store.json')));
 const summary=await verify();write('verification.json',summary);console.log(JSON.stringify(summary));
}else if(operation==='verify'){
 owned();const expected=json(path.join(root,'verification.json')),actual=await verify();assert.deepEqual(actual,expected);console.log(JSON.stringify(actual));
}else if(operation==='cleanup'){
 owned();const expected=json(path.join(root,'verification.json'));assert.deepEqual(await verify(),expected);
 // Remove only a private root with its owned-journey.json marker after verification stops without an error.
 fs.rmSync(root,{recursive:true});assert(!fs.existsSync(root));console.log(JSON.stringify({status:'owned-fixture-removed',root,removedRuns:[successRun,blockedRun],externalResources:false}));
}else throw Error('The operation is unknown. Use prepare, run, verify, or cleanup.');

async function verify(){
 owned();const platform=loadPlatformConfig(platformFile),raw=path.join(root,'raw-before-audit');assert.deepEqual(digestTree(raw),json(path.join(root,'raw-tree.json')),'Preserved raw bytes changed');
 const output=json(path.join(root,'success-run.stdout')),bad=json(path.join(root,'blocked-run.stdout'));assert.equal(output.runId,successRun);assert.equal(output.status,'succeeded');assert.equal(bad.runId,blockedRun);assert.equal(bad.status,'blocked');
 const successAudit=json(path.join(root,'success-audit.stdout')),blockedAudit=json(path.join(root,'blocked-audit.stdout'));
 for(const [id,audit,terminal]of [[successRun,successAudit,'run.succeeded'],[blockedRun,blockedAudit,'run.blocked']]){
  const copied=runRoot(path.join(raw,'state'),id),log=records(path.join(copied,'events.jsonl'));
  assert.equal(audit.runId,id);assert.equal(audit.journalHead,log.at(-1).hash);assert.equal(audit.events.at(-1).type,terminal);
  const {digest,...unsigned}=audit;assert.equal(digest,sha256Text(canonicalJson(unsigned)));
  assert.deepEqual(audit.events.map(e=>e.sourceRecordHash),log.map(r=>r.hash));
 }
 const copied=runRoot(path.join(raw,'state'),successRun),log=records(path.join(copied,'events.jsonl')),snapshot=json(path.join(copied,'run-snapshot.json'));
 const projection=readRunEvidence({runId:successRun,journalHead:log.at(-1).hash,snapshotDigest:snapshot.digest},{storageRoot:path.join(raw,'state'),maximumBytes:8*1024**2,orchestratorIssuerId:platform.orchestratorIssuerId});
 assert.equal(projection.terminal,'run.succeeded');assert.equal(projection.artifacts.length,1);const ref=projection.artifacts[0];assert.equal(ref.namespace,'kubeclaw.delivery-lint');assert.equal(ref.artifactId,'delivery-lint:site');assert.equal(ref.producer.runId,successRun);assert.equal(ref.producer.stageId,stageId);
 const store=new FileDurableBlobStore(path.join(raw,'artifacts'),65536,1048576),bytes=await store.get(ref.digest);assert.equal(bytes.length,ref.sizeBytes);assert.equal(sha256Bytes(bytes),ref.digest);const report=JSON.parse(bytes);assert.equal(report.passed,true);assert.deepEqual(report.failures,[]);
 const rejected=blockedAudit.events.find(e=>e.type==='attempt.completed')?.payload.result;assert.equal(rejected?.outcome,'blocked');assert.equal(rejected.reason.code,'delivery_lint.path_invalid');
 const telemetry=verifyTelemetry(raw);
 const effects=records(path.join(runRoot(path.join(raw,'state'),blockedRun),'effects.jsonl'));assert(!effects.some(r=>r.entry.request?.capability==='git.repository.read'),'Blocked invalid path must not reach repository read');
 assert.equal(json(path.join(root,'denied-admission.json')).rejected,true);
 return {status:'verified-local-core-journey',successRun,successState:'succeeded',blockedRun,blockedState:'blocked',blockedReason:'delivery_lint.path_invalid',missingGrant:'rejected-before-execution',artifact:{namespace:ref.namespace,id:ref.artifactId,digest:ref.digest,sizeBytes:ref.sizeBytes,producer:ref.producer},journalHead:projection.journalHead,eventCount:projection.eventCount,effectsHead:projection.effectsHead,telemetry,persistence:'This journey uses filesystem run snapshots, event/effect/observer journals, artifact blob/metadata, and telemetry stores.',executionScope:'This journey executes one local shipped Delivery Lint stage. No project compiler, Forge, remote Buster, provider, build, cluster, or human acceptance is part of this journey.',rawBytesPreserved:true};
}

function verifyTelemetry(raw){
 const sink=json(path.join(raw,'telemetry/records/store.json'));assertDurableRecordReplay(sink);
 assert(sink.records.length>0,'Telemetry store is empty');
 const runs=[];const expectedAll=[];
 for(const id of [successRun,blockedRun]){
  const copied=runRoot(path.join(raw,'state'),id),snapshot=json(path.join(copied,'run-snapshot.json'));
  assert(snapshot.registry.enabledRegistrations.includes(telemetryObserver));
  const observer=snapshot.registry.registrations.observers.find(entry=>entry.registrationId===telemetryObserver);assert(observer);
  const selected=snapshot.registry.selectedProviders.find(entry=>entry.capability==='telemetry.emit');assert(selected);assert.equal(selected.provider.package.package.pluginId,'kubeclaw.telemetry-store');assert.equal(selected.provider.registrationId,'telemetry');
  const events=records(path.join(copied,'events.jsonl')).map(record=>record.entry).filter(event=>observer.registration.subscriptions.includes(event.type));
  const deliveries=records(path.join(copied,'observer-deliveries.jsonl')).map(record=>record.entry);
  const checkpoints=records(path.join(copied,'observer-checkpoints.jsonl')).map(record=>record.entry);
  const effects=records(path.join(copied,'effects.jsonl')).map(record=>record.entry);
  const stored=sink.records.filter(record=>record.owner===id);assert.equal(stored.length,events.length);assert.equal(deliveries.length,events.length*2);assert.equal(checkpoints.length,events.length);
  for(const [index,event]of events.entries()){
   const deliveryId=`delivery:${telemetryObserver}:${event.eventId}`;const key=`${deliveryId}:1`;
   const pair=deliveries.filter(delivery=>delivery.eventId===event.eventId);
   assert.deepEqual(pair.map(delivery=>delivery.status),['started','completed']);
   for(const delivery of pair){assert.equal(delivery.schemaVersion,'observer-delivery-record.v2');assert.equal(delivery.runId,id);assert.equal(delivery.observerId,telemetryObserver);assert.equal(delivery.deliveryId,deliveryId);assert.equal(delivery.eventSequence,event.sequence);assert.equal(delivery.attemptNumber,1);assert.equal(delivery.error,null);}
   const checkpoint=checkpoints[index];assert.equal(checkpoint.schemaVersion,'observer-checkpoint.v2');assert.equal(checkpoint.runId,id);assert.equal(checkpoint.eventId,event.eventId);assert.equal(checkpoint.sequence,event.sequence);assert.deepEqual(checkpoint.observer,observer.provenance);
   const matching=stored.filter(record=>record.idempotencyKey===key);assert.equal(matching.length,1);const record=matching[0];assert.equal(record.stream,'telemetry/plugin-events');
   const envelope=telemetryEnvelope({deliveryId,observer:observer.provenance,event});
   assert.deepEqual(record.payload,telemetryProjection(envelope,65536));
   const requested=effects.filter(entry=>entry.type==='requested'&&entry.request.idempotencyKey===key);assert.equal(requested.length,1);const request=requested[0].request;assert.equal(request.capability,'telemetry.emit');assert.equal(request.resource.canonicalId,event.type);assert.equal(request.attempt.runId,id);assert.deepEqual(request.payload,envelope);
   assert.equal(effects.filter(entry=>entry.type==='accepted'&&entry.request.idempotencyKey===key).length,1);
   const receipt=effects.filter(entry=>entry.type==='completed'&&entry.receipt.idempotencyKey===key);assert.equal(receipt.length,1);assert.equal(receipt[0].receipt.status,'completed');assert.equal(receipt[0].receipt.result.accepted,true);assert.equal(receipt[0].receipt.result.sequence,record.sequence);
   expectedAll.push(record.idempotencyKey);
  }
  assert(events.length>0);const terminal=events.at(-1);assert.equal(terminal.type,id===successRun?'run.succeeded':'run.blocked');
  assert.equal(checkpoints.at(-1).eventId,terminal.eventId);
  runs.push({runId:id,observedEvents:events.length,terminal:terminal.type,checkpointEventId:terminal.eventId,deliveryFailures:0,telemetryEffects:events.length});
 }
 assert.equal(sink.records.length,expectedAll.length);assert.equal(new Set(expectedAll).size,expectedAll.length);
 return {provider:telemetryProvider,observer:telemetryObserver,stream:'telemetry/plugin-events',records:sink.records.length,runs,scope:'This is only a same-run local projection. It is not Redis, a deployed collector, or canonical lifecycle authority.'};
}
