// Original chart/consumer obligations, migrated to actual image-generation delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { buildPrismImageBundle } from '../../../scripts/build-prism-image-bundle.mjs';
import { prismChartProjection } from '../../../scripts/generate-prism-chart-config.mjs';
import { declaredPipelineServices, materializePipelineGeneration } from '../../../scripts/updates/pipeline-generation.mjs';
const root = path.resolve(import.meta.dirname, '../../..');
const owners = ['prism-control','prism-studio','prism-worker','prism-execution','buster-engine','worker-core'];
function readTestBundle(file) {
  const entry = JSON.parse(fs.readFileSync(file));
  return { entry, ...Object.fromEntries(owners.map(owner => [owner, JSON.parse(fs.readFileSync(path.join(path.dirname(file), entry.components[owner])))])) };
}
function writeTestBundle(file, documents) {
  fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(documents.entry));
  for (const owner of owners) {
    const target = path.join(path.dirname(file), documents.entry.components[owner]);
    fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, JSON.stringify(documents[owner]));
  }
}
const base = readTestBundle(path.join(root,'config/pipeline.config.json'));
function projectTestBundle(documents) {
  const control = documents['prism-control'].profiles.spiffe.settings;
  return {operator:{prism:{native:{...documents['prism-execution'].profiles.standard.settings,
    dispatchTimeoutMs:control.dispatchTimeoutMs,supervisor:documents['prism-worker'].profiles.standard.settings.supervisor}}}};
}
let suiteRoot, image, baselineChart, boot, installedWorker, installedControl, installedStudio, sequence=0;
const generations = new Map(), documentGenerations = new WeakMap();
test.before(async () => {
  suiteRoot=fs.mkdtempSync(path.join(os.tmpdir(),'prism-chart-current-'));
  image=await buildPrismImageBundle({repository:root, output:path.join(suiteRoot,'image'),callerId:'prism-control',revision:'a'.repeat(40),builtAt:'2026-10-16T00:00:00Z'});
  boot=await import(pathToFileURL(path.join(image.packageRoot,'skills/packages/plugin-foundation/config/pipeline-boot.mjs')).href);
  installedWorker=await import(pathToFileURL(path.join(image.packageRoot,'skills/packages/prism-engine/server/worker-config.ts')).href);
  installedControl=await import(pathToFileURL(path.join(image.packageRoot,'skills/packages/prism-engine/server/control-config.ts')).href);
  installedStudio=await import(pathToFileURL(path.join(image.packageRoot,'skills/packages/prism-engine/server/studio-config.ts')).href);
  baselineChart=createChart();
});
test.after(()=>fs.rmSync(suiteRoot,{recursive:true,force:true}));
function createChart() {
  const directory=fs.mkdtempSync(path.join(suiteRoot,'fixture-')), chart=path.join(directory,'prism');
  fs.cpSync(path.join(root,'charts/prism'),chart,{recursive:true,dereference:true});
  fs.cpSync(path.join(root,'config'),path.join(chart,'author'),{recursive:true,dereference:true});
  return chart;
}
function copiedChart(t) { const chart=createChart(); t.after(()=>fs.rmSync(path.dirname(chart),{recursive:true,force:true}));return chart; }
function selectTrust(documents, spiffe) {
  for (const binding of documents.entry.bindings)
    if(binding.owner==='prism-control' && ['kubeclaw/prism/prism-control','kubeclaw/prism/prism-worker'].includes(binding.instanceId)) binding.profileId=spiffe?'spiffe':'standard';
}
async function helm(requested, extra=[]) {
  const chart=requested===path.join(root,'charts/prism')?baselineChart:requested;
  const authorRoot=path.join(chart,'author');
  let projection;
  try { projection=prismChartProjection(authorRoot); }
  catch(error) { return {status:1,stderr:String(error),stdout:''}; }
  fs.writeFileSync(path.join(chart,'files/pipeline/prism-topology.json'),JSON.stringify(projection));
  const result=spawnSync('helm',['template',projection.deployment.releaseName,chart,'--namespace',projection.deployment.namespace,'-f',path.join(chart,'ci-values.yaml'),...extra],{encoding:'utf8',maxBuffer:16*1024*1024});
  if(result.status===0) {
    const output=path.join(suiteRoot,`generation-${sequence++}`);
    await materializePipelineGeneration({authorRoot,packageRoot:image.packageRoot,output,services:declaredPipelineServices(authorRoot,{role:'prism',...projection.deployment}),publisher:path.join(suiteRoot,'image/publish')});
    const emitted={chart,output,projection};generations.set(chart,emitted); result.emitted=emitted;
  }
  return result;
}
async function render(chart,extra) {
  const result=await helm(chart,extra);assert.equal(result.status,0,result.stderr);
  const documents=yaml.loadAll(result.stdout).filter(Boolean);documentGenerations.set(documents,result.emitted);return documents;
}
function delivery(documents,role='worker') {
  const emitted=documentGenerations.get(documents);assert.ok(emitted,'real emitted generation required');
  const config=documents.find(d=>d.kind==='ConfigMap'&&d.metadata.name==='prism-config-provenance');
  assert.deepEqual(JSON.parse(config.data['projection.json']),emitted.projection);
  const deployment=documents.find(d=>d.kind==='Deployment'&&d.metadata.name===`prism-${role}`);
  const container=deployment.spec.template.spec.containers.find(c=>c.name===role);
  const environment=Object.fromEntries(container.env.filter(e=>'value'in e).map(e=>[e.name,e.value]));
  assert.equal(environment.SWARM_CONFIG,undefined,'image generation, no mutable runtime policy locator');
  assert.ok(!Object.keys(environment).some(k=>/^PRISM_WORKER_(?:MAXIMUM_|REQUEST_BODY_TIMEOUT|SHUTDOWN_TIMEOUT)/.test(k)));
  assert.ok(!container.volumeMounts.some(m=>m.name==='swarm-config'),'raw policies may not regain a ConfigMap author');
  assert.equal(deployment.spec.template.metadata.annotations['checksum/swarm-config'],createHash('sha256').update(config.data['projection.json'].trim()).digest('hex'));
  const actual=readTestBundle(path.join(emitted.output,'system/pipeline.config.json'));
  assert.deepEqual(actual,readTestBundle(path.join(emitted.chart,'author/pipeline.config.json')));
  return JSON.stringify(actual);
}
function captureFor(file,caller) {
  const emitted=generations.get(path.dirname(file));assert.ok(emitted,'published generation required');
  const mount=path.join(suiteRoot,`transport-${sequence++}`);fs.mkdirSync(mount);
  fs.cpSync(path.join(emitted.output,'expected',caller),path.join(mount,'version-A'),{recursive:true});fs.symlinkSync('version-A',path.join(mount,'..data'));
  return boot.capturePipelineBootReceipts(mount,path.join(emitted.output,'system'),caller,image.packageRoot,'/app/prism/skills');
}
function workerConfig(file,environment) { return installedWorker.loadWorkerConfig(captureFor(file,'prism-worker'),environment); }
function controlConfig(file,environment) { return installedControl.loadControlServerConfig(captureFor(file,'prism-control'),environment); }
test('CD01 original chart provenance matches the one immutable worker image generation', async () => {
  const bytes = delivery(await render(path.join(root, 'charts/prism')));
  assert.deepEqual(JSON.parse(bytes), base);
});
test('CD02 real Helm output from two author profiles drives the actual production loader', async t => {
  const chart = copiedChart(t);
  const profiles = [base, structuredClone(base)];
  profiles[1]['prism-worker'].profiles.standard.settings.ingress = { port: 23458, maximumActiveRequests: 7, maximumProbeRequests: 2, maximumConnections: 40, requestTimeoutMs: 3000, shutdownTimeoutMs: 130000, maximumInputBytes: 8192 };
  for (const authored of profiles) {
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), authored);
    const rendered = delivery(await render(chart));
    const file = path.join(chart, 'mounted-swarm.config.json'); writeTestBundle(file, JSON.parse(rendered));
    const actual = workerConfig(file, { WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://test/control' });
    assert.equal(actual.shutdownTimeoutMs, authored['prism-worker'].profiles.standard.settings.ingress.shutdownTimeoutMs);
    const { shutdownTimeoutMs, port, ...ingress } = authored['prism-worker'].profiles.standard.settings.ingress;
    assert.deepEqual(actual.ingress, ingress);
    assert.equal(actual.port, port);
  }
});
test('CD03 old Helm shutdown authority is rejected', async () => {
  const result = await helm(path.join(root, 'charts/prism'), ['--set', 'worker.shutdownTimeoutMs=120000']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /worker.shutdownTimeoutMs moved/);
});
for (const key of Object.keys(base['prism-worker'].profiles.standard.settings.ingress)) for (const invalid of ['3', null, -1, 0, 1.5, 2147483648, undefined]) test(`CD04 ${key} rejects ${String(invalid)} before rendering`, async t => {
  const chart = copiedChart(t); const config = structuredClone(base); config['prism-worker'].profiles.standard.settings.ingress[key] = invalid;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});
for (const location of ['entry', 'prism-worker', 'prism-worker.settings', 'prism-worker.settings.ingress']) test(`CD04 unknown key ${location || 'root'}`, async t => {
  const chart = copiedChart(t); const config = structuredClone(base); let object = config;
  for (const key of location.split('.').filter(Boolean)) object = key === 'settings' ? object.profiles.standard.settings : object[key]; object.unknown = 1;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});
test('CD04 connection overcommit fails Helm rendering', async t => {
  const chart = copiedChart(t); const config = structuredClone(base); config['prism-worker'].profiles.standard.settings.ingress.maximumConnections = 16;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_WORKER_CONNECTION_BUDGET_INVALID/);
});
for (const shutdownTimeoutMs of [100000, 150000]) test(`CD05 shutdown ${shutdownTimeoutMs} violates native-close or Pod grace`, async t => {
  const chart = copiedChart(t); const config = structuredClone(base); config['prism-worker'].profiles.standard.settings.ingress.shutdownTimeoutMs = shutdownTimeoutMs;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_WORKER_SHUTDOWN_BUDGET_INVALID|worker shutdown must cover/);
});
test('CD06 Helm packages the generated topology and image generation retains exact author/schema bytes', async t => {
  const chart = copiedChart(t); const docs = await render(chart); delivery(docs);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-swarm-package-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('helm', ['package', chart, '--destination', dir], { stdio: 'pipe' });
  const archive = path.join(dir, fs.readdirSync(dir).find(name => name.endsWith('.tgz')));
  assert.deepEqual(JSON.parse(execFileSync('tar', ['-xzOf', archive, 'prism/files/pipeline/prism-topology.json'], { encoding: 'utf8' })), JSON.parse(fs.readFileSync(path.join(chart, 'files/pipeline/prism-topology.json'))));
  const emitted = generations.get(chart);
  assert.deepEqual(readTestBundle(path.join(emitted.output, 'system/pipeline.config.json')), base);
  for (const name of ['swarm.schema.json', 'swarm-components.schema.json'])
    assert.deepEqual(fs.readFileSync(path.join(image.packageRoot, 'skills/packages/plugin-foundation/config', name)), fs.readFileSync(path.join(root, 'skills/common/plugin-runtime/foundation/config', name)));
});

for (const key of ['worker.native.maximumInputBytes', 'native.maximumInputBytes']) test(`CI05 old Helm input authority ${key} is rejected`, async () => {
  const result = await helm(path.join(root, 'charts/prism'), ['--set', `${key}=16777216`]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, key.startsWith('worker.') ? /Additional property maximumInputBytes is not allowed/ : /Additional property native is not allowed/);
});

for (const key of ['maximumResultBytes', 'dispatchTimeoutMs']) for (const invalid of ['3', null, -1, 0, 1.5, 2147483648, undefined]) test(`CR06 native ${key} rejects ${String(invalid)} before rendering`, async t => {
  const chart = copiedChart(t), config = structuredClone(base); config[key === 'dispatchTimeoutMs' ? 'prism-control' : 'prism-execution'].profiles[key === 'dispatchTimeoutMs' ? 'spiffe' : 'standard'].settings[key] = invalid;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});
for (const native of [undefined, null, { ...projectTestBundle(base).operator.prism.native, extra: 1 }]) test('CR06 missing or unknown native section fails rendering', async t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-execution'].profiles.standard.settings = native;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});
test('CR06 two real authored profiles deliver identical bytes and changing checksums to both roles', async t => {
  const chart = copiedChart(t), checksums = [];
  for (const native of [projectTestBundle(base).operator.prism.native, { ...projectTestBundle(base).operator.prism.native, maximumResultBytes: 8192, dispatchTimeoutMs: 3000 }]) {
    const config = structuredClone(base);
    config['prism-execution'].profiles.standard.settings = { ...config['prism-execution'].profiles.standard.settings, resourcePolicy: native.resourcePolicy, maximumResultBytes: native.maximumResultBytes };
    config['prism-control'].profiles.spiffe.settings.dispatchTimeoutMs = native.dispatchTimeoutMs;
    config['prism-worker'].profiles.standard.settings.supervisor = native.supervisor;
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
    const docs = await render(chart), workerBytes = delivery(docs), controlBytes = delivery(docs, 'control');
    assert.equal(controlBytes, workerBytes); assert.deepEqual(JSON.parse(controlBytes), config);
    const file = path.join(chart, 'mounted-swarm.config.json'); writeTestBundle(file, JSON.parse(controlBytes));
    const actual = controlConfig(file, { PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test',
      PRISM_WORKER_SECRET: 'test', PRISM_DISPATCH_SECRET: 'test', PRISM_INGESTION_SECRET: 'test' });
    const worker = workerConfig(file, { PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' });
    assert.equal(actual.maximumWorkerResponseBytes, native.maximumResultBytes);
    assert.equal(actual.nativeWorkerDispatchTimeoutMs, native.dispatchTimeoutMs); assert.deepEqual(worker.native, native);
    const roleChecksums = ['control', 'worker'].map(role => docs.find(d => d.kind === 'Deployment' && d.metadata.name === `prism-${role}`).spec.template.metadata.annotations['checksum/swarm-config']);
    assert.equal(roleChecksums[0], roleChecksums[1]); checksums.push(roleChecksums[0]);
  }
  assert.notEqual(checksums[0], checksums[1]);
});
for (const key of ['worker.native.maximumResultBytes', 'control.nativeWorkerDispatchTimeoutMs', 'control.maximumWorkerResponseBytes']) test(`CR06 old Helm authority ${key} rejected`, async () => {
  const result = await helm(path.join(root, 'charts/prism'), ['--set', `${key}=67108864`]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, key.startsWith('control.') ? /Control result limit belongs to prism-execution.config.json settings.maximumResultBytes; dispatch timeout belongs to prism-control.config.json settings.dispatchTimeoutMs/ : /Additional property/);
});

for (const key of ['cpuTimeMs', 'memoryBytes', 'tasks']) for (const invalid of ['3', null, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined]) test(`CP01 resource ${key} rejects ${String(invalid)} in Helm`, async t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-execution'].profiles.standard.settings.resourcePolicy[key] = invalid;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});
for (const policy of [undefined, null, { ...base['prism-execution'].profiles.standard.settings.resourcePolicy, processes: 2048 }]) test('CP01 unsupported resource policy rejected in Helm', async t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-execution'].profiles.standard.settings.resourcePolicy = policy;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});
for (const key of ['worker.native.resourcePolicy.tasks', 'control.nativeResourcePolicy.tasks']) test(`CP06 competing Helm ${key} is rejected`, async () => {
  const result = await helm(path.join(root, 'charts/prism'), ['--set', `${key}=2048`]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /resource policy must be authored|Additional property/);
});
test('CP06 two resource policies change both rendered snapshots and checksums', async t => {
  const chart = copiedChart(t), hashes = [];
  for (const policy of [base['prism-execution'].profiles.standard.settings.resourcePolicy, { cpuTimeMs: 123, memoryBytes: 4096, tasks: 7 }]) {
    const config = structuredClone(base); config['prism-execution'].profiles.standard.settings.resourcePolicy = policy;
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
    const docs = await render(chart);
    assert.deepEqual(JSON.parse(delivery(docs, 'control'))['prism-execution'].profiles.standard.settings.resourcePolicy, policy);
    assert.equal(delivery(docs), delivery(docs, 'control'));
    const checksums = ['control', 'worker'].map(role => docs.find(d => d.kind === 'Deployment' && d.metadata.name === `prism-${role}`).spec.template.metadata.annotations['checksum/swarm-config']);
    assert.equal(checksums[0], checksums[1]); hashes.push(checksums[0]);
  }
  assert.notEqual(hashes[0], hashes[1]);
});
test('CP01 Helm accepts the resource safe-integer ceiling without timer coercion', async t => {
  const chart = copiedChart(t), config = structuredClone(base);
  config['prism-execution'].profiles.standard.settings.resourcePolicy = { cpuTimeMs: Number.MAX_SAFE_INTEGER, memoryBytes: Number.MAX_SAFE_INTEGER, tasks: Number.MAX_SAFE_INTEGER };
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  assert.deepEqual(JSON.parse(delivery(await render(chart)))['prism-execution'].profiles.standard.settings.resourcePolicy, config['prism-execution'].profiles.standard.settings.resourcePolicy);
});

for (const key of Object.keys(base['prism-worker'].profiles.standard.settings.supervisor)) {
  for (const invalid of [undefined, null, '1', 0, -1, 1.5, key === 'maximumJournalBytes' ? 9007199254740992 : 2147483648]) {
    test(`CS5 Helm rejects supervisor ${key}=${String(invalid)}`, async t => {
      const chart = copiedChart(t), config = structuredClone(base);
      config['prism-worker'].profiles.standard.settings.supervisor[key] = invalid;
      writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
      const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
    });
  }
}
test('CS5 old Helm supervisor close author is rejected', async () => {
  const result = await helm(path.join(root, 'charts/prism'), ['--set', 'worker.native.closeTimeoutMs=105000']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /closeTimeoutMs/);
});
test('CS4 Helm uses authored drain as well as close in shutdown budget', async t => {
  const chart = copiedChart(t), config = structuredClone(base);
  for (const drainTimeoutMs of [14999, 15000, 15001]) {
    config['prism-worker'].profiles.standard.settings.supervisor.drainTimeoutMs = drainTimeoutMs;
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
    const result = await helm(chart);
    if (drainTimeoutMs < 15000) assert.equal(result.status, 0, result.stderr);
    else { assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_WORKER_SHUTDOWN_BUDGET_INVALID|worker shutdown must cover/); }
  }
});
test('CS5 both actual mounts and checksums deliver two supervisor profiles without old environment authors', async t => {
  const chart = copiedChart(t), config = structuredClone(base); let prior;
  for (const factor of [1, 2]) {
    const supervisor = { ...base['prism-worker'].profiles.standard.settings.supervisor, uid: 1000 + factor, gid: 2000 + factor, maximumOwnershipRecords: factor,
      maximumOwnershipBytes: 8192 * factor, maximumOutputBytes: 8 * factor, maximumJournalBytes: 16384 * factor,
      pollIntervalMs: 3 * factor, drainTimeoutMs: 7 * factor, closeTimeoutMs: 11 * factor };
    config['prism-worker'].profiles.standard.settings.supervisor = supervisor;
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
    const docs = await render(chart);
    for (const role of ['worker', 'control']) {
      const file = path.join(chart, `${role}-mounted.json`); writeTestBundle(file, JSON.parse(delivery(docs, role)));
      const loaded = workerConfig(file, { PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' });
      assert.deepEqual(loaded.native.supervisor, supervisor);
      const deployment = docs.find(d => d.kind === 'Deployment' && d.metadata.name === `prism-${role}`);
      const container = deployment.spec.template.spec.containers.find(c => c.name === role);
      assert.ok(!container.env.some(e => /^PRISM_NATIVE_(?:UID|GID|MAXIMUM_OWNERSHIP_|MAXIMUM_OUTPUT_|MAXIMUM_JOURNAL_|POLL_INTERVAL_|DRAIN_TIMEOUT_|CLOSE_TIMEOUT_)/.test(e.name)));
      const checksum = deployment.spec.template.metadata.annotations['checksum/swarm-config'];
      if (prior) assert.notEqual(checksum, prior);
    }
    prior = docs.find(d => d.kind === 'Deployment' && d.metadata.name === 'prism-worker').spec.template.metadata.annotations['checksum/swarm-config'];
  }
});
for (const supervisor of [null, undefined, { ...base['prism-worker'].profiles.standard.settings.supervisor, unknown: 1 }]) {
  test('CS5 Helm rejects missing, null or extended supervisor object', async t => {
    const chart = copiedChart(t), config = structuredClone(base); config['prism-worker'].profiles.standard.settings.supervisor = supervisor;
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
    const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
  });
}

for (const [key, values] of Object.entries({
  pipelinePreferenceSubject: [undefined, '', 'operator:test', 1, false],
  artifactRoot: [undefined, null, '', '/', 'relative', '/tmp/../artifacts', '/tmp/artifacts/', '/tmp//artifacts', '/tmp/\u0000artifacts', 1],
  studioPublicUrl: [undefined, null, '', 'relative', 'file:///tmp', 'https://', 'https://user:pass@studio', 'https://studio?query=1', 'https://studio#fragment', 'https://bad host', 1],
})) for (const value of values) test(`CC4 Helm rejects Control ${key}=${JSON.stringify(value)}`, async t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-control'].profiles.spiffe.settings[key] = value;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});
for (const control of [undefined, null, {}, {...base['prism-control'].profiles.spiffe.settings,unknown:1}]) test('CC4 Helm strict Control object', async t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-control'].profiles.spiffe.settings = control == null ? control : { dispatchTimeoutMs: config['prism-control'].profiles.spiffe.settings.dispatchTimeoutMs, ...control };
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});
test('CC4 retired Helm subject author rejects even disabled value', async () => {
  for (const value of ['', `user-${'a'.repeat(24)}`]) {
    const result = await helm(path.join(root,'charts/prism'), ['--set-string',`control.pipelinePreferenceSubject=${value}`]);
    assert.notEqual(result.status,0); assert.match(result.stderr,/pipelinePreferenceSubject/);
  }
});
test('CC4 two real mounted Control profiles align PVC and checksum while retaining generated trust topology', async t => {
  const chart = copiedChart(t); let previous;
  for (const factor of [1,2]) {
    const config = structuredClone(base);
    config['prism-control'].profiles.spiffe.settings = {...base['prism-control'].profiles.spiffe.settings,pipelinePreferenceSubject:`user-${String(factor).repeat(24)}`,artifactRoot:`/data/control-${factor}`,studioPublicUrl:`https://studio-${factor}.example.test`};
    writeTestBundle(path.join(chart,'author/pipeline.config.json'), config);
    const docs = await render(chart,['--set','workerTrust.spiffe.enabled=true']);
    const file = path.join(chart,'mounted-control.json'); writeTestBundle(file, JSON.parse(delivery(docs,'control')));
    const deployment = docs.find(d=>d.kind==='Deployment' && d.metadata.name==='prism-control');
    const container = deployment.spec.template.spec.containers.find(c=>c.name==='control');
    const environment = Object.fromEntries(container.env.filter(e=>'value' in e).map(e=>[e.name,e.value]));
    const loaded = controlConfig(file, {...environment,PRISM_SESSION_SECRET:'test',PRISM_INGRESS_SECRET:'test',PRISM_INGESTION_SECRET:'test'});
    assert.equal(loaded.pipelinePreferenceSubject,config['prism-control'].profiles.spiffe.settings.pipelinePreferenceSubject);
    assert.equal(loaded.studioPublicUrl,config['prism-control'].profiles.spiffe.settings.studioPublicUrl);
    assert.equal(loaded.artifactRoot,config['prism-control'].profiles.spiffe.settings.artifactRoot);
    assert.equal(container.volumeMounts.find(m=>m.name==='artifacts').mountPath,loaded.artifactRoot);
    assert.equal(loaded.workerUrl.href,'http://127.0.0.1:18081/');
    assert.equal(loaded.controlInternalUrl.href,'http://127.0.0.1:18080/');
    assert.equal(loaded.trustedControlSpiffeId,'spiffe://kubeclaw.internal/ns/kubeclaw/sa/prism-control');
    assert.ok(!['PRISM_PIPELINE_PREFERENCE_SUBJECT','ARTIFACT_ROOT','PRISM_STUDIO_PUBLIC_URL'].some(key=>key in environment));
    const checksum = deployment.spec.template.metadata.annotations['checksum/swarm-config'];
    if (previous) assert.notEqual(checksum,previous); previous = checksum;
  }
});

for (const port of [23456, 23457]) {
  for (const spiffe of [true, false]) {
    test(`CL chart listener ${port} keeps every Control destination coherent (SPIFFE ${spiffe})`, async t => {
      const chart = copiedChart(t), authored = structuredClone(base);
      selectTrust(authored,spiffe);
      authored['prism-control'].profiles[spiffe?'spiffe':'standard'].settings.port = port;
      writeTestBundle(path.join(chart, 'author/pipeline.config.json'), authored);
      const result = await helm(chart, ['--set', `workerTrust.spiffe.enabled=${spiffe}`]);
      assert.equal(result.status, 0, result.stderr);
      const documents = yaml.loadAll(result.stdout).filter(Boolean);
      const resource = (kind, name) => documents.find(item => item.kind === kind && item.metadata.name === name);
      const control = resource('Deployment', 'prism-control').spec.template.spec.containers[0];
      assert.equal(control.env.some(item => item.name === 'PORT'), false);
      assert.equal(control.readinessProbe.httpGet.port, port); assert.equal(control.livenessProbe.httpGet.port, port);
      assert.deepEqual(resource('Service', 'prism-control').spec.ports, [{port: 8080, targetPort: port}]);
      for (const name of ['worker']) {
        const container = resource('Deployment', `prism-${name}`).spec.template.spec.containers[0];
        assert.equal(container.env.some(item => item.name === 'PORT'), false);
        assert.equal(container.livenessProbe.httpGet.port, authored['prism-worker'].profiles.standard.settings.ingress.port);
      }
      const studio = resource('Deployment', 'prism-studio').spec.template.spec.containers[0];
      assert.equal(studio.env.some(item => item.name === 'PORT'), false);
      assert.equal(studio.livenessProbe.httpGet.port, authored['prism-studio'].profiles.standard.settings.port);
      const application = resource('NetworkPolicy', 'prism-application-paths');
      assert.equal(application.spec.ingress[0].ports[0].port, port);
      for (const rule of application.spec.ingress.slice(1)) assert.equal(rule.ports[0].port, spiffe ? 8443 : port);
      for (const policy of documents.filter(item => item.kind === 'NetworkPolicy')) {
        for (const rule of policy.spec.egress ?? []) {
          if (rule.to?.some(peer => peer.podSelector?.matchLabels?.app === 'prism-control')) {
            assert.equal(rule.ports[0].port, policy.metadata.name === 'prism-studio-control' ? port : spiffe ? 8443 : port);
          }
        }
      }
      if (spiffe) {
        const config = documents.find(item => item.kind === 'ConfigMap' && item.data?.['control.yaml']);
        const envoy = yaml.load(config.data['control.yaml']);
        const local = envoy.static_resources.clusters.find(item => item.name === 'control-local');
        assert.equal(local.load_assignment.endpoints[0].lb_endpoints[0].endpoint.address.socket_address.port_value, port);
      }
    });
  }
}
for (const port of [undefined, null, '8080', 0, 65536, 3.5, true]) {
  test(`CL Helm rejects invalid listener ${String(port)}`, async t => {
    const chart = copiedChart(t), authored = structuredClone(base);
    authored['prism-control'].profiles.spiffe.settings.port = port;
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), authored);
    const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
  });
}
test('CL Helm rejects second listener author', async () => {
  const result = await helm(path.join(root, 'charts/prism'), ['--set', 'control.port=23456']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /control.port moved/);
});

test('Studio authored profiles bind loader and all rendered listener edges', async t => {
  const chart = copiedChart(t);
  let previousChecksum;
  for (const spiffe of [false, true]) for (const port of [19087, 19088]) {
    const authored = structuredClone(base); selectTrust(authored,spiffe);
    authored['prism-studio'].profiles.standard.settings = {...base['prism-studio'].profiles.standard.settings, port, controlTimeoutMs:port + 100,
      controlUrl:port === 19087 ? 'http://prism-control:8080' : 'http://prism-control.kubeclaw.svc:8080/'};
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), authored);
    const docs=await render(chart,['--set',`workerTrust.spiffe.enabled=${spiffe}`]);
    assert.deepEqual(JSON.parse(delivery(docs,'studio')),authored);
    const loaded=installedStudio.loadStudioConfig(captureFor(path.join(chart,'studio.json'),'prism-studio'),{});
    const settings=authored['prism-studio'].profiles.standard.settings;
    assert.equal(loaded.port,settings.port); assert.equal(loaded.controlTimeoutMs,settings.controlTimeoutMs);
    assert.equal(loaded.control.href,new URL(settings.controlUrl).href);
    const resource=(kind,name)=>docs.find(item=>item.kind===kind && item.metadata.name===name);
    const deployment=resource('Deployment','prism-studio');
    const container=deployment.spec.template.spec.containers[0];
    assert.equal(container.env.some(item=>['PORT','PRISM_CONTROL_URL','PRISM_CONTROL_TIMEOUT_MS'].includes(item.name)),false);
    assert.equal(container.readinessProbe.httpGet.port,port);
    assert.equal(container.livenessProbe.httpGet.port,port);
    assert.deepEqual(resource('Service','prism-studio').spec.ports,[{port:80,targetPort:port}]);
    assert.equal(resource('NetworkPolicy','prism-studio-entry').spec.ingress[0].ports[0].port,port);
    const checksum=deployment.spec.template.metadata.annotations['checksum/swarm-config'];
    if (previousChecksum) assert.notEqual(checksum,previousChecksum);
    previousChecksum=checksum;
  }
});
test('Studio chart rejects competing values and unsupported upstream topology',async t=>{
  const chart=copiedChart(t);
  for (const key of ['port','controlTimeoutMs','controlUrl']) {
    const result=await helm(chart,['--set',`studio.${key}=123`]);
    assert.equal(result.status,1); assert.match(result.stderr,new RegExp(`studio[.]${key}|Additional property ${key}`));
  }
  const invalid={port:[null,true,'8080',0,65536,1.5],controlTimeoutMs:[null,false,'30000',0,2147483648,1.5],
    controlUrl:[null,1,'https://external.example.test','http://prism-control:9999','file:///tmp']};
  for (const [key,values] of Object.entries(invalid)) for (const value of values) {
    const authored=structuredClone(base); authored['prism-studio'].profiles.standard.settings[key]=value;
    writeTestBundle(path.join(chart,'author/pipeline.config.json'), authored);
    const result=await helm(chart); assert.equal(result.status,1,`${key}=${JSON.stringify(value)}`);
    assert.match(result.stderr,/SWARM_CONFIG_INVALID|Studio Helm topology requires/);
  }
});


test('BA Prism chart preserves two Buster admission profiles through the mounted canonical document', async t => {
  const chart = copiedChart(t);
  for (const maximumQueuedJobs of [8, 3]) {
    const config = structuredClone(base); config['buster-engine'].profiles.runtime.settings.admission.maximumQueuedJobs = maximumQueuedJobs;
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
    assert.deepEqual(JSON.parse(delivery(await render(chart)))['buster-engine'].profiles.runtime.settings.admission, config['buster-engine'].profiles.runtime.settings.admission);
  }
});
for (const key of ['maximumActiveJobs', 'maximumQueuedJobs', 'maximumConcurrentAttempts']) {
  for (const invalid of [undefined, null, '2', 0, -1, 1.5, 9007199254740992]) {
    test(`BA Prism chart rejects Buster admission ${key}=${String(invalid)}`, async t => {
      const chart = copiedChart(t), config = structuredClone(base);
      config['buster-engine'].profiles.runtime.settings.admission[key] = invalid;
      writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
      const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
    });
  }
}
for (const invalid of [undefined, null, {}, { ...base['buster-engine'].profiles.runtime.settings.admission, unknown: 1 }]) {
  test('BA Prism chart rejects missing/malformed/unknown admission objects', async t => {
    const chart = copiedChart(t), config = structuredClone(base); config['buster-engine'].profiles.runtime.settings.admission = invalid;
    writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
    const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
  });
}
test('BA Prism chart retains strict Buster sibling rejection', async t => {
  const chart = copiedChart(t), config = structuredClone(base); config['buster-engine'].profiles.runtime.settings.unknown = {};
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), config);
  const result = await helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
});

for (const port of [23458, 23459]) for (const enabled of [false, true]) test(`WL Worker topology follows ${port}, SPIFFE=${enabled}`, async t => {
  const chart = copiedChart(t), bundle = structuredClone(base); selectTrust(bundle,enabled);
  bundle['prism-worker'].profiles.standard.settings.ingress.port = port;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), bundle);
  const docs = await render(chart, ['--set', `workerTrust.spiffe.enabled=${enabled}`]);
  const deployment = docs.find(d => d.kind === 'Deployment' && d.metadata.name === 'prism-worker');
  const worker = deployment.spec.template.spec.containers.find(c => c.name === 'worker');
  assert.equal(worker.readinessProbe.httpGet.port, port);
  assert.equal(worker.livenessProbe.httpGet.port, port);
  assert.ok(!worker.env.some(entry => entry.name === 'PORT'));
  const service = docs.find(d => d.kind === 'Service' && d.metadata.name === 'prism-worker');
  assert.equal(service.spec.ports[0].port, 8080); assert.equal(service.spec.ports[0].targetPort, port);
  const inbound = docs.find(d => d.kind === 'NetworkPolicy' && d.metadata.name === 'prism-worker-control');
  assert.equal(inbound.spec.ingress[0].ports[0].port, enabled ? 8443 : port);
  const control = docs.find(d => d.kind === 'NetworkPolicy' && d.metadata.name === 'prism-application-paths');
  const edge = control.spec.egress.find(rule => rule.to?.some(peer => peer.podSelector?.matchLabels?.app === 'prism-worker'));
  assert.equal(edge.ports[0].port, enabled ? 8443 : port);
  if (enabled) {
    const trust = docs.find(d => d.kind === 'ConfigMap' && d.metadata.name === 'prism-worker-trust');
    const envoy = yaml.load(trust.data['worker.yaml']);
    const local = envoy.static_resources.clusters.find(cluster => cluster.name === 'worker-local');
    assert.equal(local.load_assignment.endpoints[0].lb_endpoints[0].endpoint.address.socket_address.port_value, port);
    const internal = docs.find(d => d.kind === 'Service' && d.metadata.name === 'prism-worker-internal');
    assert.equal(internal.spec.ports[0].port, 8443);
    assert.equal(internal.spec.ports[0].targetPort, 'worker-trust');
  }
});
for (const legacy of ['8080', '']) test(`WL legacy Worker Helm port rejects ${JSON.stringify(legacy)}`, async () => {
  const result = await helm(path.join(root, 'charts/prism'), ['--set-string', `worker.port=${legacy}`]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /worker.port/);
});


for (const field of ['maximumProtocolBytes', 'terminationGraceMs', 'terminationTimeoutMs',
  'capabilityDrainTimeoutMs', 'minimumHeapMiB', 'heapFraction', 'maximumPendingCapabilities',
  'minimumOpenFiles', 'artifactFileDescriptorReserve']) {
  for (const value of [undefined, null, false, true, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    test(`Sessionpolicy Helm rejects ${field}=${String(value)}`, async t => {
      const chart = copiedChart(t); const bundle = structuredClone(base);
      const provider = bundle['buster-engine'].profiles.runtime.settings.execution.provider;
      if (value === undefined) delete provider[field]; else provider[field] = value;
      writeTestBundle(path.join(chart, 'author/pipeline.config.json'), bundle);
      const result = await helm(chart); assert.notEqual(result.status, 0);
      assert.match(result.stderr, /SWARM_CONFIG_INVALID/);
    });
  }
}
for (const heapFraction of [0.1, 0.7, 1]) test(`Sessionpolicy Helm accepts fractional heap ${heapFraction}`, async t => {
  const chart = copiedChart(t); const bundle = structuredClone(base);
  bundle['buster-engine'].profiles.runtime.settings.execution.provider.heapFraction = heapFraction;
  writeTestBundle(path.join(chart, 'author/pipeline.config.json'), bundle);
  const documents = await render(chart); const delivered = JSON.parse(delivery(documents));
  assert.equal(delivered['buster-engine'].profiles.runtime.settings.execution.provider.heapFraction, heapFraction);
});

// Regression controls for this migration's actual rendered/image/boot oracles.
test('delivery oracle rejects omitted rollout checksum and mismatched rendered provenance', async t => {
  const chart=copiedChart(t), documents=await render(chart); delivery(documents);
  const worker=documents.find(d=>d.kind==='Deployment'&&d.metadata.name==='prism-worker');
  const annotations=worker.spec.template.metadata.annotations, original=annotations['checksum/swarm-config'];
  annotations['checksum/swarm-config']='0'.repeat(64);
  assert.throws(()=>delivery(documents),{code:'ERR_ASSERTION'});
  annotations['checksum/swarm-config']=original; delivery(documents);
  const config=documents.find(d=>d.kind==='ConfigMap'&&d.metadata.name==='prism-config-provenance');
  const bytes=config.data['projection.json']; const altered=JSON.parse(bytes); altered.generationDigest='sha256:'+'0'.repeat(64);
  config.data['projection.json']=JSON.stringify(altered);
  assert.throws(()=>delivery(documents),{code:'ERR_ASSERTION'});
  config.data['projection.json']=bytes; delivery(documents);
});
test('actual installed boot rejects missing original image member and accepts restored bytes', async t => {
  const chart=copiedChart(t), documents=await render(chart); delivery(documents);
  const emitted=generations.get(chart), file=path.join(emitted.output,'system',base.entry.components['prism-worker']);
  const bytes=fs.readFileSync(file), token=path.join(chart,'mounted.json');
  fs.unlinkSync(file);
  try { assert.throws(()=>captureFor(token,'prism-worker'),/ENOENT|READBACK|MISSING/); }
  finally { fs.writeFileSync(file,bytes,{mode:0o444}); }
  const capture=captureFor(token,'prism-worker');
  const actual=installedWorker.loadWorkerConfig(capture,{WORKER_TRUST_SPIFFE_ENABLED:'true',PRISM_TRUSTED_CONTROL_SPIFFE_ID:'spiffe://test/control'});
  assert.equal(actual.port,base['prism-worker'].profiles.standard.settings.ingress.port);
});
