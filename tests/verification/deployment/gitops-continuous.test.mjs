import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import yaml from 'js-yaml';
import { continuousDocuments, continuousApplications, renderContinuousEnvironment } from '../../../scripts/gitops-continuous.mjs';
import { gitOpsDigest, inspectGitOpsResources } from '../../../scripts/gitops-bundle.mjs';
import { planGitOpsRollback, rollbackRevision } from '../../../scripts/gitops-rollback.mjs';

test('continuous root follows the reviewed production directory without inline frozen values', () => {
  const result = { values: { repository: 'https://github.com/example/kubeclaw.git' }, documents: [
    { kind: 'AppProject', spec: { namespaceResourceWhitelist: [{ group: 'argoproj.io', kind: 'Application' }] } },
    { kind: 'Application', metadata: { namespace: 'argocd', annotations: { 'kubeclaw.dev/runtime-namespaces': '["kubeclaw"]' } },
      spec: { source: { targetRevision: 'a'.repeat(40), helm: { valuesObject: {} } }, syncPolicy: { automated: { prune: false, selfHeal: true } } } },
  ] };
  const original = structuredClone(result);
  const docs = continuousDocuments(result, 'argocd');
  assert.deepEqual(docs[1].spec.source, { repoURL: result.values.repository, targetRevision: 'main',
    path: 'gitops/production/apps', directory: { include: 'applications.yaml' } });
  assert.deepEqual(docs[0], result.documents[0]);
  assert.deepEqual(docs[1].metadata.annotations, result.documents[1].metadata.annotations);
  assert.deepEqual(docs[1].spec.syncPolicy, result.documents[1].spec.syncPolicy);
  assert.deepEqual(result, original);
  assert.throws(() => continuousDocuments(result, 'wrong'), /NAMESPACE_MISMATCH/);
});

test('child applications survive squash merges and retain immutable bundle directories and ownership', () => {
  const project = { kind: 'AppProject', spec: { sourceRepos: ['https://github.com/example/kubeclaw.git'] } };
  const app = { kind: 'Application', metadata: { annotations: { 'argocd.argoproj.io/sync-wave': '1', 'kubeclaw.dev/helm-releases': '["agent-nova"]' } },
    spec: { source: { targetRevision: 'b'.repeat(40), path: 'releases/gitops/runtime-123-1/nova', directory: { include: 'resources.yaml' } },
      syncPolicy: { automated: { prune: false, selfHeal: true } } } };
  const docs = continuousApplications([project, app].map(value => yaml.dump(value)).join('---\n'));
  assert.deepEqual(docs, [project, { ...app, spec: { ...app.spec, source: { ...app.spec.source, targetRevision: 'main' } } }]);
});

test('automatic promotion gates privileged dispatch and avoids image-less promotion loops', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/auto-promote-runtime.yaml', 'utf8'));
  assert.deepEqual(workflow.on.workflow_run.branches, ['main']);
  assert.match(workflow.jobs.propose.if, /head_repository.full_name == github.repository/);
  assert.match(workflow.jobs.propose.if, /conclusion == 'success'/);
  assert.match(workflow.jobs.propose.if, /GITOPS_ENABLED == 'true'/);
  const step = workflow.jobs.propose.steps[0];
  assert.ok(step.run.indexOf('grep -qx success') < step.run.indexOf('gh workflow run'));
  assert.ok(step.run.indexOf('gh release view') < step.run.indexOf('gh workflow run'));
  assert.ok(!workflow.jobs.propose.steps.some(item => item.uses?.startsWith('actions/checkout')));
});

test('configuration changes build matching images while generated deployments do not rebuild', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/build-images.yaml', 'utf8'));
  const filter = workflow.jobs['detect-build-inputs'].steps.find(step => step.id === 'filter');
  const paths = yaml.load(filter.with.filters).image_inputs;
  for (const file of ['charts/kubeclaw/**', 'charts/prism/**', 'my-values/**', 'gitops/production/config.json', 'gitops/production/overlays/**']) assert.ok(paths.includes(file));
  assert.ok(!paths.some(file => file.startsWith('releases/') || ['gitops/**', 'gitops/production/**'].includes(file)));
});

test('real Helm environment rendering remains identical after the bundle commit is replaced by a merge commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-gitops-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture']); return git(['rev-parse', 'HEAD']); };
  try {
    fs.cpSync('charts/gitops', path.join(root, 'charts/gitops'), { recursive: true });
    git(['init', '-q']); git(['config', 'core.autocrlf', 'false']);
    const names = ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'];
    const receipt = { schemaVersion: 1, commit: 'a'.repeat(40), sourceRunId: 1, sourceRunAttempt: 1,
      images: Object.fromEntries(names.map((name, index) => [name, `ghcr.io/example/kubeclaw-${name}@sha256:${index.toString(16).repeat(64)}`])) };
    const directory = 'releases/gitops/runtime-1-1';
    const groups = ['buster', 'prism', 'nova'].map(role => {
      const name = `agents-${role}`;
      const documents = [{ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, labels: { 'kubeclaw.dev/gitops-owner': name } },
        spec: { template: { spec: { containers: [{ name: role, image: receipt.images[role === 'buster' ? 'buster-gateway' : role === 'prism' ? 'prism-control' : 'nova'],
          env: [{ name: 'CODE_BUNDLE_ENABLED', value: 'true' }, { name: 'CODE_BUNDLE_EXPECTED_COMMIT', value: receipt.commit }, { name: 'CODE_BUNDLE_CONTRACT_VERSION', value: 'v2' }] }] } } } }];
      const inspection = inspectGitOpsResources(documents, 'agents');
      const manifest = yaml.dump(documents[0]);
      const location = `${directory}/${role}`;
      fs.mkdirSync(path.join(root, location), { recursive: true });
      fs.writeFileSync(path.join(root, location, 'resources.yaml'), manifest);
      return { role, name, namespace: 'agents', helmReleases: [name], path: location, wave: role === 'nova' ? 1 : 0, manifestDigest: gitOpsDigest(manifest), ...inspection };
    });
    fs.writeFileSync(path.join(root, directory, 'bundle.receipt'), JSON.stringify({ schemaVersion: 'kubeclaw-gitops-bundle.v1', receipt, groups }));
    fs.writeFileSync(path.join(root, 'releases/runtime-images.json'), JSON.stringify(receipt));
    fs.mkdirSync(path.join(root, 'gitops/production'), { recursive: true });
    fs.writeFileSync(path.join(root, 'gitops/production/config.json'), JSON.stringify({ argoNamespace: 'argocd' }));
    fs.writeFileSync(path.join(root, 'gitops/production/selection.json'), JSON.stringify({ directory }));
    fs.mkdirSync(path.join(root, 'releases/values'), { recursive: true });
    for (const role of ['buster', 'prism', 'prism-agent', 'nova']) fs.writeFileSync(path.join(root, `releases/values/${role}.yaml`), '# historical values\n');
    const first = commit();
    assert.throws(() => rollbackRevision(root), /NO_PREVIOUS_SELECTION/);
    assert.throws(() => rollbackRevision(root, first), /ALREADY_SELECTED/);
    assert.throws(() => rollbackRevision(root, '--all'), /MUST_BE_FULL_COMMIT/);
    const render = revision => renderContinuousEnvironment(root, directory, 'https://github.com/example/kubeclaw.git', revision, { argoNamespace: 'argocd' });
    const expected = render(first);
    const apps = yaml.loadAll(expected.files['apps/applications.yaml']).filter(document => document?.kind === 'Application');
    assert.equal(apps.length, 3);
    for (const app of apps) {
      assert.equal(app.spec.source.targetRevision, 'main');
      assert.ok(fs.existsSync(path.join(root, app.spec.source.path, 'resources.yaml')));
    }
    fs.writeFileSync(path.join(root, 'merge-marker'), 'Simulate the final merged tree');
    const second = commit();
    assert.notEqual(first, second);
    assert.deepEqual(render(second).files, expected.files);
    const nextDirectory = 'releases/gitops/runtime-2-1';
    fs.cpSync(path.join(root, directory), path.join(root, nextDirectory), { recursive: true });
    const nextReceipt = { ...receipt, sourceRunId: 2 };
    fs.writeFileSync(path.join(root, nextDirectory, 'bundle.receipt'), JSON.stringify({ schemaVersion: 'kubeclaw-gitops-bundle.v1', receipt: nextReceipt,
      groups: groups.map(group => ({ ...group, path: group.path.replace(directory, nextDirectory) })) }));
    fs.writeFileSync(path.join(root, 'releases/runtime-images.json'), JSON.stringify(nextReceipt));
    fs.writeFileSync(path.join(root, 'gitops/production/selection.json'), JSON.stringify({ directory: nextDirectory }));
    commit();
    assert.equal(rollbackRevision(root), first);
    const plan = planGitOpsRollback(root, 'https://github.com/example/kubeclaw.git');
    assert.equal(plan.revision, first);
    assert.equal(plan.directory, directory);
    assert.equal(JSON.parse(plan.files['releases/runtime-images.json']).sourceRunId, 1);
    assert.equal(Object.keys(plan.files).length, 8);
    assert.ok(!Object.keys(plan.files).some(file => file.includes('config.json') || file === 'merge-marker'));
    // Planning must not change the current selection; apply is a separate step.
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'releases/runtime-images.json'), 'utf8')).sourceRunId, 2);
    for (const [file, bytes] of Object.entries(plan.files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), bytes);
    }
    const restored = commit();
    assert.deepEqual(render(restored).files, expected.files);
    fs.appendFileSync(path.join(root, directory, 'nova/resources.yaml'), '\n# corruption');
    assert.throws(() => render(commit()), /MANIFEST_DIGEST_MISMATCH/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
