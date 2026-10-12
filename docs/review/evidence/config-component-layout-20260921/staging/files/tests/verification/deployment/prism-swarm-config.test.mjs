import { readTestBundle, writeTestBundle, bundleFromConfigMap, projectTestBundle, bundleNames } from '../../fixtures/config/swarm-bundle.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { loadControlServerConfig } from '../../../skills/prism/server/control-config.ts';
import { loadWorkerConfig } from '../../../skills/prism/server/worker-config.ts';
const root = path.resolve(import.meta.dirname, '../../..');
const canonical = path.join(root, 'charts/kubeclaw/files/config/swarm.config.json');
const base = readTestBundle(canonical);
const helm = (chart, extra = []) => spawnSync('helm', ['template', 'config-review', chart, '--namespace', 'default', '-f', path.join(chart, 'ci-values.yaml'), ...extra], { encoding: 'utf8' });
function copiedChart(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-swarm-chart-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const chart = path.join(temp, 'prism'); fs.cpSync(path.join(root, 'charts/prism'), chart, { recursive: true, dereference: true });
  for (const name of [...bundleNames, 'swarm.schema.json', 'swarm-components.schema.json']) {
    const file = path.join(chart, 'files/config', name);
    const content = fs.readFileSync(file);
    if (fs.lstatSync(file).isSymbolicLink()) fs.unlinkSync(file);
    fs.writeFileSync(file, content);
    assert.ok(!fs.lstatSync(file).isSymbolicLink(), 'isolated mutation cannot follow canonical author symlink');
  }
  return chart;
}
function render(chart, extra) {
  const result = helm(chart, extra); assert.equal(result.status, 0, result.stderr);
  return yaml.loadAll(result.stdout).filter(Boolean);
}
function delivery(docs, role = 'worker') {
  const config = docs.find(d => d.kind === 'ConfigMap' && d.metadata.name === 'prism-swarm-config');
  const deployment = docs.find(d => d.kind === 'Deployment' && d.metadata.name === `prism-${role}`);
  const worker = deployment.spec.template.spec.containers.find(c => c.name === role);
  const env = Object.fromEntries(worker.env.filter(e => 'value' in e).map(e => [e.name, e.value]));
  assert.equal(env.SWARM_CONFIG, '/etc/kubeclaw/swarm/swarm.config.json');
  assert.ok(!Object.keys(env).some(k => /^PRISM_WORKER_(?:MAXIMUM_|REQUEST_BODY_TIMEOUT|SHUTDOWN_TIMEOUT)/.test(k)));
  const mount = worker.volumeMounts.find(m => m.name === 'swarm-config');
  assert.deepEqual(mount, { name: 'swarm-config', mountPath: '/etc/kubeclaw/swarm', readOnly: true });
  assert.equal(deployment.spec.template.spec.volumes.find(v => v.name === mount.name).configMap.name, config.metadata.name);
  assert.match(deployment.spec.template.metadata.annotations['checksum/swarm-config'], /^[a-f0-9]{64}$/);
  return JSON.stringify(bundleFromConfigMap(config.data));
}
test('CD01 original chart delivers the one canonical config to the worker mount', () => {
  const bytes = delivery(render(path.join(root, 'charts/prism')));
  assert.deepEqual(JSON.parse(bytes), base);
});
test('CD02 real Helm output from two author profiles drives the actual production loader', t => {
  const chart = copiedChart(t);
  const profiles = [base, structuredClone(base)];
  profiles[1]['prism-worker'].settings.ingress = { maximumActiveRequests: 7, maximumProbeRequests: 2, maximumConnections: 40, requestTimeoutMs: 3000, shutdownTimeoutMs: 130000, maximumInputBytes: 8192 };
  for (const authored of profiles) {
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), authored);
    const rendered = delivery(render(chart));
    const file = path.join(chart, 'mounted-swarm.config.json'); writeTestBundle(file, JSON.parse(rendered));
    const actual = loadWorkerConfig({ SWARM_CONFIG: file, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://test/control' });
    assert.equal(actual.shutdownTimeoutMs, authored['prism-worker'].settings.ingress.shutdownTimeoutMs);
    const { shutdownTimeoutMs, ...ingress } = authored['prism-worker'].settings.ingress;
    assert.deepEqual(actual.ingress, ingress);
  }
});
test('CD03 old Helm shutdown authority is rejected', () => {
  const result = helm(path.join(root, 'charts/prism'), ['--set', 'worker.shutdownTimeoutMs=120000']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /worker.shutdownTimeoutMs moved/);
});
for (const key of Object.keys(base['prism-worker'].settings.ingress)) for (const invalid of ['3', null, -1, 0, 1.5, 2147483648, undefined]) test(`CD04 ${key} rejects ${String(invalid)} before rendering`, t => {
  const chart = copiedChart(t); const config = structuredClone(base); config['prism-worker'].settings.ingress[key] = invalid;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm worker/);
});
for (const location of ['entry', 'prism-worker', 'prism-worker.settings', 'prism-worker.settings.ingress']) test(`CD04 unknown key ${location || 'root'}`, t => {
  const chart = copiedChart(t); const config = structuredClone(base); let object = config;
  for (const key of location.split('.').filter(Boolean)) object = object[key]; object.unknown = 1;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm/);
});
test('CD04 connection overcommit fails Helm rendering', t => {
  const chart = copiedChart(t); const config = structuredClone(base); config['prism-worker'].settings.ingress.maximumConnections = 16;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /connection budget/);
});
for (const shutdownTimeoutMs of [100000, 150000]) test(`CD05 shutdown ${shutdownTimeoutMs} violates native-close or Pod grace`, t => {
  const chart = copiedChart(t); const config = structuredClone(base); config['prism-worker'].settings.ingress.shutdownTimeoutMs = shutdownTimeoutMs;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /worker shutdown must cover/);
});
test('CD06 Helm packaging dereferences the canonical author/schema without manual synchronization', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-swarm-package-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('helm', ['package', path.join(root, 'charts/prism'), '--destination', dir], { stdio: 'pipe' });
  const archive = path.join(dir, fs.readdirSync(dir).find(name => name.endsWith('.tgz')));
  const contents = execFileSync('tar', ['-xzOf', archive, 'prism/files/config/swarm.config.json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(contents), base.entry);
  for (const name of bundleNames.slice(1)) {
    const component = execFileSync('tar', ['-xzOf', archive, `prism/files/config/${name}`], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(component), base[name.slice(0, -'.config.json'.length)]);
  }
  const schema = execFileSync('tar', ['-xzOf', archive, 'prism/files/config/swarm.schema.json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(schema), JSON.parse(fs.readFileSync(path.join(root, 'skills/common/plugin-runtime/foundation/config/swarm.schema.json'))));
});

for (const key of ['worker.native.maximumInputBytes', 'native.maximumInputBytes']) test(`CI05 old Helm input authority ${key} is rejected`, () => {
  const result = helm(path.join(root, 'charts/prism'), ['--set', `${key}=16777216`]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, key.startsWith('worker.') ? /additional properties 'maximumInputBytes' not allowed/ : /additional properties 'native' not allowed/);
});

for (const key of ['maximumResultBytes', 'dispatchTimeoutMs']) for (const invalid of ['3', null, -1, 0, 1.5, 2147483648, undefined]) test(`CR06 native ${key} rejects ${String(invalid)} before rendering`, t => {
  const chart = copiedChart(t), config = structuredClone(base); config[key === 'dispatchTimeoutMs' ? 'prism-control' : 'prism-execution'].settings[key] = invalid;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm native/);
});
for (const native of [undefined, null, { ...projectTestBundle(base).operator.prism.native, extra: 1 }]) test('CR06 missing or unknown native section fails rendering', t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-execution'].settings = native;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm (?:native|prism)/);
});
test('CR06 two real authored profiles deliver identical bytes and changing checksums to both roles', t => {
  const chart = copiedChart(t), checksums = [];
  for (const native of [projectTestBundle(base).operator.prism.native, { ...projectTestBundle(base).operator.prism.native, maximumResultBytes: 8192, dispatchTimeoutMs: 3000 }]) {
    const config = structuredClone(base);
    config['prism-execution'].settings = { resourcePolicy: native.resourcePolicy, maximumResultBytes: native.maximumResultBytes };
    config['prism-control'].settings.dispatchTimeoutMs = native.dispatchTimeoutMs;
    config['prism-worker'].settings.supervisor = native.supervisor;
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
    const docs = render(chart), workerBytes = delivery(docs), controlBytes = delivery(docs, 'control');
    assert.equal(controlBytes, workerBytes); assert.deepEqual(JSON.parse(controlBytes), config);
    const file = path.join(chart, 'mounted-swarm.config.json'); writeTestBundle(file, JSON.parse(controlBytes));
    const actual = loadControlServerConfig({ SWARM_CONFIG: file, PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test',
      PRISM_WORKER_SECRET: 'test', PRISM_DISPATCH_SECRET: 'test', PRISM_INGESTION_SECRET: 'test' });
    const worker = loadWorkerConfig({ SWARM_CONFIG: file, PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' });
    assert.equal(actual.maximumWorkerResponseBytes, native.maximumResultBytes);
    assert.equal(actual.nativeWorkerDispatchTimeoutMs, native.dispatchTimeoutMs); assert.deepEqual(worker.native, native);
    const roleChecksums = ['control', 'worker'].map(role => docs.find(d => d.kind === 'Deployment' && d.metadata.name === `prism-${role}`).spec.template.metadata.annotations['checksum/swarm-config']);
    assert.equal(roleChecksums[0], roleChecksums[1]); checksums.push(roleChecksums[0]);
  }
  assert.notEqual(checksums[0], checksums[1]);
});
for (const key of ['worker.native.maximumResultBytes', 'control.nativeWorkerDispatchTimeoutMs', 'control.maximumWorkerResponseBytes']) test(`CR06 old Helm authority ${key} rejected`, () => {
  const result = helm(path.join(root, 'charts/prism'), ['--set', `${key}=67108864`]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, key.startsWith('control.') ? /Control result and dispatch limits must be authored/ : /additional properties/);
});

for (const key of ['cpuTimeMs', 'memoryBytes', 'tasks']) for (const invalid of ['3', null, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined]) test(`CP01 resource ${key} rejects ${String(invalid)} in Helm`, t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-execution'].settings.resourcePolicy[key] = invalid;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm resourcePolicy/);
});
for (const policy of [undefined, null, { ...base['prism-execution'].settings.resourcePolicy, processes: 2048 }]) test('CP01 unsupported resource policy rejected in Helm', t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-execution'].settings.resourcePolicy = policy;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm (?:resourcePolicy|native)/);
});
for (const key of ['worker.native.resourcePolicy.tasks', 'control.nativeResourcePolicy.tasks']) test(`CP06 competing Helm ${key} is rejected`, () => {
  const result = helm(path.join(root, 'charts/prism'), ['--set', `${key}=2048`]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /resource policy must be authored|additional properties/);
});
test('CP06 two resource policies change both rendered snapshots and checksums', t => {
  const chart = copiedChart(t), hashes = [];
  for (const policy of [base['prism-execution'].settings.resourcePolicy, { cpuTimeMs: 123, memoryBytes: 4096, tasks: 7 }]) {
    const config = structuredClone(base); config['prism-execution'].settings.resourcePolicy = policy;
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
    const docs = render(chart);
    assert.deepEqual(JSON.parse(delivery(docs, 'control'))['prism-execution'].settings.resourcePolicy, policy);
    assert.equal(delivery(docs), delivery(docs, 'control'));
    const checksums = ['control', 'worker'].map(role => docs.find(d => d.kind === 'Deployment' && d.metadata.name === `prism-${role}`).spec.template.metadata.annotations['checksum/swarm-config']);
    assert.equal(checksums[0], checksums[1]); hashes.push(checksums[0]);
  }
  assert.notEqual(hashes[0], hashes[1]);
});
test('CP01 Helm accepts the resource safe-integer ceiling without timer coercion', t => {
  const chart = copiedChart(t), config = structuredClone(base);
  config['prism-execution'].settings.resourcePolicy = { cpuTimeMs: Number.MAX_SAFE_INTEGER, memoryBytes: Number.MAX_SAFE_INTEGER, tasks: Number.MAX_SAFE_INTEGER };
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  assert.deepEqual(JSON.parse(delivery(render(chart)))['prism-execution'].settings.resourcePolicy, config['prism-execution'].settings.resourcePolicy);
});

for (const key of Object.keys(base['prism-worker'].settings.supervisor)) {
  for (const invalid of [undefined, null, '1', 0, -1, 1.5, key === 'maximumJournalBytes' ? 9007199254740992 : 2147483648]) {
    test(`CS5 Helm rejects supervisor ${key}=${String(invalid)}`, t => {
      const chart = copiedChart(t), config = structuredClone(base);
      config['prism-worker'].settings.supervisor[key] = invalid;
      writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
      const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm supervisor/);
    });
  }
}
test('CS5 old Helm supervisor close author is rejected', () => {
  const result = helm(path.join(root, 'charts/prism'), ['--set', 'worker.native.closeTimeoutMs=105000']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /closeTimeoutMs/);
});
test('CS4 Helm uses authored drain as well as close in shutdown budget', t => {
  const chart = copiedChart(t), config = structuredClone(base);
  for (const drainTimeoutMs of [14999, 15000, 15001]) {
    config['prism-worker'].settings.supervisor.drainTimeoutMs = drainTimeoutMs;
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
    const result = helm(chart);
    if (drainTimeoutMs < 15000) assert.equal(result.status, 0, result.stderr);
    else { assert.notEqual(result.status, 0); assert.match(result.stderr, /worker shutdown must cover/); }
  }
});
test('CS5 both actual mounts and checksums deliver two supervisor profiles without old environment authors', t => {
  const chart = copiedChart(t), config = structuredClone(base); let prior;
  for (const factor of [1, 2]) {
    const supervisor = { uid: 1000 + factor, gid: 2000 + factor, maximumOwnershipRecords: factor,
      maximumOwnershipBytes: 8192 * factor, maximumOutputBytes: 8 * factor, maximumJournalBytes: 16384 * factor,
      pollIntervalMs: 3 * factor, drainTimeoutMs: 7 * factor, closeTimeoutMs: 11 * factor };
    config['prism-worker'].settings.supervisor = supervisor;
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
    const docs = render(chart);
    for (const role of ['worker', 'control']) {
      const file = path.join(chart, `${role}-mounted.json`); writeTestBundle(file, JSON.parse(delivery(docs, role)));
      const loaded = loadWorkerConfig({ SWARM_CONFIG: file, PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' });
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
for (const supervisor of [null, undefined, { ...base['prism-worker'].settings.supervisor, unknown: 1 }]) {
  test('CS5 Helm rejects missing, null or extended supervisor object', t => {
    const chart = copiedChart(t), config = structuredClone(base); config['prism-worker'].settings.supervisor = supervisor;
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
    const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm (?:native|supervisor)/);
  });
}

for (const [key, values] of Object.entries({
  pipelinePreferenceSubject: [undefined, '', 'operator:test', 1, false],
  artifactRoot: [undefined, null, '', '/', 'relative', '/tmp/../artifacts', '/tmp/artifacts/', '/tmp//artifacts', '/tmp/\u0000artifacts', 1],
  studioPublicUrl: [undefined, null, '', 'relative', 'file:///tmp', 'https://', 'https://user:pass@studio', 'https://studio?query=1', 'https://studio#fragment', 'https://bad host', 1],
})) for (const value of values) test(`CC4 Helm rejects Control ${key}=${JSON.stringify(value)}`, t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-control'].settings[key] = value;
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm control/);
});
for (const control of [undefined, null, {}, {...base['prism-control'].settings,unknown:1}]) test('CC4 Helm strict Control object', t => {
  const chart = copiedChart(t), config = structuredClone(base); config['prism-control'].settings = control == null ? control : { dispatchTimeoutMs: config['prism-control'].settings.dispatchTimeoutMs, ...control };
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm (?:prism|control)/);
});
test('CC4 retired Helm subject author rejects even disabled value', () => {
  for (const value of ['', `user-${'a'.repeat(24)}`]) {
    const result = helm(path.join(root,'charts/prism'), ['--set-string',`control.pipelinePreferenceSubject=${value}`]);
    assert.notEqual(result.status,0); assert.match(result.stderr,/pipelinePreferenceSubject/);
  }
});
test('CC4 two real mounted Control profiles align PVC and checksum while retaining generated trust topology', t => {
  const chart = copiedChart(t); let previous;
  for (const factor of [1,2]) {
    const config = structuredClone(base);
    config['prism-control'].settings = {...base['prism-control'].settings,pipelinePreferenceSubject:`user-${String(factor).repeat(24)}`,artifactRoot:`/data/control-${factor}`,studioPublicUrl:`https://studio-${factor}.example.test`};
    writeTestBundle(path.join(chart,'files/config/swarm.config.json'), config);
    const docs = render(chart,['--set','workerTrust.spiffe.enabled=true']);
    const file = path.join(chart,'mounted-control.json'); writeTestBundle(file, JSON.parse(delivery(docs,'control')));
    const deployment = docs.find(d=>d.kind==='Deployment' && d.metadata.name==='prism-control');
    const container = deployment.spec.template.spec.containers.find(c=>c.name==='control');
    const environment = Object.fromEntries(container.env.filter(e=>'value' in e).map(e=>[e.name,e.value]));
    const loaded = loadControlServerConfig({...environment,SWARM_CONFIG:file,PRISM_SESSION_SECRET:'test',PRISM_INGRESS_SECRET:'test',PRISM_INGESTION_SECRET:'test'});
    assert.equal(loaded.pipelinePreferenceSubject,config['prism-control'].settings.pipelinePreferenceSubject);
    assert.equal(loaded.studioPublicUrl,config['prism-control'].settings.studioPublicUrl);
    assert.equal(loaded.artifactRoot,config['prism-control'].settings.artifactRoot);
    assert.equal(container.volumeMounts.find(m=>m.name==='artifacts').mountPath,loaded.artifactRoot);
    assert.equal(loaded.workerUrl.href,'http://127.0.0.1:18081/');
    assert.equal(loaded.controlInternalUrl.href,'http://127.0.0.1:18080/');
    assert.equal(loaded.trustedControlSpiffeId,'spiffe://kubeclaw.internal/ns/default/sa/prism-control');
    assert.ok(!['PRISM_PIPELINE_PREFERENCE_SUBJECT','ARTIFACT_ROOT','PRISM_STUDIO_PUBLIC_URL'].some(key=>key in environment));
    const checksum = deployment.spec.template.metadata.annotations['checksum/swarm-config'];
    if (previous) assert.notEqual(checksum,previous); previous = checksum;
  }
});

for (const port of [23456, 23457]) {
  for (const spiffe of [true, false]) {
    test(`CL chart listener ${port} keeps every Control destination coherent (SPIFFE ${spiffe})`, t => {
      const chart = copiedChart(t), authored = structuredClone(base);
      authored['prism-control'].settings.port = port;
      writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), authored);
      const result = helm(chart, ['--set', `workerTrust.spiffe.enabled=${spiffe}`]);
      assert.equal(result.status, 0, result.stderr);
      const documents = yaml.loadAll(result.stdout).filter(Boolean);
      const resource = (kind, name) => documents.find(item => item.kind === kind && item.metadata.name === name);
      const control = resource('Deployment', 'prism-control').spec.template.spec.containers[0];
      assert.equal(control.env.some(item => item.name === 'PORT'), false);
      assert.equal(control.readinessProbe.httpGet.port, port); assert.equal(control.livenessProbe.httpGet.port, port);
      assert.deepEqual(resource('Service', 'prism-control').spec.ports, [{port: 8080, targetPort: port}]);
      for (const name of ['worker']) {
        const container = resource('Deployment', `prism-${name}`).spec.template.spec.containers[0];
        assert.equal(container.env.find(item => item.name === 'PORT').value, '8080');
        assert.equal(container.livenessProbe.httpGet.port, 8080);
      }
      const studio = resource('Deployment', 'prism-studio').spec.template.spec.containers[0];
      assert.equal(studio.env.some(item => item.name === 'PORT'), false);
      assert.equal(studio.livenessProbe.httpGet.port, authored['prism-studio'].settings.port);
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
  test(`CL Helm rejects invalid listener ${String(port)}`, t => {
    const chart = copiedChart(t), authored = structuredClone(base);
    authored['prism-control'].settings.port = port;
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), authored);
    const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /swarm control/);
  });
}
test('CL Helm rejects second listener author', () => {
  const result = helm(path.join(root, 'charts/prism'), ['--set', 'control.port=23456']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /control.port moved/);
});

test('Studio authored profiles bind loader and all rendered listener edges', t => {
  const chart = copiedChart(t);
  let previousChecksum;
  for (const spiffe of [false, true]) for (const port of [19087, 19088]) {
    const authored = structuredClone(base);
    authored['prism-studio'].settings = {port, controlTimeoutMs:port + 100,
      controlUrl:port === 19087 ? 'http://prism-control:8080' : 'http://prism-control.default.svc:8080/'};
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), authored);
    const docs=render(chart,['--set',`workerTrust.spiffe.enabled=${spiffe}`]);
    assert.deepEqual(JSON.parse(delivery(docs,'studio')),authored);
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
test('Studio chart rejects competing values and unsupported upstream topology',t=>{
  const chart=copiedChart(t);
  for (const key of ['port','controlTimeoutMs','controlUrl']) {
    assert.notEqual(helm(chart,['--set',`studio.${key}=123`]).status,0);
  }
  const invalid={port:[null,true,'8080',0,65536,1.5],controlTimeoutMs:[null,false,'30000',0,2147483648,1.5],
    controlUrl:[null,1,'https://external.example.test','http://prism-control:9999','file:///tmp']};
  for (const [key,values] of Object.entries(invalid)) for (const value of values) {
    const authored=structuredClone(base); authored['prism-studio'].settings[key]=value;
    writeTestBundle(path.join(chart,'files/config/swarm.config.json'), authored);
    assert.notEqual(helm(chart).status,0,`${key}=${JSON.stringify(value)}`);
  }
});


test('BA Prism chart preserves two Buster admission profiles through the mounted canonical document', t => {
  const chart = copiedChart(t);
  for (const maximumQueuedJobs of [8, 3]) {
    const config = structuredClone(base); config['buster-engine'].settings.admission.maximumQueuedJobs = maximumQueuedJobs;
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
    assert.deepEqual(JSON.parse(delivery(render(chart)))['buster-engine'].settings.admission, config['buster-engine'].settings.admission);
  }
});
for (const key of ['maximumActiveJobs', 'maximumQueuedJobs', 'maximumConcurrentAttempts']) {
  for (const invalid of [undefined, null, '2', 0, -1, 1.5, 9007199254740992]) {
    test(`BA Prism chart rejects Buster admission ${key}=${String(invalid)}`, t => {
      const chart = copiedChart(t), config = structuredClone(base);
      config['buster-engine'].settings.admission[key] = invalid;
      writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
      const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /buster admission/);
    });
  }
}
for (const invalid of [undefined, null, {}, { ...base['buster-engine'].settings.admission, unknown: 1 }]) {
  test('BA Prism chart rejects missing/malformed/unknown admission objects', t => {
    const chart = copiedChart(t), config = structuredClone(base); config['buster-engine'].settings.admission = invalid;
    writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
    const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /buster.*admission/);
  });
}
test('BA Prism chart retains strict Buster sibling rejection', t => {
  const chart = copiedChart(t), config = structuredClone(base); config['buster-engine'].settings.unknown = {};
  writeTestBundle(path.join(chart, 'files/config/swarm.config.json'), config);
  const result = helm(chart); assert.notEqual(result.status, 0); assert.match(result.stderr, /buster requires preparation and admission only/);
});
