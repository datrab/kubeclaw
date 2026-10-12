import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=new URL('../schemas/pipeline-worker-core.v1.schema.json',import.meta.url);
const output=new URL('../schemas/pipeline-worker-core.v2.schema.json',import.meta.url);
const schema=JSON.parse(await readFile(source,'utf8'));
schema.$id='https://kubeclaw.dev/contracts/pipeline-worker-core/v2/schema.json';
schema.title='KubeClaw explicit resource-aware worker attempts v2 (generated from V1 common protocol)';
const defs=schema.$defs;
const text={type:'string',minLength:1,maxLength:4096};
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const ref=name=>({$ref:`#/$defs/${name}`});
const metrics={cpuTimeMs:'milliseconds',maximumMemoryBytes:'bytes',maximumProcesses:'processes'};
defs.resourceObservation={oneOf:[object({status:{const:'observed'},value:{type:'integer',minimum:0}}),object({status:{const:'unavailable'},reason:text})]};
defs.resourceBudget={oneOf:[object({state:{const:'requested'},limit:{type:'integer',minimum:1}}),object({state:{const:'unrequested'}})]};
defs.resourceCapabilities=object({schemaVersion:{const:'worker-resource-capabilities.v1'},...Object.fromEntries(Object.entries(metrics).map(([metric,unit])=>[metric,{oneOf:[
 object({scope:text,unit:{const:unit},measurement:{const:'measured'}}),
 object({scope:text,unit:{const:unit},measurement:{const:'sampled'},sampleIntervalMs:{type:'integer',minimum:1}}),
 object({scope:text,unit:{const:unit},measurement:{const:'unavailable'},reason:text})]}]))});
defs.resourceBudgets=object({schemaVersion:{const:'worker-resource-budgets.v1'},...Object.fromEntries(Object.keys(metrics).map(metric=>[metric,ref('resourceBudget')]))});
defs.resourceObservations=object(Object.fromEntries(Object.keys(metrics).map(metric=>[metric,ref('resourceObservation')])));
defs.resourceAccounting=object({schemaVersion:{const:'worker-resource-accounting.v1'},capabilities:ref('resourceCapabilities'),budgets:ref('resourceBudgets'),observations:ref('resourceObservations')});
defs.workerProfile.properties.schemaVersion={const:'worker-profile.v2'};
defs.workerProfile.required.push('resourceCapabilities');defs.workerProfile.properties.resourceCapabilities=ref('resourceCapabilities');
for(const name of ['cpuMillis','memoryBytes','processes']){delete defs.workerAttemptLimits.properties[name];defs.workerAttemptLimits.required=defs.workerAttemptLimits.required.filter(key=>key!==name);}
defs.workerAttemptEnvelope.properties.schemaVersion={const:'worker-attempt-envelope.v2'};
defs.workerAttemptEnvelope.required.push('resourceBudgets');defs.workerAttemptEnvelope.properties.resourceBudgets=ref('resourceBudgets');
defs.workerAttemptResult.properties.schemaVersion={const:'worker-attempt-result.v2'};
Object.assign(defs.workerAttemptResult.properties,{profileDigest:ref('digest'),attemptSpecDigest:ref('digest'),resourceAccounting:ref('resourceAccounting')});
defs.workerAttemptResult.required.push('profileDigest','attemptSpecDigest','resourceAccounting');
// Expose only the opted-in profile/attempt/result graph. Existing remote registration stays V1.
const reachable=new Set();
function include(name){
 if(reachable.has(name))return;reachable.add(name);
 const scan=value=>{if(!value || typeof value!=='object')return;if(typeof value.$ref==='string' && value.$ref.startsWith('#/$defs/'))include(value.$ref.slice(8));Object.values(value).forEach(scan);};
 scan(defs[name]);
}
['workerProfile','workerAttemptEnvelope','workerAttemptResult'].forEach(include);
for(const name of Object.keys(defs))if(!reachable.has(name))delete defs[name];
const generated=JSON.stringify(schema,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(await readFile(output,'utf8'),generated,'generated V2 schema is stale');
else await writeFile(output,generated);
