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
import {publicationExampleBlocks} from '../lib/docs-publication-example-coverage.mjs';
import {assertPublicationExampleChildPurpose,publicationClaimsPurposeInputBytes} from '../docs-documentation-owner-purpose-custody.mjs';
const root=path.resolve(import.meta.dirname,'../..'),modulePath='scripts/docs-api-output-discovery.mjs',source='scripts/docs-publication-embedded-yaml.mjs',caller='scripts/docs-publication-examples.mjs';
const code=fs.readFileSync(path.join(root,modulePath),'utf8'),tree=ts.createSourceFile(modulePath,code,ts.ScriptTarget.Latest,true),graph=discoverScriptInputGraph(root),raw=classifySerializedOutputRoles(root,source);
const statement=(t,name)=>{const n=t.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(t)===name));assert(n,name);return n.getText(t);};
const declaration=(t,name)=>{const n=t.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(t).replace('export function','function');};
function verifier({overrides=new Map(),cwd=root,selectedGraph=graph,alias=null,hardlink=null,badParent=null,tempAlias=false,nativeFacts=undefined,rows=raw}={}){
 const reader={...fs,readFileSync:(file,...args)=>overrides.has(String(file))?(args[0]?overrides.get(String(file)).toString(args[0]):overrides.get(String(file))):fs.readFileSync(file,...args),
  realpathSync:file=>String(file)===alias||tempAlias&&String(file)===os.tmpdir()?String(file)+'.alias':fs.realpathSync(file),
  lstatSync:file=>{const s=fs.lstatSync(file);return String(file)===hardlink||String(file)===badParent?{...s,nlink:String(file)===hardlink?2:s.nlink,isFile:()=>s.isFile(),isDirectory:()=>String(file)===badParent?false:s.isDirectory(),isSymbolicLink:()=>s.isSymbolicLink()}:s;}
 };
 const context=vm.createContext({assert,fs:reader,os,path,process:{cwd:()=>cwd},hash:b=>crypto.createHash('sha256').update(b).digest('hex'),deriveNativeOperationFacts:(...args)=>nativeFacts??deriveNativeOperationFacts(...args),nativeOperationFactDigest,shellNativeNodeEntries,expandReviewedNodePackageGlob,assertPublicationExampleChildPurpose,publicationClaimsPurposeInputBytes});
 const body=statement(tree,'isReviewedPracticalReaderGraphRoot')+'\n'+statement(tree,'reviewedPublicationYamlValidationInputs')+'\n'+statement(tree,'publicationYamlValidationReceipts')+'\n'+['documentationEntryPoints','publicationYamlValidationDescriptor','checkedPublicationYamlValidationInputs','selectedPublicationYamlValidationInput'].map(n=>declaration(tree,n)).join('\n');
 vm.runInContext(body+'\nglobalThis.api={acquire:checkedPublicationYamlValidationInputs,slot:selectedPublicationYamlValidationInput};',context);context.rawJSON=JSON.stringify(rows);const classify=()=>vm.runInContext('JSON.parse(rawJSON)',context);
 return{acquire:(selectedRoot=root)=>context.api.acquire(selectedRoot,selectedGraph,classify,[source]),slot:(role,receipt,selectedSource=source)=>context.api.slot(selectedSource,role,receipt)};
}
test('one explicit-preparation schema purpose retains raw UNKNOWN and grants no normal-check write',()=>{
 const v=verifier(),r=v.acquire();assert.equal(raw.length,1);assert(raw.every(x=>x.role==='unknown'));
 assert.equal(v.slot(raw[0],r).kind,'explicit-preparation-schema-artifact');assert.equal(v.slot(raw[0],r).normalCheckWrites,false);
 assert(r.slots.every(x=>!x.runtimeExecutionAuthorized&&!x.apiApplyAuthorized&&!x.schemaSemanticsNewlyApproved));
 assert.equal(r.preparedSchemaFileNames.length,3);assert.equal(r.nativeValidatorSuccessObserved,false);assert.equal(r.preparationExecutionAuthorized,false);assert.equal(r.normalValidationReadOnly,true);
 assert.throws(()=>v.slot(raw[0],{...r}),/unacquired/);assert.equal(v.slot(raw[0],r,'scripts/arbitrary.mjs'),false);
});
const helperCode=fs.readFileSync(path.join(root,source),'utf8'),helperTree=ts.createSourceFile(source,helperCode,ts.ScriptTarget.Latest,true);
function variableText(name){let result;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(helperTree)===name)result=n.getText(helperTree);ts.forEachChild(n,visit);}visit(helperTree);assert(result,name);return result;}
test('schema identity path stdin strict validator and prepared exact-byte guards remain bound',()=>{
 const mutations=[
  s=>s.replace('cilium-denial-template','unreviewed-id'),
  s=>s.replace("item.id+'.json'","'../outside.json'"),
  s=>s.replace('for (const item of materials)','for (const item of [...materials].reverse())'),
  s=>s.replace('JSON.stringify(schema)','arbitraryCallback(schema)'),
  s=>s.replace("spawnSync('kubeconform'","spawnSync('kubectl'"),
  s=>s.replace("'1.35.0'","'0.0.0'"),
  s=>s.replace("schemaPath, '-'","schemaPath, 'outside.yaml'"),
  s=>s.replace("fs.readFileSync(schemaPath,'utf8')","'unverified'"),
  s=>s+'\nfs.writeFileSync("outside.yaml","apiVersion: v1");\n'
 ];
 for(const mutate of mutations){const changed=mutate(helperCode);assert.notEqual(changed,helperCode);assert.throws(()=>verifier({overrides:new Map([[path.join(root,source),Buffer.from(changed)]])}).acquire(),/fixed source\/input/);}
});
test('block ordinals substitutions input identities authorities selectors and raw slots stay sealed',()=>{
 for(const [a,b]of [["diagnose.md', 22","diagnose.md', 21"],["install.md', 10","install.md', 9"],['mnt014-example','other-namespace']]){
  const changed=helperCode.replace(a,b);assert.notEqual(changed,helperCode);assert.throws(()=>verifier({overrides:new Map([[path.join(root,source),Buffer.from(changed)]])}).acquire(),/fixed source\/input/);
 }
 const lock=JSON.parse(fs.readFileSync(path.join(root,'scripts/docs-api-authority-lock.json')));
 for(const p of ['versions.json','scripts/docs-api-authority-lock.json',lock.kubernetes.path,lock.customResources.cilium.crds.CiliumNetworkPolicy.path,'scripts/lib/docs-publication-example-coverage.mjs','docs/site/use/diagnose.md','docs/site/use/install.md','docs/config/publication-example-claims.json']){
  const before=fs.readFileSync(path.join(root,p));
  // Malformed claims now fail in the real shared JSON-byte projection before
  // the old full fixed-input hash guard; every other input keeps its guard.
  const expected=p==='docs/config/publication-example-claims.json'?/DOCUMENTATION_PUBLICATION_CLAIMS_PURPOSE_DRIFT: JSON root/:/fixed source\/input/;
  assert.throws(()=>verifier({overrides:new Map([[path.join(root,p),Buffer.concat([before,Buffer.from('\nUNREVIEWED')])]])}).acquire(),expected);
 }
 const corruptFacts=structuredClone(deriveNativeOperationFacts(root,source,raw.map(r=>({expression:r.expression}))));corruptFacts[0].sha256='0'.repeat(64);assert.throws(()=>verifier({nativeFacts:corruptFacts}).acquire(),/selected native facts/);
 for(const rows of [raw.slice(1),[...raw,raw[0]],raw.map(r=>({...r,role:'non-api'}))])assert.throws(()=>verifier({rows}).acquire(),/explicit-preparation raw schema vector/);
});
test('normal publication caller only: root package public alias incoming edge and second-argument changes reject',()=>{
 assert.throws(()=>verifier().acquire('/tmp'),/canonical root\/cwd/);assert.throws(()=>verifier({cwd:'/tmp'}).acquire(),/canonical root\/cwd/);
 const b=fs.readFileSync(path.join(root,caller),'utf8'),changed=b.replace('validateEmbeddedYaml(root)','validateEmbeddedYaml(root, { corrupt: "unreviewed" })');assert.notEqual(changed,b);assert.throws(()=>verifier({overrides:new Map([[path.join(root,caller),Buffer.from(changed)]])}).acquire(),/fixed source\/input/);
 const p=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(p));pkg.scripts['run:unreviewed']='node '+source;assert.throws(()=>verifier({overrides:new Map([[p,Buffer.from(JSON.stringify(pkg))]])}).acquire(),/fixed source\/input/);
 const extra=structuredClone(graph);extra.edges.push({source:'scripts/other.mjs',target:source,kind:'import',operation:'import validator'});assert.throws(()=>verifier({selectedGraph:extra}).acquire(),/normal\/preparation consumers/);
 const alias=structuredClone(graph);alias.publicEntries.push({path:'scripts/alias.mjs',canonicalSource:source});assert.throws(()=>verifier({selectedGraph:alias}).acquire(),/public alias/);
 const newCaller=structuredClone(graph);newCaller.edges.push({source:'scripts/other.mjs',target:caller,kind:'import',operation:'import publication'});assert.throws(()=>verifier({selectedGraph:newCaller}).acquire(),/child graph boundary/);
 const aliasCaller=structuredClone(graph);aliasCaller.publicEntries.push({path:'scripts/caller-alias.mjs',canonicalSource:caller});assert.throws(()=>verifier({selectedGraph:aliasCaller}).acquire(),/child graph boundary/);
 assert.throws(()=>verifier({badParent:path.join(root,'scripts')}).acquire(),/regular input/);
 const input=path.join(root,'scripts/docs-api-authority-lock.json');assert.throws(()=>verifier({alias:input}).acquire(),/physical input/);assert.throws(()=>verifier({hardlink:input}).acquire(),/regular input/);
});
test('actual prepare/check bodies: prepared schemas only; validator consumes stdin with no named writes',()=>{
 const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'publication-schema-control-'))),calls=[];
 const guardedFs={...fs};let checking=false;
 for(const key of ['writeFileSync','mkdirSync','mkdtempSync','rmSync','renameSync','unlinkSync'])guardedFs[key]=(...args)=>{assert(!checking,'normal checker attempted '+key);return fs[key](...args);};
 const spawnSync=(command,args,options)=>{
  assert.equal(command,'kubeconform');assert.equal(args.at(-1),'-');assert.equal(options.env.HOME,'/nonexistent-kubeclaw-docs-validation');
  const value=YAML.parse(options.input);assert(value.apiVersion&&value.kind);
  assert(fs.existsSync(args.at(-2)));calls.push({value,args:Array.from(args)});
  if(typeof value.spec==='string')return{status:1,stdout:'controlled invalid',stderr:''};
  return{status:0,stdout:JSON.stringify({summary:{valid:1,invalid:0,errors:0,skipped:0}}),stderr:''};
 };
 const context=vm.createContext({assert,crypto,fs:guardedFs,path,zlib,YAML,spawnSync,process:{env:{PATH:'CONTROLLED_BIN',KUBECLAW_DOCS_PUBLICATION_SCHEMAS_DIR:directory}},publicationExampleBlocks});
 const functions=['embeddedYamlMaterials','schemaDirectory','prepareEmbeddedYamlSchemas','validateEmbeddedYaml'].map(name=>declaration(helperTree,name)).join('\n');
 vm.runInContext(statement(helperTree,'sha')+'\n'+functions+'\nglobalThis.api={prepareEmbeddedYamlSchemas,validateEmbeddedYaml};',context);
 try{
  context.api.prepareEmbeddedYamlSchemas(root);assert.equal(fs.readdirSync(directory).length,3);
  checking=true;const result=context.api.validateEmbeddedYaml(root);assert.equal(result.results.length,3);assert.equal(calls.length,3);
  for(const id of ['cilium-denial-template','pvc-probe-template','pod-probe-template'])assert.throws(()=>context.api.validateEmbeddedYaml(root,{corrupt:id}),/native embedded YAML/);
  checking=false;const first=path.join(directory,'cilium-denial-template.json'),original=fs.readFileSync(first);fs.appendFileSync(first,'\n');checking=true;
  assert.throws(()=>context.api.validateEmbeddedYaml(root),/INPUT_STALE/);checking=false;fs.writeFileSync(first,original);fs.unlinkSync(first);checking=true;
  assert.throws(()=>context.api.validateEmbeddedYaml(root),/ENOENT/);
 }finally{checking=false;fs.rmSync(directory,{recursive:true,force:true});}
});
