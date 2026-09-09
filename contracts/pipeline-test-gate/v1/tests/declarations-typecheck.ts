import type { ArtifactRefV1, DeclaredEvidenceV1, EvidenceRefV1 } from '../src/types.ts';
const artifact: ArtifactRefV1 = { artifactId: 'artifact:report', type: 'report', mediaType: 'application/json',
  contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'artifact://report' };
export const stored: EvidenceRefV1 = { evidenceId: 'report', type: 'report', artifact };
export const declaration: DeclaredEvidenceV1 = { evidenceId: 'report', type: 'report', file: 'report.json', mediaType: 'application/json' };
export const invalid: DeclaredEvidenceV1 = { ...declaration,
  // @ts-expect-error A provider declares a local file; only the runner assigns storage identity.
  artifact,
};
