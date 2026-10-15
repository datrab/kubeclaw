import { assertPreparationSlot } from './preparation-slots.ts';
import { Socket } from 'node:net';
import {
  NativeWorkerControlChannel, WorkerAttemptExecutor, observeNativeWorkerResources, sha256Digest,
  type WorkerAttemptOperation,
} from '@kubeclaw/worker-core';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateBusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { readPreparationInput, materializePreparedSource, preparationSourceDirectory } from './preparation-source.ts';
import { PreparationHostInput, preparationHostChannelLimits } from './preparation-host-channel.ts';
import { stagePreparationInput, stagedInputMetadata, assertBusterInput, wireDigest, type BusterInputReference } from './preparation-input.ts';
import { preparedPlanHeader, preparationDigest } from './preparation-header.ts';

async function readEnvelope(maximumBytes: number): Promise<WorkerAttemptEnvelopeV3> {
  const chunks: Buffer[] = [];
  let count = 0;
  for await (const chunk of process.stdin) {
    count += chunk.byteLength;
    if (count > maximumBytes) throw new Error('BUSTER_PREPARATION_ENVELOPE_LIMIT');
    chunks.push(Buffer.from(chunk));
  }
  const envelope: unknown = JSON.parse(Buffer.concat(chunks, count).toString('utf8'));
  validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
  return envelope as WorkerAttemptEnvelopeV3;
}

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`BUSTER_PREPARATION_ASSIGNED_ENV_REQUIRED:${name}`);
  return value;
}

async function assignedPhase() {
  const maximumInputBytes = Number(environment('BUSTER_PREPARATION_ASSIGNED_INPUT_BYTES'));
  if (!Number.isSafeInteger(maximumInputBytes) || maximumInputBytes < 1 || maximumInputBytes > 2_147_483_647) {
    throw new Error('BUSTER_PREPARATION_ENVELOPE_LIMIT');
  }
  const envelope = await readEnvelope(maximumInputBytes);
  const settings = validateBusterPreparationSettings(envelope.operation.values.settings);
  const admissionId = envelope.operation.values.admissionId;
  const preparationUid = envelope.operation.values.preparationUid;
  assertPreparationSlot(preparationUid);
  if (process.getuid?.() !== preparationUid || process.getgid?.() !== preparationUid) throw new Error('BUSTER_PREPARATION_SLOT_INVALID');
  if (typeof admissionId !== 'string' || Object.keys(envelope.operation.values).sort().join(',') !== 'admissionId,phase,preparationUid,settings'
    || envelope.operation.contractId !== 'kubeclaw.buster-preparation@1') throw new Error('BUSTER_PREPARATION_OPERATION_INVALID');
  const phase = envelope.operation.values.phase as { kind?: unknown; input?: unknown };
  if (!phase || !['stage', 'extract'].includes(String(phase.kind))
    || Object.keys(phase).sort().join(',') !== (phase.kind === 'stage' ? 'kind' : 'input,kind')) {
    throw new Error('BUSTER_PREPARATION_PHASE_INVALID');
  }
  const sourceRoot = environment('BUSTER_PREPARATION_ASSIGNED_SOURCE_ROOT');
  preparationSourceDirectory(sourceRoot, admissionId);
  return { envelope, settings, admissionId, phase, sourceRoot };
}

function measureResources(scope: string) {
  const resources = observeNativeWorkerResources(scope);
  return {
    cpuTimeMs: { status: 'observed' as const, value: Math.ceil(resources.cpuTimeMicroseconds / 1000) },
    maximumMemoryBytes: { status: 'observed' as const, value: resources.maximumMemoryBytes },
    maximumTasks: { status: 'observed' as const, value: resources.maximumTasks },
  };
}

async function main(): Promise<void> {
  const scope = environment('KUBECLAW_NATIVE_SCOPE');
  const { envelope, settings, admissionId, phase, sourceRoot } = await assignedPhase();
  const channel = new NativeWorkerControlChannel(new Socket({ fd: 3, readable: true, writable: true, allowHalfOpen: true }), preparationHostChannelLimits(settings));
  const input = new PreparationHostInput(channel, admissionId);
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort(new Error('BUSTER_PREPARATION_CANCELLED'));
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let allocated = false;
  let materialized = false;
  const operation: WorkerAttemptOperation<WorkerAttemptEnvelopeV3> = {
    prepare() { return undefined; },
    async execute(context) {
      const signal = AbortSignal.any([context.signal, cancellation.signal]);
      const { job, wire } = await readPreparationInput(input.chunks(), settings, {
        trustedSourceAuthority: environment('BUSTER_PREPARATION_ASSIGNED_SOURCE_AUTHORITY'),
        sourceAttestationPublicKey: environment('BUSTER_PREPARATION_ASSIGNED_SOURCE_PUBLIC_KEY'),
      }, signal);
      let values: unknown;
      let schemaId: string;
      if (phase.kind === 'stage') {
        const staged = stagedInputMetadata(job, wire, admissionId, envelope.attemptSpecDigest, settings);
        const accepted = await input.admission(staged);
        values = accepted ? await stagePreparationInput(staged, wire, sourceRoot, signal, () => { allocated = true; }) : { declined: true };
        schemaId = accepted ? 'buster-staged-input-result.v1' : 'buster-declined-input-result.v1';
      } else {
        const retained = phase.input as BusterInputReference;
        assertBusterInput(retained, preparedPlanHeader(job));
        if (wire.byteLength !== retained.wireBytes || wireDigest(wire) !== retained.wireDigest
          || preparationDigest(preparedPlanHeader(job)) !== retained.headerDigest) {
          throw new Error('BUSTER_PREPARATION_RETAINED_INPUT_MISMATCH');
        }
        values = await materializePreparedSource(job, { admissionId, attemptSpecDigest: envelope.attemptSpecDigest,
          root: sourceRoot, tarExecutable: environment('BUSTER_PREPARATION_ASSIGNED_TAR'), settings, signal,
          onAllocated: () => { allocated = true; } });
        schemaId = 'buster-preparation-result.v1';
      }
      materialized = true;
      return { summary: 'Owned source phase completed', evidence: [], exitCode: 0, signal: null,
        specialistResult: { schemaId, schemaDigest: sha256Digest({ schemaVersion: schemaId }),
          values: JSON.parse(JSON.stringify(values)) } };
    },
    async terminate() { cancel(); channel.destroy(); },
    async cleanup() {
      if (allocated && !materialized) throw new Error('BUSTER_PREPARATION_SOURCE_RECONCILIATION_REQUIRED');
    },
    // Retained successful source is an intended output; partial source needs separate quiescent reconciliation.
    async measure() { return measureResources(scope); },
  };
  try {
    const result = await new WorkerAttemptExecutor({ envelope, operation, signal: cancellation.signal,
      retainLogs: false, receiptNamespace: 'buster-preparation-provisional' }).execute();
    process.stdout.write(JSON.stringify(result));
  } finally {
    channel.destroy();
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

await main();
