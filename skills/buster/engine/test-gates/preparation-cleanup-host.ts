import fs from 'node:fs/promises';
import path from 'node:path';
import { WorkerAttemptExecutor, observeNativeWorkerResources, nativeSourceCleanupResultSchema,
  sha256Digest, type WorkerAttemptOperation } from '@kubeclaw/worker-core';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateBusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { assertPreparationCleanupEffects, type PreparationCleanupEffects } from './preparation-cleanup-binding.ts';
import { preparationSourceDirectory } from './preparation-source.ts';

function assigned(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`BUSTER_PREPARATION_ASSIGNED_ENV_REQUIRED:${name}`);
  return value;
}

async function readEnvelope(maximumBytes: number): Promise<WorkerAttemptEnvelopeV3> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.byteLength;
    if (bytes > maximumBytes) throw new Error('BUSTER_PREPARATION_ENVELOPE_LIMIT');
    chunks.push(Buffer.from(chunk));
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  validateWorkerResourceContractV3('workerAttemptEnvelope', value);
  return value as WorkerAttemptEnvelopeV3;
}

async function removeOwnedData(root: string, effects: PreparationCleanupEffects, signal: AbortSignal): Promise<void> {
  const directory = preparationSourceDirectory(root, effects.admissionId);
  const gate = path.dirname(directory);
  const stat = await fs.lstat(gate);
  if (!stat.isDirectory() || stat.uid !== 0 || stat.gid !== effects.gate.preparationUid
    || (stat.mode & 0o7777) !== 0o1770 || stat.dev !== effects.gate.device || stat.ino !== effects.gate.inode) {
    throw new Error('BUSTER_PREPARATION_CLEANUP_GATE_CHANGED');
  }
  let data;
  try { data = await fs.lstat(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (data) {
    if (!effects.data || !data.isDirectory() || data.dev !== effects.data.device
      || data.ino !== effects.data.inode || data.uid !== effects.data.uid) {
      throw new Error('BUSTER_PREPARATION_CLEANUP_SOURCE_CHANGED');
    }
    signal.throwIfAborted();
    await fs.rm(directory, { recursive: true });
  }
  // Absence is valid only under the durable association for this exact gate/effect.
  // The parent independently verifies the sealed result before removing its marker.
  const handle = await fs.open(gate, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
  signal.throwIfAborted();
}

async function main(): Promise<void> {
  const maximumBytes = Number(assigned('BUSTER_PREPARATION_ASSIGNED_INPUT_BYTES'));
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('BUSTER_PREPARATION_ENVELOPE_LIMIT');
  const encoded = assigned('BUSTER_PREPARATION_ASSIGNED_CLEANUP');
  if (Buffer.byteLength(encoded) > maximumBytes) throw new Error('BUSTER_PREPARATION_ENVELOPE_LIMIT');
  const association = JSON.parse(encoded) as { effects: PreparationCleanupEffects; settings: unknown };
  if (Object.keys(association).sort().join(',') !== 'effects,settings') throw new Error('BUSTER_PREPARATION_CLEANUP_ASSOCIATION_INVALID');
  assertPreparationCleanupEffects(association.effects);
  validateBusterPreparationSettings(association.settings);
  const effects = association.effects;
  if (process.getuid?.() !== effects.gate.preparationUid || process.getgid?.() !== effects.gate.preparationUid) {
    throw new Error('BUSTER_PREPARATION_SLOT_INVALID');
  }
  const envelope = await readEnvelope(maximumBytes);
  if (envelope.operation.contractId !== 'kubeclaw.native-source-cleanup@1'
    || envelope.operation.values.effectsDigest !== sha256Digest(effects)) throw new Error('BUSTER_PREPARATION_CLEANUP_ASSOCIATION_INVALID');
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort(new Error('BUSTER_PREPARATION_CANCELLED'));
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let finished = false;
  const operation: WorkerAttemptOperation<WorkerAttemptEnvelopeV3> = {
    prepare() { return undefined; },
    async execute(context) {
      await removeOwnedData(assigned('BUSTER_PREPARATION_ASSIGNED_SOURCE_ROOT'), effects,
        AbortSignal.any([context.signal, cancellation.signal]));
      finished = true;
      return { summary: 'Owned unpublished source cleanup completed', evidence: [], exitCode: 0, signal: null,
        specialistResult: { ...nativeSourceCleanupResultSchema,
          values: { reconciliationDigest: sha256Digest(envelope.operation.values) } } };
    },
    async terminate() { cancel(); },
    async cleanup() { if (!finished) throw new Error('BUSTER_PREPARATION_SOURCE_RECONCILIATION_REQUIRED'); },
    async measure() {
      const resources = observeNativeWorkerResources(assigned('KUBECLAW_NATIVE_SCOPE'));
      return { cpuTimeMs: { status: 'observed', value: Math.ceil(resources.cpuTimeMicroseconds / 1000) },
        maximumMemoryBytes: { status: 'observed', value: resources.maximumMemoryBytes },
        maximumTasks: { status: 'observed', value: resources.maximumTasks } };
    },
  };
  try {
    const result = await new WorkerAttemptExecutor({ envelope, operation, signal: cancellation.signal,
      retainLogs: false, receiptNamespace: 'buster-source-cleanup-provisional' }).execute();
    process.stdout.write(JSON.stringify(result));
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

await main();
