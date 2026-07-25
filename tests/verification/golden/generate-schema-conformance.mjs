#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildCanonicalEnvelope } from '../../../skills/common/pipeline/observability-contract.ts';
import { assertTelemetryEventPayload } from '../../../skills/common/pipeline/services/telemetry/payload-schema.ts';

function option(name) { const index=process.argv.indexOf(`--${name}`); return index<0?null:process.argv[index+1]; }
function sample(schema={},field='value') {
  if(schema.const!==undefined)return schema.const;
  if(schema.enum)return schema.enum.find(value=>value!==null);
  if(schema.oneOf)return sample(schema.oneOf.find(item=>item.type!=='null')??schema.oneOf[0],field);
  const type=Array.isArray(schema.type)?schema.type.find(value=>value!=='null'):schema.type;
  if(type==='string'){if(schema.format==='date-time')return'2026-07-21T00:00:00.000Z';if(schema.pattern==='^[a-f0-9]{64}$')return'a'.repeat(64);return`fixture-${field.replaceAll('_','-')}`;}
  if(type==='integer'||type==='number')return schema.minimum??1;
  if(type==='boolean')return false;
  if(type==='array')return schema.minItems?Array.from({length:schema.minItems},()=>sample(schema.items,field)):[];
  if(type==='object')return Object.fromEntries((schema.required??[]).map(name=>[name,sample(schema.properties?.[name]??{},name)]));
  return null;
}

const output=path.resolve(option('output')??'tests/fixtures/observability-schema-conformance');
if(fs.existsSync(output))throw new Error(`output already exists: ${output}`);
fs.mkdirSync(output,{recursive:true});
const catalog=JSON.parse(fs.readFileSync('contracts/telemetry/v1/catalog.json','utf8'));
const events=[];
const invalid=[];
for(const [index,type] of catalog.event_types.entries()){
  const schema=JSON.parse(fs.readFileSync(`contracts/telemetry/v1/payloads/${type}.schema.json`,'utf8'));
  const payload={...Object.fromEntries((schema.required??[]).map(field=>[field,sample(schema.properties[field]??{},field)])),extensions:{evidence_provenance:'synthetic'}};
  assertTelemetryEventPayload(type,payload);
  const agent=type.startsWith('agent.');const tool=type.startsWith('agent.tool.');const model=tool||type.startsWith('agent.model.')||type.startsWith('agent.llm.');const gate=type.startsWith('gate.');const workId=gate?'fixture-gate':'fixture-module';
  const identity={project:'schema-conformance',run_id:'schema-conformance-v1',work_id:agent||gate?workId:'pipeline',work_type:gate?'gate':agent?'module':'pipeline',module_id:agent?workId:null,gate_id:gate?workId:null,gate_type:gate?'review':null,attempt:agent||gate?1:null,dispatch_id:agent?'fixture-dispatch':null,session_id:agent?'fixture-session':null,agent_id:agent?'fixture-agent':null,model_call_id:model?'fixture-model-call':null,tool_call_id:tool?'fixture-tool-call':null,source:'contract-fixture',producer:'schema-conformance'};
  events.push(buildCanonicalEnvelope({type,identity,payload,seq:index+1,occurredAt:'2026-07-21T00:00:00.000Z',emittedAt:'2026-07-21T00:00:00.000Z',sourceEventId:`schema-conformance/${type}`,authorityClass:'fixture'}));
  const invalidPayload=structuredClone(payload);const removedField=(schema.required??[])[0]??null;
  if(removedField)delete invalidPayload[removedField];else invalidPayload.__invalid_fixture__=true;
  let validationError=null;try{assertTelemetryEventPayload(type,invalidPayload);}catch(error){validationError=String(error?.message??error);}
  if(!validationError)throw new Error(`negative fixture unexpectedly accepted: ${type}`);
  invalid.push({schema_version:'schema_conformance_negative.v1',type,schema:`payloads/${type}.schema.json`,mutation:removedField?{operation:'remove_required',field:removedField}:{operation:'add_unknown',field:'__invalid_fixture__'},payload:invalidPayload,expected:'rejected',validation_error:validationError});
}
fs.writeFileSync(path.join(output,'events.jsonl'),`${events.map(JSON.stringify).join('\n')}\n`);
fs.writeFileSync(path.join(output,'invalid.jsonl'),`${invalid.map(JSON.stringify).join('\n')}\n`);
fs.writeFileSync(path.join(output,'fixture-manifest.json'),`${JSON.stringify({schema_version:'schema_conformance_fixture.v1',provenance:'synthetic',readiness_eligible:false,event_count:events.length,invalid_count:invalid.length,event_types:events.map(event=>event.type)},null,2)}\n`);
process.stdout.write(`${JSON.stringify({ok:true,event_count:events.length,invalid_count:invalid.length,provenance:'synthetic',readiness_eligible:false,output})}\n`);
