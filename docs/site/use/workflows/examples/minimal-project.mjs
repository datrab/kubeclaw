#!/usr/bin/env node
// Bounded author candidate: compiler and identity/default inspection, NOT a replacement engine.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';
const helperFile=fileURLToPath(import.meta.url);const source=path.resolve(path.dirname(helperFile),'../../../../..');assert.equal(fs.realpathSync(source),source,'Installed Source must be canonical');assert(!process.env.PIPELINE01_SOURCE_ROOT||process.env.PIPELINE01_SOURCE_ROOT===source,'PIPELINE01_SOURCE_ROOT must equal the installed helper checkout');const [operation,root]=process.argv.slice(2);assert(['prepare','identities','defaults'].includes(operation)&&root&&path.isAbsolute(root));const imp=p=>import(pathToFileURL(path.join(source,p)).href);const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
function fixtureGitEnvironment(){
 const env={...process.env};for(const name of Object.keys(env))if(name.startsWith('GIT_'))delete env[name];
 return {...env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_GLOBAL:'/dev/null',
  GIT_CONFIG_COUNT:'4',GIT_CONFIG_KEY_0:'commit.gpgSign',GIT_CONFIG_VALUE_0:'false',
  GIT_CONFIG_KEY_1:'core.hooksPath',GIT_CONFIG_VALUE_1:'/dev/null',
  GIT_CONFIG_KEY_2:'core.attributesFile',GIT_CONFIG_VALUE_2:'/dev/null',
  GIT_CONFIG_KEY_3:'init.templateDir',GIT_CONFIG_VALUE_3:'',
  GIT_AUTHOR_DATE:'2026-10-20T00:00:00Z',GIT_COMMITTER_DATE:'2026-10-20T00:00:00Z'};
}
const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:source,encoding:'utf8',env:fixtureGitEnvironment()}).trim();
assert.equal(git('rev-parse','--show-toplevel'),source,'Helper must be inside its selected Source root');
for(const relative of ['docs/site/use/workflows/examples/minimal-project.mjs','docs/site/use/workflows/examples/minimal.pipeline.json']){
 const file=path.join(source,relative);assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink()&&fs.realpathSync(file)===file,'Helper and fixture must be physical regular Source files');
 assert.equal(git('ls-files','--error-unmatch','--',relative),relative,'Helper and canonical fixture must be tracked in selected Source');
}
assert.equal(git('status','--porcelain','--untracked-files=all'),'','Installed Source must be clean');
if(operation==='prepare'){assert.equal(root,'/tmp/kubeclaw-reader-pipeline01','Canonical graph uses this one exclusive disposable root; never overwrite an existing root');execFileSync(process.execPath,[path.join(source,'docs/site/use/workflows/examples/compiled-project.mjs'),'prepare',root],{stdio:'inherit',env:fixtureGitEnvironment()});const canonical=path.join(path.dirname(fileURLToPath(import.meta.url)),'minimal.pipeline.json');assert.deepEqual(fs.readFileSync(path.join(root,'project/compiled.json')),fs.readFileSync(canonical),'Current real compiler differs from registered immutable graph; stop, never rewrite fixture');console.log(JSON.stringify({canonicalFixtureBytesUnchanged:true,runtimeExecution:false}));process.exit(0);}
function owned(){
 assert.equal(root,'/tmp/kubeclaw-reader-pipeline01','Canonical root changed');
 for(let p=root;;p=path.dirname(p)){assert(!fs.lstatSync(p).isSymbolicLink(),'Symlinked owned root or ancestor');if(p===path.dirname(p))break;}
 assert.equal(fs.realpathSync(root),root);
 const marker=read('owned-compiled-project.json');
 assert.equal(marker.schemaVersion,'compiled-project-journey.v1');assert.equal(marker.root,root);assert.equal(marker.sourceRoot,source);assert.equal(marker.uid,process.getuid?.()??null);
 assert.equal(execFileSync('/usr/bin/git',['status','--porcelain','--untracked-files=all'],{cwd:source,encoding:'utf8',env:fixtureGitEnvironment()}).trim(),'','Selected Source is dirty');
 assert.equal(marker.sourceRevision,execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8',env:fixtureGitEnvironment()}).trim(),'Selected Source revision changed');
 for(const name of ['project.json','compiled.json'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'project',name))).digest('hex'),marker.preparedInputDigests?.[name],'Prepared compiler input/output changed: '+name);
 const canonical=path.join(path.dirname(fileURLToPath(import.meta.url)),'minimal.pipeline.json');assert.deepEqual(fs.readFileSync(path.join(root,'project/compiled.json')),fs.readFileSync(canonical),'Prepared graph differs from unchanged canonical fixture');
}
owned();
const project=read('project/project.json'),graph=read('project/compiled.json');
if(operation==='identities'){
 const {buildRegistry}=await imp('skills/common/plugin-runtime/foundation/registry/build.ts');const {discoverPackages}=await imp('skills/common/plugin-runtime/foundation/registry/discovery.ts');const {loadPipelineDefinition}=await imp('skills/nova/core/execution/engine.ts');assert.deepEqual(loadPipelineDefinition(path.join(root,'project/compiled.json')),graph);
 const registry=roots=>buildRegistry(discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'pipeline01-author'}}));const runtime=registry(['skills/nova/plugins','skills/common/plugins'].map(p=>path.join(source,p))),buster=registry([path.join(source,'skills/buster/plugins')]);
 const stages=graph.stages.map(s=>{const entry=runtime.stages.get(s.type);assert(entry,s.type);return {stage:s.id,type:s.type,identity:entry.provenance};});
 const selected=['kubeclaw.runtime-dispatch:openclaw','kubeclaw.remote-test-gate:plan','kubeclaw.redis-transport:telemetry','kubeclaw.secret-resolver:secrets','kubeclaw.network-http:http'];const adapters=selected.map(id=>{const entry=runtime.adapters.get(id);assert(entry,id);return {id,identity:entry.provenance,capabilities:entry.registration.providesCapabilities};});const observer=runtime.observers.get('kubeclaw.telemetry-observer:telemetry');assert(observer);
 const plans=[project.modules[0].test.providerPlan.plan,project.final.test.providerPlan.plan].map(plan=>{assert.equal(plan.registrySnapshotDigest,buster.snapshotDigest);return {planId:plan.planId,nodes:plan.nodes.map(n=>({nodeId:n.id??n.nodeId,kind:n.kind,provider:n.provider,reportAdapters:n.reportAdapters})),sourceRegistrySnapshotDigest:buster.snapshotDigest};});
 console.log(JSON.stringify({scope:'Actual schema/registry identity lookup, not runtime/platform admission, Gateway authorization, provider execution or original acceptance',stages,adapters,observer:{identity:observer.provenance,subscriptions:observer.registration.subscriptions,failurePolicy:observer.registration.failurePolicy},plans},null,2));
}
if(operation==='defaults'){
 const rows=[{pointer:'/maxConcurrency',value:graph.maxConcurrency,authority:'docs/site/reference/nova-project.md Compiler stage order; skills/nova/project/compiler.ts compileProject',kind:'compiler-inserted serialized repository lane'}];
 function leaves(v,p){if(v&&typeof v==='object'&&!Array.isArray(v))return Object.entries(v).flatMap(([k,v])=>leaves(v,p+'/'+k));return [{pointer:p,value:v}];}
 for(const [i,s]of graph.stages.entries())if(Object.keys(s.config).length===0)rows.push({pointer:'/stages/'+i+'/config',value:{},stage:s.id,authority:'skills/nova/project/source.ts sourceStages; docs/site/reference/nova-project.md',kind:'fixed empty configuration of compiler-generated source stages'});
 for(const [i,s]of graph.stages.entries())for(const leaf of leaves(s.execution,'/stages/'+i+'/execution'))rows.push({...leaf,stage:s.id,authority:s.id==='source-preflight'||s.id==='blueprint-sync'?'skills/nova/project/source.ts sourceStages; docs/site/reference/nova-project.md':s.id.endsWith('app')?'skills/nova/project/compiler.ts moduleStages; docs/site/reference/nova-project.md Module implementation repair budgets':'skills/nova/project/coverage.ts cumulativeStages; docs/site/reference/nova-project.md',kind:leaf.pointer.includes('repairCategory')?'compiler-derived checker association':'compiler-inserted execution policy or repair-budget arithmetic'});
 for(const [i,s]of graph.stages.entries())if(s.type==='kubeclaw.agent.implementation')rows.push({pointer:'/stages/'+i+'/input/attempt',value:s.input.attempt,stage:s.id,authority:'docs/site/reference/nova-project.md#minimal-compiler-policy-and-derived-values',kind:'compiler-inserted initial attempt constant, not proof of an executed attempt'},{pointer:'/stages/'+i+'/input/workspace/baseRef',value:s.input.workspace.baseRef,stage:s.id,authority:'docs/site/reference/nova-project.md#minimal-compiler-policy-and-derived-values',kind:'compiler-inserted HEAD selector; actual baseline binding remains separately required'});
 for(const [i,s]of graph.stages.entries())if(s.config.agent==='buster'&&![project.modules[0].test.agent,project.final.test.agent].includes('buster'))rows.push({pointer:'/stages/'+i+'/config/agent',value:'buster',stage:s.id,authority:'skills/nova/project/coverage.ts testConfiguration; docs/site/reference/nova-project.md',kind:'default test-agent name; testAgentEnabled false remains explicit source input'});
 console.log(JSON.stringify({rows,limits:'Read the exact finite policy/constant versus derived-value table at docs/site/reference/nova-project.md#minimal-compiler-policy-and-derived-values. This printout includes execution leaves, fixed empty config, concurrency, test-agent and initial attempt/baseRef constants; generated ids/edges/source bindings/plan data are derived compilation, not execution or endpoint authority. Encoding values were explicit compile arguments. No exhaustive original participant explanation or runtime acceptance is granted.'},null,2));
}
