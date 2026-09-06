import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NetworkHttpCapabilityInvoker, SecurityScanCapabilityInvoker } from '@kubeclaw/buster-engine';
import { safePart } from '../src/common.js';
import { provider as headersProvider } from '../src/headers.js';
import { provider as dependencyProvider } from '../src/dependency.js';
import { testContract as dependencyContract } from '../src/dependency.js';
import { provider as imageProvider } from '../src/image.js';
import { testContract as imageContract } from '../src/image.js';
import { provider as policyProvider } from '../src/kubernetes-policy.js';
import { testContract as policyContract } from '../src/kubernetes-policy.js';

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'));
const cacheCandidates = [
  ...(process.env.KUBECLAW_SECURITY_TEST_CACHE ? [process.env.KUBECLAW_SECURITY_TEST_CACHE] : []),
  path.join(os.homedir(), '.cache/trivy'),
  path.join(os.homedir(), '.cache/.cache/trivy'),
  '/tmp/.cache/trivy',
];
const cachePath = cacheCandidates.find((candidate) => fs.existsSync(candidate));
if (!cachePath) throw new Error('SECURITY_TEST_TRIVY_DATABASE_MISSING');
const cache = fs.realpathSync(cachePath);
const trivy = fs.realpathSync(process.env.KUBECLAW_SECURITY_TEST_TRIVY ?? '/usr/local/bin/trivy');
const scan = new SecurityScanCapabilityInvoker({ workspaceRoot: root, trivyExecutable: trivy,
  allowedRegistryPrefixes: ['docker.io/library'], maximumExecutionMs: 300_000,
  maximumOutputBytes: 64 * 1024 * 1024, cacheDirectory: cache });

function invocation(provider: string, values: Record<string, unknown>, inputs: unknown[] = []) {
  return { schemaVersion: 'provider-invocation.v1', planId: 'plan:security', runId: 'run:security', moduleId: 'app', gateId: null,
    suiteInstanceId: 'security', nodeId: provider, executionId: `plan:security:${provider}`, testIdentity: `test:security:${provider}`,
    nodeKind: 'test', attemptId: `attempt:${provider}`, attemptNumber: 1, provider: {}, configuration: { values }, inputs,
    evidence: {}, grantedCapabilities: ['security.scan', 'network.http'], timeoutMs: 300_000,
    limits: { cpuMillis: 300_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 1024 * 1024,
      artifactBytes: 1024 * 1024, artifactFiles: 8, processes: 8 },
    workspace: { repository: '.', scratch: '.swarm/security-scratch', evidence: '.swarm/security-evidence' } } as any;
}

const strict = { profile: 'strict-v1' };
fs.mkdirSync(path.join(root, '.swarm'), { recursive: true });
const fixtures = fs.mkdtempSync(path.join(root, '.swarm/security-live-'));
const server = http.createServer((request, response) => {
  if (request.url === '/missing-headers') { response.end(); return; }
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('content-security-policy', "default-src 'none'");
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('permissions-policy', 'geolocation=()');
  response.end();
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('SECURITY_TEST_SERVER_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const network = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
  allowedPorts: [address.port], allowedMethods: ['GET'], allowedRequestHeaders: [],
  maximumRequestBytes: 1, maximumResponseBytes: 65_536, maximumExecutionMs: 10_000 });

const context = { signal: new AbortController().signal, workspaceRoot: root, log() {},
  invoke: (name: string, request: unknown) => name === 'security.scan'
    ? scan.invoke(name, request, new AbortController().signal)
    : network.invoke(name, request, new AbortController().signal) } as any;

try {
  const sharedPrefix = 'x'.repeat(160);
  assert.equal(safePart(`${sharedPrefix}a`).length, 120);
  assert.notEqual(safePart(`${sharedPrefix}a`), safePart(`${sharedPrefix}b`));
  const deployment = { name: 'deployment', kind: 'value', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1',
    value: { schemaVersion: 'kubernetes-deployment-fixture.v1', expiresAt: new Date(Date.now() + 900_000).toISOString(), endpoints: [{ name: 'app', url: origin }] } };
  const headers = await headersProvider().execute(invocation('headers', { profile: 'api-http-v1', paths: ['/'], policy: strict }, [deployment]), context);
  assert.equal(headers.outcome, 'passed');
  assert.equal(headers.providerDetails.values.resolvedRules.length, 4);
  const missingHeaders = await headersProvider().execute(invocation('missing-headers', { profile: 'api-http-v1', paths: ['/missing-headers'], policy: strict }, [deployment]), context);
  assert.equal(missingHeaders.outcome, 'failed');
  assert.ok(missingHeaders.findings.length > 0);
  await assert.rejects(() => headersProvider().execute(invocation('headers', {
    profile: 'api-http-v1', paths: ['/\\attacker.example/'], policy: strict,
  }, [deployment]), context), /SECURITY_HEADERS_PATHS_INVALID/u);
  assert.equal(dependencyContract.findings([{ id: 'CVE-' + 'x'.repeat(200), package: 'p'.repeat(200),
    sourceFile: 's'.repeat(200), installedVersion: '1', fixedVersion: '2', severity: 'high' }])[0].id.length, 256);
  assert.equal(policyContract.findings([{ id: 'KSV-' + 'x'.repeat(200), sourceFile: 's'.repeat(200),
    line: 123456789, severity: 'high', message: 'unsafe' }])[0].id.length, 256);
  const imageIdentities = imageContract.findings([
    { id: 'CVE-1', package: 'openssl', sourceFile: 'os-packages', installedVersion: '1', severity: 'high' },
    { id: 'CVE-1', package: 'openssl', sourceFile: 'application-packages', installedVersion: '1', severity: 'high' },
  ]).map((item) => item.id);
  assert.equal(new Set(imageIdentities).size, 2);

  const healthy = path.join(fixtures, 'healthy'); const vulnerable = path.join(fixtures, 'vulnerable');
  for (const directory of [healthy, vulnerable]) {
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'scanner-proof', version: '1.0.0', private: true }));
  }
  // Real npm lockfiles; no scanner output or advisory database is fabricated.
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: healthy, timeout: 60000, stdio: 'pipe' });
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', 'lodash@4.17.20'], { cwd: vulnerable, timeout: 60000, stdio: 'pipe' });
  const cleanDependency = await dependencyProvider().execute(invocation('dependency-clean', { projectDirectory: path.relative(root, healthy), policy: strict }), context);
  assert.equal(cleanDependency.outcome, 'passed');
  const dependency = await dependencyProvider().execute(invocation('dependency-vulnerable', { projectDirectory: path.relative(root, vulnerable), policy: strict }), context);
  assert.equal(dependency.outcome, 'failed');
  // https://github.com/advisories/GHSA-35jh-r3h4-6jhm
  const knownVulnerability = dependency.findings.find((item: any) => item.rule === 'CVE-2021-23337');
  assert.ok(knownVulnerability, 'Trivy must detect the known vulnerable dependency');
  assert.ok(dependency.providerDetails.values.normalizedFindings.some((item: any) => item.id === knownVulnerability.id
    && item.package === 'lodash' && item.installedVersion === '4.17.20'));
  assert.equal(dependency.providerDetails.values.scanner, 'dependency-trivy');
  assert.match(dependency.providerDetails.values.resultDigest, /^sha256:[a-f0-9]{64}$/u);
  for (const finding of dependency.providerDetails.values.normalizedFindings) {
    for (const field of ['package', 'installedVersion', 'fixedVersion', 'sourceFile', 'reachability']) {
      assert.ok(Object.hasOwn(finding, field), `dependency finding must contain ${field}`);
    }
  }

  const alpineDigest = 'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc';
  const imageInput = { name: 'image', kind: 'value', schemaId: 'kubeclaw.container-image@1', value: {
    schemaVersion: 'container-image.v1', reference: `docker.io/library/alpine@${alpineDigest}`, digest: alpineDigest } };
  const image = await imageProvider().execute(invocation('image', { policy: strict }, [imageInput]), context);
  assert.match(image.outcome, /^(?:passed|failed)$/u);
  assert.equal(image.providerDetails.values.imageDigest, alpineDigest);
  assert.ok(Array.isArray(image.providerDetails.values.normalizedFindings));

  const manifestFile = fs.realpathSync(path.join(root, 'tests/verification/e2e/fixtures/nginx-project/k8s/deployment.yaml'));
  const manifestBytes = fs.readFileSync(manifestFile);
  const manifestDigest = `sha256:${crypto.createHash('sha256').update(manifestBytes).digest('hex')}`;
  const manifest = { name: 'checked-manifest', kind: 'artifact', artifact: {
    mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml', contentDigest: manifestDigest,
    storageUrl: new URL(`file://${manifestFile}`).href, sizeBytes: manifestBytes.byteLength } };
  const policyResult = await policyProvider().execute(invocation('kubernetes-policy', { policy: strict }, [manifest]), context);
  assert.equal(policyResult.outcome, 'failed');
  assert.ok(policyResult.findings.some((item: any) => item.rule === 'KSV-0001'));

} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(fixtures, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, providers: 4, realHttp: true, realTrivy: true,
  realAdvisoryDatabase: true, realImage: true, runtimeClusterAcceptance: 'pending', mocks: 0, emulators: 0 }));
