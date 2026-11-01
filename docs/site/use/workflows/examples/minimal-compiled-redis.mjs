#!/usr/bin/env node
// This helper executes one compiled graph through shipped Core, configured OpenClaw, and shipped Buster.
// The workflow guide uses one specified source revision for its recorded execution.
// That record is not an execution result for inputs from this source.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fixtureGit} from './minimal-redis-inspection.mjs';import {spawn,execFileSync,spawnSync} from 'node:child_process';
const installedSource=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const [requestedSource,operation,root,mode='healthy']=process.argv.slice(2);
assert.equal(fs.realpathSync(installedSource),installedSource,'Installed Source must be canonical');assert.equal(requestedSource,installedSource,'Explicit Source must equal this installed helper checkout');const sourceRoot=installedSource;
assert(process.argv.length>=5&&process.argv.length<=6&&['prepare','gateway-identities','runtime-identities','run','inspect','cleanup'].includes(operation),'Usage: node minimal-compiled-redis.mjs SOURCE prepare|gateway-identities|runtime-identities|run|inspect|cleanup /tmp/kubeclaw-reader-pipeline01 [healthy|redis-unreachable]');
assert(['healthy','redis-unreachable'].includes(mode));
assert(sourceRoot&&path.isAbsolute(sourceRoot)&&fs.realpathSync(sourceRoot)===sourceRoot,'Explicit actual immutable Source root required');
assert.equal(root,'/tmp/kubeclaw-reader-pipeline01');
assert(!process.env.PIPELINE01_SOURCE_ROOT||process.env.PIPELINE01_SOURCE_ROOT===sourceRoot,'No hidden different Source');
const minimal=path.join(sourceRoot,'docs/site/use/workflows/examples/minimal-project.mjs');
const canonical=path.join(sourceRoot,'docs/site/use/workflows/examples/minimal.pipeline.json');
assert.equal(fixtureGit(['rev-parse','--show-toplevel'],sourceRoot).trim(),sourceRoot,'Installed helper must belong to selected Source');
for(const relative of ['minimal-compiled-redis.mjs','minimal-redis-inspection.mjs','minimal-redis-verification.mjs'].map(name=>'docs/site/use/workflows/examples/'+name)){
 const file=path.join(sourceRoot,relative);assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink()&&fs.realpathSync(file)===file,'Operational helpers must be physical same-Source files');assert.equal(fixtureGit(['ls-files','--error-unmatch','--',relative],sourceRoot).trim(),relative,'Operational helpers must be tracked in selected Source');
}

for(const file of [minimal,canonical])assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink()&&fs.realpathSync(file)===file,'Physical Source helper/fixture required');
// The maintained helper owns Source/tracking/Git/marker/digest/canonical guards.
const guarded=op=>execFileSync(process.execPath,[minimal,op,root],{cwd:sourceRoot,env:process.env,encoding:'utf8',maxBuffer:16*1024*1024});
if(operation==='prepare'){process.stdout.write(guarded('prepare'));process.stdout.write(guarded('identities'));process.exit(0);}
const identityBytes=guarded('identities'),identities=JSON.parse(identityBytes);
const sourceRevision=JSON.parse(fs.readFileSync(path.join(root,'owned-compiled-project.json'))).sourceRevision;
const load=x=>JSON.parse(fs.readFileSync(x,'utf8')),read=n=>load(path.join(root,n));
const write=(n,x)=>fs.writeFileSync(path.join(root,n),JSON.stringify(x,null,2)+'\n');
const show=r=>({status:r.status,runId:r.runId,stageCount:r.stageCount,artifactCount:r.artifactCount,eventCount:r.eventCount,journalHead:r.journalHead,cleanup:r.cleanup});
const gitSource=()=>{guarded('identities');return sourceRevision;};
const fileDigest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function owned(){guarded('identities');return read('owned-compiled-project.json');}
const {verifyCompiledProject}=await import('./minimal-redis-verification.mjs');
function writeOnce(name,value){fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
function requiredEnv(name){assert(process.env[name],name+' is necessary');return process.env[name];}
function command(name,args){const out=spawnSync(process.execPath,args,{cwd:sourceRoot,env:process.env,encoding:'utf8',maxBuffer:16777216});write(name+'.command.json',{executable:process.execPath,args,exitCode:out.status});fs.writeFileSync(path.join(root,name+'.stdout'),out.stdout??'');fs.writeFileSync(path.join(root,name+'.stderr'),out.stderr??'');assert.equal(out.status,0,name+' failed. This helper keeps the original logs.');}
const {gatewaySelection,observeGatewayIdentity,assertGatewayObservation}=await import('./minimal-redis-inspection.mjs');
if(operation==='gateway-identities'){
 assert(!fs.existsSync(path.join(root,'gateway-runtime-identity.json')),'Existing registry observation retained; do not overwrite');
 const observation=await observeGatewayIdentity(gatewaySelection(load(canonical),process.env),requiredEnv('COMPILED_GATEWAY_TOKEN'));
 writeOnce('gateway-runtime-identity.json',{...observation,sourceRevision,canonicalSha256:fileDigest(canonical)});
 process.stdout.write(JSON.stringify(observation)+'\n');process.exit(0);
}
if(operation==='runtime-identities'){
 const {selectedRuntimeRegistryIdentities}=await import('./minimal-redis-inspection.mjs');
 const {runRoot}=await import(pathToFileURL(path.join(sourceRoot,'skills/nova/core/execution/run-root.ts')).href);
 const {readRunSnapshot,graphSnapshot}=await import(pathToFileURL(path.join(sourceRoot,'skills/nova/core/execution/engine-snapshots.ts')).href);
 const runId=read('project/project.json').runId,dir=runRoot(path.join(root,'raw-before-audit/state'),runId),original=runRoot(path.join(root,'compiled-state'),runId);
 assert.deepEqual(fs.readFileSync(path.join(dir,'run-snapshot.json')),fs.readFileSync(path.join(original,'run-snapshot.json')),'Retained run snapshot differs');
 const snapshot=readRunSnapshot(dir);assert.deepEqual(snapshot.graph,graphSnapshot(load(canonical)),'Frozen graph differs from canonical fixture');
 console.log(JSON.stringify({status:'FROZEN_SELECTED_RUNTIME_IDENTITIES_RESOLVED',runId,sourceRevision,snapshotDigest:snapshot.digest,canonicalSha256:fileDigest(canonical),...selectedRuntimeRegistryIdentities(snapshot,load(canonical))},null,2));process.exit(0);
}
const imp=x=>import(pathToFileURL(path.join(sourceRoot,x)).href);
const {loadProductionBusterRemotePlanRuntime}=await imp('skills/buster/engine/test-gates/production.ts');
const {loadPlatformConfig}=await imp('skills/common/plugin-runtime/foundation/config/platform.ts');
const {loadPipelineDefinition,validatePipelineRuntimeV2}=await imp('skills/nova/core/execution/engine.ts');

async function run(){
owned();assert(!fs.existsSync(path.join(root,'operational-dispatch.json')),'An attempt already exists; retain it, never redispatch');writeOnce('operational-dispatch.json',{sourceRoot,sourceRevision,operationalRunner:{path:fileURLToPath(import.meta.url),sha256:fileDigest(fileURLToPath(import.meta.url)),inspectionSHA256:fileDigest(path.join(path.dirname(fileURLToPath(import.meta.url)),'minimal-redis-inspection.mjs'))},mode,runId:read('project/project.json').runId,startedAt:new Date().toISOString(),identities,credentialsRetained:false});assert(!fs.existsSync(path.join(root,'compiled-run-result.json')),'There is a previous attempt. Keep the failure. Select a new owned destination.');
const project=load(path.join(root,'project/project.json'));
const p=load(path.join(root,'compiled-platform.local-providers.json'));
// These are symbolic configuration names. They are not authentication values.
const config={secretNames:{gateway:'a9906-gateway',buster:'a9906-buster',source:'a9906-source'}};
const key=crypto.generateKeyPairSync('ed25519');
const sourcePrivateKey=key.privateKey.export({type:'pkcs8',format:'pem'});
const sourcePublicKey=key.publicKey.export({type:'spki',format:'pem'});
const busterAuth=crypto.randomBytes(32).toString('hex');
const gatewayUrl=new URL(requiredEnv('COMPILED_GATEWAY_ENDPOINT'));
assert(['http:','https:'].includes(gatewayUrl.protocol)&&!gatewayUrl.username&&!gatewayUrl.password&&!gatewayUrl.hash&&!gatewayUrl.search,'Invalid gateway URL');
assert(gatewayUrl.protocol==='https:'||['127.0.0.1','[::1]'].includes(gatewayUrl.hostname),'For a remote Gateway, HTTPS is necessary. Use HTTP only for literal loopback.');
const redisUrl=new URL(requiredEnv('PIPELINE01_REDIS_URL'));
assert(redisUrl.protocol==='redis:'&&redisUrl.hostname==='127.0.0.1'&&redisUrl.port&&!redisUrl.username&&!redisUrl.password&&!redisUrl.search&&!redisUrl.hash&&redisUrl.pathname==='','Owned literal loopback Redis URL only');
const redisPassword=requiredEnv('PIPELINE01_REDIS_AUTH');delete process.env.PIPELINE01_REDIS_AUTH;
const gatewayAuth=requiredEnv('COMPILED_GATEWAY_TOKEN');delete process.env.COMPILED_GATEWAY_TOKEN;
const agentId=requiredEnv('COMPILED_AGENT_ID'),model=requiredEnv('COMPILED_MODEL');
assert.equal(load(path.join(root,'local/source.json')).sourceRevision,sourceRevision);
const busterEnvironment={KUBECLAW_BUILD_REVISION:sourceRevision,A9906_BUSTER_AUTH:busterAuth,A9906_SOURCE_PUBLIC:sourcePublicKey};
const home=path.join(root,'core-home'),temporary=path.join(root,'core-tmp');fs.mkdirSync(home);fs.mkdirSync(temporary);
const coreEnvironment={PATH:process.env.PATH,HOME:home,TMPDIR:temporary,LANG:'C.UTF-8',A9906_GATEWAY_AUTH:gatewayAuth,A9906_BUSTER_AUTH:busterAuth,A9906_SOURCE_PRIVATE:sourcePrivateKey,PIPELINE01_REDIS_AUTH:redisPassword};
const pluginRoot=path.join(sourceRoot,'skills/buster/plugins');
write('buster-platform.json',{schemaVersion:'pipeline-platform.v2',installationRoots:[pluginRoot],trustedBuiltinRoots:[pluginRoot],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{},grants:{},adapters:{},activeAdapters:[],observers:{},storageRoot:path.join(root,'buster-platform-state'),shutdownTimeoutMs:5000,orchestratorIssuerId:'local:documentation',administrativeDecisionIssuers:[]});
write('buster-runtime.json',{schemaVersion:'buster-remote-plan-runtime.v1',platformConfig:path.join(root,'buster-platform.json'),host:'127.0.0.1',port:0,tokenEnvironmentVariable:'A9906_BUSTER_AUTH',sourceAttestationPublicKeyEnvironmentVariable:'A9906_SOURCE_PUBLIC',trustedSourceAuthority:'local:documentation',stateRoot:path.join(root,'buster-state'),runtimeRoot:path.join(root,'buster-runs'),tarExecutable:'/usr/bin/tar',maximumArchiveBytes:4*1024*1024,maximumExtractedBytes:16*1024*1024,maximumResultBytes:16*1024*1024,maximumResultStoreBytes:64*1024*1024,maximumRequestBytes:2*1024*1024,maximumResponseBytes:2*1024*1024,shutdownTimeoutMs:5000,recordLimits:{maximumRecords:1000,maximumBytes:64*1024*1024,maximumRecordBytes:16*1024*1024},allowedCapabilities:['command.execute'],directCommand:{executableCatalog:{node:process.execPath},executableSearchPath:[path.dirname(process.execPath)],runtimeReadRoots:[path.dirname(process.execPath),'/lib/x86_64-linux-gnu','/lib64','/etc/ssl'],maximumOutputBytes:1048576,maximumExecutionMs:30000,maximumProcesses:16,maximumMemoryBytes:536870912,maximumCpuMillis:30000,terminationGraceMs:1000,allowSampledProcessLimit:true}});
let service;
try {
 assert(!fs.existsSync(path.join(root,'buster-state'))&&!fs.existsSync(path.join(root,'buster-runs')),'Own fresh Buster store only; never reuse jobs');write('buster-local-source-custody.json',{stateRoot:path.join(root,'buster-state'),runtimeRoot:path.join(root,'buster-runs'),absentBeforeStart:true,scope:'Actual shipped production localruntime, not configuredcentralservice census. Local HTTP API exposes noGETcollection; no invented census request.'});
 service=loadProductionBusterRemotePlanRuntime(path.join(root,'buster-runtime.json'),busterEnvironment);
 const a=await service.start();const buster=`http://127.0.0.1:${a.port}`;const gw=gatewayUrl.origin;

 p.providers['runtime.dispatch']='kubeclaw.runtime-dispatch:openclaw';p.providers['test.plan.execute']='kubeclaw.remote-test-gate:plan';p.providers['secrets.read']='kubeclaw.secret-resolver:secrets';p.providers['network.http']='kubeclaw.network-http:http';
 p.adapters['kubeclaw.secret-resolver:secrets']={environment:{'a9906-gateway':'A9906_GATEWAY_AUTH','a9906-buster':'A9906_BUSTER_AUTH','a9906-source':'A9906_SOURCE_PRIVATE','pipeline01.redis':'PIPELINE01_REDIS_AUTH'}};
 p.adapters['kubeclaw.network-http:http']={allowedOrigins:[gw],allowedMethods:['POST'],allowedHeaders:['accept','content-type','authorization','idempotency-key'],maxRequestBytes:1048576,maxResponseBytes:1048576,timeoutMs:30000};
 p.adapters['kubeclaw.runtime-dispatch:openclaw']={targets:{forge:{endpoint:gatewayUrl.href,tokenSecret:config.secretNames.gateway,runtime:'subagent',agentId,model,cwd:project.repositoryRoot,repositoryRoot:project.repositoryRoot,workspaceRoot:project.workspaceRoot,resultPathPrefix:'.kubeclaw-results',sessionTimeoutMs:300000,maxPolls:300}}};
 p.grants['kubeclaw.runtime-dispatch:openclaw']={'git.repository.read':{allowedPrefixes:['README.md','modules/app','app']},'network.http':{allowedOrigins:[gw]},'secrets.read':{allowedNames:['a9906-gateway']}};
 p.adapters['kubeclaw.remote-test-gate:plan']={endpoint:buster,authentication:'bearer',tokenSecret:config.secretNames.buster,sourcePrivateKeySecret:config.secretNames.source,sourceAuthority:'local:documentation',stateRoot:path.join(root,'nova-test-state'),allowedRepositoryRoots:[project.repositoryRoot]};
 p.grants['kubeclaw.remote-test-gate:plan']={'secrets.read':{allowedNames:['a9906-buster','a9906-source']}};
 delete p.adapters['kubeclaw.telemetry-store:telemetry'];
 p.providers['telemetry.emit']='kubeclaw.redis-transport:telemetry';
 p.adapters['kubeclaw.redis-transport:telemetry']={url:redisUrl.href,passwordSecret:'pipeline01.redis',streamPrefix:'reader-pipeline01',maxLen:10000,dedupTtlMs:60000,timeoutMs:1000};
 p.grants['kubeclaw.redis-transport:telemetry']={'secrets.read':{allowedNames:['pipeline01.redis']}};
 const telemetryManifest=load(path.join(sourceRoot,'skills/common/plugins/telemetry-observer/plugin.json'));
 const telemetry=telemetryManifest.observers.find(o=>o.id==='telemetry');
 p.observers['kubeclaw.telemetry-observer:telemetry']={};
 p.grants['kubeclaw.telemetry-observer:telemetry']={'telemetry.emit':{allowedEventPrefixes:telemetry.subscriptions}};
 write('redis-observer-selection.json',{provider:'kubeclaw.redis-transport:telemetry',observer:'kubeclaw.telemetry-observer:telemetry',url:redisUrl.href,failurePolicy:telemetry.failurePolicy,secretValueRetained:false,scope:'Selection only; actual Redis streams and same-run observer journals require separate retained verification.'});
 write('compiled-platform.complete.json',p);
 const compiledPath=canonical;const before=fs.readFileSync(compiledPath);assert.deepEqual(before,fs.readFileSync(path.join(root,'project/compiled.json')),'Do not change canonical pipeline bytes');const admitted=await validatePipelineRuntimeV2(loadPlatformConfig(path.join(root,'compiled-platform.complete.json')),loadPipelineDefinition(compiledPath));
 if(!before.equals(fs.readFileSync(compiledPath)))throw Error('COMPILED_INPUT_CHANGED');
 write('complete-platform-admission.json',{status:'admitted',...admitted,compiledBytesUnchanged:true,execution:false,busterService:'The shipped production runtime has an ephemeral loopback listener.',isolationScope:'The direct-command mode uses allowSampledProcessLimit:true. It is not cgroup isolation acceptance.',productSessionsSpawned:'No product session starts during admission.'});console.log(JSON.stringify(admitted));
 {
  const args=[path.join(sourceRoot,'skills/nova/core/cli.ts'),'--platform',path.join(root,'compiled-platform.complete.json'),'--pipeline',compiledPath,'--run-id',project.runId];
  write('compiled-run-command.json',{executable:process.execPath,args,compiledSha256:crypto.createHash('sha256').update(before).digest('hex')});
  const out=fs.openSync(path.join(root,'compiled-run.stdout'),'w');const err=fs.openSync(path.join(root,'compiled-run.stderr'),'w');
  const child=spawn(process.execPath,args,{cwd:sourceRoot,env:coreEnvironment,stdio:['ignore',out,err]});
  const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});fs.closeSync(out);fs.closeSync(err);
  write('compiled-run-result.json',{exitCode,compiledBytesUnchanged:before.equals(fs.readFileSync(compiledPath)),runId:project.runId});console.log(JSON.stringify({runExitCode:exitCode}));if(mode==='healthy')assert.equal(exitCode,0,'Healthy Core failed; retain original failure');
 }

} finally {try{if(service)await service.stop();}finally{delete coreEnvironment.PIPELINE01_REDIS_AUTH;delete coreEnvironment.A9906_SOURCE_PRIVATE;delete coreEnvironment.A9906_BUSTER_AUTH;delete coreEnvironment.A9906_GATEWAY_AUTH;delete busterEnvironment.A9906_BUSTER_AUTH;delete busterEnvironment.A9906_SOURCE_PUBLIC;}}

}

function rawManifest(){const result=[];const walk=(dir,rel='')=>{for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name),r=path.join(rel,name),s=fs.lstatSync(p);assert(!s.isSymbolicLink(),'Symlink in raw evidence');if(s.isDirectory())walk(p,r);else{assert(s.isFile());const b=fs.readFileSync(p);result.push({path:r,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}}};walk(path.join(root,'raw-before-audit'));return result;}
function audit(successRequired=true){
 const raw=path.join(root,'raw-before-audit');if(!fs.existsSync(raw)){fs.mkdirSync(raw);fs.cpSync(path.join(root,'compiled-state'),path.join(raw,'state'),{recursive:true});fs.cpSync(path.join(root,'local/artifacts'),path.join(raw,'artifacts'),{recursive:true});write('raw-tree.json',rawManifest());}else assert.deepEqual(rawManifest(),read('raw-tree.json'),'Retained preaudit bytes changed');
 const args=[process.execPath,path.join(sourceRoot,'skills/nova/core/cli.ts'),'--platform',path.join(root,'compiled-platform.complete.json'),'--audit',read('project/project.json').runId];
 const quote=x=>"'"+x.replaceAll("'", "'\\''")+"'";
 const auditArgs=['-q','-e','-c',args.map(quote).join(' '),'/dev/null'];const x=spawnSync('/usr/bin/script',auditArgs,{cwd:sourceRoot,encoding:'utf8',maxBuffer:16777216});write('compiled-audit-pty-command.json',{executable:'/usr/bin/script',args:auditArgs,exitCode:x.status});fs.writeFileSync(path.join(root,'compiled-audit-pty.stdout'),x.stdout??'');fs.writeFileSync(path.join(root,'compiled-audit-pty.stderr'),x.stderr??'');assert.equal(x.status,0,'Audit failed');JSON.parse(x.stdout);assert.deepEqual(rawManifest(),read('raw-tree.json'));
 if(!successRequired){const report=read('compiled-audit-pty.stdout');return {status:'native-partial-journal-audit-read',runId:report.runId,journalHead:report.journalHead,events:report.events.length,authoritativeTerminal:null};}
 const result=verifyCompiledProject(root,sourceRoot);return result;
}
let casePassword=process.env.PIPELINE01_REDIS_AUTH;
const {inspectRedisCase,probeRedisBeforeRun,exportOwnedEvidence,assertNoActiveUsers}=await import('./minimal-redis-inspection.mjs');
if(operation==='run'){
 assert(!fs.existsSync(path.join(root,'operational-dispatch.json')),'Existing attempt retained; use inspect/cleanup, never rerun');
 owned();assertGatewayObservation(read('gateway-runtime-identity.json'),gatewaySelection(load(canonical),process.env),sourceRevision,fileDigest(canonical));const bin=requiredEnv('COMPILED_TOOLS_BIN');assert(path.isAbsolute(bin));process.env.PATH=bin+':'+path.join(sourceRoot,'node_modules/.bin')+':'+process.env.PATH;
 const {loadLintPolicy}=await imp('skills/nova/plugins/lint/src/engine/policy.ts');loadLintPolicy(path.join(root,'project/operator-selected-lint-policy.json'));
 await probeRedisBeforeRun({root,mode,password:casePassword});
 let error;try{await run();}catch(e){error=e;}
 // Retain failed as well as successful real bytes before audit/inspection. Never rewrite canonical records.
 if(fs.existsSync(path.join(root,'compiled-state'))&&!fs.existsSync(path.join(root,'raw-before-audit'))){
  fs.mkdirSync(path.join(root,'raw-before-audit'));fs.cpSync(path.join(root,'compiled-state'),path.join(root,'raw-before-audit/state'),{recursive:true});
  if(fs.existsSync(path.join(root,'local/artifacts')))fs.cpSync(path.join(root,'local/artifacts'),path.join(root,'raw-before-audit/artifacts'),{recursive:true});write('raw-tree.json',rawManifest());
 }
 if(!error){ // Existing native Core+artifact verifier remains the healthy owner.
  try{const audited=await audit(mode==='healthy');console.log(JSON.stringify(mode==='healthy'?show(audited):audited));}catch(e){error=e;}
 }
 const result=await inspectRedisCase({root,sourceRoot,mode,identities,password:casePassword});write('redis-case-inspection.json',result);console.log(JSON.stringify(result));
 if(error)throw error;assert.notEqual(result.status,'NOT_QUALIFIED_REDIS_FAULT_OTHER_CORE_OUTCOME','Other Core outcome retained; Redis-only case not qualified');
}
if(operation==='inspect'){owned();const result=await inspectRedisCase({root,sourceRoot,mode,identities,password:casePassword});console.log(JSON.stringify(result));assert.notEqual(result.status,'NOT_QUALIFIED_REDIS_FAULT_OTHER_CORE_OUTCOME','Other Core outcome is not qualified');}
if(operation==='cleanup'){
 owned();assertNoActiveUsers(root);const result=await inspectRedisCase({root,sourceRoot,mode,identities,password:casePassword});assert.notEqual(result.status,'NOT_QUALIFIED_REDIS_FAULT_OTHER_CORE_OUTCOME','Keep other Core outcome for owner');
 const repo=path.join(root,'project/repository');const worktrees=fixtureGit(['worktree','list','--porcelain'],repo);assert.equal(worktrees.split('\n').filter(x=>x.startsWith('worktree ')).length,1);
 assert.equal(fixtureGit(['status','--porcelain'],repo).trim(),'','Fixture dirty; retain it');
 await exportOwnedEvidence({root,sourceRoot,mode,result,destination:requiredEnv('PIPELINE01_EVIDENCE_EXPORT')});assertNoActiveUsers(root);fs.rmSync(root,{recursive:true});console.log(JSON.stringify({status:'owned-exported-cleanup',root,sourceRoot,sourceRevision,mode}));
}
