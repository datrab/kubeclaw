#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { validateReleaseReceipt, validateRenderedRelease } from './updates/deployment-release.mjs';
import { loadNativeNodePolicy } from './native-worker-node-policy.mjs';
import { nativePrismDeploymentSelection } from './native-worker-deployment-preflight.mjs';
import { exportGitOpsBundle, gitOpsDigest, gitOpsName, gitOpsClusterKinds, inspectGitOpsResources } from './gitops-bundle.mjs';
import { claimedNamespaces } from './gitops-owner.mjs';

const root = path.resolve(import.meta.dirname, '..');
const git = (repository, args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
function gitFile(repository, revision, file) { return git(repository, ['show', `${revision}:${file}`]); }

function inspectCommittedGroup(repository, directory, revision, group, receipt) {
  if (!gitOpsName(group.name) || !gitOpsName(group.namespace)
    || group.path !== `${directory}/${group.role}` || group.wave !== (group.role === 'nova' ? 1 : 0)
    || !Array.isArray(group.helmReleases) || !group.helmReleases.length || !group.helmReleases.every(gitOpsName)) throw new Error('GITOPS_GROUP_INVALID');
  const bytes = gitFile(repository, revision, `${group.path}/resources.yaml`);
  if (gitOpsDigest(bytes) !== group.manifestDigest) throw new Error('GITOPS_MANIFEST_DIGEST_MISMATCH');
  validateRenderedRelease(bytes, bytes, receipt, group.role === 'prism');
  const documents = yaml.loadAll(bytes).filter(Boolean);
  const inspection = inspectGitOpsResources(documents, group.namespace);
  for (const field of ['resources', 'images', 'requiredSecrets']) {
    if (JSON.stringify(inspection[field]) !== JSON.stringify(group[field])) throw new Error(`GITOPS_BUNDLE_INVENTORY_MISMATCH:${field}`);
  }
  for (const document of documents) {
    if (document.metadata.labels?.['kubeclaw.dev/gitops-owner'] !== group.name) throw new Error('GITOPS_RESOURCE_OWNER_MISMATCH');
  }
  return inspection.resources;
}

function verifyCommittedChart(repository, revision) {
  const files = ['Chart.yaml', 'values.yaml', 'templates/applications.yaml', 'files/application-health.lua'].map(file => `charts/gitops/${file}`);
  const committed = git(repository, ['ls-tree', '-r', '--name-only', revision, '--', 'charts/gitops']).trim().split('\n');
  if (JSON.stringify(committed.sort()) !== JSON.stringify([...files].sort())) throw new Error('GITOPS_BOOTSTRAP_CHART_FILE_SET');
  for (const file of files) {
    if (gitFile(repository, revision, file) !== fs.readFileSync(path.join(repository, file), 'utf8')) throw new Error('GITOPS_BOOTSTRAP_CHART_DRIFT');
  }
}

export function readCommittedBundle(repository, directory, revision) {
  if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error('GITOPS_REVISION_MUST_BE_COMMIT');
  if (!/^releases\/gitops\/[a-z0-9][a-z0-9-]{0,50}$/u.test(directory)) throw new Error('GITOPS_BUNDLE_PATH_INVALID');
  if (git(repository, ['rev-parse', `${revision}^{commit}`]).trim() !== revision) throw new Error('GITOPS_REVISION_INVALID');
  const bundle = JSON.parse(gitFile(repository, revision, `${directory}/bundle.receipt`));
  if (bundle.schemaVersion !== 'kubeclaw-gitops-bundle.v1' || !Array.isArray(bundle.groups)
    || bundle.groups.map(group => group.role).join(',') !== 'buster,prism,nova') throw new Error('GITOPS_BUNDLE_SCHEMA_INVALID');
  validateReleaseReceipt(bundle.receipt, 'runtime');
  const selected = JSON.parse(gitFile(repository, revision, 'releases/runtime-images.json'));
  if (bundle.receipt.code) selected.code = JSON.parse(gitFile(repository, revision, 'releases/runtime-code.json'));
  if (JSON.stringify(selected) !== JSON.stringify(bundle.receipt)) throw new Error('GITOPS_SELECTED_RECEIPT_MISMATCH');
  const owned = new Set(), names = new Set();
  for (const group of bundle.groups) {
    if (names.has(group.name)) throw new Error('GITOPS_DUPLICATE_APPLICATION');
    names.add(group.name);
    for (const resource of inspectCommittedGroup(repository, directory, revision, group, bundle.receipt)) {
      const identity = `${resource.apiVersion.split('/').slice(0, -1).join('/')}/${resource.kind}/${resource.namespace}/${resource.name}`;
      if (owned.has(identity)) throw new Error('GITOPS_RESOURCE_HAS_MULTIPLE_OWNERS');
      owned.add(identity);
    }
  }
  verifyCommittedChart(repository, revision);
  return bundle;
}

export function bootstrapDocuments(repository, directory, url, revision, argoNamespace) {
  const address = new URL(url);
  if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash
    || !address.hostname || !gitOpsName(argoNamespace)) throw new Error('GITOPS_REPOSITORY_OR_NAMESPACE_INVALID');
  const bundle = readCommittedBundle(repository, directory, revision);
  if (bundle.groups.some(group => group.namespace === argoNamespace || group.resources.some(resource => resource.namespace === argoNamespace))) throw new Error('GITOPS_ADMIN_NAMESPACE_CANNOT_HOST_WORKLOADS');
  const name = `${bundle.groups[0].namespace}-runtime`;
  if (!gitOpsName(name)) throw new Error('GITOPS_APPLICATION_NAME_INVALID');
  const cluster = new Map(), namespaced = new Map();
  for (const group of bundle.groups) for (const resource of group.resources) {
    const entry = { group: resource.apiVersion.includes('/') ? resource.apiVersion.split('/')[0] : '', kind: resource.kind };
    (gitOpsClusterKinds.has(resource.kind) ? cluster : namespaced).set(`${entry.group}/${entry.kind}`, entry);
  }
  const destinations = [...new Set(bundle.groups.flatMap(group => [group.namespace, ...group.resources.map(resource => resource.namespace).filter(Boolean)]))].sort();
  const values = { repository: url, revision, destinations, rootName: name, project: `${name}-workloads`, groups: bundle.groups,
    clusterResourceWhitelist: [...cluster.values()], namespaceResourceWhitelist: [...namespaced.values()] };
  if (!gitOpsName(values.project)) throw new Error('GITOPS_PROJECT_NAME_INVALID');
  const documents = [
    { apiVersion: 'argoproj.io/v1alpha1', kind: 'AppProject', metadata: { name, namespace: argoNamespace, labels: { 'kubeclaw.dev/gitops-root': name } }, spec: {
      description: 'Administrative bootstrap: only this reviewed repository may define runtime Applications and their Project.',
      sourceRepos: [url], destinations: [{ namespace: argoNamespace, server: 'https://kubernetes.default.svc' }],
      clusterResourceWhitelist: [], namespaceResourceWhitelist: [{ group: 'argoproj.io', kind: 'Application' }, { group: 'argoproj.io', kind: 'AppProject' }],
    } },
    { apiVersion: 'argoproj.io/v1alpha1', kind: 'Application', metadata: { name, namespace: argoNamespace, labels: { 'kubeclaw.dev/gitops-root': name },
      annotations: { 'kubeclaw.dev/runtime-namespaces': JSON.stringify([...new Set(bundle.groups.map(group => group.namespace))]) } }, spec: {
      project: name, source: { repoURL: url, targetRevision: revision, path: 'charts/gitops', helm: { valuesObject: values } },
      destination: { server: 'https://kubernetes.default.svc', namespace: argoNamespace },
      syncPolicy: { automated: { prune: false, selfHeal: true, allowEmpty: false }, syncOptions: ['FailOnSharedResource=true'] },
    } },
  ];
  return { bundle, documents, values };
}

function verifyArgoConfiguration(repository, argoNamespace, get) {
  const cm = get(['get', 'configmap', 'argocd-cm', '-n', argoNamespace]);
  if (cm.data?.['application.resourceTrackingMethod'] !== 'annotation'
    || cm.data?.['resource.customizations.health.argoproj.io_Application'] !== fs.readFileSync(path.join(repository, 'charts/gitops/files/application-health.lua'), 'utf8')) throw new Error('GITOPS_ARGO_HEALTH_OR_TRACKING_NOT_INSTALLED');
  get(['get', 'csidriver', 'csi.spiffe.io']);
}

function isBootstrapApplication(application, rootName, argoNamespace) {
  return application.metadata?.name === rootName && application.metadata?.namespace === argoNamespace
    && application.metadata?.labels?.['kubeclaw.dev/gitops-root'] === rootName && application.spec?.project === rootName;
}

function verifyApplicationOwners(result, argoNamespace, applications, namespace) {
  for (const application of applications) {
    if (!claimedNamespaces(application).includes(namespace)) continue;
    if (isBootstrapApplication(application, result.values.rootName, argoNamespace)) continue;
    const expected = result.bundle.groups.some(group => group.name === application.metadata?.name && group.namespace === namespace);
    if (!expected || application.metadata?.namespace !== argoNamespace || application.spec?.project !== result.values.project) throw new Error(`GITOPS_OTHER_APPLICATION_PRESENT:${namespace}`);
  }
}

function verifyResourceOwner(resource, group, run) {
  const apiGroup = resource.apiVersion.includes('/') ? resource.apiVersion.split('/')[0] : '';
  const type = `${resource.kind}${apiGroup ? `.${apiGroup}` : ''}`;
  const output = run('kubectl', ['get', type, resource.name, ...(resource.namespace ? ['-n', resource.namespace] : []), '--ignore-not-found', '-o', 'json']);
  if (!output.trim()) return;
  const object = JSON.parse(output), annotations = object.metadata?.annotations ?? {};
  const owner = annotations['argocd.argoproj.io/tracking-id'];
  const label = object.metadata?.labels?.['kubeclaw.dev/gitops-owner'];
  if (annotations['meta.helm.sh/release-name'] || (owner && !owner.startsWith(`${group.name}:`)) || (label && label !== group.name)) throw new Error(`GITOPS_EXISTING_RESOURCE_OWNER:${type}/${resource.name}`);
  if (!owner) throw new Error(`GITOPS_UNMANAGED_EXISTING_RESOURCE_REQUIRES_REVIEW:${type}/${resource.name}`);
}

function verifyGroupPrerequisites(group, get, run) {
  const releases = JSON.parse(run('helm', ['list', '-n', group.namespace, '--all', '-o', 'json']));
  if (!Array.isArray(releases) || releases.some(release => group.helmReleases.includes(release.name))) throw new Error(`GITOPS_HELM_OWNER_PRESENT:${group.namespace}`);
  for (const secret of group.requiredSecrets) {
    const object = get(['get', 'secret', secret.name, '-n', group.namespace]);
    if (secret.keys.some(key => !object.data?.[key])) throw new Error(`GITOPS_REQUIRED_SECRET_KEY_MISSING:${group.namespace}/${secret.name}`);
  }
  for (const resource of group.resources) verifyResourceOwner(resource, group, run);
}

function verifyBootstrapOwners(result, argoNamespace, run) {
  const expected = [...result.documents, { kind: 'AppProject', metadata: { name: result.values.project } }];
  for (const document of expected) {
    const output = run('kubectl', ['get', `${document.kind}.argoproj.io`, document.metadata.name, '-n', argoNamespace, '--ignore-not-found', '-o', 'json']);
    if (!output.trim()) continue;
    const object = JSON.parse(output);
    if (object.metadata?.labels?.['kubeclaw.dev/gitops-root'] !== result.values.rootName) throw new Error('GITOPS_BOOTSTRAP_OWNER_CONFLICT');
    if (document.kind === 'Application' && (object.spec?.source?.repoURL !== result.values.repository
      || object.metadata.annotations?.['kubeclaw.dev/runtime-namespaces'] !== document.metadata.annotations['kubeclaw.dev/runtime-namespaces'])) throw new Error('GITOPS_BOOTSTRAP_SCOPE_CHANGE');
  }
}

const runCommand = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
export function preflightGitOps(repository, result, argoNamespace, run = runCommand, policyFile = path.join(repository, 'my-values/infra/native-worker-pools.yaml')) {
  const get = args => JSON.parse(run('kubectl', [...args, '-o', 'json']));
  verifyArgoConfiguration(repository, argoNamespace, get);
  verifyBootstrapOwners(result, argoNamespace, run);
  const applications = get(['get', 'applications.argoproj.io', '--all-namespaces']).items;
  if (!Array.isArray(applications)) throw new Error('GITOPS_APPLICATION_LIST_INVALID');
  for (const namespace of result.values.destinations) get(['get', 'namespace', namespace]);
  for (const group of result.bundle.groups) {
    verifyApplicationOwners(result, argoNamespace, applications, group.namespace);
    verifyGroupPrerequisites(group, get, run);
  }
  const prism = result.bundle.groups.find(group => group.role === 'prism');
  const resources = yaml.loadAll(gitFile(repository, result.values.revision, `${prism.path}/resources.yaml`)).filter(Boolean);
  nativePrismDeploymentSelection(resources, prism.namespace, loadNativeNodePolicy(policyFile));
  run(process.execPath, [path.join(repository, 'scripts/native-worker-node-preflight.mjs'), policyFile]);
}

function performBootstrap(command, args) {
  const result = bootstrapDocuments(root, ...args.slice(0, 4));
  if (command === 'bootstrap') {
    process.stdout.write(result.documents.map(document => yaml.dump(document, { noRefs: true, lineWidth: 120 })).join('---\n'));
    return;
  }
  preflightGitOps(root, result, args[3], runCommand, args[4]);
  if (command === 'preflight') {
    process.stdout.write('GitOps ownership, Secrets, host policy and Argo configuration preflight passed. No resources changed.\n');
    return;
  }
  const input = result.documents.map(document => yaml.dump(document, { noRefs: true, lineWidth: 120 })).join('---\n');
  process.stdout.write(execFileSync('kubectl', ['apply', '-f', '-'], { input, encoding: 'utf8', timeout: 60000 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'export' && (args.length === 2 || args.length === 3)) {
      const result = exportGitOpsBundle(root, args[0], args[1], args[2] ?? args[1], process.env);
      process.stdout.write(`Exported ${result.groups.length} groups. Review and commit the release bundle before bootstrap.\n`);
    } else if (['bootstrap', 'preflight', 'apply'].includes(command) && (args.length === 4 || args.length === 5)) {
      performBootstrap(command, args);
    } else throw new Error('Usage: gitops.mjs export releases/gitops/NAME NAMESPACE [PRISM_NAMESPACE] | bootstrap|preflight|apply releases/gitops/NAME HTTPS_REPOSITORY COMMIT ARGO_NAMESPACE [NODE_POLICY]');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
