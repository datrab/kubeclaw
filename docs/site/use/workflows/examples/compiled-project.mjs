#!/usr/bin/env node
// One actual compiled graph through real Core, configured OpenClaw and shipped Buster.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn,execFileSync,spawnSync} from 'node:child_process';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const operation=process.argv[2],root=process.argv[3];
assert(process.argv.length===4&&['prepare','run','verify','cleanup'].includes(operation),'Usage: node compiled-project.mjs prepare|run|verify|cleanup NEW_ABSOLUTE_DIRECTORY');
assert(root&&path.isAbsolute(root)&&path.normalize(root)===root&&root!=='/'&&root!==sourceRoot&&!sourceRoot.startsWith(root+path.sep)&&!root.startsWith(sourceRoot+path.sep),'Unsafe fixture path');
for(let x=path.dirname(root);;x=path.dirname(x)){assert(!fs.lstatSync(x).isSymbolicLink(),'Symlinked ancestor');if(x===path.dirname(x))break;}
assert.equal(Number(process.versions.node.split('.')[0]),24,'Node24 required');
for(const executable of ['/usr/bin/git','/usr/bin/tar','/usr/bin/script','/usr/bin/flock'])fs.accessSync(executable,fs.constants.X_OK);
const load=x=>JSON.parse(fs.readFileSync(x,'utf8')),read=n=>load(path.join(root,n));
const write=(n,x)=>fs.writeFileSync(path.join(root,n),JSON.stringify(x,null,2)+'\n');
const show=r=>({status:r.status,runId:r.runId,stageCount:r.stageCount,artifactCount:r.artifactCount,eventCount:r.eventCount,journalHead:r.journalHead,cleanup:r.cleanup});
function cleanSource(){
 const status=execFileSync('/usr/bin/git',['status','--porcelain','--untracked-files=all'],{cwd:sourceRoot,encoding:'utf8'}).trim();
 assert.equal(status,'','Selected Source checkout is dirty; preserve it and stop');
 return execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();
}
const gitSource=()=>cleanSource();
// Check before importing any product/runtime module, including the verifier.
cleanSource();
const {verifyCompiledProject}=await import('./compiled-project-verification.mjs');
const fileDigest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function owned(){assert(!fs.lstatSync(root).isSymbolicLink());const m=read('owned-compiled-project.json');assert.equal(m.schemaVersion,'compiled-project-journey.v1');assert.equal(m.root,root);assert.equal(m.sourceRoot,sourceRoot);assert.equal(m.sourceRevision,gitSource(),'Selected Source changed');assert.equal(m.uid,process.getuid?.()??null);for(const name of ['project.json','compiled.json'])assert.equal(fileDigest(path.join(root,'project',name)),m.preparedInputDigests[name],'Prepared compiler input/output changed: '+name);return m;}
function requiredEnv(name){assert(process.env[name],name+' required');return process.env[name];}
function command(name,args){const out=spawnSync(process.execPath,args,{cwd:sourceRoot,env:process.env,encoding:'utf8',maxBuffer:16777216});write(name+'.command.json',{executable:process.execPath,args,exitCode:out.status});fs.writeFileSync(path.join(root,name+'.stdout'),out.stdout??'');fs.writeFileSync(path.join(root,name+'.stderr'),out.stderr??'');assert.equal(out.status,0,name+' failed; original logs retained');}
const imp=x=>import(pathToFileURL(path.join(sourceRoot,x)).href);
const {loadProductionBusterRemotePlanRuntime}=await imp('skills/buster/engine/test-gates/production.ts');
const {loadPlatformConfig}=await imp('skills/common/plugin-runtime/foundation/config/platform.ts');
const {loadPipelineDefinition,validatePipelineRuntimeV2}=await imp('skills/nova/core/execution/engine.ts');
function prepare(){
 assert(!fs.existsSync(root),'Destination must not exist');fs.mkdirSync(root,{mode:0o700});
 write('owned-compiled-project.json',{schemaVersion:'compiled-project-journey.v1',root,sourceRoot,sourceRevision:gitSource(),uid:process.getuid?.()??null});
 command('prepare-project',[path.join(sourceRoot,'docs/site/use/workflows/examples/compiled-project-input.mjs'),path.join(root,'project')]);
 const marker=read('owned-compiled-project.json');marker.preparedInputDigests=Object.fromEntries(['project.json','compiled.json'].map(name=>[name,fileDigest(path.join(root,'project',name))]));write('owned-compiled-project.json',marker);
 const project=read('project/project.json');fs.mkdirSync(path.join(root,'local'));write('local/source.json',{sourceRevision:gitSource()});
 const template={"schemaVersion": "pipeline-platform.v2", "storageRoot": "__FIXTURE__/compiled-state", "installationRoots": ["__SOURCE__/skills/nova/plugins", "__SOURCE__/skills/common/plugins"], "trustedBuiltinRoots": ["__SOURCE__/skills/nova/plugins", "__SOURCE__/skills/common/plugins"], "externalTrust": {"allowedSourceDigests": {}, "verifiedAttestations": {}}, "providers": {"git.repository.read": "kubeclaw.repository-adapter:repository", "artifacts.write": "kubeclaw.artifact-store:artifact-store", "telemetry.emit": "kubeclaw.telemetry-store:telemetry", "git.sync": "kubeclaw.git-workspace:git", "git.commit": "kubeclaw.git-workspace:git", "git.merge": "kubeclaw.git-workspace:git", "git.workspace.create": "kubeclaw.git-workspace:git", "git.workspace.remove": "kubeclaw.git-workspace:git", "state.append": "kubeclaw.state-store:state", "lint.execute": "kubeclaw.lint:executor", "artifacts.read": "kubeclaw.artifact-store:artifact-store"}, "grants": {"kubeclaw.preflight-contract:source": {"git.repository.read": {"allowedPrefixes": ["README.md", "modules/app", "app"]}, "artifacts.write": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}}, "kubeclaw.project-summary:summary": {"artifacts.read": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}, "artifacts.write": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}}, "kubeclaw.blueprint-sync:sync": {"git.sync": {"allowedRoots": ["__FIXTURE__/project/repository", "__FIXTURE__/project/workspaces"]}, "git.commit": {"allowedRoots": ["__FIXTURE__/project/repository", "__FIXTURE__/project/workspaces"]}, "state.append": {"allowedNamespaces": ["kubeclaw.blueprint-sync"]}, "artifacts.write": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}, "artifacts.read": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}}, "kubeclaw.implementation-agent:implementation": {"runtime.dispatch": {"allowedAgents": ["forge"]}, "git.workspace.create": {"allowedRoots": ["__FIXTURE__/project/repository"], "allowedWorkspaceRoots": ["__FIXTURE__/project/workspaces"]}, "git.workspace.remove": {"allowedRoots": ["__FIXTURE__/project/repository"], "allowedWorkspaceRoots": ["__FIXTURE__/project/workspaces"]}, "git.commit": {"allowedRoots": ["__FIXTURE__/project/repository", "__FIXTURE__/project/workspaces"]}, "git.merge": {"allowedRoots": ["__FIXTURE__/project/repository", "__FIXTURE__/project/workspaces"]}, "artifacts.read": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}, "artifacts.write": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}}, "kubeclaw.buster-quality-gate:quality": {"test.plan.execute": {"allowedRoots": ["__FIXTURE__/project/repository"]}, "runtime.dispatch": {"allowedAgents": ["forge"]}, "artifacts.write": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}, "artifacts.read": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}}, "kubeclaw.lint:full": {"lint.execute": {"allowedProjects": ["first-project"], "allowedRoots": ["__FIXTURE__/project/repository"], "allowedPolicyRoots": ["__FIXTURE__/project"]}, "artifacts.write": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}, "artifacts.read": {"allowedNamespaces": ["kubeclaw.preflight-contract", "kubeclaw.blueprint-sync", "kubeclaw.implementation-agent", "kubeclaw.lint", "kubeclaw.buster-quality-gate", "kubeclaw.project-summary"]}}}, "adapters": {"kubeclaw.repository-adapter:repository": {"repositoryRoot": "__FIXTURE__/project/repository", "expectedHead": "__BASE__", "maxFileBytes": 65536}, "kubeclaw.artifact-store:artifact-store": {"artifactRoot": "__FIXTURE__/local/artifacts", "maxArtifactBytes": 65536, "maximumRecords": 100, "maximumStoreBytes": 1048576}, "kubeclaw.telemetry-store:telemetry": {"root": "__FIXTURE__/local/telemetry", "maxRecordBytes": 65536, "maximumRecords": 256, "maximumStoreBytes": 4194304}, "kubeclaw.git-workspace:git": {"allowedRepositoryRoots": ["__FIXTURE__/project/repository"], "workspaceRoot": "__FIXTURE__/project/workspaces", "gitExecutable": "/usr/bin/git", "authorName": "Documentation Example", "authorEmail": "example@example.invalid", "maxExecutionMs": 30000, "maxOutputBytes": 1048576, "terminationGraceMs": 1000}, "kubeclaw.state-store:state": {"root": "__FIXTURE__/state-store", "maxEntryBytes": 1048576, "maximumRecords": 1000, "maximumStoreBytes": 16777216}, "kubeclaw.lint:executor": {"allowedRepositoryRoots": ["__FIXTURE__/project/repository"], "allowedPolicyRoots": ["__FIXTURE__/project"]}}, "activeAdapters": [], "observers": {}, "shutdownTimeoutMs": 1000, "orchestratorIssuerId": "local:operator", "administrativeDecisionIssuers": []};
 const substitute=x=>typeof x==='string'?x.replaceAll('__FIXTURE__',root).replaceAll('__SOURCE__',sourceRoot).replaceAll('__BASE__',project.baseRevision):Array.isArray(x)?x.map(substitute):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,substitute(v)])):x;
 write('compiled-platform.local-providers.json',substitute(template));
 const policy=JSON.parse(fs.readFileSync(path.join(sourceRoot,'charts/kubeclaw/files/config/lint-policy.json'),'utf8'));
 policy.baseline_path='lint-baseline.json';policy.kubernetes_policy_packs=[];
 policy.projects=[{id:'first-project',root:'.',discovery_max_depth:4,languages:['javascript'],language_evidence:{javascript:['app/*.mjs']},go:{modules:[]},terraform:{roots:[]}}];
 policy.architecture={layers:[{id:'app',roots:['app'],may_depend_on:['app']}]};
 for(const tool of policy.tools){
  tool.targets=tool.languages.length===1&&['go','terraform'].includes(tool.languages[0])?[]:['app'];
  if(['go-vet','go-imports','staticcheck','govulncheck'].includes(tool.id))tool.arguments=[];
  if(tool.config_path)tool.config_path=path.join(sourceRoot,'charts/kubeclaw/files/config',path.basename(tool.config_path));
  if(tool.id==='eslint')tool.config_path=path.join(root,'project/eslint.config.mjs');
  if(tool.id==='knip')tool.config_path=path.join(root,'project/knip.json');
 }
 write('project/operator-selected-lint-policy.json',policy);write('project/lint-baseline.json',{schema_version:'pipeline_lint_baseline.v2',groups:[]});
 write('project/knip.json',{entry:['app/greeting.test.mjs'],project:['app/**/*.mjs']});
 fs.writeFileSync(path.join(root,'project/eslint.config.mjs'),'export default [{files:["**/*.mjs"],languageOptions:{ecmaVersion:"latest",sourceType:"module"},rules:{"no-unused-vars":"error","no-undef":"error"}}];\n');
 console.log(JSON.stringify({status:'prepared-compiled-project',execution:false,root,stageCount:read('project/compiled.json').stages.length}));
}

async function run(){
owned();assert(!fs.existsSync(path.join(root,'compiled-run-result.json')),'Already attempted; preserve failure and select a fresh owned destination');
const project=load(path.join(root,'project/project.json'));
const p=load(path.join(root,'compiled-platform.local-providers.json'));
// These are symbolic configuration names, never authentication values.
const config={secretNames:{gateway:'a9906-gateway',buster:'a9906-buster',source:'a9906-source'}};
const key=crypto.generateKeyPairSync('ed25519');
const sourcePrivateKey=key.privateKey.export({type:'pkcs8',format:'pem'});
const sourcePublicKey=key.publicKey.export({type:'spki',format:'pem'});
const busterAuth=crypto.randomBytes(32).toString('hex');
const gatewayUrl=new URL(requiredEnv('COMPILED_GATEWAY_ENDPOINT'));
assert(['http:','https:'].includes(gatewayUrl.protocol)&&!gatewayUrl.username&&!gatewayUrl.password&&!gatewayUrl.hash&&!gatewayUrl.search,'Invalid gateway URL');
assert(gatewayUrl.protocol==='https:'||['127.0.0.1','[::1]'].includes(gatewayUrl.hostname),'Remote Gateway requires HTTPS; HTTP is limited to literal loopback');
const gatewayAuth=requiredEnv('COMPILED_GATEWAY_TOKEN');delete process.env.COMPILED_GATEWAY_TOKEN;
const agentId=requiredEnv('COMPILED_AGENT_ID'),model=requiredEnv('COMPILED_MODEL');
const sourceRevision=load(path.join(root,'local/source.json')).sourceRevision;
const busterEnvironment={KUBECLAW_BUILD_REVISION:sourceRevision,A9906_BUSTER_AUTH:busterAuth,A9906_SOURCE_PUBLIC:sourcePublicKey};
const home=path.join(root,'core-home'),temporary=path.join(root,'core-tmp');fs.mkdirSync(home);fs.mkdirSync(temporary);
const coreEnvironment={PATH:process.env.PATH,HOME:home,TMPDIR:temporary,LANG:'C.UTF-8',A9906_GATEWAY_AUTH:gatewayAuth,A9906_BUSTER_AUTH:busterAuth,A9906_SOURCE_PRIVATE:sourcePrivateKey};
const pluginRoot=path.join(sourceRoot,'skills/buster/plugins');
write('buster-platform.json',{schemaVersion:'pipeline-platform.v2',installationRoots:[pluginRoot],trustedBuiltinRoots:[pluginRoot],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{},grants:{},adapters:{},activeAdapters:[],observers:{},storageRoot:path.join(root,'buster-platform-state'),shutdownTimeoutMs:5000,orchestratorIssuerId:'local:documentation',administrativeDecisionIssuers:[]});
write('buster-runtime.json',{schemaVersion:'buster-remote-plan-runtime.v1',platformConfig:path.join(root,'buster-platform.json'),host:'127.0.0.1',port:0,tokenEnvironmentVariable:'A9906_BUSTER_AUTH',sourceAttestationPublicKeyEnvironmentVariable:'A9906_SOURCE_PUBLIC',trustedSourceAuthority:'local:documentation',stateRoot:path.join(root,'buster-state'),runtimeRoot:path.join(root,'buster-runs'),tarExecutable:'/usr/bin/tar',maximumArchiveBytes:4*1024*1024,maximumExtractedBytes:16*1024*1024,maximumResultBytes:16*1024*1024,maximumResultStoreBytes:64*1024*1024,maximumRequestBytes:2*1024*1024,maximumResponseBytes:2*1024*1024,shutdownTimeoutMs:5000,recordLimits:{maximumRecords:1000,maximumBytes:64*1024*1024,maximumRecordBytes:16*1024*1024},allowedCapabilities:['command.execute'],directCommand:{executableCatalog:{node:process.execPath},executableSearchPath:[path.dirname(process.execPath)],runtimeReadRoots:[path.dirname(process.execPath),'/lib/x86_64-linux-gnu','/lib64','/etc/ssl'],maximumOutputBytes:1048576,maximumExecutionMs:30000,maximumProcesses:16,maximumMemoryBytes:536870912,maximumCpuMillis:30000,terminationGraceMs:1000,allowSampledProcessLimit:true}});
let service;
try {
 service=loadProductionBusterRemotePlanRuntime(path.join(root,'buster-runtime.json'),busterEnvironment);
 const a=await service.start();const buster=`http://127.0.0.1:${a.port}`;const gw=gatewayUrl.origin;
 p.providers['runtime.dispatch']='kubeclaw.runtime-dispatch:openclaw';p.providers['test.plan.execute']='kubeclaw.remote-test-gate:plan';p.providers['secrets.read']='kubeclaw.secret-resolver:secrets';p.providers['network.http']='kubeclaw.network-http:http';
 p.adapters['kubeclaw.secret-resolver:secrets']={environment:{'a9906-gateway':'A9906_GATEWAY_AUTH','a9906-buster':'A9906_BUSTER_AUTH','a9906-source':'A9906_SOURCE_PRIVATE'}};
 p.adapters['kubeclaw.network-http:http']={allowedOrigins:[gw],allowedMethods:['POST'],allowedHeaders:['accept','content-type','authorization','idempotency-key'],maxRequestBytes:1048576,maxResponseBytes:1048576,timeoutMs:30000};
 p.adapters['kubeclaw.runtime-dispatch:openclaw']={targets:{forge:{endpoint:gatewayUrl.href,tokenSecret:config.secretNames.gateway,runtime:'subagent',agentId,model,cwd:project.repositoryRoot,repositoryRoot:project.repositoryRoot,workspaceRoot:project.workspaceRoot,resultPathPrefix:'.kubeclaw-results',sessionTimeoutMs:300000,maxPolls:300}}};
 p.grants['kubeclaw.runtime-dispatch:openclaw']={'git.repository.read':{allowedPrefixes:['README.md','modules/app','app']},'network.http':{allowedOrigins:[gw]},'secrets.read':{allowedNames:['a9906-gateway']}};
 p.adapters['kubeclaw.remote-test-gate:plan']={endpoint:buster,authentication:'bearer',tokenSecret:config.secretNames.buster,sourcePrivateKeySecret:config.secretNames.source,sourceAuthority:'local:documentation',stateRoot:path.join(root,'nova-test-state'),allowedRepositoryRoots:[project.repositoryRoot]};
 p.grants['kubeclaw.remote-test-gate:plan']={'secrets.read':{allowedNames:['a9906-buster','a9906-source']}};
 write('compiled-platform.complete.json',p);
 const compiledPath=path.join(root,'project/compiled.json');const before=fs.readFileSync(compiledPath);const admitted=await validatePipelineRuntimeV2(loadPlatformConfig(path.join(root,'compiled-platform.complete.json')),loadPipelineDefinition(compiledPath));
 if(!before.equals(fs.readFileSync(compiledPath)))throw Error('COMPILED_INPUT_CHANGED');
 write('complete-platform-admission.json',{status:'admitted',...admitted,compiledBytesUnchanged:true,execution:false,busterService:'real shipped production runtime, ephemeral loopback listener',isolationScope:'Supported direct-command allowSampledProcessLimit:true; not cgroup isolation acceptance',productSessionsSpawned:'not yet executed at admission'});console.log(JSON.stringify(admitted));
 {
  const args=[path.join(sourceRoot,'skills/nova/core/cli.ts'),'--platform',path.join(root,'compiled-platform.complete.json'),'--pipeline',compiledPath,'--run-id',project.runId];
  write('compiled-run-command.json',{executable:process.execPath,args,compiledSha256:crypto.createHash('sha256').update(before).digest('hex')});
  const out=fs.openSync(path.join(root,'compiled-run.stdout'),'w');const err=fs.openSync(path.join(root,'compiled-run.stderr'),'w');
  const child=spawn(process.execPath,args,{cwd:sourceRoot,env:coreEnvironment,stdio:['ignore',out,err]});
  const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});fs.closeSync(out);fs.closeSync(err);
  write('compiled-run-result.json',{exitCode,compiledBytesUnchanged:before.equals(fs.readFileSync(compiledPath)),runId:project.runId});console.log(JSON.stringify({runExitCode:exitCode}));assert.equal(exitCode,0,'Actual compiled workflow did not succeed; preserve original failure');
 }

} finally {if(service)await service.stop();delete coreEnvironment.A9906_SOURCE_PRIVATE;delete coreEnvironment.A9906_BUSTER_AUTH;delete coreEnvironment.A9906_GATEWAY_AUTH;delete busterEnvironment.A9906_BUSTER_AUTH;delete busterEnvironment.A9906_SOURCE_PUBLIC;}

}

function rawManifest(){const result=[];const walk=(dir,rel='')=>{for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name),r=path.join(rel,name),s=fs.lstatSync(p);assert(!s.isSymbolicLink(),'Symlink in raw evidence');if(s.isDirectory())walk(p,r);else{assert(s.isFile());const b=fs.readFileSync(p);result.push({path:r,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}}};walk(path.join(root,'raw-before-audit'));return result;}
function audit(){
 const raw=path.join(root,'raw-before-audit');fs.mkdirSync(raw);fs.cpSync(path.join(root,'compiled-state'),path.join(raw,'state'),{recursive:true});fs.cpSync(path.join(root,'local/artifacts'),path.join(raw,'artifacts'),{recursive:true});write('raw-tree.json',rawManifest());
 const args=[process.execPath,path.join(sourceRoot,'skills/nova/core/cli.ts'),'--platform',path.join(root,'compiled-platform.complete.json'),'--audit',read('project/project.json').runId];
 const quote=x=>"'"+x.replaceAll("'", "'\\''")+"'";
 const auditArgs=['-q','-e','-c',args.map(quote).join(' '),'/dev/null'];const x=spawnSync('/usr/bin/script',auditArgs,{cwd:sourceRoot,encoding:'utf8',maxBuffer:16777216});write('compiled-audit-pty-command.json',{executable:'/usr/bin/script',args:auditArgs,exitCode:x.status});fs.writeFileSync(path.join(root,'compiled-audit-pty.stdout'),x.stdout??'');fs.writeFileSync(path.join(root,'compiled-audit-pty.stderr'),x.stderr??'');assert.equal(x.status,0,'Audit failed');JSON.parse(x.stdout);assert.deepEqual(rawManifest(),read('raw-tree.json'));
 const result=verifyCompiledProject(root,sourceRoot);return result;
}
if(operation==='prepare')prepare();
if(operation==='run'){
 owned();const bin=requiredEnv('COMPILED_TOOLS_BIN');assert(path.isAbsolute(bin));process.env.PATH=bin+':'+path.join(sourceRoot,'node_modules/.bin')+':'+process.env.PATH;
 const {loadLintPolicy}=await imp('skills/nova/plugins/lint/src/engine/policy.ts');loadLintPolicy(path.join(root,'project/operator-selected-lint-policy.json'));
 await run();console.log(JSON.stringify(show(await audit())));
}
if(operation==='verify'){owned();console.log(JSON.stringify(show(await verifyCompiledProject(root,sourceRoot))));}
if(operation==='cleanup'){
 owned();const result=await verifyCompiledProject(root,sourceRoot);assert.equal(result.status,'verified-actual-compiled-workflow');
 const repo=path.join(root,'project/repository');const worktrees=execFileSync('/usr/bin/git',['worktree','list','--porcelain'],{cwd:repo,encoding:'utf8'});assert.equal(worktrees.split('\n').filter(x=>x.startsWith('worktree ')).length,1,'Retained active worktree; preserve fixture');
 assert.equal(execFileSync('/usr/bin/git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),'','Source fixture dirty; preserve it');
 fs.rmSync(root,{recursive:true});assert(!fs.existsSync(root));console.log(JSON.stringify({status:'verified-owned-cleanup',root,runId:result.runId,artifacts:result.artifactCount}));
}
