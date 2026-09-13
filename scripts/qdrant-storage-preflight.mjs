import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from 'js-yaml';
import { verifyInfrastructureChart } from './infrastructure-chart.mjs';

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
  const [namespace, archive] = process.argv.slice(2);
  if (process.argv.length !== 4 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(namespace)) throw new Error('Usage: qdrant-storage-preflight.mjs NAMESPACE VERIFIED_CHART');
  verifyInfrastructureChart('qdrant', archive);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const existing = execFileSync('kubectl', ['get', 'statefulset', 'qdrant', '-n', namespace, '--ignore-not-found', '-o', 'json'],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const desired = loadAll(execFileSync('helm', ['template', 'qdrant', archive, '--namespace', namespace,
    '-f', path.join(root, 'my-values/infra/qdrant-values.yaml'), '--post-renderer', path.join(root, 'scripts/infrastructure-image-renderer.mjs'),
    '--post-renderer-args', 'qdrant'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).find(value => value?.kind === 'StatefulSet');
  requireCompatibleQdrantClaims(existing.trim() ? JSON.parse(existing) : null, desired);
  process.stdout.write('Qdrant immutable claim templates verified.\n');
}
