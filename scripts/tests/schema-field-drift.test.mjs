import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {checkSchemaFieldInventory, propertyPointers, schemaFieldInventory, renderSchemaAuthorityReference} from '../docs-schema-fields.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const binding = JSON.parse(fs.readFileSync(path.join(root, 'docs/config/schema-field-bindings.json')));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pr13-schema-field-drift-'));
const results = [];
try {
 const names = new Set(['docs/config/schema-field-bindings.json', 'docs/generated/inventory/schema-field-drift.json', 'scripts/docs-configuration-inventory.mjs', ...binding.authorityCoverage.inputs.map(input=>input.path), ...Object.keys(binding.schemas), ...Object.keys(binding.registrations), ...Object.values(binding.schemas).map(s => s.referenceRoute.split('#')[0])]);
 for (const name of names) {fs.mkdirSync(path.dirname(path.join(scratch, name)), {recursive:true});fs.copyFileSync(path.join(root,name),path.join(scratch,name));}
 checkSchemaFieldInventory(scratch);results.push('baseline');
 const mutate = (label, name, change, expected) => {
  const file = path.join(scratch,name),before = fs.readFileSync(file);
  try {change(file);assert.throws(()=>checkSchemaFieldInventory(scratch),expected);results.push(label);}
  finally {fs.writeFileSync(file,before);}
 };
 const properties = node => {
  if (!node || typeof node !== 'object') return null;
  if (node.properties && Object.keys(node.properties).length) return node.properties;
  for (const child of Object.values(node)) {const found=properties(child);if(found)return found;}
  return null;
 };
 for (const name of ['contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json','charts/prism/values.schema.json','skills/nova/plugins/review/schemas/input.schema.json']) {
  for (const operation of ['add','change','remove']) mutate(operation+':'+name,name,file=>{
   const data=JSON.parse(fs.readFileSync(file)),p=properties(data);assert(p);const key=Object.keys(p)[0];
   if(operation==='add')p.__control={type:'object',properties:{nested:{type:'string'}}};
   else if(operation==='change')p[key]={type:'object',properties:{nested:{type:'number'}}};
   else delete p[key];
   fs.writeFileSync(file,JSON.stringify(data));
  },/SCHEMA_FIELD_INPUT_DRIFT:changed:/);
 }
 const name='contracts/pipeline-worker-core/v1/schemas/mnt010-control.schema.json',file=path.join(scratch,name);
 try{fs.writeFileSync(file,'{"properties":{"nested":{"properties":{"field":{"type":"string"}}}}}');assert.throws(()=>checkSchemaFieldInventory(scratch),/SCHEMA_FIELD_INPUT_DRIFT:added:/);results.push('new schema member');}finally{fs.rmSync(file,{force:true});}
 mutate('removed schema member','charts/prism/values.schema.json',file=>fs.rmSync(file),/SCHEMA_FIELD_INPUT_DRIFT:removed:/);
 for (const operation of ['reference declaration','inline schema']) mutate(operation,'skills/nova/plugins/review/plugin.json',file=>{const data=JSON.parse(fs.readFileSync(file));data.configSchema=operation==='inline schema'?{type:'object',properties:{control:{type:'string'}}}:'./schemas/new.schema.json';fs.writeFileSync(file,JSON.stringify(data));},/SCHEMA_FIELD_REGISTRATION_DRIFT:/);
 mutate('OpenClaw inline config schema','skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json',file=>{const data=JSON.parse(fs.readFileSync(file));data.configSchema={type:'object',properties:{control:{type:'string'}}};fs.writeFileSync(file,JSON.stringify(data));},/SCHEMA_FIELD_REGISTRATION_DRIFT:/);
 mutate('removed OpenClaw registration','skills/prism/openclaw-plugin/openclaw.plugin.json',file=>fs.rmSync(file),/SCHEMA_FIELD_REGISTRATION_DRIFT:/);
 const newRegistration=path.join(scratch,'skills/nova/plugins/mnt010-control/openclaw.plugin.json');
 try {fs.mkdirSync(path.dirname(newRegistration),{recursive:true});fs.writeFileSync(newRegistration,'{"configSchema":{"type":"object"}}');assert.throws(()=>checkSchemaFieldInventory(scratch),/SCHEMA_FIELD_REGISTRATION_DRIFT:/);results.push('added OpenClaw registration');}finally{fs.rmSync(path.dirname(newRegistration),{recursive:true,force:true});}
 mutate('generated inventory tamper','docs/generated/inventory/schema-field-drift.json',file=>fs.appendFileSync(file,'\n'),/SCHEMA_FIELD_OUTPUT_DRIFT:/);
 const authorityMutation = (label, change, expected) => mutate(label,'docs/config/schema-field-bindings.json',file=>{const data=JSON.parse(fs.readFileSync(file));change(data.authorityCoverage);fs.writeFileSync(file,JSON.stringify(data));},expected);
 authorityMutation('missing current authority',data=>data.records.pop(),/SCHEMA_AUTHORITY_CURRENT_COVERAGE/);
 authorityMutation('duplicate current authority',data=>data.records.push(data.records[0]),/SCHEMA_AUTHORITY_DUPLICATE/);
 authorityMutation('unbound extra current authority',data=>data.coveredCurrentSchemaPaths.push('contracts/unbound.schema.json'),/SCHEMA_AUTHORITY_CURRENT_COVERAGE/);
 authorityMutation('false observed validation claim',data=>data.records[0].runtimeValidationObserved=true,/SCHEMA_AUTHORITY_CLAIM/);
 authorityMutation('telemetry false runtime consumer',data=>{const r=data.records.find(r=>r.family==='telemetry-bundle-contracts');r.readerKind='manual-contract-parser';r.consumers=[{source:'contracts/delivery-manifest/v3/src/index.ts',symbols:['parseDeliveryManifestV3']}];},/SCHEMA_AUTHORITY_READER_BOUNDARY/);
 authorityMutation('AJV is not manual provider validation',data=>{const r=data.records.find(r=>r.readerKind==='ajv-selected-definition');r.readerKind='manual-provider-profiles';},/SCHEMA_AUTHORITY_DISPOSITION_DRIFT/);
 authorityMutation('unbound consumer identity',data=>data.records[0].consumers[0].source='contracts/unbound-reader.ts',/SCHEMA_AUTHORITY_CONSUMER/);
 for (const name of ['contracts/delivery-manifest/v3/package.json','contracts/pipeline-test-gate/v1/src/validation.ts','contracts/prism/v1/src/validators.generated.mjs']) mutate('changed authority '+name,name,file=>fs.appendFileSync(file,'\n'),/SCHEMA_AUTHORITY_INPUT_DRIFT/);
 mutate('substituted Prism schema','contracts/prism/v1/schemas/baseline-v2.schema.json',file=>fs.appendFileSync(file,'\n'),/SCHEMA_FIELD_INPUT_DRIFT:changed:/);
 const physical=path.join(scratch,'contracts/pipeline-test-gate/v1/src/validation.ts'),hold=physical+'.owned-control';
 try {fs.renameSync(physical,hold);fs.linkSync(hold,physical);assert.throws(()=>checkSchemaFieldInventory(scratch),/SCHEMA_AUTHORITY_PHYSICAL/);results.push('hardlinked authority refusal');}finally{fs.rmSync(physical,{force:true});if(fs.existsSync(hold))fs.renameSync(hold,physical);}
 const inventory=schemaFieldInventory(scratch),page=fs.readFileSync(path.join(scratch,'docs/site/reference/schemas.md'),'utf8');
 assert.equal(inventory.authorityCoverage.records.length,22);assert.equal(inventory.authorityCoverage.coveredCurrentSchemaPaths.length,113);
 assert(inventory.authorityCoverage.records.filter(r=>r.family==='telemetry-bundle-contracts').every(r=>r.readerKind==='declaration-only'&&!r.consumers.length&&!r.runtimeValidationObserved));
 assert.equal(renderSchemaAuthorityReference(scratch,inventory,page),page);results.push('all22 dispositions and idempotent source reference');
 assert.throws(()=>renderSchemaAuthorityReference(scratch,inventory,page.replace('<!-- END GENERATED: schema authority dispositions -->','')),/SCHEMA_AUTHORITY_REFERENCE_MARKERS/);results.push('broken generated reference region refusal');
 mutate('generated authority reference tamper','docs/site/reference/schemas.md',file=>fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('All 22 residual schema documents','All 23 residual schema documents')),/SCHEMA_AUTHORITY_REFERENCE_DRIFT/);
 const disclosure='That earlier survey is not the current whole authority map. The current configuration/Event/field-index routes and sealed residual table below supply the supported declaration and consumer dispositions. Arbitrary dynamic registrations or TS/JS expressions are not evaluated as schema validation.';
 for (const [label, change] of [['deleted',text=>text.replace(disclosure,'')],['changed',text=>text.replace(disclosure,'All schema declarations are active runtime validators.')],['duplicated',text=>text.replace(disclosure,disclosure+' '+disclosure)]]) mutate(label+' owned coverage disclosure','docs/site/reference/schemas.md',file=>fs.writeFileSync(file,change(fs.readFileSync(file,'utf8'))),/SCHEMA_AUTHORITY_REFERENCE_DISCLOSURE/);
 for (const field of ['Status','Last verified']) for(const operation of ['removed','duplicated']) mutate(operation+' '+field+' metadata','docs/site/reference/schemas.md',file=>{let text=fs.readFileSync(file,'utf8');const re=new RegExp('^'+field+': .*$', 'm');const value=text.match(re)[0];text=text.replace(re,operation==='removed'?'':value+'\n'+value);fs.writeFileSync(file,text);},/SCHEMA_AUTHORITY_REFERENCE_METADATA/);
 const pointers=propertyPointers({$defs:{x:{properties:{'a/b~c':{type:'string'}}}},anyOf:[{properties:{nested:{properties:{value:{type:'number'}}}}}]});
 assert(pointers.some(p=>p.pointer==='/$defs/x/properties/a~1b~0c'));assert(pointers.some(p=>p.pointer==='/anyOf/0/properties/nested/properties/value'));results.push('recursive definitions/array/pointer escaping');
 assert(Object.values(binding.schemas).some(s=>s.status==='fixture'));assert(Object.values(binding.schemas).some(s=>s.status==='retained'));results.push('explicit fixture/retained classifications');
 checkSchemaFieldInventory(scratch);results.push('restored baseline');
 console.log(JSON.stringify({status:'PASS',controls:results,sourceCount:Object.keys(binding.schemas).length,runtimeValidationClaimed:false},null,2));
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
