import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dump, load } from 'js-yaml';
import { renderPostgresqlRecovery } from '../../../scripts/render-postgresql-recovery.mjs';
import { requireCompatibleRecoveryVolume } from '../../../scripts/postgresql-recovery-preflight.mjs';

const policyFile = 'my-values/infra/postgresql-recovery.yaml';
const postgresFile = 'my-values/infra/postgresql-values.yaml';
const applicationFile = 'my-values/infra/litellm-deployment.yaml';
const helm = process.env.HELM_BIN ?? 'helm';

test('actual locked Helm service binds scheduled recovery image, storage, credentials and narrow network policy', () => {
  const documents = renderPostgresqlRecovery('recovery-test', policyFile, postgresFile, applicationFile, helm);
  const settings = documents.find(value => value.metadata.name.endsWith('-settings')).data;
  assert.equal(settings.PGHOST, 'postgresql'); assert.equal(settings.PGDATABASE, 'litellm');
  assert.match(settings.BACKUP_APPLICATION_IMAGE, /@sha256:[a-f0-9]{64}$/);
  assert.equal(settings.BACKUP_CREDENTIAL_AUTHORITY_REF, 'kubernetes-secret:recovery-test/litellm-secrets');
  const job = documents.find(value => value.kind === 'CronJob');
  assert.equal(job.spec.schedule, '*/5 * * * *'); assert.equal(job.spec.concurrencyPolicy, 'Forbid');
  const pod = job.spec.jobTemplate.spec.template.spec; const container = pod.containers[0];
  assert.equal(pod.automountServiceAccountToken, false);
  assert.deepEqual(container.command, ['bash', '/recovery/postgresql-recovery.sh', 'scheduled']);
  assert.equal(container.image, JSON.parse(fs.readFileSync('versions.json', 'utf8')).infrastructure.postgresql.replace(/:[^:@]+@/, '@'));
  assert.equal(container.env.find(value => value.name === 'PGPASSWORD').valueFrom.secretKeyRef.name, 'postgresql-secrets');
  assert.equal(container.env.find(value => value.name === 'LITELLM_MASTER_KEY').valueFrom.secretKeyRef.name, 'litellm-secrets');
  assert.equal(documents.some(value => value.kind === 'Secret'), false);
  assert.equal(documents.find(value => value.metadata.name.endsWith('-script')).data['postgresql-recovery.sh'], fs.readFileSync('scripts/postgresql-recovery.sh', 'utf8'));
  const policies = documents.filter(value => value.kind === 'CiliumNetworkPolicy');
  assert.equal(policies.length, 2);
  assert.equal(policies[0].spec.egress[1].toEndpoints[0].matchLabels['k8s:io.kubernetes.pod.namespace'], 'recovery-test');
  assert.deepEqual(policies[0].spec.egress[1].toPorts[0].ports, [{ port: '5432', protocol: 'TCP' }]);
  // Manifest contracts, not a mocked Kubernetes API or deployed PVC claim.
  const desired = documents.find(value => value.kind === 'PersistentVolumeClaim');
  const bound = { ...structuredClone(desired), status: { phase: 'Bound' } };
  requireCompatibleRecoveryVolume(null, desired); requireCompatibleRecoveryVolume(bound, desired);
  assert.throws(() => requireCompatibleRecoveryVolume({ ...bound, status: { phase: 'Lost' } }, desired), /VOLUME_NOT_BOUND/);
  bound.spec.resources.requests.storage = '1Gi';
  assert.throws(() => requireCompatibleRecoveryVolume(bound, desired), /VOLUME_MIGRATION_REQUIRED/);
});

test('real Helm fullname override is respected and an impossible configured RPO is refused', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'postgres-recovery-render-'));
  try {
    const customPostgres = path.join(directory, 'postgres.yaml');
    const values = load(fs.readFileSync(postgresFile, 'utf8'));
    fs.writeFileSync(customPostgres, dump({ ...values, fullnameOverride: 'database-selected-name', nameOverride: 'database-label',
      primary: { ...values.primary, service: { ...values.primary?.service, ports: { postgresql: 5439 } } } }));
    const documents = renderPostgresqlRecovery('recovery-test', policyFile, customPostgres, applicationFile, helm);
    assert.equal(documents.find(value => value.metadata.name.endsWith('-settings')).data.PGHOST, 'database-selected-name');
    assert.equal(documents.find(value => value.metadata.name.endsWith('-settings')).data.PGPORT, '5439');
    const egress = documents.find(value => value.kind === 'CiliumNetworkPolicy').spec.egress[1];
    assert.equal(egress.toEndpoints[0].matchLabels['app.kubernetes.io/name'], 'database-label');
    assert.deepEqual(egress.toPorts[0].ports, [{ port: '5439', protocol: 'TCP' }, { port: '5432', protocol: 'TCP' }]);
    const customPolicy = path.join(directory, 'policy.yaml');
    fs.writeFileSync(customPolicy, dump({ ...load(fs.readFileSync(policyFile, 'utf8')), maximumAgeSeconds: 60 }));
    assert.throws(() => renderPostgresqlRecovery('recovery-test', customPolicy, postgresFile, applicationFile, helm), /RECOVERY_BUDGET_INVALID|RECOVERY_SCHEDULE_RPO_INVALID/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
