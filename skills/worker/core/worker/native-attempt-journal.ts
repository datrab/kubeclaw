import fs from 'node:fs/promises';
import path from 'node:path';
import { FileDurableRecordStore, FileDurableBlobStore, type DurableRecord } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { ensureDirectoryDurable, withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { canonicalJson, sha256Digest, checkWorkerNativeResultBinding, validateWorkerResourceContractV3,
  type WorkerAttemptEnvelopeV3, type WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { readNativeWorkerOutput } from './native-output-spool.ts';
import type { NativeWorkerProcessResult } from './native-worker-process.ts';
import { journalIdentity, journalKey, validateJournalState, usedJournalBytes,
  type NativeAttemptJournalLimits, type NativeAttemptJournalState } from './native-journal-state.ts';

export type { NativeAttemptJournalLimits } from './native-journal-state.ts';
const stream = 'native-worker-attempts.v1';
export class NativeWorkerAttemptBusy extends Error {
  constructor() { super('WORKER_NATIVE_ATTEMPT_BUSY'); }
}

/** Accepted identity, original output and sealed result outlive the serving process. */
export class NativeAttemptJournal {
  readonly #root: string;
  readonly #limits: NativeAttemptJournalLimits;
  readonly #records: FileDurableRecordStore;
  readonly #blobs: FileDurableBlobStore;

  constructor(root: string, limits: NativeAttemptJournalLimits) {
    if (!path.isAbsolute(root) || Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1)) {
      throw new Error('WORKER_NATIVE_JOURNAL_CONFIG_INVALID');
    }
    this.#root = path.resolve(root); this.#limits = { ...limits };
    this.#records = new FileDurableRecordStore(path.join(this.#root, 'metadata'), {
      maximumRecords: limits.maximumRecords, maximumBytes: limits.maximumStateBytes, maximumRecordBytes: 65536,
    });
    this.#blobs = new FileDurableBlobStore(path.join(this.#root, 'data'), Math.max(limits.maximumInputBytes, limits.maximumResultBytes), limits.maximumTotalBytes);
  }

  async withAttempt<T>(input: WorkerAttemptEnvelopeV3,
    operation: (context: { envelope: WorkerAttemptEnvelopeV3; newlyAccepted: boolean; acceptedAt: string; outputRoot: string }) => Promise<T>): Promise<T> {
    const envelope = structuredClone(input);
    validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
    const bytes = Buffer.from(canonicalJson(envelope));
    if (bytes.byteLength > this.#limits.maximumInputBytes) throw new Error('WORKER_NATIVE_JOURNAL_INPUT_LIMIT');
    await this.#initialize();
    const key = journalKey(envelope);
    // 256 fixed lock stripes bound rejected-request lock metadata. Equal claims
    // serialize across real processes; unrelated stripes can execute together.
    let entered = false;
    try {
      return await withDurableStoreLock(path.join(this.#root, 'fences', key.slice(-2), 'lifetime'), async () => {
        entered = true;
        const reserved = await this.#reserve(envelope, bytes);
        return operation({ envelope, newlyAccepted: reserved.newlyAccepted, acceptedAt: reserved.record.payload.acceptedAt,
          outputRoot: this.outputRoot(envelope) });
      });
    } catch (error) {
      if (!entered && error instanceof Error && error.message.startsWith('OBSERVABILITY_STORE_LOCK_FAILED:')
        && error.message.endsWith(':OBSERVABILITY_STORE_LOCKED:1:')) throw new NativeWorkerAttemptBusy();
      throw error;
    }
  }

  outputRoot(envelope: WorkerAttemptEnvelopeV3): string { return path.join(this.#root, 'outputs', journalKey(envelope).slice(7)); }

  async *acceptedEnvelopes(): AsyncGenerator<WorkerAttemptEnvelopeV3> {
    await this.#initialize();
    for (const record of await this.#all()) {
      const bytes = await this.#blobs.get(record.payload.envelope.digest);
      if (bytes.byteLength !== record.payload.envelope.sizeBytes) throw new Error('WORKER_NATIVE_JOURNAL_ENVELOPE_SIZE_CHANGED');
      const envelope = JSON.parse(bytes.toString('utf8')) as WorkerAttemptEnvelopeV3;
      validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
      if (journalKey(envelope) !== record.idempotencyKey || sha256Digest(envelope) !== record.payload.envelopeDigest
        || canonicalJson(journalIdentity(envelope)) !== canonicalJson(record.payload.identity)) throw new Error('WORKER_NATIVE_JOURNAL_IDENTITY_CONFLICT');
      yield envelope;
    }
  }

  async hasAttempt(envelope: WorkerAttemptEnvelopeV3): Promise<boolean> { return (await this.#lookup(envelope)) !== undefined; }

  async readResult(envelope: WorkerAttemptEnvelopeV3): Promise<WorkerAttemptResultV3 | null> {
    const record = await this.#lookup(envelope);
    if (!record?.payload.result) return null;
    const bytes = await this.#blobs.get(record.payload.result.digest);
    if (bytes.byteLength !== record.payload.result.sizeBytes) throw new Error('WORKER_NATIVE_JOURNAL_RESULT_SIZE_CHANGED');
    const result = JSON.parse(bytes.toString('utf8')) as WorkerAttemptResultV3;
    if (!checkWorkerNativeResultBinding(envelope, result).ok) throw new Error('WORKER_NATIVE_JOURNAL_RESULT_BINDING_INVALID');
    return result;
  }

  async readProcess(envelope: WorkerAttemptEnvelopeV3): Promise<{ process: NativeWorkerProcessResult; completedAt: string } | null> {
    const record = await this.#lookup(envelope);
    const process = record?.payload.process;
    if (!process) return null;
    const output = await readNativeWorkerOutput(this.outputRoot(envelope), this.#limits.maximumOutputBytes);
    for (const channel of ['stdout', 'stderr'] as const) {
      if (output[channel].digest !== process[channel].digest || output[channel].sizeBytes !== process[channel].sizeBytes) {
        throw new Error('WORKER_NATIVE_JOURNAL_OUTPUT_CHANGED');
      }
    }
    return { process: { ...process, stdout: output.stdout.bytes, stderr: output.stderr.bytes }, completedAt: record!.payload.processCompletedAt! };
  }

  async recordProcess(envelope: WorkerAttemptEnvelopeV3, input: NativeWorkerProcessResult, completedAt: Date): Promise<void> {
    const process = structuredClone(input);
    const timestamp = completedAt.toISOString();
    const record = await this.#required(envelope);
    if (record.payload.result || record.payload.process) throw new Error('WORKER_NATIVE_JOURNAL_PROCESS_ALREADY_RECORDED');
    const output = await readNativeWorkerOutput(this.outputRoot(envelope), this.#limits.maximumOutputBytes);
    if (!output.stdout.bytes.equals(Buffer.from(process.stdout)) || !output.stderr.bytes.equals(Buffer.from(process.stderr))) {
      throw new Error('WORKER_NATIVE_JOURNAL_OUTPUT_INCOMPLETE');
    }
    const reference = (channel: 'stdout' | 'stderr') => ({ digest: output[channel].digest, sizeBytes: output[channel].sizeBytes });
    const payload = { ...record.payload, processCompletedAt: timestamp, process: { ...process, stdout: reference('stdout'), stderr: reference('stderr') } };
    validateJournalState(payload);
    await this.#records.transition(stream, record.idempotencyKey, record.payloadDigest, payload);
  }

  async seal(envelope: WorkerAttemptEnvelopeV3, input: WorkerAttemptResultV3): Promise<WorkerAttemptResultV3> {
    const result = structuredClone(input);
    if (!checkWorkerNativeResultBinding(envelope, result).ok) throw new Error('WORKER_NATIVE_JOURNAL_RESULT_BINDING_INVALID');
    const bytes = Buffer.from(canonicalJson(result));
    if (bytes.byteLength > this.#limits.maximumResultBytes) throw new Error('WORKER_NATIVE_JOURNAL_RESULT_LIMIT');
    return withDurableStoreLock(path.join(this.#root, 'admission', 'lifetime'), async () => {
      const record = await this.#required(envelope);
      if (record.payload.result) {
        if (record.payload.result.digest !== sha256Digest(result)) throw new Error('WORKER_NATIVE_JOURNAL_RESULT_ALREADY_SEALED');
        return result;
      }
      const reference = await this.#blobs.put(bytes);
      await this.#records.transition(stream, record.idempotencyKey, record.payloadDigest, { ...record.payload, result: reference });
      return result;
    });
  }

  async #initialize(): Promise<void> {
    await ensureDirectoryDurable(path.dirname(this.#root));
    try { await fs.mkdir(this.#root, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(this.#root);
    if (!stat.isDirectory() || stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0) throw new Error('WORKER_NATIVE_JOURNAL_NOT_PRIVATE');
  }

  async #all(): Promise<readonly DurableRecord<NativeAttemptJournalState>[]> {
    const records = await this.#records.read<NativeAttemptJournalState>(stream);
    for (const record of records) validateJournalState(record.payload);
    return records;
  }

  async #lookup(envelope: WorkerAttemptEnvelopeV3): Promise<DurableRecord<NativeAttemptJournalState> | undefined> {
    await this.#initialize();
    const record = (await this.#all()).find(record => record.idempotencyKey === journalKey(envelope));
    if (record && (record.payload.envelopeDigest !== sha256Digest(envelope)
      || canonicalJson(record.payload.identity) !== canonicalJson(journalIdentity(envelope)))) throw new Error('WORKER_NATIVE_JOURNAL_IDENTITY_CONFLICT');
    return record;
  }

  async #required(envelope: WorkerAttemptEnvelopeV3): Promise<DurableRecord<NativeAttemptJournalState>> {
    const record = await this.#lookup(envelope);
    if (!record) throw new Error('WORKER_NATIVE_JOURNAL_RESERVATION_REQUIRED');
    return record;
  }

  async #reserve(envelope: WorkerAttemptEnvelopeV3, bytes: Buffer) {
    return withDurableStoreLock(path.join(this.#root, 'admission', 'lifetime'), async () => {
      const existing = await this.#lookup(envelope);
      if (existing) return { newlyAccepted: false, record: existing };
      const reservationBytes = bytes.byteLength + this.#limits.maximumOutputBytes + this.#limits.maximumResultBytes + 65536;
      const records = await this.#all();
      const pending = records.filter(record => record.payload.result === null).reduce((sum, record) => sum + record.payload.reservationBytes, 0);
      const requested = await usedJournalBytes(this.#root) + pending + reservationBytes + 2 * this.#limits.maximumStateBytes;
      if (!Number.isSafeInteger(requested) || requested > this.#limits.maximumTotalBytes) throw new Error('WORKER_NATIVE_JOURNAL_CAPACITY_EXCEEDED');
      const payload: NativeAttemptJournalState = { schemaVersion: 'native-attempt-journal.v1', identity: journalIdentity(envelope),
        envelopeDigest: sha256Digest(envelope), envelope: { digest: sha256Digest(envelope), sizeBytes: bytes.byteLength },
        acceptedAt: new Date().toISOString(), reservationBytes, process: null, processCompletedAt: null, result: null };
      // The global admission lock holds the checked disk reservation while the
      // input is fsynced. A crash can leave an unreferenced original blob, which
      // remains counted, but never an accepted identity with no recoverable input.
      await this.#blobs.put(bytes);
      const appended = await this.#records.append(stream, journalKey(envelope), payload, `native-worker:${sha256Digest(envelope.claim.workerId).slice(7)}`);
      return { newlyAccepted: true, record: appended.record };
    });
  }
}
