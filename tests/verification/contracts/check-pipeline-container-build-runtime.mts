import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { ContainerBuildCapabilityInvoker } from '../../../skills/buster/engine/test-gates/container-build-runtime.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'container-build-runtime-'));
const repository = path.join(root, 'repository');
fs.mkdirSync(repository); fs.writeFileSync(path.join(repository, 'Dockerfile'), 'FROM scratch\n');
const manifest = Buffer.from('{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json","config":{"mediaType":"application/vnd.oci.image.config.v1+json","digest":"sha256:' + 'b'.repeat(64) + '","size":2},"layers":[]}');
const digest = `sha256:${crypto.createHash('sha256').update(manifest).digest('hex')}`;
let authorization = '';
const server = http.createServer((request, response) => {
  authorization = String(request.headers.authorization ?? '');
  if (!request.url?.endsWith(`/manifests/${digest}`)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': 'application/vnd.oci.image.manifest.v1+json',
    'content-length': manifest.byteLength, 'docker-content-digest': digest }); response.end(manifest);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const address = server.address(); if (!address || typeof address === 'string') throw new Error('server address missing');
let executeCount = 0;
assert.throws(() => new ContainerBuildCapabilityInvoker({ workspaceRoot: root, buildctlExecutable: process.execPath,
  buildkitHost: 'unix:///tmp/buildkit.sock', registryBaseUrl: `http://127.0.0.1:${address.port}`,
  registryReference: 'registry.invalid:5000', repositoryPrefix: 'kubeclaw/tests', allowedPlatforms: ['linux/amd64'],
  maximumLogBytes: 1024, maximumExecutionMs: 1000, maximumManifestBytes: 1024 }),
  /CONTAINER_BUILD_REGISTRY_ENDPOINT_MISMATCH/u);
assert.throws(() => new ContainerBuildCapabilityInvoker({ workspaceRoot: root, buildctlExecutable: process.execPath,
  buildkitHost: 'unix:///tmp/buildkit.sock', registryBaseUrl: 'http://registry.example.test',
  registryReference: 'registry.example.test', repositoryPrefix: 'kubeclaw/tests', allowedPlatforms: ['linux/amd64'],
  maximumLogBytes: 1024, maximumExecutionMs: 1000, maximumManifestBytes: 1024,
  registryUsername: 'builder', registryPassword: 'secret' }), /CONTAINER_BUILD_REGISTRY_CREDENTIALS_REQUIRE_TLS/u);
const runtime = new ContainerBuildCapabilityInvoker({ workspaceRoot: root, buildctlExecutable: process.execPath,
  buildkitHost: 'unix:///tmp/buildkit.sock', registryBaseUrl: `http://127.0.0.1:${address.port}`,
  registryReference: `127.0.0.1:${address.port}`, repositoryPrefix: 'kubeclaw/tests', allowedPlatforms: ['linux/amd64'],
  allowedBuildArguments: ['PUBLIC_VERSION'],
  maximumLogBytes: 1024 * 1024, maximumExecutionMs: 10_000, maximumManifestBytes: 1024 * 1024,
  registryUsername: 'builder', registryPassword: 'secret',
  async execute(_command, args, options) { executeCount += 1; const index = args.indexOf('--metadata-file');
    const dockerConfig = String((options.env as any).DOCKER_CONFIG); assert.ok(dockerConfig);
    const auth = JSON.parse(fs.readFileSync(path.join(dockerConfig, 'config.json'), 'utf8')).auths[`127.0.0.1:${address.port}`].auth;
    assert.equal(auth, Buffer.from('builder:secret').toString('base64'));
    fs.writeFileSync(String(args[index + 1]), JSON.stringify({ 'containerimage.digest': digest }));
    return { stdout: 'real buildctl contract invoked\n', stderr: '' }; } });
const request: any = { operation: 'build_push_verify', resource: { type: 'container.build-definition', canonicalId: 'build:app:attempt:abc' },
  payload: { repositoryRoot: repository, scratchRoot: repository, buildContext: repository,
    dockerfile: path.join(repository, 'Dockerfile'), definitionIdentity: 'dockerfile:Dockerfile',
    outputName: 'app', platform: 'linux/amd64', buildArgs: {}, limits: { maximumLogBytes: 4096, maximumExecutionMs: 5000 } } };
try {
  const result = await runtime.invoke('container.build', request, new AbortController().signal);
  assert.equal(result.ok, true); assert.equal(result.digest, digest); assert.match(String(result.immutableImage), new RegExp(`@${digest}$`, 'u'));
  assert.equal(executeCount, 1); assert.equal(authorization, `Basic ${Buffer.from('builder:secret').toString('base64')}`);
  const publicArgument = await runtime.invoke('container.build', { ...request, payload: { ...request.payload,
    buildArgs: { PUBLIC_VERSION: '1.2.3' } } }, new AbortController().signal);
  assert.equal(publicArgument.ok, true); assert.equal(executeCount, 2);
  await assert.rejects(() => runtime.invoke('container.build', { ...request, payload: { ...request.payload,
    buildArgs: { DOCKER_AUTH_CONFIG: 'not-allowed' } } }, new AbortController().signal), /CONTAINER_BUILD_ARGUMENT_DENIED/u);
  await assert.rejects(() => runtime.invoke('container.build', { ...request, payload: { ...request.payload, platform: 'linux/arm64' } },
    new AbortController().signal), /CONTAINER_BUILD_PLATFORM_DENIED/u);
  await assert.rejects(() => runtime.invoke('container.build', { ...request, payload: { ...request.payload, buildContext: os.tmpdir() } },
    new AbortController().signal), /CONTAINER_BUILD_PATH_DENIED/u);
  const failed = new ContainerBuildCapabilityInvoker({ workspaceRoot: root, buildctlExecutable: process.execPath,
    buildkitHost: 'unix:///tmp/buildkit.sock', registryBaseUrl: `http://127.0.0.1:${address.port}`,
    registryReference: `127.0.0.1:${address.port}`, repositoryPrefix: 'kubeclaw/tests', allowedPlatforms: ['linux/amd64'],
    maximumLogBytes: 1024, maximumExecutionMs: 1000, maximumManifestBytes: 1024,
    async execute() { const error: any = new Error('buildctl failed'); error.stderr = 'expected failure'; throw error; } });
  const failure = await failed.invoke('container.build', request, new AbortController().signal);
  assert.equal(failure.ok, false); assert.equal(failure.stderr, 'expected failure');
  const oversized = new ContainerBuildCapabilityInvoker({ workspaceRoot: root, buildctlExecutable: process.execPath,
    buildkitHost: 'unix:///tmp/buildkit.sock', registryBaseUrl: `http://127.0.0.1:${address.port}`,
    registryReference: `127.0.0.1:${address.port}`, repositoryPrefix: 'kubeclaw/tests', allowedPlatforms: ['linux/amd64'],
    maximumLogBytes: 1024, maximumExecutionMs: 1000, maximumManifestBytes: 8,
    async execute(_command, args) { fs.writeFileSync(String(args[args.indexOf('--metadata-file') + 1]),
      JSON.stringify({ 'containerimage.digest': digest })); return {}; },
    async fetch() { return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); controller.close();
    } }), { status: 200 }); } });
  const oversizedResult = await oversized.invoke('container.build', request, new AbortController().signal);
  assert.equal(oversizedResult.ok, false);
  assert.equal(oversizedResult.errorCode, 'CONTAINER_BUILD_REGISTRY_MANIFEST_TOO_LARGE');
  assert.match(String(oversizedResult.message), /CONTAINER_BUILD_REGISTRY_MANIFEST_TOO_LARGE/u);
} finally { server.close(); await once(server, 'close'); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, runtime: 'container-build', registryDigestVerified: true }));
