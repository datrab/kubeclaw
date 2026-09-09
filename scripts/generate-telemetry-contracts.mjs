#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveSchema, tsType, goFields, goName, assertEnvelopeReferences } from './lib/telemetry-type-generation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractDir = path.join(root, 'contracts', 'telemetry', 'v1');
const catalog = JSON.parse(fs.readFileSync(path.join(contractDir, 'catalog.json'), 'utf8'));
const identitySchema = JSON.parse(fs.readFileSync(path.join(contractDir, 'correlation_identity.schema.json'), 'utf8'));
const envelopeSchema = JSON.parse(fs.readFileSync(path.join(contractDir, 'envelope.schema.json'), 'utf8'));
const check = process.argv.includes('--check');
const written = new Set();

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function render(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function formatGo(content) {
  const result = spawnSync('gofmt', [], { input: content, encoding: 'utf8' });
  if (result.error) throw new Error(`gofmt is required to generate telemetry contracts: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gofmt failed while generating telemetry contracts: ${result.stderr.trim()}`);
  return result.stdout;
}
function output(relative, content) {
  const target = path.join(contractDir, relative);
  written.add(relative);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) throw new Error(`telemetry contract drift: ${relative}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
function schemaRef(name, required, properties, extra = {}) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: name,
    type: 'object',
    additionalProperties: false,
    required,
    properties: { extensions: { type: 'object' }, ...properties },
    ...extra,
  };
}
const string = { type: 'string', minLength: 1 };
const nullableString = { type: ['string', 'null'] };
const timestamp = { type: 'string', format: 'date-time' };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const gitCommit = { type: 'string', pattern: '^[a-f0-9]{40,64}$' };
const correlation = { $ref: '../correlation_identity.schema.json' };
const completeness = { enum: ['full', 'truncated', 'summarized', 'transformed', 'unavailable', 'reference_only'] };
const observability = { enum: ['complete', 'partial', 'degraded', 'unknown'] };
const evidenceProvenance = { enum: ['production', 'recorded', 'synthetic'] };
const capabilityAvailability = {
  type:'object', additionalProperties:false, required:['capability','status','reason_code'], properties:{
    capability:string, status:{enum:['available','capability_unavailable','degraded','unknown']}, reason_code:nullableString, details:{type:['object','null']},
  },
};
const producerHealthEntry = {
  type:'object', additionalProperties:false,
  required:['producer_id','status','last_successful_emission','lag','checkpoint','invalid_count','quarantined_count','dead_letter_count','missing_payload_count','restart_count','reconciliation','capabilities'],
  properties:{producer_id:string,status:{enum:['healthy','degraded','unhealthy','unknown','not_applicable']},last_successful_emission:{type:['string','null'],format:'date-time'},lag:{type:['integer','null'],minimum:0},checkpoint:nullableString,invalid_count:{type:'integer',minimum:0},quarantined_count:{type:'integer',minimum:0},dead_letter_count:{type:'integer',minimum:0},missing_payload_count:{type:'integer',minimum:0},restart_count:{type:'integer',minimum:0},reconciliation:{type:['object','null']},degradation_intervals:{type:'array',items:{type:'object',additionalProperties:false,required:['started_at','reason_code'],properties:{started_at:timestamp,ended_at:{type:['string','null'],format:'date-time'},reason_code:string}}},capabilities:{type:'array',items:capabilityAvailability}},
};
const lifecycleProjection = {type:'object',additionalProperties:false,required:['status'],properties:{status:string,run_id:nullableString,run_ref:nullableString,work_id:nullableString,module_id:nullableString,gate_id:nullableString,gate_type:nullableString,title:nullableString,module_dir:nullableString,attempt:{type:['integer','null'],minimum:0},current_attempt:{type:['integer','null'],minimum:0},previous_state:nullableString,reason_code:nullableString,halt_reason:nullableString,terminal_status:nullableString,terminal_decision:{type:['object','null']},run_mode:nullableString,resume:{type:['boolean','null']},requested_module_id:nullableString,entrypoint:nullableString,current_phase:nullableString,started_at:{type:['string','null'],format:'date-time'},attempt_started_at:{type:['string','null'],format:'date-time'},phase_started_at:{type:['string','null'],format:'date-time'},completed_at:{type:['string','null'],format:'date-time'},completion_summary:nullableString,fail_count:{type:['integer','null'],minimum:0},fail_summaries:{type:'array',items:{type:'object'}},last_failure:nullableString,blocked_at:{type:['string','null'],format:'date-time'},blocked_reason:nullableString,blocked_phase:nullableString,blocked_fail_count:{type:['integer','null'],minimum:0},dispatch_id:nullableString,gateway_label:nullableString,session_id:nullableString,session_key:nullableString,model:nullableString,commit_hash:nullableString,history:{type:'array',items:{type:'object',additionalProperties:false,properties:{timestamp:timestamp,from:nullableString,to:nullableString,agent:nullableString,note:nullableString}}},validation:{type:['object','null']},projection_source:nullableString,latest_event_type:nullableString,latest_event_at:{type:['string','null'],format:'date-time'},last_event_id:nullableString,last_effective_at:{type:['string','null'],format:'date-time'},lifecycle_version:{type:['integer','string','null']}}};
const lifecycleProjectionMap = {type:'object',additionalProperties:lifecycleProjection};
const attemptProjection={type:'object',additionalProperties:false,required:['attempt_id','work_id','work_type','attempt','status','last_event_id','last_effective_at'],properties:{attempt_id:string,work_id:string,work_type:{enum:['module','gate','generator','validator','pipeline_step']},attempt:{type:'integer',minimum:1},status:string,reason_code:nullableString,dispatch_id:nullableString,session_id:nullableString,last_event_id:string,last_effective_at:timestamp}};
const genericProjectionMap={type:'object',additionalProperties:{type:'object'}};
const lifecycleReadModels = {type:'object',additionalProperties:false,required:['pipeline','modules','gates','attempts'],properties:{pipeline:{oneOf:[lifecycleProjection,{type:'null'}]},modules:lifecycleProjectionMap,gates:lifecycleProjectionMap,generators:lifecycleProjectionMap,validators:lifecycleProjectionMap,pipeline_steps:lifecycleProjectionMap,attempts:{type:'object',additionalProperties:attemptProjection},progression:{type:'object',additionalProperties:false,required:['modules_total','modules_passed','modules_failed','modules_blocked','modules_active'],properties:{modules_total:{type:'integer',minimum:0},modules_passed:{type:'integer',minimum:0},modules_failed:{type:'integer',minimum:0},modules_blocked:{type:'integer',minimum:0},modules_active:{type:'integer',minimum:0}}},waits:genericProjectionMap,signals:genericProjectionMap,active_sessions:genericProjectionMap,cooldowns:genericProjectionMap,generated_at:timestamp,last_event_id:nullableString,last_event_type:nullableString,event_count:{type:'integer',minimum:0}}};
const lifecycleSnapshot={type:'object',additionalProperties:false,required:['schema_version','run_id','pipeline','modules','gates','attempts'],properties:{schema_version:{const:'pipeline_lifecycle_read_models.v1'},run_id:string,lifecycle_version:{const:'pipeline_lifecycle.v1'},last_cursor:nullableString,...lifecycleReadModels.properties}};
const workItem = {type:'object',additionalProperties:false,required:['work_type','work_id','depends_on','owner','configuration'],properties:{work_type:{enum:['module','gate','generator','validator','pipeline_step']},work_id:string,depends_on:{type:'array',items:string,uniqueItems:true},owner:string,configuration:{type:'object'}}};
const dependencyEdge = {type:'object',additionalProperties:false,required:['from','to'],properties:{from:string,to:string}};
const commandResult = {type:'object',additionalProperties:false,required:['status'],properties:{status:{enum:['completed','failed','rejected']},value:{},error_class:nullableString,message:nullableString}};
const scenarioFact = {type:'object',additionalProperties:false,required:['scenario_id','provenance','status','event_types'],properties:{scenario_id:string,provenance:evidenceProvenance,status:{enum:['covered','not_observed','capability_unavailable']},event_types:{type:'array',items:string,uniqueItems:true},reason_code:nullableString,bundle_reference:nullableString}};

const durableSchemas = {
  'run_manifest.v1': schemaRef('run_manifest.v1', ['schema_version','project','run_id','fingerprint','work_items','schema_versions'], {
    schema_version:{const:'run_manifest.v1'}, project:string, run_id:string, fingerprint:hash, work_items:{type:'array',items:workItem}, execution_order:{type:'array',items:{type:'string'}}, dependency_edges:{type:'array',items:dependencyEdge}, runtime_policies:{type:'object'}, models:{type:'array',items:{type:'object'}}, prompts:{type:'array',items:{type:'object'}}, tools:{type:'array',items:{type:'object'}}, skills:{type:'array',items:{type:'object'}}, plugins:{type:'array',items:{type:'object'}}, git:{type:'object'}, deployment:{type:'object'}, versions:{type:'object'}, schema_versions:{type:'object'}, created_at:timestamp,
  }),
  'run_archive_manifest.v1': schemaRef('run_archive_manifest.v1', ['schema_version','run_id','project','lifecycle','sources','manifest_reference','completeness','repair_state','sha256'], {
    schema_version:{const:'run_archive_manifest.v1'}, run_id:string, project:string, created_at:timestamp, lifecycle:{type:'object'}, sources:{type:'array'}, manifest_reference:string, terminal_reference:nullableString, completeness:observability, repair_state:{enum:['verified','repair_required','repaired','unrecoverable']}, sha256:hash,
  }),
  'run_catalog_entry.v1': schemaRef('run_catalog_entry.v1', ['schema_version','run_id','project','archive_reference','sha256','completeness','repair_state','recorded_at'], {
    schema_version:{const:'run_catalog_entry.v1'}, run_id:string, project:string, archive_reference:string, sha256:hash, completeness:observability, repair_state:string, recorded_at:timestamp,
  }),
  'artifact_published.v1': schemaRef('artifact_published.v1', ['schema_version','artifact_id','logical_id','kind','media_type','byte_length','sha256','content_class','producer','reference','correlation','completeness','original_byte_length','original_sha256','published_at'], {
    schema_version:{const:'artifact_published.v1'}, artifact_id:string, logical_id:string, kind:string, media_type:string, byte_length:{type:'integer',minimum:0}, sha256:hash, content_class:{enum:['metadata','payload','artifact','quarantined']}, producer:string, reference:{type:'string',pattern:'^blobs/sha256/[a-f0-9]{2}/[a-f0-9]{62}$'}, correlation, completeness, original_byte_length:{type:['integer','null'],minimum:0}, original_sha256:{oneOf:[hash,{type:'null'}]}, transformation:{type:['object','null']}, published_at:timestamp,
  }),
  'producer_health_snapshot.v1': schemaRef('producer_health_snapshot.v1', ['schema_version','run_id','generated_at','producers','completeness'], {
    schema_version:{const:'producer_health_snapshot.v1'}, run_id:string, generated_at:timestamp, producers:{type:'array',minItems:1,items:producerHealthEntry}, completeness:observability,
  }),
  'terminal_closure.v1': schemaRef('terminal_closure.v1', ['schema_version','run_id','project','closed_at','outcome','reason_code','manifest_fingerprint','observability','artifact_catalog_reference'], {
    schema_version:{const:'terminal_closure.v1'}, run_id:string, project:string, closed_at:timestamp, outcome:{enum:['success','failure','paused','cancelled','process_lost','abandoned','completed']}, reason_code:string, duration_ms:{type:['integer','null'],minimum:0}, counts:{type:'object'}, cost:{type:['object','null']}, last_work_id:nullableString, manifest_fingerprint:hash, observability, summary_reference:nullableString, artifact_catalog_reference:string,
  }),
  'pipeline_lifecycle_event.v1': schemaRef('pipeline_lifecycle_event.v1', ['schema_version','event_id','source_event_id','run_id','project','lifecycle_version','effective_at','authority','previous_state','new_state','reason_code'], {
    schema_version:{const:'pipeline_lifecycle_event.v1'}, event_id:string, source_event_id:string, run_id:string, project:string, work_id:nullableString, work_type:nullableString, module_id:nullableString, gate_id:nullableString, attempt:{type:['integer','null'],minimum:0}, lifecycle_version:{const:'pipeline_lifecycle.v1'}, effective_at:timestamp, authority:string, previous_state:nullableString, new_state:string, reason_code:string, data:{type:'object'},
  }),
  'pipeline_lifecycle_read_models.v1': schemaRef('pipeline_lifecycle_read_models.v1', ['schema_version','run_id','pipeline','modules','gates','attempts'], {
    schema_version:{const:'pipeline_lifecycle_read_models.v1'}, run_id:string, ...lifecycleReadModels.properties, lifecycle_version:{const:'pipeline_lifecycle.v1'}, last_cursor:nullableString,
  }),
  'evaluation_fact.v1': schemaRef('evaluation_fact.v1', ['schema_version','recorded_at','run_id','dimension','value'], {
    schema_version:{const:'evaluation_fact.v1'}, recorded_at:timestamp, run_id:string, project:string, work_id:nullableString, attempt:{type:['integer','null'],minimum:0}, dimension:string, value:{}, fingerprint:nullableString,
  }),
  'pipeline_command_evidence.v1': schemaRef('pipeline_command_evidence.v1', ['schema_version','state','recorded_at','command_id','command_type','actor','reason','command_hash'], {
    schema_version:{const:'pipeline_command_evidence.v1'}, state:{enum:['requested','accepted','rejected','completed']}, recorded_at:timestamp, command_id:string, command_type:{enum:['approval.resolve','pipeline.pause','pipeline.resume','pipeline.cancel']}, actor:string, capability:string, target:{type:['object','null']}, expected_lifecycle_version:{type:'integer',minimum:0}, reason:string, reason_code:nullableString, result:{oneOf:[commandResult,{type:'null'}]}, command_hash:hash,
  }),
  'runtime_log.v1': schemaRef('runtime_log.v1', ['schema_version','timestamp','level','component','message'], {
    schema_version:{const:'runtime_log.v1'}, timestamp:timestamp, level:{enum:['trace','debug','info','warn','error','fatal']}, component:string, message:{type:'string'}, project:nullableString, run_id:nullableString, work_id:nullableString, error_class:nullableString, reason_code:nullableString, extensions:{type:'object'},
  }),
  'quarantined_payload.v1': schemaRef('quarantined_payload.v1', ['schema_version','quarantine_id','quarantined_at','reason_code','producer'], {
    schema_version:{const:'quarantined_payload.v1'}, quarantine_id:string, quarantined_at:timestamp, reason_code:string, producer:string, identity:{type:['object','null']}, original_byte_length:{type:['integer','null'],minimum:0}, original_sha256:{oneOf:[hash,{type:'null'}]}, intended_type:nullableString,
  }),
  'pipeline_evidence_export.v1': schemaRef('pipeline_evidence_export.v1', ['schema_version','exported_at','source_run_id','verification','contracts_reference','contract_manifest_reference','source_git_commit','source_git_clean','bundle_sha256','hash_algorithm'], {
    schema_version:{const:'pipeline_evidence_export.v1'}, exported_at:timestamp, source_run_id:string, verification:{type:'object'}, contracts_reference:string, contract_manifest_reference:string, expected_source_facts_reference:string, source_git_commit:gitCommit, source_git_clean:{type:'boolean'}, bundle_sha256:hash, hash_algorithm:{const:'sha256-path-content-v1'},
  }),
  'expected_source_facts.v1': schemaRef('expected_source_facts.v1', ['schema_version','run_id','project','event_types','readiness_event_types','artifact_kinds','lifecycle_projection','scenario_facts','capabilities'], {
    schema_version:{const:'expected_source_facts.v1'}, run_id:string, project:string, event_types:{type:'array',items:{type:'string'},uniqueItems:true}, readiness_event_types:{type:'array',items:{type:'string'},uniqueItems:true}, artifact_kinds:{type:'array',items:{type:'string'},uniqueItems:true}, lifecycle_projection:lifecycleSnapshot, scenario_facts:{type:'array',items:scenarioFact}, capabilities:{type:'array',items:capabilityAvailability},
  }),
  'composed_prompt.v1': schemaRef('composed_prompt.v1', ['schema_version','artifact_id','reference','template_version','sections','completeness','byte_length','sha256','correlation'], {
    schema_version:{const:'composed_prompt.v1'}, artifact_id:string, reference:string, template_version:string, sections:{type:'array',minItems:1}, model:nullableString, provider:nullableString, thinking:nullableString, completeness, byte_length:{type:'integer',minimum:0}, sha256:hash, correlation,
  }),
  'pipeline_command_request.v1': schemaRef('pipeline_command_request.v1', ['schema_version','command_id','command_type','project','run_id','actor','capability','issued_at','expires_at','reason','target','expected_lifecycle_version'], {
    schema_version:{const:'pipeline_command_request.v1'}, command_id:string, command_type:{enum:['approval.resolve','pipeline.pause','pipeline.resume','pipeline.cancel']}, project:string, run_id:string, actor:string, capability:string, issued_at:timestamp, expires_at:timestamp, reason:string, target:{type:'object'}, expected_lifecycle_version:{type:'integer',minimum:0}, decision:nullableString, extensions:{type:'object'},
  }),
};

const sources = { 'correlation_identity.schema.json': identitySchema, 'envelope.schema.json': envelopeSchema };
const resolvedEnvelope = resolveSchema(envelopeSchema, sources);
const resolvedIdentity = resolveSchema(identitySchema, sources);

const payloadSchemas = new Map();
for (const type of catalog.event_types) {
  const relative = `payloads/${type}.schema.json`;
  const schema = JSON.parse(fs.readFileSync(path.join(contractDir, relative), 'utf8'));
  assertEnvelopeReferences(schema, envelopeSchema);
  const resolved = resolveSchema(schema, sources);
  payloadSchemas.set(type, resolved);
  written.add(relative);
  output(`events/${type}.schema.json`, render({
    $schema:'https://json-schema.org/draft/2020-12/schema', $id:`${type}.event.v1`, type:'object', additionalProperties:false,
    required:[...new Set([...envelopeSchema.required, ...(schema.required || [])])],
    properties:{...resolvedEnvelope.properties,...resolved.properties,type:{const:type},extensions:resolvedEnvelope.properties.extensions},
  }));
}
for (const [name, schema] of Object.entries(durableSchemas)) output(`bundle/${name}.schema.json`, render(schema));

const eventUnion = catalog.event_types.map((type) => `  | ${JSON.stringify(type)}`).join('\n');
const payloadInterfaces = [...payloadSchemas].map(([type,schema]) => {
  const required = new Set(schema.required || []);
  const fields = Object.entries(schema.properties || {}).map(([name,value])=>`  ${JSON.stringify(name)}${required.has(name)?'':'?'}: ${tsType(value)};`).join('\n');
  return `export interface ${goName(type)}Payload {\n${fields}\n}`;
}).join('\n\n');
const payloadMap = catalog.event_types.map((type)=>`  ${JSON.stringify(type)}: ${goName(type)}Payload;`).join('\n');
const identityTs = tsType(resolvedIdentity);
const envelopeTs = tsType({ ...resolvedEnvelope, properties: Object.fromEntries(Object.entries(resolvedEnvelope.properties).filter(([name]) => name !== 'type')) });
output('telemetry-types.ts', `// Generated from contracts/telemetry/v1 JSON Schemas. Do not edit.\nexport type TelemetryEventType =\n${eventUnion};\n${payloadInterfaces}\nexport interface TelemetryPayloadMap {\n${payloadMap}\n}\nexport type CorrelationIdentity = ${identityTs};\nexport type TelemetryEnvelope<K extends TelemetryEventType = TelemetryEventType> = K extends TelemetryEventType ? TelemetryPayloadMap[K] & ${envelopeTs} & { type: K } : never;\n`);
const goPayloads = [...payloadSchemas].map(([type,schema])=>`type ${goName(type)}Payload struct {\n${goFields(schema).join('\n')}\n}`).join('\n\n');
const identityNames = Object.fromEntries(Object.keys(identitySchema.properties).map((name) => [name, goName(name).replace(/Id$/u, 'ID')]));
const envelopeOwn = { ...resolvedEnvelope, properties: Object.fromEntries(Object.entries(resolvedEnvelope.properties).filter(([name]) => !Object.hasOwn(identitySchema.properties, name))) };
const envelopeNames = { event_id:'EventID', source_event_id:'SourceEventID', causation_id:'CausationID' };
output('telemetry_types.go', formatGo(`// Code generated from contracts/telemetry/v1 JSON Schemas. DO NOT EDIT.\npackage telemetryv1\n\nimport "encoding/json"\n\ntype CorrelationIdentity struct { ${goFields(resolvedIdentity, identityNames).join('; ')} }\ntype Envelope struct { CorrelationIdentity; ${goFields(envelopeOwn, envelopeNames).join('; ')} }\n\n${goPayloads}\n`));

const durableTs = Object.entries(durableSchemas).map(([name,schema])=>`export type ${goName(name)} = ${tsType(resolveSchema(schema, sources))};`).join('\n\n');
output('bundle-types.ts', `// Generated from bundle JSON Schemas. Do not edit.\n${durableTs}\n`);
const durableGo = Object.entries(durableSchemas).map(([name,schema])=>`type ${goName(name)} struct {\n${goFields(resolveSchema(schema, sources)).join('\n')}\n}`).join('\n\n');
output('bundle_types.go', formatGo(`// Code generated from bundle JSON Schemas. DO NOT EDIT.\npackage telemetryv1\n\nimport "encoding/json"\n\nvar _ json.RawMessage\n\n${durableGo}\n`));

output('fixtures/invalid/missing-run-id.json', render({schema_version:'telemetry_envelope.v1',event_id:'invalid',source_event_id:'invalid',type:'pipeline.started'}));

const manifestFiles = [
  'README.md','catalog.json','correlation_identity.schema.json','envelope.schema.json','telemetry-types.ts','telemetry_types.go','bundle-types.ts','bundle_types.go','fixtures/golden-event.json','fixtures/invalid/missing-run-id.json',
  ...catalog.event_types.flatMap((type)=>[`payloads/${type}.schema.json`,`events/${type}.schema.json`]),
  ...Object.keys(durableSchemas).map((name)=>`bundle/${name}.schema.json`),
].sort();
const manifest = {
  schema_version:'telemetry_contract_manifest.v1', contract_version:catalog.contract_version,
  compatibility:{unknown_fields:'reject_except_extensions',event_addition:'backward_compatible',required_field_addition:'breaking',migration:'explicit_versioned_adapter'},
  files:manifestFiles.map((relative)=>{const bytes=fs.readFileSync(path.join(contractDir,relative));return{path:relative,byte_length:bytes.length,sha256:sha256(bytes)};}),
};
output('contract-manifest.json', render(manifest));
console.log(JSON.stringify({ok:true,checked:check,events:catalog.event_types.length,durable_schemas:Object.keys(durableSchemas).length,manifest_files:manifest.files.length}));
