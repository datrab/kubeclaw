import { loadProductConfig, type ProductConfig } from '../control/product-decisions.ts';
import { authorizePipelinePreferenceSubject } from '../control/pipeline-preference-subject.ts';
import { loadPrismSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';

export interface ControlConfig {
  readonly pipelinePreferenceSubject: string | undefined;
}

/** Load and validate platform-owned Control configuration once at startup. */
export function loadControlConfig(environment: NodeJS.ProcessEnv = process.env): ControlConfig {
  return controlPolicy(loadPrismSettings(environment).control);
}

function controlPolicy(settings: ReturnType<typeof loadPrismSettings>['control']): ControlConfig {
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
export function loadControlServerConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.PORT !== undefined) throw new Error("SWARM_CONFIG_LEGACY_OVERRIDE:PORT:use operator.prism.control.port");
  const { native: settings, control } = loadPrismSettings(environment);
  return Object.freeze({
    ...controlPolicy(control),
    port: control.port,
    nativeResourcePolicy: settings.resourcePolicy,
    maximumWorkerResponseBytes: settings.maximumResultBytes,
    nativeWorkerDispatchTimeoutMs: settings.dispatchTimeoutMs,
    sessionSecret: required(environment, 'PRISM_SESSION_SECRET'),
    ingressSecret: required(environment, 'PRISM_INGRESS_SECRET'),
    ...loadTrustConfig(environment),
    ingestionSecret: required(environment, 'PRISM_INGESTION_SECRET'),
    artifactRoot: control.artifactRoot,
    workerUrl: new URL(environment.PRISM_WORKER_URL ?? 'http://prism-worker:8080'),
    ingestionUrl: new URL(environment.PRISM_INGESTION_URL ?? 'http://prism-ingestion:8080'),
    controlInternalUrl: new URL(environment.PRISM_CONTROL_INTERNAL_URL ?? 'http://prism-control:8080'),
    studioPublicUrl: control.studioPublicUrl,
  });
}

export function loadProductAuthorityConfig(environment: NodeJS.ProcessEnv = process.env): Promise<ProductConfig | undefined> {
  return loadProductConfig(environment);
}

/** Capture one startup configuration before asynchronous signing-key I/O. */
export async function loadControlCompositionConfig(environment: NodeJS.ProcessEnv = process.env) {
  const snapshot = {...environment};
  const service = loadControlServerConfig(snapshot);
  const product = await loadProductAuthorityConfig(snapshot);
  return Object.freeze({service, product, listener: Object.freeze({port: service.port, databaseUrl: snapshot.DATABASE_URL})});
}
