import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import yaml from 'js-yaml';

// Required native gate, never a skip or substituted TLS server.
const executable = process.env.KUBECLAW_TEST_ENVOY;
assert.ok(executable && path.isAbsolute(executable), 'NATIVE_ENVOY_REQUIRED: set KUBECLAW_TEST_ENVOY to the original pinned Envoy 1.39.0 executable');
fs.accessSync(executable, fs.constants.X_OK);
assert.match(execFileSync(executable, ['--version'], { encoding: 'utf8' }), /\/1\.39\.0\//u);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-trust-envoy-'));
let child;
let closure;
let output = '';
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
function render(chart, args = []) {
  return yaml.loadAll(execFileSync('helm', ['template', 'review', `charts/${chart}`, '--namespace', 'alternative', '--set', 'workerTrust.spiffe.enabled=true', ...args], { encoding: 'utf8' }));
}
function validate(config, name) {
  const file = path.join(root, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(config));
  const validated = run(executable, ['--mode', 'validate', '-c', file]);
  process.stdout.write(JSON.stringify({nativeValidation: name, exit: 0, output: validated.toString()}) + '\n');
}
function certificate(name, uri) {
  run('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${name}`]);
  fs.writeFileSync(path.join(root, `${name}.ext`), `subjectAltName=URI:${uri}\nextendedKeyUsage=clientAuth,serverAuth\n`);
  if (name !== 'expired') run('openssl', ['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.crt`, '-days', '1', '-extfile', `${name}.ext`]);
  else {
    fs.mkdirSync(path.join(root, 'issued'));
    fs.writeFileSync(path.join(root, 'index.db'), ''); fs.writeFileSync(path.join(root, 'serial'), '1000\n');
    fs.writeFileSync(path.join(root, 'ca.cnf'), '[ca]\ndefault_ca=local\n[local]\ndatabase=index.db\nserial=serial\nnew_certs_dir=issued\ncertificate=ca.crt\nprivate_key=ca.key\ndefault_md=sha256\npolicy=subject\n[subject]\ncommonName=supplied\n');
    const date = daysAgo => new Date(Date.now() - daysAgo * 86400000).toISOString().replace(/[-:T]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
    run('openssl', ['ca', '-batch', '-config', 'ca.cnf', '-in', `${name}.csr`, '-out', `${name}.crt`, '-startdate', date(2), '-enddate', date(1), '-extfile', `${name}.ext`, '-notext']);
  }
}
function publishCertificate(name) {
  const secret = { '@type': 'type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.Secret', name: 'default', tls_certificate: { certificate_chain: { filename: path.join(root, `${name}.crt`) }, private_key: { filename: path.join(root, `${name}.key`) } } };
  fs.writeFileSync(path.join(root, 'certificate.next'), JSON.stringify({ version_info: name, resources: [secret] }));
  fs.renameSync(path.join(root, 'certificate.next'), path.join(root, 'certificate.json'));
}
async function installedCertificate(name, identity) {
  const expected = run('openssl', ['x509', '-in', `${name}.crt`, '-noout', '-serial']).toString().trim().split('=')[1].toLowerCase().replace(/^0+/u, '');
  const deadline = Date.now() + 10000;
  let certificates, leaves;
  do {
    certificates = await (await fetch('http://127.0.0.1:9901/certs', {signal: AbortSignal.timeout(1500)})).json();
    leaves = certificates.certificates.flatMap(item => item.cert_chain ?? []);
    if (leaves.length === 2 && leaves.every(item => item.serial_number.replace(/^0+/u, '') === expected)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.equal(leaves.length, 2);
  for (const leaf of leaves) {
    assert.equal(leaf.serial_number.replace(/^0+/u, ''), expected);
    assert.deepEqual(leaf.subject_alt_names, [{uri: name === 'wrong' ? identity + '-foreign' : identity}]);
    assert(Date.parse(leaf.valid_from) < Date.parse(leaf.expiration_time), 'installed certificate must have a correctly ordered validity interval');
    assert.equal(Date.parse(leaf.expiration_time) < Date.now(), name === 'expired');
  }
  process.stdout.write(JSON.stringify({nativeInstalledCertificates: name, certificates}) + '\n');
}
async function status(pathname, expected) {
  const deadline = Date.now() + 10000;
  let actual;
  do {
    try { actual = (await fetch(`http://127.0.0.1:19000${pathname}`, { signal: AbortSignal.timeout(1500) })).status; }
    catch { actual = 0; }
    if (actual === expected) {assert.equal(child.signalCode, null); process.stdout.write(JSON.stringify({nativeProbe: pathname, status: actual, processAlive: child.exitCode === null}) + '\n'); return;}
    assert.equal(child.exitCode, null, output);
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.equal(actual, expected, `${pathname}: native Envoy result; ${output}`);
}
try {
  let nova;
  for (const role of ['nova', 'buster', 'prism']) {
    const args = ['--set', `agentRole=${role}`, '--set', 'serviceAccount.create=true'];
    if (role === 'buster') args.push('-f', 'my-values/buster-values.yaml', '--set', 'runtimeInfrastructure.registry.endpoint=https://registry.example.test', '--set', 'runtimeInfrastructure.registry.transport=https', '--set', 'runtimeInfrastructure.registry.authSecretName=registry-test');
    const config = yaml.load(render('kubeclaw', args).find(doc => doc?.data?.['envoy.yaml']).data['envoy.yaml']);
    validate(config, role);
    if (role === 'nova') nova = config;
  }
  const prism = render('prism', ['-f', 'charts/prism/ci-values.yaml']).find(doc => doc?.data?.['control.yaml']);
  for (const [name, config] of Object.entries(prism.data)) validate(yaml.load(config), name);
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '1', '-subj', '/CN=Readiness-Test-CA']);
  const identity = 'spiffe://kubeclaw.internal/ns/alternative/sa/agent-nova';
  certificate('valid', identity); certificate('wrong', identity + '-foreign'); certificate('expired', identity);
  publishCertificate('valid');
  fs.writeFileSync(path.join(root, 'bundle.json'), JSON.stringify({ resources: [{ '@type': 'type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.Secret', name: 'spiffe://kubeclaw.internal', validation_context: { trusted_ca: { filename: path.join(root, 'ca.crt') } } }] }));
  // Exercise the exact rendered self-check, using Envoy's original filesystem
  // SDS transport locally. This does not stand in for SPIRE's gRPC transport.
  nova.static_resources.listeners = nova.static_resources.listeners.filter(item => ['kubelet-health', 'worker-trust-self-check'].includes(item.name));
  nova.static_resources.clusters = nova.static_resources.clusters.filter(item => item.name === 'worker-trust-self-check');
  // Test-only loopback transport binding; original rendered configs above are
  // validated unchanged. Never expose the disposable test probe externally.
  nova.static_resources.listeners.find(item => item.name === 'kubelet-health').address.socket_address.address = '127.0.0.1';
  function localSds(value) {
    if (!value || typeof value !== 'object') return;
    if (value.sds_config) value.sds_config = { resource_api_version: 'V3', path: path.join(root, value.name === 'default' ? 'certificate.json' : 'bundle.json') };
    for (const item of Object.values(value)) localSds(item);
  }
  localSds(nova);
  fs.writeFileSync(path.join(root, 'native.json'), JSON.stringify(nova));
  child = spawn(executable, ['-c', path.join(root, 'native.json'), '--concurrency', '1', '--disable-hot-restart'], { stdio: ['ignore', 'pipe', 'pipe'] });
  closure = once(child, 'close');
  child.stdout.on('data', bytes => { process.stderr.write(bytes); output = (output + bytes.toString()).slice(-65536); });
  child.stderr.on('data', bytes => { process.stderr.write(bytes); output = (output + bytes.toString()).slice(-65536); });
  for (const name of ['valid', 'wrong', 'valid', 'expired', 'valid']) {
    process.stdout.write(JSON.stringify({publishFilesystemSds: name}) + '\n');
    publishCertificate(name);
    await status('/ready', name === 'valid' ? 200 : 503);
    await status('/health', 200); await status('/bootstrap', 200);
    await installedCertificate(name, identity);
    await status('/ready', name === 'valid' ? 200 : 503);
  }
  await status('/admin', 404);
  const stats = await (await fetch('http://127.0.0.1:9901/stats', { signal: AbortSignal.timeout(1500) })).text();
  assert.match(stats, /cluster\.worker-trust-self-check\.ssl\.session_reused: 0/u);
  assert.match(output, /worker\.trust\.readiness\.failure/u);
  process.stdout.write(JSON.stringify({ ok: true, nativeEnvoy: '1.39.0', fullConfigurationsValidated: 6, filesystemSds: ['valid', 'wrong-identity', 'expired', 'recovered'], spireGrpc: 'not-tested', operatorDelivery: 'not-tested' }) + '\n');
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL');
  if (closure) await closure;
  fs.rmSync(root, { recursive: true, force: true });
}
