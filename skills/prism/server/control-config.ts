import { loadProductConfig, type ProductConfig } from '../control/product-decisions.ts';
import { authorizePipelinePreferenceSubject } from '../control/pipeline-preference-subject.ts';
import { rejectLegacyAuthors, type PrismControlSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { projectControlSettings } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import type { PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';

export interface ControlConfig {
  readonly pipelinePreferenceSubject: string | undefined;
}

/** Load and validate platform-owned Control configuration once at startup. */
export function loadControlConfig(capture: PipelineBootCapture, environment: NodeJS.ProcessEnv = process.env): ControlConfig {
  rejectLegacyAuthors(environment);
  return controlPolicy(projectControlSettings(capture).control);
}

function controlPolicy(settings: PrismControlSettings): ControlConfig {
  const pipelinePreferenceSubject = settings.pipelinePreferenceSubject ?? undefined;
  authorizePipelinePreferenceSubject(undefined, pipelinePreferenceSubject);
  return Object.freeze({pipelinePreferenceSubject});
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadTrustConfig(environment: NodeJS.ProcessEnv) {
  const spiffeEnabled = environment.WORKER_TRUST_SPIFFE_ENABLED === 'true';
  const trustedNovaSpiffeId = environment.PRISM_TRUSTED_NOVA_SPIFFE_ID ?? '';
  const trustedWorkerSpiffeId = environment.PRISM_TRUSTED_WORKER_SPIFFE_ID ?? '';
  const trustedControlSpiffeId = environment.PRISM_CONTROL_SPIFFE_ID ?? '';
  const trustedPrismAgentSpiffeId = environment.PRISM_TRUSTED_AGENT_SPIFFE_ID ?? '';
  if (spiffeEnabled && (!trustedNovaSpiffeId || !trustedWorkerSpiffeId || !trustedControlSpiffeId || !trustedPrismAgentSpiffeId)) {
    throw new Error('Prism SPIFFE trust policy is incomplete');
  }
  return {
    spiffeEnabled, trustedNovaSpiffeId, trustedWorkerSpiffeId,
    trustedControlSpiffeId, trustedPrismAgentSpiffeId,
    trustedTestRunnerSpiffeId: environment.PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID ?? '',
    dispatchSecret: spiffeEnabled ? '' : required(environment, 'PRISM_DISPATCH_SECRET'),
    workerSecret: spiffeEnabled ? '' : required(environment, 'PRISM_WORKER_SECRET'),
  };
}

/** Resolve authored native settings and service credentials once, at composition. */
export function loadControlServerConfig(capture: PipelineBootCapture, environment: NodeJS.ProcessEnv = process.env) {
  rejectLegacyAuthors(environment);
  if (environment.PORT !== undefined) throw new Error("SWARM_CONFIG_LEGACY_OVERRIDE:PORT:use prism-control.config.json settings.port");
  if (environment.PRISM_WORKER_URL !== undefined) throw new Error('SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_WORKER_URL:use prism-control.config.json settings.workerUrl');
  if (environment.PRISM_INGESTION_URL !== undefined) throw new Error('SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_INGESTION_URL:use prism-control.config.json settings.ingestionUrl');
  if (environment.PRISM_CONTROL_INTERNAL_URL !== undefined) throw new Error('SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_CONTROL_INTERNAL_URL:use prism-control.config.json settings.controlInternalUrl');
  const { native: settings, control, workerCore } = projectControlSettings(capture);
  return Object.freeze({
    ...(workerCore ? {workerCore} : {}), ...controlPolicy(control),
    port: control.port,
    maximumArtifactAcknowledgmentBytes: control.maximumArtifactAcknowledgmentBytes,
    agentLauncher: control.agentLauncher,
    ...(control.corpusRanking ? {corpusRanking: control.corpusRanking} : {}),
    corpusSearchDefaultLimit: control.corpusSearchDefaultLimit,
    corpusSearchMaximumLimit: control.corpusSearchMaximumLimit,
    corpusSourceFamilyDefaultLimit: control.corpusSourceFamilyDefaultLimit,
    corpusSourceFamilyMaximumLimit: control.corpusSourceFamilyMaximumLimit,

    nativeAttemptLifetimeMs: control.nativeAttemptLifetimeMs,
    nativeAttemptTimeoutMs: control.nativeAttemptTimeoutMs,
    nativeAttemptCleanupTimeoutMs: control.nativeAttemptCleanupTimeoutMs,
    nativeAttemptLogBytes: control.nativeAttemptLogBytes,
    nativeAttemptResultBytes: control.nativeAttemptResultBytes,
    nativeAttemptEvidenceBytes: control.nativeAttemptEvidenceBytes,
    nativeAttemptEvidenceFiles: control.nativeAttemptEvidenceFiles,
    sessionLifetimeSeconds: control.sessionLifetimeSeconds,
    ...(control.sessionDefaultRoles ? {sessionDefaultRoles: control.sessionDefaultRoles} : {}),
    ingestionAcquireTimeoutMs: control.ingestionAcquireTimeoutMs,
    ingestionCleanupTimeoutMs: control.ingestionCleanupTimeoutMs,

    maximumDispatchBodyBytes: control.maximumDispatchBodyBytes,
    maximumRenderAssetBytes: control.maximumRenderAssetBytes,
    maximumInternalEvidenceBytes: control.maximumInternalEvidenceBytes,
    maximumProductControllerTokenCharacters: control.maximumProductControllerTokenCharacters,
    productDecisionLifetimeMs: control.productDecisionLifetimeMs,
    productDecisionHistoryLimit: control.productDecisionHistoryLimit,
    maximumProductInputBytes: control.maximumProductInputBytes,
    productControllerTimeoutMs: control.productControllerTimeoutMs,
    maximumProductControllerResponseBytes: control.maximumProductControllerResponseBytes,
    maximumArtifactBytes: control.maximumArtifactBytes,
    maximumJsonBodyBytes: control.maximumJsonBodyBytes,
    maximumArtifactUploadBodyBytes: control.maximumArtifactUploadBodyBytes,
    nativeResourcePolicy: settings.resourcePolicy,
    maximumWorkerResponseBytes: settings.maximumResultBytes,
    nativeWorkerDispatchTimeoutMs: settings.dispatchTimeoutMs,
    sessionSecret: required(environment, 'PRISM_SESSION_SECRET'),
    ingressSecret: required(environment, 'PRISM_INGRESS_SECRET'),
    ...loadTrustConfig(environment),
    ingestionSecret: required(environment, 'PRISM_INGESTION_SECRET'),
    artifactRoot: control.artifactRoot,
    workerUrl: new URL(control.workerUrl),
    ingestionUrl: new URL(control.ingestionUrl),
    controlInternalUrl: new URL(control.controlInternalUrl),
    studioPublicUrl: control.studioPublicUrl,
  });
}

export function loadProductAuthorityConfig(environment: NodeJS.ProcessEnv = process.env): Promise<ProductConfig | undefined> {
  return loadProductConfig(environment);
}

/** Capture one startup configuration before asynchronous signing-key I/O. */
export async function loadControlCompositionConfig(capture: PipelineBootCapture, environment: NodeJS.ProcessEnv = process.env) {
  const snapshot = {...environment};
  const service = loadControlServerConfig(capture, snapshot);
  const product = await loadProductAuthorityConfig(snapshot);
  return Object.freeze({service, product, listener: Object.freeze({port: service.port, databaseUrl: snapshot.DATABASE_URL})});
}
