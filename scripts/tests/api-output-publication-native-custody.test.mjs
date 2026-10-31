import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import test from 'node:test';
import ts from 'typescript';
import YAML from 'yaml';
import {discoverScriptInputGraph} from '../docs-api-output-discovery.mjs';
import {classifySerializedOutputRoles,deriveNativeOperationFacts,nativeOperationFactDigest} from '../docs-api-output-role-classification.mjs';
import {shellNativeNodeEntries} from '../docs-shell-source-custody.mjs';
import {expandReviewedNodePackageGlob} from '../docs-api-documentation-role-custody.mjs';
import {assertPublicationExampleChildPurpose} from '../docs-documentation-owner-purpose-custody.mjs';
const root=path.resolve(import.meta.dirname,'../..'),modulePath='scripts/docs-api-output-discovery.mjs',source='scripts/docs-publication-example-native.mjs',caller='scripts/docs-publication-examples.mjs';
const code=fs.readFileSync(path.join(root,modulePath),'utf8'),tree=ts.createSourceFile(modulePath,code,ts.ScriptTarget.Latest,true),graph=discoverScriptInputGraph(root),raw=classifySerializedOutputRoles(root,source);
const statement=(t,name)=>{const n=t.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(t)===name));assert(n,name);return n.getText(t);};
const declaration=(t,name)=>{const n=t.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(t).replace(/^export /u,'');};
function verifier({overrides=new Map(),cwd=root,selectedGraph=graph,alias=null,hardlink=null,badParent=null,tempAlias=false,nativeFacts=undefined,rows=raw}={}){
 const reader={...fs,readFileSync:(file,...args)=>overrides.has(String(file))?(args[0]?overrides.get(String(file)).toString(args[0]):overrides.get(String(file))):fs.readFileSync(file,...args),
  realpathSync:file=>String(file)===alias||tempAlias&&String(file)===os.tmpdir()?String(file)+'.alias':fs.realpathSync(file),
  lstatSync:file=>{const s=fs.lstatSync(file);return String(file)===hardlink||String(file)===badParent?{...s,nlink:String(file)===hardlink?2:s.nlink,isFile:()=>s.isFile(),isDirectory:()=>String(file)===badParent?false:s.isDirectory(),isSymbolicLink:()=>s.isSymbolicLink()}:s;}
 };
 const context=vm.createContext({assert,fs:reader,os,path,process:{cwd:()=>cwd},hash:b=>crypto.createHash('sha256').update(b).digest('hex'),deriveNativeOperationFacts:(...args)=>nativeFacts??deriveNativeOperationFacts(...args),nativeOperationFactDigest,shellNativeNodeEntries,expandReviewedNodePackageGlob,assertPublicationExampleChildPurpose});
 const body=statement(tree,'reviewedPublicationNativeValidation')+'\n'+statement(tree,'publicationNativeValidationReceipts')+'\n'+['documentationEntryPoints','publicationNativeValidationDescriptor','checkedPublicationNativeValidation','selectedPublicationNativeValidation'].map(n=>declaration(tree,n)).join('\n');
 vm.runInContext(body+'\nglobalThis.api={acquire:checkedPublicationNativeValidation,slot:selectedPublicationNativeValidation};',context);context.rawJSON=JSON.stringify(rows);const classify=()=>vm.runInContext('JSON.parse(rawJSON)',context);
 return{acquire:(selectedRoot=root)=>context.api.acquire(selectedRoot,selectedGraph,classify,[source]),slot:(role,receipt,selectedSource=source)=>context.api.slot(selectedSource,role,receipt)};
}

const helperCode=fs.readFileSync(path.join(root,source),'utf8'),helperTree=ts.createSourceFile(source,helperCode,ts.ScriptTarget.Latest,true);
test('four actual callers ten raw slots and API-shaped private chart remain validation-only',()=>{
 const v=verifier(),r=v.acquire();assert.equal(raw.length,10);assert.equal(raw.filter(x=>x.role==='unknown').length,6);assert.equal(raw.filter(x=>x.role==='api').length,1);
 assert.equal(graph.edges.filter(x=>x.target===source).length,4);for(const row of raw)assert(v.slot(row,r));
 assert.equal(v.slot(raw.find(x=>x.line===423),r).kubernetesShapedPayload,true);
 assert(r.slots.every(x=>!x.runtimeExecutionAuthorized&&!x.apiApplyAuthorized));assert.equal(r.productOutputs.length,0);assert.equal(r.toolSuccessObserved,false);assert.equal(r.cleanupOrRollbackGuaranteed,false);
 assert.throws(()=>v.slot(raw[0],{...r}),/unacquired/);assert.equal(v.slot(raw[0],r,'arbitrary.mjs'),false);
});
test('exact caller bodies operations paths tools and no-start boundary cannot be borrowed',()=>{
 for(const [a,b] of [["'kubeclaw-publication-examples-'","'shared-'"],["['base.yaml', 'empty.yaml', 'remove.yaml']","['../outside','empty.yaml','remove.yaml']"],["['template', 'example', chart","['install', 'example', chart"],["execFileSync('helm'","execFileSync('kubectl'"],["force: false","force: true"],["typeof runtime.start","typeof runtime.recover"],["invokes, 0","invokes, 1"],["kind: ConfigMap","kind: Secret"]]){
  const changed=helperCode.replace(a,b);assert.notEqual(changed,helperCode);assert.throws(()=>verifier({overrides:new Map([[path.join(root,source),Buffer.from(changed)]])}).acquire(),/fixed source\/input/);
 }
 for(const caller of graph.edges.filter(x=>x.target===source).map(x=>x.source)){
  const text=fs.readFileSync(path.join(root,caller),'utf8');assert.throws(()=>verifier({overrides:new Map([[path.join(root,caller),Buffer.from(text+'\nnative.arbitraryCallback();')]])}).acquire(),/fixed source\/input/);
 }
});
test('native graph all four edges aliases root physical identities and slot mutations fail closed',()=>{
 for(const edges of [graph.edges.filter(x=>!(x.target===source&&x.source.endsWith('assets.mjs'))),[...graph.edges,{source:'arbitrary.mjs',target:source,kind:'import',operation:'import x'}]])assert.throws(()=>verifier({selectedGraph:{...graph,edges}}).acquire(),/four caller edges/);
 const publicAlias=structuredClone(graph);publicAlias.publicEntries.push({path:'alias.mjs',canonicalSource:source});assert.throws(()=>verifier({selectedGraph:publicAlias}).acquire(),/entry alias/);
 const packagePath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(packagePath));pkg.scripts['docs:unreviewed']='node '+source;assert.throws(()=>verifier({overrides:new Map([[packagePath,Buffer.from(JSON.stringify(pkg))]])}).acquire(),/fixed source\/input/);
 const reordered=structuredClone(graph);const incoming=reordered.edges.filter(x=>x.target===source).reverse();let i=0;reordered.edges=reordered.edges.map(x=>x.target===source?incoming[i++]:x);assert.throws(()=>verifier({selectedGraph:reordered}).acquire(),/four caller edges/);
 assert.throws(()=>verifier({cwd:'/'}).acquire(),/root\/cwd/);assert.throws(()=>verifier({alias:path.join(root,source)}).acquire(),/physical input/);assert.throws(()=>verifier({hardlink:path.join(root,source)}).acquire(),/regular input/);assert.throws(()=>verifier({tempAlias:true}).acquire(),/temporary base/);
 for(const rows of [raw.slice(1),[...raw,raw[0]],[...raw].reverse(),raw.map(x=>x.line===423?{...x,role:'non-api'}:x)])assert.throws(()=>verifier({rows}).acquire(),/ten-slot raw vector/);
 assert.throws(()=>verifier({nativeFacts:[{unreviewed:true}]}).acquire(),/native operation facts/);
 const p=path.join(root,'charts/prism/ci-values.yaml');assert.throws(()=>verifier({overrides:new Map([[p,Buffer.from('unreviewed')]])}).acquire(),/fixed source\/input/);
});
function materialize({cleanupFailure=false,writeFailure=false}={}){
 const directory=path.join(os.tmpdir(),'kubeclaw-publication-examples-CONTROLLED'),files=new Map(),calls=[],cleanups=[];
 const fakeFs={mkdtempSync:p=>{assert.equal(p,path.join(os.tmpdir(),'kubeclaw-publication-examples-'));return directory;},mkdirSync:p=>assert.equal(p,path.join(directory,'chart/templates')),writeFileSync:(p,v)=>{assert(p.startsWith(directory+'/'));assert(['chart/Chart.yaml','chart/templates/values.yaml'].includes(path.relative(directory,p)));if(writeFailure)throw Error('write failure');files.set(p,v);},rmSync:(p,o)=>{assert.equal(p,directory);assert.equal(o.force,false);assert.equal(o.recursive,true);cleanups.push(p);if(cleanupFailure)throw Error('cleanup failure');files.clear();}};
 const context=vm.createContext({assert,fs:fakeFs,os,path,YAML,execFileSync:(tool,args,options)=>{assert.equal(tool,'helm');assert.deepEqual(Array.from(args),['template','example',path.join(directory,'chart'),'--set','key=publication-fixture']);assert.equal(options.timeout,30000);assert.equal(options.maxBuffer,1024*1024);assert.match(files.get(path.join(directory,'chart/templates/values.yaml')),/kind: ConfigMap/);calls.push(Array.from(args));return YAML.stringify({data:{values:JSON.stringify({key:'publication-fixture'})}});}});
 vm.runInContext(declaration(helperTree,'withExampleDirectory')+'\n'+declaration(helperTree,'validateHelmOptionTemplates')+'\nglobalThis.run=validateHelmOptionTemplates;',context);
 let result,error;try{result=context.run([{option:"--set 'key=<value>'",expectedPath:['key']}]);}catch(e){error=e;}
 return{result,error,calls,cleanups,residual:files.size};
}
test('actual private-chart body fake Helm and filesystem preserve API shape and cleanup attempt only',()=>{
 const r=materialize();assert.ifError(r.error);assert.equal(r.calls.length,1);assert.equal(r.cleanups.length,1);assert.equal(r.residual,0);assert.equal(r.result[0].productSchemaOrDeployment,false);
 const failed=materialize({cleanupFailure:true});assert(failed.error);assert.equal(failed.residual,2);assert.equal(failed.cleanups.length,1);
 const write=materialize({writeFailure:true});assert(write.error);assert.equal(write.calls.length,0);assert.equal(write.cleanups.length,1);
});
function overlayControl(){
 const directory=path.join(os.tmpdir(),'kubeclaw-publication-examples-CONTROLLED'),writes=[],calls=[],cleanup=[];
 const context=vm.createContext({assert,path,os,crypto,YAML,fs:{mkdtempSync:p=>{assert.equal(p,path.join(os.tmpdir(),'kubeclaw-publication-examples-'));return directory;},writeFileSync:(p,v,o)=>{assert.equal(o.flag,'wx');assert.equal(p,path.join(directory,['base.yaml','empty.yaml','remove.yaml'][writes.length]));writes.push([p,v]);},rmSync:(p,o)=>{assert.equal(p,directory);assert.equal(o.force,false);cleanup.push(p);}},execFileSync:(tool,args,o)=>{
  assert.equal(tool,'helm');calls.push(Array.from(args));if(args[0]==='version'){assert.deepEqual(Array.from(args),['version','--short']);return 'CONTROLLED';}
  assert.equal(args[0],'template');assert.equal(args[1],'precedence-example');assert.equal(args[3],'--namespace');assert.equal(args[4],'default');assert.equal(o.cwd,root);assert.equal(o.timeout,120000);
  if(args[2]===path.join(root,'charts/prism')){assert.deepEqual(Array.from(args.slice(5)),['-f',path.join(root,'charts/prism/ci-values.yaml')]);return '';}
  assert.equal(args[2],path.join(root,'charts/kubeclaw'));const orders=[[0],[0,1],[0,2],[1,0]],index=calls.length-1;assert.deepEqual(Array.from(args.slice(5)),orders[index].flatMap(i=>['-f',writes[i][0]]));
  const pod={containers:[{name:'kubeclaw',env:[{name:'UNRELATED',value:'fixed'}]}]};if(index===0||index===3)pod.containers[0].env.push({name:'HELM_PRECEDENCE_EXAMPLE',value:'base'});if(index!==2)pod.nodeSelector={pool:'base'};
  return YAML.stringify({kind:'Deployment',metadata:{name:'agent-nova'},spec:{template:{spec:pod}}});
 },spawnSync:(tool,args,o)=>{assert.equal(tool,'helm');assert.deepEqual(Array.from(args),['template','precedence-example',path.join(root,'charts/prism'),'--namespace','default','-f',path.join(root,'charts/prism/ci-values.yaml'),'--set-string','images.control.pullPolicy=']);assert.equal(o.cwd,root);return{status:1,stderr:'images.control.pullPolicy'};}});
 vm.runInContext(statement(helperTree,'digest')+'\n'+declaration(helperTree,'withExampleDirectory')+'\n'+declaration(helperTree,'validateHelmOverlayExamples')+'\nglobalThis.run=validateHelmOverlayExamples;',context);const r=context.run(root,['base','empty','remove']);return{r,writes,calls,cleanup};
}
test('actual overlay source fake Helm verifies four ordered renders Prism negative branch and version only',()=>{const r=overlayControl();assert.equal(r.writes.length,3);assert.equal(r.calls.length,6);assert.equal(r.cleanup.length,1);assert.equal(r.r.clusterContact,false);});
test('actual Buster construction and Prism blocked path never start recover or invoke',async()=>{
 let start=0,recover=0,constructed=0,invoked=0,cleaned=0;const directory=path.join(os.tmpdir(),'kubeclaw-publication-examples-CONTROLLED');
 const context=vm.createContext({assert,path,os,crypto,fs:{mkdtempSync:()=>directory,writeFileSync:(p,v,o)=>{assert.equal(path.dirname(p),directory);assert.equal(o.flag,'wx');},rmSync:()=>{cleaned++;}},execFileSync:(tool,args)=>{assert.equal(tool,'git');assert.deepEqual(Array.from(args),['-C',root,'rev-parse','HEAD']);return 'CONTROLLED';},loadPlatformConfig:p=>assert.equal(p,path.join(directory,'platform.json')),loadProductionBusterRemotePlanRuntime:(p,e)=>{assert.equal(p,path.join(directory,'runtime.json'));assert.equal(e.KUBECLAW_BUILD_REVISION,'CONTROLLED');constructed++;return{start:()=>start++,recover:()=>recover++};},validateContractValue:()=>{},validateSignal:()=>{},prismDesign:async(_input,ctx)=>{assert.equal(typeof ctx.invoke,'function');return{outcome:'blocked',reason:{code:'prism_design.dispatch_failed',message:'PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID'}};}});
 vm.runInContext(statement(helperTree,'digest')+'\n'+['withExampleDirectory','validateBusterExample','validatePrismPayloadTemplate'].map(n=>declaration(helperTree,n)).join('\n')+'\nglobalThis.api={buster:validateBusterExample,prism:validatePrismPayloadTemplate};',context);
 const b=context.api.buster(root,{platformConfig:'./platform.json'});assert.equal(b.listenerStarted,false);assert.equal(b.providerExecution,false);assert.equal(constructed,1);assert.equal(start+recover,0);assert.equal(cleaned,1);
 context.templateJSON=JSON.stringify({approvalId:'THE_STUDIO_APPROVAL_ID',architectureDigest:'sha256:THE_ACTIVE_ARCHITECTURE_DIGEST',bundleDigest:'sha256:THE_PUBLISHED_BUNDLE_DIGEST',decision:'approve',issuer:{type:'operator',id:'THE_CONFIGURED_ISSUER_ID'}});const p=await context.api.prism(vm.runInContext('JSON.parse(templateJSON)',context));assert.equal(p.dispatches,0);assert.equal(invoked,0);
});
