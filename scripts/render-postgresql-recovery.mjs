import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { dump, load, loadAll } from 'js-yaml';
import { infrastructureChart, stageInfrastructureChart } from './infrastructure-chart.mjs';
import { preflightRecoveryVolume } from './postgresql-recovery-preflight.mjs';
import { renderInfrastructureChart } from './infrastructure-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = 'litellm-postgresql-backup';
const identifier = value => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);

function validate(policy, namespace, postgres, application) {
  if (policy.schemaVersion !== 1 || !identifier(namespace) || !identifier(postgres.auth?.existingSecret)
    || typeof postgres.auth.secretKeys?.adminPasswordKey !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(postgres.auth.secretKeys.adminPasswordKey)
    || postgres.auth.database !== 'litellm' || application?.metadata?.name !== 'litellm') throw new Error('POSTGRES_RECOVERY_CONFIGURATION_INVALID');
  for (const key of ['backupIntervalMinutes', 'verificationIntervalMinutes', 'maximumAgeSeconds', 'maximumDurationSeconds', 'verificationDeadlineSeconds', 'maximumBackupBytes', 'maximumRetainedBytes']) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1) throw new Error(`POSTGRES_RECOVERY_POLICY_INVALID:${key}`);
  }
  validateBudgets(policy);
  validateStorage(policy);
}

function validateBudgets(policy) {
  if (policy.maximumDurationSeconds >= policy.maximumAgeSeconds || policy.maximumBackupBytes + 67108864 > policy.maximumRetainedBytes) throw new Error('POSTGRES_RECOVERY_BUDGET_INVALID');
  if (policy.backupIntervalMinutes > 60 || policy.verificationIntervalMinutes > 30
    || policy.verificationIntervalMinutes > policy.backupIntervalMinutes
    || 2 * policy.maximumDurationSeconds + policy.verificationIntervalMinutes * 60 + policy.verificationDeadlineSeconds + 60 >= policy.maximumAgeSeconds) throw new Error('POSTGRES_RECOVERY_SCHEDULE_RPO_INVALID');
}

function validateStorage(policy) {
  if (!/^[1-9][0-9]*(?:Gi|Ti)$/.test(policy.persistence?.size)
    || (policy.persistence.storageClass !== null && !identifier(policy.persistence.storageClass))) throw new Error('POSTGRES_RECOVERY_STORAGE_INVALID');
  if (!policy.resources?.requests?.cpu || !policy.resources.requests.memory || !policy.resources.limits?.cpu || !policy.resources.limits.memory) throw new Error('POSTGRES_RECOVERY_RESOURCES_REQUIRED');
}

function applicationSecret(application) {
  const secrets = application.spec.template.spec.containers.find(container => container.name === 'litellm')?.envFrom?.filter(value => value.secretRef);
  if (secrets?.length !== 1 || secrets[0].prefix || !identifier(secrets[0].secretRef.name)) throw new Error('POSTGRES_RECOVERY_APPLICATION_SECRET_AMBIGUOUS');
  return secrets[0].secretRef.name;
}

function validateCredentialAuthority(application, applicationFile) {
  const config = load(fs.readFileSync(path.join(path.dirname(applicationFile), 'litellm-config.yaml'), 'utf8'));
  const environment = application.spec.template.spec.containers.find(container => container.name === 'litellm')?.env ?? [];
  if (config.general_settings?.master_key !== 'os.environ/LITELLM_MASTER_KEY'
    || environment.some(value => ['LITELLM_MASTER_KEY', 'LITELLM_SALT_KEY'].includes(value.name))) throw new Error('POSTGRES_RECOVERY_CREDENTIAL_AUTHORITY_UNSUPPORTED');
}

function configuration(policy, postgres, application, service, namespace) {
  const applicationImage = application.spec.template.spec.containers.find(container => container.name === 'litellm')?.image;
  if (!/^[a-zA-Z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(applicationImage)) throw new Error('POSTGRES_RECOVERY_APPLICATION_PIN_REQUIRED');
  const [major, minor] = infrastructureChart('postgresql').appVersion.split('.').map(Number);
  return { PGHOST: service.name, PGPORT: String(service.port), PGDATABASE: postgres.auth.database, PGUSER: 'postgres',
    BACKUP_ROOT: '/backups/litellm', BACKUP_INTERVAL_SECONDS: String(policy.backupIntervalMinutes * 60), BACKUP_MAXIMUM_BYTES: String(policy.maximumBackupBytes),
    BACKUP_MAXIMUM_RETAINED_BYTES: String(policy.maximumRetainedBytes), BACKUP_MAXIMUM_AGE_SECONDS: String(policy.maximumAgeSeconds),
    BACKUP_MAXIMUM_DURATION_SECONDS: String(policy.maximumDurationSeconds), BACKUP_EXPECTED_SERVER_VERSION: String(major * 10000 + minor),
    BACKUP_CREDENTIAL_AUTHORITY_REF: `kubernetes-secret:${namespace}/${applicationSecret(application)}`,
    BACKUP_APPLICATION_IMAGE: applicationImage };
}

function cronJob(context) {
  const { policy, postgres, metadata, image, checksum, application } = context;
  const container = { name: 'backup', image, imagePullPolicy: 'IfNotPresent',
    command: ['bash', '/recovery/postgresql-recovery.sh', 'scheduled'],
    envFrom: [{ configMapRef: { name: `${name}-settings` } }], resources: policy.resources,
    securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
    volumeMounts: [{ name: 'backups', mountPath: '/backups', readOnly: false }, { name: 'script', mountPath: '/recovery', readOnly: true }, { name: 'tmp', mountPath: '/tmp' }] };
  container.env = [{ name: 'PGPASSWORD', valueFrom: { secretKeyRef: { name: postgres.auth.existingSecret, key: postgres.auth.secretKeys.adminPasswordKey } } },
    { name: 'LITELLM_MASTER_KEY', valueFrom: { secretKeyRef: { name: applicationSecret(application), key: 'LITELLM_MASTER_KEY' } } },
    { name: 'LITELLM_SALT_KEY', valueFrom: { secretKeyRef: { name: applicationSecret(application), key: 'LITELLM_SALT_KEY', optional: true } } }];
  return { apiVersion: 'batch/v1', kind: 'CronJob', metadata: { ...metadata, name }, spec: {
    schedule: `*/${policy.verificationIntervalMinutes} * * * *`, timeZone: 'Etc/UTC', concurrencyPolicy: 'Forbid',
    startingDeadlineSeconds: policy.verificationDeadlineSeconds, successfulJobsHistoryLimit: 3, failedJobsHistoryLimit: 10,
    jobTemplate: { spec: { backoffLimit: 0, activeDeadlineSeconds: policy.maximumDurationSeconds + 60,
      template: { metadata: { labels: metadata.labels, annotations: { 'checksum/recovery': checksum } }, spec: {
        automountServiceAccountToken: false, restartPolicy: 'Never',
        securityContext: { runAsNonRoot: true, runAsUser: 1001, runAsGroup: 1001, fsGroup: 1001, fsGroupChangePolicy: 'OnRootMismatch', seccompProfile: { type: 'RuntimeDefault' } },
        containers: [container], volumes: [{ name: 'backups', persistentVolumeClaim: { claimName: name } },
          { name: 'script', configMap: { name: `${name}-script`, defaultMode: 0o444 } }, { name: 'tmp', emptyDir: { sizeLimit: '256Mi' } }] },
      } } },
  } };
}

function networkPolicies(metadata, service) {
  const database = { matchLabels: { ...service.selector, 'k8s:io.kubernetes.pod.namespace': metadata.namespace } };
  const backup = { matchLabels: { app: name, 'k8s:io.kubernetes.pod.namespace': metadata.namespace } };
  const ports = [...new Set([service.port, service.targetPort])].map(port => ({ port: String(port), protocol: 'TCP' }));
  return [
    { apiVersion: 'cilium.io/v2', kind: 'CiliumNetworkPolicy', metadata: { ...metadata, name }, spec: { endpointSelector: backup, egress: [
      { toEndpoints: [{ matchLabels: { 'k8s:io.kubernetes.pod.namespace': 'kube-system', 'k8s:k8s-app': 'kube-dns' } }], toPorts: [{ ports: [{ port: '53', protocol: 'UDP' }, { port: '53', protocol: 'TCP' }], rules: { dns: [{ matchPattern: '*' }] } }] },
      { toEndpoints: [database], toPorts: [{ ports }] },
    ] } },
    { apiVersion: 'cilium.io/v2', kind: 'CiliumNetworkPolicy', metadata: { ...metadata, name: `${name}-database` }, spec: { endpointSelector: database, ingress: [{ fromEndpoints: [backup], toPorts: [{ ports: [{ port: String(service.targetPort), protocol: 'TCP' }] }] }] } },
  ];
}

function databaseService(namespace, postgresFile, helm) {
  const archive = stageInfrastructureChart('postgresql');
  const rendered = loadAll(renderInfrastructureChart('postgresql', 'postgresql', namespace, archive, postgresFile, helm, true));
  const services = rendered.filter(value => value?.kind === 'Service' && value.spec.clusterIP !== 'None'
    && value.spec.ports?.some(port => port.name === 'tcp-postgresql'));
  if (services.length !== 1) throw new Error('POSTGRES_RECOVERY_DATABASE_SERVICE_AMBIGUOUS');
  const service = services[0]; const port = service.spec.ports.find(value => value.name === 'tcp-postgresql');
  const workloads = rendered.filter(value => value?.kind === 'StatefulSet'
    && Object.entries(service.spec.selector).every(([key, label]) => value.spec.template.metadata.labels[key] === label));
  if (workloads.length !== 1) throw new Error('POSTGRES_RECOVERY_DATABASE_WORKLOAD_AMBIGUOUS');
  return { name: service.metadata.name, selector: service.spec.selector, port: port.port, targetPort: targetPort(workloads[0], port.targetPort) };
}

function targetPort(workload, target) {
  if (typeof target === 'number') return target;
  const ports = workload.spec.template.spec.containers.flatMap(container => container.ports ?? []).filter(port => port.name === target);
  if (ports.length !== 1) throw new Error('POSTGRES_RECOVERY_DATABASE_PORT_AMBIGUOUS');
  return ports[0].containerPort;
}

export function renderPostgresqlRecovery(namespace, policyFile, postgresFile, applicationFile, helm = 'helm') {
  const policy = load(fs.readFileSync(policyFile, 'utf8')); const postgres = load(fs.readFileSync(postgresFile, 'utf8'));
  const application = loadAll(fs.readFileSync(applicationFile, 'utf8')).find(value => value?.kind === 'Deployment' && value.metadata?.name === 'litellm');
  validate(policy, namespace, postgres, application);
  validateCredentialAuthority(application, applicationFile);
  const version = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
  const image = version.infrastructure.postgresql.replace(/:[^:@]+@/, '@');
  const script = fs.readFileSync(path.join(root, 'scripts/postgresql-recovery.sh'), 'utf8');
  const service = databaseService(namespace, postgresFile, helm);
  const data = configuration(policy, postgres, application, service, namespace);
  const checksum = createHash('sha256').update(script).update(JSON.stringify(data)).digest('hex');
  const metadata = { namespace, labels: { app: name, 'app.kubernetes.io/managed-by': 'kubeclaw-infrastructure' } };
  const storage = { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: policy.persistence.size } },
    ...(policy.persistence.storageClass === null ? {} : { storageClassName: policy.persistence.storageClass }) };
  const context = { policy, postgres, metadata, image, checksum, application };
  return [{ apiVersion: 'v1', kind: 'ConfigMap', metadata: { ...metadata, name: `${name}-settings` }, data },
    { apiVersion: 'v1', kind: 'ConfigMap', metadata: { ...metadata, name: `${name}-script` }, data: { 'postgresql-recovery.sh': script } },
    { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { ...metadata, name }, spec: storage },
    ...networkPolicies(metadata, service), cronJob(context)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preflight = process.argv[2] === '--preflight';
  const args = process.argv.slice(preflight ? 3 : 2);
  if (args.length !== 4) throw new Error('Usage: render-postgresql-recovery.mjs [--preflight] NAMESPACE POLICY POSTGRES_VALUES LITELLM_DEPLOYMENT');
  const documents = renderPostgresqlRecovery(...args);
  if (preflight) preflightRecoveryVolume(args[0], documents);
  process.stdout.write(documents.map(value => dump(value, { noRefs: true, lineWidth: -1 })).join('---\n'));
}
