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
test('both actual charts, packaged role boot and loader enforce shared process-input policy', async () => {
  const repository = process.cwd(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'process-input-chart-'));
  try {
    const privateRepository = path.join(root, 'repository'); fs.mkdirSync(privateRepository);
    fs.cpSync('config', path.join(privateRepository, 'config'), { recursive: true, dereference: true });
    for (const directory of ['scripts', 'skills']) fs.symlinkSync(path.join(repository, directory), path.join(privateRepository, directory));
    const authorRoot = path.join(privateRepository, 'config'), entry = path.join(authorRoot, 'pipeline.config.json');
    const ownerFile = path.join(authorRoot, 'components/buster-engine.config.json');
    const baseline = readTestPipeline(entry), selected = baseline['buster-engine'].profiles.runtime.settings.execution.processInput;
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
      const document = structuredClone(baseline['buster-engine']); document.profiles.runtime.settings.execution.processInput = policy;
      write(ownerFile, document); write(entry, baseline.entry);
    };
    const capture = () => captureSwarmSettings(entry, busterRuntimeSelection(readTestPipeline(entry))).components['buster-engine'].settings.execution.processInput;
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
        assert.deepEqual(settings.execution.processInput, policy); assert(Object.isFrozen(settings.execution.processInput));
        assert.throws(() => receiver.projectBusterSettings(selectedCapture, caller === 'buster-runtime' ? 'buster-preparation' : 'buster-runtime'), /PIPELINE_VERIFIED_CAPTURE_REQUIRED/u);
        captures.push({ caller, capture });
      }
      const delivered = path.join(image.packageRoot, 'skills/packages/buster-engine/remote-plan-cli.ts');
      const source = fs.readFileSync(delivered); assert.deepEqual(source, fs.readFileSync('skills/buster/engine/remote-plan-cli.ts'));
      try {
        fs.appendFileSync(delivered, '\n// altered delivered parity source\n');
        for (const { capture } of captures) assert.throws(capture, /PIPELINE_PACKAGE_READBACK_MISMATCH/u);
      } finally { fs.writeFileSync(delivered, source); }
      for (const { caller, capture } of captures) assert.deepEqual(receiver.projectBusterSettings(capture(), caller).execution.processInput, policy);
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
        }
        result[name] = { docs, digest: projection.generationDigest };
      }
      return result;
    };
    const policies = [
      { cleanupTimeoutMs: 1500, terminationGraceMs: 250, acknowledgementPollMs: 10 },
      { cleanupTimeoutMs: 2400, terminationGraceMs: 400, acknowledgementPollMs: 25 },
    ];
    writePolicy(policies[0]); const first = await deliver(policies[0]);
    writePolicy(policies[1]); const second = await deliver(policies[1]);
    for (const name of ['kubeclaw', 'prism']) {
      assert.notEqual(second[name].digest, first[name].digest);
      assert.notDeepEqual(checksums(second[name].docs), checksums(first[name].docs));
      // Neither retired raw files nor an old Helm locator can become an author.
      const retired = path.join(charts[name], 'files/config/buster-engine.config.json');
      fs.mkdirSync(path.dirname(retired), { recursive: true });
      const original = fs.existsSync(retired) ? fs.readFileSync(retired) : null;
      if (!original) fs.writeFileSync(retired, '', { flag: 'wx' });
      write(retired, { settings: { execution: { processInput: policies[0] } } });
      const rendered = render(name); assert.equal(rendered.status, 0, rendered.stderr);
      assert.deepEqual(checksums(yaml.loadAll(rendered.stdout)), checksums(second[name].docs));
      if (original) { assertPrivate(retired); fs.writeFileSync(retired, original); } else fs.rmSync(retired);
      values[name].busterComponentFile = 'files/config/buster-engine.config.json';
      const rejected = render(name); assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /retired|[Aa]dditional propert.*busterComponentFile/);
      delete values[name].busterComponentFile;
    }
    const invalid = [undefined, { ...selected, extra: 1 },
      { ...selected, terminationGraceMs: selected.cleanupTimeoutMs },
      { ...selected, acknowledgementPollMs: selected.cleanupTimeoutMs + 1 }];
    for (const field of Object.keys(selected)) {
      for (const value of [undefined, null, true, '10', 0, -1, 1.5, 2147483648]) {
        invalid.push({ ...selected, [field]: value });
      }
    }
    for (const policy of invalid) {
      writePolicy(policy);
      // Normal chart-generation boundary validates all profiles before Helm.
      for (const project of Object.values(projectors)) assert.throws(() => project(authorRoot), /SWARM|PIPELINE|buster execution/i);
      assert.throws(capture, /SWARM|PIPELINE/);
    }
    writePolicy(policies[0]); const restored = await deliver(policies[0]);
    for (const name of ['kubeclaw', 'prism']) {
      assert.equal(restored[name].digest, first[name].digest);
      assert.deepEqual(checksums(restored[name].docs), checksums(first[name].docs));
    }
    for (let i = 0; i < sourceFiles.length; i++) assert.deepEqual(fs.readFileSync(sourceFiles[i]), sourceBytes[i]);
    console.log(JSON.stringify({ originalMalformedPoliciesRejected: invalid.length, chartGeneratorsPerNegative: 2,
      actualPackagedRoleBoots: imageIndex, chartsPerDelivery: 2, nativeExecution: false }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
