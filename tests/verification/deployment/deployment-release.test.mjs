import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import yaml from 'js-yaml';

const source = path.resolve(import.meta.dirname, '../../..');
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-selection-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const node = args => execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  try {
    for (const directory of ['charts', 'my-values', 'scripts']) fs.cpSync(path.join(source, directory), path.join(root, directory), { recursive: true });
    fs.symlinkSync(path.join(source, 'node_modules'), path.join(root, 'node_modules'));
    git(['init', '-q']); git(['add', 'charts', 'my-values']);
    git(['-c', 'user.name=Deployment Test', '-c', 'user.email=deployment@example.invalid', 'commit', '-qm', 'Actual configuration fixture']);
    const commit = git(['rev-parse', 'HEAD']);
    fs.mkdirSync(path.join(root, 'releases'));
    const names = ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion', 'codex-ops', 'ops-mcp'];
    // Shape-valid identifiers exercise original Git/Helm/shell code only, never runtime evidence.
    const images = Object.fromEntries(names.map((name, index) => [name, `ghcr.io/datrab/kubeclaw-${name}@sha256:${index.toString(16).repeat(64)}`]));
    for (const family of ['runtime', 'ops']) {
      const selection = Object.fromEntries(names.filter(name => (family === 'ops') === ['codex-ops', 'ops-mcp'].includes(name)).map(name => [name, images[name]]));
      fs.writeFileSync(path.join(root, `releases/${family}-images.json`), JSON.stringify({ schemaVersion: 1, commit, sourceRunId: 123, sourceRunAttempt: 1, images: selection }));
      node(['scripts/updates/materialize-release.mjs', `--family=${family}`]);
    }
    fs.writeFileSync(path.join(root, 'no-cluster.yaml'), 'apiVersion: v1\nkind: Config\nclusters:\n- name: unavailable\n  cluster:\n    server: http://127.0.0.1:1\ncontexts:\n- name: unavailable\n  context:\n    cluster: unavailable\ncurrent-context: unavailable\n');
    const registryOverlay = path.join(root, 'registry.yaml');
    fs.writeFileSync(registryOverlay, yaml.dump({ runtimeInfrastructure: { registry: { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' } } }));
    const shell = (script, args, environment = {}) => spawnSync('bash', [path.join(root, 'scripts', script), ...args], {
      cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, KUBECONFIG: path.join(root, 'no-cluster.yaml'), CODE_BUNDLE_GITHUB_REPOSITORY: 'datrab/kubeclaw', BUSTER_VALUES_FILE: registryOverlay, ...environment },
    });
    run({ root, commit, images, shell });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function success(result) { assert.equal(result.status, 0, result.stderr); return yaml.loadAll(result.stdout).filter(Boolean); }
function failure(result, expression) { assert.notEqual(result.status, 0); assert.match(result.stderr + result.stdout, expression); }

test('original deployment render entrypoints bind all roles, sidecars and bundles to the selected source', () => fixture(({ root, commit, images, shell }) => {
  for (const [role, mode] of [['nova', 'image'], ['buster', 'image'], ['nova', 'code'], ['buster', 'code'], ['prism', 'image']]) {
    const docs = success(shell('deploy.sh', ['render', role, mode]));
    const containers = docs.flatMap(doc => [...(doc.spec?.template?.spec?.containers ?? []), ...(doc.spec?.template?.spec?.initContainers ?? [])]);
    const refs = containers.map(container => container.image).filter(image => image.includes('/kubeclaw-'));
    assert.ok(refs.length > 0);
    for (const ref of refs) assert.ok(Object.values(images).includes(ref), ref);
    if (mode === 'code' || role === 'prism') {
      const commits = containers.flatMap(container => container.env ?? []).filter(value => value.name.endsWith('CODE_BUNDLE_EXPECTED_COMMIT'));
      assert.ok(commits.length > 0);
      for (const value of commits) assert.equal(value.value, commit);
      const enabled = containers.flatMap(container => container.env ?? []).filter(value => value.name.endsWith('CODE_BUNDLE_ENABLED'));
      assert.ok(enabled.length >= 2, 'Both canonical init and gateway consumers are required');
      for (const value of enabled) assert.equal(value.value, 'true');
    }
  }
  const discovery = path.join(root, 'discovery.json');
  fs.writeFileSync(discovery, JSON.stringify({ networkPolicy: { apiServerCIDRs: ['192.0.2.1/32'] } }));
  const ops = success(shell('deploy-ops-pod.sh', ['render'], { KUBE_CONTEXT: 'render-only', OPS_DISCOVERY_VALUES: discovery }));
  const refs = ops.flatMap(doc => doc.spec?.template?.spec?.containers ?? []).map(container => container.image);
  assert.ok(refs.includes(images['codex-ops'])); assert.ok(refs.includes(images['ops-mcp']));
}));

test('deployment rejects missing receipts, source identity, mutable overrides and cross-source bundles before cluster access', () => fixture(({ root, shell }) => {
  failure(shell('deploy.sh', ['agent', 'nova', '--with-code'], { NOVA_CODE_BUNDLE_EXPECTED_COMMIT: 'f'.repeat(40) }), /bundle must match/);
  failure(shell('deploy.sh', ['all'], { BUSTER_GATEWAY_IMAGE_TAG: 'latest' }), /tag overrides/);
  failure(shell('deploy.sh', ['render', 'nova'], { NOVA_IMAGE_REPOSITORY: 'ghcr.io/datrab/kubeclaw-buster-gateway' }), /image slot changed/);
  const file = path.join(root, 'releases/runtime-images.json');
  const receipt = JSON.parse(fs.readFileSync(file)); delete receipt.sourceRunAttempt;
  fs.writeFileSync(file, JSON.stringify(receipt));
  failure(shell('deploy.sh', ['agents']), /source run identity/);
  fs.unlinkSync(file);
  failure(shell('deploy.sh', ['all']), /No selected runtime release.*Promote image release/s);
}));

test('private operational overlays survive while replaced or removed runtime slots fail', () => fixture(({ root, shell }) => {
  const overlay = path.join(root, 'private.yaml');
  fs.writeFileSync(overlay, 'replicaCount: 2\n');
  const docs = success(shell('deploy.sh', ['render', 'nova'], { NOVA_VALUES_FILE: overlay }));
  assert.equal(docs.find(doc => doc.kind === 'Deployment' && doc.metadata.name === 'agent-nova').spec.replicas, 2);
  fs.writeFileSync(overlay, 'extraContainers: []\nruntimeInfrastructure:\n  registry:\n    endpoint: https://registry.example.test\n    transport: https\n    authSecretName: registry-test\n');
  failure(shell('deploy.sh', ['render', 'buster'], { BUSTER_VALUES_FILE: overlay }), /image slot changed or missing|requires exactly one extraContainers/);
  fs.writeFileSync(overlay, 'image:\n  digest: sha256:' + 'f'.repeat(64) + '\n');
  failure(shell('deploy.sh', ['render', 'nova'], { NOVA_VALUES_FILE: overlay }), /image slot changed or missing/);
}));

test('Prism and Ops reject image overrides even when another value could conceal them', () => fixture(({ root, images, shell }) => {
  const overlay = path.join(root, 'private.yaml');
  fs.writeFileSync(overlay, 'images:\n  control:\n    digest: sha256:' + 'f'.repeat(64) + '\n');
  failure(shell('deploy.sh', ['render', 'prism'], { PRISM_VALUES_FILE: overlay }), /image slot changed or missing/);
  failure(shell('deploy.sh', ['render', 'prism'], { PRISM_CONTROL_IMAGE_DIGEST: `sha256:${'f'.repeat(64)}` }), /image slot changed or missing/);
  fs.writeFileSync(overlay, `image:\n  repository: ghcr.io/datrab/kubeclaw-buster-gateway\n  digest: ${images['buster-gateway'].split('@')[1]}\n`);
  failure(shell('deploy.sh', ['render', 'nova'], { NOVA_VALUES_FILE: overlay }), /image slot changed or missing/);
  fs.writeFileSync(overlay, `codeBundle:\n  expectedCommit: ${'f'.repeat(40)}\n`);
  failure(shell('deploy.sh', ['agent', 'nova', '--with-code'], { NOVA_VALUES_FILE: overlay }), /Overlay bundle commit differs/);
  const discovery = path.join(root, 'discovery.json');
  fs.writeFileSync(discovery, JSON.stringify({ networkPolicy: { apiServerCIDRs: ['192.0.2.1/32'] } }));
  const environment = { KUBE_CONTEXT: 'render-only', OPS_DISCOVERY_VALUES: discovery };
  failure(shell('deploy-ops-pod.sh', ['render'], { ...environment, OPS_CODEX_IMAGE: images['ops-mcp'] }), /image slot changed or missing/);
  fs.writeFileSync(overlay, `codexImage: ${images['ops-mcp']}\n`);
  failure(shell('deploy-ops-pod.sh', ['render'], { ...environment, OPS_POD_VALUES: overlay, OPS_CODEX_IMAGE: images['codex-ops'] }), /image slot changed or missing/);
  success(shell('deploy-ops-pod.sh', ['render'], { ...environment, OPS_CODEX_IMAGE: images['codex-ops'] }));
}));

test('source configuration and materialized values are rechecked by actual deployment entrypoints', () => fixture(({ root, shell }) => {
  const generated = path.join(root, 'releases/values/nova.yaml');
  fs.appendFileSync(generated, '\n# drift\n');
  failure(shell('deploy.sh', ['agents']), /Release values drift/);
  const sourceValues = path.join(root, 'my-values/nova-values.yaml');
  fs.appendFileSync(sourceValues, '\n# different configuration\n');
  failure(shell('deploy.sh', ['all']), /RELEASE_CONFIGURATION_CHANGED/);
  fs.unlinkSync(path.join(root, 'releases/ops-images.json'));
  failure(shell('deploy-ops-pod.sh', ['deploy'], { KUBE_CONTEXT: 'not-contacted' }), /No selected ops release/);
}));

test('private bundle URL and authentication survive while the selected revision stays fixed', () => fixture(({ root, commit, shell }) => {
  const overlay = path.join(root, 'private.yaml');
  fs.writeFileSync(overlay, 'codeBundle:\n  archiveUrl: https://example.invalid/private.tgz\n  auth:\n    existingSecret: private-bundle-reader\n    existingSecretKey: credential\n');
  const docs = success(shell('deploy.sh', ['render', 'nova', 'code'], { NOVA_VALUES_FILE: overlay }));
  const env = docs.flatMap(doc => doc.spec?.template?.spec?.initContainers ?? []).flatMap(container => container.env ?? []);
  assert.equal(env.find(value => value.name === 'CODE_BUNDLE_ARCHIVE_URL').value, 'https://example.invalid/private.tgz');
  assert.equal(env.find(value => value.name === 'CODE_BUNDLE_EXPECTED_COMMIT').value, commit);
  assert.deepEqual(env.find(value => value.name === 'CODE_BUNDLE_AUTH_TOKEN').valueFrom.secretKeyRef, { name: 'private-bundle-reader', key: 'credential' });
}));


test('private extraEnv cannot shadow reserved runtime bundle controls', () => fixture(({ root, commit, shell }) => {
  const overlay = path.join(root, 'private.yaml');
  for (const [name, value] of [
    ['KUBECLAW_CODE_BUNDLE_ENABLED', 'false'],
    ['KUBECLAW_CODE_BUNDLE_ENABLED', 'true'],
    ['KUBECLAW_CODE_BUNDLE_EXPECTED_COMMIT', commit],
    ['KUBECLAW_CODE_BUNDLE_CONTRACT_VERSION', 'v2'],
    ['KUBECLAW_CODE_BUNDLE_MANIFEST', '/tmp/other-manifest.json'],
  ]) {
    fs.writeFileSync(overlay, yaml.dump({ extraEnv: [{ name, value }] }));
    failure(shell('deploy.sh', ['render', 'nova', 'code'], { NOVA_VALUES_FILE: overlay }), /Duplicate reserved bundle control/);
  }
}));


test('noncanonical alias and indirect controls cannot stand in for bundle consumers', () => fixture(({ root, shell }) => {
  const overlay = path.join(root, 'private.yaml');
  for (const variable of [
    { name: 'CODE_BUNDLE_ENABLED', value: 'false' },
    { name: 'CODE_BUNDLE_ENABLED', value: 'true' },
    { name: 'KUBECLAW_CODE_BUNDLE_ENABLED', valueFrom: { fieldRef: { fieldPath: 'metadata.name' } } },
  ]) {
    fs.writeFileSync(overlay, yaml.dump({ extraEnv: [variable] }));
    failure(shell('deploy.sh', ['render', 'nova', 'code'], { NOVA_VALUES_FILE: overlay }), /(?:Duplicate|Unexpected|Indirect) reserved bundle control/);
  }
}));
