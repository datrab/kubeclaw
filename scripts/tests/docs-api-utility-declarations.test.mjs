import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createSerializedOutputRoleClassifier,classifySerializedOutputRoles,deriveNativeOperationFacts,nativeOperationFactDigest} from '../docs-api-output-role-classification.mjs';
const repository=path.resolve(path.dirname(fs.realpathSync(new URL('../observability-retirement/files.mjs',import.meta.url))),'../..');
const targets=['scripts/observability-retirement/files.mjs','skills/buster/engine/test-gates/native-fixture-journal.ts','skills/common/plugin-runtime/foundation/config/published-pair.ts','skills/common/plugins/runtime-dispatch/src/result-persistence.ts'];
const registryPath='scripts/docs-api-producer-adapter-authorities.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
// Source copies are inert AST inputs. None of these copied product modules is
// imported/evaluated and no product/API/host command runs in this fixture.
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'api-utility-ast-'));
 const write=(p,b)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),b);};
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 try{
  for(const directory of ['skills','contracts'])fs.cpSync(path.join(repository,directory),path.join(root,directory),{recursive:true});
  for(const p of ['scripts/observability-retirement/files.mjs','scripts/build-runtime-role-bundle.mjs'])write(p,fs.readFileSync(path.join(repository,p)));
  const packages=path.join(repository,'node_modules/@kubeclaw');fs.mkdirSync(path.join(root,'node_modules/@kubeclaw'),{recursive:true});
  for(const name of fs.readdirSync(packages)){const target=fs.realpathSync(path.join(packages,name)),relative=path.relative(repository,target);assert(!relative.startsWith('../'));fs.symlinkSync(path.join(root,relative),path.join(root,'node_modules/@kubeclaw',name),'dir');}
  const original=JSON.parse(fs.readFileSync(path.join(repository,registryPath)));
  const registry={nonApiOutputContracts:original.nonApiOutputContracts.filter(r=>targets.includes(r.source)),nativeFileWriterCapabilities:original.nativeFileWriterCapabilities.filter(r=>targets.includes(r.source)),nativeFileWriterCallContracts:[]};
  write(registryPath,JSON.stringify(registry));write('package.json','{}');
  const update=change=>{const next=JSON.parse(read(registryPath));change(next);write(registryPath,JSON.stringify(next));};
  run({root,write,read,update});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
for(const source of targets)test('exact API-capable declaration remains a capability, not a private projection: '+source,()=>fixture(({root})=>{
 const roles=classifySerializedOutputRoles(root,source),utility=roles.filter(r=>r.role==='api-capable-utility');assert(utility.length>0);
 for(const role of utility){assert.equal(role.closedWriterDeclaration,undefined);assert.equal(role.apiUtilityDeclaration.source,source);assert.equal(role.apiUtilityDeclaration.sourceSha256,sha(fs.readFileSync(path.join(root,source))));}
}));
for(const source of targets)test('warm changed utility Source cannot borrow old declaration or refreshed metadata: '+source,()=>fixture(({root,write,read,update})=>{
 const classify=createSerializedOutputRoleClassifier(root);assert(classify(source).some(r=>r.role==='api-capable-utility'));
 write(source,read(source)+'\n// changed exact Source\n');
 update(registry=>{for(const r of registry.nonApiOutputContracts)if(r.source===source){r.sourceSha256=sha(read(source));}});
 const roles=classify(source);assert(!roles.some(r=>r.role==='api-capable-utility'));assert(roles.some(r=>r.role==='unknown'||r.role==='api'));
}));
test('forged console role/basis/receipt fields do not create either internal receipt',()=>fixture(({root,write})=>{
 const source='tools/forged.mjs',expression="'complete'";write(source,"console.log('complete');\n");const selectors=[{expression}],facts=deriveNativeOperationFacts(root,source,selectors);assert(facts);
 for(const basis of ['forged-private-projection','original-contained-result-artifact-file-capability']){
  write(registryPath,JSON.stringify({nonApiOutputContracts:[{source,sink:'console.log',expression,role:'api-capable-utility',basis,closedWriterDeclaration:{source,projectedCallers:[{}]},apiUtilityDeclaration:{source},operations:[{source,selectors,factsDigest:nativeOperationFactDigest(facts)}]}]}));
  assert.throws(()=>classifySerializedOutputRoles(root,source),/OUTPUT_ROLE_CLOSED_WRITER_PROJECTION_UNQUALIFIED/);
 }
}));
test('private bundle writer still projects all3 callers and warm escape rejects',()=>fixture(({root,write,read})=>{
 const source='scripts/build-runtime-role-bundle.mjs',classify=createSerializedOutputRoleClassifier(root);const roles=classify(source);assert.equal(roles.find(r=>r.role==='api-capable-utility').closedWriterDeclaration.projectedCallers.length,3);assert.equal(roles.filter(r=>r.sink==='native-file-writer-call').length,3);
 write(source,read(source)+'\nconst escapedWriter=writeFile;\n');assert.throws(()=>classify(source),/OUTPUT_ROLE_CLOSED_WRITER_PROJECTION_UNQUALIFIED/);
}));
for(const [specifier,call]of [
 ['./../skills/common/plugins/runtime-dispatch/src/result-persistence.ts',"persistResult('/repo','result.json',PAYLOAD)"],
 ['@kubeclaw/plugin-foundation/config/published-pair',"publishJsonPair('/repo',['progress.json','pipeline.json'],[PAYLOAD,{ok:true}])"],
])if(call)for(const payload of ["{apiVersion:'v1',kind:'Secret',metadata:{name:'synthetic'}}",'process.argv[2]'])test('public writer caller root stays API/UNKNOWN despite refreshed AUTHOR-style call receipt: '+call+' '+payload,()=>fixture(({root,write,read,update})=>{
 const source='tools/caller.mjs',name=call.startsWith('persistResult')?'persistResult':'publishJsonPair',actualCall=call.replace('PAYLOAD',payload);write(source,`import {${name}} from '${specifier}';\n${actualCall};\n`);
 const selectors=[{expression:actualCall}],facts=deriveNativeOperationFacts(root,source,selectors);assert(facts);
 update(registry=>registry.nativeFileWriterCallContracts.push({source,call:actualCall,basis:'original-native-writer-caller-consumer-contract',operations:[{source,selectors,factsDigest:nativeOperationFactDigest(facts)}]}));
 const roles=classifySerializedOutputRoles(root,source),published=roles.find(r=>r.sink==='native-file-writer-call');assert(published);assert.equal(published.role,payload.startsWith('{')?'api':'unknown');
}));
test('deleting mutable native-writer capability metadata cannot erase Source-owned caller publications',()=>fixture(({root,write,update})=>{
 update(registry=>{registry.nativeFileWriterCapabilities=[];});
 for(const [name,specifier,call]of [
  ['persistResult','../skills/common/plugins/runtime-dispatch/src/result-persistence.ts',"persistResult('/repo','result.json',process.argv[2])"],
  ['publishJsonPair','@kubeclaw/plugin-foundation/config/published-pair',"publishJsonPair('/repo',['progress.json','pipeline.json'],[process.argv[2],{}])"],
 ]){const source='tools/'+name+'.mjs';write(source,`import {${name}} from '${specifier}';\n${call};\n`);assert.equal(classifySerializedOutputRoles(root,source).find(r=>r.sink==='native-file-writer-call')?.role,'unknown');}
}));
test('warm operation receipts reacquire changed receiver dependency facts, not old cached true',()=>fixture(({root,write,read})=>{
 const source=targets[1],classify=createSerializedOutputRoleClassifier(root);assert(classify(source).some(r=>r.role==='api-capable-utility'));
 const dependency='skills/buster/engine/test-gates/native-fixture-state.ts',before=read(dependency);
 const changed=before.replace('BUSTER_FIXTURE_', 'CHANGED_FIXTURE_');assert.notEqual(changed,before);write(dependency,changed);
 const roles=classify(source);assert(!roles.some(r=>r.role==='api-capable-utility'),'changed selected receiver dependency retained old operation authority');assert(roles.some(r=>r.role==='unknown'||r.role==='api'));
}));
test('import alias preserves literal encoded API root and unknown wrapper caller selection',()=>fixture(({root,write})=>{
 const source='tools/alias.mjs';
 write(source,"import {persistResult as save} from '../skills/common/plugins/runtime-dispatch/src/result-persistence.ts';save('/repo','result.json','{\"apiVersion\":\"v1\",\"kind\":\"Secret\"}');\n");
 assert.equal(classifySerializedOutputRoles(root,source).find(r=>r.sink==='native-file-writer-call')?.role,'api');
 write(source,"import {persistResult as save} from '../skills/common/plugins/runtime-dispatch/src/result-persistence.ts';export function forward(value){save('/repo','result.json',value);}\n");
 assert.equal(classifySerializedOutputRoles(root,source).find(r=>r.sink==='native-file-writer-call')?.role,'unknown');
}));
for(const [name,body]of [
 ['inventory',"import {Inventory} from '../scripts/observability-retirement/files.mjs';const inventory=new Inventory();console.log(JSON.stringify(inventory.json(process.argv[2])));"],
 ['fixture journal',"import {FileBusterFixtureJournal} from '../skills/buster/engine/test-gates/native-fixture-journal.ts';const journal=new FileBusterFixtureJournal('/fixture',{maximumRecords:1,maximumStateBytes:1,maximumBlobBytes:1,maximumTotalBytes:1});console.log(JSON.stringify(await journal.snapshot()));"],
])test('API-capable reader declaration does not qualify new stdout forwarding: '+name,()=>fixture(({root,write})=>{
 const source='tools/reader.mjs';write(source,body);const role=classifySerializedOutputRoles(root,source).find(r=>r.sink==='console.log');assert(role);assert(['api','unknown'].includes(role.role));
}));
test('mutable declaration role downgrade cannot relabel the four Source-owned capabilities non-API',()=>fixture(({root,update})=>{
 update(registry=>{for(const contract of registry.nonApiOutputContracts)if(contract.role==='api-capable-utility'){contract.role='non-api';contract.basis='pretend-diagnostic';}});
 for(const source of targets){const utility=classifySerializedOutputRoles(root,source).find(r=>r.apiUtilityDeclaration);assert(utility);assert.equal(utility.role,'api-capable-utility');}
}));
test('fresh but unrelated operation metadata cannot renew a selected utility receiver',()=>fixture(({root,write,read,update})=>{
 const source=targets[0],selectors=[{symbol:'stableStat'}],facts=deriveNativeOperationFacts(root,source,selectors);assert(facts);
 update(registry=>{const contract=registry.nonApiOutputContracts.find(r=>r.source===source&&r.role==='api-capable-utility');contract.operations=[{source,selectors,factsDigest:nativeOperationFactDigest(facts)}];});
 const roles=classifySerializedOutputRoles(root,source);assert(!roles.some(r=>r.role==='api-capable-utility'));assert(roles.some(r=>r.role==='unknown'));
}));
// Regression: namespace syntax cannot erase a Source-owned publication sink.
// All scanned modules and calls below are inert AST, never evaluated.
for(const [name,specifier,args]of [
 ['persistResult','../skills/common/plugins/runtime-dispatch/src/result-persistence.ts',payload=>`'/repo','result.json',${payload}`],
 ['publishJsonPair','../skills/common/plugin-runtime/foundation/config/published-pair.ts',payload=>`'/repo',['one.json','two.json'],[${payload},{}]`],
])test('Source-owned writer selection survives finite aliases and opaque namespace escapes: '+name,()=>fixture(({root,write,update})=>{
 update(registry=>{registry.nativeFileWriterCapabilities=[];});
 const source='tools/namespace.mjs',prefix=`import * as writer from '${specifier}';`;
 const finite=[
  ['named',payload=>`import {${name}} from '${specifier}';${name}(${args(payload)});`],
  ['namespace dot',payload=>`${prefix}writer.${name}(${args(payload)});`],
  ['finite string',payload=>`${prefix}writer['${name}'](${args(payload)});`],
  ['namespace alias',payload=>`${prefix}const other=writer;other.${name}(${args(payload)});`],
  ['member alias',payload=>`${prefix}const save=writer.${name};save(${args(payload)});`],
  ['destructuring alias',payload=>`${prefix}const {${name}:save}=writer;save(${args(payload)});`],
 ];
 for(const [label,body]of finite)for(const payload of ['process.argv[2]',"{apiVersion:'v1',kind:'Secret'}"]){
  write(source,body(payload));const roles=classifySerializedOutputRoles(root,source),sinks=roles.filter(role=>role.sink==='native-file-writer-call');
  assert.equal(sinks.length,1,label+' lost or duplicated native publication');assert.equal(sinks[0].role,payload.startsWith('{')?'api':'unknown',label);assert(!roles.some(role=>role.role==='non-api'));
 }
 for(const body of [
  `${prefix}writer[process.argv[3]](${args('process.argv[2]')});`,
  `${prefix}const other=writer;other[process.argv[3]](${args('process.argv[2]')});`,
  `${prefix}let other=writer;other=process.argv[3];other.${name}(${args('process.argv[2]')});`,
  `${prefix}let save=writer.${name};save=process.argv[3];save(${args('process.argv[2]')});`,
  `${prefix}consume(writer.${name});`,
  `${prefix}consume(writer);`,
  `${prefix}export function escaped(){return writer.${name};}`,
  `${prefix}const container={save:writer.${name}};container.save(${args('process.argv[2]')});`,
 ]){
  write(source,body);const roles=classifySerializedOutputRoles(root,source);assert(roles.some(role=>role.role==='unknown'),'opaque/escaped writer vanished: '+body);assert(!roles.some(role=>role.role==='non-api'));
 }
}));
test('same export spelling in an unrelated namespace cannot borrow Source-owned writer identity',()=>fixture(({root,write})=>{
 write('tools/unrelated.mjs','export function persistResult(root,name,value){return value;}');
 write('tools/caller.mjs',"import * as writer from './unrelated.mjs';writer.persistResult('/repo','result.json',process.argv[2]);");
 assert.equal(classifySerializedOutputRoles(root,'tools/caller.mjs').filter(role=>role.sink==='native-file-writer-call').length,0);
}));
for(const [name,utility,args]of [
 ['persistResult','skills/common/plugins/runtime-dispatch/src/result-persistence.ts',"'/repo','result.json',{apiVersion:'v1',kind:'Secret'}"],
 ['publishJsonPair','skills/common/plugin-runtime/foundation/config/published-pair.ts',"'/repo',['one.json','two.json'],[{apiVersion:'v1',kind:'Secret'},{}]"],
])test('warm namespace capability reacquires changed exact receiver Source: '+name,()=>fixture(({root,write,read})=>{
 const source='tools/warm-namespace.mjs';write(source,`import * as writer from '../${utility}';writer['${name}'](${args});`);
 const classify=createSerializedOutputRoleClassifier(root);assert.equal(classify(source).find(role=>role.sink==='native-file-writer-call')?.role,'api');
 const changed=read(utility).replace('function '+name+'(', 'function changedWriter(');assert.notEqual(changed,read(utility));write(utility,changed);
 const after=classify(source);assert.equal(after.filter(role=>role.sink==='native-file-writer-call').length,0,'stale resolved callable survived receiver change');assert(after.some(role=>role.role==='unknown'),'unresolved namespace capability disappeared');
}));
// Descriptor syntax cannot establish the role of separately copied file DATA.
for(const [name,body,call]of [
 ['staging',"import {stageEvidenceFiles} from '../skills/buster/engine/test-gates/artifacts.ts';const declarations=[{evidenceId:'x',type:'artifact',file:'api.json',mediaType:'application/octet-stream'}];",'stageEvidenceFiles(process.argv[2],process.argv[3],declarations,1,4096)'],
 ['store',"import {FileEvidenceStore} from '../skills/buster/engine/test-gates/artifacts.ts';const store=new FileEvidenceStore('/output');const declaration={evidenceId:'x',type:'artifact',file:'api.json',mediaType:'application/octet-stream'};","store.store('attempt',process.argv[2],declaration,4096)"],
])test('opaque contained-file DATA survives descriptor shape, fresh/deleted/forged receipts and warm receiver changes: '+name,()=>fixture(({root,write,read,update})=>{
 const source='tools/opaque.mjs',writer='skills/buster/engine/test-gates/artifacts.ts';write(source,body+call+';');
 // The descriptor deliberately names actual API-bearing fixture bytes, but no
 // copied product module is evaluated and the AST analyzer must not infer a
 // non-API role from the declaration or the media type.
 write('api.json','{"apiVersion":"v1","kind":"Secret","metadata":{"name":"synthetic"}}');
 const classify=createSerializedOutputRoleClassifier(root);
 const check=classifier=>{const sinks=classifier(source).filter(r=>r.sink==='native-file-writer-call');assert.equal(sinks.length,1);assert.equal(sinks[0].role,'unknown');assert.equal(sinks[0].basis,'opaque-contained-file-DATA-not-descriptor-shape');};
 check(classify);check(s=>classifySerializedOutputRoles(root,s));
 const selectors=[{expression:call}],facts=deriveNativeOperationFacts(root,source,selectors);assert(facts);
 update(registry=>{registry.nativeFileWriterCapabilities=[];registry.nativeFileWriterCallContracts=[{source,call,basis:'pretend-reviewed-descriptor',operations:[{source,selectors,factsDigest:nativeOperationFactDigest(facts)}]}];});
 check(classify);check(s=>classifySerializedOutputRoles(root,s));
 update(registry=>{registry.nativeFileWriterCapabilities=[{source:writer,export:'stageEvidenceFiles',inputParameter:'maximumBytes',operations:[]},{source:writer,class:'FileEvidenceStore',method:'store',inputParameter:'maximumBytes',operations:[]}];});
 check(s=>classifySerializedOutputRoles(root,s));
 write(writer,read(writer).replace("flag: 'wx'","flag: 'w'"));check(classify);check(s=>classifySerializedOutputRoles(root,s));
}));
// Physical DATA publication must be at least as conservative as its callers.
test('physical contained-file writes cannot inherit stale or forged non-API DATA receipts',()=>fixture(({root,write,read,update})=>{
 const source='skills/buster/engine/test-gates/artifacts.ts';
 const original=JSON.parse(fs.readFileSync(path.join(repository,registryPath))).nonApiOutputContracts.filter(r=>r.source===source);
 assert(original.length>0);update(registry=>{registry.nonApiOutputContracts.push(...original);});
 const classify=createSerializedOutputRoleClassifier(root);
 const check=classifier=>{const writes=classifier(source).filter(r=>r.sink==='fs.writeFileSync');assert.equal(writes.length,2);for(const role of writes){assert.equal(role.role,'unknown');assert.equal(role.basis,'opaque-contained-file-DATA-physical-publication');}};
 check(classify);check(s=>classifySerializedOutputRoles(root,s));
 const selectors=[{symbol:'stageEvidenceFiles'},{symbol:'FileEvidenceStore'}];
 const refresh=()=>{const facts=deriveNativeOperationFacts(root,source,selectors);assert(facts);update(registry=>{registry.nonApiOutputContracts=[{source,sink:'fs.writeFileSync',expression:'content',role:'non-api',basis:'forged-fresh-file-DATA-receipt',operations:[{source,selectors,factsDigest:nativeOperationFactDigest(facts)}]}];});};
 refresh();check(classify);check(s=>classifySerializedOutputRoles(root,s));
 update(registry=>{registry.nonApiOutputContracts=[];registry.nativeFileWriterCapabilities=[];});check(classify);
 write(source,read(source).replace('const content = await readContainedFile(evidenceRoot, declaration.file, maximumBytes - total, signal);',`const content = Buffer.from('apiVersion: v1\\nkind: Secret\\nmetadata: {name: synthetic}\\n');`));
 refresh();check(classify);check(s=>classifySerializedOutputRoles(root,s));
}));

// Source interface identity only adds an UNKNOWN obligation. Custom stores can
// publish arbitrary DATA; a TypeScript annotation cannot validate their bytes.
test('original and custom EvidenceStore private-field publications remain visible UNKNOWN',()=>fixture(({root,write,update})=>{
 const original='skills/buster/engine/test-gates/runner.ts';
 const checkOriginal=()=>{const roles=classifySerializedOutputRoles(root,original);const role=roles.find(r=>r.sink==='native-file-writer-call'&&r.line===1924);assert(role,'original interface publication missing');assert.equal(role.role,'unknown');assert.equal(role.basis,'opaque-contained-file-DATA-not-descriptor-shape');};
 checkOriginal();update(registry=>{registry.nativeFileWriterCapabilities=[];registry.nativeFileWriterCallContracts=[];});checkOriginal();
 for(const initializer of ["new FileEvidenceStore('/output')","custom"]){
  const source='tools/interface.ts';write(source,`import {FileEvidenceStore,type EvidenceStore as Store} from '../skills/buster/engine/test-gates/artifacts.ts';
 export class Collector {readonly #store:Store;constructor(custom:Store){this.#store=${initializer};}collect(){return this.#store.store('attempt','/input',{evidenceId:'x',type:'artifact',file:'api.json'},4096);}}`);
  const check=classifier=>{const roles=classifier(source).filter(r=>r.sink==='native-file-writer-call');assert.equal(roles.length,1);assert.equal(roles[0].role,'unknown');};
  const classify=createSerializedOutputRoleClassifier(root);check(classify);check(s=>classifySerializedOutputRoles(root,s));
  write(source,fs.readFileSync(path.join(root,source),'utf8').replace("file:'api.json'","file:'api.json',apiVersion:'v1',kind:'Secret'"));check(classify);
 }
 write('tools/unrelated.ts',`interface EvidenceStore {store(...args:unknown[]):unknown;}export class Collector {#store:EvidenceStore;collect(){return this.#store.store({apiVersion:'v1',kind:'Secret'});}}`);
 assert.equal(classifySerializedOutputRoles(root,'tools/unrelated.ts').filter(r=>r.sink==='native-file-writer-call').length,0);
}));
