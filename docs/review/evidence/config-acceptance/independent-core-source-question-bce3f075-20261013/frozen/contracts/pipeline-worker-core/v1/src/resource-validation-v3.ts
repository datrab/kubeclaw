import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { canonicalJson } from './digest.ts';
import { workerCoreRelationErrors, PipelineWorkerCoreContractError } from './validation.ts';
import type { ContractValidationResult } from './types.ts';
import type { WorkerAttemptEnvelopeV3, WorkerAttemptResultV3, WorkerNativeResourceAccounting, WorkerNativeResourceMetric } from './resource-types-v3.ts';

export const workerNativeResourceMetrics: readonly WorkerNativeResourceMetric[] = ['cpuTimeMs', 'maximumMemoryBytes', 'maximumTasks'];
type Definition = 'workerProfile' | 'workerAttemptEnvelope' | 'workerAttemptResult';
type Validator = ((value: unknown) => boolean) & { errors?: unknown };
const Constructor = Ajv2020 as unknown as new(options: object) => { addSchema(schema: unknown): void; compile(schema: unknown): Validator };
const ajv = new Constructor({ strict: true, allErrors: true });
(addFormats as unknown as (value: unknown) => void)(ajv);
const schema = JSON.parse(fs.readFileSync(new URL('../schemas/pipeline-worker-core.v3.schema.json', import.meta.url), 'utf8')) as { $id: string };
ajv.addSchema(schema);
const validators = new Map<Definition, Validator>();

function accountingErrors(result: WorkerAttemptResultV3): string[] {
  const errors: string[] = [];
  for (const metric of workerNativeResourceMetrics) {
    const observation = result.resourceAccounting.observations[metric];
    const budget = result.resourceAccounting.budgets[metric];
    if (observation.status === 'observed') {
      if (!Number.isSafeInteger(observation.value) || result.resources[metric] !== observation.value) errors.push(`${metric}: invalid or inconsistent observation`);
    } else if (result.resources[metric] !== undefined) errors.push(`${metric}: unavailable observation cannot claim numeric use`);
    if (result.state === 'completed' && budget.state === 'requested'
      && (observation.status !== 'observed' || observation.value > budget.limit)) errors.push(`${metric}: requested budget was not satisfied`);
  }
  return errors;
}

export function checkWorkerResourceContractV3(definition: Definition, value: unknown): ContractValidationResult {
  let validate = validators.get(definition);
  if (!validate) { validate = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` }); validators.set(definition, validate); }
  if (!validate(value)) return { ok: false, errors: [JSON.stringify(validate.errors)] };
  const errors = workerCoreRelationErrors(definition, value);
  if (definition === 'workerAttemptResult') errors.push(...accountingErrors(value as WorkerAttemptResultV3));
  if (definition === 'workerAttemptEnvelope') {
    const envelope = value as WorkerAttemptEnvelopeV3;
    for (const metric of workerNativeResourceMetrics) {
      const budget = envelope.resourceBudgets[metric];
      if (budget.state === 'requested' && !Number.isSafeInteger(budget.limit)) errors.push(`${metric}: unsafe budget integer`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateWorkerResourceContractV3(definition: Definition, value: unknown): void {
  const checked = checkWorkerResourceContractV3(definition, value);
  if (!checked.ok) throw new PipelineWorkerCoreContractError(`${definition}.v3`, checked.errors);
}

export function initialWorkerNativeResourceAccounting(envelope: WorkerAttemptEnvelopeV3): WorkerNativeResourceAccounting {
  const unavailable = { status: 'unavailable' as const, reason: 'Native attempt has not supplied final kernel observations' };
  return { schemaVersion: 'worker-resource-accounting.v2', capabilities: structuredClone(envelope.profile.resourceCapabilities),
    budgets: structuredClone(envelope.resourceBudgets), observations: {
      cpuTimeMs: { ...unavailable }, maximumMemoryBytes: { ...unavailable }, maximumTasks: { ...unavailable },
    } };
}

export function checkWorkerNativeResultBinding(envelope: WorkerAttemptEnvelopeV3, result: WorkerAttemptResultV3): ContractValidationResult {
  const errors = [...checkWorkerResourceContractV3('workerAttemptEnvelope', envelope).errors,
    ...checkWorkerResourceContractV3('workerAttemptResult', result).errors];
  if (errors.length) return { ok: false, errors };
  const expected = [envelope.protocolVersion, envelope.attemptId, envelope.claim.claimId, envelope.claim.generation,
    envelope.claim.workerId, envelope.profile.profileDigest, envelope.attemptSpecDigest];
  const actual = [result.protocolVersion, result.attemptId, result.claimId, result.claimGeneration,
    result.workerId, result.profileDigest, result.attemptSpecDigest];
  if (canonicalJson(expected) !== canonicalJson(actual)) errors.push('native result identity does not match accepted attempt');
  if (canonicalJson(envelope.resourceBudgets) !== canonicalJson(result.resourceAccounting.budgets)
    || canonicalJson(envelope.profile.resourceCapabilities) !== canonicalJson(result.resourceAccounting.capabilities)) errors.push('native result policy does not match accepted attempt');
  errors.push(...resultLimits(envelope, result));
  return { ok: errors.length === 0, errors };
}

function resultLimits(envelope: WorkerAttemptEnvelopeV3, result: WorkerAttemptResultV3): string[] {
  const errors: string[] = [];
  const evidenceBytes = result.evidence.reduce((sum, item) => sum + item.artifact.sizeBytes, 0);
  if (result.evidence.length > envelope.limits.evidenceFiles || new Set(result.evidence.map(item => item.evidenceId)).size !== result.evidence.length
    || evidenceBytes !== result.resources.evidenceBytes || evidenceBytes > envelope.limits.evidenceBytes) errors.push('native result evidence exceeds or differs from accepted limits');
  if (result.resources.logBytes > envelope.limits.logBytes || result.resources.resultBytes > envelope.limits.resultBytes) errors.push('native result output exceeds accepted limits');
  if (result.specialistResult !== null && Buffer.byteLength(JSON.stringify(result.specialistResult)) !== result.resources.resultBytes) errors.push('native specialist result byte count mismatch');
  if (result.state === 'completed' && (Date.parse(result.startedAt) < Date.parse(envelope.claim.claimedAt)
    || Date.parse(result.completedAt) >= Date.parse(envelope.claim.expiresAt))) errors.push('native result outside accepted claim window');
  return errors;
}
