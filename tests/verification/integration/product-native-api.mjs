// Original Kubernetes binaries only. No existing kubeconfig, remote API, or workload.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const assets = process.env.KUBEBUILDER_ASSETS;
assert(assets, 'KUBEBUILDER_ASSETS must point to checksum-verified envtest v1.35.0 binaries');
const evidence = path.resolve(process.env.NATIVE_EVIDENCE_DIR ?? path.join(root, 'docs/review/evidence/run4-native-product'));
fs.mkdirSync(evidence, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-native-product-'));
const children = [];
const descriptors = [];
const token = randomBytes(32).toString('hex');
let cleaned = false;
const record = (name, data) => fs.writeFileSync(path.join(evidence, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (binary, args, options = {}) => execFileSync(binary, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, ...options });
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function launch(name, args) {
  const fd = fs.openSync(path.join(evidence, name + '.log'), 'w');
  descriptors.push(fd);
  const child = spawn(path.join(assets, name), args, { stdio: ['ignore', fd, fd] });
  child.on('error', error => record(name + '-spawn-error.txt', String(error)));
  children.push(child);
  return child;
}
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const child of [...children].reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await Promise.race([exited, sleep(5000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
    }
  }
  record('cleanup.json', children.map(child => ({ pid: child.pid, exitCode: child.exitCode, signal: child.signalCode })));
  for (const fd of descriptors) fs.closeSync(fd);
  fs.rmSync(temp, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().then(() => process.exit(128)); });
const deadline = setTimeout(() => { void cleanup().then(() => process.exit(124)); }, 180000);
try {
  const versions = ['kube-apiserver', 'etcd'].map(name => run(path.join(assets, name), ['--version']));
  assert.match(versions[0], /Kubernetes v1\.35\.0\s*$/);
  record('versions.txt', versions.join('\n'));
  const [clientPort, peerPort, apiPort] = await Promise.all([freePort(), freePort(), freePort()]);
  assert.equal(new Set([clientPort, peerPort, apiPort]).size, 3);
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(temp, 'key.pem'), '-out', path.join(temp, 'cert.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  fs.writeFileSync(path.join(temp, 'tokens.csv'), `${token},native-test,native-test,"system:masters"\n`, { mode: 0o600 });
  launch('etcd', ['--name=native-test', `--data-dir=${temp}/etcd`, `--listen-client-urls=http://127.0.0.1:${clientPort}`, `--advertise-client-urls=http://127.0.0.1:${clientPort}`, `--listen-peer-urls=http://127.0.0.1:${peerPort}`, `--initial-advertise-peer-urls=http://127.0.0.1:${peerPort}`, `--initial-cluster=native-test=http://127.0.0.1:${peerPort}`]);
  launch('kube-apiserver', ['--bind-address=127.0.0.1', '--advertise-address=127.0.0.1', `--secure-port=${apiPort}`, `--etcd-servers=http://127.0.0.1:${clientPort}`, '--service-cluster-ip-range=10.0.0.0/24', `--tls-cert-file=${temp}/cert.pem`, `--tls-private-key-file=${temp}/key.pem`, `--service-account-key-file=${temp}/key.pem`, `--service-account-signing-key-file=${temp}/key.pem`, '--service-account-issuer=https://127.0.0.1', '--authorization-mode=AlwaysAllow', '--anonymous-auth=false', `--token-auth-file=${temp}/tokens.csv`]);
  const ca = fs.readFileSync(path.join(temp, 'cert.pem'));
  async function request(method, pathname, body) {
    return await new Promise((resolve, reject) => {
      const req = https.request({ hostname: '127.0.0.1', port: apiPort, path: pathname, method, ca, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, timeout: 5000 }, response => {
        let data = ''; response.setEncoding('utf8'); response.on('data', chunk => { data += chunk; }); response.on('end', () => resolve({ status: response.statusCode, body: data }));
      });
      req.on('error', reject); req.on('timeout', () => req.destroy(new Error('API request timeout')));
      req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  let ready;
  for (let attempt = 0; attempt < 120; attempt++) {
    assert(children.every(child => child.exitCode === null && child.signalCode === null), 'native server exited before readiness; see raw logs');
    try { ready = await request('GET', '/readyz'); if (ready.status === 200) break; } catch {}
    await sleep(250);
  }
  record('readiness.json', ready ?? { error: 'never ready' });
  assert.equal(ready?.status, 200);
  const chart = path.resolve(process.env.NATIVE_CHART ?? path.join(root, 'charts/kubeclaw'));
  const yaml = run(process.env.HELM ?? 'helm', ['template', 'native-product', chart, '-f', path.resolve(chart, '../../my-values/buster-values.yaml'), '--show-only', 'templates/buster-namespace-lease-crd.yaml', '--set', 'agentRole=buster', '--set', 'busterNamespaceBroker.enabled=true', '--set', 'runtimeInfrastructure.registry.endpoint=http://registry.render-test:5000', '--set', 'runtimeInfrastructure.registry.transport=http-lab']);
  record('original-rendered-crd.yaml', yaml);
  record('source.json', { chart, crdTemplateSha256: createHash('sha256').update(fs.readFileSync(path.join(chart, 'templates/buster-namespace-lease-crd.yaml'))).digest('hex'), apiVersion: versions[0].trim() });
  // kubectl converts the exact Helm YAML locally. Its private configuration has no remote context.
  const config = path.join(temp, 'kubeconfig.json');
  fs.writeFileSync(config, JSON.stringify({ apiVersion: 'v1', kind: 'Config', clusters: [{ name: 'native', cluster: { server: `https://127.0.0.1:${apiPort}`, 'certificate-authority': path.join(temp, 'cert.pem') } }], users: [{ name: 'native', user: { token } }], contexts: [{ name: 'native', context: { cluster: 'native', user: 'native' } }], 'current-context': 'native' }), { mode: 0o600 });
  const kubectl = path.join(assets, 'kubectl');
  const crd = JSON.parse(run(kubectl, ['--kubeconfig', config, 'create', '--dry-run=client', '--validate=false', '-f', '-', '-o', 'json'], { input: yaml }));
  const installed = await request('POST', '/apis/apiextensions.k8s.io/v1/customresourcedefinitions', crd);
  record('crd-install.json', installed);
  assert.equal(installed.status, 201, `ORIGINAL CRD admission failed: ${installed.body}`);
  record('established.txt', run(kubectl, ['--kubeconfig', config, 'wait', '--for=condition=Established', '--timeout=30s', `crd/${crd.metadata.name}`]));
  console.log('Original CRD accepted and established by native Kubernetes v1.35.0; status/transition matrix remains next action.');
} finally {
  clearTimeout(deadline);
  await cleanup();
}
