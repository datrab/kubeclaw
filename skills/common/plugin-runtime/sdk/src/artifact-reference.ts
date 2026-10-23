import { validateArtifactRefSchema } from './artifact-validator.generated.mjs';
import type { ArtifactRef } from './generated/contracts.ts';
/** Exact canonical artifactRef schema, without registry activation or filesystem reads. */
export function parseArtifactRef(value: unknown): ArtifactRef {
  if (!validateArtifactRefSchema(value)) throw new Error('REGISTRY_RESULT_INVALID: Value failed canonical contract artifactRef');
  return value as ArtifactRef;
}
