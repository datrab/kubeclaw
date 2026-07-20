#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractDir = path.join(root, 'contracts', 'telemetry', 'v1');
const catalog = JSON.parse(fs.readFileSync(path.join(contractDir, 'catalog.json'), 'utf8'));
const check = process.argv.includes('--check');
const runtimeValidatorSource = fs.readFileSync(path.join(root,'skills','common','pipeline','services','telemetry','payload-schema.ts'),'utf8');

function balanced(source,start,open='{',close='}') { let depth=0,quote=null;for(let i=start;i<source.length;i++){const char=source[i];if(quote){if(char==='\\')i+=1;else if(char===quote)quote=null;continue;}if(['"',"'",'`'].includes(char)){quote=char;continue;}if(char===open)depth+=1;if(char===close&&--depth===0)return source.slice(start+1,i);}throw new Error(`unbalanced ${open}${close}`); }
function fields(objectSource){const result={};let start=0,depth=0,quote=null;const chunks=[];for(let i=0;i<=objectSource.length;i++){const char=objectSource[i]??',';if(quote){if(char==='\\')i+=1;else if(char===quote)quote=null;continue;}if(['"',"'",'`'].includes(char)){quote=char;continue;}if('([{'.includes(char))depth+=1;if(')]}'.includes(char))depth-=1;if(char===','&&depth===0){chunks.push(objectSource.slice(start,i));start=i+1;}}for(const chunk of chunks){const match=chunk.trim().match(/^([a-zA-Z0-9_]+)\s*:\s*(.+)$/s);if(match)result[match[1]]=match[2].trim();}return result;}
function jsonType(expression){const nullableType=expression.includes('nullable(');let schema;if(expression.includes('stringArray'))schema={type:'array',items:{type:'string'}};else if(expression.includes('arrayOrObject'))schema={oneOf:[{type:'array'},{type:'object'}]};else if(expression.includes('jsonObject')||/\bobject\b/.test(expression))schema={type:'object'};else if(/\barray\b/.test(expression))schema={type:'array'};else if(/\bboolean\b/.test(expression))schema={type:'boolean'};else if(/\bnumber\b/.test(expression))schema={type:'number'};else if(/nonEmptyString/.test(expression))schema={type:'string',minLength:1};else if(/\bstring\b/.test(expression))schema={type:'string'};else schema={};if(nullableType&&schema.type)schema.type=[schema.type,'null'];return schema;}
function runtimePayloadDefinition(type){const marker=`'${type}': schema(`;const at=runtimeValidatorSource.indexOf(marker);if(at<0)throw new Error(`runtime validator missing ${type}`);const argsStart=runtimeValidatorSource.indexOf('(',at)+1;const firstStart=runtimeValidatorSource.indexOf('{',argsStart);const requiredFields=fields(balanced(runtimeValidatorSource,firstStart));const afterFirst=firstStart+balanced(runtimeValidatorSource,firstStart).length+2;const secondStart=runtimeValidatorSource.indexOf('{',afterFirst);const optionalFields=fields(balanced(runtimeValidatorSource,secondStart));return{required:Object.keys(requiredFields),properties:Object.fromEntries([...Object.entries(requiredFields),...Object.entries(optionalFields)].map(([key,expression])=>[key,jsonType(expression)]))};}
const commonMarker=runtimeValidatorSource.indexOf('const commonFields:');const commonStart=runtimeValidatorSource.indexOf('{',commonMarker);const commonPayloadFields=fields(balanced(runtimeValidatorSource,commonStart));

const identityProperties = {
  project: { type: 'string', minLength: 1 }, run_id: { type: 'string', minLength: 1 },
  work_id: { type: ['string', 'null'] }, work_type: { enum: ['pipeline', 'module', 'gate', 'generator', 'validator', 'pipeline_step', null] },
  gate_id: { type: ['string', 'null'] }, attempt: { type: ['integer', 'null'], minimum: 0 },
  dispatch_id: { type: ['string', 'null'] }, session_id: { type: ['string', 'null'] },
  agent_id: { type: ['string', 'null'] }, model_call_id: { type: ['string', 'null'] },
  tool_call_id: { type: ['string', 'null'] }, source: { type: 'string', minLength: 1 },
  producer: { type: 'string', minLength: 1 }
};
const identityRequired = ['project', 'run_id', 'source', 'producer'];
const identitySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'correlation_identity.v1',
  title: 'Canonical correlation identity', type: 'object', additionalProperties: false,
  required: identityRequired, properties: identityProperties
};
const envelopeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'telemetry_envelope.v1',
  type: 'object', additionalProperties: true,
  required: ['schema_version', 'event_id', 'type', 'occurred_at', 'emitted_at', 'seq', ...identityRequired],
  properties: {
    schema_version: { const: 'telemetry_envelope.v1' }, event_id: { type: 'string', minLength: 1 },
    type: { enum: catalog.event_types }, occurred_at: { type: 'string', format: 'date-time' },
    emitted_at: { type: 'string', format: 'date-time' }, seq: { type: 'integer', minimum: 1 },
    cursor: { type: ['string', 'null'] }, causation_id: { type: ['string', 'null'] },
    ...identityProperties,
    extensions: { type: 'object' }
  }
};
const specialPayloads = {
  'artifact.published': {
    required: ['artifact_id', 'logical_id', 'kind', 'media_type', 'byte_length', 'sha256', 'content_class', 'reference'],
    properties: { artifact_id:{type:'string'}, logical_id:{type:'string'}, kind:{type:'string'}, media_type:{type:'string'}, byte_length:{type:'integer',minimum:0}, sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}, content_class:{enum:['metadata','payload','artifact','quarantined']}, reference:{type:'string'}, completeness:{enum:['full','truncated','summarized','transformed','unavailable','reference-only']}, original_byte_length:{type:['integer','null']}, original_sha256:{type:['string','null']}, transformation:{type:['string','null']} }
  },
  'terminal.closure': { required:['outcome','reason_code','manifest_fingerprint','observability'], properties:{outcome:{enum:['success','failure','paused','cancelled','process_lost','abandoned','completed']},reason_code:{type:'string'},duration_ms:{type:['integer','null']},manifest_fingerprint:{type:'string'},observability:{enum:['complete','partial','degraded','unknown']},counts:{type:'object'},cost:{type:['object','null']},last_work_id:{type:['string','null']},references:{type:'array'}} },
  'runtime.log': { required:['level','component','message'], properties:{level:{enum:['trace','debug','info','warn','error','fatal']},component:{type:'string'},message:{type:'string'},error_class:{type:['string','null']},reason_code:{type:['string','null']}} },
  'producer.health': { required:['producer_id','status','last_successful_emission','invalid_count','quarantined_count','dead_letter_count'], properties:{producer_id:{type:'string'},status:{enum:['healthy','degraded','unhealthy','unknown']},last_successful_emission:{type:['string','null']},lag:{type:['integer','null']},checkpoint:{type:['string','null']},invalid_count:{type:'integer'},quarantined_count:{type:'integer'},dead_letter_count:{type:'integer'},missing_payload_count:{type:'integer'},restart_count:{type:'integer'},reconciliation:{type:['object','null']}} },
  'lifecycle.transition': { required:['lifecycle_version','previous_state','new_state','reason_code','effective_at','authority'], properties:{lifecycle_version:{const:'pipeline_lifecycle.v1'},previous_state:{type:['string','null']},new_state:{type:'string'},reason_code:{type:'string'},effective_at:{type:'string',format:'date-time'},authority:{type:'string'}} },
  'command.requested': { required:['command_id','command_type','actor','capability','expires_at','expected_lifecycle_version'], properties:{command_id:{type:'string'},command_type:{enum:['approval.resolve','pipeline.pause','pipeline.resume','pipeline.cancel']},actor:{type:'string'},capability:{type:'string'},expires_at:{type:'string',format:'date-time'},target:{type:['object','null']},expected_lifecycle_version:{type:'integer',minimum:0}} }
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function render(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function output(relative, content) {
  const target = path.join(contractDir, relative);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) throw new Error(`telemetry contract drift: ${relative}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

output('correlation_identity.schema.json', render(identitySchema));
output('envelope.schema.json', render(envelopeSchema));
for (const type of catalog.event_types) {
  const runtimeDefinition=runtimePayloadDefinition(type);
  const special=specialPayloads[type]||{required:[],properties:{}};
  const definition={required:[...new Set([...runtimeDefinition.required,...special.required])],properties:{...Object.fromEntries(Object.entries(commonPayloadFields).map(([key,expression])=>[key,jsonType(expression)])),...runtimeDefinition.properties,...special.properties}};
  output(`payloads/${type}.schema.json`, render({
    $schema:'https://json-schema.org/draft/2020-12/schema', $id:`${type}.payload.v1`,
    type:'object', additionalProperties: false, required:definition.required,
    properties:{...definition.properties, extensions:{type:'object'}}
  }));
  const causalRequired = type.startsWith('agent.tool.') ? ['work_id','work_type','attempt','dispatch_id','session_id','model_call_id','tool_call_id'] : type.startsWith('agent.model.') || type.startsWith('agent.llm.') ? ['work_id','work_type','attempt','dispatch_id','session_id','model_call_id'] : [];
  const causalProperties = Object.fromEntries(causalRequired.filter(key=>key!=='attempt'&&key!=='work_type').map(key=>[key,{type:'string',minLength:1}]));
  output(`events/${type}.schema.json`, render({
    $schema:'https://json-schema.org/draft/2020-12/schema', $id:`${type}.event.v1`,
    type:'object', additionalProperties:false,
    required:['schema_version','event_id','type','occurred_at','emitted_at','seq',...identityRequired,...causalRequired,...definition.required],
    properties:{...envelopeSchema.properties,...definition.properties,...causalProperties,type:{const:type}}
  }));
}
const union = catalog.event_types.map((type) => `  | '${type}'`).join('\n');
output('telemetry-types.ts', `// Generated by scripts/generate-telemetry-contracts.mjs. Do not edit.\nexport type TelemetryEventType =\n${union};\nexport interface CorrelationIdentity { project:string; run_id:string; work_id?:string|null; work_type?:'pipeline'|'module'|'gate'|'generator'|'validator'|'pipeline_step'|null; gate_id?:string|null; attempt?:number|null; dispatch_id?:string|null; session_id?:string|null; agent_id?:string|null; model_call_id?:string|null; tool_call_id?:string|null; source:string; producer:string; }\nexport type TelemetryEnvelope<T extends Record<string, unknown> = Record<string, unknown>> = CorrelationIdentity & T & { schema_version:'telemetry_envelope.v1'; event_id:string; type:TelemetryEventType; occurred_at:string; emitted_at:string; seq:number; cursor?:string|null; causation_id?:string|null; };\n`);
output('telemetry_types.go', `// Code generated by scripts/generate-telemetry-contracts.mjs. DO NOT EDIT.\npackage telemetryv1\n\nimport "encoding/json"\n\ntype CorrelationIdentity struct {\n Project string \`json:"project"\`; RunID string \`json:"run_id"\`; WorkID *string \`json:"work_id,omitempty"\`; WorkType *string \`json:"work_type,omitempty"\`; GateID *string \`json:"gate_id,omitempty"\`; Attempt *int \`json:"attempt,omitempty"\`; DispatchID *string \`json:"dispatch_id,omitempty"\`; SessionID *string \`json:"session_id,omitempty"\`; AgentID *string \`json:"agent_id,omitempty"\`; ModelCallID *string \`json:"model_call_id,omitempty"\`; ToolCallID *string \`json:"tool_call_id,omitempty"\`; Source string \`json:"source"\`; Producer string \`json:"producer"\`\n}\ntype Envelope struct { CorrelationIdentity; SchemaVersion string \`json:"schema_version"\`; EventID string \`json:"event_id"\`; Type string \`json:"type"\`; OccurredAt string \`json:"occurred_at"\`; EmittedAt string \`json:"emitted_at"\`; Seq uint64 \`json:"seq"\`; Cursor *string \`json:"cursor,omitempty"\`; CausationID *string \`json:"causation_id,omitempty"\`; Extensions map[string]json.RawMessage \`json:"extensions,omitempty"\` }\n`);
console.log(JSON.stringify({ ok:true, checked:check, events:catalog.event_types.length }));
