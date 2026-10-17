import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { nativePoolPolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { busterChartProjection } from '../../../scripts/generate-buster-chart-config.mjs';
import { prismChartProjection } from '../../../scripts/generate-prism-chart-config.mjs';
import { buildBusterImageBundle } from '../../../scripts/build-buster-image-bundle.mjs';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { readTestPipeline, busterRuntimeSelection } from '../../fixtures/config/pipeline-components.mjs';

// Runtime authors now travel in the immutable role image. Both real chart
// generators validate the whole central generation; Prism does not mount Buster.
// Keep original profile/packaging/A-B/rollout/malformed/topology obligations at
// those actual boundaries, without restoring a retired chart author or loader.
test('both actual charts, packaged role boot and loader enforce shared cluster invoker policy', async () => {
  const repository = process.cwd(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-invoker-chart-'));
  try {
    const privateRepository = path.join(root, 'repository'); fs.mkdirSync(privateRepository);
    fs.cpSync('config', path.join(privateRepository, 'config'), { recursive: true, dereference: true });
    for (const directory of ['scripts', 'skills']) fs.symlinkSync(path.join(repository, directory), path.join(privateRepository, directory));
    const authorRoot = path.join(privateRepository, 'config'), entry = path.join(authorRoot, 'pipeline.config.json');
    const ownerFile = path.join(authorRoot, 'components/buster-engine.config.json');
    const baseline = readTestPipeline(entry), selected = baseline['buster-engine'].profiles.runtime.settings.clusterInvokers;
    const sourceFiles = ['config/pipeline.config.json', 'config/components/buster-engine.config.json',
      'charts/kubeclaw/files/pipeline/buster-topology.json', 'charts/prism/files/pipeline/prism-topology.json',
      'charts/kubeclaw/files/config/buster-engine.config.json'].filter(file => fs.existsSync(file)).map(file => path.resolve(file));
    const sourceBytes = sourceFiles.map(file => fs.readFileSync(file));
    const assertPrivate = file => {
      assert(fs.realpathSync(file).startsWith(fs.realpathSync(root) + path.sep));
      assert(!fs.lstatSync(file).isSymbolicLink());
      const stat = fs.statSync(file); assert(stat.isFile());
      for (const source of sourceFiles) {
        const original = fs.statSync(source);
        assert(stat.dev !== original.dev || stat.ino !== original.ino, 'mutation must not alias original inode');
      }
    };
    const write = (file, value) => { assertPrivate(file); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
    const writePolicy = policy => {
      const document = structuredClone(baseline['buster-engine']); document.profiles.runtime.settings.clusterInvokers = policy;
      write(ownerFile, document); write(entry, baseline.entry);
    };
    const capture = () => captureSwarmSettings(entry, busterRuntimeSelection(readTestPipeline(entry))).components['buster-engine'].settings.clusterInvokers;
    const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
    const builtAt = new Date().toISOString(); // One genuine build invocation identity across A/B/restored-A.
    const charts = {}, values = {}, projectors = { kubeclaw: busterChartProjection, prism: prismChartProjection };
    for (const name of ['kubeclaw', 'prism']) {
      charts[name] = path.join(root, name); fs.cpSync(`charts/${name}`, charts[name], { recursive: true, dereference: true });
      values[name] = yaml.load(fs.readFileSync(name === 'prism' ? 'charts/prism/ci-values.yaml' : 'my-values/buster-values.yaml', 'utf8'));
    }
    const native = yaml.load(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8'));
    native.nodeName = 'readiness-render-only'; native.pools.buster.namespace = 'kubeclaw';
    const binding = nativePoolPolicy(native, 'buster');
    values.kubeclaw.busterNative = { namespace: 'kubeclaw', nodeName: binding.nodeName, policyDigest: binding.policyDigest };
    values.kubeclaw.runtimeInfrastructure = { registry: { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' } };
    values.kubeclaw.extraContainers.find(item => item.name === 'buster-v2-runtime').image = `ghcr.io/datrab/kubeclaw-buster-runtime@sha256:${'a'.repeat(64)}`;
    const projectionFile = name => path.join(charts[name], 'files/pipeline', name === 'kubeclaw' ? 'buster-topology.json' : 'prism-topology.json');
    let packageIndex = 0;
    const render = name => {
      const projection = projectors[name](authorRoot), file = path.join(root, `${name}-values.yaml`);
      fs.writeFileSync(file, yaml.dump(values[name]));
      const packaged = path.join(root, `render-package-${packageIndex++}-${name}`); fs.mkdirSync(packaged);
      execFileSync('helm', ['package', charts[name], '--destination', packaged], { stdio: 'pipe' });
      const archives = fs.readdirSync(packaged).filter(file => file.endsWith('.tgz')); assert.equal(archives.length, 1);
      const archive = path.join(packaged, archives[0]);
      assert.equal(execFileSync('tar', ['-xzOf', archive, `${name}/files/pipeline/${path.basename(projectionFile(name))}`], { encoding: 'utf8' }), fs.readFileSync(projectionFile(name), 'utf8'));
      return spawnSync('helm', ['template', projection.deployment.releaseName, archive, '--namespace', projection.deployment.namespace, '-f', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    };
    const checksums = docs => docs.flatMap(doc => Object.entries(doc?.spec?.template?.metadata?.annotations ?? {})
      .filter(([key]) => ['checksum/swarm-config', 'checksum/pipeline-delivery', 'checksum/pipeline-config'].includes(key))
      .map(([key, value]) => [doc.metadata.name, key, value]));
    let imageIndex = 0;
    const deliver = async policy => {
      assert.deepEqual(capture(), policy);
      const image = await buildBusterImageBundle({ repository: privateRepository, output: path.join(root, `image-${imageIndex++}`), revision, builtAt });
      const manifest = JSON.parse(fs.readFileSync(path.join(image.packageRoot, 'manifest.json'), 'utf8'));
      assert.equal(manifest.commit, revision); assert.equal(manifest.builtAt, builtAt); assert.equal(image.metadata.revision, revision);
      const boot = await import(pathToFileURL(path.join(image.packageRoot, 'skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href);
      const installed = boot.capturePipelineBootReceipts(image.deliveryRoot, image.systemRoot, 'buster-preparation', image.packageRoot, '/app/skills');
      assert.equal(boot.captureBusterParentStartupHandoff(installed).childSelection.callerId, 'buster-runtime');
      const receiver = await import(pathToFileURL(path.join(image.packageRoot, 'skills/packages/plugin-foundation/config/pipeline-composition.ts')).href);
      const captures = [];
      for (const caller of ['buster-preparation', 'buster-runtime']) {
        const transport = path.join(root, `transport-${imageIndex}-${caller}`); fs.mkdirSync(transport);
        fs.cpSync(path.join(path.dirname(image.systemRoot), 'expected', caller), path.join(transport, 'version-A'), { recursive: true });
        fs.symlinkSync('version-A', path.join(transport, '..data'));
        const capture = () => boot.capturePipelineBootReceipts(transport, image.systemRoot, caller, image.packageRoot, '/app/skills');
        const selectedCapture = capture();
        const settings = receiver.projectBusterSettings(selectedCapture, caller);
        assert.deepEqual(settings.clusterInvokers, policy); assert(Object.isFrozen(settings.clusterInvokers));
        assert.throws(() => receiver.projectBusterSettings(selectedCapture, caller === 'buster-runtime' ? 'buster-preparation' : 'buster-runtime'), /PIPELINE_VERIFIED_CAPTURE_REQUIRED/u);
        captures.push({ caller, capture });
      }
      const delivered = path.join(image.packageRoot, 'skills/packages/buster-engine/remote-plan-cli.ts');
      const source = fs.readFileSync(delivered); assert.deepEqual(source, fs.readFileSync('skills/buster/engine/remote-plan-cli.ts'));
      try {
        fs.appendFileSync(delivered, '\n// altered delivered parity source\n');
        for (const { capture } of captures) assert.throws(capture, /PIPELINE_PACKAGE_READBACK_MISMATCH/u);
      } finally { fs.writeFileSync(delivered, source); }
      for (const { caller, capture } of captures) assert.deepEqual(receiver.projectBusterSettings(capture(), caller).clusterInvokers, policy);
      values.kubeclaw.pipelineDelivery = { buster: image.metadata };
      const result = {};
      for (const name of ['kubeclaw', 'prism']) {
        const projection = projectors[name](authorRoot); write(projectionFile(name), projection);
        const rendered = render(name); assert.equal(rendered.status, 0, rendered.stderr);
        const docs = yaml.loadAll(rendered.stdout); assert(checksums(docs).length > 0);
        assert(!docs.some(doc => doc?.data?.['swarm.config.json']), 'no obsolete runtime author ConfigMap');
        if (name === 'kubeclaw') {
          const map = docs.find(doc => doc?.kind === 'ConfigMap' && doc.data?.['expected-delivery.json']); assert(map);
          assert.deepEqual(JSON.parse(map.data['expected-delivery.json']), image.metadata.expected);
          const crd = docs.find(doc => doc?.kind === 'CustomResourceDefinition' && doc.spec?.names?.plural === 'busternamespaceleases');
          assert(crd); assert.equal(crd.spec.group, policy.shared.leaseApiGroup); assert.equal(crd.spec.versions[0].name, policy.shared.leaseApiVersion);
          const client = docs.find(doc => doc?.kind === 'Role' && doc.metadata?.name?.endsWith('namespace-lease-client'));
          assert(client); assert(client.rules.filter(rule => rule.resources?.includes('busternamespaceleases')).every(rule => rule.apiGroups.length === 1 && rule.apiGroups[0] === policy.shared.leaseApiGroup));
          const controller = docs.find(doc => doc?.kind === 'Deployment' && doc.spec.template.spec.containers.some(container => container.env?.some(item => item.name === 'BUSTER_LEASE_API_GROUP')));
          assert(controller); const environment = controller.spec.template.spec.containers.flatMap(container => container.env ?? []);
          assert.equal(environment.find(item => item.name === 'BUSTER_LEASE_API_GROUP').value, policy.shared.leaseApiGroup);
          assert.equal(environment.find(item => item.name === 'BUSTER_LEASE_API_VERSION').value, policy.shared.leaseApiVersion);
        }
        result[name] = { docs, digest: projection.generationDigest };
      }
      return result;
    };
    writePolicy(selected); // Pin the exact canonical test bytes used by restored A too.
    const first = await deliver(selected);
    // Retired chart-local files are inert, not another live profile selection.
    for (const name of ['kubeclaw', 'prism']) {
      const retired = path.join(charts[name], 'files/config/buster-engine.config.json'); fs.mkdirSync(path.dirname(retired), { recursive: true });
      const existing = fs.existsSync(retired) ? fs.readFileSync(retired) : null;
      const active = fs.readFileSync(projectionFile(name));
      if (!existing) fs.writeFileSync(retired, '', { flag: 'wx' });
      write(retired, JSON.stringify({ owner: 'buster-engine', settings: { clusterInvokers: { diagnosticCodeUnits: 999 } } }));
      const rendered = render(name); assert.equal(rendered.status, 0, rendered.stderr);
      assert.deepEqual(fs.readFileSync(projectionFile(name)), active);
      assert.deepEqual(checksums(yaml.loadAll(rendered.stdout)), checksums(first[name].docs));
      if (existing) { assertPrivate(retired); fs.writeFileSync(retired, existing); } else fs.rmSync(retired);
      for (const selection of [null, '', '../buster-engine.config.json', 'files/config/prism-worker.config.json', 'files/config/profiles/buster-engine.missing.config.json', 'files/config/buster-engine.config.json']) {
        values[name].busterComponentFile = selection;
        const rejected = render(name); assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /retired|[Aa]dditional propert.*busterComponentFile/);
      }
      delete values[name].busterComponentFile;
    }
    // Complete profile selected by the real central service tuple; physical
    // component locators are no longer Helm values or independent writers.
    const profiled = structuredClone(baseline['buster-engine']); profiled.profiles.proof = structuredClone(profiled.profiles.runtime);
    write(ownerFile, profiled); const selectedEntry = structuredClone(baseline.entry);
    selectedEntry.bindings.find(item => item.owner === 'buster-engine').profileId = 'proof'; write(entry, selectedEntry);
    assert.deepEqual(capture(), selected);
    for (const value of [null, '', '../runtime', 'missing']) {
      const wrong = structuredClone(selectedEntry); wrong.bindings.find(item => item.owner === 'buster-engine').profileId = value; write(entry, wrong);
      for (const project of Object.values(projectors)) assert.throws(() => project(authorRoot), /SWARM|PIPELINE/);
      assert.throws(capture, /SWARM|PIPELINE/);
    }
    write(entry, selectedEntry);
    const empty = structuredClone(profiled); empty.profiles.proof = {}; write(ownerFile, empty); assert.throws(capture, /SWARM|PIPELINE/);
    for (const project of Object.values(projectors)) assert.throws(() => project(authorRoot), /SWARM|PIPELINE/);
    const wrongOwner = structuredClone(profiled); wrongOwner.owner = 'prism-worker'; write(ownerFile, wrongOwner); assert.throws(capture, /SWARM|PIPELINE/);
    for (const project of Object.values(projectors)) assert.throws(() => project(authorRoot), /SWARM|PIPELINE/);
    writePolicy(selected);
    const changed = structuredClone(selected);
    changed.runtimeSecurity.maximumExecutionMs = 4000;
    changed.runtimeSecurity.maximumOutputBytes = 8192;
    changed.runtimeSecurity.pollIntervalMs = 50;
    changed.runtimeSecurity.maximumObservationAgeMs = 3000;
    changed.runtimeSecurity.maximumFutureSkewMs = 0;
    changed.runtimeSecurity.diagnosticCodeUnits = 79;
    changed.runtimeSecurity.executableSearchPath = ['/policy/bin'];
    changed.runtimeSecurity.allowedNamespacePrefixes = ['proof'];
    changed.shared.leaseApiGroup = 'leases.example.test'; changed.shared.leaseApiVersion = 'v2';
    changed.kubernetesFixture.pollIntervalMs = 75; changed.kubernetesFixture.shortCommandTimeoutMs = 700; changed.kubernetesFixture.diagnosticCodeUnits = 96;
    changed.tailscaleExposure.pollIntervalMs = 25; changed.tailscaleExposure.maximumCommandOutputBytes = 2048;
    writePolicy(changed); const second = await deliver(changed);
    for (const name of ['kubeclaw', 'prism']) { assert.notEqual(second[name].digest, first[name].digest); assert.notDeepEqual(checksums(second[name].docs), checksums(first[name].docs)); }
    const inspectedPrefixes = structuredClone(selected); inspectedPrefixes.runtimeSecurity.allowedNamespacePrefixes = ['a'.repeat(50), 'test-', ...Array(33).fill('test')];
    writePolicy(inspectedPrefixes); await deliver(inspectedPrefixes);
    for (const version of ['v1', 'v1alpha1', 'v2beta12']) {
      const policy = structuredClone(selected); policy.shared.leaseApiVersion = version; writePolicy(policy);
      for (const project of Object.values(projectors)) project(authorRoot);
      assert.equal(capture().shared.leaseApiVersion, version);
    }
    const invalid = [undefined, { ...selected, extra: 1 }];
    for (const version of ['v1alpha', 'v1beta', 'v1rc1', 'v1alpha1x', '']) {
      const policy = structuredClone(selected); policy.shared.leaseApiVersion = version; invalid.push(policy);
    }
    const collect = (value, prefix = []) => Object.entries(value).flatMap(([key, child]) =>
      child && typeof child === 'object' && !Array.isArray(child) ? collect(child, [...prefix, key]) : [[...prefix, key]]);
    for (const location of collect(selected)) {
      const current = location.reduce((value, key) => value[key], selected);
      const invalidValues = typeof current === 'number' ? [undefined, null, true, '10', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]
        : typeof current === 'boolean' ? [undefined, null, 0, 'true'] : [undefined, null, 42, {}];
      // Zero is explicitly supported for future skew; all preexisting numeric negatives remain.
      const rejectedValues = location.join('.') === 'runtimeSecurity.maximumFutureSkewMs'
        ? invalidValues.filter(value => value !== 0) : invalidValues;
      for (const value of rejectedValues) {
        const variant = structuredClone(selected);
        const parent = location.slice(0, -1).reduce((item, key) => item[key], variant);
        parent[location.at(-1)] = value; invalid.push(variant);
      }
    }
    const incoherent = structuredClone(selected);
    incoherent.kubernetesFixture.maximumPersistentVolumeTotalBytes = 1; invalid.push(incoherent);
    const tailPoll = structuredClone(selected);
    tailPoll.tailscaleExposure.pollIntervalMs = tailPoll.tailscaleExposure.maximumExecutionMs + 1; invalid.push(tailPoll);
    const securityAge = structuredClone(selected);
    securityAge.runtimeSecurity.maximumObservationAgeMs = securityAge.runtimeSecurity.pollIntervalMs - 1;
    invalid.push(securityAge);
    for (const executableSearchPath of [[], ['relative'], ['/bin:/escape'], ['/bin\0']]) {
      const policy = structuredClone(selected); policy.runtimeSecurity.executableSearchPath = executableSearchPath;
      invalid.push(policy);
    }
    let rejectedPolicies = 0;
    for (const policy of invalid) {
      writePolicy(policy);
      for (const project of Object.values(projectors)) assert.throws(() => project(authorRoot), /SWARM|PIPELINE|cluster/i);
      assert.throws(capture, /SWARM|PIPELINE/); rejectedPolicies++;
    }
    writePolicy(selected); const restored = await deliver(selected);
    for (const name of ['kubeclaw', 'prism']) {
      assert.equal(restored[name].digest, first[name].digest);
      assert.deepEqual(checksums(restored[name].docs), checksums(first[name].docs));
      const brokerPresent = Object.hasOwn(values[name], 'busterNamespaceBroker'), originalBroker = values[name].busterNamespaceBroker;
      for (const key of ['leaseApiGroup', 'leaseApiVersion']) for (const value of ['', selected.shared[key]]) {
        values[name].busterNamespaceBroker = { ...originalBroker, [key]: value };
        const rejected = render(name); assert.notEqual(rejected.status, 0);
        assert.match(rejected.stderr, name === 'prism' ? /(?:additional properties 'busterNamespaceBroker' not allowed|Additional property busterNamespaceBroker is not allowed)/ : new RegExp(`retired busterNamespaceBroker[.]${key}`));
      }
      if (brokerPresent) values[name].busterNamespaceBroker = originalBroker; else delete values[name].busterNamespaceBroker;
      const final = render(name); assert.equal(final.status, 0, final.stderr);
    }
    for (let i = 0; i < sourceFiles.length; i++) assert.deepEqual(fs.readFileSync(sourceFiles[i]), sourceBytes[i]);
    console.log(JSON.stringify({ originalMalformedPoliciesRejected: rejectedPolicies, chartGeneratorsPerNegative: 2, actualPackagedRoleBoots: imageIndex, chartsPerDelivery: 2, nativeExecution: false }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
