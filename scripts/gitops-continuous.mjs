#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { bootstrapDocuments, preflightGitOps } from './gitops.mjs';
import { exportGitOpsBundle, gitOpsName } from './gitops-bundle.mjs';

const environment = 'gitops/production';
const root = path.resolve(import.meta.dirname, '..');
const dump = documents => documents.map(document => yaml.dump(document, { noRefs: true, lineWidth: 120 })).join('---\n');

export function continuousDocuments(result, namespace) {
  const documents = structuredClone(result.documents);
  const application = documents.find(document => document.kind === 'Application');
  application.spec.source = { repoURL: result.values.repository, targetRevision: 'main',
    path: `${environment}/apps`, directory: { include: 'applications.yaml' } };
  if (application.metadata.namespace !== namespace) throw new Error('GITOPS_ARGO_NAMESPACE_MISMATCH');
  return documents;
}

export function continuousApplications(manifest) {
  const documents = yaml.loadAll(manifest).filter(Boolean);
  for (const document of documents) {
    if (document.kind === 'Application') {
      // Unique bundle directories survive later promotions. Tracking main also
      // survives squash merges; no transient PR commit needs to stay reachable.
      document.spec.source.targetRevision = 'main';
    }
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

export function renderContinuousEnvironment(repository, directory, url, revision, config) {
  const result = bootstrapDocuments(repository, directory, url, revision, config.argoNamespace, config.naming);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-continuous-'));
  try {
    const values = path.join(temporary, 'values.yaml');
    fs.writeFileSync(values, yaml.dump(result.values));
    const rendered = execFileSync('helm', ['template', 'runtime', path.join(repository, 'charts/gitops'),
      '-n', config.argoNamespace, '-f', values], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { result: { ...result, documents: continuousDocuments(result, config.argoNamespace) },
      files: { 'apps/applications.yaml': dump(continuousApplications(rendered)),
        'bootstrap.yaml': dump(continuousDocuments(result, config.argoNamespace)),
        'selection.json': JSON.stringify({ directory }, null, 2) + '\n' } };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

export function exportContinuousBundle(repository, directory, config, env = process.env) {
  const variables = { ...env };
  const names = { buster: 'BUSTER_VALUES_FILE', nova: 'NOVA_VALUES_FILE', prism: 'PRISM_VALUES_FILE', 'prism-agent': 'PRISM_AGENT_VALUES_FILE' };
  for (const [role, relative] of Object.entries(config.overlays ?? {})) {
    if (!names[role] || typeof relative !== 'string' || !relative.startsWith('gitops/production/overlays/')
      || relative.split('/').includes('..') || !fs.existsSync(path.join(repository, relative))) throw new Error(`GITOPS_OVERLAY_INVALID:${role}`);
    variables[names[role]] = path.join(repository, relative);
  }
  return exportGitOpsBundle(repository, directory, config.namespace, config.prismNamespace, variables);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, directory, url, revision] = process.argv.slice(2);
    const config = configuration(root);
    if (command === 'export' && directory && !url) exportContinuousBundle(root, directory, config);
    else if (['prepare', 'check', 'preflight', 'apply'].includes(command) && directory && url && revision) {
      const { result, files } = renderContinuousEnvironment(root, directory, url, revision, config);
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
    } else throw new Error('Usage: gitops-continuous.mjs export releases/gitops/NAME | prepare|check|preflight|apply releases/gitops/NAME HTTPS_REPOSITORY COMMIT');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
