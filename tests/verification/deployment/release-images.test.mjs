import {fixtureBusterImageDelivery} from '../../fixtures/buster-image-delivery.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { collectReceipts } from '../../../scripts/updates/release-images.mjs';

test('release selection rejects missing, duplicate and cross-commit build receipts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-receipts-'));
  const commit = 'a'.repeat(40);
  const receipt = { name: 'nova', commit, image: `ghcr.io/datrab/kubeclaw-nova@sha256:${'b'.repeat(64)}` };
  // These exercise manifest validation; they are never published as build evidence.
  try {
    assert.throws(() => collectReceipts(root, commit, ['nova']), /missing/);
    fs.writeFileSync(path.join(root, 'nova.json'), JSON.stringify(receipt));
    assert.equal(collectReceipts(root, commit, ['nova']).images.nova, receipt.image);
    assert.throws(() => collectReceipts(root, 'c'.repeat(40), ['nova']), /cross-commit/);
    fs.writeFileSync(path.join(root, 'duplicate.json'), JSON.stringify(receipt));
    assert.throws(() => collectReceipts(root, commit, ['nova']), /duplicate/);
    fs.unlinkSync(path.join(root, 'duplicate.json'));
    receipt.image = 'ghcr.io/datrab/kubeclaw-nova:latest';
    fs.writeFileSync(path.join(root, 'nova.json'), JSON.stringify(receipt));
    assert.throws(() => collectReceipts(root, commit, ['nova']), /Invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('generated release values render actual Helm charts with immutable role and sidecar references', async () => {
  const { execFileSync } = await import('node:child_process');
  const { parseAllDocuments } = await import('yaml');
  const source = path.resolve(import.meta.dirname, '../../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-helm-'));
  try {
    fs.cpSync(path.join(source, 'my-values'), path.join(root, 'my-values'), { recursive: true });
    fs.cpSync(path.join(source, 'charts'), path.join(root, 'charts'), { recursive: true, verbatimSymlinks: true });
    const schemaDirectory = 'skills/common/plugin-runtime/foundation/config';
    fs.mkdirSync(path.join(root, schemaDirectory), { recursive: true });
    for (const name of ['swarm.schema.json', 'swarm-components.schema.json']) {
      fs.copyFileSync(path.join(source, schemaDirectory, name), path.join(root, schemaDirectory, name));
    }
    for(const name of ['config','packaging/runtime'])fs.cpSync(path.join(source,name),path.join(root,name),{recursive:true});
    for(const name of ['scripts/build-buster-image-bundle.mjs','scripts/build-buster-proof-harness.mjs','scripts/generate-buster-chart-config.mjs','scripts/updates/buster-image-delivery.mjs','scripts/updates/write-image-receipt.mjs','scripts/updates/pipeline-generation.mjs','scripts/build-runtime-role-bundle.mjs','scripts/build-prism-image-bundle.mjs','scripts/generate-prism-chart-config.mjs','scripts/pipeline-publish.c']){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.copyFileSync(path.join(source,name),path.join(root,name));}
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', 'commit', '-qm', 'Configuration under test']);
    const configurationCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    fs.mkdirSync(path.join(root, 'releases'));
    const names = ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'];
    // Valid-shaped identifiers test rendering, not image availability or deployment.
    const images = Object.fromEntries(names.map((name, index) => [name, `ghcr.io/datrab/kubeclaw-${name}@sha256:${index.toString(16).repeat(64)}`]));
    fs.writeFileSync(path.join(root, 'releases/runtime-images.json'), JSON.stringify({ schemaVersion: 1, commit: configurationCommit, images, imageDeliveries:{'buster-runtime':fixtureBusterImageDelivery(configurationCommit,path.join(root,'config'))} }));
    execFileSync(process.execPath, [path.join(source, 'scripts/updates/materialize-release.mjs')], { cwd: root });
    execFileSync(process.execPath, [path.join(source, 'scripts/updates/materialize-release.mjs'), '--check'], { cwd: root });
    // Rendering fixtures only: production bindings come from native host preflight.
    const nativeWorkerArgs = ['--namespace', 'kubeclaw',
      '--set-string', 'worker.native.namespace=kubeclaw',
      '--set-string', 'worker.native.nodeName=worker-test',
      '--set-string', `worker.native.policyDigest=${'a'.repeat(64)}`];
    const policy = yaml.load(fs.readFileSync(path.join(root, 'my-values/infra/native-worker-pools.yaml'), 'utf8'));
    policy.nodeName = 'native-render-test';
    policy.pools.buster.namespace = 'kubeclaw';
    const busterBinding = nativePoolPolicy(policy, 'buster');
    const nativeBusterArgs = ['--namespace', policy.pools.buster.namespace,
      '--set-string', `busterNative.namespace=${policy.pools.buster.namespace}`,
      '--set-string', `busterNative.nodeName=${busterBinding.nodeName}`,
      '--set-string', `busterNative.policyDigest=${busterBinding.policyDigest}`];
    for (const role of ['nova', 'buster', 'prism-agent', 'prism']) {
      const output = execFileSync('helm', ['template', role==='prism'?'prism':role==='prism-agent'?'agent-prism':`agent-${role}`, path.join(root, `charts/${role === 'prism' ? 'prism' : 'kubeclaw'}`), '-f', path.join(root, `releases/values/${role}.yaml`), ...(role === 'prism' ? nativeWorkerArgs : role === 'buster' ? nativeBusterArgs : ['--namespace','kubeclaw']), ...(role === 'buster' ? ['--set', 'runtimeInfrastructure.registry.endpoint=https://registry.example.test', '--set', 'runtimeInfrastructure.registry.transport=https', '--set', 'runtimeInfrastructure.registry.authSecretName=registry-test'] : [])], { encoding: 'utf8' });
      const docs = parseAllDocuments(output).map(doc => { assert.deepEqual(doc.errors, []); return doc.toJSON(); });
      const refs = docs.flatMap(doc => [...(doc?.spec?.template?.spec?.containers ?? []), ...(doc?.spec?.template?.spec?.initContainers ?? [])]).map(container => container.image).filter(image => image.startsWith('ghcr.io/datrab/kubeclaw-'));
      assert.ok(refs.length > 0, `No rendered runtime images for ${role}`);
      for (const ref of refs) assert.ok(Object.values(images).includes(ref), `Mutable or incorrect runtime reference: ${ref}`);
    }
    const opsImages = Object.fromEntries(['codex-ops', 'ops-mcp'].map((name, index) => [name, `ghcr.io/datrab/kubeclaw-${name}@sha256:${(index + 10).toString(16).repeat(64)}`]));
    fs.writeFileSync(path.join(root, 'releases/ops-images.json'), JSON.stringify({ schemaVersion: 1, commit: configurationCommit, images: opsImages }));
    execFileSync(process.execPath, [path.join(source, 'scripts/updates/materialize-release.mjs'), '--family=ops'], { cwd: root });
    execFileSync(process.execPath, [path.join(source, 'scripts/updates/materialize-release.mjs'), '--family=ops', '--check'], { cwd: root });
    const opsOutput = execFileSync('helm', ['template', 'ops', path.join(root, 'charts/ops-pod'), '-f', path.join(root, 'releases/values/ops.yaml'), '--set', 'networkPolicy.apiServerCIDRs[0]=192.0.2.1/32'], { encoding: 'utf8' });
    const refs = parseAllDocuments(opsOutput).flatMap(doc => doc.toJSON()?.spec?.template?.spec?.containers ?? []).map(container => container.image);
    for (const ref of Object.values(opsImages)) assert.ok(refs.includes(ref));
    // CI replays the selected receipt while its replacement is being built.
    // Current-source materialization must still reject new, unqualified inputs.
    fs.writeFileSync(path.join(root, 'charts/ops-pod/templates/new-input.yaml'), 'kind: ConfigMap\n');
    const materialize = path.join(source, 'scripts/updates/materialize-release.mjs');
    assert.throws(() => execFileSync(process.execPath, [materialize, '--family=ops', '--check'], { cwd: root, stdio: 'pipe' }), /RELEASE_CONFIGURATION_FILESET_CHANGED/);
    execFileSync(process.execPath, [materialize, '--family=ops', '--check', '--check-selected-source'], { cwd: root });
    assert.throws(() => execFileSync(process.execPath, [materialize, '--family=ops', '--check-selected-source'], { cwd: root, stdio: 'pipe' }), /SELECTED_SOURCE_CHECK_ONLY/);
    fs.appendFileSync(path.join(root, 'releases/values/ops.yaml'), '# corrupted selected values\n');
    assert.throws(() => execFileSync(process.execPath, [materialize, '--family=ops', '--check', '--check-selected-source'], { cwd: root, stdio: 'pipe' }), /Release values drift/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
