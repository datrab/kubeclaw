import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const root='contracts/telemetry/v1';
const read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('contract-manifest.json');
for(const file of manifest.files){const b=fs.readFileSync(path.join(root,file.path));assert.equal(b.length,file.byte_length,file.path);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),file.sha256,file.path);}
const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);
const identity=read('correlation_identity.schema.json');ajv.addSchema(identity,'correlation_identity.schema.json');
let count=0;
for(const dir of ['payloads','events','bundle'])for(const f of fs.readdirSync(path.join(root,dir))){if(!f.endsWith('.json'))continue;ajv.compile(read(dir+'/'+f));count++;}
const golden=read('fixtures/golden-event.json');const valid=ajv.getSchema(golden.type+'.event.v1');assert(valid(golden),JSON.stringify(valid.errors));
const envelope=ajv.compile(read('envelope.schema.json'));assert(!envelope(read('fixtures/invalid/missing-run-id.json')));
const gateSchema=read('events/gate.verdict.schema.json');
const event={...Object.fromEntries(Object.entries(golden).filter(([k])=>Object.hasOwn(gateSchema.properties,k))),type:'gate.verdict',gate_id:'gate',verdict:'PASS',run_id:null};
for(const k of ['modules','gates','execution_order','resume'])delete event[k];
const gate=ajv.getSchema('gate.verdict.event.v1');assert(gate(event),JSON.stringify(gate.errors));const base=Object.fromEntries(Object.entries(event).filter(([k])=>Object.hasOwn(read('envelope.schema.json').properties,k)));assert(!envelope(base));assert(envelope({...base,run_id:'run:valid'}));
const projection=read('bundle/pipeline_lifecycle_read_models.v1.schema.json');
console.log(JSON.stringify({manifestFiles:manifest.files.length,compiledSchemas:count,goldenValid:true,missingIdentityRejected:true,gateAcceptsNullRun:gate(event),tsEnvelopeLine:fs.readFileSync(path.join(root,'telemetry-types.ts'),'utf8').split('\n').find(l=>l.startsWith('export type TelemetryEnvelope')),projectionLifecycleVersion:projection.properties.pipeline.oneOf[0].properties.lifecycle_version}));
