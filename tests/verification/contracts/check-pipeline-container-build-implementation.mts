import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { TestPlanRunner } from '@kubeclaw/buster-engine';
import { ContainerBuildCapabilityInvoker } from '../../../skills/buster/engine/test-gates/container-build-runtime.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'container-build-implementation-'));
const workspace = path.join(temporary, 'workspace');
const repository = path.join(workspace, 'repository-source');
const manifest = Buffer.from('{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json","config":{"mediaType":"application/vnd.oci.image.config.v1+json","digest":"sha256:' + 'c'.repeat(64) + '","size":2},"layers":[]}');
const digest = `sha256:${crypto.createHash('sha256').update(manifest).digest('hex')}`;
const server = http.createServer((request, response) => {
  if (!request.url?.endsWith(`/manifests/${digest}`)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': 'application/vnd.oci.image.manifest.v1+json',
    'content-length': manifest.byteLength, 'docker-content-digest': digest }); response.end(manifest);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const address = server.address(); if (!address || typeof address === 'string') throw new Error('registry address missing');

try {
  fs.mkdirSync(repository, { recursive: true }); fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(repository, 'Dockerfile'), 'FROM scratch\nLABEL proof="container-build"\n');
  fs.writeFileSync(path.join(repository, 'payload.txt'), 'committed input\n');
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'build-proof@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Build Proof']);
  execFileSync('git', ['-C', repository, 'add', '.']); execFileSync('git', ['-C', repository, 'commit', '-qm', 'build fixture']);
  const pluginRoot = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'container-build-proof' } }));
  const entry = registry.testProviderContracts.get('kubeclaw.container-build@1'); assert.ok(entry);
  assert.deepEqual(entry.registration.capabilities, ['container.build']);
  assert.equal(entry.registration.outputs[0]?.name, 'image');
  const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/container-build.v1.json', 'utf8'));
  const declaration: any = { suites: { build: { uses: 'kubeclaw.container-build-suite@1', add: { image: {
    uses: 'kubeclaw.container-build@1', mode: 'blocking', concurrencyGroup: 'container-build', retries: 0,
    config: { buildContext: '.', definition: { type: 'dockerfile', dockerfile: 'Dockerfile' }, outputName: 'proof', platform: 'linux/amd64' },
  } } } }, concurrencyLimits: { 'container-build': 1 } };
  const limits = { cpuMillis: 60_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 4 * 1024 * 1024,
    artifactBytes: 1024 * 1024, artifactFiles: 8, processes: 32 };
  const plan = resolveTestPlan({ planId: 'plan:container-build', runId: 'run:container-build', project: 'proof',
    scope: { moduleId: 'app', gateId: null }, createdAt: '2026-08-15T23:00:00.000Z', declaration, suiteTemplates: [suite], registry,
    facts: { changedPaths: ['Dockerfile'], moduleType: 'service', pipelineStage: 'test' }, policy: {
      defaultTimeoutMs: 60_000, maximumTimeoutMs: 120_000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: { 'container-build': 1 } } });
  let buildCalls = 0;
  const capability = new ContainerBuildCapabilityInvoker({ workspaceRoot: workspace, buildctlExecutable: '/usr/local/bin/buildctl',
    buildkitHost: 'unix:///tmp/unavailable-buildkitd.sock', registryBaseUrl: `http://127.0.0.1:${address.port}`,
    registryReference: `127.0.0.1:${address.port}`, repositoryPrefix: 'pipeline', allowedPlatforms: ['linux/amd64'],
    maximumLogBytes: 4 * 1024 * 1024, maximumExecutionMs: 120_000, maximumManifestBytes: 1024 * 1024,
    async execute(command, args) {
      buildCalls += 1;
      assert.match(execFileSync(command, ['--version'], { encoding: 'utf8' }), /buildctl/u);
      assert.equal(args.includes('build'), true); assert.equal(args.some((arg) => arg.includes('push=true')), true);
      assert.equal(args.includes('platform=linux/amd64'), true);
      const metadata = args[args.indexOf('--metadata-file') + 1]; assert.equal(typeof metadata, 'string');
      fs.writeFileSync(metadata!, JSON.stringify({ 'containerimage.digest': digest }));
      return { stdout: 'BuildKit contract emulator completed.\n', stderr: '' };
    } });
  const runner = new TestPlanRunner({ plan, registry, workspaceRoot: workspace, repositoryRoot: repository,
    artifactRoot: path.join(temporary, 'artifacts'), observabilityRoot: path.join(temporary, 'observability'), maximumConcurrency: 1,
    grants: new Map([[plan.nodes[0]!.id, ['container.build']]]), capabilityInvoker: capability });
  const result = await runner.run();
  assert.equal(result.nodes[0]?.outcome, 'passed', JSON.stringify(result)); assert.equal(buildCalls, 1);
  assert.equal(result.attempts[0]?.outputs[0]?.name, 'image');
  assert.equal((result.attempts[0]?.outputs[0] as any).value.digest, digest);
  assert.match((result.attempts[0]?.outputs[0] as any).value.reference, new RegExp(`@${digest}$`, 'u'));
} finally {
  server.close(); await once(server, 'close'); fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, phase: 'container-build-implementation', realBuildctlBinary: true,
  buildkitDaemon: 'contained-contract-emulator', registryDigestVerified: true }));
