import { selectTruthyValue } from '../optional-absence.ts';
import { buildAndPushImage, copyAndPushImage } from '../services/buildkit.ts';
import { createFinding, createSuiteVerdict, SEVERITY, STATUS } from '../services/verdict-schema.ts';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';
import { withServicePortForward } from './k8s-port-forward.ts';
import { previewCredentialsRefAuthority, previewExposureHostname, finalPreviewLeaseStatus, makeCheck, errorOutput, trimOut } from './k8s-base.ts';
import type { AnyRecord, NamespaceLeaseStatus } from './k8s-base.ts';
import { readTestCredentials, requestNamespaceLease, runNamespaceControllerPreflight, verifyCopiedSecrets, waitForNamespaceLeaseReady, waitForPreviewUrl } from './k8s-lease.ts';
import { applyManifests, getPodStatus, retryHttpHealthCheck, retryHttpTextCheck, shouldUsePortForwardHealthCheck, waitForPods } from './k8s-runtime.ts';
import type { K8sPlan } from './k8s-plan.ts';

interface ExecutionState {
  plan: K8sPlan; leaseStatus: NamespaceLeaseStatus | null; previewLeaseStatus: NamespaceLeaseStatus | null;
  testCredentials: AnyRecord[]; internalBodyBytes: number | null; sourceImageId: string | null;
  registryImageDigest: string | null; deploymentImage: string | null; httpCode: number | null;
}

async function runStep(state: ExecutionState, name: string, started: string, action: () => Promise<string>): Promise<void> {
  const { plan } = state;
  if (plan.criticalFailed) return;
  plan.log(`--- ${name} ---`);
  plan.context.logSink?.({ suite: 'k8s', check: name, status: 'started', detail: started, elapsed_seconds: Math.ceil((Date.now() - plan.startTime) / 1000) });
  try {
    const detail = await action();
    plan.checks.push(makeCheck(name, true, detail));
    plan.context.logSink?.({ suite: 'k8s', check: name, status: 'passed', detail, elapsed_seconds: Math.ceil((Date.now() - plan.startTime) / 1000) });
  } catch (error) {
    const detail = trimOut(errorOutput(error));
    plan.checks.push(makeCheck(name, false, `${name} failed: ${detail}`));
    plan.context.logSink?.({ suite: 'k8s', check: name, status: 'failed', detail: detail.slice(0, 300), elapsed_seconds: Math.ceil((Date.now() - plan.startTime) / 1000) });
    plan.criticalFailed = true;
  }
}

async function buildImage(state: ExecutionState): Promise<void> {
  const { plan } = state;
  await runStep(state, 'k8s-capability-preflight', `Validating namespace controller access for ${plan.namespace}`, async () => runNamespaceControllerPreflight(plan.namespaceLease, plan.commandEnv));
  if (plan.sourceImage) await runStep(state, 'source-image-promote', `Promoting ${plan.sourceImage}`, async () => {
    const result = await copyAndPushImage({ sourceImage: plan.sourceImage!, image: plan.registryTag, timeoutMs: plan.pushTimeoutMs, log: plan.log });
    state.sourceImageId = result.digest; state.registryImageDigest = result.digest; state.deploymentImage = result.immutableImage;
    return `Promoted: ${plan.sourceImage} -> ${result.immutableImage}`;
  });
  else await runStep(state, 'buildkit-build-push', `Building ${plan.imageName}`, async () => {
    const result = await buildAndPushImage({ dockerfile: plan.dockerfile!, contextDir: plan.buildContext!, image: plan.registryTag,
      timeoutMs: plan.buildTimeoutMs + plan.pushTimeoutMs, log: plan.log });
    state.registryImageDigest = result.digest; state.deploymentImage = result.immutableImage;
    return `Published: ${result.immutableImage}`;
  });
}

async function provisionNamespace(state: ExecutionState): Promise<void> {
  const { plan } = state;
  await runStep(state, 'namespace-lease', plan.namespace, async () => {
    await requestNamespaceLease({ leaseName: plan.leaseName, namespaceName: plan.namespace, namespacePrefix: plan.namespacePrefix,
      serviceName: plan.serviceName, secretsToCopy: plan.secretsToCopy, payload: plan.payload, ttlSeconds: plan.ttlSeconds,
      cleanupPolicy: plan.cleanupPolicy, purpose: plan.purpose, exposure: plan.previewExposure, log: plan.log, env: plan.commandEnv });
    state.leaseStatus = await waitForNamespaceLeaseReady(plan.leaseName, plan.leaseTimeout, plan.log, plan.commandEnv);
    if (state.leaseStatus.namespaceName !== plan.namespace) throw new Error(`Lease returned unexpected namespace ${state.leaseStatus.namespaceName}`);
    return `Ready: ${plan.namespace}`;
  });
  await runStep(state, 'secret-copy', `${plan.secretsToCopy.length} required secret(s)`, async () => {
    await verifyCopiedSecrets(plan.secretsToCopy, plan.namespace, plan.commandEnv);
    return plan.secretsToCopy.length ? `Required secrets copied: ${plan.secretsToCopy.join(', ')}` : 'No required secrets requested';
  });
}

async function deployApplication(state: ExecutionState): Promise<void> {
  const { plan } = state;
  await runStep(state, 'manifest-apply', `${plan.manifestPaths.length} manifest(s)`, async () => {
    if (!state.deploymentImage) throw new Error('BuildKit image digest missing before manifest apply');
    await applyManifests(plan.manifestPaths, plan.imageName, state.deploymentImage, plan.namespace, plan.deployTimeoutMs, plan.log, plan.commandEnv);
    return `${plan.manifestPaths.length} manifest(s) applied`;
  });
  await runStep(state, 'test-credentials', `${plan.testCredentialSpecs.length} app test credential secret(s)`, async () => {
    state.testCredentials = await readTestCredentials(plan.testCredentialSpecs, plan.namespace, plan.commandEnv);
    return state.testCredentials.length ? `Decoded app test credentials: ${state.testCredentials.map((entry) => entry.secret).join(', ')}` : 'No app test credentials requested';
  });
  await runStep(state, 'pods-ready', `Waiting up to ${plan.readyTimeout}s`, async () => {
    try { await waitForPods(plan.namespace, plan.readyTimeout, plan.log, plan.commandEnv); return `All pods ready in ${plan.namespace}`; }
    catch (error) { throw new Error(`Pods not ready within ${plan.readyTimeout}s. Pod status:\n${await getPodStatus(plan.namespace, plan.commandEnv)}`, { cause: error }); }
  });
}

async function checkHealth(state: ExecutionState): Promise<string> {
  const { plan } = state;
  const healthPath = plan.purpose === 'final-preview' ? plan.previewPath : plan.healthPath;
  const serviceUrl = `http://${plan.serviceName}.${plan.namespace}.svc.cluster.local:${plan.port}${healthPath}`;
  await runStep(state, 'health-check', serviceUrl, async () => {
    if (shouldUsePortForwardHealthCheck({ purpose: plan.purpose, previewExposureProvider: plan.previewProvider })) {
      state.httpCode = await withServicePortForward(plan.namespace, plan.serviceName, plan.port, plan.healthPath, plan.log, plan.commandEnv,
        async (url) => retryHttpHealthCheck(url, plan.log, plan.healthRetries, plan.healthBaseDelayMs));
      return `HTTP ${state.httpCode} OK`;
    }
    const result = await retryHttpTextCheck(serviceUrl, plan.previewExpectedText, plan.log, plan.healthRetries, plan.healthBaseDelayMs);
    state.httpCode = result.statusCode; state.internalBodyBytes = result.body.length;
    return plan.previewExpectedText ? `Internal service served expected text "${plan.previewExpectedText}"` : `Internal service returned HTTP ${state.httpCode}`;
  });
  return serviceUrl;
}

async function resolvePreview(state: ExecutionState): Promise<void> {
  const { plan } = state;
  if (plan.criticalFailed || plan.purpose !== 'final-preview' || plan.previewProvider !== 'tailscale-ingress') return;
  await runStep(state, 'preview-url', `Waiting up to ${plan.previewUrlTimeout}s for Tailscale URL`, async () => {
    state.previewLeaseStatus = await waitForPreviewUrl(plan.leaseName, plan.previewUrlTimeout, plan.log, plan.commandEnv);
    if (!state.previewLeaseStatus.previewUrl) {
      const detail = state.previewLeaseStatus.message !== null
        ? state.previewLeaseStatus.message
        : state.previewLeaseStatus.exposurePhase === null ? 'preview_pending' : state.previewLeaseStatus.exposurePhase;
      throw new Error(`Preview URL missing: ${detail}`);
    }
    return `Preview: ${state.previewLeaseStatus.previewUrl}`;
  });
}

function buildVerdict(state: ExecutionState, serviceUrl: string): SuiteVerdict {
  const { plan } = state;
  const failed = plan.checks.filter((check) => !check.passed);
  const status: SuiteStatus = failed.length === 0 ? STATUS.PASS : STATUS.FAIL;
  const finalLease = finalPreviewLeaseStatus(state.previewLeaseStatus, state.leaseStatus);
  const credentials = state.testCredentials.find((entry) => entry?.purpose === 'final-preview login')?.values ?? null;
  const findings: Finding[] = failed.map((check) => createFinding(SEVERITY.CRITICAL, check.detail, { rule: check.name }));
  return createSuiteVerdict('k8s', status, { critical: true, duration_ms: Date.now() - plan.startTime, checks_total: plan.checks.length,
    checks_passed: plan.checks.length - failed.length, checks_failed: failed.length, findings,
    metadata: { test_namespace: plan.namespace, source_image: plan.sourceImage, source_image_id: state.sourceImageId,
      registry_image: plan.registryTag, deployed_image: state.deploymentImage, registry_image_digest: state.registryImageDigest,
      service_url: serviceUrl, preview_url: finalLease?.previewUrl ?? null, preview_exposure_provider: plan.previewProvider,
      preview_exposure_phase: finalLease?.exposurePhase ?? null, preview_exposure_hostname: previewExposureHostname(finalLease, plan.previewHostname),
      preview_credentials_ref: previewCredentialsRefAuthority(finalLease, plan.previewCredentialsRef), preview_credentials_available: finalLease?.credentialsAvailable === true,
      preview_credentials_command: plan.previewCredentialCommand, preview_credentials: credentials, preview_expected_text: plan.previewExpectedText,
      internal_body_bytes: state.internalBodyBytes, test_credentials: state.testCredentials, cleanup_policy: plan.cleanupPolicy,
      purpose: plan.purpose, health_http_code: state.httpCode, top_finding: failed[0]?.detail ?? null,
      checks: plan.checks.map((check) => ({ name: check.name, passed: check.passed, detail: check.detail.slice(0, 300) })) } });
}

export async function executeK8sPlan(plan: K8sPlan): Promise<SuiteVerdict> {
  const state: ExecutionState = { plan, leaseStatus: null, previewLeaseStatus: null, testCredentials: [], internalBodyBytes: null,
    sourceImageId: null, registryImageDigest: null, deploymentImage: null, httpCode: null };
  plan.log(`Starting: module=${plan.moduleId} project=${plan.payload.project} ns=${plan.namespace}`);
  await buildImage(state);
  await provisionNamespace(state);
  await deployApplication(state);
  const serviceUrl = await checkHealth(state);
  await resolvePreview(state);
  return buildVerdict(state, serviceUrl);
}
