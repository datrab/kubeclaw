import { type NativeWorkerControlChannel, sha256Digest, canonicalJson, type WorkerScopeBinding } from '@kubeclaw/worker-core';
import type { FileBusterFixtureJournal } from './native-fixture-journal.ts';
import { validateFixtureAdmission, validateFixtureReadiness,
  type BusterFixtureAdmission, type BusterFixtureReadiness, type BusterFixtureState } from './native-fixture-state.ts';

type Teardown = NonNullable<BusterFixtureState['teardown']>;
type TeardownReason = Teardown['reason'];

function decode(bytes: Uint8Array): Record<string, unknown> {
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BUSTER_FIXTURE_CONTROL_INVALID');
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error('BUSTER_FIXTURE_CONTROL_INVALID');
  }
}

function acknowledge(message: Record<string, unknown>, expectedReadiness: string): void {
  exact(message, ['schemaVersion', 'readinessDigest']);
  if (message.schemaVersion !== 'buster-fixture-ready-ack.v1' || message.readinessDigest !== expectedReadiness) {
    throw new Error('BUSTER_FIXTURE_READY_ACK_INVALID');
  }
}

/** Buster phase policy. Core still exclusively owns process termination and receipts. */
export class BusterFixtureControl {
  readonly ready: Promise<BusterFixtureReadiness>;
  readonly #admission: BusterFixtureAdmission;
  readonly #journal: FileBusterFixtureJournal;
  readonly #readyResolve: (value: BusterFixtureReadiness) => void;
  readonly #readyReject: (error: unknown) => void;
  #channel: NativeWorkerControlChannel | undefined;
  #started = false;
  #ready: BusterFixtureReadiness | undefined;
  #teardown: Teardown | undefined;
  #sendTeardown: Promise<void> | undefined;
  #finished = false;
  #teardownRequested = false;

  constructor(admission: BusterFixtureAdmission, journal: FileBusterFixtureJournal) {
    validateFixtureAdmission(admission);
    this.#admission = structuredClone(admission); this.#journal = journal;
    const deferred = Promise.withResolvers<BusterFixtureReadiness>();
    this.ready = deferred.promise; this.#readyResolve = deferred.resolve; this.#readyReject = deferred.reject;
    // Completion may fail before the scheduler starts waiting for readiness.
    void this.ready.catch(() => {});
  }

  async teardown(reason: TeardownReason): Promise<void> {
    await this.#recordTeardown(reason);
    await this.#notifyTeardown();
  }

  /** Cancellation cannot wait for the host to consume a control-channel write. */
  async cancel(): Promise<void> { await this.#recordTeardown('cancelled'); }

  async #recordTeardown(reason: TeardownReason): Promise<void> {
    this.#teardownRequested = true;
    const state = await this.#journal.requestTeardown(this.#admission, reason);
    if (state.terminal) return;
    if (!state.teardown) throw new Error('BUSTER_FIXTURE_TEARDOWN_NOT_DURABLE');
    this.#teardown = state.teardown;
  }

  /** binding comes from the admitted native owner, never from the host message. */
  async run(channel: NativeWorkerControlChannel, signal: AbortSignal, binding: WorkerScopeBinding): Promise<void> {
    if (this.#started) throw new Error('BUSTER_FIXTURE_CONTROL_ALREADY_STARTED');
    this.#started = true; this.#channel = channel;
    const expectedBinding = structuredClone(binding);
    const abort = () => channel.destroy();
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      for await (const bytes of channel.messages()) {
        if (this.#ready) throw new Error('BUSTER_FIXTURE_READINESS_REPEATED');
        const readiness = decode(bytes);
        validateFixtureReadiness(readiness, this.#admission);
        if (canonicalJson(readiness.scope) !== canonicalJson(expectedBinding)) throw new Error('BUSTER_FIXTURE_SCOPE_BINDING_MISMATCH');
        if (Date.now() >= Date.parse(this.#admission.envelope.claim.expiresAt)) throw new Error('BUSTER_FIXTURE_READINESS_CLAIM_EXPIRED');
        signal.throwIfAborted();
        await this.#journal.ready(this.#admission, readiness);
        signal.throwIfAborted();
        if (this.#teardownRequested) throw new Error('BUSTER_FIXTURE_READINESS_FENCED');
        await channel.send(Buffer.from(JSON.stringify({ schemaVersion: 'buster-fixture-ready-ack.v1',
          readinessDigest: sha256Digest(readiness) })));
        signal.throwIfAborted();
        if (this.#teardownRequested) throw new Error('BUSTER_FIXTURE_READINESS_FENCED');
        this.#ready = readiness;
        this.#readyResolve(structuredClone(readiness));
        await this.#notifyTeardown();
      }
      if (!this.#ready || !this.#sendTeardown) throw new Error('BUSTER_FIXTURE_CONTROL_CLOSED_BEFORE_TEARDOWN');
      await this.#sendTeardown;
    } catch (error) {
      // A killed host can close cleanly or reset the pipe, depending on unread
      // bytes. Both mean the fixture lifetime ended before teardown was sent.
      if ((!this.#ready || !this.#sendTeardown) && error instanceof Error
        && 'code' in error && ['ECONNRESET', 'EPIPE'].includes(String(error.code))) {
        const closed = new Error('BUSTER_FIXTURE_CONTROL_CLOSED_BEFORE_TEARDOWN', { cause: error });
        this.#readyReject(closed); throw closed;
      }
      this.#readyReject(error); throw error;
    } finally {
      this.#finished = true; signal.removeEventListener('abort', abort);
    }
  }

  failed(error: unknown): void { this.#readyReject(error); }

  #notifyTeardown(): Promise<void> {
    if (!this.#ready || !this.#teardown || !this.#channel || this.#finished) return Promise.resolve();
    this.#sendTeardown ??= this.#channel.send(Buffer.from(JSON.stringify({ schemaVersion: 'buster-fixture-teardown.v1',
      admissionDigest: sha256Digest(this.#admission), readinessDigest: sha256Digest(this.#ready), ...this.#teardown })));
    return this.#sendTeardown;
  }
}

/** Host side: publication must be durably acknowledged before awaiting teardown. */
export async function awaitBusterFixtureTeardown(channel: NativeWorkerControlChannel,
  admission: BusterFixtureAdmission, readiness: BusterFixtureReadiness, signal: AbortSignal): Promise<Teardown> {
  validateFixtureAdmission(admission); validateFixtureReadiness(readiness, admission);
  const expectedAdmission = sha256Digest(admission), expectedReadiness = sha256Digest(readiness);
  const abort = () => channel.destroy();
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    await channel.send(Buffer.from(JSON.stringify(readiness)));
    let acknowledged = false;
    for await (const bytes of channel.messages()) {
      signal.throwIfAborted();
      const message = decode(bytes);
      if (!acknowledged) {
        acknowledge(message, expectedReadiness);
        acknowledged = true; continue;
      }
      exact(message, ['schemaVersion', 'admissionDigest', 'readinessDigest', 'requestedAt', 'reason']);
      if (message.schemaVersion !== 'buster-fixture-teardown.v1' || message.admissionDigest !== expectedAdmission
        || message.readinessDigest !== expectedReadiness || typeof message.requestedAt !== 'string'
        || !Number.isFinite(Date.parse(message.requestedAt)) || new Date(message.requestedAt).toISOString() !== message.requestedAt
        || !['dependencies-finished', 'cancelled', 'recovery'].includes(String(message.reason))) {
        throw new Error('BUSTER_FIXTURE_TEARDOWN_BINDING_INVALID');
      }
      return { requestedAt: message.requestedAt, reason: message.reason as TeardownReason };
    }
    throw new Error('BUSTER_FIXTURE_CONTROL_CLOSED_BEFORE_TEARDOWN');
  } finally { signal.removeEventListener('abort', abort); }
}
