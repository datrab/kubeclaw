// Original packaging, rollout, missing-member, Docker COPY and boundary obligations.
// Runtime authors now travel in the image generation; Helm packages topology only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { buildBusterImageBundle } from '../../../scripts/build-buster-image-bundle.mjs';
import { buildPrismImageBundle } from '../../../scripts/build-prism-image-bundle.mjs';
import { busterChartProjection } from '../../../scripts/generate-buster-chart-config.mjs';
import { prismChartProjection } from '../../../scripts/generate-prism-chart-config.mjs';
import { declaredPipelineServices, materializePipelineGeneration } from '../../../scripts/updates/pipeline-generation.mjs';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

const repository = process.cwd(), revision = 'a'.repeat(40), builtAt = '2026-10-16T00:00:00Z';
const owners = ['prism-control', 'prism-studio', 'prism-worker', 'prism-execution', 'buster-engine', 'worker-core'];
let root, privateRepository, authorRoot, canonical, baseline, images;
let sequence = 0;
test.before(async () => {
 root = fs.mkdtempSync(path.join(os.tmpdir(), 'component-package-current-'));
 privateRepository = path.join(root, 'repository'); fs.mkdirSync(privateRepository);
 fs.cpSync('config', path.join(privateRepository, 'config'), { recursive: true, dereference: true });
 for (const name of ['scripts', 'skills']) fs.symlinkSync(path.join(repository, name), path.join(privateRepository, name));
 authorRoot = path.join(privateRepository, 'config');
 canonical = JSON.parse(fs.readFileSync(path.join(authorRoot, 'pipeline.config.json'), 'utf8'));
 baseline = Object.fromEntries(owners.map(owner => [owner, fs.readFileSync(path.join(authorRoot, canonical.components[owner]))]));
 images = {
  kubeclaw: await buildBusterImageBundle({ repository: privateRepository, output: path.join(root, 'buster-image'), revision, builtAt }),
  prism: await buildPrismImageBundle({ repository: privateRepository, output: path.join(root, 'prism-image'), callerId: 'prism-control', revision, builtAt }),
 };
});
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
function restore() { for (const owner of owners) fs.writeFileSync(path.join(authorRoot, canonical.components[owner]), baseline[owner]); }
function mutate(owner, operation) {
 const file = path.join(authorRoot, canonical.components[owner]), value = JSON.parse(baseline[owner]);
 // Mutate the actual profiles, including distinct selected SPIFFE/runtime profiles.
 for (const profile of Object.values(value.profiles)) operation(profile.settings);
 fs.writeFileSync(file, JSON.stringify(value));
}
const project = (name) => (name === 'prism' ? prismChartProjection : busterChartProjection)(authorRoot);
const topologyName = name => `${name === 'prism' ? 'prism' : 'buster'}-topology.json`;
function chartFixture(t, name) {
 const directory = fs.mkdtempSync(path.join(root, `${name}-chart-`));
 t.after(() => { restore(); fs.rmSync(directory, { recursive: true, force: true }); });
 const chart = path.join(directory, name); fs.cpSync(`charts/${name}`, chart, { recursive: true, dereference: true });
 const values = yaml.load(fs.readFileSync(name === 'prism' ? 'charts/prism/ci-values.yaml' : 'my-values/buster-values.yaml', 'utf8'));
 if (name === 'kubeclaw') {
  values.busterNative = { namespace: images.kubeclaw.metadata.namespace, nodeName: 'component-render-only', policyDigest: 'a'.repeat(64) };
  values.runtimeInfrastructure = { registry: { endpoint: 'https://registry.example.test', transport: 'https', authSecretName: 'registry-test' } };
  values.extraContainers.find(item => item.name === 'buster-v2-runtime').image = `ghcr.io/datrab/kubeclaw-buster-runtime@sha256:${'a'.repeat(64)}`;
  values.pipelineDelivery = { buster: images.kubeclaw.metadata };
 }
 const projectionFile = path.join(chart, 'files/pipeline', topologyName(name));
 const render = projection => {
  fs.writeFileSync(projectionFile, JSON.stringify(projection));
  const file = path.join(directory, 'values.yaml'); fs.writeFileSync(file, yaml.dump(values));
  return yaml.loadAll(execFileSync('helm', ['template', projection.deployment.releaseName, chart, '--namespace', projection.deployment.namespace, '-f', file], { encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 })).filter(Boolean);
 };
 return { directory, chart, projectionFile, values, render };
}
function checksums(documents, name) {
 const key = name === 'kubeclaw' ? 'checksum/pipeline-delivery' : 'checksum/swarm-config';
 return Object.fromEntries(documents.filter(doc => doc.kind === 'Deployment' && doc.spec.template.metadata.annotations?.[key])
  .map(doc => [doc.metadata.name, doc.spec.template.metadata.annotations[key]]));
}
async function generation(name) {
 const projection = project(name), image = images[name];
 const role = name === 'prism' ? 'prism' : 'buster';
 const services = declaredPipelineServices(authorRoot, { role, ...projection.deployment });
 const output = path.join(root, `generation-${sequence++}`);
 await materializePipelineGeneration({ authorRoot, packageRoot: image.packageRoot, output, services, publisher: path.join(path.dirname(image.packageRoot), 'publish') });
 const caller = name === 'prism' ? 'prism-control' : 'buster-preparation';
 const expected = JSON.parse(fs.readFileSync(path.join(output, 'expected', caller, 'expected-delivery.json'), 'utf8'));
 assert.equal(expected.generationDigest, projection.generationDigest);
 return { projection, output, expected };
}
for (const name of ['prism', 'kubeclaw']) test(`${name} package contains the complete canonical bundle and shared validator`, t => {
 const f = chartFixture(t, name), projection = project(name), image = images[name];
 f.render(projection);
 execFileSync('helm', ['package', f.chart, '--destination', f.directory], { stdio: 'pipe' });
 const archive = path.join(f.directory, fs.readdirSync(f.directory).find(file => file.endsWith('.tgz')));
 assert.deepEqual(JSON.parse(execFileSync('tar', ['-xzOf', archive, `${name}/files/pipeline/${topologyName(name)}`], { encoding: 'utf8' })), projection);
 const members = ['pipeline.config.json', ...Object.values(canonical.components)];
 for (const member of members) assert.deepEqual(fs.readFileSync(path.join(image.systemRoot, member)), fs.readFileSync(path.join(authorRoot, member)), member);
 const foundation = path.join(image.packageRoot, 'skills/packages/plugin-foundation/config');
 for (const member of ['swarm.ts', 'swarm.schema.json', 'swarm-components.schema.json'])
  assert.deepEqual(fs.readFileSync(path.join(foundation, member)), fs.readFileSync(path.join(repository, 'skills/common/plugin-runtime/foundation/config', member)), member);
});
const changes = {
 'prism-control': settings => { settings.dispatchTimeoutMs++; },
 'prism-studio': settings => { settings.controlTimeoutMs++; },
 'prism-worker': settings => { settings.ingress.maximumConnections++; },
 'prism-execution': settings => { settings.maximumResultBytes++; },
 'buster-engine': settings => { settings.admission.maximumQueuedJobs++; },
 'worker-core': settings => { settings.localRuntime.replayLimit++; },
};
for (const name of ['prism', 'kubeclaw']) test(`${name}: each component changes real rollout checksum; omitted checksum is detected`, async t => {
 const f = chartFixture(t, name), original = checksums(f.render(project(name)), name);
 assert(Object.keys(original).length > 0);
 for (const [owner, change] of Object.entries(changes)) {
  restore(); mutate(owner, change);
  const emitted = await generation(name);
  if (name === 'kubeclaw') {
   // A genuine old receipt must not authorize a different generation.
   assert.throws(() => f.render(emitted.projection), /generation mismatch/);
   f.values.pipelineDelivery.buster = { ...images.kubeclaw.metadata, expected: emitted.expected };
  }
  const documents = f.render(emitted.projection), next = checksums(documents, name);
  assert.deepEqual(Object.keys(next), Object.keys(original));
  for (const role of Object.keys(original)) assert.notEqual(next[role], original[role], `${name}/${role}/${owner}`);
  assert.deepEqual(fs.readFileSync(path.join(emitted.output, 'system', canonical.components[owner])), fs.readFileSync(path.join(authorRoot, canonical.components[owner])));
 }
 restore(); if (name === 'kubeclaw') f.values.pipelineDelivery.buster = images.kubeclaw.metadata;
 const template = path.join(f.chart, 'templates', name === 'prism' ? 'workloads.yaml' : 'deployment.yaml');
 const before = fs.readFileSync(template, 'utf8');
 const key = name === 'kubeclaw' ? 'pipeline-delivery' : 'swarm-config';
 const mutant = before.replace(new RegExp(`checksum/${key}: [^\\n]+`), `checksum/${key}: "${'0'.repeat(64)}"`);
 assert.notEqual(mutant, before); fs.writeFileSync(template, mutant);
 const frozen = checksums(f.render(project(name)), name);
 mutate('buster-engine', changes['buster-engine']); const emitted = await generation(name);
 if (name === 'kubeclaw') f.values.pipelineDelivery.buster = { ...images.kubeclaw.metadata, expected: emitted.expected };
 const after = checksums(f.render(emitted.projection), name);
 assert.throws(() => { for (const role of Object.keys(frozen)) assert.notEqual(after[role], frozen[role]); }, { code: 'ERR_ASSERTION' });
});
for (const name of ['prism', 'kubeclaw']) test(`${name}: real archive missing a required component fails the complete delivery oracle`, async t => {
 const f = chartFixture(t, name), projection = project(name); f.render(projection);
 fs.unlinkSync(f.projectionFile);
 execFileSync('helm', ['package', f.chart, '--destination', f.directory], { stdio: 'pipe' });
 const archive = path.join(f.directory, fs.readdirSync(f.directory).find(file => file.endsWith('.tgz')));
 assert.throws(() => execFileSync('tar', ['-xzOf', archive, `${name}/files/pipeline/${topologyName(name)}`], { stdio: 'pipe' }));
 const valuesFile = path.join(f.directory, 'values.yaml');
 assert.throws(() => execFileSync('helm', ['template', projection.deployment.releaseName, f.chart, '--namespace', projection.deployment.namespace, '-f', valuesFile], { stdio: 'pipe' }), /topology required/);
 // Raw policy moved out of Helm, not out of the original missing-member obligation.
 const image = images[name], file = path.join(image.systemRoot, canonical.components['prism-execution']);
 const original = fs.readFileSync(file); fs.unlinkSync(file);
 const boot = await import(pathToFileURL(path.join(image.packageRoot, 'skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href);
 const caller = name === 'prism' ? 'prism-control' : 'buster-preparation';
 try { assert.throws(() => boot.capturePipelineBootReceipts(image.deliveryRoot, image.systemRoot, caller, image.packageRoot, name === 'prism' ? '/app/prism/skills' : '/app/skills'), /ENOENT|READBACK|MISSING/); }
 finally { fs.writeFileSync(file, original, { mode: 0o444 }); }
 boot.capturePipelineBootReceipts(image.deliveryRoot, image.systemRoot, caller, image.packageRoot, name === 'prism' ? '/app/prism/skills' : '/app/skills');
});
test('Buster image COPY contains all authored files; removing one source fails the same structural oracle', () => {
 const dockerfile = fs.readFileSync('docker/Dockerfile.buster-runtime', 'utf8');
 const assertCopy = source => {
  assert.match(source, /node scripts\/build-buster-image-bundle\.mjs \/image/);
  for (const [from, to] of [['/image/role', '/app'], ['/image/generation/system', '/etc/kubeclaw/config'], ['/image/delivery', '/opt/buster-image-tools/baked-delivery']])
   assert(source.split('\n').includes(`COPY --from=buster-package ${from} ${to}`), from);
 };
 assertCopy(dockerfile);
 const mutant = dockerfile.replace('COPY --from=buster-package /image/generation/system /etc/kubeclaw/config', '');
 assert.notEqual(mutant, dockerfile); assert.throws(() => assertCopy(mutant), { code: 'ERR_ASSERTION' });
});
for (const name of ['prism', 'kubeclaw']) test(`${name}: worker-core AJV/Helm integer-boundary parity`, () => {
 const services = declaredPipelineServices(authorRoot, { role: name === 'prism' ? 'prism' : 'buster', ...project(name).deployment });
 const selection = services.find(service => service.bindings.some(binding => binding.owner === 'worker-core')); assert(selection);
 try {
  for (const [field, maximum] of [['drainTimeoutMs', 2147483647], ['cancellationTimeoutMs', 2147483647], ['replayLimit', 1000000]]) {
   for (const value of [undefined, null, true, '1', 0, -1, 1.5, maximum + 1]) {
    restore(); mutate('worker-core', settings => { if (value === undefined) delete settings.localRuntime[field]; else settings.localRuntime[field] = value; });
    assert.throws(() => captureSwarmSettings(path.join(authorRoot, 'pipeline.config.json'), selection), /SWARM_CONFIG_INVALID/);
    // Normal Helm projection now owns the pre-delivery validation boundary.
    assert.throws(() => project(name), /SWARM_CONFIG_INVALID/);
   }
   for (const value of [1, maximum]) {
    restore(); mutate('worker-core', settings => { settings.localRuntime[field] = value; });
    assert.equal(captureSwarmSettings(path.join(authorRoot, 'pipeline.config.json'), selection).components['worker-core'].settings.localRuntime[field], value);
    assert.doesNotThrow(() => project(name));
   }
  }
 } finally { restore(); }
});
