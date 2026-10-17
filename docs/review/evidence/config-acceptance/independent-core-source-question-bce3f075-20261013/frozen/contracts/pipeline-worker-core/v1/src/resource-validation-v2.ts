import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { canonicalJson } from './digest.ts';
import { workerCoreRelationErrors,PipelineWorkerCoreContractError } from './validation.ts';
import type { ContractValidationResult } from './types.ts';
import type {WorkerAttemptEnvelopeV2,WorkerAttemptResultV2,WorkerResourceAccounting,WorkerResourceMetric} from './resource-types-v2.ts';

export const workerResourceMetrics:readonly WorkerResourceMetric[]=['cpuTimeMs','maximumMemoryBytes','maximumProcesses'];
type Definition='workerProfile'|'workerAttemptEnvelope'|'workerAttemptResult';
type Validator=((value:unknown)=>boolean)&{errors?:unknown};
const Constructor=Ajv2020 as unknown as new(options:object)=>{addSchema(schema:unknown):void;compile(schema:unknown):Validator};
const ajv=new Constructor({strict:true,allErrors:true});
(addFormats as unknown as (value:unknown)=>void)(ajv);
const schema=JSON.parse(fs.readFileSync(new URL('../schemas/pipeline-worker-core.v2.schema.json',import.meta.url),'utf8')) as {$id:string};
ajv.addSchema(schema);
const validators=new Map<Definition,Validator>();

/** Numeric receipt values and their scoped observations must be identical, never invented zeros. */
function accountingErrors(result:WorkerAttemptResultV2):string[]{
 const errors:string[]=[];const accounting=result.resourceAccounting;
 for(const metric of workerResourceMetrics){
  const observed=accounting.observations[metric];const capability=accounting.capabilities[metric];const budget=accounting.budgets[metric];
  if(observed.status==='observed'){
   if(capability.measurement==='unavailable')errors.push(`${metric}: unavailable capability cannot claim observation`);
   if(result.resources[metric]!==observed.value)errors.push(`${metric}: numeric receipt does not match observation`);
  }else if(result.resources[metric]!==undefined)errors.push(`${metric}: unavailable observation cannot claim numeric resource use`);
  if(result.state==='completed' && budget.state==='requested' && (observed.status!=='observed' || capability.measurement==='unavailable' || observed.value>budget.limit))errors.push(`${metric}: requested resource budget was not satisfied`);
 }
 return errors;
}

export function checkWorkerResourceContractV2(definition:Definition,value:unknown):ContractValidationResult {
 let validate=validators.get(definition);if(!validate){validate=ajv.compile({$ref:`${schema.$id}#/$defs/${definition}`});validators.set(definition,validate);}
 if(!validate(value))return {ok:false,errors:[JSON.stringify(validate.errors)]};
 const errors=workerCoreRelationErrors(definition,value);
 if(definition==='workerAttemptResult')errors.push(...accountingErrors(value as WorkerAttemptResultV2));
 return {ok:errors.length===0,errors};
}
export function validateWorkerResourceContractV2(definition:Definition,value:unknown):void {
 const checked=checkWorkerResourceContractV2(definition,value);
 if(!checked.ok)throw new PipelineWorkerCoreContractError(`${definition}.v2`,checked.errors);
}

function resultLimitErrors(envelope:WorkerAttemptEnvelopeV2,result:WorkerAttemptResultV2):string[]{
 const errors:string[]=[];
 if(result.evidence.length>envelope.limits.evidenceFiles)errors.push('evidence file limit exceeded');
 if(new Set(result.evidence.map(item=>item.evidenceId)).size!==result.evidence.length)errors.push('duplicate evidence identity');
 const evidenceBytes=result.evidence.reduce((sum,item)=>sum+item.artifact.sizeBytes,0);
 if(evidenceBytes>envelope.limits.evidenceBytes || evidenceBytes!==result.resources.evidenceBytes)errors.push('evidence bytes do not match accepted limits and receipt');
 if(result.resources.logBytes>envelope.limits.logBytes || result.resources.resultBytes>envelope.limits.resultBytes)errors.push('log/result bytes exceed accepted limits');
 if(result.specialistResult!==null){
  const actualResultBytes=Buffer.byteLength(JSON.stringify(result.specialistResult),'utf8');
  if(actualResultBytes!==result.resources.resultBytes || actualResultBytes>envelope.limits.resultBytes)errors.push('actual specialist result bytes do not match accepted limit and receipt');
 }
 if(result.state==='completed' && (Date.parse(result.startedAt)<Date.parse(envelope.claim.claimedAt) || Date.parse(result.completedAt)>=Date.parse(envelope.claim.expiresAt)))errors.push('completed result falls outside accepted claim window');
 return errors;
}

/** Consumers opting in to V2 must bind resource policy as well as ordinary attempt/claim identity. */
export function checkWorkerResourceResultBinding(envelope:WorkerAttemptEnvelopeV2,result:WorkerAttemptResultV2):ContractValidationResult {
 const errors=[...checkWorkerResourceContractV2('workerAttemptEnvelope',envelope).errors,...checkWorkerResourceContractV2('workerAttemptResult',result).errors];
 if(errors.length)return {ok:false,errors};
 errors.push(...resultLimitErrors(envelope,result));
 const pairs=[['protocolVersion',envelope.protocolVersion,result.protocolVersion],['attemptId',envelope.attemptId,result.attemptId],['claimId',envelope.claim.claimId,result.claimId],['claimGeneration',envelope.claim.generation,result.claimGeneration],['workerId',envelope.claim.workerId,result.workerId],['profileDigest',envelope.profile.profileDigest,result.profileDigest],['attemptSpecDigest',envelope.attemptSpecDigest,result.attemptSpecDigest]];
 for(const [field,expected,actual] of pairs)if(expected!==actual)errors.push(`${field}: does not match accepted attempt`);
 if(canonicalJson(envelope.resourceBudgets)!==canonicalJson(result.resourceAccounting.budgets))errors.push('resource budgets do not match accepted attempt');
 if(canonicalJson(envelope.profile.resourceCapabilities)!==canonicalJson(result.resourceAccounting.capabilities))errors.push('resource capabilities do not match accepted profile');
 return {ok:errors.length===0,errors};
}

export function initialWorkerResourceAccounting(envelope:WorkerAttemptEnvelopeV2):WorkerResourceAccounting {
 return {schemaVersion:'worker-resource-accounting.v1',capabilities:structuredClone(envelope.profile.resourceCapabilities),budgets:structuredClone(envelope.resourceBudgets),observations:{
  cpuTimeMs:{status:'unavailable',reason:'Operation has not supplied child resource observations'},
  maximumMemoryBytes:{status:'unavailable',reason:'Operation has not supplied child resource observations'},
  maximumProcesses:{status:'unavailable',reason:'Operation has not supplied child resource observations'},
 }};
}
