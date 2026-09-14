import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { selectedRelease } from './updates/deployment-release.mjs';

export const gitOpsDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const gitOpsName = value => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value);
const resourceName = value => typeof value === 'string' && value.length <= 253 && value.split('.').every(gitOpsName);
export const gitOpsClusterKinds = new Set(['ClusterRole', 'ClusterRoleBinding', 'CustomResourceDefinition', 'ValidatingAdmissionPolicy', 'ValidatingAdmissionPolicyBinding']);
const namespaced = new Set(['ConfigMap', 'CronJob', 'Deployment', 'Ingress', 'Job', 'NetworkPolicy', 'PersistentVolumeClaim',
  'PodDisruptionBudget', 'Role', 'RoleBinding', 'Service', 'ServiceAccount', 'StatefulSet', 'CiliumNetworkPolicy']);

function resourceScope(document, namespace) {
  if (!document || !resourceName(document.metadata?.name)
    || typeof document.apiVersion !== 'string' || !/^(?:[a-z0-9.-]+\/)?[a-z0-9]+$/u.test(document.apiVersion)) throw new Error('GITOPS_RESOURCE_IDENTITY_INVALID');
  if (!gitOpsClusterKinds.has(document.kind) && !namespaced.has(document.kind)) throw new Error(`GITOPS_RESOURCE_KIND_DENIED:${document.kind}`);
  // Nova's existing chart owns narrowly scoped verification RBAC in the operator namespace.
  const externalRbac = ['Role', 'RoleBinding'].includes(document.kind) && document.metadata.namespace;
  const scope = gitOpsClusterKinds.has(document.kind) ? '' : externalRbac || namespace;
  if ((scope && !gitOpsName(scope)) || (document.metadata.namespace && document.metadata.namespace !== scope)) throw new Error(`GITOPS_CROSS_NAMESPACE_RESOURCE:${document.kind}/${document.metadata.name}`);
  return scope;
}

function inspectVolumeSecrets(volume, secret) {
  if (volume.secret) {
    secret(volume.secret.secretName);
    for (const item of volume.secret.items ?? []) secret(volume.secret.secretName, item.key);
  }
  for (const source of volume.projected?.sources ?? []) {
    if (!source.secret) continue;
    secret(source.secret.name);
    for (const item of source.secret.items ?? []) secret(source.secret.name, item.key);
  }
}

function inspectPodReferences(value, secret, images) {
  for (const field of ['containers', 'initContainers']) for (const container of value[field] ?? []) {
    if (typeof container.image !== 'string' || !/^[A-Za-z0-9._:/-]+@sha256:[a-f0-9]{64}$/u.test(container.image)) throw new Error(`GITOPS_IMAGE_NOT_IMMUTABLE:${container.name}`);
    images.add(container.image);
  }
  if (value.secretKeyRef) secret(value.secretKeyRef.name, value.secretKeyRef.key);
  if (value.secretRef) secret(value.secretRef.name);
  for (const item of value.imagePullSecrets ?? []) secret(item.name);
  for (const volume of value.volumes ?? []) inspectVolumeSecrets(volume, secret);
}

export function inspectGitOpsResources(documents, namespace) {
  const resources = [], secrets = new Map(), images = new Set();
  const secret = (name, key) => {
    if (!resourceName(name) || (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(key)))) throw new Error('GITOPS_SECRET_REFERENCE_INVALID');
    if (!secrets.has(name)) secrets.set(name, new Set());
    if (key) secrets.get(name).add(key);
  };
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    inspectPodReferences(value, secret, images);
    for (const child of Object.values(value)) visit(child);
  };
  for (const document of documents) {
    const scope = resourceScope(document, namespace);
    if (scope) document.metadata.namespace = scope;
    resources.push({ apiVersion: document.apiVersion, kind: document.kind, namespace: scope, name: document.metadata.name });
    visit(document);
  }
  if (!resources.length || !images.size) throw new Error('GITOPS_EMPTY_RELEASE');
  return { resources, images: [...images].sort(), requiredSecrets: [...secrets].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, keys]) => ({ name, keys: [...keys].sort() })) };
}

function renderGroup(root, relative, role, namespace, prismNamespace, environment) {
  const destination = role === 'prism' ? prismNamespace : namespace, name = `${destination}-${role}`;
  if (!gitOpsName(name)) throw new Error('GITOPS_APPLICATION_NAME_INVALID');
  const helmReleases = role === 'prism' ? [environment.PRISM_RELEASE ?? 'prism', 'agent-prism'] : [`agent-${role}`];
  if (!helmReleases.every(gitOpsName)) throw new Error('GITOPS_HELM_RELEASE_INVALID');
  const rendered = execFileSync('bash', [path.join(root, 'scripts/deploy.sh'), 'render', role, 'image'], {
    cwd: root, env: { ...environment, NAMESPACE: namespace, PRISM_NAMESPACE: prismNamespace },
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const documents = yaml.loadAll(rendered).filter(Boolean), inspected = inspectGitOpsResources(documents, destination);
  for (const document of documents) document.metadata.labels = { ...document.metadata.labels, 'kubeclaw.dev/gitops-owner': name };
  const manifest = documents.map(document => yaml.dump(document, { noRefs: true, lineWidth: 120 })).join('---\n');
  return { manifest, group: { role, name, namespace: destination, helmReleases, path: `${relative}/${role}`,
    wave: role === 'nova' ? 1 : 0, manifestDigest: gitOpsDigest(manifest), ...inspected } };
}

function writeNewBundle(output, files) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (fs.realpathSync(path.dirname(output)) !== path.dirname(output)) throw new Error('GITOPS_BUNDLE_PARENT_SYMLINK');
  const pending = fs.mkdtempSync(`${output}.pending-`);
  try {
    for (const [file, bytes] of files) {
      const target = path.join(pending, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { mode: 0o600 });
    }
    // A unique reviewed release directory is never rewritten in place.
    if (fs.existsSync(output)) throw new Error('GITOPS_BUNDLE_ALREADY_EXISTS');
    fs.renameSync(pending, output);
  } catch (error) { fs.rmSync(pending, { recursive: true, force: true }); throw error; }
}

/** Export the existing selected-release renderer, not another image/value resolver. */
export function exportGitOpsBundle(root, directory, namespace, prismNamespace, environment) {
  if (!gitOpsName(namespace) || !gitOpsName(prismNamespace)) throw new Error('GITOPS_NAMESPACE_INVALID');
  const output = path.resolve(root, directory), relative = path.relative(root, output).split(path.sep).join('/');
  if (!/^releases\/gitops\/[a-z0-9][a-z0-9-]{0,50}$/u.test(relative)) throw new Error('GITOPS_BUNDLE_PATH_INVALID');
  if (fs.existsSync(output)) throw new Error('GITOPS_BUNDLE_ALREADY_EXISTS');
  const receipt = selectedRelease(root, 'runtime'), groups = [], files = new Map(), owned = new Set();
  for (const role of ['buster', 'prism', 'nova']) {
    const { manifest, group } = renderGroup(root, relative, role, namespace, prismNamespace, environment);
    for (const resource of group.resources) {
      const identity = `${resource.apiVersion.split('/').slice(0, -1).join('/')}/${resource.kind}/${resource.namespace}/${resource.name}`;
      if (owned.has(identity)) throw new Error(`GITOPS_RESOURCE_HAS_MULTIPLE_OWNERS:${identity}`);
      owned.add(identity);
    }
    files.set(`${role}/resources.yaml`, manifest); groups.push(group);
  }
  const bundle = { schemaVersion: 'kubeclaw-gitops-bundle.v1', receipt, groups };
  files.set('bundle.receipt', JSON.stringify(bundle, null, 2) + '\n');
  writeNewBundle(output, files);
  return bundle;
}
