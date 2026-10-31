#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { retainedGitOpsGroups } from './gitops-buster-scope.mjs';
import { retainedBaseline } from './updates/retained-baseline.mjs';
import { bootstrapDocuments, preflightGitOps } from './gitops.mjs';
import { exportGitOpsBundle, gitOpsName } from './gitops-bundle.mjs';

const environment = 'gitops/production';
const root = path.resolve(import.meta.dirname, '..');
const dump = documents => documents.map(document => yaml.dump(document, { noRefs: true, lineWidth: 120 })).join('---\n');

export function continuousDocuments(result, namespace, config = {}) {
  const documents = structuredClone(result.documents);
  const application = documents.find(document => document.kind === 'Application');
  application.spec.source = { repoURL: result.values.repository, targetRevision: 'main',
    path: `${environment}/apps`, directory: { include: 'applications.yaml' } };
  if (application.metadata.namespace !== namespace) throw new Error('GITOPS_ARGO_NAMESPACE_MISMATCH');
  // During registration, apply definitions together without starting a root
  // sync operation that would wait indefinitely on unsynced manual children.
  if (config.runtimeAutoSync === false) delete application.spec.syncPolicy.automated;
  return documents;
}

export function continuousApplications(manifest, config = {}) {
  if (config.runtimeAutoSync !== undefined && typeof config.runtimeAutoSync !== 'boolean') throw new Error('GITOPS_AUTOSYNC_CONFIG_INVALID');
  const documents = yaml.loadAll(manifest).filter(Boolean);
  for (const document of documents) {
    if (document.kind === 'Application') {
      // Unique bundle directories survive later promotions. Tracking main also
      // survives squash merges; no transient PR commit needs to stay reachable.
      document.spec.source.targetRevision = 'main';
      // Health can reuse a successful sync after unrelated main commits only
      // for the unique release paths produced by the immutable bundle exporter.
      const annotations = document.metadata.annotations ??= {};
      delete annotations['kubeclaw.dev/immutable-bundle-path'];
      if (/^releases\/gitops\/[a-z0-9][a-z0-9-]{0,50}\/(buster|nova|prism)$/u.test(document.spec.source.path ?? '')
        && document.spec.source.directory?.include === 'resources.yaml') {
        annotations['kubeclaw.dev/immutable-bundle-path'] = document.spec.source.path;
      }
      if (config.runtimeAutoSync === false) {
        delete document.spec.syncPolicy.automated;
        // Register all children together, even before any workload is healthy.
        document.metadata.annotations['argocd.argoproj.io/sync-wave'] = '0';
      }
    }
  }
  return documents;
}

// Network-only recovery is independent of immutable runtime image receipts.
// Keep this explicit so routine runtime promotions cannot drop the access path.
export function appendPrismControlAccess(documents, config, repository) {
  if (config.prismControlAccess !== true) return documents;
  if (config.namespace !== 'kubeclaw' || config.prismNamespace !== 'kubeclaw') throw new Error('PRISM_CONTROL_ACCESS_NAMESPACE_MISMATCH');
  return [...documents, {
    apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
    metadata: { name: `${config.naming.rootName}-prism-control-access`, namespace: config.argoNamespace },
    spec: {
      project: config.naming.workloadProject,
      source: { repoURL: repository, targetRevision: 'main',
        path: 'gitops/production/prism-control-access', directory: { include: 'resources.yaml' } },
      destination: { server: 'https://kubernetes.default.svc', namespace: config.namespace },
      syncPolicy: { automated: { prune: false, selfHeal: true, allowEmpty: false }, syncOptions: ['FailOnSharedResource=true'] },
    },
  }];
}

// Keep an unchanged child's immutable path. A promotion of another role must
// not create an Argo sync for byte-identical resources.
export function retainUnchangedApplications(repository, documents) {
  const file = path.join(repository, environment, 'apps/applications.yaml');
  if (!fs.existsSync(file)) return documents;
  const prior = yaml.loadAll(fs.readFileSync(file, 'utf8')).filter(Boolean);
  for (const application of documents.filter(document => document.kind === 'Application')) {
    const old = prior.find(document => document.kind === 'Application' && document.metadata?.name === application.metadata.name
      && document.metadata?.namespace === application.metadata.namespace);
    const before = old?.spec?.source, after = application.spec.source;
    const allowed = value => /^releases\/gitops\/[a-z0-9][a-z0-9-]{0,50}\/(buster|nova|prism)$/u.exec(value ?? '');
    const oldRole = allowed(before?.path)?.[1], newRole = allowed(after.path)?.[1];
    if (!oldRole || oldRole !== newRole || before.repoURL !== after.repoURL || before.targetRevision !== 'main'
      || before.directory?.include !== 'resources.yaml' || after.directory?.include !== 'resources.yaml') continue;
    const previous = path.join(repository, before.path, 'resources.yaml');
    const current = path.join(repository, after.path, 'resources.yaml');
    if (!fs.existsSync(previous) || !fs.existsSync(current)
      || !fs.readFileSync(previous).equals(fs.readFileSync(current))) continue;
    after.path = before.path;
    application.metadata.annotations['kubeclaw.dev/immutable-bundle-path'] = before.path;
  }
  return documents;
}

// Explicit policy baseline authenticates separately in CI; this gate also
// validates active manifests before retaining only their immutable paths.
export function retainBaselineApplications(repository, documents, config, directory) {
  const baseline = retainedBaseline(repository, directory);
  if (!baseline) return documents;
  const groups = retainedGitOpsGroups(repository, { ...baseline.runtime, code: baseline.code },
    config.namespace, config.prismNamespace, directory);
  const active = yaml.loadAll(fs.readFileSync(path.join(repository, environment, 'apps/applications.yaml'), 'utf8')).filter(Boolean);
  for (const { group } of groups.values()) {
    const current = active.find(item => item.kind === 'Application' && item.metadata?.name === group.name);
    const rendered = documents.find(item => item.kind === 'Application' && item.metadata?.name === group.name);
    if (!rendered) throw new Error('GITOPS_ACTIVE_ROLE_APPLICATION_MISSING');
    rendered.spec.source.path = current.spec.source.path;
    rendered.metadata.annotations['kubeclaw.dev/immutable-bundle-path'] = current.spec.source.path;
  }
  return documents;
}

function configuration(repository) {
  const config = JSON.parse(fs.readFileSync(path.join(repository, environment, 'config.json'), 'utf8'));
  for (const field of ['namespace', 'prismNamespace', 'argoNamespace']) {
    if (!gitOpsName(config[field])) throw new Error(`GITOPS_CONFIG_INVALID:${field}`);
  }
  return config;
}

// Maintained household definitions survive generated runtime bundle promotions.
export function appendHouseholdApplications(repository, documents, namespace) {
  const file = path.join(repository, environment, 'household-applications.yaml');
  if (!fs.existsSync(file)) return documents;
  const additional = yaml.loadAll(fs.readFileSync(file, 'utf8')).filter(Boolean);
  const identities = new Set(documents.map(d => `${d.kind}/${d.metadata?.namespace}/${d.metadata?.name}`));
  for (const document of additional) {
    const identity = `${document.kind}/${document.metadata?.namespace}/${document.metadata?.name}`;
    if (!['Application', 'AppProject'].includes(document.kind)
      || document.apiVersion !== 'argoproj.io/v1alpha1' || document.metadata?.namespace !== namespace
      || !gitOpsName(document.metadata?.name) || identities.has(identity)
      || (document.kind === 'Application' && (document.spec?.syncPolicy?.automated || document.operation))) {
      throw new Error('GITOPS_HOUSEHOLD_APPLICATION_INVALID');
    }
    identities.add(identity);
  }
  return [...documents, ...additional];
}

export function renderContinuousEnvironment(repository, directory, url, revision, config, baselineDirectory) {
  const result = bootstrapDocuments(repository, directory, url, revision, config.argoNamespace, config.naming);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-continuous-'));
  try {
    const values = path.join(temporary, 'values.yaml');
    fs.writeFileSync(values, yaml.dump(result.values));
    const rendered = execFileSync('helm', ['template', 'runtime', path.join(repository, 'charts/gitops'),
      '-n', config.argoNamespace, '-f', values], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { result: { ...result, documents: continuousDocuments(result, config.argoNamespace, config) },
      files: { 'apps/applications.yaml': dump(appendPrismControlAccess(appendHouseholdApplications(repository, retainUnchangedApplications(repository, retainBaselineApplications(repository, continuousApplications(rendered, config), config, baselineDirectory)), config.argoNamespace), config, url)),
        'bootstrap.yaml': dump(continuousDocuments(result, config.argoNamespace, config)),
        'selection.json': JSON.stringify({ directory }, null, 2) + '\n' } };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

export function exportContinuousBundle(repository, directory, config, env = process.env, scope = 'all') {
  const variables = { ...env };
  const names = { buster: 'BUSTER_VALUES_FILE', nova: 'NOVA_VALUES_FILE', prism: 'PRISM_VALUES_FILE', 'prism-agent': 'PRISM_AGENT_VALUES_FILE' };
  for (const [role, relative] of Object.entries(config.overlays ?? {})) {
    if (!names[role] || typeof relative !== 'string' || !relative.startsWith('gitops/production/overlays/')
      || relative.split('/').includes('..') || !fs.existsSync(path.join(repository, relative))) throw new Error(`GITOPS_OVERLAY_INVALID:${role}`);
    variables[names[role]] = path.join(repository, relative);
  }
  return exportGitOpsBundle(repository, directory, config.namespace, config.prismNamespace, { ...variables, GITOPS_EXPORT_SCOPE: scope });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, directory, url, revision] = process.argv.slice(2);
    const config = configuration(root);
    if (['export', 'export-buster'].includes(command) && directory && !url) exportContinuousBundle(root, directory, config, undefined, command === 'export-buster' ? 'buster' : 'all');
    else if (['prepare', 'check', 'preflight', 'apply'].includes(command) && directory && url && revision) {
      const { result, files } = renderContinuousEnvironment(root, directory, url, revision, config, command === 'check' ? process.env.GITOPS_RETAINED_BASELINE : undefined);
      if (command === 'prepare' || command === 'check') {
        for (const [relative, bytes] of Object.entries(files)) {
          const file = path.join(root, environment, relative);
          if (command === 'check') {
            if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== bytes) throw new Error(`GITOPS_ENVIRONMENT_DRIFT:${relative}`);
          } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
        }
      } else {
        preflightGitOps(root, result, config.argoNamespace);
        if (command === 'apply') process.stdout.write(execFileSync('kubectl', ['apply', '-f', '-'],
          { input: dump(result.documents), encoding: 'utf8', timeout: 60000 }));
      }
    } else throw new Error('Usage: gitops-continuous.mjs export|export-buster releases/gitops/NAME | prepare|check|preflight|apply releases/gitops/NAME HTTPS_REPOSITORY COMMIT');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
