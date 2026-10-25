import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import yaml from 'js-yaml';
import { validateReleaseReceipt, validateRenderedRelease } from './updates/deployment-release.mjs';
import { componentSource } from './updates/runtime-components.mjs';
import { gitOpsDigest, gitOpsName, inspectGitOpsResources } from './gitops-bundle.mjs';

function priorBundle(root) {
  const directory = JSON.parse(fs.readFileSync(path.join(root, 'gitops/production/selection.json'), 'utf8')).directory;
  if (!/^releases\/gitops\/[a-z0-9][a-z0-9-]{0,50}$/u.test(directory ?? '')) throw new Error('GITOPS_BUNDLE_PATH_INVALID');
  const prior = JSON.parse(fs.readFileSync(path.join(root, directory, 'bundle.receipt'), 'utf8'));
  validateReleaseReceipt(prior.receipt, 'runtime');
  if (prior.schemaVersion !== 'kubeclaw-gitops-bundle.v1'
    || prior.groups?.map(group => group.role).join(',') !== 'buster,prism,nova') throw new Error('GITOPS_BUNDLE_SCHEMA_INVALID');
  return { directory, prior };
}

function sameCode(before, after, role) {
  return before && after && isDeepStrictEqual({ ...before.bundles[role], source: componentSource(before, role, 'bundle') },
    { ...after.bundles[role], source: componentSource(after, role, 'bundle') });
}

function validateScope(before, after) {
  for (const name of Object.keys(before.images)) {
    if (['buster-runtime', 'namespace-controller'].includes(name)) continue;
    if (after.images[name] !== before.images[name]
      || !isDeepStrictEqual(componentSource(after, name, 'image'), componentSource(before, name, 'image'))) {
      throw new Error(`GITOPS_BUSTER_SCOPE_IMAGE_CHANGED:${name}`);
    }
  }
  for (const role of ['nova', 'prism']) {
    if (!sameCode(before.code, after.code, role)) throw new Error(`GITOPS_BUSTER_SCOPE_CODE_CHANGED:${role}`);
  }
}

function activePath(applications, group, documents) {
  const matching = applications.filter(application => application.metadata?.name === group.name);
  const application = matching[0];
  const source = application?.spec?.source;
  const projects = documents.filter(document => document.kind === 'AppProject'
    && document.metadata?.name === application?.spec?.project
    && document.metadata?.namespace === application?.metadata?.namespace);
  const repositories = projects[0]?.spec?.sourceRepos;
  if (projects.length !== 1 || typeof source?.repoURL !== 'string'
    || !Array.isArray(repositories) || !repositories.includes(source.repoURL)
    || !/^https:\/\/[a-z0-9.-]+\/[a-zA-Z0-9_./-]+\.git$/u.test(source.repoURL)) {
    throw new Error('GITOPS_ACTIVE_ROLE_REPOSITORY_INVALID');
  }
  if (matching.length !== 1 || matching[0]?.spec?.sources !== undefined
    || matching[0]?.spec?.destination?.namespace !== group.namespace
    || matching[0]?.spec?.destination?.server !== 'https://kubernetes.default.svc'
    || source?.targetRevision !== 'main' || source.directory?.include !== 'resources.yaml'
    || !new RegExp(`^releases/gitops/[a-z0-9][a-z0-9-]{0,50}/${group.role}$`, 'u').test(source.path ?? '')) throw new Error('GITOPS_ACTIVE_ROLE_PATH_INVALID');
  return source.path;
}

function validateGroup(group, directory, destination) {
  if (!isDeepStrictEqual([group.namespace, group.name, group.path, group.wave],
    [destination, `${destination}-${group.role}`, `${directory}/${group.role}`, group.role === 'nova' ? 1 : 0])
    || !Array.isArray(group.helmReleases) || !group.helmReleases.length || !group.helmReleases.every(gitOpsName)) throw new Error('GITOPS_GROUP_INVALID');
}

function inspectRetainedManifest(manifest, group, receipt) {
  validateRenderedRelease(manifest, manifest, receipt, group.role === 'prism');
  const documents = yaml.loadAll(manifest).filter(Boolean);
  const inspection = inspectGitOpsResources(documents, group.namespace);
  for (const field of ['resources', 'images', 'requiredSecrets']) {
    if (!isDeepStrictEqual(inspection[field], group[field])) throw new Error(`GITOPS_BUNDLE_INVENTORY_MISMATCH:${field}`);
  }
  if (documents.some(document => document.metadata.labels?.['kubeclaw.dev/gitops-owner'] !== group.name)) throw new Error('GITOPS_RESOURCE_OWNER_MISMATCH');
}

// Buster-only delivery freezes other roles and their effective provenance.
// Configuration changes for those roles are deliberately not rendered here.
export function retainedGitOpsGroups(root, receipt, namespace, prismNamespace) {
  const { directory, prior } = priorBundle(root);
  validateScope(prior.receipt, receipt);
  const documents = yaml.loadAll(fs.readFileSync(path.join(root, 'gitops/production/apps/applications.yaml'), 'utf8')).filter(Boolean);
  const applications = documents.filter(document => document.kind === 'Application');
  return new Map(prior.groups.filter(group => group.role !== 'buster').map(group => {
    validateGroup(group, directory, group.role === 'prism' ? prismNamespace : namespace);
    const manifest = fs.readFileSync(path.join(root, group.path, 'resources.yaml'), 'utf8');
    if (gitOpsDigest(manifest) !== group.manifestDigest
      || fs.readFileSync(path.join(root, activePath(applications, group, documents), 'resources.yaml'), 'utf8') !== manifest) throw new Error('GITOPS_MANIFEST_DIGEST_MISMATCH');
    inspectRetainedManifest(manifest, group, receipt);
    return [group.role, { manifest, group: structuredClone(group) }];
  }));
}
