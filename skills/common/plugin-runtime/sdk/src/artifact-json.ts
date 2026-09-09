import type {ArtifactRef} from './generated/contracts.ts';
import {portableJson, PORTABLE_JSON_ENCODING, sha256Text} from './values.ts';

/** Verify the producer's original bytes. Untagged historical JSON is never recanonicalized. */
export function verifiedArtifactJsonText(response: Readonly<Record<string, unknown>>, expected: ArtifactRef): string {
  const bytes = response.jsonBytes;
  if (response.schemaVersion !== 'artifact-json-bytes.v1' || typeof bytes !== 'string' || Buffer.byteLength(bytes) !== response.sizeBytes
    || sha256Text(bytes) !== response.digest) throw new Error('ARTIFACT_JSON_BYTES_UNBOUND');
  const value: unknown = JSON.parse(bytes);
  const portable = portableJson(value);
  if (portable !== portableJson(response.value)) throw new Error('ARTIFACT_JSON_VALUE_UNBOUND');
  const artifact = response.artifact as Readonly<Record<string, unknown>> | undefined;
  if (!artifact || portableJson(artifact) !== portableJson(expected) || artifact.digest !== response.digest || artifact.sizeBytes !== response.sizeBytes) {
    throw new Error('ARTIFACT_JSON_REFERENCE_UNBOUND');
  }
  if (artifact.encoding !== undefined && (artifact.encoding !== PORTABLE_JSON_ENCODING || bytes !== portable)) {
    throw new Error('ARTIFACT_JSON_ENCODING_INVALID');
  }
  return bytes;
}
