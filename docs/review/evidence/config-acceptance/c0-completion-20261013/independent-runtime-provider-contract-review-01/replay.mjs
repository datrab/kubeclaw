import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const base='docs/review/evidence/config-acceptance/c0-completion-20261013/runtime-provider-contracts-01';
const output='docs/review/evidence/config-acceptance/c0-completion-20261013/independent-runtime-provider-contract-review-01';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const ajv=new Ajv2020({strict:true,allowUnionTypes:true,allErrors:true,useDefaults:false,coerceTypes:false,removeAdditional:false});addFormats(ajv);
const observations=[];
for(const pkg of ['api-flow','http','openapi']) {
 const owner=read(`${base}/config/plugins/kubeclaw.${pkg}.config.json`),validate=ajv.compile(read(`${base}/schemas/kubeclaw.${pkg}.schema.json`));
 for(const outcome of ['onPass','onFail','onError']) {const candidate=structuredClone(owner);candidate.profiles.A.declarations.evidenceDefaults[outcome]=[];observations.push({check:'baseline-evidence-erasure',pkg,outcome,accepted:validate(candidate),errors:validate.errors});}
}
const currentConfig=ajv.compile(read('skills/buster/plugins/api-flow/schemas/config.schema.json'));
observations.push({check:'current-root-zero-schema-before-provider',input:{flowFile:'flow-a.json',requestTimeoutMs:0},accepted:currentConfig({flowFile:'flow-a.json',requestTimeoutMs:0}),errors:currentConfig.errors});
const flow=read(`${base}/task-fixtures/repository/flow-one.json`);flow.steps[0].timeoutMs=50;
const oldFlow=ajv.compile(read('skills/buster/plugins/api-flow/schemas/flow.schema.json'));
const targetAjv=new Ajv2020({strict:true,allowUnionTypes:true,allErrors:true,useDefaults:false,coerceTypes:false,removeAdditional:false});addFormats(targetAjv);
const newFlow=targetAjv.compile(read(`${base}/schemas/api-flow.target-task-file.schema.json`));
observations.push({check:'legitimate-task-step-deadline',value:50,currentAccepted:oldFlow(flow),targetAccepted:newFlow(flow),targetErrors:newFlow.errors});
const owner=read(`${base}/config/plugins/kubeclaw.network-http.config.json`);
const refs=read(`${base}/profile-index.json`).filter(r=>r.registrationId==='kubeclaw.network-http:http');
for(const r of refs) {const p=owner.profiles[r.profileId].processing;observations.push({check:'Nova-full-per-field-profile',id:r.originalSettingId,side:r.side,profile:r.profileId,processing:p});}
const request=read(`${base}/task-fixtures/nova-request-524289.json`);
const response=fs.readFileSync(`${base}/task-fixtures/nova-response-524289.json`);
observations.push({check:'Nova-wire-bytes-pure',actualJSONStringifyBytes:Buffer.byteLength(JSON.stringify(request)),deliveredResponseDefinitionBytes:response.length,responseBusinessObject:JSON.parse(response.toString()),activationOrRequestExecuted:false});
fs.writeFileSync(path.join(output,'pure-replay-observations.json'),JSON.stringify({qualification:'Specific independent schema/serialization replay only; no provider execute, native constructor/invoke, adapter activation, server, network, Eval, credentials or production changes',node:process.version,observations},null,2)+'\n');
console.log(JSON.stringify({checks:observations.length,evidenceErasuresAccepted:observations.filter(x=>x.check==='baseline-evidence-erasure'&&x.accepted).length,rootZeroAccepted:observations.find(x=>x.check==='current-root-zero-schema-before-provider').accepted,stepIntent:observations.find(x=>x.check==='legitimate-task-step-deadline'),wire:observations.at(-1)}));
