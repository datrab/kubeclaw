import fs from 'node:fs/promises';
import path from 'node:path';
import { FileDurableBlobStore, FileDurableRecordStore, type DurableRecord } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { ensureDirectoryDurable, withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { canonicalJson, sha256Digest, type NativeAttemptJournal } from '@kubeclaw/worker-core';
import { checkWorkerNativeResultBinding, validateWorkerResourceContractV3, type WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { fixtureKey, sameFixtureValue, validateFixtureAdmission, validateFixtureReadiness, validateFixtureState,
  type BusterFixtureAdmission, type BusterFixtureReadiness, type BusterFixtureState, type FixtureBlob } from './native-fixture-state.ts';

export interface BusterFixtureJournalLimits {
  readonly maximumRecords: number;
  readonly maximumStateBytes: number;
  readonly maximumBlobBytes: number;
  readonly maximumTotalBytes: number;
}

const stream = 'buster-fixtures.v1';

/** Durable Buster phases only. Readiness does not grant ownership or prove kernel quiescence. */
export class FileBusterFixtureJournal {
  readonly #root: string;
  readonly #limits: BusterFixtureJournalLimits;
  readonly #records: FileDurableRecordStore;
  readonly #blobs: FileDurableBlobStore;

  constructor(root: string, limits: BusterFixtureJournalLimits) {
    if (!path.isAbsolute(root) || Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1)) {
      throw new Error('BUSTER_FIXTURE_JOURNAL_CONFIG_INVALID');
    }
    this.#root = path.resolve(root); this.#limits = { ...limits };
    this.#records = new FileDurableRecordStore(path.join(this.#root, 'metadata'), {
      maximumRecords: limits.maximumRecords, maximumBytes: limits.maximumStateBytes, maximumRecordBytes: 4096,
    });
    this.#blobs = new FileDurableBlobStore(path.join(this.#root, 'data'), limits.maximumBlobBytes, limits.maximumTotalBytes);
  }

  async reserve(input: BusterFixtureAdmission): Promise<BusterFixtureState> {
    const admission = structuredClone(input); validateFixtureAdmission(admission);
    const bytes = Buffer.from(canonicalJson(admission));
    if (bytes.byteLength > this.#limits.maximumBlobBytes) throw new Error('BUSTER_FIXTURE_ADMISSION_SIZE_LIMIT');
    return this.#locked(async () => {
      const records = await this.#all(); const key = fixtureKey(admission);
      const existing = records.find(record => record.idempotencyKey === key);
      if (existing) { await this.#bound(existing, admission); return existing.payload; }
      if (records.length >= this.#limits.maximumRecords) throw new Error('BUSTER_FIXTURE_JOURNAL_RECORD_LIMIT');
      const reservedBytes = bytes.byteLength + 2 * this.#limits.maximumBlobBytes;
      const pending = records.filter(record => !record.payload.terminal).reduce((sum, record) => sum + record.payload.reservedBytes, 0);
      const requested = await retainedBytes(this.#root) + pending + reservedBytes + 2 * this.#limits.maximumStateBytes;
      if (!Number.isSafeInteger(requested) || requested > this.#limits.maximumTotalBytes) throw new Error('BUSTER_FIXTURE_JOURNAL_CAPACITY_EXCEEDED');
      const state: BusterFixtureState = { schemaVersion: 'buster-fixture-state.v1', admission: await this.#blobs.put(bytes),
        acceptedAt: new Date().toISOString(), readiness: null, teardown: null, terminal: null, reservedBytes };
      validateFixtureState(state);
      return (await this.#records.append(stream, key, state, `buster-fixture:${key.slice(7)}`)).record.payload;
    });
  }

  async ready(input: BusterFixtureAdmission, readinessValue: BusterFixtureReadiness): Promise<BusterFixtureState> {
    const admission = structuredClone(input); const readiness = structuredClone(readinessValue);
    validateFixtureAdmission(admission); validateFixtureReadiness(readiness, admission);
    return this.#locked(async () => {
      const current = await this.#required(admission);
      if (current.payload.readiness) {
        if (!sameFixtureValue(await this.#json(current.payload.readiness), readiness)) throw new Error('BUSTER_FIXTURE_READINESS_IMMUTABLE');
        return current.payload;
      }
      if (current.payload.teardown || current.payload.terminal) throw new Error('BUSTER_FIXTURE_READINESS_FENCED');
      if (Date.parse(readiness.readyAt) < Date.parse(current.payload.acceptedAt)) throw new Error('BUSTER_FIXTURE_READINESS_BEFORE_ADMISSION');
      return this.#transition(current, { ...current.payload, readiness: await this.#blobs.put(Buffer.from(canonicalJson(readiness))) });
    });
  }

  async requestTeardown(input: BusterFixtureAdmission, reason: NonNullable<BusterFixtureState['teardown']>['reason']): Promise<BusterFixtureState> {
    const admission = structuredClone(input); validateFixtureAdmission(admission);
    return this.#locked(async () => {
      const current = await this.#required(admission);
      // The first durable intent remains authoritative across cancellation/recovery retries.
      if (current.payload.teardown || current.payload.terminal) return current.payload;
      return this.#transition(current, { ...current.payload, teardown: { requestedAt: new Date().toISOString(), reason } });
    });
  }

  /** Only the original sealed Core journal can supply the final lifetime receipt. */
  async seal(input: BusterFixtureAdmission, journal: NativeAttemptJournal): Promise<BusterFixtureState> {
    const admission = structuredClone(input); validateFixtureAdmission(admission);
    const result = await journal.readResult(admission.envelope);
    if (!result || !checkWorkerNativeResultBinding(admission.envelope, result).ok) throw new Error('BUSTER_FIXTURE_TERMINAL_RECEIPT_REQUIRED');
    return this.#locked(async () => {
      const current = await this.#required(admission);
      if (current.payload.terminal) {
        if (!sameFixtureValue(await this.#json(current.payload.terminal), result)) throw new Error('BUSTER_FIXTURE_TERMINAL_IMMUTABLE');
        return current.payload;
      }
      terminalBinding(current.payload, result);
      return this.#transition(current, { ...current.payload, terminal: await this.#blobs.put(Buffer.from(canonicalJson(result))) });
    });
  }

  async snapshot(): Promise<readonly { admission: BusterFixtureAdmission; state: BusterFixtureState;
    readiness: BusterFixtureReadiness | null; terminal: WorkerAttemptResultV3 | null }[]> {
    return this.#locked(async () => {
      const output = [];
      for (const record of await this.#all()) {
        const admission = await this.#json(record.payload.admission); validateFixtureAdmission(admission); await this.#bound(record, admission);
        const readiness = record.payload.readiness ? await this.#json(record.payload.readiness) : null;
        if (readiness !== null) validateFixtureReadiness(readiness, admission);
        const terminal = record.payload.terminal ? await this.#json(record.payload.terminal) : null;
        if (terminal !== null) {
          validateWorkerResourceContractV3('workerAttemptResult', terminal);
          if (!checkWorkerNativeResultBinding(admission.envelope, terminal as WorkerAttemptResultV3).ok) throw new Error('BUSTER_FIXTURE_TERMINAL_BINDING_INVALID');
          terminalBinding(record.payload, terminal as WorkerAttemptResultV3);
        }
        output.push({ admission, state: record.payload, readiness: readiness as BusterFixtureReadiness | null,
          terminal: terminal as WorkerAttemptResultV3 | null });
      }
      return output;
    });
  }

  async #locked<T>(operation: () => Promise<T>): Promise<T> {
    await ensureDirectoryDurable(path.dirname(this.#root));
    try { await fs.mkdir(this.#root, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(this.#root);
    if (!stat.isDirectory() || stat.uid !== process.getuid!() || (stat.mode & 0o077)) throw new Error('BUSTER_FIXTURE_JOURNAL_NOT_PRIVATE');
    return withDurableStoreLock(path.join(this.#root, 'phases', 'lifetime'), operation);
  }

  async #all(): Promise<readonly DurableRecord<BusterFixtureState>[]> {
    const records = await this.#records.read<BusterFixtureState>(stream);
    for (const record of records) validateFixtureState(record.payload);
    return records;
  }

  async #bound(record: DurableRecord<BusterFixtureState>, admission: BusterFixtureAdmission): Promise<void> {
    if (record.idempotencyKey !== fixtureKey(admission) || record.payload.admission.digest !== sha256Digest(admission)) {
      throw new Error('BUSTER_FIXTURE_IDENTITY_CONFLICT');
    }
    if (!sameFixtureValue(await this.#json(record.payload.admission), admission)) throw new Error('BUSTER_FIXTURE_IDENTITY_CONFLICT');
  }

  async #required(admission: BusterFixtureAdmission): Promise<DurableRecord<BusterFixtureState>> {
    const record = (await this.#all()).find(record => record.idempotencyKey === fixtureKey(admission));
    if (!record) throw new Error('BUSTER_FIXTURE_ADMISSION_REQUIRED');
    await this.#bound(record, admission); return record;
  }

  async #transition(current: DurableRecord<BusterFixtureState>, state: BusterFixtureState): Promise<BusterFixtureState> {
    validateFixtureState(state);
    return (await this.#records.transition(stream, current.idempotencyKey, current.payloadDigest, state)).payload;
  }

  async #json(reference: FixtureBlob): Promise<unknown> {
    const bytes = await this.#blobs.get(reference.digest);
    if (bytes.byteLength !== reference.sizeBytes) throw new Error('BUSTER_FIXTURE_BLOB_SIZE_CHANGED');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
}

function terminalBinding(state: BusterFixtureState, result: WorkerAttemptResultV3): void {
  if (state.readiness && result.cleanup.state === 'not_required') throw new Error('BUSTER_FIXTURE_LAUNCH_STATE_CONFLICT');
  if (result.state === 'completed' && (!state.readiness || !state.teardown || result.cleanup.state !== 'completed'
    || result.specialistResult?.values.fixtureReadinessDigest !== state.readiness.digest)) {
    throw new Error('BUSTER_FIXTURE_LIFETIME_NOT_COMPLETED');
  }
}

async function retainedBytes(root: string): Promise<number> {
  let total = 0; const pending = [root];
  while (pending.length) {
    for (const entry of await fs.readdir(pending.pop()!, { withFileTypes: true })) {
      const file = path.join(entry.parentPath, entry.name);
      if (entry.isDirectory()) { pending.push(file); continue; }
      if (!entry.isFile()) throw new Error('BUSTER_FIXTURE_JOURNAL_PATH_INVALID');
      total += (await fs.lstat(file)).size;
      if (!Number.isSafeInteger(total)) throw new Error('BUSTER_FIXTURE_JOURNAL_CAPACITY_EXCEEDED');
    }
  }
  return total;
}
