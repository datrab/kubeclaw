import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { integer, object, policy, result, safePart } from './common.js';

function inputs(invocation) {
  if (!Array.isArray(invocation.inputs) || invocation.inputs.length !== 2) throw new Error('KUBERNETES_RUNTIME_SECURITY_INPUTS_REQUIRED');
  const deploymentInput = invocation.inputs.find((item) => item.name === 'deployment');
  const manifestInput = invocation.inputs.find((item) => item.name === 'checked-manifest');
  if (deploymentInput?.kind !== 'value' || deploymentInput.schemaId !== 'kubeclaw.kubernetes-deployment-fixture@1'
    || manifestInput?.kind !== 'artifact' || manifestInput.artifact?.mediaType !== 'application/vnd.kubeclaw.checked-kubernetes-yaml'
    || typeof manifestInput.artifact.storageUrl !== 'string' || !manifestInput.artifact.storageUrl.startsWith('file:')) {
    throw new Error('KUBERNETES_RUNTIME_SECURITY_INPUTS_INVALID');
  }
  const deployment = object(deploymentInput.value, 'KUBERNETES_RUNTIME_SECURITY_DEPLOYMENT_INVALID');
  if (deployment.schemaVersion !== 'kubernetes-deployment-fixture.v1' || typeof deployment.leaseName !== 'string'
    || typeof deployment.namespace !== 'string' || typeof deployment.immutableImage !== 'string'
    || deployment.manifestDigest !== manifestInput.artifact.contentDigest) {
    throw new Error('KUBERNETES_RUNTIME_SECURITY_DEPLOYMENT_INVALID');
  }
  const file = fs.realpathSync(fileURLToPath(manifestInput.artifact.storageUrl));
  if (!fs.statSync(file).isFile()) throw new Error('KUBERNETES_RUNTIME_SECURITY_INPUTS_INVALID');
  return { deployment, file, digest: manifestInput.artifact.contentDigest };
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID');
  return { timeoutMs: integer(value.timeoutMs, 120_000, 1000, 300_000, 'KUBERNETES_RUNTIME_SECURITY_TIMEOUT_INVALID'),
    policy: policy(value.policy) };
}

function findings(value) {
  if (!Array.isArray(value)) throw new Error('KUBERNETES_RUNTIME_SECURITY_RESPONSE_INVALID');
  return value.map((raw) => {
    const item = object(raw, 'KUBERNETES_RUNTIME_SECURITY_RESPONSE_INVALID');
    return { id: `kubernetes-runtime:${safePart(item.id)}`, severity: item.severity,
      message: String(item.message), rule: String(item.id), category: 'kubernetes-runtime', status: 'affected' };
  });
}

export function provider() {
  return { async execute(invocation, context) {
    const config = configuration(invocation); const input = inputs(invocation);
    const response = object(await context.invoke('kubernetes.runtime-security', { operation: 'inspect',
      resource: { type: 'kubernetes.namespace', canonicalId: input.deployment.namespace }, payload: {
        leaseName: input.deployment.leaseName, namespace: input.deployment.namespace,
        immutableImage: input.deployment.immutableImage, manifestPath: input.file,
        manifestDigest: input.digest, timeoutMs: config.timeoutMs,
      } }), 'KUBERNETES_RUNTIME_SECURITY_RESPONSE_INVALID');
    if (response.scanner !== 'kubernetes-runtime-security' || response.leaseName !== input.deployment.leaseName
      || response.namespace !== input.deployment.namespace || response.manifestDigest !== input.digest) {
      throw new Error('KUBERNETES_RUNTIME_SECURITY_RESPONSE_INVALID');
    }
    return result(invocation, 'kubernetes-runtime', findings(response.findings), config.policy,
      { resultDigest: response.resultDigest, leaseName: response.leaseName, namespace: response.namespace,
        manifestDigest: response.manifestDigest, observedAt: response.observedAt });
  } };
}

export const testContract = Object.freeze({ configuration, inputs, findings });
