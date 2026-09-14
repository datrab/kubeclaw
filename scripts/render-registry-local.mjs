import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseAllDocuments, stringify } from 'yaml';

const template = new URL('../my-values/infra/registry-local.yaml', import.meta.url);
const dataPath = '/var/lib/registry';
const claimName = 'registry-local-data';
const configPath = '/etc/kubeclaw-registry/config.yml';

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some(key => !['capacity', 'storageClassName'].includes(key))
    || !/^[1-9][0-9]*(Mi|Gi|Ti)$/.test(config.capacity ?? '')
    || !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(config.storageClassName ?? '')
    || config.storageClassName.length > 253) throw new Error('REGISTRY_STORAGE_CONFIG_INVALID');
}

function dataMount(pod) {
  return pod?.containers?.find(item => item.name === 'registry')?.volumeMounts?.find(item => item.mountPath === dataPath);
}

function validateDeployment(existing) {
  if (existing.kind !== 'Deployment' || existing.metadata?.name !== 'registry-local') throw new Error('REGISTRY_DEPLOYMENT_INVALID');
  const pod = existing.spec?.template?.spec;
  const mount = dataMount(pod);
  const volume = pod?.volumes?.find(item => item.name === mount?.name);
  if (!mount || mount.subPath || mount.subPathExpr || volume?.persistentVolumeClaim?.claimName !== claimName) {
    throw new Error('REGISTRY_EPHEMERAL_MIGRATION_REQUIRED');
  }
}

function validatePvc(pvc, config) {
  if (pvc.kind !== 'PersistentVolumeClaim' || pvc.metadata?.name !== claimName
    || pvc.spec?.accessModes?.length !== 1 || pvc.spec.accessModes[0] !== 'ReadWriteOncePod'
    || pvc.spec.storageClassName !== config.storageClassName
    || pvc.spec.resources?.requests?.storage !== config.capacity) throw new Error('REGISTRY_EXISTING_STORAGE_MISMATCH');
}

export function renderRegistryLocal(config, mode = 'serve', existing = null, existingPvc = null) {
  validateConfig(config);
  if (!['serve', 'gc-dry-run', 'gc'].includes(mode)) throw new Error('REGISTRY_MODE_INVALID');
  // Never replace an old writable container layer with an empty volume.
  // Absence is supplied only by kubectl --ignore-not-found; lookup errors abort.
  if (existing) validateDeployment(existing);
  else if (mode !== 'serve') throw new Error('REGISTRY_GC_EXISTING_DEPLOYMENT_REQUIRED');
  if (existingPvc) validatePvc(existingPvc, config);
  if (existing && !existingPvc) throw new Error('REGISTRY_EXISTING_STORAGE_MISSING');
  const docs = parseAllDocuments(fs.readFileSync(template, 'utf8')).map(doc => {
    if (doc.errors.length) throw new Error('REGISTRY_TEMPLATE_INVALID');
    return doc.toJS();
  });
  const pvc = docs.find(doc => doc.kind === 'PersistentVolumeClaim');
  pvc.spec.storageClassName = config.storageClassName;
  pvc.spec.resources.requests.storage = config.capacity;
  const deployment = docs.find(doc => doc.kind === 'Deployment');
  deployment.spec.replicas = mode === 'serve' ? 1 : 0;
  if (mode !== 'serve') {
    const spec = structuredClone(deployment.spec.template.spec);
    spec.restartPolicy = 'Never';
    const container = spec.containers[0];
    container.args = ['garbage-collect', ...(mode === 'gc-dry-run' ? ['--dry-run'] : []), configPath];
    delete container.ports;
    delete container.readinessProbe;
    delete container.livenessProbe;
    // RWOP prevents overlap even while the old writer Pod is terminating.
    // No delete-untagged: every manifest, including digest-only references, survives.
    docs.push({ apiVersion: 'batch/v1', kind: 'Job', metadata: { name: `registry-local-${mode}` },
      spec: { backoffLimit: 0, template: { metadata: { labels: { app: 'registry-local-gc' } }, spec } } });
  }
  return docs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [configFile, mode = 'serve', existingFile, pvcFile, ...extra] = process.argv.slice(2);
  if (!configFile || !existingFile || !pvcFile || extra.length) throw new Error('Usage: render-registry-local.mjs config.json serve|gc-dry-run|gc existing-deployment.json existing-pvc.json');
  const existingText = fs.readFileSync(existingFile, 'utf8').trim();
  const pvcText = fs.readFileSync(pvcFile, 'utf8').trim();
  const docs = renderRegistryLocal(JSON.parse(fs.readFileSync(configFile, 'utf8')), mode, existingText ? JSON.parse(existingText) : null, pvcText ? JSON.parse(pvcText) : null);
  process.stdout.write(docs.map(doc => stringify(doc)).join('---\n'));
}
