import { Socket } from 'node:net';
import { NativeWorkerControlChannel, WorkerAttemptExecutor, observeNativeWorkerResources, sha256Digest,
  type WorkerAttemptOperation } from '@kubeclaw/worker-core';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateBusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { assertPreparationSlot } from './preparation-slots.ts';
import { assertHistoricalImportDescriptor, historicalInputDirectory } from './preparation-historical-reference.ts';
import type { HistoricalImportDescriptor } from './preparation-historical-reference.ts';
import { HistoricalHostChannel, historicalChannelLimits } from './preparation-historical-channel.ts';
import { materializeHistoricalImport } from './preparation-historical-materialize.ts';

function assigned(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`BUSTER_HISTORICAL_ASSIGNED_ENV_REQUIRED:${name}`);
  return value;
}

async function envelopeInput(): Promise<WorkerAttemptEnvelopeV3> {
  const maximum = Number(assigned('BUSTER_PREPARATION_ASSIGNED_INPUT_BYTES'));
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 2_147_483_647) throw new Error('BUSTER_HISTORICAL_ENVELOPE_LIMIT');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maximum) throw new Error('BUSTER_HISTORICAL_ENVELOPE_LIMIT');
    chunks.push(Buffer.from(chunk));
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  validateWorkerResourceContractV3('workerAttemptEnvelope', value);
  return value as WorkerAttemptEnvelopeV3;
}

function resourceMeasurement(scope: string) {
  const resources = observeNativeWorkerResources(scope);
  return { cpuTimeMs: { status: 'observed' as const, value: Math.ceil(resources.cpuTimeMicroseconds / 1000) },
    maximumMemoryBytes: { status: 'observed' as const, value: resources.maximumMemoryBytes },
    maximumTasks: { status: 'observed' as const, value: resources.maximumTasks } };
}

function openChannel(descriptor: HistoricalImportDescriptor, settings: BusterPreparationSettings): NativeWorkerControlChannel {
  return new NativeWorkerControlChannel(new Socket({ fd: 3, readable: true, writable: true, allowHalfOpen: true }),
    historicalChannelLimits(descriptor, settings));
}

async function main(): Promise<void> {
  const uid = process.getuid?.();
  assertPreparationSlot(uid);
  if (process.getgid?.() !== uid) throw new Error('BUSTER_HISTORICAL_OWNED_HOST_REQUIRED');
  const envelope = await envelopeInput();
  const values = envelope.operation.values;
  const phase = values.phase as { kind?: unknown; descriptor?: unknown };
  if (envelope.operation.contractId !== 'kubeclaw.buster-preparation@1'
    || Object.keys(values).sort().join(',') !== 'admissionId,phase,preparationUid,settings'
    || values.preparationUid !== uid || typeof values.admissionId !== 'string'
    || !phase || Object.keys(phase).sort().join(',') !== 'descriptor,kind' || phase.kind !== 'historical') {
    throw new Error('BUSTER_HISTORICAL_ENVELOPE_INVALID');
  }
  assertHistoricalImportDescriptor(phase.descriptor);
  const descriptor = phase.descriptor;
  const settings = validateBusterPreparationSettings(values.settings);
  const sourceRoot = assigned('BUSTER_PREPARATION_ASSIGNED_SOURCE_ROOT');
  historicalInputDirectory(sourceRoot, { importId: values.admissionId, sequence: 1 });
  const scope = assigned('KUBECLAW_NATIVE_SCOPE');
  const channel = openChannel(descriptor, settings);
  const input = new HistoricalHostChannel(channel, values.admissionId);
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort(new Error('BUSTER_HISTORICAL_CANCELLED'));
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let materialized = false;
  const operation: WorkerAttemptOperation<WorkerAttemptEnvelopeV3> = {
    prepare() { return undefined; },
    async execute(context) {
      const signal = AbortSignal.any([context.signal, cancellation.signal]);
      const bytes = await input.readSnapshot(descriptor);
      signal.throwIfAborted();
      const summary = await materializeHistoricalImport(bytes, {
        importId: values.admissionId as string, preparationUid: uid, attemptSpecDigest: envelope.attemptSpecDigest,
        descriptor, settings, trustedSourceAuthority: assigned('BUSTER_PREPARATION_ASSIGNED_SOURCE_AUTHORITY'),
        sourceAttestationPublicKey: assigned('BUSTER_PREPARATION_ASSIGNED_SOURCE_PUBLIC_KEY'),
      }, sourceRoot, required => input.reserve(required), signal);
      materialized = true;
      await input.complete();
      return { summary: 'Historical jobs staged in one owned phase', evidence: [], exitCode: 0, signal: null,
        specialistResult: { schemaId: 'buster-historical-import-result.v1',
          schemaDigest: sha256Digest({ schemaVersion: 'buster-historical-import-result.v1' }),
          values: JSON.parse(JSON.stringify(summary)) } };
    },
    async terminate() { cancel(); channel.destroy(); },
    async cleanup() {
      if (!materialized) throw new Error('BUSTER_HISTORICAL_RECONCILIATION_REQUIRED');
    },
    async measure() { return resourceMeasurement(scope); },
  };
  try {
    const result = await new WorkerAttemptExecutor({ envelope, operation, signal: cancellation.signal,
      retainLogs: false, receiptNamespace: 'buster-historical-import' }).execute();
    process.stdout.write(JSON.stringify(result));
  } finally {
    channel.destroy();
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

await main();
