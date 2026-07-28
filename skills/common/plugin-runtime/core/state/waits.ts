import crypto from 'node:crypto';
import type {
  ResumeSignal,
  WaitRequest,
} from '../../sdk/src/index.ts';

export interface WaitSpecification {
  readonly kind: WaitRequest['kind'];
  readonly signalType: string;
  readonly authorizedIssuer: WaitRequest['authorizedIssuer'];
  readonly expiresAt: string | null;
  readonly request?: Readonly<Record<string, unknown>>;
}

interface WaitRecord {
  readonly wait: WaitRequest;
  readonly acceptedSignals: Map<string, ResumeSignal>;
  resolved: boolean;
}

export class WaitCoordinator {
  readonly #waits = new Map<string, WaitRecord>();
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  create(specification: WaitSpecification): WaitRequest {
    const wait: WaitRequest = Object.freeze({
      schemaVersion: 'wait-request.v2',
      waitId: `wait:${crypto.randomUUID()}`,
      kind: specification.kind,
      signalType: specification.signalType,
      authorizedIssuer: specification.authorizedIssuer,
      expiresAt: specification.expiresAt,
      ...(specification.request === undefined ? {} : { request: specification.request }),
    });
    this.#waits.set(wait.waitId, { wait, acceptedSignals: new Map(), resolved: false });
    return wait;
  }

  accept(signal: ResumeSignal): WaitRequest {
    const record = this.#waits.get(signal.waitId);
    if (!record) throw new Error(`WAIT_UNKNOWN:${signal.waitId}`);
    const duplicate = record.acceptedSignals.get(signal.idempotencyKey);
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(signal)) {
        throw new Error(`WAIT_SIGNAL_CONFLICT:${signal.idempotencyKey}`);
      }
      return record.wait;
    }
    if (record.resolved) throw new Error(`WAIT_ALREADY_RESOLVED:${signal.waitId}`);
    if (record.wait.expiresAt !== null && this.#now().getTime() >= Date.parse(record.wait.expiresAt)) {
      throw new Error(`WAIT_EXPIRED:${signal.waitId}`);
    }
    if (signal.signalType !== record.wait.signalType) throw new Error(`WAIT_SIGNAL_TYPE_MISMATCH:${signal.signalType}`);
    if (
      signal.issuer.type !== record.wait.authorizedIssuer.type
      || signal.issuer.id !== record.wait.authorizedIssuer.id
    ) {
      throw new Error(`WAIT_ISSUER_DENIED:${signal.issuer.type}:${signal.issuer.id}`);
    }
    record.acceptedSignals.set(signal.idempotencyKey, Object.freeze(signal));
    record.resolved = true;
    return record.wait;
  }

  get(waitId: string): WaitRequest | undefined {
    return this.#waits.get(waitId)?.wait;
  }
}
