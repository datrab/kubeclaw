import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { selectedCode, validateCodeReceipt } from '../../../scripts/updates/code-release.mjs';
import { isImageInput, isDeploymentInput, inputDigest } from '../../../scripts/updates/runtime-inputs.mjs';
import { selectedRelease, validateRenderedRelease } from '../../../scripts/updates/deployment-release.mjs';

test('deploy bundle fields decode folded URLs and preserve overlay credential selection', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-fields-'));
  try {
    const base = path.join(dir, 'base.yaml');
    const overlay = path.join(dir, 'overlay.yaml');
    const url = 'https://github.com/datrab/kubeclaw/releases/download/code-bundles-123-2/prism.tgz';
    fs.writeFileSync(base, `codeBundle:\n  archiveUrl: >-\n    ${url}\n  auth:\n    existingSecret: base-reader\n    existingSecretKey: token\n`);
    fs.writeFileSync(overlay, 'codeBundle:\n  auth:\n    existingSecret: private-reader\n');
    const script = fs.readFileSync('scripts/deploy.sh', 'utf8');
    const fn = script.slice(script.indexOf('bundle_values_field() {'), script.indexOf('\nrequire_selected_runtime()'));
    const read = (...args) => execFileSync('bash', ['-c', `${fn}\nbundle_values_field "$@"`, 'test', base, overlay, ...args], {
      env: { ...process.env, REPO_DIR: process.cwd().replaceAll('\\', '/') }, encoding: 'utf8',
    }).trim();
    assert.equal(read('archiveUrl'), url);
    assert.equal(read('auth', 'existingSecret'), 'private-reader');
    assert.equal(read('auth', 'existingSecretKey'), 'token');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function code(commit) {
  return { schemaVersion: 1, commit, sourceRunId: 123, sourceRunAttempt: 2,
    bundles: Object.fromEntries(['nova', 'buster', 'prism'].map(role => [role, {
      url: `https://github.com/datrab/kubeclaw/releases/download/code-bundles-123-2/${role}-${commit}.tgz`,
      sha256: 'a'.repeat(64), contractVersion: 'v2',
    }])) };
}
test('agent changes and manifest changes do not rebuild tools; embedded service code does', () => {
  for (const file of ['skills/nova/core/execution/engine.ts', 'skills/buster/engine/judge.ts',
    'skills/common/plugins/artifact-store/src/adapter.ts', 'my-values/nova-values.yaml', 'charts/kubeclaw/values.yaml']) {
    assert.equal(isImageInput(file), false, file); assert.equal(isDeploymentInput(file), true, file);
  }
  for (const file of ['docker/Dockerfile.nova', 'package-lock.json', 'skills/nova/package.json',
    'skills/prism/server/worker.ts', 'skills/worker/core/worker/native-worker-launcher.c', 'contracts/worker/v1.ts']) {
    assert.equal(isImageInput(file), true, file);
  }
  for (const file of ['docs/ops/readme.md', 'releases/runtime-code.json', 'gitops/production/apps/applications.yaml']) {
    assert.equal(isDeploymentInput(file), false, file);
  }
});
test('code selection reuses images only across unchanged image inputs, including deleted inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-selection-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const write = (file, bytes) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), bytes); };
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'selection']); return git(['rev-parse', 'HEAD']); };
  try {
    git(['init', '-q']); git(['config', 'core.autocrlf', 'false']);
    write('docker/Dockerfile.nova', 'FROM pinned-base\n'); write('skills/nova/core/engine.ts', 'old');
    const imageCommit = commit();
    write('skills/nova/core/engine.ts', 'new'); write('charts/kubeclaw/values.yaml', 'replicas: 1\n');
    const codeCommit = commit();
    const receipt = code(codeCommit); write('releases/runtime-code.json', JSON.stringify(receipt));
    assert.deepEqual(selectedCode(root, { commit: imageCommit }), receipt);
    assert.notEqual(inputDigest(root, imageCommit, isDeploymentInput), inputDigest(root, codeCommit, isDeploymentInput));
    fs.unlinkSync(path.join(root, 'docker/Dockerfile.nova')); const changed = commit();
    write('releases/runtime-code.json', JSON.stringify(code(changed)));
    assert.throws(() => selectedCode(root, { commit: imageCommit }), /REQUIRES_NEW_IMAGES/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('bundle selection rejects missing hashes, mutable URLs and wrong role archives', () => {
  const receipt = code('b'.repeat(40)); validateCodeReceipt(receipt);
  for (const change of [r => { delete r.bundles.nova.sha256; }, r => { r.bundles.nova.url = r.bundles.buster.url; },
    r => { r.bundles.nova.url = 'https://example.test/latest.tgz'; }, r => { delete r.bundles.prism; }]) {
    const changed = structuredClone(receipt); change(changed); assert.throws(() => validateCodeReceipt(changed));
  }
});
test('push detector rebuilds an environment changed by an earlier unselected build', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-build-retry-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'change']); return git(['rev-parse', 'HEAD']); };
  try {
    git(['init', '-q']); git(['config', 'core.autocrlf', 'false']);
    fs.mkdirSync(path.join(root, 'docker')); fs.mkdirSync(path.join(root, 'skills/nova'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docker/Dockerfile.nova'), 'old environment'); const selected = commit();
    fs.writeFileSync(path.join(root, 'docker/Dockerfile.nova'), 'new environment'); const before = commit();
    fs.writeFileSync(path.join(root, 'skills/nova/engine.ts'), 'new code'); const head = commit();
    fs.mkdirSync(path.join(root, 'releases'));
    const selection = path.join(root, 'releases/runtime-images.json');
    const event = path.join(root, 'event.json'), output = path.join(root, 'output');
    fs.writeFileSync(event, JSON.stringify({ before }));
    const run = imageCommit => {
      fs.writeFileSync(selection, JSON.stringify({ commit: imageCommit })); fs.writeFileSync(output, '');
      execFileSync(process.execPath, [path.resolve('scripts/updates/runtime-inputs.mjs')], { cwd: root,
        env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head, GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output } });
      return fs.readFileSync(output, 'utf8');
    };
    assert.match(run(selected), /image_inputs=true\ndeployment_inputs=true/);
    assert.match(run(before), /image_inputs=false\ndeployment_inputs=true/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('actual bootstrap checksum command rejects modified downloads before extraction', () => {
  const chart = fs.readFileSync('charts/kubeclaw/templates/deployment.yaml', 'utf8');
  const check = chart.match(/if \[ -n "\$\{CODE_BUNDLE_SHA256\}" \]; then[\s\S]*?\n\s*fi/u)?.[0];
  assert.ok(check);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-checksum-'));
  try {
    const bytes = Buffer.from('selected archive bytes');
    fs.writeFileSync(path.join(root, 'bundle.tgz'), bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const run = () => spawnSync('bash', ['-c', `${check}\necho extraction-allowed`], { cwd: root, encoding: 'utf8',
      env: { ...process.env, CODE_BUNDLE_SHA256: sha256, BUNDLE_ARCHIVE: 'bundle.tgz' } });
    const accepted = run(); assert.equal(accepted.status, 0, accepted.stderr); assert.match(accepted.stdout, /extraction-allowed/);
    fs.writeFileSync(path.join(root, 'bundle.tgz'), 'modified archive');
    const rejected = run(); assert.notEqual(rejected.status, 0); assert.doesNotMatch(rejected.stdout, /extraction-allowed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('rendered code updates retain image digests and require selected URL, role, hash and revision', () => {
  const receipt = { commit: 'c'.repeat(40), images: { nova: `ghcr.io/datrab/kubeclaw-nova@sha256:${'d'.repeat(64)}` }, code: code('b'.repeat(40)) };
  const env = [ ['AGENT_NAME', 'nova'], ['CODE_BUNDLE_ENABLED', 'true'], ['CODE_BUNDLE_ARCHIVE_URL', receipt.code.bundles.nova.url],
    ['CODE_BUNDLE_SHA256', 'a'.repeat(64)], ['CODE_BUNDLE_EXPECTED_COMMIT', receipt.code.commit], ['CODE_BUNDLE_CONTRACT_VERSION', 'v2'] ].map(([name, value]) => ({ name, value }));
  const doc = { kind: 'Deployment', metadata: { name: 'agent-nova' }, spec: { template: { spec: { initContainers: [{ name: 'bootstrap', image: receipt.images.nova, env }] } } } };
  const baseline = yaml.dump(doc); validateRenderedRelease(baseline, baseline, receipt, true);
  for (const [name, value] of [['CODE_BUNDLE_ENABLED', 'false'], ['CODE_BUNDLE_SHA256', 'f'.repeat(64)], ['CODE_BUNDLE_ARCHIVE_URL', receipt.code.bundles.buster.url], ['CODE_BUNDLE_EXPECTED_COMMIT', receipt.commit]]) {
    const changed = structuredClone(doc); changed.spec.template.spec.initContainers[0].env.find(item => item.name === name).value = value;
    assert.throws(() => validateRenderedRelease(baseline, yaml.dump(changed), receipt, true), name);
  }
});

test('real materialization and Helm render enable pinned bundles for all three agents on retained images', () => {
  const source = path.resolve(import.meta.dirname, '../../..');
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'code-materialize-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'selection']); return git(['rev-parse', 'HEAD']); };
  try {
    for (const name of ['charts', 'my-values']) fs.cpSync(path.join(source, name), path.join(root, name), { recursive: true });
    const busterFile = path.join(root, 'my-values/buster-values.yaml');
    const buster = yaml.load(fs.readFileSync(busterFile, 'utf8'));
    buster.runtimeInfrastructure = { ...buster.runtimeInfrastructure, registry: { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' } };
    fs.writeFileSync(busterFile, yaml.dump(buster));
    git(['init', '-q']); git(['config', 'core.autocrlf', 'false']); const imageCommit = commit();
    fs.mkdirSync(path.join(root, 'skills/nova'), { recursive: true }); fs.writeFileSync(path.join(root, 'skills/nova/change.ts'), 'export const changed = true;');
    const codeCommit = commit(); fs.mkdirSync(path.join(root, 'releases'));
    const names = ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'];
    const receipt = { schemaVersion: 1, commit: imageCommit, sourceRunId: 100, sourceRunAttempt: 1,
      images: Object.fromEntries(names.map(name => [name, `ghcr.io/datrab/kubeclaw-${name}@sha256:${'d'.repeat(64)}`])) };
    fs.writeFileSync(path.join(root, 'releases/runtime-images.json'), JSON.stringify(receipt));
    fs.writeFileSync(path.join(root, 'releases/runtime-code.json'), JSON.stringify(code(codeCommit)));
    execFileSync(process.execPath, [path.join(source, 'scripts/updates/materialize-release.mjs'), '--family=runtime'], { cwd: root });
    const selected = selectedRelease(root, 'runtime');
    assert.equal(selected.commit, imageCommit); assert.equal(selected.code.commit, codeCommit);
    for (const role of ['nova', 'buster', 'prism-agent']) {
      const valuesFile = path.join(root, `releases/values/${role}.yaml`);
      const values = yaml.load(fs.readFileSync(valuesFile, 'utf8'));
      assert.equal(values.codeBundle.enabled, true); assert.equal(values.codeBundle.expectedCommit, codeCommit);
      assert.equal(values.image.digest, `sha256:${'d'.repeat(64)}`);
      const rendered = execFileSync('helm', ['template', `agent-${role}`, path.join(root, 'charts/kubeclaw'), '-f', valuesFile], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      validateRenderedRelease(rendered, rendered, selected, true);
      assert.match(rendered, /sha256sum -c/);
    }
    fs.appendFileSync(path.join(root, 'charts/kubeclaw/values.yaml'), '\n# Next deployment candidate\n');
    const materialize = flags => spawnSync(process.execPath,
      [path.join(source, 'scripts/updates/materialize-release.mjs'), ...flags], {cwd: root, encoding: 'utf8'});
    assert.match(materialize(['--check']).stderr, /RELEASE_CONFIGURATION_CHANGED/);
    assert.equal(materialize(['--check', '--check-selected-source']).status, 0);
    assert.match(materialize(['--check-selected-source']).stderr, /SELECTED_SOURCE_CHECK_ONLY/);
    fs.appendFileSync(path.join(root, 'releases/values/nova.yaml'), '\ntampered: true\n');
    assert.match(materialize(['--check', '--check-selected-source']).stderr, /Release values drift/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
