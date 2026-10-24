import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import yaml from 'js-yaml';
import { changedImages, changedBundles } from '../../../scripts/updates/runtime-inputs.mjs';
import { runtimeImages, runtimeRoles, componentSource, imageInput } from '../../../scripts/updates/runtime-components.mjs';
import { collectRuntimeReceipts } from '../../../scripts/updates/release-images.mjs';
import { selectedRelease, validateRenderedRelease } from '../../../scripts/updates/deployment-release.mjs';
import { verifyReleaseSources } from '../../../scripts/updates/verify-release-source.mjs';

const sourceRoot = path.resolve(import.meta.dirname, '../../..');
const image = (name, digit) => `ghcr.io/datrab/kubeclaw-${name}@sha256:${digit.repeat(64)}`;
async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-components-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); };
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']); return git(['rev-parse', 'HEAD']); };
  try {
    for (const directory of ['packaging/runtime', 'charts', 'my-values']) fs.cpSync(path.join(sourceRoot, directory), path.join(root, directory), { recursive: true });
    for (const file of fs.readdirSync(path.join(sourceRoot, 'skills'), { recursive: true })) {
      if (file.endsWith('/plugin.json')) write(`skills/${file}`, fs.readFileSync(path.join(sourceRoot, 'skills', file)));
    }
    const buster = yaml.load(fs.readFileSync(path.join(root, 'my-values/buster-values.yaml'), 'utf8'));
    buster.runtimeInfrastructure ??= {};
    buster.runtimeInfrastructure.registry = { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' };
    write('my-values/buster-values.yaml', yaml.dump(buster));
    const prism = yaml.load(fs.readFileSync(path.join(root, 'my-values/prism-values.yaml'), 'utf8'));
    prism.worker.native = { ...prism.worker.native, nodeName: 'worker-test', namespace: 'kubeclaw', policyDigest: 'a'.repeat(64) };
    write('my-values/prism-values.yaml', yaml.dump(prism));
    write('skills/buster/engine/test-gates/diagnostics.ts', 'old');
    write('skills/nova/core/engine.ts', 'old');
    write('skills/common/plugin-runtime/sdk/index.ts', 'old');
    write('cmd/buster-namespace-controller/main.go', 'old');
    git(['init', '-q']);
    const initial = commit();
    const images = { schemaVersion: 1, commit: initial, sourceRunId: 1, sourceRunAttempt: 1,
      images: Object.fromEntries(runtimeImages.map(name => [name, image(name, 'a')])) };
    const code = { schemaVersion: 1, commit: initial, sourceRunId: 1, sourceRunAttempt: 1,
      bundles: Object.fromEntries(runtimeRoles.map(role => [role, { url: `https://github.com/datrab/kubeclaw/releases/download/code-bundles-1-1/${role}-${initial}.tgz`, sha256: 'a'.repeat(64), contractVersion: 'v2' }])) };
    write('releases/runtime-images.json', JSON.stringify(images)); write('releases/runtime-code.json', JSON.stringify(code));
    commit();
    return await run({ root, git, write, commit, initial, images, code });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('Buster controller, engine, plugin and chart edits select only their actual consumers', () => fixture(({ root, write, commit, images, code }) => {
  write('cmd/buster-namespace-controller/main.go', 'new controller');
  let head = commit();
  assert.deepEqual(changedImages(root, images, head), ['namespace-controller']);
  assert.deepEqual(changedBundles(root, code, head), []);
  write('skills/buster/engine/test-gates/diagnostics.ts', 'new diagnostics');
  write('skills/buster/plugins/kubernetes-fixture/src/provider.js', 'new provider');
  write('charts/kubeclaw/templates/buster-namespace-controller.yaml', '# new controller config');
  head = commit();
  assert.deepEqual(changedImages(root, images, head), ['buster-runtime', 'namespace-controller']);
  assert.deepEqual(changedBundles(root, code, head), ['buster']);
  // Deleting input is a change too, even after a preceding build failed.
  fs.unlinkSync(path.join(root, 'skills/buster/engine/test-gates/diagnostics.ts'));
  const afterFailure = commit();
  assert.deepEqual(changedImages(root, images, afterFailure), ['buster-runtime', 'namespace-controller']);
  assert.deepEqual(changedBundles(root, code, afterFailure), ['buster']);
}));

test('shared dependencies, packaging metadata, manual refreshes and unrelated documentation remain safe', () => fixture(({ root, write, commit, images, code }) => {
  write('docs/notes.md', 'documentation only');
  let head = commit();
  assert.deepEqual(changedImages(root, images, head), []); assert.deepEqual(changedBundles(root, code, head), []);
  assert.deepEqual(changedImages(root, images, head, true), runtimeImages);
  assert.deepEqual(changedBundles(root, code, head, true), runtimeRoles);
  write('skills/common/plugin-runtime/sdk/index.ts', 'shared API change'); head = commit();
  assert.deepEqual(changedImages(root, images, head), ['prism-agent', 'buster-runtime', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion']);
  assert.deepEqual(changedBundles(root, code, head), runtimeRoles);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packaging/runtime/roles/nova.json')));
  manifest.packages = manifest.packages.filter(id => id !== 'nova-core');
  write('packaging/runtime/roles/nova.json', JSON.stringify(manifest)); head = commit();
  assert(changedBundles(root, code, head).includes('nova'));
}));

test('partial build publication retains old images and bundles, and Helm preserves Nova and Prism pod templates', () => fixture(({ root, write, commit, images, code }) => {
  const materialize = () => execFileSync(process.execPath, [path.join(sourceRoot, 'scripts/updates/materialize-release.mjs')], { cwd: root });
  const render = role => execFileSync('helm', ['template', `agent-${role}`, path.join(root, `charts/${role === 'prism' ? 'prism' : 'kubeclaw'}`), '-n', 'kubeclaw', '-f', path.join(root, `releases/values/${role}.yaml`)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const templates = manifest => yaml.loadAll(manifest).filter(doc => doc?.spec?.template).map(doc => [doc.kind, doc.metadata.name, doc.spec.template]);
  materialize();
  const before = Object.fromEntries(['nova', 'buster', 'prism-agent', 'prism'].map(role => [role, render(role)]));
  write('cmd/buster-namespace-controller/main.go', 'new');
  write('skills/buster/engine/test-gates/diagnostics.ts', 'new');
  const head = commit();
  fs.mkdirSync(path.join(root, 'receipt-input'));
  for (const name of ['buster-runtime', 'namespace-controller']) write(`receipt-input/${name}.json`, JSON.stringify({ name, commit: head, image: image(name, 'b') }));
  const next = collectRuntimeReceipts(path.join(root, 'receipt-input'), head, images, { sourceRunId: 2, sourceRunAttempt: 1 }, root);
  write('releases/runtime-images.json', JSON.stringify(next));
  for (const name of runtimeImages) {
    assert.equal(next.images[name], ['buster-runtime', 'namespace-controller'].includes(name) ? image(name, 'b') : images.images[name]);
    assert.equal(componentSource(next, name, 'image').commit, ['buster-runtime', 'namespace-controller'].includes(name) ? head : images.commit);
  }
  write('dist/buster-' + head + '.tgz', 'fixture archive bytes');
  execFileSync(process.execPath, [path.join(sourceRoot, 'scripts/updates/code-release.mjs'), 'dist', head, 'datrab/kubeclaw'], {
    cwd: root, env: { ...process.env, GITHUB_SHA: head, GITHUB_RUN_ID: '2', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_NAME: 'push' },
  });
  const nextCode = JSON.parse(fs.readFileSync(path.join(root, 'dist/runtime-code.json')));
  for (const role of ['nova', 'prism']) {
    assert.equal(nextCode.bundles[role].url, code.bundles[role].url);
    assert.equal(componentSource(nextCode, role, 'bundle').commit, code.commit);
  }
  write('releases/runtime-code.json', JSON.stringify(nextCode));
  assert.deepEqual(changedImages(root, next, head), []); assert.deepEqual(changedBundles(root, nextCode, head), []);
  materialize();
  const selected = selectedRelease(root, 'runtime');
  for (const role of ['nova', 'prism-agent', 'prism']) {
    const after = render(role);
    assert.deepEqual(templates(after), templates(before[role]), role);
    validateRenderedRelease(after, after, selected, role !== 'prism');
  }
  assert.notDeepEqual(templates(render('buster')), templates(before.buster));
  const expected = execFileSync(process.execPath, [path.join(sourceRoot, 'scripts/updates/deployment-release.mjs'), 'verify', root, 'runtime', 'nova'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(expected, code.commit);
  // A receipt cannot conceal a missing or unexpected build artifact.
  fs.unlinkSync(path.join(root, 'receipt-input/namespace-controller.json'));
  assert.throws(() => collectRuntimeReceipts(path.join(root, 'receipt-input'), head, images, { sourceRunId: 2, sourceRunAttempt: 1 }, root), /missing/);
}));

// Local API fixtures exercise provenance validation; no fixture represents a real build.
test('mixed provenance resolves each retained artifact to its producing successful run and rejects forgery', async () => fixture(async ({ root, write, commit, images, code }) => {
  write('cmd/buster-namespace-controller/main.go', 'new'); const head = commit();
  const next = { ...images, commit: head, sourceRunId: 2, images: { ...images.images, 'namespace-controller': image('namespace-controller', 'b') },
    imageSources: Object.fromEntries(runtimeImages.map(name => [name, { commit: name === 'namespace-controller' ? head : images.commit, sourceRunId: name === 'namespace-controller' ? 2 : 1, sourceRunAttempt: 1 }])) };
  const nextCode = { ...code, commit: head, sourceRunId: 2, bundles: Object.fromEntries(runtimeRoles.map(role => [role, { ...code.bundles[role], source: componentSource(code, role, 'bundle') }])) };
  const receipts = { 'runtime-images-1-1': images, 'runtime-images-2-1': next, 'code-bundles-1-1': code, 'code-bundles-2-1': nextCode };
  const assets = new Map(); const releases = {};
  let counter = 0;
  for (const [tag, receipt] of Object.entries(receipts)) {
    const id = ++counter; assets.set(id, structuredClone(receipt));
    releases[tag] = { target_commitish: receipt.commit, assets: [{ id, name: tag.startsWith('code') ? 'runtime-code.json' : 'runtime-images.json', size: 1000 },
      ...Object.entries(receipt.bundles ?? {}).filter(([, bundle]) => !bundle.source).map(([role, bundle]) => ({ name: `${role}-${receipt.commit}.tgz`, browser_download_url: bundle.url, digest: `sha256:${bundle.sha256}` }))] };
  }
  write('releases/runtime-images.json', JSON.stringify(next)); write('releases/runtime-code.json', JSON.stringify(nextCode));
  const runs = { 1: { head_sha: images.commit }, 2: { head_sha: head } };
  const fetchImpl = async url => {
    const route = url.split('/repos/datrab/kubeclaw/')[1];
    const run = route.match(/^actions\/runs\/(\d+)\/attempts\/1$/u);
    const value = run ? { conclusion: 'success', head_branch: 'main', head_repository: { full_name: 'datrab/kubeclaw' }, path: '.github/workflows/build-images.yaml', event: 'push', ...runs[run[1]] }
      : route.startsWith('releases/tags/') ? releases[route.slice('releases/tags/'.length)] : assets.get(Number(route.slice('releases/assets/'.length)));
    return new Response(JSON.stringify(value), { status: value ? 200 : 404 });
  };
  const verify = () => verifyReleaseSources({ root, repo: 'datrab/kubeclaw', token: 'test', fetchImpl });
  await verify();
  runs[1].conclusion = 'failure'; await assert.rejects(verify, /successful/); delete runs[1].conclusion;
  // Local selection edits must not mutate the immutable API receipt fixture.
  // Even an authentic older component cannot be substituted into a different
  // published selection: a new successful-source receipt is required first.
  const synthetic = structuredClone(next);
  synthetic.images['namespace-controller'] = images.images['namespace-controller'];
  synthetic.imageSources['namespace-controller'] = componentSource(images, 'namespace-controller', 'image');
  write('releases/runtime-images.json', JSON.stringify(synthetic));
  await assert.rejects(verify, /preserved successful-source receipt/);
  assert.equal(assets.get(2).images['namespace-controller'], next.images['namespace-controller']);
  next.images.nova = image('nova', 'f'); write('releases/runtime-images.json', JSON.stringify(next));
  await assert.rejects(verify, /preserved successful-source receipt/);
  // If the published selection itself names a forged retained value, the
  // independent original producer receipt must still reject it.
  assets.set(2, structuredClone(next));
  await assert.rejects(verify, /original build/);
}));


test('component dependency declarations cover every explicit Docker COPY source', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const name of runtimeImages) {
    const dockerfile = fs.readFileSync(`docker/Dockerfile.${name}`, 'utf8');
    for (const line of dockerfile.split('\n')) {
      if (!line.startsWith('COPY ') || line.startsWith('COPY --from=')) continue;
      const sources = line.slice(5).trim().split(/\s+/u).slice(0, -1);
      for (const source of sources) {
        if (source === '.') continue; // Prism workspace builds are declared explicitly.
        const prefix = source.replace(/\/$/u, '');
        const files = tracked.filter(file => file === prefix || file.startsWith(`${prefix}/`));
        assert(files.length > 0, `No tracked COPY input: ${name}/${source}`);
        for (const file of files) assert(imageInput(name, file), `Missing image dependency: ${name}/${file}`);
      }
    }
  }
});


test('same-code replay still checks image publication scope before receipt writes', () => fixture(({ root, write, initial, images, code }) => {
  const next = structuredClone(images);
  next.images['prism-agent'] = image('prism-agent', 'b');
  const assets = Object.entries(code.bundles).map(([role, bundle], index) => ({
    id: index + 10, name: `${role}-${initial}.tgz`, browser_download_url: bundle.url,
    digest: `sha256:${bundle.sha256}`,
  }));
  const routes = {
    'actions/runs/1/attempts/1': { conclusion: 'success', path: '.github/workflows/build-images.yaml',
      head_branch: 'main', event: 'push', head_repository: { full_name: 'datrab/kubeclaw' }, head_sha: initial },
    'releases/tags/code-bundles-1-1': { target_commitish: initial, assets: [
      ...assets, { id: 1, name: 'runtime-code.json', size: 1000 }] },
    'releases/assets/1': code,
    'releases/tags/runtime-images-1-1': { target_commitish: initial, assets: [
      { id: 2, name: 'runtime-images.json', size: 1000 }] },
    'releases/assets/2': next,
  };
  write('mock-fetch.mjs', `const routes = ${JSON.stringify(routes)};
    globalThis.fetch = async url => {
      const route = String(url).split('/repos/datrab/kubeclaw/')[1];
      if (!(route in routes)) throw new Error('Unexpected API route: ' + route);
      return new Response(JSON.stringify(routes[route]), { status: 200 });
    };`);
  const beforeCode = fs.readFileSync(path.join(root, 'releases/runtime-code.json'), 'utf8');
  const beforeImages = fs.readFileSync(path.join(root, 'releases/runtime-images.json'), 'utf8');
  assert.throws(() => execFileSync(process.execPath, ['--import', path.join(root, 'mock-fetch.mjs'),
    path.join(sourceRoot, 'scripts/updates/select-runtime-deployment.mjs')], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GITHUB_REPOSITORY: 'datrab/kubeclaw', GITHUB_TOKEN: 'fixture-only',
      SOURCE_RUN_ID: '1', SOURCE_RUN_ATTEMPT: '1', RUNTIME_PUBLICATION_SCOPE: 'buster',
      GITHUB_OUTPUT: path.join(root, 'selection-output') },
  }), error => /RUNTIME_PUBLICATION_SCOPE_EXCEEDED:buster/u.test(error.stderr));
  assert.equal(fs.readFileSync(path.join(root, 'releases/runtime-code.json'), 'utf8'), beforeCode);
  assert.equal(fs.readFileSync(path.join(root, 'releases/runtime-images.json'), 'utf8'), beforeImages);
  assert.equal(fs.existsSync(path.join(root, 'selection-output')), false);
}));
