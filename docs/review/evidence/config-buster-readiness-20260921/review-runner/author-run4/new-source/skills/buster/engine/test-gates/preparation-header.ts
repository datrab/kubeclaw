import fs from 'node:fs';
import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  remotePlanJobId, resolvedTestPlanDigest, validatePipelineTestGateContract,
  type RemotePlanJobV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { createHash } from 'node:crypto';

/** Original wire identity, without the bulk archive. Only an owned validator creates this header. */
export type PreparedPlanJob = Omit<RemotePlanJobV1, 'schemaVersion' | 'repositoryArchive'> & {
  readonly schemaVersion: 'buster-plan-job-header.v1';
  readonly repositoryArchive: Omit<RemotePlanJobV1['repositoryArchive'], 'schemaVersion' | 'data'> & {
    readonly schemaVersion: 'repository-archive-summary.v1';
  };
};

export interface PreparedSourceReference {
  readonly schemaVersion: 'buster-prepared-source.v1';
  readonly admissionId: string;
  readonly preparationUid: PreparationSlot;
  readonly jobId: string;
  readonly requestDigest: string;
  readonly headerDigest: string;
  readonly archiveDigest: string;
  readonly archiveBytes: number;
  readonly attemptSpecDigest: string;
}

type Validator = ((value: unknown) => boolean) & { errors?: unknown[] | null };
interface SchemaCompiler {
  compile(schema: object): Validator;
  addFormat(name: string, format: unknown): unknown;
}
interface ObjectSchema {
  properties: Record<string, unknown>;
  required: string[];
  [key: string]: unknown;
}
const wireSchema = JSON.parse(fs.readFileSync(new URL(
  '../../../../contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json', import.meta.url,
), 'utf8')) as { $id: string; $defs: Record<string, ObjectSchema> };
const headerSchema = structuredClone(wireSchema);
if (!headerSchema.$defs.remotePlanJob || !headerSchema.$defs.repositoryArchive) {
  throw new Error('BUSTER_PREPARATION_WIRE_SCHEMA_MISSING');
}
headerSchema.$id = 'kubeclaw.buster.prepared-header.v1';
headerSchema.$defs.remotePlanJob.properties.schemaVersion = { const: 'buster-plan-job-header.v1' };
headerSchema.$defs.repositoryArchive.properties.schemaVersion = { const: 'repository-archive-summary.v1' };
delete headerSchema.$defs.repositoryArchive.properties.data;
headerSchema.$defs.repositoryArchive.required = headerSchema.$defs.repositoryArchive.required.filter(key => key !== 'data');
const Constructor = Ajv2020 as unknown as new (options: object) => SchemaCompiler;
const compiler = new Constructor({ allErrors: true, strict: true });
(addFormats as unknown as (value: SchemaCompiler) => void)(compiler);
const validateHeader = compiler.compile({ ...headerSchema, $ref: '#/$defs/remotePlanJob' });

export function preparationDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function preparedPlanHeader(job: RemotePlanJobV1): PreparedPlanJob {
  const { data: _data, schemaVersion: _version, ...archive } = job.repositoryArchive;
  return { ...job, schemaVersion: 'buster-plan-job-header.v1',
    repositoryArchive: { ...archive, schemaVersion: 'repository-archive-summary.v1' } };
}

export function assertPreparedHeader(value: unknown): asserts value is PreparedPlanJob {
  if (!validateHeader(value)) throw new Error('BUSTER_PREPARATION_HEADER_INVALID');
  const job = value as PreparedPlanJob;
  validatePipelineTestGateContract('resolvedTestPlan', job.plan);
  if (remotePlanJobId(job.idempotencyKey) !== job.jobId
    || resolvedTestPlanDigest(job.plan) !== job.plan.planDigest
    || job.sourceSnapshot.archiveContentDigest !== job.repositoryArchive.contentDigest
    || job.sourceSnapshot.archiveSizeBytes !== job.repositoryArchive.sizeBytes
    || job.sourceSnapshot.pipelineStageId !== job.pipelineStageId
    || job.sourceSnapshot.attestation.authority !== job.sourceSnapshot.creatorAuthority) {
    throw new Error('BUSTER_PREPARATION_HEADER_IDENTITY_INVALID');
  }
}

export function assertPreparedSourceShape(value: unknown): asserts value is PreparedSourceReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BUSTER_PREPARATION_SOURCE_INVALID');
  const source = value as PreparedSourceReference;
  assertPreparationSlot(source.preparationUid);
  const keys = ['schemaVersion', 'admissionId', 'jobId', 'requestDigest', 'headerDigest',
    'archiveDigest', 'archiveBytes', 'attemptSpecDigest', 'preparationUid'];
  if (Object.keys(source).length !== keys.length || keys.some(key => !Object.hasOwn(source, key))
    || source.schemaVersion !== 'buster-prepared-source.v1'
    || typeof source.admissionId !== 'string' || !/^[a-f0-9]{32}$/u.test(source.admissionId)
    || typeof source.jobId !== 'string' || !/^job:[a-f0-9]{64}$/u.test(source.jobId)
    || ![source.requestDigest, source.headerDigest, source.archiveDigest, source.attemptSpecDigest]
      .every(value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value))
    || !Number.isSafeInteger(source.archiveBytes) || source.archiveBytes < 1) {
    throw new Error('BUSTER_PREPARATION_SOURCE_INVALID');
  }
}

export function assertPreparedSource(value: unknown, job: PreparedPlanJob): asserts value is PreparedSourceReference {
  assertPreparedHeader(job);
  assertPreparedSourceShape(value);
  if (value.jobId !== job.jobId || value.requestDigest !== job.requestDigest
    || value.headerDigest !== preparationDigest(job)
    || value.archiveDigest !== job.repositoryArchive.contentDigest
    || value.archiveBytes !== job.repositoryArchive.sizeBytes) {
    throw new Error('BUSTER_PREPARATION_SOURCE_INVALID');
  }
}
