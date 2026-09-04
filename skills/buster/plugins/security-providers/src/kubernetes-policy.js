import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findingId, integer, object, policy, result } from './common.js';

function manifestInput(invocation) {
  if (!Array.isArray(invocation.inputs) || invocation.inputs.length !== 1) throw new Error('KUBERNETES_POLICY_INPUT_REQUIRED');
  const input = invocation.inputs[0];
  if (input.name !== 'checked-manifest' || input.kind !== 'artifact'
    || input.artifact?.mediaType !== 'application/vnd.kubeclaw.checked-kubernetes-yaml'
    || typeof input.artifact.storageUrl !== 'string' || !input.artifact.storageUrl.startsWith('file:')) {
    throw new Error('KUBERNETES_POLICY_INPUT_INVALID');
  }
  const file = fs.realpathSync(fileURLToPath(input.artifact.storageUrl));
  if (!fs.statSync(file).isFile()) throw new Error('KUBERNETES_POLICY_INPUT_INVALID');
  return { file, digest: input.artifact.contentDigest };
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'KUBERNETES_POLICY_CONFIG_INVALID');
  return { timeoutMs: integer(value.timeoutMs, 120_000, 1000, 300_000, 'KUBERNETES_POLICY_TIMEOUT_INVALID'), policy: policy(value.policy) };
}

function findings(value) {
  if (!Array.isArray(value)) throw new Error('KUBERNETES_POLICY_RESPONSE_INVALID');
  return value.map((raw) => {
    const item = object(raw, 'KUBERNETES_POLICY_RESPONSE_INVALID');
    return { id: findingId('kubernetes-policy', item.id, item.sourceFile, item.line),
      severity: item.severity, message: String(item.message ?? item.title), rule: String(item.id),
      file: typeof item.sourceFile === 'string' ? item.sourceFile : undefined,
      line: Number.isSafeInteger(item.line) ? item.line : undefined, category: 'kubernetes-policy', status: item.status };
  });
}

export function provider() {
  return { async execute(invocation, context) {
    const config = configuration(invocation); const manifest = manifestInput(invocation);
    const response = object(await context.invoke('security.scan', { operation: 'kubernetes-policy',
      resource: { type: 'kubernetes.manifest', canonicalId: manifest.digest },
      payload: { manifestPath: manifest.file, manifestDigest: manifest.digest, timeoutMs: config.timeoutMs } }),
    'KUBERNETES_POLICY_RESPONSE_INVALID');
    if (response.scanner !== 'trivy' || response.operation !== 'kubernetes-policy') throw new Error('KUBERNETES_POLICY_RESPONSE_INVALID');
    return result(invocation, 'kubernetes-policy-trivy', findings(response.findings), config.policy,
      { resultDigest: response.resultDigest, manifestDigest: manifest.digest });
  } };
}

export const testContract = Object.freeze({ configuration, manifestInput, findings });
