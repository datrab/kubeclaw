import { authorizePipelinePreferenceSubject } from '../control/pipeline-preference-subject.ts';

export interface ControlConfig {
  readonly pipelinePreferenceSubject: string | undefined;
}

/** Load and validate platform-owned Control configuration once at startup. */
export function loadControlConfig(environment: NodeJS.ProcessEnv = process.env): ControlConfig {
  const pipelinePreferenceSubject = environment.PRISM_PIPELINE_PREFERENCE_SUBJECT;
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

/** Resolve the original service defaults and credentials once, at composition. */
export function loadControlServerConfig(environment: NodeJS.ProcessEnv = process.env) {
  return Object.freeze({
    ...loadControlConfig(environment),
    sessionSecret: required(environment, 'PRISM_SESSION_SECRET'),
    ingressSecret: required(environment, 'PRISM_INGRESS_SECRET'),
    ...loadTrustConfig(environment),
    ingestionSecret: required(environment, 'PRISM_INGESTION_SECRET'),
    artifactRoot: environment.ARTIFACT_ROOT ?? '/var/lib/prism/artifacts',
    workerUrl: new URL(environment.PRISM_WORKER_URL ?? 'http://prism-worker:8080'),
    ingestionUrl: new URL(environment.PRISM_INGESTION_URL ?? 'http://prism-ingestion:8080'),
    controlInternalUrl: new URL(environment.PRISM_CONTROL_INTERNAL_URL ?? 'http://prism-control:8080'),
    studioPublicUrl: environment.PRISM_STUDIO_PUBLIC_URL ?? 'https://prism-studio',
  });
}

/** The production entrypoint remains a pg.Pool listener; no embedded-mode switch. */
export function loadControlListenerConfig(environment: NodeJS.ProcessEnv = process.env) {
  return {databaseUrl: environment.DATABASE_URL, port: Number(environment.PORT ?? 8080)};
}
