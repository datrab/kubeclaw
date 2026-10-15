import { assertHistoricalInput, type HistoricalStagedAdmission, type HistoricalInputReference } from './preparation-historical-reference.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { RemotePlanJobV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';
import {
  assertPreparedHeader, preparedPlanHeader, preparationDigest, type PreparedPlanJob,
} from './preparation-header.ts';
import { preparationSourceDirectory } from './preparation-source.ts';

/** Immutable original wire, retained independently of a later extraction attempt. */
export interface StagedInputReference {
  readonly schemaVersion: 'buster-staged-input.v1';
  readonly admissionId: string;
  readonly preparationUid: PreparationSlot;
  readonly jobId: string;
  readonly requestDigest: string;
  readonly headerDigest: string;
  readonly wireDigest: string;
  readonly wireBytes: number;
  readonly attemptSpecDigest: string;
}

export interface StagedAdmission {
  readonly job: PreparedPlanJob;
  readonly input: StagedInputReference;
}

export type BusterStagedAdmission = StagedAdmission | HistoricalStagedAdmission;
export type BusterInputReference = StagedInputReference | HistoricalInputReference;

export function assertBusterInput(value: unknown, job: PreparedPlanJob): asserts value is BusterInputReference {
  if (value && typeof value === 'object' && 'schemaVersion' in value
    && value.schemaVersion === 'buster-historical-input.v1') assertHistoricalInput(value, job);
  else assertStagedInput(value, job);
}

export function wireDigest(wire: Uint8Array): string {
  return `sha256:${createHash('sha256').update(wire).digest('hex')}`;
}

export function assertStagedInput(value: unknown, job: PreparedPlanJob): asserts value is StagedInputReference {
  assertPreparedHeader(job);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BUSTER_STAGED_INPUT_INVALID');
  const input = value as StagedInputReference;
  const keys = ['schemaVersion', 'admissionId', 'preparationUid', 'jobId', 'requestDigest',
    'headerDigest', 'wireDigest', 'wireBytes', 'attemptSpecDigest'];
  assertPreparationSlot(input.preparationUid);
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))
    || input.schemaVersion !== 'buster-staged-input.v1'
    || typeof input.admissionId !== 'string' || !/^[a-f0-9]{32}$/u.test(input.admissionId)
    || ![input.wireDigest, input.attemptSpecDigest].every(digest => typeof digest === 'string' && /^sha256:[a-f0-9]{64}$/u.test(digest))
    || !Number.isSafeInteger(input.wireBytes) || input.wireBytes < 1
    || input.jobId !== job.jobId || input.requestDigest !== job.requestDigest
    || input.headerDigest !== preparationDigest(job)) throw new Error('BUSTER_STAGED_INPUT_INVALID');
}

async function durableExclusive(file: string, bytes: Uint8Array): Promise<void> {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.chmod(0o444); await handle.sync(); }
  finally { await handle.close(); }
}

/** Produced by the owned validator before allocating source storage. */
export function stagedInputMetadata(job: RemotePlanJobV1, wire: Buffer,
  admissionId: string, attemptSpecDigest: string, settings: BusterPreparationSettings): StagedAdmission {
  const preparationUid = process.getuid?.();
  assertPreparationSlot(preparationUid);
  if (process.getgid?.() !== preparationUid) throw new Error('BUSTER_PREPARATION_SLOT_INVALID');
  const header = preparedPlanHeader(job);
  const staged: StagedAdmission = { job: header, input: {
    schemaVersion: 'buster-staged-input.v1', admissionId, preparationUid,
    jobId: header.jobId, requestDigest: header.requestDigest, headerDigest: preparationDigest(header),
    wireDigest: wireDigest(wire), wireBytes: wire.byteLength, attemptSpecDigest,
  } };
  assertStagedInput(staged.input, header);
  const metadata = Buffer.from(JSON.stringify(staged));
  if (wire.byteLength > settings.maximumRequestBytes
    || Buffer.byteLength(JSON.stringify(header)) > settings.maximumHeaderBytes
    || metadata.byteLength + 4 * settings.maximumInputBytes > settings.maximumResultBytes) {
    throw new Error('BUSTER_PREPARATION_RESULT_CAPACITY');
  }
  return staged;
}

/** Runs only inside the owned staging host after the service's admission decision. */
export async function stagePreparationInput(staged: StagedAdmission, wire: Buffer, root: string,
  signal: AbortSignal, onAllocated: () => void): Promise<StagedAdmission> {
  assertStagedInput(staged.input, staged.job);
  if (wire.length !== staged.input.wireBytes || wireDigest(wire) !== staged.input.wireDigest) {
    throw new Error('BUSTER_STAGED_INPUT_INVALID');
  }
  const metadata = Buffer.from(JSON.stringify(staged));
  const admissionId = staged.input.admissionId;
  signal.throwIfAborted();
  const directory = preparationSourceDirectory(root, admissionId);
  await fs.mkdir(directory, { mode: 0o755 });
  onAllocated();
  await durableExclusive(path.join(directory, 'request.json'), wire);
  await durableExclusive(path.join(directory, 'input.json'), metadata);
  for (const item of [directory, path.dirname(directory)]) {
    const handle = await fs.open(item, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
  return staged;
}
