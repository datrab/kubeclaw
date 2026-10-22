import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {checkedVersionsMapOutputs,selectedVersionsMapOutput} from '../docs-api-versions-map-output.mjs';
import {createSerializedOutputRoleClassifier} from '../docs-api-output-role-classification.mjs';

const repository=path.resolve(import.meta.dirname,'../..');
const authorityPath='scripts/docs-api-versions-map-output-authority.json';
const authority=JSON.parse(fs.readFileSync(path.join(repository,authorityPath)));
const source='scripts/versions.mjs';
const graph={edges:authority.incomingEdges,publicEntries:authority.publicEntries};
const rejected=/API_PRODUCT_VERSIONS_MAP_OUTPUT_UNQUALIFIED/u;
const nativeRoles=createSerializedOutputRoleClassifier(repository,[source])(source);
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'versions-map-output-'));
 const write=(file,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);};
 try{
  for(const file of [authorityPath,...authority.inputs.map(x=>x.path)])write(file,fs.readFileSync(path.join(repository,file)));
  // Same native parser records as the whole-checkout control above. Source
  // bytes are pinned before use; no unrelated observer-runtime fixture needed.
  const classify=()=>nativeRoles;
  run({root,write,classify,acquire:(selected=classify,g=graph)=>checkedVersionsMapOutputs(root,g,selected,[source])});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('native current classifier retains mixed UNKNOWN while all original member/API streams are received',()=>{
 const classify=createSerializedOutputRoleClassifier(repository,[source]);
 const before=classify(source);const receipt=checkedVersionsMapOutputs(repository,graph,classify,[source]);
 assert.equal(receipt.members.length,45);assert.equal(receipt.outputs.length,14);
 assert.equal(new Set(receipt.outputs.map(x=>x.context.publicOutput)).size,11);
 assert.deepEqual(receipt.outputs.map(x=>[x.value.apiVersion,x.value.kind]),authority.apiRoots.map(x=>[x.apiVersion,x.kind]));
 const registry=receipt.outputs.filter(x=>x.context.publicOutput==='my-values/infra/registry-mirror.yaml');
 assert.deepEqual(registry.map(x=>x.value.kind),['PersistentVolumeClaim','Deployment','Service']);
 const role=before.find(x=>x.line===181);assert.equal(role.role,'unknown');
 const purpose=selectedVersionsMapOutput(source,role,receipt);assert.equal(purpose.canonicalRawRole,'unknown');
 assert.equal(purpose.runtimeExecutionAuthorized,false);assert.equal(purpose.apiApplyAuthorized,false);
 assert.deepEqual(classify(source),before);
 assert.throws(()=>selectedVersionsMapOutput(source,role,{...receipt}),/unacquired/u);
});

test('warm validation rejects whole versions whitespace and unchanged-value input/source/parser drift',()=>fixture(({root,write,acquire})=>{
 acquire();acquire();
 for(const file of ['versions.json','scripts/versions.mjs','scripts/runtime-tool-locks.mjs','node_modules/js-yaml/dist/js-yaml.mjs','node_modules/yaml/dist/parse/parser.js','charts/kubeclaw/values.yaml','gitops/platform/bootstrap/spire.yaml']){
  const bytes=fs.readFileSync(path.join(root,file));write(file,Buffer.concat([bytes,Buffer.from('\n ')]));
  assert.throws(()=>acquire(),rejected,file);write(file,bytes);
 }
 assert.equal(acquire().outputs.length,14);
}));

test('new Docker member, missing current output, parser member and loader boundary invalidate reuse',()=>fixture(({root,write,acquire})=>{
 acquire();write('docker/Dockerfile.unregistered','FROM scratch\n');assert.throws(()=>acquire(),/Docker selector/u);fs.unlinkSync(path.join(root,'docker/Dockerfile.unregistered'));
 const file='gitops/platform/litellm/resources.yaml',bytes=fs.readFileSync(path.join(root,file));fs.unlinkSync(path.join(root,file));assert.throws(()=>acquire(),rejected);write(file,bytes);
 write('node_modules/yaml/dist/new-runtime.js','export const x=1;');assert.throws(()=>acquire(),/parser roster/u);fs.unlinkSync(path.join(root,'node_modules/yaml/dist/new-runtime.js'));
 write('scripts/node_modules/yaml/package.json','{}');assert.throws(()=>acquire(),/new package boundary/u);
}));

test('changed role, omitted/reordered slots, new caller or public alias fail before fallback',()=>fixture(({classify,acquire})=>{
 const roles=classify(source);
 assert.throws(()=>acquire(()=>roles.map(x=>x.line===181?{...x,role:'non-api'}:x)),/canonical slot\/role/u);
 assert.throws(()=>acquire(()=>roles.slice(1)),/canonical slot\/role/u);
 assert.throws(()=>acquire(()=>[...roles].reverse()),/canonical slot\/role/u);
 assert.throws(()=>acquire(classify,{...graph,edges:[...graph.edges,{source:'scripts/foreign.mjs',target:source,kind:'import',operation:'unreviewed'}]}),/caller or alias/u);
 assert.throws(()=>acquire(classify,{...graph,publicEntries:[...graph.publicEntries,{path:'scripts/alias.mjs',canonicalSource:source}]}),/caller or alias/u);
}));

test('persisted drop with adjusted advertised count or unrelated existing API profile cannot self-baseline',()=>fixture(({write,acquire})=>{
 const changed=structuredClone(authority);changed.members.splice(13,1);changed.observation.terminal.memberCount--;
 write(authorityPath,JSON.stringify(changed));assert.throws(()=>acquire(),/immutable original observation/u);
 const unrelated=structuredClone(authority);unrelated.members[13]=structuredClone(unrelated.members[14]);unrelated.members[13].index=13;
 write(authorityPath,JSON.stringify(unrelated));assert.throws(()=>acquire(),/immutable original observation/u);
}));

test('API document addition to a previously config-only member is not a metadata waiver',()=>fixture(({root,write,acquire})=>{
 acquire();const file='my-values/infra/redis-values.yaml';write(file,fs.readFileSync(path.join(root,file),'utf8')+'\n---\napiVersion: v1\nkind: ConfigMap\nmetadata: {name: unexpected}\n');
 assert.throws(()=>acquire(),rejected);
}));

// The authority root and the adapter importer are intentionally different.
// A byte-perfect fixture must not authorize an altered actually loaded parser.
test('actual importer parser drift rejects even when the supplied fixture parser remains sealed',()=>fixture(({root})=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'versions-map-importer-'));
 try{
  fs.mkdirSync(path.join(runtime,'scripts'));
  const adapter=path.join(runtime,'scripts/docs-api-versions-map-output.mjs');
  fs.copyFileSync(path.join(repository,'scripts/docs-api-versions-map-output.mjs'),adapter);
  for(const input of authority.inputs.filter(x=>x.path.startsWith('node_modules/yaml/'))){
   const target=path.join(runtime,input.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repository,input.path),target);
  }
  const runner=path.join(runtime,'run.mjs');
  fs.writeFileSync(runner,`import fs from 'node:fs';import {checkedVersionsMapOutputs} from ${JSON.stringify(pathToFileURL(adapter).href)};
const {root,graph,roles}=JSON.parse(fs.readFileSync(0,'utf8'));const receipt=checkedVersionsMapOutputs(root,graph,()=>roles,['scripts/versions.mjs']);
console.log(JSON.stringify({outputs:receipt.outputs.length,replicas:receipt.outputs.find(x=>x.value.kind==='Deployment').value.spec.replicas}));`);
  const invoke=()=>spawnSync(process.execPath,[runner],{input:JSON.stringify({root,graph,roles:nativeRoles}),encoding:'utf8'});
  const original=invoke();assert.equal(original.status,0,original.stderr);assert.equal(JSON.parse(original.stdout).outputs,14);
  for(const relative of ['package.json','dist/index.js','dist/parse/parser.js']){
   const actual=path.join(runtime,'node_modules/yaml',relative),bytes=fs.readFileSync(actual);
   fs.appendFileSync(actual,'\n ');const changed=invoke();assert.equal(changed.status,1,changed.stdout);
   assert.match(changed.stderr,/API_PRODUCT_VERSIONS_MAP_OUTPUT_UNQUALIFIED: actual parser input/u);fs.writeFileSync(actual,bytes);
  }
  const extra=path.join(runtime,'node_modules/yaml/dist/unregistered.js');fs.writeFileSync(extra,'exports.unused = true;\n');
  assert.match(invoke().stderr,/actual parser roster/u);fs.unlinkSync(extra);
  const boundary=path.join(runtime,'node_modules/yaml/dist/doc/package.json');fs.writeFileSync(boundary,'{}');
  assert.match(invoke().stderr,/actual parser package boundary/u);fs.unlinkSync(boundary);
  const actual=path.join(runtime,'node_modules/yaml/dist/doc/Document.js');
  const bytes=fs.readFileSync(actual,'utf8');
  const marker="const res = toJS.toJS(this.contents, jsonArg ?? '', ctx);";assert(bytes.includes(marker));
  fs.writeFileSync(actual,bytes.replace(marker,marker+"\n        if (res?.kind === 'Deployment') res.spec.replicas = 777;"));
  const changed=invoke();assert.equal(changed.status,1,changed.stdout);
  assert.match(changed.stderr,/API_PRODUCT_VERSIONS_MAP_OUTPUT_UNQUALIFIED: actual parser input node_modules\/yaml\/dist\/doc\/Document.js/u);
 }finally{fs.rmSync(runtime,{recursive:true,force:true});}
}));
