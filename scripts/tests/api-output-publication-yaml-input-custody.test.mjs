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
const root=path.resolve(import.meta.dirname,'../..'),modulePath='scripts/docs-api-output-discovery.mjs',source='scripts/docs-publication-embedded-yaml.mjs',caller='scripts/docs-publication-examples.mjs';
const code=fs.readFileSync(path.join(root,modulePath),'utf8'),tree=ts.createSourceFile(modulePath,code,ts.ScriptTarget.Latest,true),graph=discoverScriptInputGraph(root),raw=classifySerializedOutputRoles(root,source);
const statement=(t,name)=>{const n=t.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(t)===name));assert(n,name);return n.getText(t);};
const declaration=(t,name)=>{const n=t.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(t).replace('export function','function');};
function verifier({overrides=new Map(),cwd=root,selectedGraph=graph,alias=null,hardlink=null,badParent=null,tempAlias=false,nativeFacts=undefined,rows=raw}={}){
 const reader={...fs,readFileSync:(file,...args)=>overrides.has(String(file))?(args[0]?overrides.get(String(file)).toString(args[0]):overrides.get(String(file))):fs.readFileSync(file,...args),
  realpathSync:file=>String(file)===alias||tempAlias&&String(file)===os.tmpdir()?String(file)+'.alias':fs.realpathSync(file),
  lstatSync:file=>{const s=fs.lstatSync(file);return String(file)===hardlink||String(file)===badParent?{...s,nlink:String(file)===hardlink?2:s.nlink,isFile:()=>s.isFile(),isDirectory:()=>String(file)===badParent?false:s.isDirectory(),isSymbolicLink:()=>s.isSymbolicLink()}:s;}
 };
 const context=vm.createContext({assert,fs:reader,os,path,process:{cwd:()=>cwd},hash:b=>crypto.createHash('sha256').update(b).digest('hex'),deriveNativeOperationFacts:(...args)=>nativeFacts??deriveNativeOperationFacts(...args),nativeOperationFactDigest,shellNativeNodeEntries,expandReviewedNodePackageGlob,assertPublicationExampleChildPurpose});
 const body=statement(tree,'reviewedPublicationYamlValidationInputs')+'\n'+statement(tree,'publicationYamlValidationReceipts')+'\n'+['documentationEntryPoints','publicationYamlValidationDescriptor','checkedPublicationYamlValidationInputs','selectedPublicationYamlValidationInput'].map(n=>declaration(tree,n)).join('\n');
 vm.runInContext(body+'\nglobalThis.api={acquire:checkedPublicationYamlValidationInputs,slot:selectedPublicationYamlValidationInput};',context);context.rawJSON=JSON.stringify(rows);const classify=()=>vm.runInContext('JSON.parse(rawJSON)',context);
 return{acquire:(selectedRoot=root)=>context.api.acquire(selectedRoot,selectedGraph,classify,[source]),slot:(role,receipt,selectedSource=source)=>context.api.slot(selectedSource,role,receipt)};
}
test('separate schema and genuinely Kubernetes-shaped specimen purposes retain raw UNKNOWN and no admission grant',()=>{
 const v=verifier(),r=v.acquire();assert.equal(raw.length,2);assert(raw.every(x=>x.role==='unknown'));
 assert.equal(v.slot(raw[0],r).kind,'schema-validation-input');assert.equal(v.slot(raw[0],r).kubernetesShapedPayload,false);
 assert.equal(v.slot(raw[1],r).kind,'kubernetes-example-validation-specimen');assert.equal(v.slot(raw[1],r).kubernetesShapedPayload,true);
 assert(r.slots.every(x=>!x.runtimeExecutionAuthorized&&!x.apiApplyAuthorized&&!x.schemaSemanticsNewlyApproved));
 assert.equal(r.temporaryFileNames.length,6);assert.equal(r.nativeValidatorSuccessObserved,false);assert.equal(r.futureTemporaryPathStateObserved,false);assert.equal(r.sourceAttemptsFinallyCleanup,true);assert.equal(r.cleanupOrRollbackGuaranteed,false);
 assert.throws(()=>v.slot(raw[0],{...r}),/unacquired/);assert.equal(v.slot(raw[0],r,'scripts/arbitrary.mjs'),false);
});
const helperCode=fs.readFileSync(path.join(root,source),'utf8'),helperTree=ts.createSourceFile(source,helperCode,ts.ScriptTarget.Latest,true);
function variableText(name){let result;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(helperTree)===name)result=n.getText(helperTree);ts.forEachChild(n,visit);}visit(helperTree);assert(result,name);return result;}
test('changed IDs order path joins prefix outside paths callbacks argv and cleanup cannot borrow exact source slots',()=>{
 const schemaPath=variableText('schemaPath'),specimenPath=variableText('specimenPath'),materials=variableText('materials'),directory=variableText('directory');
 const mutations=[
  s=>s.replace('cilium-denial-template','unreviewed-id'),s=>s.replace(materials,materials.replace('cilium-denial-template','../../outside')),
  s=>s.replace(schemaPath,schemaPath.replace('.json','.outside')),s=>s.replace(specimenPath,specimenPath.replace('path.join(directory,','path.join("/outside",')),
  s=>s.replace(directory,directory.replace('kubeclaw-embedded-yaml-','shared-arbitrary-')),s=>s.replace('for (const item of materials)','for (const item of [...materials].reverse())'),
  s=>s.replace('JSON.stringify(schema)','arbitraryCallback(schema)'),s=>s.replace("spawnSync('kubeconform'","spawnSync('kubectl'"),s=>s.replace("'1.35.0'","'0.0.0'"),
  s=>s.replace('HOME: directory','HOME: "/outside"'),s=>s.replace('fs.rmSync(directory','void fs.rmSync(directory'),s=>s+'\nfs.writeFileSync("outside.yaml","apiVersion: v1");\n'
 ];
 for(const mutate of mutations){const changed=mutate(helperCode);assert.notEqual(changed,helperCode);assert.throws(()=>verifier({overrides:new Map([[path.join(root,source),Buffer.from(changed)]])}).acquire(),/fixed source\/input/);}
});
test('block ordinals substitutions input identities authorities selectors and raw slots stay sealed',()=>{
 for(const [a,b]of [["diagnose.md', 22","diagnose.md', 21"],["install.md', 10","install.md', 9"],['mnt014-example','other-namespace']]){
  const changed=helperCode.replace(a,b);assert.notEqual(changed,helperCode);assert.throws(()=>verifier({overrides:new Map([[path.join(root,source),Buffer.from(changed)]])}).acquire(),/fixed source\/input/);
 }
 const lock=JSON.parse(fs.readFileSync(path.join(root,'scripts/docs-api-authority-lock.json')));
 for(const p of ['versions.json','scripts/docs-api-authority-lock.json',lock.kubernetes.path,lock.customResources.cilium.crds.CiliumNetworkPolicy.path,'scripts/lib/docs-publication-example-coverage.mjs','docs/site/use/diagnose.md','docs/site/use/install.md','docs/config/publication-example-claims.json']){
  const before=fs.readFileSync(path.join(root,p));assert.throws(()=>verifier({overrides:new Map([[path.join(root,p),Buffer.concat([before,Buffer.from('\nUNREVIEWED')])]])}).acquire(),/fixed source\/input/);
 }
 const corruptFacts=structuredClone(deriveNativeOperationFacts(root,source,raw.map(r=>({expression:r.expression}))));corruptFacts[0].sha256='0'.repeat(64);assert.throws(()=>verifier({nativeFacts:corruptFacts}).acquire(),/selected native facts/);
 for(const rows of [raw.slice(1),[...raw,raw[0]],[...raw].reverse(),raw.map((r,i)=>i?{...r,role:'non-api'}:r)])assert.throws(()=>verifier({rows}).acquire(),/schema\/specimen vector/);
});
test('normal publication caller only: root package public alias incoming edge and second-argument changes reject',()=>{
 assert.throws(()=>verifier().acquire('/tmp'),/canonical root\/cwd/);assert.throws(()=>verifier({cwd:'/tmp'}).acquire(),/canonical root\/cwd/);
 const b=fs.readFileSync(path.join(root,caller),'utf8'),changed=b.replace('validateEmbeddedYaml(root)','validateEmbeddedYaml(root, { corrupt: "unreviewed" })');assert.notEqual(changed,b);assert.throws(()=>verifier({overrides:new Map([[path.join(root,caller),Buffer.from(changed)]])}).acquire(),/fixed source\/input/);
 const p=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(p));pkg.scripts['run:unreviewed']='node '+source;assert.throws(()=>verifier({overrides:new Map([[p,Buffer.from(JSON.stringify(pkg))]])}).acquire(),/fixed source\/input/);
 const extra=structuredClone(graph);extra.edges.push({source:'scripts/other.mjs',target:source,kind:'import',operation:'import validator'});assert.throws(()=>verifier({selectedGraph:extra}).acquire(),/sole publication consumer/);
 const alias=structuredClone(graph);alias.publicEntries.push({path:'scripts/alias.mjs',canonicalSource:source});assert.throws(()=>verifier({selectedGraph:alias}).acquire(),/public alias/);
 const newCaller=structuredClone(graph);newCaller.edges.push({source:'scripts/other.mjs',target:caller,kind:'import',operation:'import publication'});assert.throws(()=>verifier({selectedGraph:newCaller}).acquire(),/child graph boundary/);
 const aliasCaller=structuredClone(graph);aliasCaller.publicEntries.push({path:'scripts/caller-alias.mjs',canonicalSource:caller});assert.throws(()=>verifier({selectedGraph:aliasCaller}).acquire(),/child graph boundary/);
 assert.throws(()=>verifier({badParent:path.join(root,'scripts')}).acquire(),/regular input/);
 const input=path.join(root,'scripts/docs-api-authority-lock.json');assert.throws(()=>verifier({alias:input}).acquire(),/physical input/);assert.throws(()=>verifier({hardlink:input}).acquire(),/regular input/);assert.throws(()=>verifier({tempAlias:true}).acquire(),/temporary base/);
});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fakeMaterialization({corrupt=null,failWriteAt=0,validatorFailure=null,cleanupFailure=false}={}){
 const directory=path.join(os.tmpdir(),'kubeclaw-embedded-yaml-CONTROLLED'),ids=['cilium-denial-template','pvc-probe-template','pod-probe-template'],token=name=>'$'+'{'+name+'}',files=new Map(),writes=[],attempts=[],calls=[],cleanup=[],rootReads=[];
 const kubernetes=Buffer.from(JSON.stringify({definitions:{'io.k8s.api.core.v1.PersistentVolumeClaim':{type:'object'},'io.k8s.api.core.v1.Pod':{type:'object'}}})),cilium=Buffer.from('spec:\n  versions:\n    - name: v2\n      schema:\n        openAPIV3Schema:\n          type: object\n');
 const a=zlib.gzipSync(kubernetes),b=zlib.gzipSync(cilium),record=(p,c,d)=>({path:p,compressedSize:c.length,compressedSha256:hash(c),contentSha256:hash(d)}),lock={kubernetes:record('controlled-kubernetes.gz',a,kubernetes),customResources:{cilium:{crds:{CiliumNetworkPolicy:record('controlled-cilium.gz',b,cilium)}}}};
 const diagnose='cat <<EOF\napiVersion: cilium.io/v2\nkind: CiliumNetworkPolicy\nmetadata:\n  namespace: '+token('NAMESPACE')+'\nspec: {}\nEOF\n';
 const install='cat <<EOF\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: fixture-pvc\nspec:\n  storageClassName: '+token('PREFLIGHT_STORAGE_CLASS')+'\n  resources:\n    requests:\n      storage: '+token('PREFLIGHT_STORAGE_REQUEST')+'\nEOF\ncat <<EOF\napiVersion: v1\nkind: Pod\nmetadata:\n  name: fixture-pod\nspec:\n  containers:\n    - name: fixture\n      image: '+token('PREFLIGHT_IMAGE')+'\nEOF\n';
 const inputs=new Map([[path.join(root,'scripts/docs-api-authority-lock.json'),Buffer.from(JSON.stringify(lock))],[path.join(root,'controlled-kubernetes.gz'),a],[path.join(root,'controlled-cilium.gz'),b],[path.join(root,'versions.json'),Buffer.from(JSON.stringify({buildArgs:{OPS_NODE_BASE:'controlled-image'}}))],[path.join(root,'docs/site/use/diagnose.md'),Buffer.from('CONTROLLED_DIAGNOSE')],[path.join(root,'docs/site/use/install.md'),Buffer.from('CONTROLLED_INSTALL')]]);
 const fakeFs={readFileSync:(p,encoding)=>{rootReads.push(p);const x=inputs.get(p);assert(x,p);return encoding?x.toString(encoding):x;},mkdtempSync:prefix=>{assert.equal(prefix,path.join(os.tmpdir(),'kubeclaw-embedded-yaml-'));return directory;},writeFileSync:(p,content)=>{attempts.push(p);assert.equal(path.dirname(p),directory);assert(ids.some(id=>p===path.join(directory,id+'.json')||p===path.join(directory,id+'.yaml')));if(failWriteAt===attempts.length)throw Error('controlled write failure');files.set(p,content);writes.push({path:p,content});},rmSync:(p,options)=>{cleanup.push({path:p,options});assert.equal(p,directory);assert.equal(options.recursive,true);assert.equal(options.force,true);if(cleanupFailure)throw Error('controlled cleanup failure');files.clear();}};
 const spawnSync=(tool,args,options)=>{
  const index=calls.length,id=ids[index],schema=path.join(directory,id+'.json'),specimen=path.join(directory,id+'.yaml');
  assert.equal(tool,'kubeconform');assert.deepEqual(Array.from(args),['-strict','-summary','-output','json','-kubernetes-version','1.35.0','-schema-location',schema,specimen]);assert.equal(options.timeout,30000);assert.equal(options.maxBuffer,4*1024*1024);assert.equal(options.env.HOME,directory);assert.equal(options.env.LANG,'C.UTF-8');assert.equal(options.env.PATH,'CONTROLLED_BIN');
  assert(files.has(schema)&&files.has(specimen));const value=YAML.parse(files.get(specimen));assert(value.apiVersion&&value.kind);calls.push({tool,args:Array.from(args),home:options.env.HOME,value,schema:JSON.parse(files.get(schema))});
  if(validatorFailure==='status'||typeof value.spec==='string')return{status:1,stdout:'controlled invalid',stderr:'controlled failure'};
  if(validatorFailure==='parse')return{status:0,stdout:'not JSON',stderr:''};
  if(validatorFailure==='summary')return{status:0,stdout:JSON.stringify({summary:{valid:0,invalid:1,errors:0,skipped:0}}),stderr:''};
  if(validatorFailure==='spawn')return{error:new Error('controlled spawn failure')};
  return{status:0,stdout:JSON.stringify({summary:{valid:1,invalid:0,errors:0,skipped:0}}),stderr:''};
 };
 const context=vm.createContext({assert,crypto,fs:fakeFs,os:{tmpdir:()=>os.tmpdir()},path,zlib,YAML,spawnSync,process:{env:{PATH:'CONTROLLED_BIN'}},publicationExampleBlocks:text=>text==='CONTROLLED_DIAGNOSE'?Array.from({length:22},(_,i)=>({content:i===21?diagnose:''})):Array.from({length:10},(_,i)=>({content:i===9?install:''}))});
 vm.runInContext(statement(helperTree,'sha')+'\n'+declaration(helperTree,'validateEmbeddedYaml')+'\nglobalThis.validate=validateEmbeddedYaml;',context);
 let result,error;try{result=context.validate(root,{corrupt});}catch(e){error=e;}
 return{result,error,writes,attempts,calls,cleanup,residual:files.size,rootReads,ids,directory};
}
test('actual sealed materialization body uses only fake FS/validator: three IDs six local paths and cleanup',()=>{
 const r=fakeMaterialization();assert.ifError(r.error);assert.equal(r.result.results.length,3);assert.equal(r.calls.length,3);assert.equal(r.writes.length,6);assert.deepEqual(Array.from(r.result.results,x=>x.id),r.ids);
 assert.deepEqual(r.writes.map(x=>x.path),r.ids.flatMap(id=>[path.join(r.directory,id+'.json'),path.join(r.directory,id+'.yaml')]));assert.equal(r.cleanup.length,1);assert.equal(r.residual,0);
 assert.equal(r.calls[0].value.kind,'CiliumNetworkPolicy');assert.equal(r.calls[1].value.kind,'PersistentVolumeClaim');assert.equal(r.calls[2].value.kind,'Pod');assert.equal(r.result.kubectlClusterCiliumEnforcementOrWorkloadExecution,false);
});
test('known corruption and write/status/parser/summary failures attempt owned cleanup without rollback guarantee',()=>{
 for(const corrupt of ['cilium-denial-template','pvc-probe-template','pod-probe-template']){const r=fakeMaterialization({corrupt});assert(r.error);assert.equal(r.cleanup.length,1);assert.equal(r.residual,0);}
 for(const validatorFailure of ['status','parse','summary','spawn']){const r=fakeMaterialization({validatorFailure});assert(r.error);assert.equal(r.cleanup.length,1);}
 const write=fakeMaterialization({failWriteAt:2});assert(write.error);assert.equal(write.writes.length,1);assert.equal(write.calls.length,0);assert.equal(write.cleanup.length,1);
 const cleanup=fakeMaterialization({cleanupFailure:true});assert(cleanup.error);assert.equal(cleanup.cleanup.length,1);assert(cleanup.residual>0); // no universal persistence/rollback promise
});
