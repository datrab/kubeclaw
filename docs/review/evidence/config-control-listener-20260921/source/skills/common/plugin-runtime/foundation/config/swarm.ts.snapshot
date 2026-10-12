import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

export interface PrismWorkerSettings {
  readonly maximumActiveRequests: number;
  readonly maximumProbeRequests: number;
  readonly maximumConnections: number;
  readonly maximumInputBytes: number;
  readonly requestTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
}
export interface PrismResourcePolicy {
  readonly cpuTimeMs: number;
  readonly memoryBytes: number;
  readonly tasks: number;
}
export interface PrismSupervisorSettings {
  readonly uid: number;
  readonly gid: number;
  readonly maximumOwnershipRecords: number;
  readonly maximumOwnershipBytes: number;
  readonly maximumOutputBytes: number;
  readonly maximumJournalBytes: number;
  readonly pollIntervalMs: number;
  readonly drainTimeoutMs: number;
  readonly closeTimeoutMs: number;
}
export interface PrismNativeSettings {
  readonly supervisor: PrismSupervisorSettings;
  readonly resourcePolicy: PrismResourcePolicy;
  readonly maximumResultBytes: number;
  readonly dispatchTimeoutMs: number;
}
export interface PrismControlSettings {
  readonly port: number;
  readonly pipelinePreferenceSubject: string | null;
  readonly artifactRoot: string;
  readonly studioPublicUrl: string;
}
interface PrismSettings {
  readonly control: PrismControlSettings;
  readonly worker: PrismWorkerSettings;
  readonly native: PrismNativeSettings;
}
interface SwarmConfig {
  readonly operator: { readonly prism: PrismSettings };
}
interface Validator { (value: unknown): boolean; errors?: unknown[] | null }
const AjvConstructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => { compile(schema: object): Validator };
const schema = JSON.parse(fs.readFileSync(new URL('./swarm.schema.json', import.meta.url), 'utf8')) as object;
const validate = new AjvConstructor({ allErrors: true, strict: true }).compile(schema);
const migratedEnvironmentKeys = [
  'PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS', 'PRISM_WORKER_MAXIMUM_PROBE_REQUESTS',
  'PRISM_WORKER_MAXIMUM_CONNECTIONS', 'PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS',
  'PRISM_WORKER_SHUTDOWN_TIMEOUT_MS', 'PRISM_NATIVE_MAXIMUM_INPUT_BYTES',
  'PRISM_NATIVE_ASSIGNED_INPUT_BYTES', 'PRISM_NATIVE_MAXIMUM_RESULT_BYTES',
  'PRISM_NATIVE_DISPATCH_TIMEOUT_MS', 'PRISM_NATIVE_CPU_TIME_MS',
  'PRISM_NATIVE_MEMORY_BYTES', 'PRISM_NATIVE_TASKS',
  'PRISM_NATIVE_UID', 'PRISM_NATIVE_GID', 'PRISM_NATIVE_MAXIMUM_OWNERSHIP_RECORDS',
  'PRISM_NATIVE_MAXIMUM_OWNERSHIP_BYTES', 'PRISM_NATIVE_MAXIMUM_OUTPUT_BYTES',
  'PRISM_NATIVE_MAXIMUM_JOURNAL_BYTES', 'PRISM_NATIVE_POLL_INTERVAL_MS',
  'PRISM_NATIVE_DRAIN_TIMEOUT_MS', 'PRISM_NATIVE_CLOSE_TIMEOUT_MS',
  'PRISM_PIPELINE_PREFERENCE_SUBJECT', 'PRISM_STUDIO_PUBLIC_URL', 'ARTIFACT_ROOT',
] as const;

/** Load the single authored snapshot. No legacy environment override or default. */
export function loadPrismSettings(environment: NodeJS.ProcessEnv): PrismSettings {
  for (const key of migratedEnvironmentKeys) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}:use operator.prism`);
  }
  const file = environment.SWARM_CONFIG ?? '/home/node/.openclaw/swarm.config.json';
  return prismSettingsFromConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** Validate the authored document before selecting its operator-owned settings. */
function prismSettingsFromConfig(value: unknown): PrismSettings {
  if (!validate(value)) throw new Error(`SWARM_CONFIG_INVALID:${JSON.stringify(validate.errors ?? [])}`);
  const control = (value as SwarmConfig).operator.prism.control;
  if (path.resolve(control.artifactRoot) !== control.artifactRoot || control.artifactRoot === '/') {
    throw new Error('SWARM_CONFIG_INVALID:control.artifactRoot must be a normalized absolute non-root path');
  }
  try { new URL(control.studioPublicUrl); }
  catch { throw new Error('SWARM_CONFIG_INVALID:control.studioPublicUrl must be an absolute HTTP(S) URL'); }
  const settings = (value as SwarmConfig).operator.prism.worker;
  if (settings.maximumActiveRequests + settings.maximumProbeRequests > settings.maximumConnections) {
    throw new Error('SWARM_CONFIG_WORKER_CONNECTION_BUDGET_INVALID');
  }
  const supervisor = (value as SwarmConfig).operator.prism.native.supervisor;
  if (settings.shutdownTimeoutMs <= supervisor.closeTimeoutMs + supervisor.drainTimeoutMs) {
    throw new Error('SWARM_CONFIG_WORKER_SHUTDOWN_BUDGET_INVALID');
  }
  return Object.freeze({ control: Object.freeze({ ...control }), worker: Object.freeze({ ...settings }),
    native: Object.freeze({ ...(value as SwarmConfig).operator.prism.native,
      supervisor: Object.freeze({ ...supervisor }),
      resourcePolicy: Object.freeze({ ...(value as SwarmConfig).operator.prism.native.resourcePolicy }) }) });
}

export function loadPrismWorkerSettings(environment: NodeJS.ProcessEnv): PrismWorkerSettings {
  return loadPrismSettings(environment).worker;
}

export function prismWorkerSettingsFromConfig(value: unknown): PrismWorkerSettings {
  return prismSettingsFromConfig(value).worker;
}
