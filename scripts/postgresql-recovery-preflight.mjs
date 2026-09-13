import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

/** No adoption, replacement or expansion of an existing backup volume. */
export function requireCompatibleRecoveryVolume(existing, desired) {
  if (!existing) return;
  if (existing.metadata.labels?.app !== desired.metadata.labels.app
    || existing.metadata.labels?.['app.kubernetes.io/managed-by'] !== desired.metadata.labels['app.kubernetes.io/managed-by']) throw new Error('POSTGRES_RECOVERY_VOLUME_OWNER_CONFLICT');
  if (existing.status?.phase !== 'Bound') throw new Error('POSTGRES_RECOVERY_VOLUME_NOT_BOUND');
  if (!isDeepStrictEqual(existing.spec.accessModes, desired.spec.accessModes)
    || (existing.spec.volumeMode ?? 'Filesystem') !== 'Filesystem'
    || existing.spec.resources.requests.storage !== desired.spec.resources.requests.storage
    || (desired.spec.storageClassName !== undefined && existing.spec.storageClassName !== desired.spec.storageClassName)) throw new Error('POSTGRES_RECOVERY_VOLUME_MIGRATION_REQUIRED');
}

export function preflightRecoveryVolume(namespace, documents) {
  const desired = documents.find(value => value.kind === 'PersistentVolumeClaim');
  if (!desired || desired.metadata.namespace !== namespace) throw new Error('POSTGRES_RECOVERY_VOLUME_REQUIRED');
  const prior = execFileSync('kubectl', ['-n', namespace, 'get', 'pvc', desired.metadata.name, '--ignore-not-found', '-o', 'json'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  requireCompatibleRecoveryVolume(prior.trim() ? JSON.parse(prior) : null, desired);
}
