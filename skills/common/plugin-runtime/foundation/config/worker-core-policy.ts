import { parseDocument } from 'yaml';
import path from 'node:path';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

export const workerCoreInstances = ['prism-native', 'prism-agent', 'buster-provider',
  'buster-preparation', 'buster-historical-import', 'buster-source-cleanup'] as const;
export type WorkerCoreInstance = typeof workerCoreInstances[number];
export interface WorkerCoreRuntimePolicy {
  readonly drain_poll_ms: number;
  readonly input_bytes: number;
  readonly journal_diagnostic_units: number;
  readonly journal_record_bytes: number;
  readonly json_depth: number;
  readonly json_nodes: number;
  readonly journalLockHexDigits: 1 | 2;
  readonly log_parts: number;
  readonly node_identity_file_bytes: number;
  readonly ownership_diagnostic_units: number;
  readonly pool_file_bytes: number;
  readonly retain_logs: Readonly<Record<WorkerCoreInstance, boolean>>;
  readonly runtime_identity_file_bytes: number;
}
export interface WorkerCoreSettingsV3 {
  readonly localRuntime: Readonly<{drainTimeoutMs: number; cancellationTimeoutMs: number; replayLimit: number}>;
  readonly runtime: WorkerCoreRuntimePolicy;
  readonly scaffoldPublication: Readonly<{maximumMemberBytes: number; maximumPointerBytes: number}>;
}
export interface WorkerCorePolicyCapture {
  readonly schemaVersion: 'worker-core-policy-capture.v1';
  readonly settings: WorkerCoreSettingsV3;
}
const schema = JSON.parse(fs.readFileSync(new URL('./worker-core-v3.schema.json', import.meta.url), 'utf8'));
const Ajv = Ajv2020 as unknown as new (options: object) => {compile(schema: object): (value: unknown) => boolean};
const validAuthor = new Ajv({allErrors: true, strict: true}).compile(schema);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function validateWorkerCoreV3Author(value: unknown): boolean {
  if (!validAuthor(value)) return false;
  try {
    for (const profile of Object.values((value as {profiles:Record<string,{settings:WorkerCoreSettingsV3}>}).profiles)) captureWorkerCorePolicy(profile.settings);
    return true;
  } catch {return false;}
}

/** Complete versioned selection, also used for original replay. No file/ENV/current-value fallback. */
export function readWorkerCorePolicyCapture(value: unknown): WorkerCorePolicyCapture {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'schemaVersion,settings'
    || (value as WorkerCorePolicyCapture).schemaVersion !== 'worker-core-policy-capture.v1') throw new Error('WORKER_CORE_CAPTURE_INVALID');
  const settings = (value as WorkerCorePolicyCapture).settings;
  if (!validAuthor({schemaVersion: 'pipeline-component.v3', owner: 'worker-core', profiles: {
    selected: {settings, activation: {core: 'enabled', scaffoldPublication: 'enabled'}},
  }})) throw new Error('WORKER_CORE_POLICY_INVALID');
  // The approved six-instance contract keeps the four dormant Buster paths
  // explicitly false: none owns a full-log writer or additional claim slack.
  // A structural boolean is not permission to enable a nonexistent writer.
  for (const instance of workerCoreInstances.filter(instance => instance.startsWith('buster-'))) {
    if (settings.runtime.retain_logs[instance]) throw new Error(`WORKER_CORE_RETENTION_WRITER_UNAVAILABLE:${instance}`);
  }
  // Future terminal diagnostics can each use six UTF-8 bytes per UTF-16 unit.
  // This necessary bound does not invent a fixed wrapper allowance. Admission
  // checks the exact full terminal projection, including each original identity.
  if (12 * settings.runtime.journal_diagnostic_units >= settings.runtime.journal_record_bytes) throw new Error('WORKER_CORE_JOURNAL_TERMINAL_CAPACITY_INVALID');
  return freeze(structuredClone(value as WorkerCorePolicyCapture));
}
export function captureWorkerCorePolicy(settings: WorkerCoreSettingsV3): WorkerCorePolicyCapture {
  return readWorkerCorePolicyCapture({schemaVersion: 'worker-core-policy-capture.v1', settings});
}

/** Projection of trusted coordinator transport. Legacy is deliberately not filled from current configuration. */
export function workerCoreExecutionOptions(capture: WorkerCorePolicyCapture | undefined, instance: WorkerCoreInstance, legacyRetain?: boolean) {
  return capture === undefined ? (legacyRetain === undefined ? {} : {retainLogs: legacyRetain})
    : {workerCore: Object.freeze({capture: readWorkerCorePolicyCapture(capture), instance})};
}
export function assignedWorkerCorePolicy(environment: Readonly<Record<string, string | undefined>>): WorkerCorePolicyCapture | undefined {
  const raw = environment.KUBECLAW_ASSIGNED_WORKER_CORE_POLICY;
  return raw === undefined ? undefined : readWorkerCorePolicyCapture(JSON.parse(raw));
}

/** Explicit owner/profile locator for standalone authoring tools. Captures once;
 * retained publications subsequently read their own capture, not this file. */
export function loadWorkerCorePolicy(file: string, profile: string): WorkerCorePolicyCapture {
  if (!path.isAbsolute(file) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(profile)) throw new Error('WORKER_CORE_SELECTION_REQUIRED');
  const raw = fs.readFileSync(file, 'utf8');
  if (parseDocument(raw,{version:'1.2',schema:'json',strict:true,uniqueKeys:true}).errors.length) throw new Error('WORKER_CORE_DUPLICATE_AUTHOR');
  const owner = JSON.parse(raw);
  if (!validAuthor(owner) || !Object.hasOwn(owner.profiles,profile)) throw new Error('WORKER_CORE_OWNER_INVALID');
  for (const declared of Object.values(owner.profiles) as {settings:WorkerCoreSettingsV3}[]) captureWorkerCorePolicy(declared.settings);
  return captureWorkerCorePolicy(owner.profiles[profile].settings);
}
