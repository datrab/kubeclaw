#!/usr/bin/env node
/** Maintained local Core CLI journey. Uses shipped packages and durable stores, never a mock runner. */
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
import {FileDurableBlobStore} from '../../../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import {canonicalJson,sha256Text,sha256Bytes} from '../../../../../skills/common/plugin-runtime/sdk/src/index.ts';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const [operation,destination]=process.argv.slice(2);
assert.equal(process.argv.length,4,'Usage: node docs/site/use/workflows/examples/local-core.mjs prepare|run|verify|cleanup NEW_ABSOLUTE_DIRECTORY');
assert(destination&&path.isAbsolute(destination)&&path.normalize(destination)===destination&&destination!=='/','Select one normalized absolute disposable directory');
const root=destination;
const markerFile=path.join(root,'owned-journey.json');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(path.join(root,file),`${JSON.stringify(value,null,2)}\n`,{flag:'wx',mode:0o600});
function pins(directory){let cursor=path.parse(directory).root;for(const part of directory.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);const s=fs.lstatSync(cursor);assert(s.isDirectory()&&!s.isSymbolicLink(),`Unsafe directory: ${cursor}`);}}
function owned(){pins(root);const marker=json(markerFile);assert.equal(marker.schemaVersion,'local-core-journey.v1');assert.equal(marker.root,root);assert.equal(marker.sourceRoot,sourceRoot);assert.equal(marker.uid,process.getuid?.()??null);const selected=json(path.join(root,'source.json')).sourceRevision;const current=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();assert.equal(current,selected,'Source revision changed; preserve fixture and stop');return marker;}
function records(file){const result=[];parseJournalRecords(fs.readFileSync(file),result,file);assert(result.length>0,'Empty journal');return result;}
function files(directory,prefix=''){return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{const relative=path.join(prefix,entry.name),file=path.join(directory,entry.name);assert(!entry.isSymbolicLink(),`Unexpected symlink: ${file}`);return entry.isDirectory()?files(file,relative).map(x=>({...x,file:path.join(entry.name,x.file)})):[{file:entry.name,bytes:fs.statSync(file).size,digest:sha256Bytes(fs.readFileSync(file))}];});}
function digestTree(directory){return files(directory);}
function command(args,name,expected){
 const result=spawnSync(process.execPath,args,{cwd:sourceRoot,encoding:'utf8',timeout:60000,maxBuffer:8*1024**2});
 fs.writeFileSync(path.join(root,`${name}.stdout`),result.stdout??'',{flag:'wx'});
 fs.writeFileSync(path.join(root,`${name}.stderr`),result.stderr??'',{flag:'wx'});
 write(`${name}.command.json`,{command:[process.execPath,...args],exitCode:result.status,signal:result.signal,error:result.error?.message??null});
 assert(!result.error&&!result.signal,`${name}: process failure; inspect retained output`);assert.equal(result.status,expected,`${name}: unexpected exit; inspect retained stdout/stderr`);return result;
}
const platformFile=path.join(root,'platform.json');
const cli=path.join(sourceRoot,'skills/nova/core/cli.ts');
const stageId='delivery';const registration='kubeclaw.delivery-lint:delivery-lint';
const successRun='run:local-core-success',blockedRun='run:local-core-blocked';
const artifactRoot=path.join(root,'artifacts');
function graph(id,input){return {schemaVersion:'pipeline-definition.v2',id,maxConcurrency:1,stages:[{id:stageId,type:'kubeclaw.lint.delivery',dependsOn:[],config:{},input,execution:{maxAttempts:1,maxRemediationCycles:0,maxTechnicalRetries:0,timeoutMs:10000}}]};}
if(operation==='prepare'){
 assert(!fs.existsSync(root),'Destination exists; never reuse a partial/unknown directory');pins(path.dirname(root));
 assert.equal(process.versions.node.split('.')[0],'24','Use Node24');
 const flock=spawnSync('/usr/bin/flock',['--help'],{encoding:'utf8'});assert.equal(flock.status,0);assert((flock.stdout+flock.stderr).includes('--timeout'),'Absolute GNU flock with --timeout required');
 fs.mkdirSync(root,{mode:0o700});write('owned-journey.json',{schemaVersion:'local-core-journey.v1',root,sourceRoot,uid:process.getuid?.()??null,createdAt:new Date().toISOString()});
 const repositoryRoot=path.join(root,'repository');fs.mkdirSync(repositoryRoot);fs.writeFileSync(path.join(repositoryRoot,'Dockerfile'),'FROM scratch\nCOPY site/ /srv/site/\n');fs.mkdirSync(path.join(repositoryRoot,'site'));fs.writeFileSync(path.join(repositoryRoot,'site/index.html'),'<h1>Local delivery declaration</h1>\n');
 const git=(...args)=>execFileSync('git',['-C',repositoryRoot,...args],{encoding:'utf8'}).trim();git('init','-q');git('add','.');git('-c','user.name=Documentation Journey','-c','user.email=journey@example.invalid','commit','-qm','Local delivery fixture');
 const roots=['skills/nova/plugins','skills/common/plugins'].map(f=>path.join(sourceRoot,f));
 const platform={schemaVersion:'pipeline-platform.v2',storageRoot:path.join(root,'state'),installationRoots:roots,trustedBuiltinRoots:roots,externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'git.repository.read':'kubeclaw.repository-adapter:repository','artifacts.write':'kubeclaw.artifact-store:artifact-store'},grants:{[registration]:{'git.repository.read':{allowedPrefixes:['Dockerfile']},'artifacts.write':{allowedNamespaces:['kubeclaw.delivery-lint']}}},adapters:{'kubeclaw.repository-adapter:repository':{repositoryRoot,expectedHead:git('rev-parse','HEAD'),maxFileBytes:65536},'kubeclaw.artifact-store:artifact-store':{artifactRoot,maxArtifactBytes:65536,maximumRecords:100,maximumStoreBytes:1048576}},activeAdapters:[],observers:{},shutdownTimeoutMs:1000,orchestratorIssuerId:'local:operator',administrativeDecisionIssuers:[]};
 write('platform.json',platform);write('success.pipeline.json',graph('pipeline:local-delivery',{moduleId:'site',dockerfile:'Dockerfile',staticPath:'/srv/site/'}));
 write('blocked.pipeline.json',graph('pipeline:local-invalid-path',{moduleId:'site',dockerfile:'../outside/Dockerfile',staticPath:'/srv/site/'}));
 const denied=structuredClone(platform);delete denied.grants[registration]['artifacts.write'];write('denied-platform.json',denied);
 write('source.json',{sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim(),fixtureRevision:git('rev-parse','HEAD'),packageRoots:roots});
 console.log(JSON.stringify({status:'prepared',execution:false,root,sourceRevision:json(path.join(root,'source.json')).sourceRevision,next:'run'}));
}else if(operation==='run'){
 owned();assert(!fs.existsSync(path.join(root,'verification.json')),'Already executed; use verify or a new destination');
 const platform=loadPlatformConfig(platformFile),definition=loadPipelineDefinition(path.join(root,'success.pipeline.json'));
 const validated=await validatePipelineRuntimeV2(platform,definition);write('validation.json',validated);
 let rejected;try{await validatePipelineRuntimeV2(loadPlatformConfig(path.join(root,'denied-platform.json')),definition);}catch(error){rejected=error.message;}
 assert(rejected&&/GRANT|CAPABILITY/i.test(rejected),`Missing grant did not produce a relevant admission rejection: ${rejected}`);assert(!fs.existsSync(platform.storageRoot)&&!fs.existsSync(artifactRoot),'Admission must not have created run/artifact state');write('denied-admission.json',{rejected:true,error:rejected,execution:false});
 command([cli,'--platform',platformFile,'--pipeline',path.join(root,'success.pipeline.json'),'--run-id',successRun],'success-run',0);
 command([cli,'--platform',platformFile,'--pipeline',path.join(root,'blocked.pipeline.json'),'--run-id',blockedRun],'blocked-run',1);
 // Each synchronous CLI child has exited; adapter shutdown is awaited by the real engine.
 // No other writer is authorized for this private fixture. Preserve the complete run and
 // artifact trees before calling audit, whose FileJournal open can repair an incomplete tail.
 const raw=path.join(root,'raw-before-audit');fs.mkdirSync(raw);fs.cpSync(platform.storageRoot,path.join(raw,'state'),{recursive:true});fs.cpSync(artifactRoot,path.join(raw,'artifacts'),{recursive:true});
 write('raw-tree.json',digestTree(raw));
 for(const [id,name]of [[successRun,'success'],[blockedRun,'blocked']]){
  records(path.join(runRoot(path.join(raw,'state'),id),'events.jsonl'));records(path.join(runRoot(path.join(raw,'state'),id),'effects.jsonl'));
  command([cli,'--platform',platformFile,'--audit',id],`${name}-audit`,0);
 }
 const summary=await verify();write('verification.json',summary);console.log(JSON.stringify(summary));
}else if(operation==='verify'){
 owned();const expected=json(path.join(root,'verification.json')),actual=await verify();assert.deepEqual(actual,expected);console.log(JSON.stringify(actual));
}else if(operation==='cleanup'){
 owned();const expected=json(path.join(root,'verification.json'));assert.deepEqual(await verify(),expected);
 // Only a successfully verified, explicitly prepared private root can be removed.
 fs.rmSync(root,{recursive:true});assert(!fs.existsSync(root));console.log(JSON.stringify({status:'owned-fixture-removed',root,removedRuns:[successRun,blockedRun],externalResources:false}));
}else throw Error('Unknown operation: prepare, run, verify or cleanup required');

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
 const effects=records(path.join(runRoot(path.join(raw,'state'),blockedRun),'effects.jsonl'));assert(!effects.some(r=>r.entry.request?.capability==='git.repository.read'),'Blocked invalid path must not reach repository read');
 assert.equal(json(path.join(root,'denied-admission.json')).rejected,true);
 return {status:'verified-local-core-journey',successRun,successState:'succeeded',blockedRun,blockedState:'blocked',blockedReason:'delivery_lint.path_invalid',missingGrant:'rejected-before-execution',artifact:{namespace:ref.namespace,id:ref.artifactId,digest:ref.digest,sizeBytes:ref.sizeBytes,producer:ref.producer},journalHead:projection.journalHead,eventCount:projection.eventCount,effectsHead:projection.effectsHead,persistence:'real filesystem run snapshots,event/effect journals and artifact blob/metadata stores',executionScope:'one local shipped Delivery Lint stage; no project compiler,Forge,remote Buster,provider,build,cluster or human acceptance',rawBytesPreserved:true};
}
