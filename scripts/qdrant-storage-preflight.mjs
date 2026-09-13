import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflightStatefulRelease } from './stateful-release-preflight.mjs';

export function requireCompatibleQdrantClaims(existing, desired) {
  if (!existing) return;
  const signature = workload => workload.spec.volumeClaimTemplates.map(claim => ({ name: claim.metadata.name,
    accessModes: claim.spec.accessModes, storage: claim.spec.resources.requests.storage,
    storageClassName: claim.spec.storageClassName ?? null, volumeMode: claim.spec.volumeMode ?? 'Filesystem' }));
  if (JSON.stringify(signature(existing)) !== JSON.stringify(signature(desired))) {
    throw new Error('QDRANT_STORAGE_MIGRATION_REQUIRED: existing immutable claim templates differ; preserve PVCs and complete the reviewed stateful migration before deployment');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [namespace, archive, values, release] = process.argv.slice(2);
  if (![4, 6].includes(process.argv.length)) throw new Error('Usage: qdrant-storage-preflight.mjs NAMESPACE VERIFIED_CHART [VALUES RELEASE]');
  const selected = values ?? fileURLToPath(new URL('../my-values/infra/qdrant-values.yaml', import.meta.url));
  console.log(JSON.stringify(preflightStatefulRelease('qdrant', namespace, archive, selected, 'helm', release ?? 'qdrant')));
}
