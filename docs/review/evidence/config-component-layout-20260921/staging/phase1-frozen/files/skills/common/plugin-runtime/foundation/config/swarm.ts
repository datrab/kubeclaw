import path from 'node:path';
import { readSwarmBundle, validateComponentSettings, type SwarmBundleIdentity } from './swarm-bundle.ts';

export interface BusterAdmissionSettings {
  readonly maximumActiveJobs: number;
  readonly maximumQueuedJobs: number;
  readonly maximumConcurrentAttempts: number;
}
export interface BusterSettings {
  readonly preparation: BusterPreparationSettings;
  readonly admission: BusterAdmissionSettings;
}

export interface BusterPreparationSettings {
  readonly maximumOpenFiles: number;
  readonly tarTimeoutMs: number;
  readonly maximumArchiveEntries: number;
  readonly maximumListingLineBytes: number;
  readonly maximumTarStderrBytes: number;
  readonly maximumSourceEntries: number;
  readonly sourceEntryReservationBytes: number;
  readonly resourcePolicy: PrismResourcePolicy;
  readonly timeoutMs: number;
  readonly cleanupTimeoutMs: number;
  readonly maximumActivePreparations: number;
  readonly maximumPendingAdmissions: number;
  readonly maximumRequestBytes: number;
  readonly maximumArchiveBytes: number;
  readonly maximumExtractedBytes: number;
  readonly maximumHeaderBytes: number;
  readonly maximumSourceBytes: number;
  readonly maximumMetadataBytes: number;
  readonly maximumRecords: number;
  readonly maximumOwnershipBytes: number;
  readonly maximumJournalBytes: number;
  readonly maximumInputBytes: number;
  readonly maximumOutputBytes: number;
  readonly maximumResultBytes: number;
  readonly pollIntervalMs: number;
  readonly drainTimeoutMs: number;
  readonly closeTimeoutMs: number;
}

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
export interface PrismStudioSettings {
  readonly port: number;
  readonly controlTimeoutMs: number;
  readonly controlUrl: string;
}
interface PrismSettings {
  readonly studio: PrismStudioSettings;
  readonly control: PrismControlSettings;
  readonly worker: PrismWorkerSettings;
  readonly native: PrismNativeSettings;
}
interface SwarmConfig {
  readonly operator: { readonly prism: PrismSettings; readonly buster?: BusterSettings };
}
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
  return loadSwarmSettings(environment).prism;
}

/** Validate the authored document before selecting its operator-owned settings. */
function prismSettingsFromConfig(value: unknown): PrismSettings {
  const control = (value as SwarmConfig).operator.prism.control;
  if (path.resolve(control.artifactRoot) !== control.artifactRoot || control.artifactRoot === '/') {
    throw new Error('SWARM_CONFIG_INVALID:control.artifactRoot must be a normalized absolute non-root path');
  }
  try { new URL(control.studioPublicUrl); }
  catch { throw new Error('SWARM_CONFIG_INVALID:control.studioPublicUrl must be an absolute HTTP(S) URL'); }
  const studio = (value as SwarmConfig).operator.prism.studio;
  validateStudioOrigin(studio.controlUrl);
  const settings = (value as SwarmConfig).operator.prism.worker;
  if (settings.maximumActiveRequests + settings.maximumProbeRequests > settings.maximumConnections) {
    throw new Error('SWARM_CONFIG_WORKER_CONNECTION_BUDGET_INVALID');
  }
  const supervisor = (value as SwarmConfig).operator.prism.native.supervisor;
  if (settings.shutdownTimeoutMs <= supervisor.closeTimeoutMs + supervisor.drainTimeoutMs) {
    throw new Error('SWARM_CONFIG_WORKER_SHUTDOWN_BUDGET_INVALID');
  }
  return Object.freeze({ studio: Object.freeze({ ...studio }), control: Object.freeze({ ...control }), worker: Object.freeze({ ...settings }),
    native: Object.freeze({ ...(value as SwarmConfig).operator.prism.native,
      supervisor: Object.freeze({ ...supervisor }),
      resourcePolicy: Object.freeze({ ...(value as SwarmConfig).operator.prism.native.resourcePolicy }) }) });
}

function validateStudioOrigin(value: string): void {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash || /[\\\x00-\x20\x7f]/u.test(value)) throw new Error('origin');
  } catch { throw new Error('SWARM_CONFIG_INVALID:studio.controlUrl must be an absolute HTTP(S) origin'); }
}

export function loadPrismWorkerSettings(environment: NodeJS.ProcessEnv): PrismWorkerSettings {
  return loadPrismSettings(environment).worker;
}

/** Capture both Buster policies once before constructing service consumers. */
export function loadBusterSettings(environment: NodeJS.ProcessEnv): BusterSettings {
  return loadSwarmSettings(environment).buster;
}

function busterSettingsFromConfig(value: unknown): BusterSettings {
  const preparation = busterPreparationSettingsFromConfig(value);
  const admission = validateBusterAdmissionSettings((value as SwarmConfig).operator.buster?.admission);
  return Object.freeze({ preparation, admission });
}

export function validateBusterAdmissionSettings(value: unknown): BusterAdmissionSettings {
  validateComponentSettings('buster-admission', value, 'SWARM_CONFIG_BUSTER_ADMISSION_INVALID');
  return Object.freeze({ ...value as BusterAdmissionSettings });
}

/** Parent ownership consumes preparation only, while rejecting retired Buster authors. */
export function loadBusterPreparationSettings(environment: NodeJS.ProcessEnv): BusterPreparationSettings {
  return loadBusterSettings(environment).preparation;
}

function busterPreparationSettingsFromConfig(value: unknown): BusterPreparationSettings {
  const settings = (value as SwarmConfig).operator.buster?.preparation;
  if (!settings) throw new Error('SWARM_CONFIG_BUSTER_PREPARATION_REQUIRED');
  return validateBusterPreparationSettings(settings);
}

/** The host validates the immutable settings carried by its accepted envelope. */
export function validateBusterPreparationSettings(value: unknown): BusterPreparationSettings {
  validateComponentSettings('buster-preparation', value, 'SWARM_CONFIG_BUSTER_PREPARATION_INVALID');
  const settings = value as BusterPreparationSettings;
  for (const bytes of [settings.maximumRequestBytes, settings.maximumArchiveBytes, settings.maximumHeaderBytes,
    settings.maximumInputBytes, settings.maximumOutputBytes, settings.maximumResultBytes]) {
    if (bytes > 2_147_483_647) throw new Error('SWARM_CONFIG_BUSTER_BUFFER_LIMIT_INVALID');
  }
  if (settings.maximumArchiveBytes > settings.maximumRequestBytes
    || settings.maximumHeaderBytes >= settings.maximumMetadataBytes
    || settings.maximumInputBytes > settings.maximumJournalBytes
    || settings.maximumResultBytes + 4 * settings.maximumInputBytes > settings.maximumOutputBytes
    || settings.maximumHeaderBytes + 4 * settings.maximumInputBytes > settings.maximumResultBytes
    || settings.maximumOutputBytes > settings.maximumJournalBytes) {
    throw new Error('SWARM_CONFIG_BUSTER_STORAGE_BUDGET_INVALID');
  }
  validateBusterSourceReservation(settings);
  if (settings.closeTimeoutMs <= settings.drainTimeoutMs) throw new Error('SWARM_CONFIG_BUSTER_CLOSE_BUDGET_INVALID');
  if (!Number.isSafeInteger(settings.maximumRequestBytes + settings.maximumArchiveBytes + settings.maximumExtractedBytes)
    || settings.maximumRequestBytes + settings.maximumArchiveBytes + settings.maximumExtractedBytes > settings.maximumSourceBytes) {
    throw new Error('SWARM_CONFIG_BUSTER_SOURCE_RESERVATION_INVALID');
  }
  return Object.freeze({ ...settings, resourcePolicy: Object.freeze({ ...settings.resourcePolicy }) });
}

function validateBusterSourceReservation(settings: BusterPreparationSettings): void {
  const sourceReservation = settings.maximumRequestBytes + settings.maximumArchiveBytes + settings.maximumExtractedBytes
    + settings.maximumHeaderBytes + (settings.maximumArchiveEntries + 7) * settings.sourceEntryReservationBytes;
  if (!Number.isSafeInteger(sourceReservation) || sourceReservation > settings.maximumSourceBytes
    || settings.maximumArchiveEntries + 7 > settings.maximumSourceEntries) throw new Error('SWARM_CONFIG_BUSTER_SOURCE_RESERVATION_INVALID');
}

/** One fully validated startup snapshot; no inline-document or path fallback API. */
export function loadSwarmSettings(environment: NodeJS.ProcessEnv): Readonly<{
  prism: PrismSettings;
  buster: BusterSettings;
  identity: SwarmBundleIdentity;
}> {
  rejectLegacyAuthors(environment);
  const bundle = readSwarmBundle(environment.SWARM_CONFIG);
  const control = bundle.components['prism-control'].settings as unknown as PrismControlSettings & { dispatchTimeoutMs: number };
  const worker = bundle.components['prism-worker'].settings as unknown as { ingress: PrismWorkerSettings; supervisor: PrismSupervisorSettings };
  const execution = bundle.components['prism-execution'].settings as unknown as Pick<PrismNativeSettings, 'resourcePolicy' | 'maximumResultBytes'>;
  const { dispatchTimeoutMs, ...controlSettings } = control;
  const projection: SwarmConfig = { operator: {
    prism: {
      control: controlSettings,
      studio: bundle.components['prism-studio'].settings as unknown as PrismStudioSettings,
      worker: worker.ingress,
      native: { ...execution, dispatchTimeoutMs, supervisor: worker.supervisor },
    },
    buster: bundle.components['buster-engine'].settings as unknown as BusterSettings,
  } };
  // Validate both domains before returning either: no partial bundle activation.
  const prism = prismSettingsFromConfig(projection);
  const buster = busterSettingsFromConfig(projection);
  return Object.freeze({ prism, buster, identity: bundle.identity });
}

function rejectLegacyAuthors(environment: NodeJS.ProcessEnv): void {
  for (const key of [...migratedEnvironmentKeys,
    'BUSTER_V2_MAX_ARCHIVE_BYTES', 'BUSTER_V2_MAX_REQUEST_BYTES', 'BUSTER_V2_MAX_EXTRACTED_BYTES',
    'BUSTER_V2_MAX_ACTIVE_JOBS', 'BUSTER_V2_MAX_QUEUED_JOBS', 'BUSTER_V2_MAX_CONCURRENT_ATTEMPTS']) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}`);
  }
}
