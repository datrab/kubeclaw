import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectPipelineV10Receiver as inspect, type PipelineV10ReceiverFamily } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-receiver.ts';
import { capturePipelineInputSet } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-input-set.ts';
const repository=fileURLToPath(new URL('../../../',import.meta.url));
const base=path.join(repository,'docs/review/evidence/config-acceptance/c0-completion-20261013');
const catalog=JSON.parse(fs.readFileSync(path.join(repository,'skills/common/plugin-runtime/foundation/config/pipeline-v10-receiver-schemas.json'),'utf8'));
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=(raw:Uint8Array)=>createHash('sha256').update(raw).digest('hex');
function fixture(t:test.TestContext){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'receiver-shape-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'config'));
 // Minimal raw context is deliberately NOT whole generation or caller authority.
 const raw=Buffer.from('{"schemaVersion":"pipeline-entry.v10","unitMetadataOnly":true}');fs.writeFileSync(path.join(root,'config/pipeline.config.json'),raw);
 const input=capturePipelineInputSet(root,[{relativePath:'config/pipeline.config.json',byteLength:raw.length,sha256:sha(raw)}]);t.after(input.close);
 return {input,raw,root};
}
function migrate(family:PipelineV10ReceiverFamily,value:any,root:Uint8Array,input:string){
 const v=structuredClone(value);if(family==='provider'){v.selectedPolicy.binding.readerVersion='pipeline-entry.v10/provider-configuration.v2';v.selectedPolicy.binding.rootDigest='sha256:'+sha(root);}
 else {const b=family==='nova'?v.binding:v;b.rootVersion='pipeline-entry.v10';b.rootRawSha256=sha(root);b.inputGenerationSha256=input;}return v;
}
function samples(){const rows:{family:PipelineV10ReceiverFamily,value:any}[]=[];
 const walk=(p:string)=>{for(const item of fs.readdirSync(p,{withFileTypes:true})){const file=path.join(p,item.name);if(item.isDirectory())walk(file);else if(item.name.endsWith('.json')){const v=read(file),s=v.schemaVersion;const family=s==='provider-configuration.v2'?'provider':s==='nova-registration-policy.v1'?'nova':s==='gateway-service-policy.v1'?'gateway':s==='prism-agent-service-policy.v1'?'launcher':undefined;if(family)rows.push({family,value:v});}}};walk(path.join(base,'same-entry-agent-role-binding-01/outputs'));return rows;}
test('v10 schemas are exact inherited/Quality compositions plus enumerated version edits, wire versions unchanged',()=>{
 for(const [family,value] of Object.entries(catalog) as [string,any][]){
  const originals=value.provenance.map((p:any)=>{const raw=fs.readFileSync(path.join(repository,p.path));assert.equal(sha(raw),p.sha256);return JSON.parse(raw.toString());});
  const expected=originals[0];if(family==='provider'){expected.oneOf.push(...originals[1].oneOf);expected.$defs=originals[1].$defs;}
  for(const edit of value.versionEdits){const parts=edit.pointer.split('/').slice(1),key=parts.pop()!;const node=parts.reduce((v:any,k:string)=>v[k],expected);assert.equal(node[key],edit.before);node[key]=edit.after;}
  assert.deepEqual(expected,value.schema);
 }
 assert.equal(catalog.provider.schema.oneOf.length,14);assert.equal(catalog.nova.schema.oneOf.length,8);
});
test('all inherited public output examples migrate closed version fields only and remain nonauthorizing',t=>{
 const f=fixture(t),seen=new Set<string>();
 for(const {family,value} of samples()){const v=migrate(family,value,f.raw,f.input.inputGenerationSha256),r=inspect(family,Buffer.from(JSON.stringify(v)),f.input);assert.equal(r.activationAllowed,false);seen.add(family==='provider'?v.contractId:family==='nova'?v.binding.registrationId:family);}
 assert.equal([...seen].filter(x=>x.startsWith('kubeclaw.')&&x.endsWith('@1')).length,12);assert.ok(seen.has('gateway'));assert.ok(seen.has('launcher'));
});
test('both Quality receiver additions preserve selected exact owner processing/declarations, not fake installed grants',t=>{
 const f=fixture(t),baseValue=samples().find(x=>x.family==='provider')!.value;
 for(const arm of catalog.provider.schema.oneOf.slice(-2)){
  const v=structuredClone(baseValue),p=arm.properties.selectedPolicy.properties;
  v.contractId=arm.properties.contractId.const;v.values={};
  v.selectedPolicy.binding=Object.fromEntries(Object.entries(v.selectedPolicy.binding).filter(([key])=>Object.hasOwn(p.binding.properties,key)));
  for(const [key,schema] of Object.entries(p.binding.properties) as [string,any][])if(schema.const!==undefined)v.selectedPolicy.binding[key]=schema.const;
  const packageId=v.selectedPolicy.binding.packageId,owner=read(path.join(base,'quality-budget-contracts-01/stand/config/plugins',packageId+'.config.json'));
  v.selectedPolicy.processing=owner.profiles.A.processing;v.selectedPolicy.declarations=owner.profiles.A.declarations;
  const current=migrate('provider',v,f.raw,f.input.inputGenerationSha256);
  assert.equal(inspect('provider',Buffer.from(JSON.stringify(current)),f.input).activationAllowed,false);
 }
});
test('stale reader versions and wrong same-root/input identities reject before any activation',t=>{
 const f=fixture(t);
 for(const family of ['provider','nova','gateway','launcher'] as const){
  const old=samples().find(x=>x.family===family)!.value;
  assert.throws(()=>inspect(family,Buffer.from(JSON.stringify(old)),f.input),/RECEIVER_INVALID:SCHEMA/);
  const v=migrate(family,old,f.raw,f.input.inputGenerationSha256),b=family==='provider'?v.selectedPolicy.binding:family==='nova'?v.binding:v;
  if(family==='provider')b.rootDigest='sha256:'+'0'.repeat(64);else b.rootRawSha256='0'.repeat(64);
  assert.throws(()=>inspect(family,Buffer.from(JSON.stringify(v)),f.input),/ROOT_IDENTITY/);
  if(family!=='provider'){b.rootRawSha256=sha(f.raw);b.inputGenerationSha256='0'.repeat(64);assert.throws(()=>inspect(family,Buffer.from(JSON.stringify(v)),f.input),/INPUT_IDENTITY/);}
 }
});
test('raw output SHA is separate from root/input identity and malformed duplicate JSON never leaks values',t=>{
 const f=fixture(t),value=migrate('nova',samples().find(x=>x.family==='nova')!.value,f.raw,f.input.inputGenerationSha256),raw=Buffer.from(JSON.stringify(value));
 const r=inspect('nova',raw,f.input);assert.equal(r.outputRawSha256,sha(raw));assert.equal(r.rootRawSha256,sha(f.raw));assert.notEqual(r.outputRawSha256,r.rootRawSha256);
 assert.throws(()=>inspect('nova',Buffer.from('{"secret":"NEVER-LOG","secret":"duplicate"}'),f.input),e=>e instanceof Error&&e.message==='PIPELINE_V10_RECEIVER_INVALID:JSON');
});
