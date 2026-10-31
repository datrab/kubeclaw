import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import {spawnSync,execFileSync} from 'node:child_process';
import ts from 'typescript';
import { renderConfigurationFamilyHub } from '../docs-generate-core.mjs';

const root=path.resolve(import.meta.dirname,'../..'),source='scripts/docs-configuration-inventory.mjs';
const code=fs.readFileSync(path.join(root,source),'utf8'),tree=ts.createSourceFile(source,code,ts.ScriptTarget.Latest,true),declaration=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='buildConfigurationFamilyReference');
assert(declaration);const body=declaration.getText(tree),mapPath=path.join(root,'docs/config/configuration-family-map.json'),mapBytes=fs.readFileSync(mapPath),map=JSON.parse(mapBytes);
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'docs/generated/inventory',name)));
function run({changedMap=null,selection=null,changedSource=null,alias=null,hardlink=null,missingConsumer=null,mutateYaml=null,failBuilder=null}={}){
 let builders=0,authorities=0;const fakeFs={...fs,readFileSync:(file,...args)=>{
  let bytes=String(file)===mapPath&&changedMap?Buffer.from(JSON.stringify(changedMap)):fs.readFileSync(file);
  if(String(file)===changedSource)bytes=Buffer.concat([bytes,Buffer.from('\nUNQUALIFIED_SOURCE_CHANGE')]);return args[0]?bytes.toString(args[0]):bytes;
 },realpathSync:file=>String(file)===alias?String(file)+'.alias':fs.realpathSync(file),lstatSync:file=>{const stat=fs.lstatSync(file);return String(file)===hardlink||String(file)===missingConsumer?{...stat,nlink:String(file)===hardlink?2:stat.nlink,isFile:()=>String(file)===missingConsumer?false:stat.isFile(),isSymbolicLink:()=>stat.isSymbolicLink(),isDirectory:()=>stat.isDirectory()}:stat;}};
 const context=vm.createContext({assert,fs:fakeFs,path,crypto,root,argv:['--configuration-reference-only'],assertLocalHelmAuthorityRegistry:r=>{assert.equal(r,root);authorities++;},
 buildYamlInventory:options=>{builders++;assert.equal(options.selectedYamlOnly,true);if(failBuilder==='yaml')throw Error('controlled malformed selected YAML');const value=read('configuration-helm-values.json');mutateYaml?.(value);return value;},
 buildSchemaInventory:()=>{builders++;if(failBuilder==='schema')throw Error('controlled malformed selected schema');return read('configuration-schemas.json');},
 buildRuntimeInputInventory:yaml=>{builders++;assert(yaml.files.length);if(failBuilder==='runtime')throw Error('controlled unqualified receiver');return read('configuration-runtime-inputs.json');}});
 context.selectorJSON=JSON.stringify(selection??map.selectedSources);
 vm.runInContext('const selections=JSON.parse(selectorJSON);globalThis.yamlSources=()=>selections.yaml;globalThis.schemaSources=()=>selections.schemas;globalThis.runtimeTextSources=()=>selections.runtime;',context);
 vm.runInContext(body+'\nglobalThis.compose=buildConfigurationFamilyReference;',context);
 try{return{outputs:context.compose(),builders,authorities};}catch(error){return{error,builders,authorities};}
}
const sourceUrl=source=>`https://source.invalid/reviewed/${source}`;
test('configuration composition retains all three existing builders and a complete typed family/inverse relation',()=>{
 const r=run();assert.ifError(r.error);assert.equal(r.builders,3);assert.equal(r.authorities,1);const ref=r.outputs.get('configuration-families.json');
 assert.equal(ref.families.length,15);assert.equal(ref.sources.length,47);assert.equal(ref.composition.globalApiDiscoveryPassed,false);assert(ref.facts.length>1000);assert(ref.inverseConsumers.length>100);
 for(const family of ref.families)assert(ref.facts.some(fact=>fact.family===family.id));
 for(const fact of ref.facts)assert(fact.owner&&fact.consumer&&fact.defaultAndPrecedence&&fact.reloadOrRetention&&fact.sensitivity);
 const schemaRoles=new Set(ref.facts.filter(fact=>fact.kind==='schema-field').map(fact=>fact.consumerRole));assert(schemaRoles.has('registration-declaration'));assert(schemaRoles.has('implementation-evidence-not-runtime-observation'));
 assert(ref.facts.some(fact=>fact.kind==='secret-reference'));assert(ref.facts.some(fact=>fact.kind==='configured-environment-selector'));assert(ref.payloadBoundaries.some(row=>!row.executableBehaviorProved));
});
test('new removed or reordered YAML schema runtime selections fail before native builders',()=>{
 for(const kind of ['yaml','schemas','runtime'])for(const change of [values=>[...values,'unmapped/new-source'],values=>values.slice(1),values=>[...values].reverse()]){
  const selections=structuredClone(map.selectedSources);selections[kind]=change(selections[kind]);const r=run({selection:selections});assert.match(r.error.message,/SELECTED_SOURCE_DRIFT/);assert.equal(r.builders,0);
 }
});
test('a map member reclassification missing family or missing inverse cannot alter the sealed receipt',()=>{
 const mutations=[m=>m.sources.push({...m.sources[0],source:'unmapped.mjs'}),m=>m.sources.pop(),m=>m.sources.find(row=>row.disposition==='validation-output').disposition='configuration-producer',m=>m.families.pop(),m=>m.families[0].owner='',m=>m.sources.find(row=>row.facts.length).facts[0].consumer='unmapped.mjs'];
 for(const mutate of mutations){const changed=structuredClone(map);mutate(changed);assert.notDeepEqual(changed,map);const r=run({changedMap:changed});assert.match(r.error.message,/MAP_IDENTITY/);assert.equal(r.builders,0);}
});
test('changed physical source alias hardlink and missing actual inverse receiver refuse before builders',()=>{
 const target=path.join(root,map.sources[0].source);
 for(const options of [{changedSource:target},{changedSource:path.join(root,'packaging/runtime/package-ownership.json')},{changedSource:path.join(root,'packaging/runtime/roles/nova.json')},{alias:target},{hardlink:target},{missingConsumer:path.join(root,'skills/prism/config/database-bootstrap.ts')}]){
  const r=run(options);assert(r.error);assert.match(r.error.message,/SOURCE_IDENTITY|PHYSICAL_SOURCE|INVERSE_CONSUMER_MISSING/);assert.equal(r.builders,0);
 }
});
test('native builder refusals and missing active field inverse contracts remain terminal',()=>{
 for(const failBuilder of ['yaml','schema','runtime']){const r=run({failBuilder});assert.match(r.error.message,/controlled/);}
 const r=run({mutateYaml:yaml=>{const field=yaml.files.flatMap(file=>file.documents).flatMap(doc=>doc.fields).find(field=>field.path!=='$'&&field.consumers.length);assert(field);field.consumers=[];}});assert.match(r.error.message,/FIELD_INVERSE_CONSUMER_MISSING/);
});
test('inverse data and hub never copy a raw field value or promote global API success',()=>{
 const sentinel='CONTROLLED_EFFECTIVE_SECRET_MUST_NOT_LEAK';const r=run({mutateYaml:yaml=>{yaml.files[0].documents[0].fields[0].value=sentinel;}});assert.ifError(r.error);const ref=r.outputs.get('configuration-families.json');assert(!JSON.stringify(ref).includes(sentinel));const hub=renderConfigurationFamilyHub(ref,sourceUrl);assert(!hub.includes(sentinel));assert.match(hub,/not\ncertified by this composition/);
 const forged=JSON.parse(JSON.stringify(ref));forged.composition.globalApiDiscoveryPassed=true;assert.throws(()=>renderConfigurationFamilyHub(forged,sourceUrl),/HUB_INPUT_INVALID/);
});
test('reader can route platform provider pair host policy environment and lint to their owners and changes',()=>{
 const r=run();assert.ifError(r.error);const hub=renderConfigurationFamilyHub(r.outputs.get('configuration-families.json'),sourceUrl);
 for(const phrase of ['Platform JSON','loadPlatformConfig','default insertion','progress-scaffold.ts','Root-owned policy','PRISM_WORKER_URL','Lint policy','stores-and-retention.md','Start from a consumer','Change and reload boundaries'])assert(hub.includes(phrase),phrase);
 assert(hub.indexOf('Find the setting')<hub.indexOf('Select the configuration family'));assert.match(hub,/copy remains distinct from a runtime reader/);
});
test('renderer rejects a lost family owner or inverse edge rather than presenting a complete lookup',()=>{
 const r=run();assert.ifError(r.error);const ref=JSON.parse(JSON.stringify(r.outputs.get('configuration-families.json')));
 const lostOwner=structuredClone(ref);lostOwner.families[0].owner='';assert.throws(()=>renderConfigurationFamilyHub(lostOwner,sourceUrl),/FAMILY_LOOKUP_MISSING/);
 const lostInverse=structuredClone(ref);lostInverse.inverseConsumers.pop();assert.throws(()=>renderConfigurationFamilyHub(lostInverse,sourceUrl),/INVERSE_RELATION_MISSING/);
 const wrongInverse=structuredClone(ref);wrongInverse.inverseConsumers[0].facts[0].consumer='unqualified';assert.throws(()=>renderConfigurationFamilyHub(wrongInverse,sourceUrl),/INVERSE_RELATION_MISSING/);
});

test('native hub entry rejects movable refs short IDs and noncommit objects before output',()=>{
 const blob=execFileSync('git',['rev-parse','HEAD:package.json'],{cwd:root,encoding:'utf8'}).trim();
 for(const revision of ['HEAD','master','63c787e7',blob]){
  const result=spawnSync(process.execPath,['scripts/docs-generate.mjs','--only','configuration-hub','--revision',revision],{cwd:root,encoding:'utf8',timeout:30000});
  assert.notEqual(result.status,0);assert.match(result.stderr,/documentation source revision must be a full Git commit SHA|documentation source revision does not exist locally/);
 }
});
