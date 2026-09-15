import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { exportGitOpsBundle, gitOpsDigest } from '../../../scripts/gitops-bundle.mjs';
import { bootstrapDocuments, readCommittedBundle, preflightGitOps } from '../../../scripts/gitops.mjs';
import { assertNoGitOpsOwner } from '../../../scripts/gitops-owner.mjs';
import { renderContinuousEnvironment } from '../../../scripts/gitops-continuous.mjs';

const source = path.resolve(import.meta.dirname, '../../..');
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-release-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const commit = message => { git(['add', '.']); git(['-c', 'user.name=GitOps Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', message]); return git(['rev-parse', 'HEAD']); };
  try {
    for (const directory of ['charts', 'my-values', 'scripts']) fs.cpSync(path.join(source, directory), path.join(root, directory), { recursive: true });
    fs.symlinkSync(path.join(source, 'node_modules'), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n');
    const policy = yaml.load(fs.readFileSync(path.join(root, 'my-values/infra/native-worker-pools.yaml'), 'utf8'));
    policy.nodeName = 'native-render-test'; policy.pools.buster.namespace = 'agents'; policy.pools.prism.namespace = 'agents';
    fs.writeFileSync(path.join(root, 'my-values/infra/native-worker-pools.yaml'), yaml.dump(policy));
    git(['init', '-q']); const sourceCommit = commit('Actual source configuration fixture');
    fs.mkdirSync(path.join(root, 'releases'));
    const names = ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'];
    const images = Object.fromEntries(names.map((name, index) => [name, `ghcr.io/datrab/kubeclaw-${name}@sha256:${index.toString(16).repeat(64)}`]));
    fs.writeFileSync(path.join(root, 'releases/runtime-images.json'), JSON.stringify({ schemaVersion: 1, commit: sourceCommit, sourceRunId: 123, sourceRunAttempt: 1, images }));
    execFileSync(process.execPath, ['scripts/updates/materialize-release.mjs', '--family=runtime'], { cwd: root });
    const buster = path.join(root, 'registry.yaml'), prism = path.join(root, 'native.yaml');
    fs.writeFileSync(buster, yaml.dump({ runtimeInfrastructure: { registry: { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' } } }));
    fs.writeFileSync(prism, yaml.dump({ worker: { native: { nodeName: 'native-render-test', namespace: 'agents', policyDigest: nativePoolPolicy(policy, 'prism').policyDigest } } }));
    const env = { ...process.env, CODE_BUNDLE_GITHUB_REPOSITORY: 'datrab/kubeclaw', BUSTER_VALUES_FILE: buster, PRISM_VALUES_FILE: prism };
    run({ root, git, commit, sourceCommit, images, env });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const directory = 'releases/gitops/reviewed-test';
const url = 'https://github.com/datrab/kubeclaw.git';

test('real selected-release renderer exports immutable groups and bootstraps a committed app-of-apps', context => fixture(({ root, commit, sourceCommit, env }) => {
  const bundle = exportGitOpsBundle(root, directory, 'agents', 'agents', env);
  assert.equal(bundle.receipt.commit, sourceCommit);
  assert.deepEqual(bundle.groups.map(group => group.role), ['buster', 'prism', 'nova']);
  assert.ok(bundle.groups.every(group => group.images.length > 0 && group.requiredSecrets.length > 0));
  const prismDocs = yaml.loadAll(fs.readFileSync(path.join(root, directory, 'prism/resources.yaml'), 'utf8')).filter(Boolean);
  const migration = prismDocs.find(doc => doc.kind === 'Job' && doc.metadata.name === 'prism-migrate');
  for (const deployment of prismDocs.filter(doc => doc.kind === 'Deployment')) {
    assert.ok(Number(deployment.metadata.annotations?.['argocd.argoproj.io/sync-wave'] ?? 0) > Number(migration.metadata.annotations['argocd.argoproj.io/sync-wave']), deployment.metadata.name);
  }
  assert.throws(() => exportGitOpsBundle(root, directory, 'agents', 'agents', env), /ALREADY_EXISTS/);
  const revision = commit('Reviewed immutable manifests');
  const result = bootstrapDocuments(root, directory, url, revision, 'argocd');
  const continuous = renderContinuousEnvironment(root, directory, url, revision, { argoNamespace: 'argocd' });
  const continuousApps = yaml.loadAll(continuous.files['apps/applications.yaml']).filter(document => document?.kind === 'Application');
  assert.equal(continuousApps.length, 3);
  for (const app of continuousApps) {
    assert.equal(app.spec.source.targetRevision, 'main');
    assert.ok(app.spec.source.path.startsWith(`${directory}/`));
    assert.ok(fs.existsSync(path.join(root, app.spec.source.path, 'resources.yaml')));
  }
  for (const [name, bytes] of Object.entries(continuous.files)) {
    const file = path.join(root, 'gitops/production', name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  }
  const mergedRevision = commit('Environment files committed with a different revision');
  assert.notEqual(mergedRevision, revision);
  assert.deepEqual(renderContinuousEnvironment(root, directory, url, mergedRevision, { argoNamespace: 'argocd' }).files, continuous.files);
  assert.equal(result.documents[1].spec.source.targetRevision, revision);
  const file = path.join(root, 'gitops-values.yaml'); fs.writeFileSync(file, yaml.dump(result.values));
  const rendered = execFileSync(process.env.HELM_BIN ?? 'helm', ['template', 'runtime', 'charts/gitops', '-n', 'argocd', '-f', file], { cwd: root, encoding: 'utf8' });
  const docs = yaml.loadAll(rendered).filter(Boolean), apps = docs.filter(doc => doc.kind === 'Application');
  assert.equal(apps.length, 3);
  if (process.env.ARGO_RENDERED_CRDS) {
    const crds = yaml.loadAll(fs.readFileSync(process.env.ARGO_RENDERED_CRDS, 'utf8')).filter(doc => doc?.kind === 'CustomResourceDefinition');
    const ajv = new Ajv({ strict: false, validateFormats: false });
    for (const document of [...docs, ...result.documents]) {
      const crd = crds.find(crd => crd.spec.names.kind === document.kind);
      assert.ok(crd, document.kind);
      const schema = crd.spec.versions.find(version => version.name === document.apiVersion.split('/')[1]).schema.openAPIV3Schema;
      const valid = ajv.compile(schema);
      assert.ok(valid(document), JSON.stringify(valid.errors));
    }
    context.diagnostic('All generated Applications and Projects validate against the original pinned Argo CRDs');
  }
  assert.deepEqual(apps.map(app => app.metadata.annotations['argocd.argoproj.io/sync-wave']), ['0', '0', '1']);
  for (const app of apps) {
    assert.equal(app.spec.source.targetRevision, revision);
    assert.equal(app.spec.source.directory.include, 'resources.yaml');
    assert.equal(app.spec.syncPolicy.automated.prune, false);
    assert.equal(app.spec.syncPolicy.automated.selfHeal, true);
    assert.deepEqual(app.spec.syncPolicy.syncOptions, ['FailOnSharedResource=true']);
    assert.equal(app.metadata.finalizers, undefined);
  }
  const project = docs.find(doc => doc.kind === 'AppProject');
  assert.ok(project.spec.clusterResourceWhitelist.some(entry => entry.kind === 'CustomResourceDefinition'));
  assert.ok(!project.spec.namespaceResourceWhitelist.some(entry => ['Secret', '*', 'Application'].includes(entry.kind)));
  assert.throws(() => bootstrapDocuments(root, directory, url, 'main', 'argocd'), /MUST_BE_COMMIT/);
  assert.throws(() => bootstrapDocuments(root, directory, 'https://token@github.com/datrab/kubeclaw.git', revision, 'argocd'), /INVALID/);
  fs.appendFileSync(path.join(root, 'charts/gitops/values.yaml'), '\n# local drift\n');
  assert.throws(() => readCommittedBundle(root, directory, revision), /CHART_DRIFT/);
}));

test('imperative ownership guard fails closed and permits only other namespaces', () => {
  const invoke = (items, release = 'agent-nova') => assertNoGitOpsOwner('agents', release, args => JSON.stringify(args[1] === 'crd' ? {} : { items }));
  invoke([]);
  const app = { metadata: { name: 'agents-nova', annotations: { 'kubeclaw.dev/helm-releases': '["agent-nova"]' } }, spec: { destination: { namespace: 'agents' } } };
  assert.throws(() => invoke([app]), /OWNER_PRESENT/);
  assert.throws(() => invoke([app], 'agent-buster'), /OWNER_PRESENT/);
  assert.throws(() => invoke([app], '*'), /OWNER_PRESENT/);
  delete app.metadata.annotations['kubeclaw.dev/helm-releases'];
  assert.throws(() => invoke([app], 'agent-buster'), /OWNER_PRESENT/);
  assert.throws(() => assertNoGitOpsOwner('agents', 'agent-nova', () => { throw new Error('Forbidden'); }), /Forbidden/);
  assertNoGitOpsOwner('agents', 'agent-nova', args => args[1] === 'crd' ? '' : '{"items":[]}');
});

test('committed bundle corruption, switched selection and hidden image changes fail before activation', () => fixture(({ root, commit, env }) => {
  const bundle = exportGitOpsBundle(root, directory, 'agents', 'agents', env);
  const receiptFile = path.join(root, directory, 'bundle.receipt');
  const manifestFile = path.join(root, directory, 'nova/resources.yaml');
  const original = fs.readFileSync(manifestFile, 'utf8');
  fs.appendFileSync(manifestFile, '\n# changed after export\n');
  assert.throws(() => readCommittedBundle(root, directory, commit('Corrupt release fixture')), /MANIFEST_DIGEST_MISMATCH/);
  fs.writeFileSync(manifestFile, original);
  const selectionFile = path.join(root, 'releases/runtime-images.json'), selection = JSON.parse(fs.readFileSync(selectionFile));
  fs.writeFileSync(selectionFile, JSON.stringify({ ...selection, sourceRunId: 456 }));
  assert.throws(() => readCommittedBundle(root, directory, commit('Switched receipt fixture')), /SELECTED_RECEIPT_MISMATCH/);
  fs.writeFileSync(selectionFile, JSON.stringify(selection));
  const changed = original.replace(bundle.receipt.images.nova, `ghcr.io/datrab/kubeclaw-nova@sha256:${'f'.repeat(64)}`);
  assert.notEqual(changed, original);
  fs.writeFileSync(manifestFile, changed);
  bundle.groups.find(group => group.role === 'nova').manifestDigest = gitOpsDigest(changed);
  fs.writeFileSync(receiptFile, JSON.stringify(bundle));
  assert.throws(() => readCommittedBundle(root, directory, commit('Concealed unselected image fixture')), /Unselected first-party image/);
}));

test('activation preflight requires Secrets, sole ownership, native binding and actual host preflight entrypoint', () => fixture(({ root, commit, env }) => {
  exportGitOpsBundle(root, directory, 'agents', 'agents', env);
  const result = bootstrapDocuments(root, directory, url, commit('Preflight release fixture'), 'argocd');
  const health = fs.readFileSync(path.join(root, 'charts/gitops/files/application-health.lua'), 'utf8');
  const cases = { rootOwner: null, existing: null, releases: [], apps: [], missingSecret: false, hostError: false, health };
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === process.execPath) { if (cases.hostError) throw new Error('NATIVE_HOST_NOT_READY'); return '{}'; }
    if (command === 'helm') return JSON.stringify(cases.releases);
    assert.equal(command, 'kubectl'); assert.equal(args[0], 'get', 'preflight must be read-only');
    if (args[1] === 'configmap') return JSON.stringify({ data: { 'application.resourceTrackingMethod': 'annotation', 'resource.customizations.health.argoproj.io_Application': cases.health } });
    if (args[1] === 'applications.argoproj.io') return JSON.stringify({ items: cases.apps });
    if (args[1] === 'secret') {
      const keys = result.bundle.groups.filter(group => group.namespace === args[4]).flatMap(group => group.requiredSecrets.filter(secret => secret.name === args[2]).flatMap(secret => secret.keys));
      return JSON.stringify({ data: Object.fromEntries(keys.map(key => [key, cases.missingSecret ? '' : 'Zml4dHVyZQ=='])) });
    }
    if (['Application.argoproj.io', 'AppProject.argoproj.io'].includes(args[1])) return cases.rootOwner ? JSON.stringify(cases.rootOwner) : '';
    if (args.includes('--ignore-not-found')) return cases.existing ? JSON.stringify(cases.existing) : '';
    return '{}';
  };
  preflightGitOps(root, result, 'argocd', run);
  assert.ok(calls.some(call => call[0] === process.execPath && call[1].endsWith('/scripts/native-worker-node-preflight.mjs')));
  assert.ok(calls.some(call => call[2] === 'namespace' && call[3] === 'tailscale'));
  cases.rootOwner = { metadata: { labels: {} } };
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /BOOTSTRAP_OWNER_CONFLICT/); cases.rootOwner = null;
  cases.releases = [{ name: 'agent-buster' }];
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /HELM_OWNER_PRESENT/); cases.releases = [];
  cases.apps = [{ metadata: { name: 'unrelated' }, spec: { destination: { namespace: 'agents' } } }];
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /OTHER_APPLICATION_PRESENT/);
  cases.apps = [{ metadata: { name: 'other-root', namespace: 'argocd', annotations: {
    'kubeclaw.dev/runtime-namespaces': '["agents"]',
  } }, spec: { destination: { namespace: 'argocd' } } }];
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /OTHER_APPLICATION_PRESENT/);
  cases.apps = result.bundle.groups.map(group => ({ metadata: { name: group.name, namespace: 'argocd' }, spec: { project: result.values.project, destination: { namespace: group.namespace } } }));
  cases.apps.push(result.documents.find(document => document.kind === 'Application'));
  preflightGitOps(root, result, 'argocd', run);
  cases.missingSecret = true;
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /SECRET_KEY_MISSING/); cases.missingSecret = false;
  cases.existing = { metadata: { annotations: { 'meta.helm.sh/release-name': 'old-release' } } };
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /EXISTING_RESOURCE_OWNER/);
  cases.existing = { metadata: {} };
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /UNMANAGED_EXISTING_RESOURCE/); cases.existing = null;
  cases.health = 'return {status="Healthy"}';
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /HEALTH_OR_TRACKING/); cases.health = health;
  cases.hostError = true;
  assert.throws(() => preflightGitOps(root, result, 'argocd', run), /NATIVE_HOST_NOT_READY/);
}));

test('root claim and retained workload tracking block imperative adoption after partial GitOps transitions', () => {
  const run = (items, workloads) => args => JSON.stringify(args[1] === 'crd' ? {} : { items: args[1] === 'applications.argoproj.io' ? items : workloads });
  const rootApp = { metadata: { name: 'agents-runtime', annotations: { 'kubeclaw.dev/runtime-namespaces': '["agents"]' } }, spec: { destination: { namespace: 'argocd' } } };
  assert.throws(() => assertNoGitOpsOwner('agents', '*', run([rootApp], [])), /OWNER_PRESENT/);
  const retained = { metadata: { annotations: { 'argocd.argoproj.io/tracking-id': 'agents-nova:apps/Deployment:agents/agent-nova' } } };
  assert.throws(() => assertNoGitOpsOwner('agents', '*', run([], [retained])), /RETAINED_RESOURCE_OWNER/);
  assert.throws(() => assertNoGitOpsOwner('agents', '*', args => {
    assert.notEqual(args[1], 'applications.argoproj.io', 'deleted CRD cannot be queried');
    return args[1] === 'crd' ? '' : JSON.stringify({ items: [retained] });
  }), /RETAINED_RESOURCE_OWNER/);
  assertNoGitOpsOwner('other-agents', '*', run([rootApp], []));
});

test('original runtime teardown commands stop before any Helm mutation when Argo owns the namespace', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-teardown-'));
  try {
    const bin = path.join(temporary, 'bin'); fs.mkdirSync(bin);
    const log = path.join(temporary, 'helm-called');
    const applications = { items: [{ metadata: { name: 'agents-runtime', annotations: { 'kubeclaw.dev/runtime-namespaces': '["agents"]' } }, spec: { destination: { namespace: 'argocd' } } }] };
    fs.writeFileSync(path.join(bin, 'kubectl'), `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]!=='get')throw Error('Unexpected mutation');process.stdout.write(JSON.stringify(a[1]==='crd'?{}:${JSON.stringify(applications)}));\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'helm'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(log)},'unexpected');process.exit(99);\n`, { mode: 0o755 });
    for (const command of ['teardown-agents', 'teardown-prism']) {
      assert.throws(() => execFileSync('bash', [path.join(source, 'scripts/deploy.sh'), command], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NAMESPACE: 'agents', PRISM_NAMESPACE: 'agents' },
      }), error => /GITOPS_OWNER_PRESENT/.test(error.stderr));
    }
    assert.equal(fs.existsSync(log), false);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
