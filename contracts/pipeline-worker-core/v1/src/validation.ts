import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { sha256Text, workerAttemptResultDigest, workerAttemptSpecDigest, workerProfileDigest } from './digest.ts';
import type {
  ContractValidationResult,
  AttemptClaimV1,
  PipelineWorkerCoreDefinition,
  WorkerAttemptEnvelopeV1,
  WorkerAttemptMessageV1,
  WorkerAttemptResultV1,
  WorkerCancellationRequestV1,
  WorkerHealthV1,
  WorkerRegistrationV1,
  WorkerTrustEnvelopeV1,
} from './types.ts';

type Validator = ((value: unknown) => boolean) & { errors?: unknown[] | null };
interface AjvInstance {
  addSchema(schema: object): void;
  compile(schema: object): Validator;
}

const schemaUrl = new URL('../schemas/pipeline-worker-core.v1.schema.json', import.meta.url);
const schema = JSON.parse(fs.readFileSync(schemaUrl, 'utf8')) as { $id: string };
const AjvConstructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => AjvInstance;
const installFormats = addFormats as unknown as (instance: AjvInstance) => AjvInstance;
const ajv = new AjvConstructor({ allErrors: true, strict: true });
installFormats(ajv);
ajv.addSchema(schema);
const validators = new Map<string, Validator>();

export class PipelineWorkerCoreContractError extends Error {
  definition: string;
  errors: string[];

  constructor(definition: string, errors: string[]) {
    super(`Invalid pipeline worker-core ${definition}: ${errors.join('; ')}`);
    this.name = 'PipelineWorkerCoreContractError';
    this.definition = definition;
    this.errors = [...errors];
  }
}

function validator(definition: PipelineWorkerCoreDefinition): Validator {
  const existing = validators.get(definition);
  if (existing) return existing;
  const compiled = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` }) as Validator;
  validators.set(definition, compiled);
  return compiled;
}

function errorText(errors: unknown[] | null | undefined): string[] {
  if (!errors?.length) return ['contract validation failed without details'];
  return errors.map((error) => {
    if (!error || typeof error !== 'object') return String(error);
    const item = error as { instancePath?: string; message?: string };
    return `${item.instancePath || '/'} ${item.message || 'is invalid'}`;
  });
}

function relationErrors(definition: PipelineWorkerCoreDefinition, value: unknown): string[] {
  if (definition === 'workerTrustEnvelope') {
    const envelope = value as WorkerTrustEnvelopeV1;
    return Date.parse(envelope.expiresAt) > Date.parse(envelope.issuedAt)
      ? []
      : ['/expiresAt must be after /issuedAt'];
  }

  if (definition === 'workerProfile') {
    const profile = value as WorkerRegistrationV1['profiles'][number];
    try {
      return workerProfileDigest(profile as unknown as Record<string, unknown>) === profile.profileDigest
        ? []
        : ['/profileDigest does not match the profile contents'];
    } catch {
      return ['/profile contains a value that cannot be canonically hashed'];
    }
  }

  if (definition === 'workerRegistration') {
    const registration = value as WorkerRegistrationV1;
    const errors: string[] = [];
    if (registration.capacity.available + registration.capacity.active !== registration.capacity.total) {
      errors.push('/capacity available plus active must equal total');
    }
    for (const [index, profile] of registration.profiles.entries()) {
      if (profile.workerType !== registration.workerType) {
        errors.push(`/profiles/${index}/workerType must match /workerType`);
      }
      try {
        if (workerProfileDigest(profile as unknown as Record<string, unknown>) !== profile.profileDigest) {
          errors.push(`/profiles/${index}/profileDigest does not match the profile contents`);
        }
      } catch {
        errors.push(`/profiles/${index} contains a value that cannot be canonically hashed`);
      }
    }
    const profileIds = registration.profiles.map((profile) => profile.profileId);
    if (new Set(profileIds).size !== profileIds.length) {
      errors.push('/profiles cannot contain duplicate profileId values');
    }
    if (Date.parse(registration.sentAt) < Date.parse(registration.startedAt)) {
      errors.push('/sentAt must not be before /startedAt');
    }
    return errors;
  }

  if (definition === 'workerHealth') {
    const health = value as WorkerHealthV1;
    const errors: string[] = [];
    if (health.capacity.available + health.capacity.active !== health.capacity.total) {
      errors.push('/capacity available plus active must equal total');
    }
    if (health.activeAttemptIds.length !== health.capacity.active) {
      errors.push('/activeAttemptIds length must equal /capacity/active');
    }
    return errors;
  }

  if (definition === 'attemptClaim') {
    const claim = value as AttemptClaimV1;
    return Date.parse(claim.expiresAt) > Date.parse(claim.claimedAt)
      ? []
      : ['/expiresAt must be after /claimedAt'];
  }

  if (definition === 'workerAttemptEnvelope') {
    const envelope = value as WorkerAttemptEnvelopeV1;
    const errors: string[] = [];
    try {
      if (workerProfileDigest(envelope.profile as unknown as Record<string, unknown>)
        !== envelope.profile.profileDigest) {
        errors.push('/profile/profileDigest does not match the profile contents');
      }
      if (workerAttemptSpecDigest(envelope as unknown as Record<string, unknown>) !== envelope.attemptSpecDigest) {
        errors.push('/attemptSpecDigest does not match the attempt contents');
      }
    } catch {
      errors.push('/attempt contains a value that cannot be canonically hashed');
    }
    if (Date.parse(envelope.claim.expiresAt) <= Date.parse(envelope.claim.claimedAt)) {
      errors.push('/claim/expiresAt must be after /claim/claimedAt');
    }
    if (Date.parse(envelope.claim.claimedAt) < Date.parse(envelope.issuedAt)) {
      errors.push('/claim/claimedAt must not be before /issuedAt');
    }
    if (envelope.claim.attemptId !== envelope.attemptId) {
      errors.push('/claim/attemptId must match /attemptId');
    }
    if (Date.parse(envelope.queueDeadline) <= Date.parse(envelope.issuedAt)) {
      errors.push('/queueDeadline must be after /issuedAt');
    }
    const unsupported = envelope.grantedCapabilities.filter(
      (capability) => !envelope.profile.capabilities.includes(capability),
    );
    if (unsupported.length > 0) {
      errors.push('/grantedCapabilities must be supported by /profile/capabilities');
    }
    const packageIds = envelope.packages.map((item) => item.packageId);
    if (new Set(packageIds).size !== packageIds.length) {
      errors.push('/packages cannot contain duplicate packageId values');
    }
    const inputNames = envelope.inputs.map((item) => item.name);
    if (new Set(inputNames).size !== inputNames.length) {
      errors.push('/inputs cannot contain duplicate name values');
    }
    return errors;
  }

  if (definition === 'workerLogPart') {
    const part = value as { text: string; contentDigest: string };
    return sha256Text(part.text) === part.contentDigest
      ? []
      : ['/contentDigest does not match /text'];
  }

  if (definition === 'workerAttemptResult') {
    const result = value as WorkerAttemptResultV1;
    const errors: string[] = [];
    if (Date.parse(result.completedAt) < Date.parse(result.startedAt)) {
      errors.push('/completedAt must not be before /startedAt');
    }
    if (result.cleanup.state === 'failed' && result.state !== 'errored') {
      errors.push('/state must be errored when /cleanup/state is failed');
    }
    try {
      if (workerAttemptResultDigest(result as unknown as Record<string, unknown>) !== result.resultDigest) {
        errors.push('/resultDigest does not match the result contents');
      }
    } catch {
      errors.push('/result contains a value that cannot be canonically hashed');
    }
    return errors;
  }

  return [];
}

export function checkPipelineWorkerCoreContract(
  definition: PipelineWorkerCoreDefinition,
  value: unknown,
): ContractValidationResult {
  const validate = validator(definition);
  const ok = validate(value);
  if (!ok) return { ok: false, errors: errorText(validate.errors) };
  const errors = relationErrors(definition, value);
  return { ok: errors.length === 0, errors };
}

export function validatePipelineWorkerCoreContract(
  definition: PipelineWorkerCoreDefinition,
  value: unknown,
): void {
  const result = checkPipelineWorkerCoreContract(definition, value);
  if (!result.ok) throw new PipelineWorkerCoreContractError(definition, result.errors);
}

export function checkWorkerAttemptMessageBinding(
  envelope: WorkerAttemptEnvelopeV1,
  message: WorkerAttemptMessageV1,
): ContractValidationResult {
  const errors: string[] = [];
  if (message.protocolVersion !== envelope.protocolVersion) errors.push('/protocolVersion does not match the attempt');
  if (message.attemptId !== envelope.attemptId) errors.push('/attemptId does not match the attempt');
  if (message.claimId !== envelope.claim.claimId) errors.push('/claimId does not match the attempt claim');
  if (message.claimGeneration !== envelope.claim.generation) {
    errors.push('/claimGeneration does not match the attempt claim');
  }
  if (message.workerId !== envelope.claim.workerId) errors.push('/workerId does not match the attempt claim');
  return { ok: errors.length === 0, errors };
}

export function checkWorkerCancellationBinding(
  envelope: WorkerAttemptEnvelopeV1,
  request: WorkerCancellationRequestV1,
): ContractValidationResult {
  const errors: string[] = [];
  if (request.protocolVersion !== envelope.protocolVersion) errors.push('/protocolVersion does not match the attempt');
  if (request.attemptId !== envelope.attemptId) errors.push('/attemptId does not match the attempt');
  if (request.cancellationId !== envelope.cancellationId) {
    errors.push('/cancellationId does not match the attempt');
  }
  return { ok: errors.length === 0, errors };
}

export function checkWorkerAttemptEnvelopeConsistency(
  accepted: WorkerAttemptEnvelopeV1,
  candidate: WorkerAttemptEnvelopeV1,
): ContractValidationResult {
  const errors = [...checkPipelineWorkerCoreContract('workerAttemptEnvelope', candidate).errors];
  if (candidate.attemptId !== accepted.attemptId) errors.push('/attemptId does not match the accepted attempt');
  if (candidate.attemptSpecDigest !== accepted.attemptSpecDigest) {
    errors.push('/attemptSpecDigest does not match the accepted attempt');
  }
  if (candidate.profile.profileDigest !== accepted.profile.profileDigest) {
    errors.push('/profile/profileDigest does not match the accepted attempt');
  }
  if (candidate.protocolVersion !== accepted.protocolVersion) {
    errors.push('/protocolVersion does not match the accepted attempt');
  }
  if (candidate.claim.claimId !== accepted.claim.claimId) errors.push('/claim/claimId cannot change');
  if (candidate.claim.generation !== accepted.claim.generation) errors.push('/claim/generation cannot change');
  if (candidate.claim.workerId !== accepted.claim.workerId) errors.push('/claim/workerId cannot change');
  if (candidate.claim.claimedAt !== accepted.claim.claimedAt) errors.push('/claim/claimedAt cannot change');
  if (Date.parse(candidate.claim.expiresAt) < Date.parse(accepted.claim.expiresAt)) {
    errors.push('/claim/expiresAt can only be extended');
  }
  return { ok: errors.length === 0, errors };
}
