import { databaseEvidence } from './database-evidence.js';
import { findingId, integer, object, policy, result } from './common.js';

function imageInput(invocation) {
  if (!Array.isArray(invocation.inputs) || invocation.inputs.length !== 1) throw new Error('IMAGE_SCAN_INPUT_REQUIRED');
  const input = invocation.inputs[0];
  if (input.name !== 'image' || input.kind !== 'value' || input.schemaId !== 'kubeclaw.container-image@1') throw new Error('IMAGE_SCAN_INPUT_REQUIRED');
  const value = object(input.value, 'IMAGE_SCAN_INPUT_INVALID');
  if (value.schemaVersion !== 'container-image.v1' || typeof value.reference !== 'string'
    || typeof value.digest !== 'string' || !value.reference.endsWith(`@${value.digest}`)) throw new Error('IMAGE_SCAN_INPUT_INVALID');
  return { image: value.reference, digest: value.digest };
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'IMAGE_SCAN_CONFIG_INVALID');
  return { timeoutMs: integer(value.timeoutMs, 300_000, 1000, 900_000, 'IMAGE_SCAN_TIMEOUT_INVALID'), policy: policy(value.policy) };
}

function findings(value) {
  if (!Array.isArray(value)) throw new Error('IMAGE_SCAN_RESPONSE_INVALID');
  return value.map((raw) => {
    const item = object(raw, 'IMAGE_SCAN_RESPONSE_INVALID');
    const id = findingId('image', item.id, item.package, item.sourceFile);
    return { id, severity: item.severity, message: `${String(item.package)} ${String(item.installedVersion)} in the final image has ${String(item.id)}.`,
      rule: String(item.id), file: typeof item.sourceFile === 'string' ? item.sourceFile : undefined,
      category: 'vulnerability', package: item.package, installedVersion: item.installedVersion,
      fixedVersion: item.fixedVersion, reachability: item.reachability, status: item.status };
  });
}

export function provider() {
  return { async execute(invocation, context) {
    const config = configuration(invocation); const image = imageInput(invocation);
    const response = object(await context.invoke('security.scan', { operation: 'image',
      resource: { type: 'container.image', canonicalId: image.image }, payload: { ...image, timeoutMs: config.timeoutMs } }),
    'IMAGE_SCAN_RESPONSE_INVALID');
    if (response.scanner !== 'trivy' || response.operation !== 'image') throw new Error('IMAGE_SCAN_RESPONSE_INVALID');
    return result(invocation, 'image-trivy', findings(response.findings), config.policy,
      { databaseEvidence: databaseEvidence(response), resultDigest: response.resultDigest, image: image.image, imageDigest: image.digest });
  } };
}

export const testContract = Object.freeze({ configuration, imageInput, findings });
