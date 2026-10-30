import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {checkSchemaFieldInventory, propertyPointers} from '../docs-schema-fields.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const binding = JSON.parse(fs.readFileSync(path.join(root, 'docs/config/schema-field-bindings.json')));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pr13-schema-field-drift-'));
const results = [];
try {
 const names = new Set(['docs/config/schema-field-bindings.json', 'docs/generated/inventory/schema-field-drift.json', ...Object.keys(binding.schemas), ...Object.keys(binding.registrations), ...Object.values(binding.schemas).map(s => s.referenceRoute.split('#')[0])]);
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
 const pointers=propertyPointers({$defs:{x:{properties:{'a/b~c':{type:'string'}}}},anyOf:[{properties:{nested:{properties:{value:{type:'number'}}}}}]});
 assert(pointers.some(p=>p.pointer==='/$defs/x/properties/a~1b~0c'));assert(pointers.some(p=>p.pointer==='/anyOf/0/properties/nested/properties/value'));results.push('recursive definitions/array/pointer escaping');
 assert(Object.values(binding.schemas).some(s=>s.status==='fixture'));assert(Object.values(binding.schemas).some(s=>s.status==='retained'));results.push('explicit fixture/retained classifications');
 checkSchemaFieldInventory(scratch);results.push('restored baseline');
 console.log(JSON.stringify({status:'PASS',controls:results,sourceCount:Object.keys(binding.schemas).length,runtimeValidationClaimed:false},null,2));
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
