import {workerResourceMetrics,type WorkerAttemptEnvelope,type WorkerResourceObservations,type WorkerResourceUseV1,type WorkerResourceAccounting} from '@kubeclaw/pipeline-worker-core-contract';
import type { WorkerNativeResourceAccounting } from '@kubeclaw/pipeline-worker-core-contract';
import { assessNativeWorkerResources } from './native-resource-accounting.ts';

export type ResourceCheck={resources:Partial<WorkerResourceUseV1>;error?:{code:string;message:string}};
const positiveObservation=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
function invalid(accounting?:WorkerResourceAccounting,message='Worker resource observation is missing or invalid'):ResourceCheck{
 if(accounting)for(const metric of workerResourceMetrics)accounting.observations[metric]={status:'unavailable',reason:message};
 return {resources:{},error:{code:'WORKER_RESOURCE_MEASUREMENT_INVALID',message}};
}
function regressed(current:Partial<WorkerResourceUseV1>,previous:Partial<WorkerResourceUseV1>):boolean {
 return workerResourceMetrics.some(metric=>current[metric]!==undefined && previous[metric]!==undefined && current[metric]!<previous[metric]!);
}

/** V1 remains strictly bounded. V2 never converts an unavailable observation to zero. */
export function assessWorkerResources(envelope:WorkerAttemptEnvelope,measured:unknown,accounting?:WorkerResourceAccounting | WorkerNativeResourceAccounting,previous:Partial<WorkerResourceUseV1>={}):ResourceCheck {
 if(envelope.schemaVersion==='worker-attempt-envelope.v1'){
  const values=measured as Record<string,unknown>|null;
  if(!values || !workerResourceMetrics.every(metric=>positiveObservation(values[metric])))return invalid();
  const resources=Object.fromEntries(workerResourceMetrics.map(metric=>[metric,values[metric]])) as Partial<WorkerResourceUseV1>;
  if(regressed(resources,previous))return invalid(undefined,'Cumulative worker resource observation regressed');
  const limits={cpuTimeMs:envelope.limits.cpuMillis,maximumMemoryBytes:envelope.limits.memoryBytes,maximumProcesses:envelope.limits.processes};
  const codes={cpuTimeMs:'WORKER_CPU_LIMIT',maximumMemoryBytes:'WORKER_MEMORY_LIMIT',maximumProcesses:'WORKER_PROCESS_LIMIT'};
  const exceeded=workerResourceMetrics.find(metric=>Number(resources[metric])>limits[metric]);
  return exceeded?{resources,error:{code:codes[exceeded],message:codes[exceeded]}}:{resources};
 }
 if(envelope.schemaVersion==='worker-attempt-envelope.v3'){
  if(accounting?.schemaVersion!=='worker-resource-accounting.v2')return invalid();
  return assessNativeWorkerResources(measured,accounting,previous);
 }
 if(accounting?.schemaVersion==='worker-resource-accounting.v2')return invalid();
 if(!accounting || !measured || typeof measured!=='object')return invalid(accounting);
 return assessDeclaredResources(measured as WorkerResourceObservations,accounting,previous);
}

function validObservation(observation:WorkerResourceObservations['cpuTimeMs'],capability:WorkerResourceAccounting['capabilities']['cpuTimeMs']):boolean {
 if(observation?.status==='observed')return positiveObservation(observation.value) && capability.measurement!=='unavailable';
 return observation?.status==='unavailable' && typeof observation.reason==='string' && observation.reason.length>0 && observation.reason.length<=4096;
}
function budgetError(metric:typeof workerResourceMetrics[number],observation:WorkerResourceObservations['cpuTimeMs'],budget:WorkerResourceAccounting['budgets']['cpuTimeMs']):ResourceCheck['error'] {
 if(budget.state==='unrequested')return undefined;
 if(observation.status==='unavailable')return {code:'WORKER_RESOURCE_MEASUREMENT_UNAVAILABLE',message:`Requested ${metric} budget cannot be established: ${observation.reason}`};
 if(observation.value>budget.limit)return {code:'WORKER_RESOURCE_LIMIT',message:`Requested ${metric} limit ${budget.limit} exceeded by ${observation.value}`};
 return undefined;
}
function assessDeclaredResources(measured:WorkerResourceObservations,accounting:WorkerResourceAccounting,previous:Partial<WorkerResourceUseV1>):ResourceCheck {
 // Validate the complete batch before mutating receipt accounting.
 if(!workerResourceMetrics.every(metric=>validObservation(measured[metric],accounting.capabilities[metric])))return invalid(accounting);
 const resources:Partial<WorkerResourceUseV1>={};let error:ResourceCheck['error'];
 for(const metric of workerResourceMetrics){
  const observation=measured[metric];
  if(observation.status==='observed')resources[metric]=observation.value;
  accounting.observations[metric]=structuredClone(observation);
  error??=budgetError(metric,observation,accounting.budgets[metric]);
 }
 if(regressed(resources,previous))return invalid(accounting,'Cumulative worker resource observation regressed');
 return {...(error?{error}:{}),resources};
}

export function unsupportedWorkerBudget(envelope:WorkerAttemptEnvelope):string|undefined {
 if(envelope.schemaVersion!=='worker-attempt-envelope.v2')return undefined;
 return workerResourceMetrics.find(metric=>envelope.resourceBudgets[metric].state==='requested' && envelope.profile.resourceCapabilities[metric].measurement==='unavailable');
}
