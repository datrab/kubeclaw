import crypto from 'node:crypto';
import type {
  AttemptIdentity,
  PluginStateEntry,
  RegistrationProvenance,
} from '../../sdk/src/index.ts';
import { validateContractValue } from '../registry/schema.ts';
import { FileJournal } from './journal.ts';

export interface PluginStateAppend {
  readonly namespace: string;
  readonly registration: RegistrationProvenance;
  readonly attempt?: AttemptIdentity | null;
  readonly entryType: string;
  readonly entrySchemaVersion?: string;
  readonly idempotencyKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function expectedNamespace(registration: RegistrationProvenance): string {
  return `plugin.${registration.package.package.pluginId}.${registration.registrationId}`;
}

export class PluginStateJournal {
  readonly #journal: FileJournal<PluginStateEntry>;
  readonly #registration: RegistrationProvenance;
  readonly #namespace: string;
  readonly #now: () => Date;

  constructor(
    file: string,
    registration: RegistrationProvenance,
    now: () => Date = () => new Date(),
  ) {
    this.#journal = new FileJournal(file);
    this.#registration = registration;
    this.#namespace = expectedNamespace(registration);
    this.#now = now;
    this.#validateRecords(this.#journal.records());
  }

  #validateRecords(
    records: ReturnType<FileJournal<PluginStateEntry>['records']>,
  ): void {
    for (const record of records) {
      validateContractValue('pluginStateEntry', record.entry);
      if (record.entry.sequence !== record.sequence) {
        throw new Error(`PLUGIN_STATE_SEQUENCE_INVALID:${record.entry.sequence}`);
      }
      if (record.entry.namespace !== expectedNamespace(record.entry.registration)) {
        throw new Error(`PLUGIN_STATE_NAMESPACE_DENIED:${record.entry.namespace}`);
      }
      if (
        record.entry.namespace !== this.#namespace
        || canonical(record.entry.registration) !== canonical(this.#registration)
      ) {
        throw new Error(`PLUGIN_STATE_REGISTRATION_DENIED:${record.entry.namespace}`);
      }
    }
  }

  append(input: PluginStateAppend): PluginStateEntry {
    const namespace = expectedNamespace(input.registration);
    if (
      input.namespace !== namespace
      || namespace !== this.#namespace
      || canonical(input.registration) !== canonical(this.#registration)
    ) {
      throw new Error(`PLUGIN_STATE_NAMESPACE_DENIED:${input.namespace}`);
    }
    return this.#journal.transact((records, append) => {
      this.#validateRecords(records);
      const duplicate = records.map(({ entry }) => entry).find(
        (entry) => entry.namespace === namespace
          && entry.idempotencyKey === input.idempotencyKey,
      );
      if (duplicate) {
      const comparable = {
        namespace: input.namespace,
        registration: input.registration,
        attempt: input.attempt ?? null,
        entryType: input.entryType,
        entrySchemaVersion: input.entrySchemaVersion,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
      };
      const existingComparable = {
        namespace: duplicate.namespace,
        registration: duplicate.registration,
        attempt: duplicate.attempt ?? null,
        entryType: duplicate.entryType,
        entrySchemaVersion: duplicate.entrySchemaVersion,
        idempotencyKey: duplicate.idempotencyKey,
        payload: duplicate.payload,
      };
        if (canonical(comparable) !== canonical(existingComparable)) {
          throw new Error(`PLUGIN_STATE_IDEMPOTENCY_CONFLICT:${input.idempotencyKey}`);
        }
        return duplicate;
      }
      const sequence = records.length + 1;
      const entry: PluginStateEntry = Object.freeze({
      schemaVersion: 'plugin-state-entry.v2',
      entryId: `state:${crypto.createHash('sha256')
        .update(`${namespace}\u0000${input.idempotencyKey}`)
        .digest('hex')}`,
      sequence,
      namespace,
      registration: input.registration,
      attempt: input.attempt ?? null,
      entryType: input.entryType,
      ...(input.entrySchemaVersion ? { entrySchemaVersion: input.entrySchemaVersion } : {}),
      idempotencyKey: input.idempotencyKey,
      occurredAt: this.#now().toISOString(),
      payload: input.payload,
      });
      validateContractValue('pluginStateEntry', entry);
      append(entry);
      return entry;
    });
  }

  entries(namespace?: string): readonly PluginStateEntry[] {
    const records = this.#journal.refresh();
    this.#validateRecords(records);
    return Object.freeze(records
      .map(({ entry }) => entry)
      .filter((entry) => namespace === undefined || entry.namespace === namespace));
  }

  project<T>(
    namespace: string,
    initial: T,
    reduce: (state: T, entry: PluginStateEntry) => T,
  ): T {
    return this.entries(namespace).reduce(reduce, initial);
  }
}
