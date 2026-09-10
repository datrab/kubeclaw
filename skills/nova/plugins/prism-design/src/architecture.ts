import {canonicalJson, portableJson, PORTABLE_JSON_ENCODING, sha256Text, type ArtifactRef} from '@kubeclaw/plugin-sdk';

/** The expected Core reference owns the codec; it does not change the read effect. */
export function assertArchitectureReferenceEncoding(expected: ArtifactRef): string {
  // Validate descriptors/JSON domain before any getter-prone property access.
  const reference = portableJson(expected);
  if (Object.hasOwn(expected, 'encoding') && expected.encoding !== PORTABLE_JSON_ENCODING) {
    throw new Error('PRISM_DESIGN_ARCHITECTURE_ENCODING_INVALID');
  }
  return reference;
}

/** Verify an original get_json result, including a previously completed receipt. */
export function verifiedArchitectureValue(response: unknown, expected: ArtifactRef): unknown {
  const reference = assertArchitectureReferenceEncoding(expected);
  portableJson(response);
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('PRISM_DESIGN_VALUE_INVALID');
  const result = response as Record<string, unknown>;
  if (['artifact', 'digest', 'sizeBytes', 'value'].some(key => !Object.hasOwn(result, key))) throw new Error('PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID');
  if (portableJson(result.artifact) !== reference) throw new Error('PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID');
  // Untagged historical values retain precisely the old verifier and fail closed
  // on cross-locale mismatch. Never guess a collator or infer a run profile.
  const bytes = Object.hasOwn(expected, 'encoding') ? portableJson(result.value) : canonicalJson(result.value);
  if (result.digest !== expected.digest || result.sizeBytes !== expected.sizeBytes
    || sha256Text(bytes) !== expected.digest || Buffer.byteLength(bytes) !== expected.sizeBytes) {
    throw new Error('PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID');
  }
  return result.value;
}
