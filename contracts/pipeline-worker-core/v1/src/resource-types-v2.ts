import type { WorkerAttemptEnvelopeV1,WorkerAttemptLimitsV1,WorkerAttemptResultV1,WorkerProfileV1 } from './types.ts';

export type WorkerResourceMetric = 'cpuTimeMs'|'maximumMemoryBytes'|'maximumProcesses';
export type WorkerResourceCapability = {scope:string;unit:'milliseconds'|'bytes'|'processes'} & (
  {measurement:'measured'} | {measurement:'sampled';sampleIntervalMs:number} | {measurement:'unavailable';reason:string});
export type WorkerResourceCapabilities = {schemaVersion:'worker-resource-capabilities.v1'} & Record<WorkerResourceMetric,WorkerResourceCapability>;
export type WorkerResourceBudget = {state:'requested';limit:number}|{state:'unrequested'};
export type WorkerResourceBudgets = {schemaVersion:'worker-resource-budgets.v1'} & Record<WorkerResourceMetric,WorkerResourceBudget>;
export type WorkerResourceObservation = {status:'observed';value:number}|{status:'unavailable';reason:string};
export type WorkerResourceObservations = Record<WorkerResourceMetric,WorkerResourceObservation>;
export type WorkerProfileV2 = Omit<WorkerProfileV1,'schemaVersion'> & {schemaVersion:'worker-profile.v2';resourceCapabilities:WorkerResourceCapabilities};
export type WorkerAttemptLimitsV2 = Omit<WorkerAttemptLimitsV1,'cpuMillis'|'memoryBytes'|'processes'>;
/** Explicit opt-in schema. The V1 envelope and its mandatory budgets are unchanged. */
export type WorkerAttemptEnvelopeV2 = Omit<WorkerAttemptEnvelopeV1,'schemaVersion'|'profile'|'limits'> & {
  schemaVersion:'worker-attempt-envelope.v2';profile:WorkerProfileV2;limits:WorkerAttemptLimitsV2;resourceBudgets:WorkerResourceBudgets;
};
export type WorkerResourceAccounting = {schemaVersion:'worker-resource-accounting.v1';capabilities:WorkerResourceCapabilities;budgets:WorkerResourceBudgets;observations:WorkerResourceObservations};
export type WorkerAttemptResultV2 = Omit<WorkerAttemptResultV1,'schemaVersion'> & {
  schemaVersion:'worker-attempt-result.v2';profileDigest:string;attemptSpecDigest:string;resourceAccounting:WorkerResourceAccounting;
};
export type WorkerAttemptEnvelope = WorkerAttemptEnvelopeV1|WorkerAttemptEnvelopeV2;
export type WorkerAttemptResult = WorkerAttemptResultV1|WorkerAttemptResultV2;
export type WorkerResultFor<E extends WorkerAttemptEnvelope> = E extends WorkerAttemptEnvelopeV2 ? WorkerAttemptResultV2 : WorkerAttemptResultV1;
