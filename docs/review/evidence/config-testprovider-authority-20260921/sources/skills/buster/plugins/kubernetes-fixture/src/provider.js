import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const IMAGE = /^(?:[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._/-][a-z0-9]+)*)@(sha256:[a-f0-9]{64})$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const SECRET = /^[A-Za-z0-9._-]+$/u;
const MEDIA_TYPE = 'application/vnd.kubeclaw.checked-kubernetes-yaml';
const MAX_NAMESPACE_PREFIX_LENGTH = 42;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`KUBERNETES_FIXTURE_CONFIG_INVALID:${label}`);
  return value;
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'root');
  const imageInputs = invocation.inputs.filter((item) => item.name === 'image');
  if (invocation.inputs.some((item) => !['image', 'checked-manifest'].includes(item.name))) {
    throw new Error('KUBERNETES_FIXTURE_INPUT_UNKNOWN');
  }
  if (imageInputs.length > 1 || imageInputs.some((item) => item.kind !== 'value'
    || item.schemaId !== 'kubeclaw.container-image@1')) throw new Error('KUBERNETES_FIXTURE_IMAGE_INPUT_INVALID');
  if (value.image !== undefined && imageInputs.length) throw new Error('KUBERNETES_FIXTURE_IMAGE_AMBIGUOUS');
  if (value.image === undefined && imageInputs.length === 0) throw new Error('KUBERNETES_FIXTURE_IMAGE_REQUIRED');
  const image = value.image === undefined ? object(imageInputs[0].value, 'image-input') : object(value.image, 'image');
  const matched = typeof image.reference === 'string' ? IMAGE.exec(image.reference) : null;
  if (!matched || typeof image.digest !== 'string' || !DIGEST.test(image.digest) || matched[1] !== image.digest) {
    throw new Error('KUBERNETES_FIXTURE_IMAGE_INVALID');
  }
  if (typeof value.serviceName !== 'string' || !DNS_LABEL.test(value.serviceName)) throw new Error('KUBERNETES_FIXTURE_SERVICE_NAME_INVALID');
  if (!Number.isSafeInteger(value.servicePort) || value.servicePort < 1 || value.servicePort > 65535) throw new Error('KUBERNETES_FIXTURE_SERVICE_PORT_INVALID');
  const serviceTargetPort = value.serviceTargetPort;
  if (serviceTargetPort !== undefined && (!Number.isSafeInteger(serviceTargetPort) || serviceTargetPort < 1 || serviceTargetPort > 65535)) throw new Error('KUBERNETES_FIXTURE_SERVICE_TARGET_PORT_INVALID');
  const namespacePrefix = value.namespacePrefix ?? 'test';
  if (typeof namespacePrefix !== 'string' || namespacePrefix.length > MAX_NAMESPACE_PREFIX_LENGTH || !DNS_LABEL.test(namespacePrefix)) {
    throw new Error('KUBERNETES_FIXTURE_NAMESPACE_PREFIX_INVALID');
  }
  const retention = value.retention === undefined ? {} : object(value.retention, 'retention');
  const retentionMode = retention.mode ?? 'delete';
  const retentionSeconds = retention.seconds ?? 1800;
  if (!['delete', 'retain'].includes(retentionMode) || !Number.isSafeInteger(retentionSeconds)
    || retentionSeconds < 60 || retentionSeconds > 604800) throw new Error('KUBERNETES_FIXTURE_RETENTION_INVALID');
  const readinessTimeoutSeconds = value.readinessTimeoutSeconds ?? 120;
  if (!Number.isSafeInteger(readinessTimeoutSeconds) || readinessTimeoutSeconds < 1 || readinessTimeoutSeconds > 3600) {
    throw new Error('KUBERNETES_FIXTURE_READINESS_TIMEOUT_INVALID');
  }
  const secretReferences = value.secretReferences ?? [];
  if (!Array.isArray(secretReferences) || secretReferences.length > 32
    || secretReferences.some((item) => typeof item !== 'string' || !SECRET.test(item))) {
    throw new Error('KUBERNETES_FIXTURE_SECRET_REFERENCES_INVALID');
  }
  const testCredentials = value.testCredentials === undefined ? null : object(value.testCredentials, 'testCredentials');
  if (testCredentials && (testCredentials.mode !== 'generate'
    || typeof testCredentials.secretName !== 'string' || !DNS_LABEL.test(testCredentials.secretName))) {
    throw new Error('KUBERNETES_FIXTURE_TEST_CREDENTIALS_INVALID');
  }
  return { immutableImage: image.reference, imageDigest: image.digest, serviceName: value.serviceName,
    servicePort: value.servicePort, namespacePrefix, retentionMode, retentionSeconds,
    readinessTimeoutSeconds, secretReferences: [...new Set(secretReferences)],
    ...(serviceTargetPort === undefined ? {} : { serviceTargetPort }),
    ...(testCredentials ? { testCredentials: { mode: 'generate', secretName: testCredentials.secretName } } : {}) };
}

function manifestInput(invocation) {
  const inputs = invocation.inputs.filter((item) => item.name === 'checked-manifest');
  if (inputs.length !== 1 || inputs[0].kind !== 'artifact') throw new Error('KUBERNETES_FIXTURE_INPUT_REQUIRED');
  const artifact = inputs[0].artifact;
  if (artifact.mediaType !== MEDIA_TYPE) throw new Error('KUBERNETES_FIXTURE_INPUT_MEDIA_TYPE_INVALID');
  if (!DIGEST.test(artifact.contentDigest) || !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 1) {
    throw new Error('KUBERNETES_FIXTURE_INPUT_METADATA_INVALID');
  }
  if (typeof artifact.storageUrl !== 'string' || !artifact.storageUrl.startsWith('file:')) throw new Error('KUBERNETES_FIXTURE_INPUT_URL_INVALID');
  const file = fs.realpathSync(fileURLToPath(artifact.storageUrl));
  if (!fs.statSync(file).isFile()) throw new Error('KUBERNETES_FIXTURE_INPUT_NOT_FILE');
  return { artifact, file };
}

function identity(invocation, prefix) {
  const digest = crypto.createHash('sha256').update(`${invocation.runId}\0${invocation.nodeId}\0${invocation.attemptId}`).digest('hex').slice(0, 20);
  const namespace = `${prefix}-${digest}`;
  return { leaseName: namespace, namespaceName: namespace };
}

function capabilityRequest(invocation, config, manifest) {
  const names = identity(invocation, config.namespacePrefix);
  return {
    operation: 'prepare', resource: { type: 'kubernetes.fixture', canonicalId: `kubernetes-fixture:${invocation.attemptId}` },
    payload: { ...names, namespacePrefix: config.namespacePrefix, project: invocation.moduleId ?? invocation.runId,
      immutableImage: config.immutableImage, imageDigest: config.imageDigest, manifestPath: manifest.file,
      manifestDigest: manifest.artifact.contentDigest, serviceName: config.serviceName, servicePort: config.servicePort,
      ...(config.serviceTargetPort === undefined ? {} : { serviceTargetPort: config.serviceTargetPort }),
      retentionSeconds: config.retentionSeconds, readinessTimeoutMs: Math.min(invocation.timeoutMs, config.readinessTimeoutSeconds * 1000),
      retentionMode: config.retentionMode, secretReferences: config.secretReferences,
      ...(config.testCredentials ? { testCredentials: config.testCredentials } : {}) },
  };
}

function details(values) {
  const schemaId = 'kubeclaw.kubernetes-fixture-details.v1';
  return { schemaId, schemaDigest: `sha256:${crypto.createHash('sha256').update(schemaId).digest('hex')}`, values };
}

export function provider() {
  return {
    async execute(invocation, context) {
      const config = configuration(invocation);
      const manifest = manifestInput(invocation);
      const result = await context.invoke('kubernetes.fixture', capabilityRequest(invocation, config, manifest));
      if (result.ok !== true) throw new Error('KUBERNETES_FIXTURE_PREPARATION_FAILED');
      if (config.testCredentials && !result.generatedCredentials) throw new Error('KUBERNETES_FIXTURE_CREDENTIAL_PROVENANCE_MISSING');
      const deployment = { schemaVersion: 'kubernetes-deployment-fixture.v1', leaseName: result.leaseName,
        namespace: result.namespace,
        createdAt: result.createdAt, expiresAt: result.expiresAt, endpoints: [{ name: config.serviceName, url: result.endpoint }],
        secretReferences: config.secretReferences, manifestDigest: manifest.artifact.contentDigest,
        ...(result.credentialsRef ? { credentialsRef: result.credentialsRef } : {}),
        immutableImage: config.immutableImage, retentionMode: config.retentionMode, releaseAction: result.releaseAction };
      context.log('stdout', `Prepared Kubernetes fixture ${String(result.namespace)} from ${manifest.artifact.contentDigest}.\n`);
      return { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: `Prepared Kubernetes fixture ${String(result.namespace)}.`,
        counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [],
        metrics: [{ name: 'kubernetes_fixture_resources', value: Number(result.resourceCount ?? 0) },
          { name: 'kubernetes_fixture_pods', value: Number(result.podCount ?? 0) }], evidenceFiles: [], reports: [],
        outputs: [
          ...(result.generatedCredentials ? [{ name: 'demo-credentials', kind: 'value', schemaId: 'kubeclaw.generated-demo-credentials@1', value: result.generatedCredentials }] : []),
          { name: 'deployment', kind: 'value', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1', value: deployment },
          { name: 'image', kind: 'value', schemaId: 'kubeclaw.container-image@1',
            value: { schemaVersion: 'container-image.v1', reference: config.immutableImage, digest: config.imageDigest } },
        ],
        exitCode: null, signal: null, providerDetails: details({ leaseName: result.leaseName, namespace: result.namespace,
          manifestDigest: manifest.artifact.contentDigest, immutableImage: config.immutableImage,
          retentionMode: config.retentionMode, expiresAt: result.expiresAt }) };
    },
    async cleanup(invocation, context) {
      const config = configuration(invocation);
      if (config.retentionMode === 'retain') return;
      const names = identity(invocation, config.namespacePrefix);
      const released = await context.invoke('kubernetes.fixture', { operation: 'release',
        resource: { type: 'kubernetes.fixture', canonicalId: `kubernetes-fixture:${invocation.attemptId}` },
        payload: { ...names, namespacePrefix: config.namespacePrefix } });
      if (released?.ok !== true) throw new Error('KUBERNETES_FIXTURE_RELEASE_FAILED');
    },
  };
}

export const testContract = Object.freeze({ configuration, identity, mediaType: MEDIA_TYPE });
