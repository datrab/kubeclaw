import { validateBusterClusterInvokerSettings, type BusterClusterInvokerSettings } from './buster-cluster-invokers.ts';
import { validateBusterExecutionSettings, type BusterExecutionSettings } from './buster-execution.ts';
export { validateBusterExecutionSettings, type BusterExecutionSettings } from './buster-execution.ts';
import path from 'node:path';
import { readSwarmBundle, validateComponentSettings, type SwarmBundleIdentity, type SwarmSelection } from './swarm-bundle.ts';

export interface WorkerCoreSettings {
  readonly localRuntime: Readonly<{
    drainTimeoutMs: number;
    cancellationTimeoutMs: number;
    replayLimit: number;
  }>;
}

export interface BusterAdmissionSettings {
  readonly maximumActiveJobs: number;
  readonly maximumQueuedJobs: number;
  readonly maximumConcurrentAttempts: number;
}
export interface BusterDependencyReadinessSettings {
  readonly maximumExecutionMs: number;
  readonly maximumOutputBytes: number;
}
export interface BusterSettings {
  readonly clusterInvokers: BusterClusterInvokerSettings;
  readonly execution: BusterExecutionSettings;
  readonly preparation: BusterPreparationSettings;
  readonly admission: BusterAdmissionSettings;
  readonly dependencyReadiness: BusterDependencyReadinessSettings;
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

export interface PrismNonceDatabaseSettings {
  readonly authenticationWindowMs: number;
  readonly idleTimeoutMs: number;
  readonly maximumCleanupRows: number;
  readonly timeoutMs: number;
  readonly maximumConnections: number;
}

export interface PrismWorkerSettings {
  readonly port: number;
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
export interface PrismEngineSettings {
  readonly cache: Readonly<{ maximumInFlight: number; maximumCompletedEntries: number; maximumCompletedBytes: number }>;
  readonly maximumIngestTextCharacters: number;
  readonly maximumAssetSourceCharacters: number;
}
export interface PrismNativeSettings {
  readonly enginePolicy: PrismEngineSettings;
  readonly supervisor: PrismSupervisorSettings;
  readonly resourcePolicy: PrismResourcePolicy;
  readonly maximumResultBytes: number;
  readonly dispatchTimeoutMs: number;
}
export interface PrismIngestionSettings {
  readonly port: number;
  readonly quarantineRoot: string;
  readonly quarantineTtlMs: number;
  readonly reaperIntervalMs: number;
  readonly maximumRequestBytes: number;
  readonly maximumSourceBytes: number;
  readonly sourceRequestTimeoutMs: number;
  readonly maximumRedirects: number;
  readonly allowedMediaTypes: readonly string[];
}
export interface PrismAgentLauncherSettings {
  readonly terminationGraceMs: number;
  readonly attemptLifetimeMs: number;
  readonly limits: Readonly<{ timeoutMs: number; cleanupTimeoutMs: number; logBytes: number; resultBytes: number; evidenceBytes: number; evidenceFiles: number }>;
}
export interface PrismAgentBridgeSettings {
  readonly port: number;
  readonly controlUrl: string;
  readonly maximumRequestBytes: number;
  readonly dispatchTimeoutMs: number;
  readonly controlRequestTimeoutMs: number;
  readonly pollIntervalMs: number;
}
export interface PrismControlSettings {
  /** Absent only on the original component-v2 reader. V3 requires all leaves. */
  readonly corpusRanking?: import('./corpus-ranking.ts').CorpusRankingPolicy;
  readonly agentToolControlUrl: string;
  readonly agentBridge: PrismAgentBridgeSettings;
  readonly databaseBootstrap: Readonly<{ connectionTimeoutMs: number; maximumAttempts: number; retryDelayMs: number }>;
  readonly maximumArtifactAcknowledgmentBytes: number;
  readonly agentLauncher: PrismAgentLauncherSettings;
  readonly ingestionServer: PrismIngestionSettings;
  readonly corpusSearchDefaultLimit: number;
  readonly corpusSearchMaximumLimit: number;
  readonly corpusSourceFamilyDefaultLimit: number;
  readonly corpusSourceFamilyMaximumLimit: number;

  readonly nativeAttemptLifetimeMs: number;
  readonly nativeAttemptTimeoutMs: number;
  readonly nativeAttemptCleanupTimeoutMs: number;
  readonly nativeAttemptLogBytes: number;
  readonly nativeAttemptResultBytes: number;
  readonly nativeAttemptEvidenceBytes: number;
  readonly nativeAttemptEvidenceFiles: number;
  readonly controlInternalUrl: string;
  readonly workerUrl: string;
  readonly ingestionUrl: string;
  readonly maximumInternalEvidenceBytes: number;
  readonly maximumProductControllerTokenCharacters: number;
  readonly productDecisionLifetimeMs: number;
  readonly productDecisionHistoryLimit: number;
  readonly maximumProductInputBytes: number;
  readonly productControllerTimeoutMs: number;
  readonly maximumProductControllerResponseBytes: number;
  readonly sessionLifetimeSeconds: number;
  readonly ingestionAcquireTimeoutMs: number;
  readonly ingestionCleanupTimeoutMs: number;

  readonly maximumDispatchBodyBytes: number;
  readonly maximumRenderAssetBytes: number;
  readonly maximumArtifactBytes: number;
  readonly maximumJsonBodyBytes: number;
  readonly maximumArtifactUploadBodyBytes: number;
  readonly port: number;
  readonly pipelinePreferenceSubject: string | null;
  readonly artifactRoot: string;
  readonly studioPublicUrl: string;
}
export interface PrismStudioBrowserPolicy {
  readonly maximumPreviewAssetBytes: number;
  readonly previewAssetTimeoutMs: number;
  readonly roundPolling: { readonly maximumAttempts: number; readonly intervalMs: number };
  readonly revisionPolling: { readonly maximumAttempts: number; readonly intervalMs: number };
  readonly initialDirectionPolling: { readonly maximumAttempts: number; readonly intervalMs: number };
}
export interface PrismStudioSettings {
  readonly browserPolicy: PrismStudioBrowserPolicy;
  readonly maximumRequestBodyBytes: number;
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
  'PRISM_NATIVE_ASSIGNED_INPUT_BYTES', 'PRISM_NATIVE_ASSIGNED_ENGINE_POLICY', 'PRISM_NATIVE_ASSIGNED_ARTIFACT_ACKNOWLEDGMENT_BYTES', 'PRISM_NATIVE_MAXIMUM_RESULT_BYTES',
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
  validateControlProfile(control);
  const studio = (value as SwarmConfig).operator.prism.studio;
  validateStudioOrigin(studio.controlUrl);
  const settings = (value as SwarmConfig).operator.prism.worker;
  const supervisor = (value as SwarmConfig).operator.prism.native.supervisor;
  validateWorkerProfile(settings, supervisor);
  return Object.freeze({ studio: Object.freeze({ ...studio }), control: Object.freeze({ ...control }), worker: Object.freeze({ ...settings }),
    native: Object.freeze({ ...(value as SwarmConfig).operator.prism.native,
      supervisor: Object.freeze({ ...supervisor }),
      resourcePolicy: Object.freeze({ ...(value as SwarmConfig).operator.prism.native.resourcePolicy }) }) });
}

function validateControlProfile(control: PrismControlSettings): void {
  validateStudioOrigin(control.agentToolControlUrl);
  if (control.agentLauncher.attemptLifetimeMs <= control.agentLauncher.limits.timeoutMs + control.agentLauncher.limits.cleanupTimeoutMs) throw new Error('SWARM_CONFIG_AGENT_LIFETIME_BUDGET_INVALID');
  if (path.resolve(control.ingestionServer.quarantineRoot) !== control.ingestionServer.quarantineRoot || control.ingestionServer.quarantineRoot === '/') throw new Error('SWARM_CONFIG_INGESTION_ROOT_INVALID');
  if (path.resolve(control.artifactRoot) !== control.artifactRoot || control.artifactRoot === '/') {
    throw new Error('SWARM_CONFIG_INVALID:control.artifactRoot must be a normalized absolute non-root path');
  }
  try { new URL(control.studioPublicUrl); }
  catch { throw new Error('SWARM_CONFIG_INVALID:control.studioPublicUrl must be an absolute HTTP(S) URL'); }
}

function validateWorkerProfile(settings: PrismWorkerSettings, supervisor: PrismSupervisorSettings): void {
  if (settings.maximumActiveRequests + settings.maximumProbeRequests > settings.maximumConnections) {
    throw new Error('SWARM_CONFIG_WORKER_CONNECTION_BUDGET_INVALID');
  }
  if (settings.shutdownTimeoutMs <= supervisor.closeTimeoutMs + supervisor.drainTimeoutMs) {
    throw new Error('SWARM_CONFIG_WORKER_SHUTDOWN_BUDGET_INVALID');
  }
}

/** Validate all intrinsic policies, but select only the actual caller's consumed domains. */
export function captureSwarmSettings(file: string | undefined, selection: SwarmSelection) {
  const bundle = readSwarmBundle(file, selection);
  for (const [owner, author] of Object.entries(bundle.authors)) {
    for (const profile of Object.values(author.profiles)) {
      const settings = profile.settings;
      if (owner === 'prism-control') validateControlProfile(settings as unknown as PrismControlSettings);
      else if (owner === 'prism-studio') validateStudioOrigin((settings as unknown as PrismStudioSettings).controlUrl);
      else if (owner === 'prism-worker') {
        const worker = settings as unknown as { ingress: PrismWorkerSettings; supervisor: PrismSupervisorSettings };
        validateWorkerProfile(worker.ingress, worker.supervisor);
      } else if (owner === 'buster-engine') {
        busterSettingsFromConfig({ operator: { buster: settings } }, bundle.identity.generationDirectory);
      }
    }
  }
  return bundle;
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

/** Capture Buster policies once before constructing service consumers. */
export function loadBusterSettings(environment: NodeJS.ProcessEnv): BusterSettings {
  return loadSwarmSettings(environment).buster;
}

function busterSettingsFromConfig(value: unknown, componentDirectory: string): BusterSettings {
  const preparation = busterPreparationSettingsFromConfig(value);
  const admission = validateBusterAdmissionSettings((value as SwarmConfig).operator.buster?.admission);
  const dependencyReadiness = validateBusterDependencyReadinessSettings((value as SwarmConfig).operator.buster?.dependencyReadiness);
  const execution = validateBusterExecutionSettings((value as SwarmConfig).operator.buster?.execution);
  const authored = validateBusterClusterInvokerSettings((value as SwarmConfig).operator.buster?.clusterInvokers);
  const clusterInvokers = Object.freeze({ ...authored, shared: Object.freeze({ ...authored.shared,
    kubectlExecutable: path.resolve(componentDirectory, authored.shared.kubectlExecutable) }) });
  return Object.freeze({ preparation, admission, dependencyReadiness, execution, clusterInvokers });
}

export function validateBusterDependencyReadinessSettings(value: unknown): BusterDependencyReadinessSettings {
  validateComponentSettings('buster-dependency-readiness', value, 'SWARM_CONFIG_BUSTER_DEPENDENCY_READINESS_INVALID');
  return Object.freeze({ ...value as BusterDependencyReadinessSettings });
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
  workerCore: WorkerCoreSettings;
  identity: SwarmBundleIdentity;
  profile: Readonly<Record<string, unknown>>;
}> {
  rejectLegacyAuthors(environment);
  throw new Error('SWARM_CONFIG_RETIRED_FULL_FACADE:use a verified consumed-owner startup capture');
}

export function rejectLegacyAuthors(environment: NodeJS.ProcessEnv): void {
  for (const key of [...migratedEnvironmentKeys,
    'BUSTER_V2_MAX_ARCHIVE_BYTES', 'BUSTER_V2_MAX_REQUEST_BYTES', 'BUSTER_V2_MAX_EXTRACTED_BYTES',
    'BUSTER_LEASE_API_GROUP', 'BUSTER_LEASE_API_VERSION', 'BUSTER_ALLOWED_SOURCE_SECRETS',
    'BUSTER_V2_MAX_ACTIVE_JOBS', 'BUSTER_V2_MAX_QUEUED_JOBS', 'BUSTER_V2_MAX_CONCURRENT_ATTEMPTS']) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}`);
  }
}
